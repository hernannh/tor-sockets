import {
  type NewAsOrg,
  type NewRelay,
  asOrg,
  concentrationSnapshots,
  relays,
} from '@tor-sockets/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  computeDimension,
  computeFamily,
  computeFamilyComponents,
  computeHoster,
  snapshotConcentration,
} from './concentration';
import { closeDb, getDb, resetTables } from './test/db';

beforeAll(getDb);
beforeEach(resetTables);
afterAll(closeDb);

/** Minimal relay row factory - only the NOT NULL columns are mandatory. */
function relay(o: Partial<NewRelay> & { fingerprint: string }): NewRelay {
  return {
    nickname: 'relay',
    firstSeen: new Date(),
    lastSeen: new Date(),
    running: true,
    consensusWeight: 0,
    ...o,
  };
}

async function insertRelays(rows: NewRelay[]): Promise<void> {
  for (const r of rows) await getDb().insert(relays).values(r);
}

async function insertAsOrg(rows: NewAsOrg[]): Promise<void> {
  for (const r of rows) await getDb().insert(asOrg).values(r);
}

describe('computeDimension - HHI', () => {
  it('computes shares over the weight with a known key, not over the whole network', async () => {
    // Pins the denominator, which is the single choice that decides what every
    // published share means. A relay with no country carries half the weight
    // here: if it counted toward the total, US and DE would be 25% each and the
    // index would read 1250 instead of 5000.
    await insertRelays([
      relay({ fingerprint: 'A', country: 'us', consensusWeight: 1000 }),
      relay({ fingerprint: 'B', country: 'de', consensusWeight: 1000 }),
      relay({ fingerprint: 'C', country: null, consensusWeight: 2000 }),
    ]);
    const r = await computeDimension(getDb(), 'country');
    expect(r.keys.map((k) => k.key).sort()).toEqual(['de', 'us']);
    expect(r.totals.consensusWeight).toBe(2000);
    expect(r.hhi.consensus).toBe(5000);
  });

  it('monopoly (single key) → HHI 10000', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', country: 'US', consensusWeight: 1000 }),
      relay({ fingerprint: 'B', country: 'US', consensusWeight: 1000 }),
    ]);
    const r = await computeDimension(getDb(), 'country');
    expect(r.keys).toHaveLength(1);
    expect(r.keys[0].key).toBe('US');
    expect(r.totals.consensusWeight).toBe(2000);
    expect(r.hhi.consensus).toBe(10000);
  });

  it('even split across 4 keys → HHI 2500', async () => {
    await insertRelays(
      ['US', 'DE', 'FR', 'BR'].map((c, i) =>
        relay({ fingerprint: `R${i}`, country: c, consensusWeight: 100 }),
      ),
    );
    const r = await computeDimension(getDb(), 'country');
    expect(r.keys).toHaveLength(4);
    expect(r.hhi.consensus).toBeCloseTo(2500, 5);
  });

  it('excludes NULL keys from buckets AND totals', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', country: 'DE', consensusWeight: 500 }),
      relay({ fingerprint: 'B', country: null, consensusWeight: 500 }),
    ]);
    const r = await computeDimension(getDb(), 'country');
    expect(r.keys).toHaveLength(1);
    expect(r.keys[0].key).toBe('DE');
    // null-country relay contributes nothing (grouped query filters isNotNull)
    expect(r.totals.consensusWeight).toBe(500);
    expect(r.hhi.consensus).toBe(10000);
  });

  it('excludes non-running relays', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', country: 'US', consensusWeight: 1000, running: true }),
      relay({ fingerprint: 'B', country: 'US', consensusWeight: 1000, running: false }),
    ]);
    const r = await computeDimension(getDb(), 'country');
    expect(r.keys[0].relayCount).toBe(1);
    expect(r.totals.consensusWeight).toBe(1000);
  });

  it('per-role HHI is computed from guard/middle/exit sums', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', country: 'US', consensusWeight: 100, guardProbability: '0.8' }),
      relay({ fingerprint: 'B', country: 'US', consensusWeight: 100, guardProbability: '0.2' }),
    ]);
    const r = await computeDimension(getDb(), 'country');
    expect(r.totals.guard).toBeCloseTo(1.0, 6);
    expect(r.hhi.guard).toBe(10000);
  });

  it('no relays → empty keys, zero totals, zero HHI', async () => {
    const r = await computeDimension(getDb(), 'country');
    expect(r.keys).toHaveLength(0);
    expect(r.totals.consensusWeight).toBe(0);
    expect(r.hhi.consensus).toBe(0);
  });

  it('propagates the `at` timestamp', async () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const r = await computeDimension(getDb(), 'country', { at });
    expect(r.at).toBe(at);
    expect(r.dimension).toBe('country');
  });
});

