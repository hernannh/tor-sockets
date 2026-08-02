import { type Database, concentrationSnapshots, relays } from '@tor-sockets/db';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

/**
 * Concentration engine - computes Herfindahl-Hirschman Index per dimension
 * (country / AS / hoster) from the current relay set, and materializes a
 * snapshot into the `concentration_snapshots` hypertable.
 *
 * HHI ranges from 0 (perfectly distributed) to 10000 (monopoly). Standard
 * bands: see `hhi-bands.ts` - an index of 10000/N is the concentration of N
 * equal-sized operators, and the boundaries sit at N=10 and N=5.
 *
 * Market share for a key K in dimension D:
 *   share_K = Σ consensus_weight of relays where D=K  /  Σ consensus_weight of all running relays
 * HHI for dimension D = Σ (share_K × 100)²
 */

export type Dimension = 'country' | 'as' | 'hoster' | 'family';

export const DIMENSIONS: readonly Dimension[] = ['country', 'as', 'hoster', 'family'] as const;

/**
 * Column-backed dimensions: each maps to a single `relays` column that is the
 * bucket key. `hoster` and `family` are NOT here - `hoster` groups by the
 * PeeringDB org (`computeHoster`, joins `as_org`), `family` by the
 * `effective_family` graph (`computeFamily`).
 */
const KEY_COLUMN = {
  country: relays.country,
  as: relays.asNumber,
} as const;

/** Column-backed dimensions handled by `computeDimension`. */
type ColumnDimension = keyof typeof KEY_COLUMN;

/** Aggregated stats for a single (dimension, key) bucket. */
export interface KeyStat {
  key: string;
  relayCount: number;
  consensusWeightSum: number;
  /** Σ of guard/middle/exit probabilities - fractions of the total network. */
  guardSum: number;
  middleSum: number;
  exitSum: number;
}

/** Per-role HHI (0..10000) and totals for a dimension snapshot. */
export interface DimensionResult {
  dimension: Dimension;
  at: Date;
  keys: KeyStat[];
  totals: {
    consensusWeight: number;
    guard: number;
    middle: number;
    exit: number;
    relays: number;
  };
  hhi: {
    consensus: number;
    guard: number;
    middle: number;
    exit: number;
  };
}

/**
 * Aggregate running relays by the column for `dimension`, returning per-key
 * stats plus the dimension-wide HHI for consensus/guard/middle/exit.
 *
 * **Relays with a NULL key are excluded from the denominator, not just from the
 * buckets.** The `WHERE ... IS NOT NULL` below runs before the grouping, and the
 * totals are summed from those same rows, so every share is "share of the weight
 * that has a known key for this dimension". This comment used to claim the
 * opposite - that unknown-key relays still counted toward the totals - which was
 * never what the query did.
 *
 * The choice matters because it moves the index: a smaller denominator makes
 * every share larger, and HHI is the sum of their squares, so excluding unknowns
 * biases the index **upward** relative to spreading them across the total.
 *
 * Measured against the live network (2026-07-26): zero running relays lack a
 * country, an AS or an effective family, so today the two definitions agree
 * exactly and nothing published is affected. It is documented rather than
 * "fixed" because the honest reading of a share is over the population where the
 * attribute is known - but if Onionoo ever starts omitting these fields for part
 * of the network, this is the line that decides whether the number still means
 * what the page says it means.
 */
export async function computeDimension(
  db: Database,
  dimension: ColumnDimension,
  opts: { at?: Date } = {},
): Promise<DimensionResult> {
  const at = opts.at ?? new Date();
  const keyCol = KEY_COLUMN[dimension];

  const rows = await db
    .select({
      key: keyCol,
      relayCount: sql<number>`count(*)`,
      consensusWeightSum: sql<number>`coalesce(sum(${relays.consensusWeight}), 0)`,
      guardSum: sql<number>`coalesce(sum(${relays.guardProbability}), 0)`,
      middleSum: sql<number>`coalesce(sum(${relays.middleProbability}), 0)`,
      exitSum: sql<number>`coalesce(sum(${relays.exitProbability}), 0)`,
    })
    .from(relays)
    .where(and(eq(relays.running, true), isNotNull(keyCol)))
    .groupBy(keyCol);

  const keys: KeyStat[] = rows
    .filter((r): r is typeof r & { key: string } => r.key !== null)
    .map((r) => ({
      key: r.key,
      relayCount: Number(r.relayCount),
      consensusWeightSum: Number(r.consensusWeightSum),
      guardSum: Number(r.guardSum),
      middleSum: Number(r.middleSum),
      exitSum: Number(r.exitSum),
    }));

  const totals = {
    consensusWeight: sumOf(keys, (k) => k.consensusWeightSum),
    guard: sumOf(keys, (k) => k.guardSum),
    middle: sumOf(keys, (k) => k.middleSum),
    exit: sumOf(keys, (k) => k.exitSum),
    relays: sumOf(keys, (k) => k.relayCount),
  };

  return {
    dimension,
    at,
    keys,
    totals,
    hhi: {
      consensus: hhi(keys, (k) => k.consensusWeightSum, totals.consensusWeight),
      guard: hhi(keys, (k) => k.guardSum, totals.guard),
      middle: hhi(keys, (k) => k.middleSum, totals.middle),
      exit: hhi(keys, (k) => k.exitSum, totals.exit),
    },
  };
}

