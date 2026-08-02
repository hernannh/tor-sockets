import { type NewRelay, relays } from '@tor-sockets/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ConsensusRelay, crossCheckConsensus } from './consensus-check';
import { closeDb, getDb, resetTables } from './test/db';

beforeAll(getDb);
beforeEach(resetTables);
afterAll(closeDb);

function relay(o: Partial<NewRelay> & { fingerprint: string }): NewRelay {
  return {
    nickname: 'relay',
    firstSeen: new Date(),
    lastSeen: new Date(),
    running: true,
    consensusWeight: 0,
    flags: [],
    sources: ['onionoo'],
    ...o,
  };
}

async function insertRelays(rows: NewRelay[]): Promise<void> {
  for (const r of rows) await getDb().insert(relays).values(r);
}

function cRelay(o: Partial<ConsensusRelay> & { fingerprint: string }): ConsensusRelay {
  return { consensusWeight: 0, flags: ['Running'], running: true, ...o };
}

async function sourcesOf(fp: string): Promise<string[]> {
  const rows = (await getDb().execute(
    sql`SELECT sources FROM relays WHERE fingerprint = ${fp}`,
  )) as unknown as Array<{ sources: string[] }>;
  return rows[0]?.sources ?? [];
}

const va = new Date('2026-07-07T12:00:00Z');

describe('crossCheckConsensus - agreement', () => {
  it('matching weight+flags → confirmed, appends consensus to sources, no anomaly', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 1000, flags: ['Running', 'Guard', 'Fast'] }),
    ]);
    const res = await crossCheckConsensus(
      getDb(),
      [cRelay({ fingerprint: 'A', consensusWeight: 1000, flags: ['Running', 'Guard', 'Fast'] })],
      { validAfter: va },
    );
    expect(res.confirmed).toBe(1);
    expect(res.diverged).toBe(0);
    expect(res.specs).toHaveLength(0);
    expect(await sourcesOf('A')).toEqual(['onionoo', 'consensus']);
  });

  it('weight within tolerance → still confirmed', async () => {
    // 1000 vs 1100 = 10% rel, but abs 100 < 500 floor → not diverged.
    await insertRelays([relay({ fingerprint: 'A', consensusWeight: 1000, flags: ['Running'] })]);
    const res = await crossCheckConsensus(
      getDb(),
      [cRelay({ fingerprint: 'A', consensusWeight: 1100 })],
      { validAfter: va },
    );
    expect(res.confirmed).toBe(1);
    expect(res.diverged).toBe(0);
  });

  it('appending consensus is idempotent (running twice)', async () => {
    await insertRelays([relay({ fingerprint: 'A', consensusWeight: 1000 })]);
    const c = [cRelay({ fingerprint: 'A', consensusWeight: 1000 })];
    await crossCheckConsensus(getDb(), c, { validAfter: va });
    await crossCheckConsensus(getDb(), c, { validAfter: va });
    expect(await sourcesOf('A')).toEqual(['onionoo', 'consensus']);
  });
});

