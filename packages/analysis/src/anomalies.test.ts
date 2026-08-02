import {
  type NewConcentrationSnapshot,
  type NewRelay,
  anomalies as anomaliesTable,
  concentrationSnapshots,
  relayHistory,
  relays,
} from '@tor-sockets/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  detectAnomalies,
  detectFastWeightGain,
  detectHhiJumps,
  detectRelayClustering,
} from './anomalies';
import { closeDb, getDb, resetTables } from './test/db';

beforeAll(getDb);
beforeEach(resetTables);
afterAll(closeDb);

const now = Date.now();
const hour = 3600_000;
const iso = (msAgo: number) => new Date(now - msAgo);

// --- seed helpers ---

function relay(o: Partial<NewRelay> & { fingerprint: string }): NewRelay {
  return {
    nickname: 'r',
    firstSeen: new Date(),
    lastSeen: new Date(),
    running: true,
    consensusWeight: 0,
    ...o,
  };
}

async function seedSnapshot(
  o: Partial<NewConcentrationSnapshot> & { time: Date; dimension: string; hhi: number },
): Promise<void> {
  await getDb()
    .insert(concentrationSnapshots)
    .values({ key: 'K', relayCount: 1, ...o });
}

async function seedRelays(rows: NewRelay[]): Promise<void> {
  // multi-row insert (cap batches to keep under the param limit)
  for (let i = 0; i < rows.length; i += 200)
    await getDb()
      .insert(relays)
      .values(rows.slice(i, i + 200));
}

// --- detectHhiJumps ---

describe('detectHhiJumps', () => {
  it('large positive jump → spec with high severity', async () => {
    await seedSnapshot({ time: iso(2 * hour), dimension: 'as', hhi: 1500 });
    await seedSnapshot({ time: iso(1 * hour), dimension: 'as', hhi: 2000 });
    const specs = await detectHhiJumps(getDb());
    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe('hhi_jump');
    expect(specs[0].severity).toBe('high');
    expect(specs[0].details.delta).toBe(500);
    expect(specs[0].details.dimension).toBe('as');
  });

  it('large negative jump is also flagged (|delta|)', async () => {
    await seedSnapshot({ time: iso(2 * hour), dimension: 'country', hhi: 2000 });
    await seedSnapshot({ time: iso(1 * hour), dimension: 'country', hhi: 1500 });
    const specs = await detectHhiJumps(getDb());
    expect(specs).toHaveLength(1);
    expect(specs[0].details.delta).toBe(-500);
  });

  it('below threshold (<100) → empty', async () => {
    await seedSnapshot({ time: iso(2 * hour), dimension: 'as', hhi: 1500 });
    await seedSnapshot({ time: iso(1 * hour), dimension: 'as', hhi: 1540 });
    expect(await detectHhiJumps(getDb())).toHaveLength(0);
  });

  it('single snapshot (no comparison) → empty', async () => {
    await seedSnapshot({ time: iso(1 * hour), dimension: 'as', hhi: 9000 });
    expect(await detectHhiJumps(getDb())).toHaveLength(0);
  });

  it('severity bands at the boundaries (250 med / 500 high / 1000 critical)', async () => {
    const cases: Array<{ delta: number; sev: string }> = [
      { delta: 250, sev: 'medium' },
      { delta: 500, sev: 'high' },
      { delta: 1000, sev: 'critical' },
    ];
    for (const { delta, sev } of cases) {
      await resetTables();
      await seedSnapshot({ time: iso(2 * hour), dimension: 'hoster', hhi: 1000 });
      await seedSnapshot({ time: iso(1 * hour), dimension: 'hoster', hhi: 1000 + delta });
      const specs = await detectHhiJumps(getDb(), { dimensions: ['hoster'] });
      expect(specs[0].severity, `delta=${delta}`).toBe(sev);
    }
  });

  it('delta of exactly 100 still triggers (boundary is <)', async () => {
    await seedSnapshot({ time: iso(2 * hour), dimension: 'as', hhi: 1000 });
    await seedSnapshot({ time: iso(1 * hour), dimension: 'as', hhi: 1100 });
    const specs = await detectHhiJumps(getDb(), { dimensions: ['as'] });
    expect(specs).toHaveLength(1);
    expect(specs[0].severity).toBe('low');
  });

  it('respects the dimensions filter', async () => {
    await seedSnapshot({ time: iso(2 * hour), dimension: 'as', hhi: 1000 });
    await seedSnapshot({ time: iso(1 * hour), dimension: 'as', hhi: 5000 });
    const specs = await detectHhiJumps(getDb(), { dimensions: ['country'] });
    expect(specs).toHaveLength(0);
  });
});