/**
 * Concentration by **hoster** (operator organization), grouping relays by the
 * PeeringDB org that owns their ASN rather than by AS name. One org (OVH,
 * Hetzner…) usually spans several ASNs, and several orgs can share one AS, so
 * `as_name` alone conflates and splits real hosters.
 *
 * Left-joins `as_org`; relays whose ASN isn't in PeeringDB fall back to their
 * AS name (so coverage gaps degrade to the previous behaviour, never to NULL).
 */
export async function computeHoster(
  db: Database,
  opts: { at?: Date } = {},
): Promise<DimensionResult> {
  const at = opts.at ?? new Date();

  const result = await db.execute(sql`
    SELECT
      coalesce(o.org_name, r.as_name) AS key,
      count(*) AS relay_count,
      coalesce(sum(r.consensus_weight), 0) AS consensus_weight_sum,
      coalesce(sum(r.guard_probability), 0) AS guard_sum,
      coalesce(sum(r.middle_probability), 0) AS middle_sum,
      coalesce(sum(r.exit_probability), 0) AS exit_sum
    FROM relays r
    LEFT JOIN as_org o ON o.as_number = r.as_number
    WHERE r.running = true AND coalesce(o.org_name, r.as_name) IS NOT NULL
    GROUP BY coalesce(o.org_name, r.as_name)
  `);

  const keys: KeyStat[] = (
    result as unknown as Array<{
      key: string;
      relay_count: number;
      consensus_weight_sum: number;
      guard_sum: number;
      middle_sum: number;
      exit_sum: number;
    }>
  ).map((r) => ({
    key: r.key,
    relayCount: Number(r.relay_count),
    consensusWeightSum: Number(r.consensus_weight_sum),
    guardSum: Number(r.guard_sum),
    middleSum: Number(r.middle_sum),
    exitSum: Number(r.exit_sum),
  }));

  const totals = {
    consensusWeight: sumOf(keys, (k) => k.consensusWeightSum),
    guard: sumOf(keys, (k) => k.guardSum),
    middle: sumOf(keys, (k) => k.middleSum),
    exit: sumOf(keys, (k) => k.exitSum),
    relays: sumOf(keys, (k) => k.relayCount),
  };

  return {
    dimension: 'hoster',
    at,
    keys,
    totals,
    hhi: {
      consensus: hhi(keys, (k) => k.consensusWeightSum, totals.consensusWeight),
      guard: hhi(keys, (k) => k.guardSum, totals.guard),
      middle: hhi(keys, (k) => k.middleSum, totals.middle),
      exit: hhi(keys, (k) => k.exitSum, totals.exit),
    },
  };
}

/**
 * Concentration by **operator family**.
 *
 * Tor's `effective_family` is the set of relays that *mutually* declare each
 * other as family (Onionoo already resolves mutuality). Two relays in the same
 * effective family are almost always run by the same operator - the network
 * never builds a circuit through two relays of one family, so a family is the
 * real unit of "who controls this weight", cutting across AS and country.
 *
 * We treat the family relation as an undirected graph over the *running* relay
 * set and take its connected components. Each component is one operator family.
 * A relay with no (running) family members is a component of size 1 (a solo
 * operator) - these count toward the HHI and the totals, but are NOT persisted
 * as rows (they would be ~6000 singletons per snapshot); only families of size
 * ≥ `minFamilySize` are returned in `keys`.
 *
 * The bucket `key` is the **lexicographically smallest fingerprint** in the
 * component, so a family keeps a stable id across snapshots (as long as that
 * relay stays running) and the time series lines up.
 */
