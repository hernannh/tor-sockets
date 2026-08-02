import {
  computeCorrelationRisk,
  computeDecentralization,
  computeDimension,
  computeExitPortDiversity,
  computeFamilyComponents,
  computeHoster,
  detectHiddenFamilies,
} from '@tor-sockets/analysis';
import type {
  ActorDocument,
  AlertEventFeedItem,
  AlertEventFeedResponse,
  AnomalyFeedItem,
  AnomalyFeedResponse,
  BandwidthResponse,
  ConcentrationResponse,
  CorrelationDimension,
  CorrelationResponse,
  ExitsResponse,
  FamiliesResponse,
  FamilyDetail,
  HhiRole,
  HhiTrendResponse,
  HiddenFamiliesResponse,
  Ipv6Response,
  NetworkHistoryResponse,
  OverloadResponse,
  RelayDetail,
  RelaysResponse,
  StatsResponse,
  VersionsResponse,
} from '@tor-sockets/api-contract';
import type { RelaysQuery } from '@tor-sockets/api-contract';
import {
  type Database,
  alertEvents,
  alertRules,
  anomalies,
  concentrationSnapshots,
  federationPeers,
  ingestStatus,
  operatorClaims,
  operators,
  relayHistory,
  relays,
} from '@tor-sockets/db';
import { fetchActorDocument } from '@tor-sockets/federation';
import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  max,
  or,
  sql,
} from 'drizzle-orm';

const NULLABLE_DATE_TO_ISO = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

/** Whitelist of sortable columns (API field → drizzle column). */
const SORT_COLUMNS = {
  consensus_weight: relays.consensusWeight,
  guard_probability: relays.guardProbability,
  exit_probability: relays.exitProbability,
  country: relays.country,
  nickname: relays.nickname,
} as const;

/**
 * List relays with filters and pagination. Returns relay summaries + total
 * count (independent of limit/offset, for pagination UI).
 */
export async function getRelays(db: Database, q: RelaysQuery): Promise<RelaysResponse> {
  const conditions = [
    q.running !== undefined ? eq(relays.running, q.running) : undefined,
    q.country ? eq(relays.country, q.country.toLowerCase()) : undefined,
    q.asNumber ? eq(relays.asNumber, q.asNumber) : undefined,
    q.flag ? arrayContains(relays.flags, [q.flag]) : undefined,
    q.search
      ? or(
          ilike(relays.nickname, `%${q.search}%`),
          ilike(relays.fingerprint, `%${q.search.toUpperCase()}%`),
        )
      : undefined,
  ].filter((c) => c !== undefined);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortCol = SORT_COLUMNS[q.sort] ?? relays.consensusWeight;
  // NULLS LAST on both directions: unmeasured (NULL) probabilities/weights
  // shouldn't crowd the top of a DESC sort. q.order is enum-validated, safe to inline.
  const orderExpr = sql`${sortCol} ${sql.raw(q.order === 'asc' ? 'asc' : 'desc')} nulls last`;

  const [[totalRow], rows] = await Promise.all([
    db.select({ total: count() }).from(relays).where(where),
    db.select().from(relays).where(where).orderBy(orderExpr).limit(q.limit).offset(q.offset),
  ]);

  return {
    relays: rows.map(toSummary),
    total: totalRow?.total ?? 0,
    limit: q.limit,
    offset: q.offset,
  };
}

/**
 * Full detail for a single relay by fingerprint (40-char hex, uppercase).
 */
export async function getRelayByFingerprint(
  db: Database,
  fingerprint: string,
): Promise<RelayDetail | null> {
  const [row] = await db
    .select()
    .from(relays)
    .where(eq(relays.fingerprint, fingerprint.toUpperCase()))
    .limit(1);
  return row ? toDetail(row) : null;
}

/**
 * Latest concentration snapshot for a dimension: HHI + top-N keys by consensus
 * weight. Reads the most recent `time` for the dimension and materializes a
 * response with computed totals.
 */
export async function getConcentration(
  db: Database,
  dimension: 'country' | 'as' | 'hoster' | 'family',
  limit: number,
): Promise<ConcentrationResponse | null> {
  const [latest] = await db
    .select({ time: max(concentrationSnapshots.time) })
    .from(concentrationSnapshots)
    .where(eq(concentrationSnapshots.dimension, dimension));
  if (!latest?.time) return null;

  // top-N rows (display) and allKeys (per-role HHI) read the same snapshot and
  // are independent: run them in parallel instead of two sequential round-trips.
  // allKeys needs ALL keys (not just the top-N) because per-role HHI and
  // decentralization (CRn / Nakamoto) cover the whole snapshot. HHI = Σ(share%)²;
  // the per-key {guard,middle,exit}_weight_pct are already percentages, consensus
  // is derived from consensus_weight_sum.
  const [rows, allKeys] = await Promise.all([
    db
      .select()
      .from(concentrationSnapshots)
      .where(
        and(
          eq(concentrationSnapshots.dimension, dimension),
          eq(concentrationSnapshots.time, latest.time),
        ),
      )
      .orderBy(desc(concentrationSnapshots.consensusWeightSum))
      .limit(limit),
    db
      .select({
        consensusWeightSum: concentrationSnapshots.consensusWeightSum,
        guardWeightPct: concentrationSnapshots.guardWeightPct,
        middleWeightPct: concentrationSnapshots.middleWeightPct,
        exitWeightPct: concentrationSnapshots.exitWeightPct,
      })
      .from(concentrationSnapshots)
      .where(
        and(
          eq(concentrationSnapshots.dimension, dimension),
          eq(concentrationSnapshots.time, latest.time),
        ),
      ),
  ]);

  if (rows.length === 0) return null;

  const allConsensus = allKeys.reduce((acc, r) => acc + (r.consensusWeightSum ?? 0), 0) || 1;
  const consensusShares = allKeys.map((r) => (r.consensusWeightSum ?? 0) / allConsensus);
  const guardShares = allKeys.map((r) => (r.guardWeightPct ?? 0) / 100);
  const middleShares = allKeys.map((r) => (r.middleWeightPct ?? 0) / 100);
  const exitShares = allKeys.map((r) => (r.exitWeightPct ?? 0) / 100);
  const sumSq = (xs: number[]): number => xs.reduce((acc, x) => acc + (x * 100) ** 2, 0);

  const totalConsensusWeight = rows.reduce((acc, r) => acc + (r.consensusWeightSum ?? 0), 0);
  const totalRelays = rows.reduce((acc, r) => acc + r.relayCount, 0);

  // For the family dimension the key is the canonical relay fingerprint; resolve
  // its nickname so the UI shows a human name instead of 40 hex chars.
  const labels =
    dimension === 'family'
      ? await familyLabels(
          db,
          rows.map((r) => r.key),
        )
      : null;

  return {
    time: latest.time.toISOString(),
    dimension,
    hhi: rows[0]?.hhi ?? 0,
    hhi_by_role: {
      consensus: rows[0]?.hhi ?? sumSq(consensusShares),
      guard: sumSq(guardShares),
      middle: sumSq(middleShares),
      exit: sumSq(exitShares),
    },
    decentralization_by_role: {
      consensus: computeDecentralization(consensusShares),
      guard: computeDecentralization(guardShares),
      middle: computeDecentralization(middleShares),
      exit: computeDecentralization(exitShares),
    },
    total_relays: totalRelays,
    total_consensus_weight: totalConsensusWeight,
    keys: rows.map((r) => ({
      key: r.key,
      label: labels?.get(r.key) ?? null,
      relay_count: r.relayCount,
      guard_weight_pct: r.guardWeightPct,
      middle_weight_pct: r.middleWeightPct,
      exit_weight_pct: r.exitWeightPct,
      consensus_weight_sum: r.consensusWeightSum ?? 0,
    })),
  };
}