describe('snapshotConcentration', () => {
  it('inserts one row per (dimension, key) and returns a perDimension summary', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', country: 'US', consensusWeight: 100 }),
      relay({ fingerprint: 'B', country: 'DE', consensusWeight: 100 }),
    ]);
    const at = new Date('2026-01-01T00:00:00Z');
    const res = await snapshotConcentration(getDb(), { at, sources: ['onionoo'] });

    // only `country` has non-null keys; as/hoster produce 0 rows
    expect(res.inserted).toBe(2);
    expect(res.at).toBe(at);
    expect(res.perDimension.country.keys).toBe(2);
    expect(res.perDimension.country.hhi).toBeCloseTo(5000, 0);
    expect(res.perDimension.as).toEqual({ keys: 0, hhi: 0 });
    expect(res.perDimension.hoster).toEqual({ keys: 0, hhi: 0 });

    const rows = await getDb().select().from(concentrationSnapshots);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.dimension === 'country')).toBe(true);
    expect(rows.every((r) => r.sources?.includes('onionoo'))).toBe(true);
    expect(rows.every((r) => r.time.getTime() === at.getTime())).toBe(true);
  });

  it('persists family rows with dimension "family" and canonical fingerprint key', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 100, effectiveFamily: ['B'] }),
      relay({ fingerprint: 'B', consensusWeight: 100, effectiveFamily: ['A'] }),
    ]);
    const res = await snapshotConcentration(getDb(), { dimensions: ['family'] });
    expect(res.perDimension.family.keys).toBe(1);

    const rows = await getDb().select().from(concentrationSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0].dimension).toBe('family');
    expect(rows[0].key).toBe('A');
    expect(rows[0].relayCount).toBe(2);
  });

  it('respects the dimensions argument', async () => {
    await insertRelays([relay({ fingerprint: 'A', country: 'US', consensusWeight: 100 })]);
    const res = await snapshotConcentration(getDb(), { dimensions: ['country'] });
    expect(res.perDimension.country.keys).toBe(1);
    expect(res.perDimension.as).toBeUndefined();
  });

  it('empty relay set → inserted 0, all dimensions zero', async () => {
    const res = await snapshotConcentration(getDb());
    expect(res.inserted).toBe(0);
    for (const d of ['country', 'as', 'hoster'] as const) {
      expect(res.perDimension[d]).toEqual({ keys: 0, hhi: 0 });
    }
  });

  it('null role weight → pct column is NULL (guard total 0)', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', country: 'US', consensusWeight: 100, guardProbability: null }),
    ]);
    await snapshotConcentration(getDb());
    const [row] = await getDb().select().from(concentrationSnapshots);
    expect(row.guardWeightPct).toBeNull();
  });

  it('chunks inserts past the 500-row parameter cap (>500 keys)', async () => {
    const rels: NewRelay[] = Array.from({ length: 600 }, (_, i) =>
      relay({ fingerprint: `R${i}`, country: `C${i}`, consensusWeight: 1 }),
    );
    await insertRelays(rels);
    const res = await snapshotConcentration(getDb(), { dimensions: ['country'] });
    expect(res.inserted).toBe(600);
    const count = await getDb().execute(
      sql`SELECT count(*)::int AS n FROM concentration_snapshots`,
    );
    expect((count[0] as { n: number }).n).toBe(600);
  });
});