export async function computeFamily(
  db: Database,
  opts: { at?: Date; minFamilySize?: number } = {},
): Promise<DimensionResult> {
  const at = opts.at ?? new Date();
  const minSize = opts.minFamilySize ?? 2;

  const { all, totals } = await loadFamilyGroups(db);

  // HHI is over ALL components (singletons included) so shares sum to 1 and the
  // index reflects true atomization; only multi-relay families are surfaced.
  const keys: KeyStat[] = all
    .filter((g) => g.relayCount >= minSize)
    .sort((a, b) => b.consensusWeightSum - a.consensusWeightSum)
    .map(toKeyStat);

  return {
    dimension: 'family',
    at,
    keys,
    totals,
    hhi: {
      consensus: hhi(all, (k) => k.consensusWeightSum, totals.consensusWeight),
      guard: hhi(all, (k) => k.guardSum, totals.guard),
      middle: hhi(all, (k) => k.middleSum, totals.middle),
      exit: hhi(all, (k) => k.exitSum, totals.exit),
    },
  };
}

/** One operator family: aggregated stats plus the member fingerprints. */
export interface FamilyComponent extends KeyStat {
  /** Fingerprints of every running relay in the component (incl. the canonical). */
  members: string[];
}

/**
 * List operator families (connected components of the `effective_family` graph)
 * of size ≥ `minFamilySize`, each with its member fingerprints, sorted by
 * consensus weight desc. Used by the family directory + detail views; recomputes
 * the graph live so membership is always current.
 */
export async function computeFamilyComponents(
  db: Database,
  opts: { minFamilySize?: number } = {},
): Promise<FamilyComponent[]> {
  const minSize = opts.minFamilySize ?? 2;
  const { all } = await loadFamilyGroups(db);
  return all
    .filter((g) => g.relayCount >= minSize)
    .sort((a, b) => b.consensusWeightSum - a.consensusWeightSum);
}

/** Strip the member list, exposing a family component as a plain KeyStat. */
function toKeyStat(g: FamilyComponent): KeyStat {
  const { members: _members, ...stat } = g;
  return stat;
}

/**
 * Build the connected components of the running relays' `effective_family`
 * graph (union-find), returning every component (singletons included) with its
 * aggregated weights + member fingerprints, plus network-wide totals. Shared by
 * `computeFamily` (HHI) and `computeFamilyComponents` (membership).
 */
async function loadFamilyGroups(
  db: Database,
): Promise<{ all: FamilyComponent[]; totals: DimensionResult['totals'] }> {
  const rows = await db
    .select({
      fingerprint: relays.fingerprint,
      effectiveFamily: relays.effectiveFamily,
      consensusWeight: relays.consensusWeight,
      guard: relays.guardProbability,
      middle: relays.middleProbability,
      exit: relays.exitProbability,
    })
    .from(relays)
    .where(eq(relays.running, true));

  const present = new Set(rows.map((r) => r.fingerprint));
  const uf = new UnionFind();
  for (const r of rows) uf.add(r.fingerprint);
  for (const r of rows) {
    for (const fp of r.effectiveFamily ?? []) {
      // Only union edges to relays we actually have (running set) - a family
      // link to an offline relay can't carry weight and would just be noise.
      // Onionoo's effective_family INCLUDES the relay's own fingerprint, so the
      // self-skip below is what keeps a solo relay a singleton, not a "family".
      if (fp !== r.fingerprint && present.has(fp)) uf.union(r.fingerprint, fp);
    }
  }

  // Group relays by component root, aggregating stats + members and tracking the
  // canonical (smallest) fingerprint as the stable component key.
  const groups = new Map<string, { canonical: string; comp: FamilyComponent }>();
  for (const r of rows) {
    const root = uf.find(r.fingerprint);
    let g = groups.get(root);
    if (!g) {
      g = {
        canonical: r.fingerprint,
        comp: {
          key: r.fingerprint,
          relayCount: 0,
          consensusWeightSum: 0,
          guardSum: 0,
          middleSum: 0,
          exitSum: 0,
          members: [],
        },
      };
      groups.set(root, g);
    }
    if (r.fingerprint < g.canonical) g.canonical = r.fingerprint;
    g.comp.relayCount += 1;
    g.comp.consensusWeightSum += r.consensusWeight ?? 0;
    g.comp.guardSum += num(r.guard);
    g.comp.middleSum += num(r.middle);
    g.comp.exitSum += num(r.exit);
    g.comp.members.push(r.fingerprint);
  }

  const all: FamilyComponent[] = [...groups.values()].map((g) => ({
    ...g.comp,
    key: g.canonical,
  }));

  const totals = {
    consensusWeight: sumOf(all, (k) => k.consensusWeightSum),
    guard: sumOf(all, (k) => k.guardSum),
    middle: sumOf(all, (k) => k.middleSum),
    exit: sumOf(all, (k) => k.exitSum),
    relays: sumOf(all, (k) => k.relayCount),
  };

  return { all, totals };
}

