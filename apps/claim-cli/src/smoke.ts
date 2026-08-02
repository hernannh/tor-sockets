/**
 * Synthetic end-to-end smoke for the T2 (Ed25519 master key) claim flow.
 *
 * Generates a fresh keypair, writes it in Tor's `ed25519_master_id_secret_key`
 * file format, runs the bundled CLI (`node dist/cli.js sign ...`), and verifies
 * the resulting signature with the same `verifyT2Claim` the backend uses.
 *
 * This validates the full crypto path end-to-end:
 *  - Tor key-file byte layout (seed = first 32 bytes after the header newline)
 *  - message construction agreement between CLI and backend (buildT2ClaimMessage)
 *  - sign (@noble/curves) → verify round trip
 *  - the bound property: a signature for operator A must NOT verify for operator B
 *
 * It does NOT prove that a *real* Tor master key file has the seed at bytes
 * [0..32] - that's the documented Tor format; this smoke confirms our parser
 * reads those bytes for a file written in that format.
 *
 * Run: pnpm --filter @tor-sockets/claim-cli exec bun run src/smoke.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { derivePublicKey, generateKeyPair, toBase64, verifyT2Claim } from '@tor-sockets/federation';

const FINGERPRINT = 'A'.repeat(40);
const OPERATOR = 'op-smoke-0001';
const INSTANCE = 'inst-smoke-deadbeefcafebabe'.padEnd(64, '0');
const CLI_DIST = join(import.meta.dir, '..', 'dist', 'cli.js');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures += 1;
}

/** Write a key file in Tor's on-disk format: tag header + 64 bytes (seed + pad). */
async function writeTorKeyFile(dir: string, seed: Uint8Array): Promise<string> {
  const path = join(dir, 'ed25519_master_id_secret_key');
  const tag = Buffer.from('==ed25519v1-secret-key-type==\n');
  const pad = Buffer.alloc(32, 0); // bytes [32..64] are unused by our parser
  await writeFile(path, Buffer.concat([tag, Buffer.from(seed), pad]));
  return path;
}

function runCli(keyPath: string, fingerprint: string, operator: string, instance: string): string {
  const res = spawnSync(
    'node',
    [
      CLI_DIST,
      'sign',
      '--fingerprint',
      fingerprint,
      '--operator',
      operator,
      '--instance',
      instance,
      '--key',
      keyPath,
    ],
    {
      encoding: 'utf8',
    },
  );
  if (res.status !== 0) {
    throw new Error(`CLI exited ${res.status}: ${res.stderr}`);
  }
  return res.stdout.trim();
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'claim-cli-smoke-'));
  try {
    const { privateKey: seed } = generateKeyPair();
    const masterPubKeyB64 = toBase64(derivePublicKey(seed));
    const keyPath = await writeTorKeyFile(dir, seed);

    console.log('T2 claim smoke - synthetic keypair');
    console.log(`  derived master pubkey: ${masterPubKeyB64}`);

    // 1) Happy path: CLI signs, backend verifies.
    const signature = runCli(keyPath, FINGERPRINT, OPERATOR, INSTANCE);
    check(
      'CLI produced a base64 signature',
      /^[A-Za-z0-9+/=]+$/.test(signature),
      `${signature.slice(0, 24)}…`,
    );

    const ok = verifyT2Claim(INSTANCE, OPERATOR, FINGERPRINT, signature, masterPubKeyB64);
    check('signature verifies against derived master pubkey', ok);

    // 2) Bound property: signature must NOT verify for a different operator.
    const okOtherOperator = verifyT2Claim(
      INSTANCE,
      'op-other-9999',
      FINGERPRINT,
      signature,
      masterPubKeyB64,
    );
    check('signature rejected for a different operator', !okOtherOperator);

    // 3) Bound property: signature must NOT verify for a different instance.
    const okOtherInstance = verifyT2Claim(
      '0'.repeat(64),
      OPERATOR,
      FINGERPRINT,
      signature,
      masterPubKeyB64,
    );
    check('signature rejected for a different instance', !okOtherInstance);

    // 4) Wrong pubkey: must NOT verify against an unrelated key.
    const { privateKey: otherSeed } = generateKeyPair();
    const otherPubKeyB64 = toBase64(derivePublicKey(otherSeed));
    const okWrongKey = verifyT2Claim(INSTANCE, OPERATOR, FINGERPRINT, signature, otherPubKeyB64);
    check('signature rejected against an unrelated pubkey', !okWrongKey);

    // 5) Lowercase fingerprint input matches uppercase canonical message.
    const sigLower = runCli(keyPath, FINGERPRINT.toLowerCase(), OPERATOR, INSTANCE);
    const okLower = verifyT2Claim(INSTANCE, OPERATOR, FINGERPRINT, sigLower, masterPubKeyB64);
    check('lowercase fingerprint input normalizes correctly', okLower);

    console.log(`\n${failures === 0 ? 'ALL GREEN' : `${failures} FAILURE(S)`}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('smoke fatal:', err);
  process.exit(1);
});