/** Map canonical family fingerprints → nickname for display. */
async function familyLabels(db: Database, fingerprints: string[]): Promise<Map<string, string>> {
  if (fingerprints.length === 0) return new Map();
  const named = await db
    .select({ fingerprint: relays.fingerprint, nickname: relays.nickname })
    .from(relays)
    .where(inArray(relays.fingerprint, fingerprints));
  return new Map(named.map((r) => [r.fingerprint, r.nickname]));
}

/**
 * Operator-family directory: all families (component size ≥ 2) from the latest
 * `family` concentration snapshot, paginated, ranked by consensus weight.
 */
export async function getFamilies(
  db: Database,
  opts: { limit: number; offset: number },
): Promise<FamiliesResponse | null> {
  const [latest] = await db
    .select({ time: max(concentrationSnapshots.time) })
    .from(concentrationSnapshots)
    .where(eq(concentrationSnapshots.dimension, 'family'));
  if (!latest?.time) return null;

  const where = and(
    eq(concentrationSnapshots.dimension, 'family'),
    eq(concentrationSnapshots.time, latest.time),
  );

  const [[agg], rows] = await Promise.all([
    db
      .select({ total: count(), hhi: max(concentrationSnapshots.hhi) })
      .from(concentrationSnapshots)
      .where(where),
    db
      .select()
      .from(concentrationSnapshots)
      .where(where)
      .orderBy(desc(concentrationSnapshots.consensusWeightSum))
      .limit(opts.limit)
      .offset(opts.offset),
  ]);

  const labels = await familyLabels(
    db,
    rows.map((r) => r.key),
  );

  return {
    time: latest.time.toISOString(),
    hhi: agg?.hhi ?? 0,
    total_families: agg?.total ?? 0,
    limit: opts.limit,
    offset: opts.offset,
    families: rows.map((r) => ({
      key: r.key,
      label: labels.get(r.key) ?? null,
      relay_count: r.relayCount,
      consensus_weight_sum: r.consensusWeightSum ?? 0,
      guard_weight_pct: r.guardWeightPct,
      middle_weight_pct: r.middleWeightPct,
      exit_weight_pct: r.exitWeightPct,
    })),
  };
}

/**
 * Detail for a single operator family, keyed by its canonical fingerprint.
 * Rebuilds the family graph live so membership + AS/country spread are current;
 * role shares are the family's fraction of the whole running network.
 */
export async function getFamilyDetail(db: Database, key: string): Promise<FamilyDetail | null> {
  const canonical = key.toUpperCase();
  const comps = await computeFamilyComponents(db);
  const comp = comps.find((c) => c.key === canonical);
  if (!comp) return null;

  const [members, [totals]] = await Promise.all([
    db.select().from(relays).where(inArray(relays.fingerprint, comp.members)),
    db
      .select({
        guard: sql<number>`coalesce(sum(${relays.guardProbability}), 0)`,
        middle: sql<number>`coalesce(sum(${relays.middleProbability}), 0)`,
        exit: sql<number>`coalesce(sum(${relays.exitProbability}), 0)`,
      })
      .from(relays)
      .where(eq(relays.running, true)),
  ]);

  const summaries = members.map(toSummary).sort((a, b) => b.consensus_weight - a.consensus_weight);
  const label = summaries.find((m) => m.fingerprint === comp.key)?.nickname ?? null;

  const countries = [
    ...new Set(summaries.map((m) => m.country).filter((c): c is string => !!c)),
  ].sort();

  const asAgg = new Map<
    string,
    { as_number: string | null; as_name: string | null; relay_count: number }
  >();
  for (const m of summaries) {
    const k = m.as_number ?? '∅';
    const e = asAgg.get(k) ?? { as_number: m.as_number, as_name: m.as_name, relay_count: 0 };
    e.relay_count += 1;
    asAgg.set(k, e);
  }
  const autonomous_systems = [...asAgg.values()].sort((a, b) => b.relay_count - a.relay_count);

  const pctOf = (part: number, total: number): number | null =>
    total > 0 ? (part / total) * 100 : null;

  return {
    key: comp.key,
    label,
    relay_count: comp.relayCount,
    consensus_weight_sum: comp.consensusWeightSum,
    guard_weight_pct: pctOf(comp.guardSum, Number(totals?.guard ?? 0)),
    middle_weight_pct: pctOf(comp.middleSum, Number(totals?.middle ?? 0)),
    exit_weight_pct: pctOf(comp.exitSum, Number(totals?.exit ?? 0)),
    countries,
    autonomous_systems,
    members: summaries,
  };
}

/**
 * Aggregate network statistics from the current relay set.
 */
export async function getStats(db: Database): Promise<StatsResponse> {
  const [row] = await db
    .select({
      total: count(),
      running: sql<number>`count(*) filter (where ${relays.running})`,
      // Everything below describes the LIVE network, so every one of them is
      // filtered to running relays.
      //
      // They were not, and the difference is not cosmetic. `relays` holds the
      // whole week Onionoo reports, so ~950 stopped relays were being counted:
      // the landing claimed 86 countries and 1,087 autonomous systems where the
      // live network has 79 and 971 - and the consensus weight card, labelled
      // "aggregate · all running relays", was summing the stopped ones too, 4.8%
      // high. The concentration engine has always used running relays only, so
      // the landing also contradicted /map, which reported 79 countries on the
      // same page load. Verified against Onionoo directly: 9,895 running relays
      // across 79 countries and 971 ASes, which is exactly what the filtered
      // query returns.
      //
      // `total` and `stopped` stay unfiltered on purpose - counting what has
      // been seen recently is their whole job.
      consensusWeightSum: sql<number>`coalesce(sum(${relays.consensusWeight}) filter (where ${relays.running}), 0)`,
      countries: sql<number>`count(distinct ${relays.country}) filter (where ${relays.running})`,
      autonomousSystems: sql<number>`count(distinct ${relays.asNumber}) filter (where ${relays.running})`,
      hosters: sql<number>`count(distinct ${relays.asName}) filter (where ${relays.running})`,
      lastConsensus: max(relays.lastSeen),
    })
    .from(relays);

  const total = row?.total ?? 0;
  const running = Number(row?.running ?? 0);

  return {
    relays_total: total,
    relays_running: running,
    relays_stopped: total - running,
    consensus_weight_sum: Number(row?.consensusWeightSum ?? 0),
    countries: Number(row?.countries ?? 0),
    autonomous_systems: Number(row?.autonomousSystems ?? 0),
    hosters: Number(row?.hosters ?? 0),
    last_consensus: NULLABLE_DATE_TO_ISO(row?.lastConsensus),
    computed_at: new Date().toISOString(),
  };
}

