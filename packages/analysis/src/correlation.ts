import type { DimensionResult } from './concentration';

/**
 * AS-level traffic-correlation risk - the real Tor threat model.
 *
 * An adversary that observes (or runs) BOTH the guard and the exit of a circuit
 * can correlate the traffic and deanonymize the user. If a single AS (or hoster,
 * or country) provides both ends, it can do this passively. For one entity `k`:
 *
 *   risk(k) = guardShare(k) × exitShare(k)
 *
 * i.e. the probability a random circuit picks a guard AND an exit both inside
 * `k`. Summed over all entities, `totalRisk` is the probability that SOME single
 * entity sees both ends of a random circuit - the network-wide correlation
 * exposure. Shares come from Onionoo path-selection probabilities (guard/exit
 * probability), the same weights Tor actually uses to build circuits.
 *
 * This is the network-wide complement to the per-operator `deanon_risk` in the
 * hidden-families module.
 */

export interface CorrelationKey {
  key: string;
  guardShare: number; // 0..1
  exitShare: number; // 0..1
  risk: number; // guardShare × exitShare
}

export interface CorrelationResult {
  dimension: string;
  /** Σ guardShare×exitShare - P(some single entity is on both ends of a circuit). */
  totalRisk: number;
  totalGuard: number;
  totalExit: number;
  top: CorrelationKey[];
}

/**
 * Pure post-processor over a computed dimension snapshot (computeDimension /
 * computeHoster / computeFamily). No DB access - pass in the DimensionResult.
 */
export function computeCorrelationRisk(
  result: DimensionResult,
  opts: { limit?: number } = {},
): CorrelationResult {
  const limit = opts.limit ?? 20;
  const totalGuard = result.totals.guard || 0;
  const totalExit = result.totals.exit || 0;

  const keys: CorrelationKey[] = result.keys.map((k) => {
    const guardShare = totalGuard > 0 ? k.guardSum / totalGuard : 0;
    const exitShare = totalExit > 0 ? k.exitSum / totalExit : 0;
    return { key: k.key, guardShare, exitShare, risk: guardShare * exitShare };
  });

  const totalRisk = keys.reduce((acc, k) => acc + k.risk, 0);
  const top = keys
    .filter((k) => k.risk > 0)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, limit);

  return { dimension: result.dimension, totalRisk, totalGuard, totalExit, top };
}