// --- detectRelayClustering ---

describe('detectRelayClustering', () => {
  /** Seed relay_history rows. Each entry = one (fingerprint, time) observation. */
  async function seedHistory(
    rows: Array<{ fp: string; msAgo: number; as?: string | null; country?: string | null }>,
  ): Promise<void> {
    const vals = rows.map((r) => ({
      time: iso(r.msAgo),
      fingerprint: r.fp,
      consensusWeight: 0,
      running: true,
      asNumber: r.as ?? null,
      country: r.country ?? null,
    }));
    for (let i = 0; i < vals.length; i += 200)
      await getDb()
        .insert(relayHistory)
        .values(vals.slice(i, i + 200));
  }

  /** One row older than the 24h window so the baseline guard passes. */
  const baseline = () => seedHistory([{ fp: 'BASELINE', msAgo: 72 * hour, as: 'AS0' }]);

  /** N fingerprints first appearing `msAgo` in the given AS (no earlier rows). */
  const burst = (prefix: string, n: number, as: string, msAgo = 1 * hour) =>
    seedHistory(Array.from({ length: n }, (_, i) => ({ fp: `${prefix}${i}`, msAgo, as })));

  it('≥10 new relays in one AS → spec (low severity), resolves as_name', async () => {
    await baseline();
    await burst('A', 12, 'AS999');
    // as_name comes from the current relay set (best-effort lookup).
    await seedRelays([relay({ fingerprint: 'A0', asNumber: 'AS999', asName: 'BadNet' })]);

    const specs = await detectRelayClustering(getDb());
    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe('as_cluster_new_relays');
    expect(specs[0].severity).toBe('low');
    expect(specs[0].details.new_relays).toBe(12);
    expect(specs[0].details.as_number).toBe('AS999');
    expect(specs[0].details.as_name).toBe('BadNet');
  });

  it('below threshold (<10) → empty', async () => {
    await baseline();
    await burst('A', 9, 'AS999');
    expect(await detectRelayClustering(getDb())).toHaveLength(0);
  });

  it('NULL / empty asNumber excluded', async () => {
    await baseline();
    await seedHistory([
      ...Array.from({ length: 12 }, (_, i) => ({ fp: `N${i}`, msAgo: hour, as: null })),
      ...Array.from({ length: 12 }, (_, i) => ({ fp: `E${i}`, msAgo: hour, as: '' })),
    ]);
    expect(await detectRelayClustering(getDb())).toHaveLength(0);
  });

  it('relays already present before the window are NOT counted as new', async () => {
    await baseline();
    // 12 relays each seen inside the window AND 48h ago → pre-existing, not new.
    await seedHistory(
      Array.from({ length: 12 }, (_, i) => ({ fp: `O${i}`, msAgo: hour, as: 'AS999' })),
    );
    await seedHistory(
      Array.from({ length: 12 }, (_, i) => ({ fp: `O${i}`, msAgo: 48 * hour, as: 'AS999' })),
    );
    expect(await detectRelayClustering(getDb())).toHaveLength(0);
  });

  it('counts relays that appeared AND already rotated away inside the window', async () => {
    await baseline();
    // 12 relays with a single observation 5h ago and none since - gone from the
    // live `relays` table, but still a Sybil burst in history. THIS is the fix.
    await burst('R', 12, 'AS666', 5 * hour);
    const specs = await detectRelayClustering(getDb());
    expect(specs).toHaveLength(1);
    expect(specs[0].details.as_number).toBe('AS666');
    expect(specs[0].details.new_relays).toBe(12);
  });

  it('skips detection when history has no baseline older than the window', async () => {
    // No baseline row → fresh-deploy guard: everything would look "new".
    await burst('A', 20, 'AS999');
    expect(await detectRelayClustering(getDb())).toHaveLength(0);
  });

  it('severity bands (25 med / 50 high / 100 critical)', async () => {
    await baseline();
    await burst('M', 25, 'AS1');
    await burst('H', 50, 'AS2');
    await burst('C', 100, 'AS3');
    const specs = await detectRelayClustering(getDb());
    const byAs = Object.fromEntries(specs.map((s) => [s.details.as_number, s.severity]));
    expect(byAs.AS1).toBe('medium');
    expect(byAs.AS2).toBe('high');
    expect(byAs.AS3).toBe('critical');
  });
});