/**
 * Version / EOL distribution across the running relay set: how much of the
 * network (by count and by consensus weight) runs recommended vs obsolete Tor
 * versions. `version_status` comes from the consensus (via Onionoo).
 */
export async function getVersions(
  db: Database,
  opts: { topVersions?: number } = {},
): Promise<VersionsResponse> {
  const topN = opts.topVersions ?? 15;
  const running = eq(relays.running, true);
  const weight = sql<number>`coalesce(sum(${relays.consensusWeight}), 0)`;

  const [totalsRow, statusRows, versionRows] = await Promise.all([
    db
      .select({
        relays: count(),
        weight,
        recRelays: sql<number>`count(*) filter (where ${relays.recommendedVersion})`,
        recWeight: sql<number>`coalesce(sum(${relays.consensusWeight}) filter (where ${relays.recommendedVersion}), 0)`,
      })
      .from(relays)
      .where(running),
    db
      .select({ status: relays.versionStatus, relays: count(), weight })
      .from(relays)
      .where(running)
      .groupBy(relays.versionStatus)
      .orderBy(desc(sql`sum(${relays.consensusWeight})`)),
    db
      .select({
        version: relays.version,
        recommended: relays.recommendedVersion,
        relays: count(),
        weight,
      })
      .from(relays)
      .where(and(running, isNotNull(relays.version)))
      .groupBy(relays.version, relays.recommendedVersion)
      .orderBy(desc(sql`sum(${relays.consensusWeight})`))
      .limit(topN),
  ]);

  const totalRelays = totalsRow[0]?.relays ?? 0;
  const totalWeight = Number(totalsRow[0]?.weight ?? 0);
  const recRelays = Number(totalsRow[0]?.recRelays ?? 0);
  const recWeight = Number(totalsRow[0]?.recWeight ?? 0);
  const pct = (part: number, total: number): number => (total > 0 ? (part / total) * 100 : 0);

  return {
    computed_at: new Date().toISOString(),
    total_relays: totalRelays,
    total_consensus_weight: totalWeight,
    recommended: {
      relays: recRelays,
      consensus_weight: recWeight,
      relays_pct: pct(recRelays, totalRelays),
      weight_pct: pct(recWeight, totalWeight),
    },
    by_status: statusRows.map((r) => {
      const w = Number(r.weight);
      return {
        status: r.status,
        relays: r.relays,
        consensus_weight: w,
        relays_pct: pct(r.relays, totalRelays),
        weight_pct: pct(w, totalWeight),
      };
    }),
    top_versions: versionRows.map((r) => {
      const w = Number(r.weight);
      return {
        version: r.version ?? '',
        recommended: r.recommended,
        relays: r.relays,
        consensus_weight: w,
        relays_pct: pct(r.relays, totalRelays),
        weight_pct: pct(w, totalWeight),
      };
    }),
  };
}

const pctOf = (part: number, total: number): number => (total > 0 ? (part / total) * 100 : 0);

/**
 * overload signal. Share of running relays that reported a general overload
 * condition (Onionoo `overload_general_timestamp`), by count and consensus
 * weight, plus the countries where overload concentrates.
 */
export async function getOverload(
  db: Database,
  opts: { topCountries?: number } = {},
): Promise<OverloadResponse> {
  const topN = opts.topCountries ?? 10;
  const running = eq(relays.running, true);
  const weight = sql<number>`coalesce(sum(${relays.consensusWeight}), 0)`;
  const ovlRelays = sql<number>`count(*) filter (where ${relays.overloadGeneralTimestamp} is not null)`;
  const ovlWeight = sql<number>`coalesce(sum(${relays.consensusWeight}) filter (where ${relays.overloadGeneralTimestamp} is not null), 0)`;

  const [totalsRow, countryRows] = await Promise.all([
    db.select({ relays: count(), weight, ovlRelays, ovlWeight }).from(relays).where(running),
    db
      .select({ country: relays.country, overloaded: ovlRelays, relays: count() })
      .from(relays)
      .where(and(running, isNotNull(relays.country)))
      .groupBy(relays.country)
      .having(sql`${ovlRelays} > 0`)
      .orderBy(desc(ovlRelays))
      .limit(topN),
  ]);

  const totalRelays = totalsRow[0]?.relays ?? 0;
  const totalWeight = Number(totalsRow[0]?.weight ?? 0);
  const overloaded = Number(totalsRow[0]?.ovlRelays ?? 0);
  const overloadedWeight = Number(totalsRow[0]?.ovlWeight ?? 0);

  return {
    computed_at: new Date().toISOString(),
    total_relays: totalRelays,
    total_consensus_weight: totalWeight,
    overloaded_relays: overloaded,
    overloaded_consensus_weight: overloadedWeight,
    overloaded_relays_pct: pctOf(overloaded, totalRelays),
    overloaded_weight_pct: pctOf(overloadedWeight, totalWeight),
    by_country: countryRows.map((r) => {
      const ovl = Number(r.overloaded);
      return {
        country: r.country,
        overloaded_relays: ovl,
        relays: r.relays,
        overloaded_pct: pctOf(ovl, r.relays),
      };
    }),
  };
}

/**
 * IPv6 support. A relay is dual-stack when one of its OR addresses is an
 * IPv6 literal (`[…]`). Reports overall + guard/exit adoption and per-country.
 */
