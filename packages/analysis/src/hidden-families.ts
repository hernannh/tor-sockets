import { parseContactInfo } from '@tor-sockets/api-contract';
import { type Database, relays } from '@tor-sockets/db';
import { eq } from 'drizzle-orm';
import { computeFamilyComponents } from './concentration';

/**
 * Hidden / undeclared operator families.
 *
 * Tor's family mechanism only protects circuits when relays *mutually* declare
 * each other (`effective_family`): path selection then refuses to use two of
 * them in one circuit. But an operator can run many relays and simply not
 * declare them as family - accidentally or deliberately. Path selection then
 * treats them as independent, so a single hidden operator can end up on both
 * the guard and the exit of the same circuit and correlate the traffic.
 *
 * We surface those hidden operators using the **contact string** as the operator
 * identity (operators set it; it's the strongest cheap signal), then flag any
 * contact whose relays are NOT a single declared family - i.e. they span two or
 * more `effective_family` components (or are undeclared singletons). The key
 * risk number is `deanonRisk = guardShare × exitShare`: the probability a random
 * circuit uses this one operator for BOTH ends.
 */

export interface HiddenFamilyCluster {
  /** Normalized operator contact (the grouping key). */
  contact: string;
  /** Operator has cryptographically proven contact ownership (Onionoo `proof:`). */
  verified: boolean;
  relays: number;
  /** Distinct declared `effective_family` components (size ≥ 2) in the group. */
  declaredFamilies: number;
  /** Size of each declared family within the group (largest first). */
  declaredFamilySizes: number[];
  /** Members that declare no family at all (singletons). */
  undeclaredRelays: number;
  consensusWeight: number;
  /** Share of network guard/middle/exit path-selection probability, as %. */
  guardPct: number;
  middlePct: number;
  exitPct: number;
  /** guardShare × exitShare - P(a random circuit uses this operator on both ends). */
  deanonRisk: number;
  /** Relay count per AS (largest first). */
  asBreakdown: { asNumber: string; relays: number }[];
  asNumbers: string[];
  countries: string[];
  sampleFingerprints: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

// Placeholder / default contacts that group unrelated operators - exclude so
// they don't create phantom "hidden operator" clusters.
const GENERIC_EXACT = new Set(['none', 'unnamed', 'n/a', 'na', '-', 'anonymous', 'nobody']);
const GENERIC_PATTERNS = [
  /example\s?(dot\s)?com/,
  /your@?email/,
  /nobody\s?(at|@)/,
  /random\s?person/,
  /email@example/,
];

/** Lowercase + collapse whitespace so trivially-different contacts still group. */
function normalizeContact(contact: string | null): string | null {
  if (!contact) return null;
  const c = contact.trim().toLowerCase().replace(/\s+/g, ' ');
  if (c.length < 3) return null;
  if (GENERIC_EXACT.has(c)) return null;
  if (GENERIC_PATTERNS.some((re) => re.test(c))) return null;
  return c;
}

export async function detectHiddenFamilies(
  db: Database,
  opts: { minRelays?: number; limit?: number } = {},
): Promise<HiddenFamilyCluster[]> {
  const minRelays = opts.minRelays ?? 5;
  const limit = opts.limit ?? 50;

  // Declared-family membership: fp → component key, plus each component's size.
  const components = await computeFamilyComponents(db, { minFamilySize: 1 });
  const fpToComp = new Map<string, string>();
  const compSize = new Map<string, number>();
  for (const c of components) {
    compSize.set(c.key, c.relayCount);
    for (const m of c.members) fpToComp.set(m, c.key);
  }

  const rows = await db
    .select({
      fingerprint: relays.fingerprint,
      contact: relays.contact,
      consensusWeight: relays.consensusWeight,
      guard: relays.guardProbability,
      middle: relays.middleProbability,
      exit: relays.exitProbability,
      asNumber: relays.asNumber,
      country: relays.country,
    })
    .from(relays)
    .where(eq(relays.running, true));

  // Network totals - path-selection probabilities sum to ~1 across the network.
  let netGuard = 0;
  let netMiddle = 0;
  let netExit = 0;
  for (const r of rows) {
    netGuard += num(r.guard);
    netMiddle += num(r.middle);
    netExit += num(r.exit);
  }

  type Row = (typeof rows)[number];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const c = normalizeContact(r.contact);
    if (!c) continue;
    const list = groups.get(c);
    if (list) list.push(r);
    else groups.set(c, [r]);
  }

  const out: HiddenFamilyCluster[] = [];
  for (const [contact, members] of groups) {
    if (members.length < minRelays) continue;

    const comps = new Set<string>();
    const compCounts = new Map<string, number>(); // component → members in this group
    let undeclared = 0;
    let cw = 0;
    let g = 0;
    let m = 0;
    let e = 0;
    const asCounts = new Map<string, number>();
    const countries = new Set<string>();

    for (const r of members) {
      const compKey = fpToComp.get(r.fingerprint) ?? r.fingerprint;
      comps.add(compKey);
      if ((compSize.get(compKey) ?? 1) >= 2) {
        compCounts.set(compKey, (compCounts.get(compKey) ?? 0) + 1);
      } else {
        undeclared += 1;
      }
      cw += r.consensusWeight ?? 0;
      g += num(r.guard);
      m += num(r.middle);
      e += num(r.exit);
      if (r.asNumber) asCounts.set(r.asNumber, (asCounts.get(r.asNumber) ?? 0) + 1);
      if (r.country) countries.add(r.country);
    }

    // Not hidden if the whole fleet is a single declared family.
    if (comps.size < 2) continue;

    const guardShare = netGuard > 0 ? g / netGuard : 0;
    const exitShare = netExit > 0 ? e / netExit : 0;
    const asBreakdown = [...asCounts.entries()]
      .map(([asNumber, relays]) => ({ asNumber, relays }))
      .sort((a, b) => b.relays - a.relays);

    out.push({
      contact,
      verified: parseContactInfo(contact).verified,
      relays: members.length,
      declaredFamilies: compCounts.size,
      declaredFamilySizes: [...compCounts.values()].sort((a, b) => b - a),
      undeclaredRelays: undeclared,
      consensusWeight: cw,
      guardPct: guardShare * 100,
      middlePct: netMiddle > 0 ? (m / netMiddle) * 100 : 0,
      exitPct: exitShare * 100,
      deanonRisk: guardShare * exitShare,
      asBreakdown,
      asNumbers: asBreakdown.map((a) => a.asNumber),
      countries: [...countries].sort(),
      sampleFingerprints: members.slice(0, 10).map((r) => r.fingerprint),
    });
  }

  return out
    .sort((a, b) => b.deanonRisk - a.deanonRisk || b.consensusWeight - a.consensusWeight)
    .slice(0, limit);
}
