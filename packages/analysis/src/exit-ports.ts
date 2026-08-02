import { type Database, relays } from '@tor-sockets/db';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Exit port diversity - how many operators serve each security-relevant port.
 *
 * Tor exits publish an exit policy; not every exit allows every port. If only a
 * handful of relays (or ASes) allow a given port, traffic to that port is forced
 * through a tiny, easily-surveilled or easily-censored set of exits. This
 * computes, per curated port, how much exit capacity and how many distinct ASes
 * permit it - a low AS count is a censorship / surveillance red flag.
 */

export interface ExitPortDiversity {
  port: number;
  name: string;
  relays: number;
  asCount: number;
  /** Share of total exit path-selection probability that allows this port (%). */
  exitWeightPct: number;
}

const CURATED_PORTS: { port: number; name: string }[] = [
  { port: 443, name: 'HTTPS' },
  { port: 80, name: 'HTTP' },
  { port: 22, name: 'SSH' },
  { port: 25, name: 'SMTP' },
  { port: 587, name: 'Submission' },
  { port: 993, name: 'IMAPS' },
  { port: 5222, name: 'XMPP' },
  { port: 6667, name: 'IRC' },
  { port: 9001, name: 'Tor OR' },
  { port: 853, name: 'DoT' },
];

interface PolicySummary {
  accept?: string[];
  reject?: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/** Does the exit policy summary permit `port`? Mirrors the ingest-time derivation. */
function allowsPort(summary: PolicySummary | null, port: number): boolean {
  if (!summary) return false;
  const inRanges = (ranges: string[] | undefined): boolean => {
    if (!ranges) return false;
    for (const r of ranges) {
      const [lo, hi] = r.split('-');
      const low = Number.parseInt(lo, 10);
      const high = hi != null ? Number.parseInt(hi, 10) : low;
      if (Number.isFinite(low) && port >= low && port <= high) return true;
    }
    return false;
  };
  if (summary.accept) return inRanges(summary.accept);
  if (summary.reject) return !inRanges(summary.reject);
  return false;
}

export async function computeExitPortDiversity(db: Database): Promise<ExitPortDiversity[]> {
  const rows = (await db
    .select({
      summary: relays.exitPolicySummary,
      asNumber: relays.asNumber,
      exit: relays.exitProbability,
    })
    .from(relays)
    .where(and(eq(relays.running, true), sql`'Exit' = any(${relays.flags})`))) as Array<{
    summary: PolicySummary | null;
    asNumber: string | null;
    exit: string | null;
  }>;

  let netExit = 0;
  for (const r of rows) netExit += num(r.exit);

  return CURATED_PORTS.map(({ port, name }) => {
    let relayCount = 0;
    let exitProb = 0;
    const ases = new Set<string>();
    for (const r of rows) {
      if (allowsPort(r.summary, port)) {
        relayCount += 1;
        exitProb += num(r.exit);
        if (r.asNumber) ases.add(r.asNumber);
      }
    }
    return {
      port,
      name,
      relays: relayCount,
      asCount: ases.size,
      exitWeightPct: netExit > 0 ? (exitProb / netExit) * 100 : 0,
    };
  }).sort((a, b) => a.asCount - b.asCount || a.exitWeightPct - b.exitWeightPct);
}