export async function getIpv6(
  db: Database,
  opts: { topCountries?: number } = {},
): Promise<Ipv6Response> {
  const topN = opts.topCountries ?? 10;
  const running = eq(relays.running, true);
  const weight = sql<number>`coalesce(sum(${relays.consensusWeight}), 0)`;
  const hasV6 = sql`exists (select 1 from unnest(${relays.orAddresses}) a where a like '[%')`;
  const v6Relays = sql<number>`count(*) filter (where ${hasV6})`;
  const v6Weight = sql<number>`coalesce(sum(${relays.consensusWeight}) filter (where ${hasV6}), 0)`;
  const v6Guard = sql<number>`count(*) filter (where ${hasV6} and 'Guard' = any(${relays.flags}))`;
  const v6Exit = sql<number>`count(*) filter (where ${hasV6} and 'Exit' = any(${relays.flags}))`;

  const [totalsRow, countryRows] = await Promise.all([
    db
      .select({ relays: count(), weight, v6Relays, v6Weight, v6Guard, v6Exit })
      .from(relays)
      .where(running),
    db
      .select({ country: relays.country, ipv6: v6Relays, relays: count() })
      .from(relays)
      .where(and(running, isNotNull(relays.country)))
      .groupBy(relays.country)
      .orderBy(desc(count()))
      .limit(topN),
  ]);

  const totalRelays = totalsRow[0]?.relays ?? 0;
  const totalWeight = Number(totalsRow[0]?.weight ?? 0);
  const ipv6Relays = Number(totalsRow[0]?.v6Relays ?? 0);
  const ipv6Weight = Number(totalsRow[0]?.v6Weight ?? 0);

  return {
    computed_at: new Date().toISOString(),
    total_relays: totalRelays,
    total_consensus_weight: totalWeight,
    ipv6_relays: ipv6Relays,
    ipv6_consensus_weight: ipv6Weight,
    ipv6_relays_pct: pctOf(ipv6Relays, totalRelays),
    ipv6_weight_pct: pctOf(ipv6Weight, totalWeight),
    ipv6_guard_relays: Number(totalsRow[0]?.v6Guard ?? 0),
    ipv6_exit_relays: Number(totalsRow[0]?.v6Exit ?? 0),
    by_country: countryRows.map((r) => {
      const v6 = Number(r.ipv6);
      return {
        country: r.country,
        ipv6_relays: v6,
        relays: r.relays,
        ipv6_pct: pctOf(v6, r.relays),
      };
    }),
  };
}

/**
 * bandwidth measurement coverage. What share of the network the bandwidth
 * authorities actually measured (`measured = true`) vs relying on the relay's
 * self-advertised bandwidth, plus the largest unmeasured relays.
 */
export async function getBandwidth(
  db: Database,
  opts: { topUnmeasured?: number } = {},
): Promise<BandwidthResponse> {
  const topN = opts.topUnmeasured ?? 15;
  const running = eq(relays.running, true);
  const weight = sql<number>`coalesce(sum(${relays.consensusWeight}), 0)`;
  const measured = sql`${relays.measured} is true`;
  const measuredRelays = sql<number>`count(*) filter (where ${measured})`;
  const measuredWeight = sql<number>`coalesce(sum(${relays.consensusWeight}) filter (where ${measured}), 0)`;
  const unmeasuredWeight = sql<number>`coalesce(sum(${relays.consensusWeight}) filter (where ${relays.measured} is not true), 0)`;
  const advSum = sql<number>`coalesce(sum(${relays.advertisedBandwidth}), 0)`;
  const obsSum = sql<number>`coalesce(sum(${relays.observedBandwidth}), 0)`;

  const [totalsRow, topRows] = await Promise.all([
    db
      .select({
        relays: count(),
        weight,
        measuredRelays,
        measuredWeight,
        unmeasuredWeight,
        advSum,
        obsSum,
      })
      .from(relays)
      .where(running),
    db
      .select({
        fingerprint: relays.fingerprint,
        nickname: relays.nickname,
        consensusWeight: relays.consensusWeight,
        advertisedBandwidth: relays.advertisedBandwidth,
      })
      .from(relays)
      .where(and(running, sql`${relays.measured} is not true`))
      .orderBy(desc(relays.consensusWeight))
      .limit(topN),
  ]);

  const totalRelays = totalsRow[0]?.relays ?? 0;
  const totalWeight = Number(totalsRow[0]?.weight ?? 0);
  const measuredCount = Number(totalsRow[0]?.measuredRelays ?? 0);
  const measuredWt = Number(totalsRow[0]?.measuredWeight ?? 0);

  return {
    computed_at: new Date().toISOString(),
    total_relays: totalRelays,
    total_consensus_weight: totalWeight,
    measured_relays: measuredCount,
    measured_consensus_weight: measuredWt,
    measured_relays_pct: pctOf(measuredCount, totalRelays),
    measured_weight_pct: pctOf(measuredWt, totalWeight),
    unmeasured_relays: totalRelays - measuredCount,
    unmeasured_consensus_weight: Number(totalsRow[0]?.unmeasuredWeight ?? 0),
    advertised_bandwidth_sum: Number(totalsRow[0]?.advSum ?? 0),
    observed_bandwidth_sum: Number(totalsRow[0]?.obsSum ?? 0),
    top_unmeasured: topRows.map((r) => ({
      fingerprint: r.fingerprint,
      nickname: r.nickname,
      consensus_weight: r.consensusWeight,
      advertised_bandwidth: r.advertisedBandwidth == null ? null : Number(r.advertisedBandwidth),
    })),
  };
}

/**
 * HHI trend. Multi-day concentration slope per dimension, read from the
 * `concentration_snapshots` hypertable (the HHI is constant across a dimension's
 * keys at a given time, so we collapse to one point per time). Complements the
 * hour-over-hour `hhi_jump` anomaly with a longer-horizon view.
 */
export async function getHhiTrend(
  db: Database,
  opts: { windowDays?: number; role?: HhiRole } = {},
): Promise<HhiTrendResponse> {
  const windowDays = opts.windowDays ?? 14;
  const role = opts.role ?? 'consensus';

  // Role HHI over time = Σ(role_weight_pct²) per (time, dimension); consensus HHI
  // is already materialized in `hhi`. Same formula, verified against the stored
  // consensus value.
  const col = concentrationSnapshots;
  const hhiExpr =
    role === 'consensus'
      ? sql<number>`max(${col.hhi})`
      : role === 'guard'
        ? sql<number>`sum(${col.guardWeightPct} * ${col.guardWeightPct})`
        : role === 'middle'
          ? sql<number>`sum(${col.middleWeightPct} * ${col.middleWeightPct})`
          : sql<number>`sum(${col.exitWeightPct} * ${col.exitWeightPct})`;

  const rows = await db
    .select({
      dimension: concentrationSnapshots.dimension,
      time: concentrationSnapshots.time,
      hhi: hhiExpr,
    })
    .from(concentrationSnapshots)
    .where(sql`${concentrationSnapshots.time} > now() - (${windowDays} || ' days')::interval`)
    .groupBy(concentrationSnapshots.dimension, concentrationSnapshots.time)
    .orderBy(concentrationSnapshots.dimension, asc(concentrationSnapshots.time));

  const byDim = new Map<string, { time: Date; hhi: number }[]>();
  for (const r of rows) {
    const list = byDim.get(r.dimension) ?? [];
    list.push({ time: r.time, hhi: Number(r.hhi) });
    byDim.set(r.dimension, list);
  }

  const dimensions = [...byDim.entries()].map(([dimension, points]) => {
    const first = points[0];
    const last = points[points.length - 1];
    const delta = last.hhi - first.hhi;
    const spanDays = Math.max(
      (last.time.getTime() - first.time.getTime()) / 86_400_000,
      1 / 24, // floor at 1h so a single-snapshot dimension doesn't divide by ~0
    );
    const slope = delta / spanDays;
    const direction: 'rising' | 'falling' | 'flat' =
      Math.abs(slope) < 1 ? 'flat' : slope > 0 ? 'rising' : 'falling';
    return {
      dimension,
      latest_hhi: last.hhi,
      earliest_hhi: first.hhi,
      delta,
      slope_per_day: slope,
      direction,
      points: points.map((p) => ({ time: p.time.toISOString(), hhi: p.hhi })),
    };
  });

  return {
    computed_at: new Date().toISOString(),
    window_days: windowDays,
    role,
    dimensions,
  };
}

