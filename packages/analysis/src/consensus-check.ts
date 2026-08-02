import { type Database, relays } from '@tor-sockets/db';
import { and, inArray, sql } from 'drizzle-orm';
import type { AnomalySpec, Severity } from './anomalies';

/**
 * Consensus cross-check.
 *
 * Everything downstream derives from Onionoo. Onionoo is reliable (CC0, Tor
 * Project) but it is a *single* upstream - we never verify it against the raw,
 * directory-authority-signed consensus. This module does exactly that: given a
 * freshly parsed raw consensus, it compares `consensus_weight` and flags per
 * fingerprint against the Onionoo-derived `relays` table and:
 *
 *  1. **Confirms provenance** - relays whose weight+flags agree with the raw
 *     consensus get `'consensus'` appended to `relays.sources[]`. The datum is
 *     now cross-verified, not just Onionoo-asserted ("derivados auditables").
 *  2. **Flags divergence** - relays whose weight drifts beyond tolerance, whose
 *     key flags disagree, or that appear in only one of the two sources are
 *     collected into a single `consensus_divergence` anomaly (severity scales
 *     with the diverging fraction). Individual per-relay rows would flood on
 *     normal Onionoo/consensus lag, so we aggregate.
 *
 * The comparison is a pure function of (relays table, supplied consensus); the
 * network fetch lives in the ingestion job that calls this.
 */

/** Minimal shape needed from a parsed raw consensus entry. */
export interface ConsensusRelay {
  fingerprint: string;
  consensusWeight: number;
  flags: string[];
  running: boolean;
}

export interface CrossCheckOptions {
  /** Relative weight tolerance (|Δ|/consensus) before it counts as divergence. */
  weightTolerance?: number;
  /** Absolute weight floor - small relays below this Δ are never flagged. */
  weightMinAbs?: number;
  /** Flags that matter for the threat model; others (V2Dir, etc.) are ignored. */
  keyFlags?: readonly string[];
  /** `valid-after` of the consensus, used for the anomaly dedup bucket. */
  validAfter?: Date;
  /** Max diverging relays embedded in the anomaly details. */
  sampleLimit?: number;
}

export interface CrossCheckResult {
  specs: AnomalySpec[];
  checked: number;
  confirmed: number;
  diverged: number;
  weightDiverged: number;
  flagDiverged: number;
  missingInConsensus: number;
  onlyInConsensus: number;
}

const DEFAULTS = {
  weightTolerance: 0.2,
  weightMinAbs: 500,
  keyFlags: ['Guard', 'Exit', 'Fast', 'Stable', 'HSDir', 'Authority', 'BadExit'] as const,
  sampleLimit: 20,
} as const;

interface DivergenceSample {
  fingerprint: string;
  reason: 'weight' | 'flags' | 'weight+flags';
  onionoo_weight: number;
  consensus_weight: number;
  delta_pct: number;
  flag_diff: string[];
}

/**
 * Cross-check the raw consensus against the Onionoo-derived relays table.
 * Updates `relays.sources[]` (adds/removes `'consensus'`) and returns the
 * divergence anomaly specs plus counters. Idempotent w.r.t. `sources[]`.
 */
