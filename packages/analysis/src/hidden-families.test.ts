import { type NewRelay, relays } from '@tor-sockets/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { detectHiddenFamilies } from './hidden-families';
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
    consensusWeight: 100,
    guardProbability: '0',
    exitProbability: '0',
    middleProbability: '0',
    effectiveFamily: [],
    ...o,
  };
}

async function insertRelays(rows: NewRelay[]): Promise<void> {
  for (const r of rows) await getDb().insert(relays).values(r);
}

describe('detectHiddenFamilies', () => {
  it('same contact, all declared as ONE family → not hidden', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', contact: 'op-one', effectiveFamily: ['A', 'B'] }),
      relay({ fingerprint: 'B', contact: 'op-one', effectiveFamily: ['B', 'A'] }),
    ]);
    const res = await detectHiddenFamilies(getDb(), { minRelays: 2 });
    expect(res).toHaveLength(0);
  });

  it('same contact, no family declared → hidden (all undeclared)', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', contact: 'op-two', effectiveFamily: ['A'] }),
      relay({ fingerprint: 'B', contact: 'op-two', effectiveFamily: ['B'] }),
      relay({ fingerprint: 'C', contact: 'op-two', effectiveFamily: [] }),
    ]);
    const res = await detectHiddenFamilies(getDb(), { minRelays: 2 });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      contact: 'op-two',
      relays: 3,
      declaredFamilies: 0,
      undeclaredRelays: 3,
    });
  });

  it('same contact split across TWO declared families → hidden', async () => {
    await insertRelays([
      relay({ fingerprint: 'E', contact: 'op-three', effectiveFamily: ['E', 'F'] }),
      relay({ fingerprint: 'F', contact: 'op-three', effectiveFamily: ['F', 'E'] }),
      relay({ fingerprint: 'G', contact: 'op-three', effectiveFamily: ['G', 'H'] }),
      relay({ fingerprint: 'H', contact: 'op-three', effectiveFamily: ['H', 'G'] }),
    ]);
    const res = await detectHiddenFamilies(getDb(), { minRelays: 2 });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ relays: 4, declaredFamilies: 2, undeclaredRelays: 0 });
  });

  it('below minRelays is skipped', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', contact: 'solo', effectiveFamily: ['A'] }),
      relay({ fingerprint: 'B', contact: 'pair', effectiveFamily: ['B'] }),
      relay({ fingerprint: 'C', contact: 'pair', effectiveFamily: ['C'] }),
    ]);
    const res = await detectHiddenFamilies(getDb(), { minRelays: 3 });
    expect(res).toHaveLength(0);
  });

  it('empty/short contact is ignored', async () => {
    await insertRelays([
      relay({ fingerprint: 'A', contact: null, effectiveFamily: [] }),
      relay({ fingerprint: 'B', contact: '', effectiveFamily: [] }),
      relay({ fingerprint: 'C', contact: 'ab', effectiveFamily: [] }),
    ]);
    const res = await detectHiddenFamilies(getDb(), { minRelays: 2 });
    expect(res).toHaveLength(0);
  });

  it('deanon_risk = guardShare × exitShare, drives ranking', async () => {
    await insertRelays([
      // op-hi: holds all guard + all exit probability → deanon risk ~1
      relay({
        fingerprint: 'A',
        contact: 'op-hi',
        guardProbability: '0.5',
        exitProbability: '0.5',
      }),
      relay({
        fingerprint: 'B',
        contact: 'op-hi',
        guardProbability: '0.5',
        exitProbability: '0.5',
      }),
      // op-lo: guard only, no exit → deanon risk 0
      relay({ fingerprint: 'C', contact: 'op-lo', guardProbability: '0', exitProbability: '0' }),
      relay({ fingerprint: 'D', contact: 'op-lo', guardProbability: '0', exitProbability: '0' }),
    ]);
    const res = await detectHiddenFamilies(getDb(), { minRelays: 2 });
    expect(res[0].contact).toBe('op-hi');
    // guardShare = 1.0, exitShare = 1.0 → deanonRisk = 1
    expect(res[0].deanonRisk).toBeCloseTo(1, 5);
    expect(res[0].guardPct).toBeCloseTo(100, 5);
    expect(res[0].exitPct).toBeCloseTo(100, 5);
  });
});
