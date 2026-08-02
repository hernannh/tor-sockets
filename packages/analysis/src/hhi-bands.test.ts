import { HHI_BANDS, describeHhi, effectiveActors, hhiBand } from '@tor-sockets/api-contract';
import { describe, expect, it } from 'vitest';

describe('effectiveActors', () => {
  it('inverts the identity the bands are built on: N equal actors give HHI 10000/N', () => {
    for (const n of [2, 4, 5, 10, 20]) {
      const share = 100 / n;
      const hhi = n * share ** 2;
      expect(effectiveActors(hhi)).toBeCloseTo(n, 6);
    }
  });

  it('has no answer for an empty dimension rather than reporting perfect diversity', () => {
    expect(effectiveActors(0)).toBeNull();
    expect(effectiveActors(-1)).toBeNull();
    expect(effectiveActors(Number.NaN)).toBeNull();
  });
});

describe('hhiBand', () => {
  it('splits at 10 and 5 equivalent actors', () => {
    expect(hhiBand(999)).toBe('low');
    expect(hhiBand(HHI_BANDS.moderate)).toBe('moderate');
    expect(hhiBand(HHI_BANDS.high)).toBe('moderate');
    expect(hhiBand(HHI_BANDS.high + 1)).toBe('high');
  });

  it('reads real network values the way the copy claims', () => {
    // Measured on the live network, 2026-07-25.
    expect(hhiBand(513)).toBe('low'); // AS, consensus weight
    expect(hhiBand(1455)).toBe('moderate'); // country, consensus weight
    expect(hhiBand(2012)).toBe('high'); // country, exit weight only
  });

  it('calls a monopoly high', () => {
    expect(hhiBand(10_000)).toBe('high');
  });
});

describe('describeHhi', () => {
  it('translates the index back into operators', () => {
    expect(describeHhi(2000)).toBe('~5 equivalent operators');
    expect(describeHhi(10_000)).toBe('~1 equivalent operator');
    expect(describeHhi(500)).toBe('~20 equivalent operators');
  });

  it('keeps one decimal where the count is small enough for it to matter', () => {
    expect(describeHhi(2012)).toBe('~5 equivalent operators');
    expect(describeHhi(1455)).toBe('~6.9 equivalent operators');
  });

  it('says so when there is nothing to describe', () => {
    expect(describeHhi(0)).toBe('not enough data');
  });
});