describe('computeFamily - concentration by operator family', () => {
  it('mutual family → one bucket of size 2, keyed by the smallest fingerprint', async () => {
    await insertRelays([
      relay({ fingerprint: 'Z', consensusWeight: 500, effectiveFamily: ['A'] }),
      relay({ fingerprint: 'A', consensusWeight: 500, effectiveFamily: ['Z'] }),
    ]);
    const r = await computeFamily(getDb());
    expect(r.dimension).toBe('family');
    expect(r.keys).toHaveLength(1);
    expect(r.keys[0].key).toBe('A'); // canonical = min fingerprint
    expect(r.keys[0].relayCount).toBe(2);
    expect(r.keys[0].consensusWeightSum).toBe(1000);
    expect(r.hhi.consensus).toBe(10000); // one family holds all weight
  });

  it('transitive family (A-B, B-C) collapses into one component of 3', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 100, effectiveFamily: ['B'] }),
      relay({ fingerprint: 'B', consensusWeight: 100, effectiveFamily: ['A', 'C'] }),
      relay({ fingerprint: 'C', consensusWeight: 100, effectiveFamily: ['B'] }),
    ]);
    const r = await computeFamily(getDb());
    expect(r.keys).toHaveLength(1);
    expect(r.keys[0].relayCount).toBe(3);
    expect(r.keys[0].key).toBe('A');
  });

  it('singletons count toward HHI + totals but are not surfaced as keys', async () => {
    await insertRelays(
      ['A', 'B', 'C', 'D'].map((fp) => relay({ fingerprint: fp, consensusWeight: 100 })),
    );
    const r = await computeFamily(getDb());
    expect(r.keys).toHaveLength(0); // no multi-relay family
    expect(r.totals.consensusWeight).toBe(400); // all four still in totals
    expect(r.hhi.consensus).toBeCloseTo(2500, 5); // four equal singletons
  });

  it('one family among singletons: HHI over ALL components, keys only the family', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 500, effectiveFamily: ['B'] }),
      relay({ fingerprint: 'B', consensusWeight: 500, effectiveFamily: ['A'] }),
      relay({ fingerprint: 'S', consensusWeight: 1000 }), // solo, equal weight to the family
    ]);
    const r = await computeFamily(getDb());
    expect(r.keys).toHaveLength(1);
    expect(r.keys[0].key).toBe('A');
    expect(r.keys[0].consensusWeightSum).toBe(1000);
    expect(r.totals.consensusWeight).toBe(2000);
    expect(r.hhi.consensus).toBeCloseTo(5000, 5); // {A,B}=0.5, {S}=0.5
  });

  it('family links to non-running / absent relays are ignored', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 100, effectiveFamily: ['B', 'GHOST'] }),
      relay({ fingerprint: 'B', consensusWeight: 100, effectiveFamily: ['A'], running: false }),
    ]);
    const r = await computeFamily(getDb());
    // B is not running and GHOST does not exist → A is a singleton → no families
    expect(r.keys).toHaveLength(0);
    expect(r.totals.consensusWeight).toBe(100);
    expect(r.totals.relays).toBe(1);
  });

  it('per-role HHI uses guard/middle/exit sums of the family', async () => {
    await insertRelays([
      relay({
        fingerprint: 'A',
        consensusWeight: 100,
        guardProbability: '0.4',
        effectiveFamily: ['B'],
      }),
      relay({
        fingerprint: 'B',
        consensusWeight: 100,
        guardProbability: '0.6',
        effectiveFamily: ['A'],
      }),
    ]);
    const r = await computeFamily(getDb());
    expect(r.totals.guard).toBeCloseTo(1.0, 6);
    expect(r.hhi.guard).toBe(10000); // the one family holds all guard weight
  });

  it('respects minFamilySize', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 100, effectiveFamily: ['B'] }),
      relay({ fingerprint: 'B', consensusWeight: 100, effectiveFamily: ['A'] }),
      relay({ fingerprint: 'S', consensusWeight: 100 }),
    ]);
    const r = await computeFamily(getDb(), { minFamilySize: 1 });
    expect(r.keys).toHaveLength(2); // the family + the singleton
  });

  it('no relays → empty keys, zero totals, zero HHI', async () => {
    const r = await computeFamily(getDb());
    expect(r.keys).toHaveLength(0);
    expect(r.totals.consensusWeight).toBe(0);
    expect(r.hhi.consensus).toBe(0);
  });
});