describe('crossCheckConsensus - divergence', () => {
  it('weight beyond tolerance → diverged, no consensus marker, anomaly with sample', async () => {
    await insertRelays([relay({ fingerprint: 'A', consensusWeight: 5000, flags: ['Running'] })]);
    const res = await crossCheckConsensus(
      getDb(),
      [cRelay({ fingerprint: 'A', consensusWeight: 1000 })],
      { validAfter: va },
    );
    expect(res.weightDiverged).toBe(1);
    expect(res.diverged).toBe(1);
    expect(res.confirmed).toBe(0);
    expect(await sourcesOf('A')).toEqual(['onionoo']);
    expect(res.specs).toHaveLength(1);
    const s = res.specs[0];
    expect(s.type).toBe('consensus_divergence');
    expect(s.bucket).toBe('2026-07-07T12');
    const details = s.details as { samples: Array<{ fingerprint: string; reason: string }> };
    expect(details.samples[0]).toMatchObject({ fingerprint: 'A', reason: 'weight' });
  });

  it('flag mismatch on key flag → diverged with flag_diff', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 1000, flags: ['Running', 'Guard'] }),
    ]);
    const res = await crossCheckConsensus(
      getDb(),
      [cRelay({ fingerprint: 'A', consensusWeight: 1000, flags: ['Running', 'Exit'] })],
      { validAfter: va },
    );
    expect(res.flagDiverged).toBe(1);
    const details = res.specs[0].details as {
      samples: Array<{ flag_diff: string[]; reason: string }>;
    };
    expect(details.samples[0].reason).toBe('flags');
    expect(details.samples[0].flag_diff).toEqual(['+Exit', '-Guard']);
  });

  it('non-key flag differences are ignored (V2Dir etc.)', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 1000, flags: ['Running', 'V2Dir'] }),
    ]);
    const res = await crossCheckConsensus(
      getDb(),
      [cRelay({ fingerprint: 'A', consensusWeight: 1000, flags: ['Running'] })],
      { validAfter: va },
    );
    expect(res.diverged).toBe(0);
    expect(res.confirmed).toBe(1);
  });

  it('stale consensus marker is stripped when a relay starts diverging', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', consensusWeight: 5000, sources: ['onionoo', 'consensus'] }),
    ]);
    const res = await crossCheckConsensus(
      getDb(),
      [cRelay({ fingerprint: 'A', consensusWeight: 1000 })],
      { validAfter: va },
    );
    expect(res.diverged).toBe(1);
    expect(await sourcesOf('A')).toEqual(['onionoo']);
  });
});

describe('crossCheckConsensus - set membership', () => {
  it('running in Onionoo but absent from consensus → missing_in_consensus, diverged', async () => {
    await insertRelays([relay({ fingerprint: 'A', consensusWeight: 1000 })]);
    const res = await crossCheckConsensus(getDb(), [], { validAfter: va });
    expect(res.missingInConsensus).toBe(1);
    expect(res.diverged).toBe(1);
    const details = res.specs[0].details as {
      missing_in_consensus: number;
      samples: Array<{ flag_diff: string[] }>;
    };
    expect(details.missing_in_consensus).toBe(1);
    expect(details.samples[0].flag_diff).toEqual(['missing_in_consensus']);
  });

  it('running in consensus but absent from Onionoo → only_in_consensus, no false confirm', async () => {
    await insertRelays([relay({ fingerprint: 'A', consensusWeight: 1000 })]);
    const res = await crossCheckConsensus(
      getDb(),
      [
        cRelay({ fingerprint: 'A', consensusWeight: 1000 }),
        cRelay({ fingerprint: 'GHOST', consensusWeight: 2000 }),
      ],
      { validAfter: va },
    );
    expect(res.onlyInConsensus).toBe(1);
    expect(res.confirmed).toBe(1);
    expect(res.specs).toHaveLength(0); // only_in_consensus alone doesn't raise an anomaly
  });

  it('non-running Onionoo relays are not checked', async () => {
    await insertRelays([relay({ fingerprint: 'A', running: false, consensusWeight: 1000 })]);
    const res = await crossCheckConsensus(getDb(), [], { validAfter: va });
    expect(res.checked).toBe(0);
    expect(res.specs).toHaveLength(0);
  });

  it('severity scales with diverging fraction', async () => {
    // 10 relays, 3 diverge on weight → 30% → high.
    const rows: NewRelay[] = Array.from({ length: 10 }, (_, i) =>
      relay({ fingerprint: `R${i}`, consensusWeight: 1000, flags: ['Running'] }),
    );
    await insertRelays(rows);
    const consensus = rows.map((r, i) =>
      cRelay({
        fingerprint: r.fingerprint as string,
        consensusWeight: i < 3 ? 5000 : 1000,
      }),
    );
    const res = await crossCheckConsensus(getDb(), consensus, { validAfter: va });
    expect(res.diverged).toBe(3);
    expect(res.specs[0].severity).toBe('high');
  });
});
