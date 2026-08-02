import { createHash } from 'node:crypto';
import { type Database, anomalies, concentrationSnapshots } from '@tor-sockets/db';
import { and, desc, eq, sql } from 'drizzle-orm';

/**
 * Anomaly detection engine.
 *
 * Three detectors run after each concentration snapshot:
 *  - HHI jumps: large hour-over-hour change in concentration index
 *  - Relay clustering: many new relays appearing in one AS (Sybil signal)
 *  - Fast weight gain: relay doubling its consensus weight in one cycle
 *
 * Each detector returns specs (no DB writes); `detectAnomalies` inserts them
 * into `anomalies` with a deterministic id so the same finding isn't logged
 * twice within its time bucket. Detection is best-effort and idempotent.
 */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface AnomalySpec {
  type: string;
  severity: Severity;
  details: Record<string, unknown>;
  /** Time bucket included in the dedup id - same finding renews per bucket. */
  bucket: string;
}

export interface DetectionSummary {
  detected: number;
  inserted: number;
  perType: Record<string, number>;
}

const DEFAULT_THRESHOLDS = {
  hhiJump: 100, // |ΔHHI| ≥ this triggers (a band spans ~1000, so 100 is a meaningful shift)
  clusterMinRelays: 10, // ≥ N new relays in one AS within 24h
  clusterWindowHours: 24,
  weightGainMultiple: 2, // latest ≥ multiple × median baseline
  weightGainMinAbs: 1000, // AND latest − baseline ≥ this
  // AND the relay must ALREADY have carried real weight. Without this, the
  // detector reports every relay the bandwidth authorities are measuring for the
  // first time: an unmeasured relay sits at a consensus weight of 1, so its
  // first real measurement reads as "×6800 in one hour". Observed on the first
  // deploy - of 13 findings, 5 had a baseline of 72 or less (1 → 6800, 20 →
  // 4900, 72 → 1700) and every one of them was routine onboarding, not a Sybil
  // ramp. 1000 out of a ~210M network total is under 0.0005% of consensus
  // weight, so below this line a relay cannot move concentration however fast it
  // grows - which is the only thing this product claims to watch.
  weightGainMinBaseline: 1000,
  weightGainWindowHours: 12, // window for the median baseline (was 3 - too few samples)
  weightGainMinSamples: 4, // need ≥ this many observations, else too noisy to judge
  weightGainLimit: 50, // cap per cycle (avoid flooding on consensus changes)
} as const;

// --- Detectors ---

/**
 * Hour-over-hour HHI change per dimension. Pulls the two latest distinct
 * snapshot times, compares the HHI (consensus-weight) of each.
 */
export async function detectHhiJumps(
  db: Database,
  opts: { minJump?: number; dimensions?: readonly string[] } = {},
): Promise<AnomalySpec[]> {
  const minJump = opts.minJump ?? DEFAULT_THRESHOLDS.hhiJump;
  const dimensions = opts.dimensions ?? (['country', 'as', 'hoster'] as const);
  const out: AnomalySpec[] = [];

  for (const dimension of dimensions) {
    const times = await db
      .select({ time: concentrationSnapshots.time })
      .from(concentrationSnapshots)
      .where(eq(concentrationSnapshots.dimension, dimension))
      .groupBy(concentrationSnapshots.time)
      .orderBy(desc(concentrationSnapshots.time))
      .limit(2);
    if (times.length < 2) continue;

    const [latestHhi, prevHhi] = await Promise.all([
      db
        .select({ hhi: concentrationSnapshots.hhi })
        .from(concentrationSnapshots)
        .where(
          and(
            eq(concentrationSnapshots.dimension, dimension),
            eq(concentrationSnapshots.time, times[0].time),
          ),
        )
        .limit(1),
      db
        .select({ hhi: concentrationSnapshots.hhi })
        .from(concentrationSnapshots)
        .where(
          and(
            eq(concentrationSnapshots.dimension, dimension),
            eq(concentrationSnapshots.time, times[1].time),
          ),
        )
        .limit(1),
    ]);

    const current = latestHhi[0]?.hhi ?? null;
    const previous = prevHhi[0]?.hhi ?? null;
    // `time` is inferred nullable (groupBy), but guaranteed non-null in practice
    // as the group key. Guard anyway so a NULL never crashes the detector.
    const latestTime = times[0].time;
    const prevTime = times[1].time;
    if (current === null || previous === null || !latestTime || !prevTime) continue;

    const delta = current - previous;
    if (Math.abs(delta) < minJump) continue;

    out.push({
      type: 'hhi_jump',
      severity: severityFromHhiJump(Math.abs(delta)),
      bucket: `${dimension}:${latestTime.toISOString().slice(0, 13)}`,
      details: {
        dimension,
        delta: Number(delta.toFixed(2)),
        current_hhi: Number(current.toFixed(2)),
        previous_hhi: Number(previous.toFixed(2)),
        current_time: latestTime.toISOString(),
        previous_time: prevTime.toISOString(),
      },
    });
  }
  return out;
}

