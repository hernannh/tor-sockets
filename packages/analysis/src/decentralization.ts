/**
 * Decentralization ratios for a set of market shares.
 *
 * Standard concentration measures used alongside HHI in network-decentralization
 * research:
 *  - **CRn** (concentration ratio) - cumulative share of the top N entities.
 *  - **Nakamoto coefficient** - the minimum number of entities that together
 *    control MORE than 50% of the resource. The smaller it is, the fewer actors
 *    it takes to dominate (or censor) that role. For Tor exit capacity a low
 *    Nakamoto coefficient is a direct centralization / resilience red flag.
 *
 * `shares` are fractions (0..1), typically summing to ~1. Order-independent.
 */

export interface Decentralization {
  cr1: number;
  cr3: number;
  cr5: number;
  nakamoto: number;
}

export function computeDecentralization(shares: number[]): Decentralization {
  const sorted = shares.filter((s) => s > 0).sort((a, b) => b - a);
  const crN = (n: number): number => sorted.slice(0, n).reduce((acc, s) => acc + s, 0);

  let cumulative = 0;
  let nakamoto = 0;
  for (const s of sorted) {
    cumulative += s;
    nakamoto += 1;
    if (cumulative > 0.5) break;
  }

  return {
    cr1: crN(1),
    cr3: crN(3),
    cr5: crN(5),
    nakamoto: sorted.length > 0 ? nakamoto : 0,
  };
}
