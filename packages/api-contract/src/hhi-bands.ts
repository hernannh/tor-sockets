/**
 * How a raw HHI is turned into low / moderate / high.
 *
 * The thresholds are derived from the index itself rather than borrowed from an
 * institution's published bands. Borrowed thresholds age silently when their
 * source revises them, and they invite the reader to argue with the framing
 * instead of with the data.
 *
 * This definition needs no external authority, because it is what the index
 * already means. For N actors of equal size, each holds 100/N percent and
 *
 *     HHI = N × (100/N)² = 10000 / N
 *
 * so any HHI can be read back as **the number of equally-sized operators the
 * observed distribution is equivalent to**. The bands are round values of that
 * number, which is why they are defensible without citing anyone:
 *
 *   HHI < 1000   → 10 or more equivalent operators   → low
 *   1000 - 2000  → between 5 and 10                  → moderate
 *   HHI > 2000   → fewer than 5                      → high
 *
 * Fewer than five equivalent actors carrying a role is a small enough set that
 * losing or coercing them is a plausible operation, which is the same intuition
 * the Nakamoto coefficient reports discretely.
 */

export const HHI_SCALE_MAX = 10_000;

/** Band boundaries, expressed as the effective-actor counts they correspond to. */
export const HHI_BANDS = {
  /** Below this, the distribution is equivalent to 10+ actors. */
  moderate: 1000,
  /** Above this, fewer than 5 actors. */
  high: 2000,
} as const;

export type HhiBand = 'low' | 'moderate' | 'high';

export function hhiBand(hhi: number): HhiBand {
  if (hhi < HHI_BANDS.moderate) return 'low';
  if (hhi <= HHI_BANDS.high) return 'moderate';
  return 'high';
}

/**
 * The number of equally-sized operators the distribution is equivalent to.
 *
 * Returns `null` for a non-positive HHI: an empty or single-sample dimension has
 * no meaningful equivalent count, and reporting `Infinity` as "perfectly
 * decentralised" would be exactly backwards.
 */
export function effectiveActors(hhi: number): number | null {
  if (!Number.isFinite(hhi) || hhi <= 0) return null;
  return HHI_SCALE_MAX / hhi;
}

/** `2012` → `"~5 equivalent operators"`, for use next to a band label. */
export function describeHhi(hhi: number): string {
  const n = effectiveActors(hhi);
  if (n === null) return 'not enough data';
  const rounded = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return `~${rounded} equivalent operator${rounded === 1 ? '' : 's'}`;
}
