import type {
  AnomalyCondition,
  ConcentrationShareCondition,
  HhiThresholdCondition,
} from '@tor-sockets/api-contract';
import { HHI_BANDS } from '@tor-sockets/api-contract';
import {
  type NewAnomaly,
  alertRules,
  anomalies as anomaliesTable,
  concentrationSnapshots,
} from '@tor-sockets/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { evaluateAlertRules } from './alerts';
import { closeDb, getDb, resetTables } from './test/db';

beforeAll(getDb);
beforeEach(resetTables);
afterAll(closeDb);

const now = Date.now();
const hour = 3600_000;
const iso = (msAgo: number) => new Date(now - msAgo);

// --- seed helpers ---

type RuleSeed = {
  id: string;
  ownerId?: string;
  name?: string;
  condition: unknown;
  channels?: string[];
  enabled?: boolean;
};

async function seedRule(r: RuleSeed): Promise<void> {
  await getDb()
    .insert(alertRules)
    .values({
      id: r.id,
      ownerId: r.ownerId ?? 'op-1',
      name: r.name ?? r.id,
      condition: r.condition,
      channels: r.channels ?? [],
      enabled: r.enabled ?? true,
    });
}

async function seedAnomaly(o: Partial<NewAnomaly> & { id: string; type: string }): Promise<void> {
  await getDb()
    .insert(anomaliesTable)
    .values({ severity: 'medium', details: {}, detectedAt: new Date(), ...o });
}

async function seedHhi(dimension: string, hhi: number, msAgo = hour): Promise<void> {
  await getDb()
    .insert(concentrationSnapshots)
    .values({
      time: iso(msAgo),
      dimension,
      key: 'K',
      relayCount: 1,
      hhi,
    });
}

async function seedShareRows(
  dimension: string,
  rows: Array<{ key: string; guard?: number | null; middle?: number | null; exit?: number | null }>,
): Promise<void> {
  const t = iso(hour);
  await getDb()
    .insert(concentrationSnapshots)
    .values(
      rows.map((r) => ({
        time: t,
        dimension,
        key: r.key,
        relayCount: 1,
        guardWeightPct: r.guard ?? null,
        middleWeightPct: r.middle ?? null,
        exitWeightPct: r.exit ?? null,
      })),
    );
}

// --- anomaly condition ---

describe('evaluateAlertRules - anomaly condition', () => {
  it('matches every recent anomaly and copies channels from the rule', async () => {
    await seedAnomaly({ id: 'a1', type: 'hhi_jump', severity: 'high' });
    const c: AnomalyCondition = { type: 'anomaly' };
    await seedRule({ id: 'r1', condition: c, channels: ['email:x@y', 'webhook:https://h'] });

    const [ev] = await evaluateAlertRules(getDb());
    expect(ev.ruleId).toBe('r1');
    expect(ev.sourceId).toBe('a1');
    expect(ev.severity).toBe('high');
    expect(ev.channels).toEqual(['email:x@y', 'webhook:https://h']);
    expect(ev.payload.anomaly_id).toBe('a1');
  });

  it('severityMin filters out lower-severity anomalies', async () => {
    await seedAnomaly({ id: 'a1', type: 'hhi_jump', severity: 'high' });
    await seedRule({
      id: 'r1',
      condition: { type: 'anomaly', severityMin: 'critical' } as AnomalyCondition,
    });
    expect(await evaluateAlertRules(getDb())).toHaveLength(0);
  });

  it('anomalyType filters by type', async () => {
    await seedAnomaly({ id: 'a1', type: 'hhi_jump' });
    await seedRule({
      id: 'r1',
      condition: { type: 'anomaly', anomalyType: 'as_cluster_new_relays' } as AnomalyCondition,
    });
    expect(await evaluateAlertRules(getDb())).toHaveLength(0);
  });

  it('excludes anomalies older than the 3h window', async () => {
    await seedAnomaly({ id: 'old', type: 'hhi_jump', detectedAt: iso(5 * hour) });
    await seedRule({ id: 'r1', condition: { type: 'anomaly' } });
    expect(await evaluateAlertRules(getDb())).toHaveLength(0);
  });

  it('formats titles per anomaly type', async () => {
    await seedAnomaly({
      id: 't1',
      type: 'hhi_jump',
      details: { dimension: 'as', delta: 500, current_hhi: 2000 },
    });
    await seedAnomaly({
      id: 't2',
      type: 'as_cluster_new_relays',
      details: { new_relays: 12, as_name: 'BadNet', as_number: 'AS999' },
    });
    await seedAnomaly({
      id: 't3',
      type: 'rapid_weight_gain',
      details: { fingerprint: 'ABCDEFGH1234', ratio: 3 },
    });
    await seedAnomaly({ id: 't4', type: 'weird_type', details: {} });
    await seedRule({ id: 'r1', condition: { type: 'anomaly' } });

    const events = await evaluateAlertRules(getDb());
    const titles = Object.fromEntries(events.map((e) => [e.payload.anomaly_id, e.title]));
    expect(titles.t1).toBe('HHI jump as: Δ500 (now 2000)');
    expect(titles.t2).toBe('12 new relays in BadNet (24h)');
    expect(titles.t3).toBe('ABCDEFGH weight ×3');
    expect(titles.t4).toBe('weird_type');
  });
});