// --- detectFastWeightGain ---

describe('detectFastWeightGain', () => {
  /**
   * Seed an hourly weight series (index 0 = oldest, last = most recent, 1h ago).
   *
   * Also drops one unrelated row older than the 12h window. The detector refuses
   * to run at all until the table holds history predating the window - a median
   * over a partial window is not a median - and every case here is about what it
   * reports once it IS running. That anchor relay never fires on its own: a
   * single sample is below `minSamples`.
   */
  async function seedSeries(fp: string, weights: number[]) {
    const n = weights.length;
    await getDb()
      .insert(relayHistory)
      .values([
        { time: iso(13 * hour), fingerprint: 'ANCHOR', consensusWeight: 5000, running: true },
        ...weights.map((w, i) => ({
          time: iso((n - i) * hour),
          fingerprint: fp,
          consensusWeight: w,
          running: true,
        })),
      ])
      .onConflictDoNothing();
  }

  it('sustained ≥2x over the median baseline AND ≥+1000 abs → spec', async () => {
    await seedSeries('FP1', [1000, 1000, 1000, 1000, 3000]); // median 1000, latest 3000
    const specs = await detectFastWeightGain(getDb());
    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe('rapid_weight_gain');
    expect(specs[0].details.current_weight).toBe(3000);
    expect(specs[0].details.baseline_weight).toBe(1000);
    expect(specs[0].details.ratio).toBe(3);
    expect(specs[0].details.samples).toBe(5);
    expect(specs[0].severity).toBe('low');
  });

  it('does NOT fire on a single-hour noise spike (median absorbs it)', async () => {
    // one hour jumped to 3000 then fell back - the old LAG detector fired here.
    await seedSeries('NOISE', [1000, 3000, 1000, 1000, 1100]); // median 1000, latest 1100
    expect(await detectFastWeightGain(getDb())).toHaveLength(0);
  });

  it('skips relays with fewer than minSamples observations', async () => {
    await seedSeries('SHORT', [1000, 1000, 3000]); // 3 samples, latest 3x median
    expect(await detectFastWeightGain(getDb())).toHaveLength(0);
    // same relay clears once it has enough history
    expect(await detectFastWeightGain(getDb(), { minSamples: 3 })).toHaveLength(1);
  });

  // Baselines stay at or above `minBaseline` (1000): below that a relay is
  // simply being measured for the first time, which the detector now ignores.
  it('severity bands by ratio (5 med / 10 high / 20 critical)', async () => {
    await seedSeries('R5', [1000, 1000, 1000, 1000, 5000]); // ratio 5
    await seedSeries('R10', [1000, 1000, 1000, 1000, 10000]); // ratio 10
    await seedSeries('R20', [1000, 1000, 1000, 1000, 20000]); // ratio 20
    const specs = await detectFastWeightGain(getDb());
    const byFp = Object.fromEntries(specs.map((s) => [s.details.fingerprint, s.severity]));
    expect(byFp.R5).toBe('medium');
    expect(byFp.R10).toBe('high');
    expect(byFp.R20).toBe('critical');
  });

  it('excludes sub-threshold gains (ratio <2 or abs <1000)', async () => {
    await seedSeries('LOWR', [1000, 1000, 1000, 1000, 1500]); // 1.5x
    await seedSeries('LOWA', [1000, 1000, 1000, 1000, 1900]); // +900 abs
    expect(await detectFastWeightGain(getDb())).toHaveLength(0);
  });

  // The bug that made this instance mail four "critical" findings on its first
  // afternoon. An unmeasured relay sits at consensus weight 1; the hour the
  // bandwidth authorities first measure it, the ratio reads in the thousands.
  it('ignores a relay being measured for the first time (tiny baseline)', async () => {
    await seedSeries('NEW1', [1, 1, 1, 1, 6800]); // ratio 6800 - real case observed
    await seedSeries('NEW2', [20, 20, 20, 20, 4900]); // ratio 245 - real case observed
    await seedSeries('NEW3', [72, 72, 72, 72, 1700]); // ratio 23.6 - real case observed
    expect(await detectFastWeightGain(getDb())).toHaveLength(0);

    // ...while a relay that already carried weight and doubled still reports.
    await seedSeries('REAL', [4400, 4400, 4400, 4400, 9900]);
    const specs = await detectFastWeightGain(getDb());
    expect(specs).toHaveLength(1);
    expect(specs[0].details.fingerprint).toBe('REAL');
  });

  // A median over a partial window is whatever we happened to catch, so the
  // first poll of a young instance would otherwise become every relay's
  // "before". Self-corrects once history outgrows the window.
  it('stays silent until history predates the window', async () => {
    // No anchor row here: nothing in the table is older than 12h.
    await getDb()
      .insert(relayHistory)
      .values(
        [4, 3, 2, 1].map((h, i) => ({
          time: iso(h * hour),
          fingerprint: 'YOUNG',
          consensusWeight: i === 3 ? 9000 : 1000,
          running: true,
        })),
      );
    expect(await detectFastWeightGain(getDb())).toHaveLength(0);

    // The same series reports once the instance has been running long enough.
    await getDb()
      .insert(relayHistory)
      .values([
        { time: iso(13 * hour), fingerprint: 'ANCHOR', consensusWeight: 5000, running: true },
      ]);
    expect(await detectFastWeightGain(getDb())).toHaveLength(1);
  });

  it('baseline ignores rows outside the window', async () => {
    // an old high sample (20h ago) must not pollute the 12h-window median.
    await getDb()
      .insert(relayHistory)
      .values([
        { time: iso(20 * hour), fingerprint: 'W', consensusWeight: 9000, running: true },
        { time: iso(4 * hour), fingerprint: 'W', consensusWeight: 1000, running: true },
        { time: iso(3 * hour), fingerprint: 'W', consensusWeight: 1000, running: true },
        { time: iso(2 * hour), fingerprint: 'W', consensusWeight: 1000, running: true },
        { time: iso(1 * hour), fingerprint: 'W', consensusWeight: 3000, running: true },
      ]);
    const specs = await detectFastWeightGain(getDb());
    expect(specs).toHaveLength(1);
    expect(specs[0].details.baseline_weight).toBe(1000); // 9000 excluded
    expect(specs[0].details.samples).toBe(4);
  });
});

