import { describe, expect, it } from 'vitest';
import { computeDecentralization } from './decentralization';

describe('computeDecentralization', () => {
  it('CRn = cumulative top-N share, order-independent', () => {
    const d = computeDecentralization([0.1, 0.4, 0.05, 0.3, 0.15]);
    expect(d.cr1).toBeCloseTo(0.4, 6);
    expect(d.cr3).toBeCloseTo(0.4 + 0.3 + 0.15, 6);
    expect(d.cr5).toBeCloseTo(1.0, 6);
  });

  it('Nakamoto = min entities to pass 50%', () => {
    // sorted: 0.4, 0.3, 0.2, 0.1 → 0.4 (no), +0.3=0.7 (>0.5) → 2
    expect(computeDecentralization([0.4, 0.3, 0.2, 0.1]).nakamoto).toBe(2);
    // one entity >50% → 1
    expect(computeDecentralization([0.6, 0.4]).nakamoto).toBe(1);
    // perfectly even 5-way → need 3 to pass 50%
    expect(computeDecentralization([0.2, 0.2, 0.2, 0.2, 0.2]).nakamoto).toBe(3);
  });

  it('ignores zero shares; 0.5 alone is not >50%', () => {
    const d = computeDecentralization([0.5, 0, 0.5, 0]);
    expect(d.cr3).toBeCloseTo(1.0, 6);
    // 0.5 is not strictly > 0.5, so it takes both to pass 50%.
    expect(d.nakamoto).toBe(2);
  });

  it('empty → zeros', () => {
    expect(computeDecentralization([])).toEqual({ cr1: 0, cr3: 0, cr5: 0, nakamoto: 0 });
  });
});