// --- hhi_threshold condition ---

describe('evaluateAlertRules - hhi_threshold condition', () => {
  it('fires when the latest HHI crosses the threshold (severity high at ≥2500)', async () => {
    await seedHhi('country', 3000);
    const c: HhiThresholdCondition = {
      type: 'hhi_threshold',
      dimension: 'country',
      op: '>',
      value: 2500,
    };
    await seedRule({ id: 'r1', condition: c });

    const [ev] = await evaluateAlertRules(getDb());
    expect(ev.severity).toBe('high');
    expect(ev.payload.hhi).toBe(3000);
    expect(ev.sourceId).toMatch(/^hhi:country:/);
  });

  it('compare operators: > >= < <=', async () => {
    const ops: Array<[HhiThresholdCondition['op'], number, boolean]> = [
      ['>', 2500, true],
      ['>', 3000, false],
      ['>=', 3000, true],
      ['<', 2500, false],
      ['<=', 3001, true],
    ];
    for (const [op, value, shouldFire] of ops) {
      await resetTables();
      await seedHhi('country', 3000);
      await seedRule({
        id: 'r1',
        condition: {
          type: 'hhi_threshold',
          dimension: 'country',
          op,
          value,
        } as HhiThresholdCondition,
      });
      const events = await evaluateAlertRules(getDb());
      expect(events, `op=${op} value=${value}`).toHaveLength(shouldFire ? 1 : 0);
    }
  });

  it('no snapshot for the dimension → empty', async () => {
    await seedRule({
      id: 'r1',
      condition: {
        type: 'hhi_threshold',
        dimension: 'country',
        op: '>',
        value: 100,
      } as HhiThresholdCondition,
    });
    expect(await evaluateAlertRules(getDb())).toHaveLength(0);
  });

  it('severity follows the shared HHI bands', async () => {
    // Values chosen either side of the shared band boundaries rather than
    // literals: the policy lives in `hhi-bands.ts` and a test that restates it
    // is a second copy that can disagree with the first.
    for (const hhi of [HHI_BANDS.moderate - 1, HHI_BANDS.moderate, HHI_BANDS.high + 1]) {
      await resetTables();
      await seedHhi('country', hhi);
      await seedRule({
        id: 'r1',
        condition: {
          type: 'hhi_threshold',
          dimension: 'country',
          op: '>',
          value: 0,
        } as HhiThresholdCondition,
      });
      const [ev] = await evaluateAlertRules(getDb());
      const expected = hhi > HHI_BANDS.high ? 'high' : hhi >= HHI_BANDS.moderate ? 'medium' : 'low';
      expect(ev.severity, `hhi=${hhi}`).toBe(expected);
    }
  });
});

// --- concentration_share condition ---