describe('computeHoster - concentration by PeeringDB org', () => {
  it('collapses multiple ASNs of the same org into one hoster bucket', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', asNumber: 'AS16276', asName: 'OVH', consensusWeight: 100 }),
      relay({ fingerprint: 'B', asNumber: 'AS35540', asName: 'OVH-CA', consensusWeight: 100 }),
    ]);
    await insertAsOrg([
      { asNumber: 'AS16276', orgId: '10', orgName: 'OVH SAS' },
      { asNumber: 'AS35540', orgId: '10', orgName: 'OVH SAS' },
    ]);
    const r = await computeHoster(getDb());
    expect(r.dimension).toBe('hoster');
    expect(r.keys).toHaveLength(1); // both ASNs → one org
    expect(r.keys[0].key).toBe('OVH SAS');
    expect(r.keys[0].relayCount).toBe(2);
    expect(r.keys[0].consensusWeightSum).toBe(200);
    expect(r.hhi.consensus).toBe(10000);
  });

  it('falls back to AS name when the ASN is not in PeeringDB', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', asNumber: 'AS999', asName: 'SomeHost', consensusWeight: 100 }),
    ]);
    const r = await computeHoster(getDb());
    expect(r.keys).toHaveLength(1);
    expect(r.keys[0].key).toBe('SomeHost');
  });

  it('mixes org-mapped and fallback relays without double counting', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', asNumber: 'AS16276', asName: 'OVH', consensusWeight: 100 }),
      relay({ fingerprint: 'B', asNumber: 'AS16276', asName: 'OVH', consensusWeight: 100 }),
      relay({ fingerprint: 'C', asNumber: 'AS999', asName: 'SomeHost', consensusWeight: 200 }),
    ]);
    await insertAsOrg([{ asNumber: 'AS16276', orgId: '10', orgName: 'OVH SAS' }]);
    const r = await computeHoster(getDb());
    expect(r.keys).toHaveLength(2);
    const byKey = Object.fromEntries(r.keys.map((k) => [k.key, k]));
    expect(byKey['OVH SAS'].relayCount).toBe(2);
    expect(byKey['OVH SAS'].consensusWeightSum).toBe(200);
    expect(byKey.SomeHost.consensusWeightSum).toBe(200);
    expect(r.hhi.consensus).toBeCloseTo(5000, 5); // two buckets, equal weight
  });

  it('excludes non-running relays', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', asNumber: 'AS16276', asName: 'OVH', consensusWeight: 100 }),
      relay({
        fingerprint: 'B',
        asNumber: 'AS16276',
        asName: 'OVH',
        consensusWeight: 100,
        running: false,
      }),
    ]);
    await insertAsOrg([{ asNumber: 'AS16276', orgId: '10', orgName: 'OVH SAS' }]);
    const r = await computeHoster(getDb());
    expect(r.keys[0].relayCount).toBe(1);
    expect(r.totals.consensusWeight).toBe(100);
  });

  it('no relays → empty keys, zero HHI', async () => {
    const r = await computeHoster(getDb());
    expect(r.keys).toHaveLength(0);
    expect(r.hhi.consensus).toBe(0);
  });
});

describe('computeFamilyComponents - family membership', () => {
  it('returns the member fingerprints of each family ≥ 2', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 100, effectiveFamily: ['B', 'C'] }),
      relay({ fingerprint: 'B', consensusWeight: 100, effectiveFamily: ['A', 'C'] }),
      relay({ fingerprint: 'C', consensusWeight: 100, effectiveFamily: ['A', 'B'] }),
      relay({ fingerprint: 'S', consensusWeight: 100 }), // singleton
    ]);
    const comps = await computeFamilyComponents(getDb());
    expect(comps).toHaveLength(1);
    expect(comps[0].key).toBe('A');
    expect([...comps[0].members].sort()).toEqual(['A', 'B', 'C']);
    expect(comps[0].relayCount).toBe(3);
  });

  it('excludes non-running members from the component', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 100, effectiveFamily: ['B'] }),
      relay({ fingerprint: 'B', consensusWeight: 100, effectiveFamily: ['A'], running: false }),
    ]);
    const comps = await computeFamilyComponents(getDb());
    expect(comps).toHaveLength(0); // A left as a singleton
  });

  it('sorts families by consensus weight desc', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 100, effectiveFamily: ['B'] }),
      relay({ fingerprint: 'B', consensusWeight: 100, effectiveFamily: ['A'] }),
      relay({ fingerprint: 'M', consensusWeight: 500, effectiveFamily: ['N'] }),
      relay({ fingerprint: 'N', consensusWeight: 500, effectiveFamily: ['M'] }),
    ]);
    const comps = await computeFamilyComponents(getDb());
    expect(comps.map((c) => c.key)).toEqual(['M', 'A']);
  });
});
