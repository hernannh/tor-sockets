'use server';

import { randomBytes } from 'node:crypto';
import {
  addPeer,
  claimRelaySelfAttested as claimSelfAttested,
  removePeer,
  setPeerTrusted,
  verifyContactTokenClaims,
} from '@/lib/api/queries';
import { getSession } from '@/lib/auth';
import { getEd25519Identity } from '@/lib/ed25519-lookup';
import { getInstance } from '@/lib/federation';
import { alertConditionSchema } from '@tor-sockets/api-contract';
import { alertRules, operatorClaims, operators, relays } from '@tor-sockets/db';
import { getDb } from '@tor-sockets/db';
import { FederationVerifyError, verifyT2Claim } from '@tor-sockets/federation';
import { and, count, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

async function requireOperator() {
  const session = await getSession();
  if (!session) redirect('/login?callbackUrl=/operator');
  return session.user;
}

/**
 * Privilege gate for actions that affect the federated network (adding peers,
 * promoting a peer to `trusted`). These can be abused by Sybil accounts
 * (anyone can sign up with a throwaway email), so we require a PROOF OF REAL
 * RELAY OWNERSHIP first: at least one verified claim of tier T1 (contact token,
 * observed via consensus-signed Onionoo) or T2 (Ed25519 master-key signature).
 * A throwaway account without a real relay can never pass this.
 *
 * Returns an `{ ok: false, error }` sentinel the caller turns into a 403-ish
 * response - it does NOT throw, so server actions stay composable.
 */
async function requirePrivilegedOperator(): Promise<
  | { ok: true; user: Awaited<ReturnType<typeof requireOperator>>; db: ReturnType<typeof getDb> }
  | { ok: false; error: string }
> {
  const user = await requireOperator();
  // 1. Two-factor auth required - protects against credential takeover of
  //    accounts that can touch the federated network.
  if (!user.twoFactorEnabled) {
    return {
      ok: false,
      error: 'Two-factor authentication (2FA) is required. Enable it in your operator panel first.',
    };
  }
  // 2. Proof of real relay ownership - blocks Sybil accounts (throwaway emails
  //    without a real relay) from reaching the peering surface.
  const db = getDb(process.env.DATABASE_URL);
  const [row] = await db
    .select({ c: count() })
    .from(operatorClaims)
    .where(
      and(
        eq(operatorClaims.operatorId, user.id),
        inArray(operatorClaims.proofType, ['contact_token', 'ed25519_master_key']),
      ),
    );
  if (!row || Number(row.c) < 1) {
    return {
      ok: false,
      error:
        'Verified relay claim required. Add a contact-token (T1) or sign with the relay master key (T2) before managing federation peers.',
    };
  }
  return { ok: true, user, db };
}

function parseChannels(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && /:/.test(c));
}

export async function createRule(formData: FormData) {
  const user = await requireOperator();
  const name = String(formData.get('name') ?? '').trim();
  const conditionRaw = String(formData.get('condition') ?? '').trim();
  const channelsRaw = String(formData.get('channels') ?? '').trim();

  if (!name) return { error: 'Name is required' };

  let condition: unknown;
  try {
    condition = JSON.parse(conditionRaw);
  } catch {
    return { error: 'Condition must be valid JSON' };
  }
  const parsed = alertConditionSchema.safeParse(condition);
  if (!parsed.success) {
    return { error: `Invalid condition: ${parsed.error.issues[0]?.message ?? 'check format'}` };
  }

  const db = getDb(process.env.DATABASE_URL);
  await db.insert(alertRules).values({
    ownerId: user.id,
    name,
    condition: parsed.data,
    channels: parseChannels(channelsRaw),
  });
  revalidatePath('/operator');
}

export async function toggleRule(id: string, enabled: boolean) {
  const user = await requireOperator();
  const db = getDb(process.env.DATABASE_URL);
  await db
    .update(alertRules)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(alertRules.id, id), eq(alertRules.ownerId, user.id)));
  revalidatePath('/operator');
}

export async function deleteRule(id: string) {
  const user = await requireOperator();
  const db = getDb(process.env.DATABASE_URL);
  await db.delete(alertRules).where(and(eq(alertRules.id, id), eq(alertRules.ownerId, user.id)));
  revalidatePath('/operator');
}

// --- Claims (Fase 3.2b) ---

/**
 * T1: generate (or rotate) the operator's contact-verification token. The
 * operator pastes `tor-sockets-verify:<token>` into their relay's `Contact`
 * field in torrc, reloads, and waits for the next Onionoo poll. Then
 * `runContactVerification` matches it.
 */
export async function generateVerifyToken() {
  const user = await requireOperator();
  const db = getDb(process.env.DATABASE_URL);
  const token = randomBytes(8).toString('hex');
  await db.update(operators).set({ verifyToken: token }).where(eq(operators.id, user.id));
  revalidatePath('/operator');
  return { token: `tor-sockets-verify:${token}` };
}

/**
 * T1: scan current relays for the operator's contact token and materialize
 * verified claims. Returns how many matched / were newly created.
 */
export async function runContactVerification() {
  const user = await requireOperator();
  const db = getDb(process.env.DATABASE_URL);
  const result = await verifyContactTokenClaims(db, user.id);
  revalidatePath('/operator');
  return result;
}