/**
 * Many new relays appearing in a single AS within a rolling window - a classic
 * Sybil signal. Reads `relay_history` (the hypertable), NOT the live `relays`
 * table, so relays that appeared *and already rotated away* inside the window
 * are still counted: a fingerprint is "new" if it has a history row inside the
 * window and none before it. Grouped by AS, flags any AS with ≥ `minRelays` new
 * fingerprints. `as_name` is looked up from the current relay set (best-effort).
 *
 * Needs a baseline: on a fresh deploy with less than `windowHours` of history
 * every relay looks "new", so detection is skipped until history predates the
 * window (avoids flagging the whole initial population as one Sybil burst).
 */
export async function detectRelayClustering(
  db: Database,
  opts: { windowHours?: number; minRelays?: number; limit?: number } = {},
): Promise<AnomalySpec[]> {
  const windowHours = opts.windowHours ?? DEFAULT_THRESHOLDS.clusterWindowHours;
  const minRelays = opts.minRelays ?? DEFAULT_THRESHOLDS.clusterMinRelays;
  const limit = opts.limit ?? 20;

  const baseline = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM relay_history
      WHERE time <= now() - (${windowHours} || ' hours')::interval
    ) AS has_baseline
  `);
  const hasBaseline = (baseline as unknown as Array<{ has_baseline: boolean }>)[0]?.has_baseline;
  if (!hasBaseline) return [];

  const result = await db.execute(sql`
    SELECT
      h.as_number,
      count(DISTINCT h.fingerprint)::int AS new_relays,
      (array_agg(DISTINCT h.fingerprint))[1:10] AS sample_fingerprints,
      array_agg(DISTINCT h.country) FILTER (WHERE h.country IS NOT NULL) AS countries,
      (SELECT r.as_name FROM relays r WHERE r.as_number = h.as_number LIMIT 1) AS as_name
    FROM relay_history h
    WHERE h.time > now() - (${windowHours} || ' hours')::interval
      AND h.as_number IS NOT NULL AND h.as_number <> ''
      AND NOT EXISTS (
        SELECT 1 FROM relay_history p
        WHERE p.fingerprint = h.fingerprint
          AND p.time <= now() - (${windowHours} || ' hours')::interval
      )
    GROUP BY h.as_number
    HAVING count(DISTINCT h.fingerprint) >= ${minRelays}
    ORDER BY new_relays DESC
    LIMIT ${limit}
  `);

  const rows = result as unknown as Array<{
    as_number: string;
    new_relays: number;
    sample_fingerprints: string[] | null;
    countries: string[] | null;
    as_name: string | null;
  }>;

  const day = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const count = Number(r.new_relays);
    return {
      type: 'as_cluster_new_relays',
      severity: severityFromCluster(count),
      bucket: `${r.as_number}:${day}`,
      details: {
        as_number: r.as_number,
        as_name: r.as_name,
        new_relays: count,
        window_hours: windowHours,
        countries: r.countries ?? [],
        sample_fingerprints: r.sample_fingerprints ?? [],
      },
    } satisfies AnomalySpec;
  });
}

/**
 * Relays whose *latest* consensus_weight is ≥ `multiple` × their **median
 * baseline** over the window AND grew by ≥ `minAbs` absolute - a sudden,
 * sustained weight gain (a relay buying its way up the path-selection ladder).
 *
 * The baseline is the **median** over `windowHours`, not the immediately
 * previous point (the old LAG approach): bandwidth-authority re-measurement
 * bounces the weight hour-to-hour, so comparing consecutive samples fired on
 * noise. The median absorbs single-hour spikes; a genuine doubling still clears
 * it. Relays with fewer than `minSamples` observations in the window are skipped
 * (too little history to tell signal from noise).
 *
 * Two further guards, both learned from the first real deploy, where this
 * detector produced 13 findings - 4 of them critical - within hours of launch
 * and mailed every one of them to the operator:
 *
 *  - `minBaseline`: a relay must already have carried real weight. An unmeasured
 *    relay sits at consensus weight 1, so the first time the bandwidth
 *    authorities measure it the ratio reads in the thousands. That is routine
 *    onboarding, indistinguishable in shape from an attack and vastly more
 *    common, so it is not reportable.
 *  - a full-window baseline, exactly as `detectRelayClustering` requires: a
 *    median over a partial window is not a median, it is whatever we happened to
 *    catch, and on a young instance the first poll becomes every relay's
 *    "before".
 *
 * The cost of both is a delay before the detector speaks on a new instance. That
 * is the correct trade: a monitor that cries wolf on day one is not trusted on
 * day two, and this one reports to people who act on it.
 */
export async function detectFastWeightGain(
  db: Database,
  opts: {
    multiple?: number;
    minAbs?: number;
    minBaseline?: number;
    windowHours?: number;
    minSamples?: number;
    limit?: number;
  } = {},
): Promise<AnomalySpec[]> {
  const multiple = opts.multiple ?? DEFAULT_THRESHOLDS.weightGainMultiple;
  const minAbs = opts.minAbs ?? DEFAULT_THRESHOLDS.weightGainMinAbs;
  const minBaseline = opts.minBaseline ?? DEFAULT_THRESHOLDS.weightGainMinBaseline;
  const windowHours = opts.windowHours ?? DEFAULT_THRESHOLDS.weightGainWindowHours;
  const minSamples = opts.minSamples ?? DEFAULT_THRESHOLDS.weightGainMinSamples;
  const limit = opts.limit ?? DEFAULT_THRESHOLDS.weightGainLimit;

  // Same baseline requirement `detectRelayClustering` makes, for the same
  // reason. The median is only meaningful over a FULL window; on an instance
  // younger than `windowHours` it is computed from whatever fraction exists, and
  // the very first poll becomes every relay's "before". Measured on the first
  // deploy: 6.9h of history against a 12h window produced 13 findings, 4 of them
  // critical, every one an artefact of not having been watching earlier. Skip
  // until there is history older than the window - it self-corrects.
  const baselineRow = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM relay_history
      WHERE time <= now() - (${windowHours} || ' hours')::interval
    ) AS has_baseline
  `);
  const hasBaseline = (baselineRow as unknown as Array<{ has_baseline: boolean }>)[0]?.has_baseline;
  if (!hasBaseline) return [];

  const rows = await db.execute(sql`
    WITH agg AS (
      SELECT
        fingerprint,
        count(*) AS samples,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY consensus_weight) AS baseline,
        (array_agg(consensus_weight ORDER BY time DESC))[1] AS current_weight,
        to_char(max(time) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS current_time,
        (array_agg(country ORDER BY time DESC))[1] AS country,
        (array_agg(as_number ORDER BY time DESC))[1] AS as_number
      FROM relay_history
      WHERE time > now() - (${windowHours} || ' hours')::interval
      GROUP BY fingerprint
    )
    SELECT fingerprint, samples, baseline, current_weight, current_time, country, as_number
    FROM agg
    WHERE samples >= ${minSamples}
      AND baseline >= ${minBaseline}
      AND current_weight >= baseline * ${multiple}
      AND current_weight - baseline >= ${minAbs}
    ORDER BY (current_weight - baseline) DESC
    LIMIT ${limit}
  `);

  const list = (
    rows as unknown as Array<{
      fingerprint: string;
      samples: number;
      baseline: number;
      current_weight: number;
      current_time: string;
      country: string | null;
      as_number: string | null;
    }>
  ).map((r) => {
    const baseline = Number(r.baseline);
    const current = Number(r.current_weight);
    const ratio = current / baseline;
    return {
      type: 'rapid_weight_gain',
      severity: severityFromWeightGain(ratio),
      bucket: `${r.fingerprint}:${r.current_time.slice(0, 13)}`,
      details: {
        fingerprint: r.fingerprint,
        current_weight: current,
        baseline_weight: Number(baseline.toFixed(1)),
        ratio: Number(ratio.toFixed(2)),
        samples: Number(r.samples),
        window_hours: windowHours,
        country: r.country,
        as_number: r.as_number,
        current_time: r.current_time,
      },
    } satisfies AnomalySpec;
  });
  return list;
}