describe('evaluateAlertRules - concentration_share condition', () => {
  it('without key → matches the top key for the role', async () => {
    await seedShareRows('country', [
      { key: 'US', guard: 50 },
      { key: 'DE', guard: 20 },
    ]);
    const c: ConcentrationShareCondition = {
      type: 'concentration_share',
      dimension: 'country',
      role: 'guard',
      op: '>',
      value: 30,
    };
    await seedRule({ id: 'r1', condition: c });
    const [ev] = await evaluateAlertRules(getDb());
    expect(ev.payload.key).toBe('US');
    expect(ev.payload.share).toBe(50);
    expect(ev.severity).toBe('high'); // ≥40
  });

  it('with key → evaluates that specific key', async () => {
    await seedShareRows('country', [
      { key: 'US', guard: 50 },
      { key: 'DE', guard: 35 },
    ]);
    const c: ConcentrationShareCondition = {
      type: 'concentration_share',
      dimension: 'country',
      key: 'DE',
      role: 'guard',
      op: '>',
      value: 30,
    };
    await seedRule({ id: 'r1', condition: c });
    const [ev] = await evaluateAlertRules(getDb());
    expect(ev.payload.key).toBe('DE');
    expect(ev.payload.share).toBe(35);
    expect(ev.severity).toBe('medium'); // ≥25
  });

  it('role selects the right column (exit)', async () => {
    await seedShareRows('country', [{ key: 'US', exit: 10 }]);
    const c: ConcentrationShareCondition = {
      type: 'concentration_share',
      dimension: 'country',
      role: 'exit',
      op: '>',
      value: 5,
    };
    await seedRule({ id: 'r1', condition: c });
    const [ev] = await evaluateAlertRules(getDb());
    expect(ev.payload.share).toBe(10);
    expect(ev.payload.role).toBe('exit');
  });

  it('skips keys with NULL share when finding the top', async () => {
    await seedShareRows('country', [
      { key: 'US', guard: null },
      { key: 'DE', guard: 40 },
    ]);
    const c: ConcentrationShareCondition = {
      type: 'concentration_share',
      dimension: 'country',
      role: 'guard',
      op: '>',
      value: 10,
    };
    await seedRule({ id: 'r1', condition: c });
    const [ev] = await evaluateAlertRules(getDb());
    expect(ev.payload.key).toBe('DE');
  });

  it('compare false → empty', async () => {
    await seedShareRows('country', [{ key: 'US', guard: 10 }]);
    const c: ConcentrationShareCondition = {
      type: 'concentration_share',
      dimension: 'country',
      role: 'guard',
      op: '>',
      value: 50,
    };
    await seedRule({ id: 'r1', condition: c });
    expect(await evaluateAlertRules(getDb())).toHaveLength(0);
  });
});

// --- orchestration ---

describe('evaluateAlertRules - orchestration', () => {
  it('returns [] when no enabled rules exist', async () => {
    expect(await evaluateAlertRules(getDb())).toEqual([]);
  });

  it('skips disabled rules', async () => {
    await seedHhi('country', 9000);
    await seedRule({
      id: 'r1',
      enabled: false,
      condition: {
        type: 'hhi_threshold',
        dimension: 'country',
        op: '>',
        value: 100,
      } as HhiThresholdCondition,
    });
    expect(await evaluateAlertRules(getDb())).toEqual([]);
  });

  it('skips malformed conditions (missing type)', async () => {
    await seedRule({ id: 'r1', condition: {} });
    expect(await evaluateAlertRules(getDb())).toEqual([]);
  });

  it('unknown condition type → evaluated but yields no events (switch default)', async () => {
    await seedRule({ id: 'r1', condition: { type: 'relay_flag_change' } });
    expect(await evaluateAlertRules(getDb())).toEqual([]);
  });

  it('evaluates multiple rules and aggregates their events', async () => {
    await seedHhi('country', 3000);
    await seedAnomaly({ id: 'a1', type: 'hhi_jump', severity: 'critical' });
    await seedRule({
      id: 'rh',
      condition: {
        type: 'hhi_threshold',
        dimension: 'country',
        op: '>',
        value: 2500,
      } as HhiThresholdCondition,
    });
    await seedRule({ id: 'ra', condition: { type: 'anomaly' } });
    const events = await evaluateAlertRules(getDb());
    expect(events.map((e) => e.ruleId).sort()).toEqual(['ra', 'rh']);
  });
});