// --- detectAnomalies (orchestrator) ---

describe('detectAnomalies', () => {
  it('dedupes: same finding within its bucket inserted once', async () => {
    await seedSnapshot({ time: iso(2 * hour), dimension: 'as', hhi: 1000 });
    await seedSnapshot({ time: iso(1 * hour), dimension: 'as', hhi: 5000 });

    const first = await detectAnomalies(getDb());
    expect(first.detected).toBe(1);
    expect(first.inserted).toBe(1);
    expect(first.perType.hhi_jump).toBe(1);

    const second = await detectAnomalies(getDb());
    expect(second.detected).toBe(1);
    expect(second.inserted).toBe(0); // ON CONFLICT DO NOTHING

    const rows = await getDb().select().from(anomaliesTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toHaveLength(36);
  });

  it('stores provenance (sourceInstance + sources)', async () => {
    await seedSnapshot({ time: iso(2 * hour), dimension: 'as', hhi: 1000 });
    await seedSnapshot({ time: iso(1 * hour), dimension: 'as', hhi: 5000 });
    await detectAnomalies(getDb(), { sourceInstance: 'inst-1', sources: ['onionoo', 'peer-a'] });

    const [row] = await getDb().select().from(anomaliesTable);
    expect(row.sourceInstance).toBe('inst-1');
    expect(row.sources).toEqual(['onionoo', 'peer-a']);
    expect(row.type).toBe('hhi_jump');
  });
});