/**
 * Compute one snapshot across all dimensions and insert rows into
 * `concentration_snapshots`. Returns a summary suitable for job logging.
 *
 * The `hhi` column of each row holds the consensus-weight HHI for that
 * dimension (the standard market-concentration metric). Per-role HHI can be
 * recomputed by consumers from `*_weight_pct` if needed.
 */
export async function snapshotConcentration(
  db: Database,
  opts: { sources?: string[]; at?: Date; dimensions?: readonly Dimension[] } = {},
): Promise<{
  inserted: number;
  at: Date;
  perDimension: Record<Dimension, { keys: number; hhi: number }>;
}> {
  const at = opts.at ?? new Date();
  const sources = opts.sources ?? [];
  const dimensions = opts.dimensions ?? DIMENSIONS;

  const results = await Promise.all(
    dimensions.map((d) =>
      d === 'family'
        ? computeFamily(db, { at })
        : d === 'hoster'
          ? computeHoster(db, { at })
          : computeDimension(db, d, { at }),
    ),
  );

  const rows = results.flatMap((r) =>
    r.keys.map((k) => ({
      time: at,
      dimension: r.dimension,
      key: k.key,
      relayCount: k.relayCount,
      guardWeightPct: r.totals.guard > 0 ? pct(k.guardSum, r.totals.guard) : null,
      middleWeightPct: r.totals.middle > 0 ? pct(k.middleSum, r.totals.middle) : null,
      exitWeightPct: r.totals.exit > 0 ? pct(k.exitSum, r.totals.exit) : null,
      consensusWeightSum: k.consensusWeightSum,
      hhi: r.hhi.consensus,
      sources,
    })),
  );

  if (rows.length > 0) {
    // Chunk to stay under the postgres 65535-parameter cap (9 cols × N rows).
    // ON CONFLICT DO NOTHING on (time, dimension, key) makes a retried snapshot
    // cycle idempotent instead of duplicating rows.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(concentrationSnapshots)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoNothing({
          target: [
            concentrationSnapshots.time,
            concentrationSnapshots.dimension,
            concentrationSnapshots.key,
          ],
        });
    }
  }

  const perDimension = {} as Record<Dimension, { keys: number; hhi: number }>;
  for (const r of results)
    perDimension[r.dimension] = { keys: r.keys.length, hhi: r.hhi.consensus };

  return { inserted: rows.length, at, perDimension };
}

/** HHI = Σ (share × 100)² for the given weight selector. Returns 0..10000. */
function hhi(keys: KeyStat[], select: (k: KeyStat) => number, total: number): number {
  if (total <= 0) return 0;
  let acc = 0;
  for (const k of keys) {
    const share = select(k) / total;
    acc += share * share;
  }
  return acc * 10000;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function sumOf<T>(arr: T[], select: (x: T) => number): number {
  let acc = 0;
  for (const x of arr) acc += select(x);
  return acc;
}

/** Parse a Drizzle `numeric` column (string | null) to a number; null → 0. */
function num(value: string | null): number {
  return value === null ? 0 : Number(value);
}

/** Disjoint-set with path compression + union by size (family components). */
class UnionFind {
  private parent = new Map<string, string>();
  private size = new Map<string, number>();

  add(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.size.set(x, 1);
    }
  }

  find(x: string): string {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root) as string;
    // Path compression.
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur) as string;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const sa = this.size.get(ra) as number;
    const sb = this.size.get(rb) as number;
    const [big, small] = sa >= sb ? [ra, rb] : [rb, ra];
    this.parent.set(small, big);
    this.size.set(big, sa + sb);
  }
}