/**
 * T3: self-attested claim on a relay by fingerprint. Only succeeds if the
 * operator's email appears in the relay's `contact` field. Low trust.
 */
export async function claimSelfAttestedRelay(formData: FormData) {
  const user = await requireOperator();
  const fingerprint = String(formData.get('fingerprint') ?? '').trim();
  if (!/^[0-9A-Fa-f]{40}$/.test(fingerprint)) {
    return { error: 'Fingerprint must be 40 hex chars' };
  }
  const db = getDb(process.env.DATABASE_URL);
  const result = await claimSelfAttested(db, user.id, user.email, fingerprint);
  revalidatePath('/operator');
  return result.reason ? { error: result.reason } : { created: result.created };
}

export async function deleteClaim(id: string) {
  const user = await requireOperator();
  const db = getDb(process.env.DATABASE_URL);
  await db
    .delete(operatorClaims)
    .where(and(eq(operatorClaims.id, id), eq(operatorClaims.operatorId, user.id)));
  revalidatePath('/operator');
}

// --- Federation peers (Fase 3.3) ---

export async function addPeerAction(formData: FormData) {
  const gate = await requirePrivilegedOperator();
  if (!gate.ok) return { error: gate.error };
  const { db } = gate;
  const uri = String(formData.get('uri') ?? '').trim();
  if (!uri) return { error: 'Peer URI is required' };
  try {
    const { actor } = await addPeer(db, uri);
    revalidatePath('/operator');
    return { added: true, instanceId: actor.instance_id, uri: actor.instance_uri };
  } catch (err) {
    const code = err instanceof FederationVerifyError ? err.code : 'fetch_failed';
    return { error: `${code}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function removePeerAction(instanceId: string) {
  const gate = await requirePrivilegedOperator();
  if (!gate.ok) {
    console.warn('[operator] removePeer denied:', gate.error);
    return;
  }
  await removePeer(gate.db, instanceId);
  revalidatePath('/operator');
}

export async function togglePeerTrusted(instanceId: string, trusted: boolean) {
  const gate = await requirePrivilegedOperator();
  if (!gate.ok) {
    console.warn('[operator] togglePeerTrusted denied:', gate.error);
    return;
  }
  await setPeerTrusted(gate.db, instanceId, trusted);
  revalidatePath('/operator');
}

// --- Claim T2 (Ed25519 master key) ---

/**
 * Build the exact CLI command for the operator to run on the relay host. The
 * signature covers (instanceId, operatorId, fingerprint), so the operator only
 * needs to supply `--key` (path to ed25519_master_id_secret_key).
 */
export async function getT2Challenge(fingerprint: string) {
  const user = await requireOperator();
  if (!/^[0-9A-Fa-f]{40}$/.test(fingerprint)) {
    return { error: 'Fingerprint must be 40 hex chars' };
  }
  const instance = await getInstance();
  const fp = fingerprint.toUpperCase();
  const command = `npx @tor-sockets/claim-cli sign \\\n  --fingerprint ${fp} \\\n  --operator ${user.id} \\\n  --instance ${instance.keypair.instanceId} \\\n  --key /var/lib/tor/keys/ed25519_master_id_secret_key`;
  return { command, fingerprint: fp };
}

/**
 * Verify a T2 signature against the relay's published master-key-ed25519 and
 * upsert the claim. An existing lower-trust claim (T1/T3) is upgraded to
 * ed25519_master_key (strongest proof); the unique (operator, fingerprint)
 * constraint is satisfied via onConflictDoUpdate.
 */
export async function submitT2Claim(fingerprint: string, signatureBase64: string) {
  const user = await requireOperator();
  const fp = fingerprint.toUpperCase();
  if (!/^[0-9A-F]{40}$/.test(fp)) return { error: 'Invalid fingerprint' };
  if (!signatureBase64.trim()) return { error: 'Signature is required' };

  const instance = await getInstance();

  const [relay] = await getDb(process.env.DATABASE_URL)
    .select({ fingerprint: relays.fingerprint })
    .from(relays)
    .where(eq(relays.fingerprint, fp))
    .limit(1);
  if (!relay) return { error: 'Relay not found in our dataset' };

  const masterPubKeyB64 = await getEd25519Identity(fp);
  if (!masterPubKeyB64) {
    return {
      error:
        'Relay Ed25519 identity unavailable - its server descriptor is not in the latest CollecTor batch. Retry in ~1 hour.',
    };
  }

  const ok = verifyT2Claim(
    instance.keypair.instanceId,
    user.id,
    fp,
    signatureBase64.trim(),
    masterPubKeyB64,
  );
  if (!ok) return { error: 'Signature verification failed (wrong key file or relay?)' };

  await getDb(process.env.DATABASE_URL)
    .insert(operatorClaims)
    .values({
      operatorId: user.id,
      fingerprint: fp,
      proofType: 'ed25519_master_key',
      proofMetadata: `ed25519:${masterPubKeyB64.slice(0, 16)}`,
    })
    .onConflictDoUpdate({
      target: [operatorClaims.operatorId, operatorClaims.fingerprint],
      set: {
        proofType: 'ed25519_master_key',
        proofMetadata: `ed25519:${masterPubKeyB64.slice(0, 16)}`,
        verifiedAt: new Date(),
      },
    });

  revalidatePath('/operator');
  return { created: true };
}
