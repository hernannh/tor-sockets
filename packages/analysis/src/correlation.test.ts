import { describe, expect, it } from 'vitest';
import type { DimensionResult } from './concentration';
import { computeCorrelationRisk } from './correlation';

// Pure function - no DB. Build a minimal DimensionResult by hand.
function result(
  keys: { key: string; guardSum: number; exitSum: number }[],
  totals: { guard: number; exit: number },
): DimensionResult {
  return {
    dimension: 'as',
    at: new Date(0),
    keys: keys.map((k) => ({
      key: k.key,
      relayCount: 1,
      consensusWeightSum: 0,
      guardSum: k.guardSum,
      middleSum: 0,
      exitSum: k.exitSum,
    })),
    totals: {
      consensusWeight: 0,
      guard: totals.guard,
      middle: 0,
      exit: totals.exit,
      relays: keys.length,
    },
    hhi: { consensus: 0, guard: 0, middle: 0, exit: 0 },
  };
}

describe('computeCorrelationRisk', () => {
  it('risk = guardShare × exitShare, total is the sum, top sorted desc', () => {
    const r = computeCorrelationRisk(
      result(
        [
          { key: 'A', guardSum: 0.6, exitSum: 0.1 },
          { key: 'B', guardSum: 0.4, exitSum: 0.9 },
        ],
        { guard: 1, exit: 1 },
      ),
    );
    expect(r.top[0]).toMatchObject({ key: 'B' });
    expect(r.top[0].risk).toBeCloseTo(0.36, 6); // 0.4 × 0.9
    expect(r.top[1].risk).toBeCloseTo(0.06, 6); // 0.6 × 0.1
    expect(r.totalRisk).toBeCloseTo(0.42, 6);
  });

  it('normalizes shares against totals (not raw sums)', () => {
    const r = computeCorrelationRisk(
      result([{ key: 'A', guardSum: 5, exitSum: 5 }], { guard: 10, exit: 20 }),
    );
    expect(r.top[0].guardShare).toBeCloseTo(0.5, 6);
    expect(r.top[0].exitShare).toBeCloseTo(0.25, 6);
    expect(r.top[0].risk).toBeCloseTo(0.125, 6);
  });

  it('zero exit capacity → zero risk, excluded from top', () => {
    const r = computeCorrelationRisk(
      result([{ key: 'A', guardSum: 1, exitSum: 0 }], { guard: 1, exit: 0 }),
    );
    expect(r.totalRisk).toBe(0);
    expect(r.top).toHaveLength(0);
  });

  it('respects the limit', () => {
    const keys = Array.from({ length: 30 }, (_, i) => ({
      key: `K${i}`,
      guardSum: 1,
      exitSum: 1,
    }));
    const r = computeCorrelationRisk(result(keys, { guard: 30, exit: 30 }), { limit: 5 });
    expect(r.top).toHaveLength(5);
  });
});