// --- Orchestrator ---

/**
 * Run all detectors and persist new findings to `anomalies`.
 * Returns counts. The `sourceInstance` and `sources` fields are set from the
 * caller so the row carries provenance (same instance_id used by federation).
 *
 * Dedup: id = first 36 chars of sha256(type + bucket). Same finding within
 * the same bucket (e.g. same hour for HHI, same day for clustering) is
 * silently skipped via ON CONFLICT DO NOTHING.
 */
export async function detectAnomalies(
  db: Database,
  opts: { sourceInstance?: string; sources?: string[] } = {},
): Promise<DetectionSummary> {
  const [hhiJumps, clusters, weightGains] = await Promise.all([
    detectHhiJumps(db),
    detectRelayClustering(db),
    detectFastWeightGain(db),
  ]);
  const specs = [...hhiJumps, ...clusters, ...weightGains];
  return insertAnomalies(db, specs, opts);
}

/**
 * Persist a list of anomaly specs with deterministic, per-bucket dedup ids.
 * Shared by `detectAnomalies` and the consensus cross-check job so every
 * finding carries the same provenance (`sourceInstance` + `sources`) and the
 * same idempotency guarantee (ON CONFLICT DO NOTHING on the stable id).
 */
export async function insertAnomalies(
  db: Database,
  specs: AnomalySpec[],
  opts: { sourceInstance?: string; sources?: string[] } = {},
): Promise<DetectionSummary> {
  const perType: Record<string, number> = {};
  let inserted = 0;
  for (const spec of specs) {
    perType[spec.type] = (perType[spec.type] ?? 0) + 1;
    const id = stableId(spec.type, spec.bucket);
    const result = await db
      .insert(anomalies)
      .values({
        id,
        type: spec.type,
        severity: spec.severity,
        details: spec.details,
        sourceInstance: opts.sourceInstance,
        sources: opts.sources ?? [],
      })
      .onConflictDoNothing()
      .returning({ id: anomalies.id });
    if (result.length > 0) inserted += 1;
  }

  return { detected: specs.length, inserted, perType };
}

// --- Helpers ---

function stableId(type: string, bucket: string): string {
  return createHash('sha256').update(`${type}:${bucket}`).digest('hex').slice(0, 36);
}

function severityFromHhiJump(absDelta: number): Severity {
  if (absDelta >= 1000) return 'critical';
  if (absDelta >= 500) return 'high';
  if (absDelta >= 250) return 'medium';
  return 'low';
}

function severityFromCluster(count: number): Severity {
  if (count >= 100) return 'critical';
  if (count >= 50) return 'high';
  if (count >= 25) return 'medium';
  return 'low';
}

function severityFromWeightGain(ratio: number): Severity {
  if (ratio >= 20) return 'critical';
  if (ratio >= 10) return 'high';
  if (ratio >= 5) return 'medium';
  return 'low';
}