/**
 * Network history: hourly time series of the whole relay network from the
 * relay_history hypertable - running/seen relay counts, total consensus weight,
 * and total advertised bandwidth. Advertised bandwidth is each relay's declared
 * capacity, not measured throughput (Tor does not expose real throughput per
 * relay). `date_trunc('hour', …)` buckets per consensus hour.
 */
export async function getNetworkHistory(
  db: Database,
  opts: { days?: number } = {},
): Promise<NetworkHistoryResponse> {
  const days = opts.days ?? 14;
  const bucket = sql`date_trunc('hour', ${relayHistory.time})`;

  const rows = await db
    .select({
      time: sql<string>`to_char(${bucket} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      relays_running: sql<number>`count(*) filter (where ${relayHistory.running})`,
      relays_stopped: sql<number>`count(*) filter (where not ${relayHistory.running})`,
      relays_seen: sql<number>`count(*)`,
      consensus_weight: sql<number>`coalesce(sum(${relayHistory.consensusWeight}), 0)`,
      advertised_bandwidth: sql<number>`coalesce(sum(${relayHistory.advertisedBandwidth}), 0)`,
      guard_bandwidth: sql<number>`coalesce(sum(${relayHistory.advertisedBandwidth}) filter (where ${relayHistory.guardProbability} > 0), 0)`,
      middle_bandwidth: sql<number>`coalesce(sum(${relayHistory.advertisedBandwidth}) filter (where ${relayHistory.middleProbability} > 0), 0)`,
      exit_bandwidth: sql<number>`coalesce(sum(${relayHistory.advertisedBandwidth}) filter (where ${relayHistory.exitProbability} > 0), 0)`,
    })
    .from(relayHistory)
    .where(sql`${relayHistory.time} > now() - (${days} || ' days')::interval`)
    .groupBy(bucket)
    .orderBy(bucket);

  const points = rows.map((r) => ({
    time: r.time,
    relays_running: Number(r.relays_running),
    relays_stopped: Number(r.relays_stopped),
    relays_seen: Number(r.relays_seen),
    consensus_weight: Number(r.consensus_weight),
    advertised_bandwidth: Number(r.advertised_bandwidth),
    guard_bandwidth: Number(r.guard_bandwidth),
    middle_bandwidth: Number(r.middle_bandwidth),
    exit_bandwidth: Number(r.exit_bandwidth),
  }));

  return {
    computed_at: new Date().toISOString(),
    window_days: days,
    points,
  };
}

/**
 * exit scarcity. Exit relays are the scarce resource; what matters most is
 * how many permit the key ports 80/443 (most real traffic). Ports are derived
 * from `exit_policy_summary` at ingest time (`exits_port_{80,443}`).
 */
export async function getExits(
  db: Database,
  opts: { topCountries?: number } = {},
): Promise<ExitsResponse> {
  const topN = opts.topCountries ?? 10;
  const running = eq(relays.running, true);
  const isExit = sql`'Exit' = any(${relays.flags})`;
  const weight = sql<number>`coalesce(sum(${relays.consensusWeight}), 0)`;
  const exitRelays = sql<number>`count(*) filter (where ${isExit})`;
  const exitWeight = sql<number>`coalesce(sum(${relays.consensusWeight}) filter (where ${isExit}), 0)`;
  const p443 = sql<number>`count(*) filter (where ${isExit} and ${relays.exitsPort443})`;
  const p443w = sql<number>`coalesce(sum(${relays.consensusWeight}) filter (where ${isExit} and ${relays.exitsPort443}), 0)`;
  const p80 = sql<number>`count(*) filter (where ${isExit} and ${relays.exitsPort80})`;
  const p80w = sql<number>`coalesce(sum(${relays.consensusWeight}) filter (where ${isExit} and ${relays.exitsPort80}), 0)`;
  const both = sql<number>`count(*) filter (where ${isExit} and ${relays.exitsPort443} and ${relays.exitsPort80})`;

  const [totalsRow, countryRows, portDiversity] = await Promise.all([
    db
      .select({ relays: count(), weight, exitRelays, exitWeight, p443, p443w, p80, p80w, both })
      .from(relays)
      .where(running),
    db
      .select({ country: relays.country, exitRelays, exitWeight })
      .from(relays)
      .where(and(running, isNotNull(relays.country)))
      .groupBy(relays.country)
      .having(sql`${exitRelays} > 0`)
      .orderBy(desc(exitWeight))
      .limit(topN),
    computeExitPortDiversity(db),
  ]);

  const totalRelays = totalsRow[0]?.relays ?? 0;
  const totalWeight = Number(totalsRow[0]?.weight ?? 0);
  const exits = Number(totalsRow[0]?.exitRelays ?? 0);
  const exitWt = Number(totalsRow[0]?.exitWeight ?? 0);

  return {
    computed_at: new Date().toISOString(),
    total_relays: totalRelays,
    total_consensus_weight: totalWeight,
    exit_relays: exits,
    exit_consensus_weight: exitWt,
    exit_weight_pct: pctOf(exitWt, totalWeight),
    exits_port_443: Number(totalsRow[0]?.p443 ?? 0),
    exits_port_443_weight: Number(totalsRow[0]?.p443w ?? 0),
    exits_port_80: Number(totalsRow[0]?.p80 ?? 0),
    exits_port_80_weight: Number(totalsRow[0]?.p80w ?? 0),
    exits_both_ports: Number(totalsRow[0]?.both ?? 0),
    by_country: countryRows.map((r) => ({
      country: r.country,
      exit_relays: Number(r.exitRelays),
      exit_consensus_weight: Number(r.exitWeight),
    })),
    port_diversity: portDiversity.map((p) => ({
      port: p.port,
      name: p.name,
      relays: p.relays,
      as_count: p.asCount,
      exit_weight_pct: p.exitWeightPct,
    })),
  };
}

/**
 * Hidden / undeclared operator families - relays sharing an operator contact
 * that are NOT a single declared effective_family (Tor treats them as
 * independent, so one operator can end up on both ends of a circuit).
 */
export async function getHiddenFamilies(
  db: Database,
  opts: { minRelays?: number; limit?: number } = {},
): Promise<HiddenFamiliesResponse> {
  const minRelays = opts.minRelays ?? 5;
  const clusters = await detectHiddenFamilies(db, { minRelays, limit: opts.limit ?? 50 });
  return {
    computed_at: new Date().toISOString(),
    min_relays: minRelays,
    total_clusters: clusters.length,
    clusters: clusters.map((c) => ({
      contact: c.contact,
      verified: c.verified,
      relays: c.relays,
      declared_families: c.declaredFamilies,
      declared_family_sizes: c.declaredFamilySizes,
      undeclared_relays: c.undeclaredRelays,
      consensus_weight: c.consensusWeight,
      guard_pct: c.guardPct,
      middle_pct: c.middlePct,
      exit_pct: c.exitPct,
      deanon_risk: c.deanonRisk,
      as_breakdown: c.asBreakdown.map((a) => ({ as_number: a.asNumber, relays: a.relays })),
      as_numbers: c.asNumbers,
      countries: c.countries,
      sample_fingerprints: c.sampleFingerprints,
    })),
  };
}

/**
 * For each correlation entity, resolve its dominant operator (the contact with
 * the most exit weight in that entity) plus a human label and whether that
 * operator is domain-verified (proof:*-rsa). Lets the UI show "this AS is a
 * known, verified operator" instead of a bare AS number - avoids reading a high
 * risk as an attacker when it's a large legitimate operator.
 */
async function resolveEntityOperators(
  db: Database,
  dimension: CorrelationDimension,
  keys: string[],
): Promise<Map<string, { label: string | null; operator: string | null; verified: boolean }>> {
  const wanted = new Set(keys);
  const verifiedExpr = sql`bool_or(r.contact ~* 'proof:(uri|dns)-rsa')`;
  const exitExpr = sql`coalesce(sum(r.exit_probability), 0)`;

  const query =
    dimension === 'hoster'
      ? sql`
          SELECT coalesce(o.org_name, r.as_name) AS key, r.contact AS contact,
            ${exitExpr} AS ex, ${verifiedExpr} AS verified, NULL AS label
          FROM relays r LEFT JOIN as_org o ON o.as_number = r.as_number
          WHERE r.running AND 'Exit' = any(r.flags)
          GROUP BY key, r.contact`
      : dimension === 'country'
        ? sql`
          SELECT r.country AS key, r.contact AS contact,
            ${exitExpr} AS ex, ${verifiedExpr} AS verified, max(r.country_name) AS label
          FROM relays r
          WHERE r.running AND 'Exit' = any(r.flags) AND r.country IS NOT NULL
          GROUP BY r.country, r.contact`
        : sql`
          SELECT r.as_number AS key, r.contact AS contact,
            ${exitExpr} AS ex, ${verifiedExpr} AS verified, max(r.as_name) AS label
          FROM relays r
          WHERE r.running AND 'Exit' = any(r.flags) AND r.as_number IS NOT NULL
          GROUP BY r.as_number, r.contact`;

  const rows = (await db.execute(query)) as unknown as Array<{
    key: string;
    contact: string | null;
    ex: number;
    verified: boolean;
    label: string | null;
  }>;

  const out = new Map<
    string,
    { label: string | null; operator: string | null; verified: boolean; _ex: number }
  >();
  for (const r of rows) {
    if (!wanted.has(r.key)) continue;
    const ex = Number(r.ex);
    const cur = out.get(r.key);
    if (!cur) {
      out.set(r.key, { label: r.label, operator: r.contact, verified: r.verified, _ex: ex });
    } else if (ex > cur._ex) {
      cur.operator = r.contact;
      cur.verified = r.verified;
      cur._ex = ex;
      if (r.label) cur.label = r.label;
    }
  }
  return new Map(
    [...out.entries()].map(([k, v]) => [
      k,
      { label: v.label, operator: v.operator, verified: v.verified },
    ]),
  );
}

/**
 * Guard↔exit correlation risk (Tor threat model): probability the same entity
 * (AS/hoster/country) sits on both the guard and the exit of a random circuit.
 * Computed live from path-selection probabilities.
 */
export async function getCorrelationRisk(
  db: Database,
  dimension: CorrelationDimension,
  opts: { limit?: number } = {},
): Promise<CorrelationResponse> {
  const result =
    dimension === 'hoster' ? await computeHoster(db) : await computeDimension(db, dimension);
  const risk = computeCorrelationRisk(result, { limit: opts.limit ?? 20 });

  const meta = await resolveEntityOperators(
    db,
    dimension,
    risk.top.map((k) => k.key),
  );

  return {
    computed_at: new Date().toISOString(),
    dimension,
    total_risk: risk.totalRisk,
    top: risk.top.map((k) => {
      const m = meta.get(k.key);
      return {
        key: k.key,
        label: m?.label ?? null,
        operator: m?.operator ?? null,
        verified: m?.verified ?? false,
        guard_share: k.guardShare,
        exit_share: k.exitShare,
        risk: k.risk,
      };
    }),
  };
}

// --- Row mappers (DB → API shape) ---

function toSummary(r: typeof relays.$inferSelect): RelaysResponse['relays'][number] {
  return {
    fingerprint: r.fingerprint,
    nickname: r.nickname,
    running: r.running,
    country: r.country,
    country_name: r.countryName,
    as_number: r.asNumber,
    as_name: r.asName,
    consensus_weight: r.consensusWeight,
    guard_probability: numOrNull(r.guardProbability),
    middle_probability: numOrNull(r.middleProbability),
    exit_probability: numOrNull(r.exitProbability),
    flags: r.flags,
    first_seen: r.firstSeen.toISOString(),
    last_seen: r.lastSeen.toISOString(),
  };
}

function toDetail(r: typeof relays.$inferSelect): RelayDetail {
  return {
    ...toSummary(r),
    contact: r.contact,
    version: r.version,
    platform: r.platform,
    or_addresses: r.orAddresses ?? [],
    exit_addresses: r.exitAddresses ?? [],
    dir_address: r.dirAddress,
    advertised_bandwidth: numOrNull(r.advertisedBandwidth),
    observed_bandwidth: numOrNull(r.observedBandwidth),
    overload_general_timestamp: NULLABLE_DATE_TO_ISO(r.overloadGeneralTimestamp),
    effective_family: r.effectiveFamily ?? [],
    alleged_family: r.allegedFamily ?? [],
    consensus_weight_fraction: numOrNull(r.consensusWeightFraction),
    measured: r.measured,
    recommended_version: r.recommendedVersion,
    version_status: r.versionStatus,
    last_restarted: NULLABLE_DATE_TO_ISO(r.lastRestarted),
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type CountryOption = { code: string; name: string | null; count: number };

/**
 * Distinct countries with relay counts, for the directory filter dropdown.
 * Excludes relays without a geo country. Ordered by count desc.
 */
export async function getCountryOptions(db: Database): Promise<CountryOption[]> {
  const rows = await db
    .select({
      code: relays.country,
      name: relays.countryName,
      count: count(),
    })
    .from(relays)
    .where(sql`${relays.country} IS NOT NULL`)
    .groupBy(relays.country, relays.countryName)
    .orderBy(desc(count()));
  return rows.map((r) => ({ code: r.code ?? '', name: r.name, count: r.count }));
}

/**
 * Recent anomalies (Fase 1 detectors) for the alerts feed. Newest first.
 */
export async function getRecentAnomalies(
  db: Database,
  opts: {
    type?: string;
    severity?: string;
    severityMin?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<AnomalyFeedResponse> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const conds = [];
  if (opts.type) conds.push(eq(anomalies.type, opts.type));
  // Exact-severity filter (drives the clickable severity chips, which show a
  // per-level count). severityMin (>= a level) is kept for API callers.
  if (opts.severity && SEVERITY_RANK[opts.severity as Severity] !== undefined) {
    conds.push(eq(anomalies.severity, opts.severity));
  } else if (opts.severityMin) {
    const minRank = SEVERITY_RANK[opts.severityMin as Severity];
    if (minRank !== undefined) {
      const allowed = (Object.keys(SEVERITY_RANK) as Severity[]).filter(
        (s) => SEVERITY_RANK[s] >= minRank,
      );
      conds.push(inArray(anomalies.severity, allowed));
    }
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  // Order by severity (critical first), then recency, so the worst findings
  // surface at the top instead of being buried under low-severity noise.
  const sevRank = sql`case ${anomalies.severity} when 'critical' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end`;

  const [[totalRow], rows] = await Promise.all([
    db.select({ total: count() }).from(anomalies).where(where),
    db
      .select()
      .from(anomalies)
      .where(where)
      .orderBy(desc(sevRank), desc(anomalies.detectedAt))
      .limit(limit)
      .offset(offset),
  ]);

  const items: AnomalyFeedItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    severity: r.severity as AnomalyFeedItem['severity'],
    details: r.details as Record<string, unknown>,
    detected_at: r.detectedAt.toISOString(),
    source_instance: r.sourceInstance,
  }));

  return { anomalies: items, total: totalRow?.total ?? 0 };
}

/**
 * Recent alert events (materialized by the Fase 3 engine), newest first.
 * Joins rule name for display.
 */
export async function getRecentAlertEvents(
  db: Database,
  opts: { limit?: number; offset?: number } = {},
): Promise<AlertEventFeedResponse> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const [[totalRow], rows] = await Promise.all([
    db.select({ total: count() }).from(alertEvents),
    db
      .select({
        id: alertEvents.id,
        ruleId: alertEvents.ruleId,
        triggeredAt: alertEvents.triggeredAt,
        payload: alertEvents.payload,
        deliveredTo: alertEvents.deliveredTo,
        ruleName: alertRules.name,
      })
      .from(alertEvents)
      .leftJoin(alertRules, eq(alertEvents.ruleId, alertRules.id))
      .orderBy(desc(alertEvents.triggeredAt))
      .limit(limit)
      .offset(offset),
  ]);

  const items: AlertEventFeedItem[] = rows.map((r) => ({
    id: r.id,
    rule_id: r.ruleId,
    rule_name: r.ruleName ?? '(deleted rule)',
    triggered_at: r.triggeredAt.toISOString(),
    payload: r.payload as Record<string, unknown>,
    delivered_to: r.deliveredTo ?? [],
  }));

  return { events: items, total: totalRow?.total ?? 0 };
}

/**
 * Count of anomalies grouped by severity - for the /alerts overview chips.
 * Reflects the full table (independent of pagination).
 */
export async function getAnomalySeverityCounts(db: Database): Promise<Record<string, number>> {
  const rows = await db
    .select({ severity: anomalies.severity, count: count() })
    .from(anomalies)
    .groupBy(anomalies.severity);
  return Object.fromEntries(rows.map((r) => [r.severity, r.count]));
}

export async function getAnomalyTypeCounts(db: Database): Promise<Record<string, number>> {
  const rows = await db
    .select({ type: anomalies.type, count: count() })
    .from(anomalies)
    .groupBy(anomalies.type);
  return Object.fromEntries(rows.map((r) => [r.type, r.count]));
}

/**
 * Alert rules owned by an operator, newest first.
 */
export async function getRulesByOwner(db: Database, ownerId: string) {
  const rows = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.ownerId, ownerId))
    .orderBy(desc(alertRules.createdAt));
  return rows;
}

/**
 * All alert rules (for the operator panel when viewing the system rules too).
 */
export async function getAllRules(db: Database) {
  const rows = await db.select().from(alertRules).orderBy(desc(alertRules.createdAt));
  return rows;
}

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * All relays matching the given filters (no pagination), capped at EXPORT_CAP.
 * Used by the CSV export route. Ordered by consensus_weight DESC.
 */
export const EXPORT_CAP = 15000;

export async function getRelaysForExport(
  db: Database,
  q: RelaysQuery,
): Promise<RelaysResponse['relays']> {
  const conditions = [
    q.running !== undefined ? eq(relays.running, q.running) : undefined,
    q.country ? eq(relays.country, q.country.toLowerCase()) : undefined,
    q.asNumber ? eq(relays.asNumber, q.asNumber) : undefined,
    q.flag ? arrayContains(relays.flags, [q.flag]) : undefined,
    q.search
      ? or(
          ilike(relays.nickname, `%${q.search}%`),
          ilike(relays.fingerprint, `%${q.search.toUpperCase()}%`),
        )
      : undefined,
  ].filter((c) => c !== undefined);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(relays)
    .where(where)
    .orderBy(desc(relays.consensusWeight))
    .limit(EXPORT_CAP);

  return rows.map(toSummary);
}

// --- Operator claims (Fase 3.2b) ---

export type ClaimView = {
  id: string;
  fingerprint: string;
  nickname: string | null;
  running: boolean;
  proofType: string;
  verifiedAt: string;
  proofMetadata: string | null;
};

/**
 * Claims owned by an operator, joined with relay nickname/status for display.
 */
export async function getClaimsByOperator(db: Database, operatorId: string): Promise<ClaimView[]> {
  const rows = await db
    .select({
      id: operatorClaims.id,
      fingerprint: operatorClaims.fingerprint,
      nickname: relays.nickname,
      running: relays.running,
      proofType: operatorClaims.proofType,
      verifiedAt: operatorClaims.verifiedAt,
      proofMetadata: operatorClaims.proofMetadata,
    })
    .from(operatorClaims)
    .leftJoin(relays, eq(operatorClaims.fingerprint, relays.fingerprint))
    .where(eq(operatorClaims.operatorId, operatorId))
    .orderBy(desc(operatorClaims.verifiedAt));
  return rows.map((r) => ({
    id: r.id,
    fingerprint: r.fingerprint,
    nickname: r.nickname,
    running: r.running ?? false,
    proofType: r.proofType,
    verifiedAt: r.verifiedAt.toISOString(),
    proofMetadata: r.proofMetadata,
  }));
}

/**
 * Verify contact-token claims (T1) for an operator: scans relays whose
 * `contact` field contains the operator's `tor-sockets-verify:<token>` marker.
 * Creates `operator_claims` (proofType='contact_token') deduped per
 * (operator, fingerprint). Returns the number of new claims.
 *
 * The token only appears in Onionoo after the operator edits their torrc
 * `Contact` and the next hourly poll ingests it - so this is typically called
 * on demand ("Verify now") some time after the operator sets it up.
 */
export async function verifyContactTokenClaims(
  db: Database,
  operatorId: string,
): Promise<{ token: string | null; matched: number; created: number }> {
  const [op] = await db
    .select({ token: operators.verifyToken })
    .from(operators)
    .where(eq(operators.id, operatorId))
    .limit(1);
  if (!op?.token) return { token: null, matched: 0, created: 0 };

  const marker = `tor-sockets-verify:${op.token}`;
  const matched = await db
    .select({ fingerprint: relays.fingerprint, contact: relays.contact })
    .from(relays)
    .where(ilike(relays.contact, `%${marker}%`));

  let created = 0;
  for (const r of matched) {
    const result = await db
      .insert(operatorClaims)
      .values({
        operatorId,
        fingerprint: r.fingerprint,
        proofType: 'contact_token',
        proofMetadata: marker,
      })
      .onConflictDoNothing()
      .returning({ id: operatorClaims.id });
    if (result.length > 0) created += 1;
  }
  return { token: op.token, matched: matched.length, created };
}

/**
 * T3 self-attested claim: an operator claims a relay by asserting their email
 * appears in the relay's `contact` string. Low trust (no cryptographic proof),
 * but instant. Returns whether the claim was created and the matched contact.
 */
export async function claimRelaySelfAttested(
  db: Database,
  operatorId: string,
  operatorEmail: string,
  fingerprint: string,
): Promise<{ created: boolean; matchedContact: string | null; reason?: string }> {
  const fp = fingerprint.toUpperCase();
  const [relay] = await db
    .select({ contact: relays.contact })
    .from(relays)
    .where(eq(relays.fingerprint, fp))
    .limit(1);
  if (!relay) return { created: false, matchedContact: null, reason: 'relay not found' };

  const contact = relay.contact ?? '';
  const email = operatorEmail.toLowerCase();
  const matched = contact.toLowerCase().includes(email) ? contact : null;
  if (!matched) {
    return {
      created: false,
      matchedContact: null,
      reason: `your email not found in relay contact ("${contact.slice(0, 60) || 'empty'}")`,
    };
  }

  const result = await db
    .insert(operatorClaims)
    .values({
      operatorId,
      fingerprint: fp,
      proofType: 'self_attested',
      proofMetadata: `email:${email}`,
    })
    .onConflictDoNothing()
    .returning({ id: operatorClaims.id });
  return { created: result.length > 0, matchedContact: matched };
}

// --- Federation peers (Fase 3.3) ---

export type PeerView = {
  instanceId: string;
  uri: string;
  pubkey: string;
  contact: string | null;
  trusted: boolean;
  lastSyncSeq: string;
  lastSeenAt: string | null;
  lastStatus: Record<string, unknown> | null;
  discoveredAt: string;
};

export async function getPeers(db: Database): Promise<PeerView[]> {
  const rows = await db
    .select()
    .from(federationPeers)
    .orderBy(desc(federationPeers.trusted), federationPeers.discoveredAt);
  return rows.map((r) => ({
    instanceId: r.instanceId,
    uri: r.uri,
    pubkey: r.pubkey,
    contact: r.contact,
    trusted: r.trusted,
    lastSyncSeq: r.lastSyncSeq.toString(),
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    lastStatus: r.lastStatus as Record<string, unknown> | null,
    discoveredAt: r.discoveredAt.toISOString(),
  }));
}

/**
 * Add a peer by fetching its actor document from `uri` and recording the
 * published instance_id + pubkey. `trusted` defaults to false (anti-Sybil: the
 * operator must opt-in to cross-verification).
 */
export async function addPeer(
  db: Database,
  uri: string,
): Promise<{ added: boolean; actor: ActorDocument; reason?: string }> {
  const actor = await fetchActorDocument(uri);
  await db
    .insert(federationPeers)
    .values({
      instanceId: actor.instance_id,
      uri: actor.instance_uri,
      pubkey: actor.pubkey,
      contact: actor.contact,
      trusted: false,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: federationPeers.instanceId,
      set: {
        uri: actor.instance_uri,
        pubkey: actor.pubkey,
        contact: actor.contact,
        lastSeenAt: new Date(),
      },
    });
  return { added: true, actor };
}

export async function removePeer(db: Database, instanceId: string): Promise<void> {
  await db.delete(federationPeers).where(eq(federationPeers.instanceId, instanceId));
}

export async function setPeerTrusted(
  db: Database,
  instanceId: string,
  trusted: boolean,
): Promise<void> {
  await db
    .update(federationPeers)
    .set({ trusted })
    .where(eq(federationPeers.instanceId, instanceId));
}

/**
 * When the ingestion worker last completed a cycle of `job`, or null if it has
 * never reported one.
 *
 * Distinct from the age of the newest consensus, and deliberately so. Onionoo
 * republishes roughly an hour behind the consensus it serves, so "the data is
 * two hours old" is the normal state of a healthy instance - it is only alarming
 * when the pipeline stopped, and consensus age alone cannot tell those apart.
 * This is the signal that can: it should never be older than the poll interval.
 */
export async function getLastIngestSuccess(db: Database, job: string): Promise<string | null> {
  const [row] = await db
    .select({ at: ingestStatus.lastSuccessAt })
    .from(ingestStatus)
    .where(eq(ingestStatus.job, job))
    .limit(1);
  return row?.at ? row.at.toISOString() : null;
}