export async function crossCheckConsensus(
  db: Database,
  consensus: ConsensusRelay[],
  opts: CrossCheckOptions = {},
): Promise<CrossCheckResult> {
  const weightTolerance = opts.weightTolerance ?? DEFAULTS.weightTolerance;
  const weightMinAbs = opts.weightMinAbs ?? DEFAULTS.weightMinAbs;
  const keyFlags = opts.keyFlags ?? DEFAULTS.keyFlags;
  const sampleLimit = opts.sampleLimit ?? DEFAULTS.sampleLimit;

  // Onionoo's current running view.
  const rows = (await db.execute(sql`
    SELECT fingerprint, consensus_weight, flags
    FROM relays
    WHERE running = true
  `)) as unknown as Array<{ fingerprint: string; consensus_weight: number; flags: string[] }>;

  const consensusMap = new Map<string, ConsensusRelay>();
  for (const c of consensus) {
    if (c.running) consensusMap.set(c.fingerprint, c);
  }
  const onionooFps = new Set(rows.map((r) => r.fingerprint));

  const confirmed: string[] = [];
  const divergedFps: string[] = [];
  const samples: DivergenceSample[] = [];
  let weightDiverged = 0;
  let flagDiverged = 0;
  let missingInConsensus = 0;

  for (const r of rows) {
    const c = consensusMap.get(r.fingerprint);
    if (!c) {
      // Onionoo says running, raw consensus does not list it (likely poll lag).
      missingInConsensus += 1;
      divergedFps.push(r.fingerprint);
      if (samples.length < sampleLimit) {
        samples.push({
          fingerprint: r.fingerprint,
          reason: 'weight',
          onionoo_weight: Number(r.consensus_weight),
          consensus_weight: 0,
          delta_pct: 100,
          flag_diff: ['missing_in_consensus'],
        });
      }
      continue;
    }

    const oW = Number(r.consensus_weight);
    const cW = c.consensusWeight;
    const absDelta = Math.abs(oW - cW);
    const relDelta = absDelta / Math.max(cW, 1);
    const wDiverged = relDelta > weightTolerance && absDelta > weightMinAbs;

    const oFlags = new Set((r.flags ?? []).filter((f) => keyFlags.includes(f)));
    const cFlags = new Set(c.flags.filter((f) => keyFlags.includes(f)));
    const flagDiff = symmetricDiff(oFlags, cFlags);
    const fDiverged = flagDiff.length > 0;

    if (wDiverged) weightDiverged += 1;
    if (fDiverged) flagDiverged += 1;

    if (wDiverged || fDiverged) {
      divergedFps.push(r.fingerprint);
      if (samples.length < sampleLimit) {
        samples.push({
          fingerprint: r.fingerprint,
          reason: wDiverged && fDiverged ? 'weight+flags' : wDiverged ? 'weight' : 'flags',
          onionoo_weight: oW,
          consensus_weight: cW,
          delta_pct: Math.round(relDelta * 1000) / 10,
          flag_diff: flagDiff,
        });
      }
    } else {
      confirmed.push(r.fingerprint);
    }
  }

  // Present in the raw consensus (running) but not in Onionoo's running set.
  let onlyInConsensus = 0;
  for (const fp of consensusMap.keys()) {
    if (!onionooFps.has(fp)) onlyInConsensus += 1;
  }

  const checked = rows.length;
  const diverged = divergedFps.length;

  await applySourceMarkers(db, confirmed, divergedFps);

  const specs: AnomalySpec[] = [];
  if (weightDiverged + flagDiverged + missingInConsensus > 0) {
    const validAfter = opts.validAfter ?? new Date();
    specs.push({
      type: 'consensus_divergence',
      severity: severityFromDivergence(diverged, checked, flagDiverged),
      bucket: validAfter.toISOString().slice(0, 13), // hour bucket
      details: {
        checked,
        confirmed: confirmed.length,
        diverged,
        weight_diverged: weightDiverged,
        flag_diverged: flagDiverged,
        missing_in_consensus: missingInConsensus,
        only_in_consensus: onlyInConsensus,
        diverged_fraction: checked > 0 ? Math.round((diverged / checked) * 1000) / 1000 : 0,
        tolerance: { relative: weightTolerance, min_abs: weightMinAbs },
        valid_after: validAfter.toISOString(),
        samples,
      },
    });
  }

  return {
    specs,
    checked,
    confirmed: confirmed.length,
    diverged,
    weightDiverged,
    flagDiverged,
    missingInConsensus,
    onlyInConsensus,
  };
}

/**
 * Add `'consensus'` to the confirmed relays' `sources[]` (once) and strip it
 * from diverged relays so a stale confirmation never lingers. Two set-based
 * UPDATEs - each fingerprint list is bound as a single array parameter.
 */
async function applySourceMarkers(
  db: Database,
  confirmed: string[],
  diverged: string[],
): Promise<void> {
  if (confirmed.length > 0) {
    await db
      .update(relays)
      .set({ sources: sql`array_append(${relays.sources}, 'consensus')` })
      .where(
        and(
          inArray(relays.fingerprint, confirmed),
          sql`NOT ('consensus' = ANY(${relays.sources}))`,
        ),
      );
  }
  if (diverged.length > 0) {
    await db
      .update(relays)
      .set({ sources: sql`array_remove(${relays.sources}, 'consensus')` })
      .where(and(inArray(relays.fingerprint, diverged), sql`'consensus' = ANY(${relays.sources})`));
  }
}

function symmetricDiff(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const x of a) if (!b.has(x)) out.push(`-${x}`);
  for (const x of b) if (!a.has(x)) out.push(`+${x}`);
  return out.sort();
}

function severityFromDivergence(diverged: number, checked: number, flagDiverged: number): Severity {
  const frac = checked > 0 ? diverged / checked : 0;
  if (frac >= 0.2) return 'high';
  if (frac >= 0.1) return 'medium';
  if (frac >= 0.03 || flagDiverged > 0) return 'low';
  return 'info';
}
