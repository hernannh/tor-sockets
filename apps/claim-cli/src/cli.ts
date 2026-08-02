#!/usr/bin/env node
/**
 * @tor-sockets/claim-cli - local T2 ownership prover for Tor relay operators.
 *
 * Runs on the relay host, reads the Ed25519 master identity secret key
 * (`ed25519_master_id_secret_key`), and signs a proof that this Tor-Sockets
 * instance + operator own the relay. The master key NEVER leaves the host -
 * only the signature is printed (to paste into the operator panel).
 *
 * Usage:
 *   tor-sockets-claim sign \
 *     --fingerprint <40-hex> \
 *     --operator   <operatorId> \
 *     --instance   <instanceId> \
 *     --key        /var/lib/tor/keys/ed25519_master_id_secret_key
 *
 * The fingerprint/operator/instance values are prefilled by the operator panel
 * ("Generate CLI command"). Prints the base64 signature on stdout.
 */
import { readFile } from 'node:fs/promises';
import { buildT2ClaimMessage, derivePublicKey, sign, toBase64 } from '@tor-sockets/federation';

interface SignArgs {
  fingerprint: string;
  operator: string;
  instance: string;
  key: string;
}

function parseArgs(argv: string[]): SignArgs | null {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--help' || a === '-h') return null;
    if (a?.startsWith('--') && next && !next.startsWith('--')) {
      args[a.slice(2)] = next;
      i += 1;
    }
  }
  const { fingerprint, operator, instance, key } = args;
  if (!fingerprint || !operator || !instance || !key) return null;
  return { fingerprint, operator, instance, key };
}

function printUsage(): string {
  return [
    'Usage: tor-sockets-claim sign \\',
    '  --fingerprint <40-hex>   relay fingerprint',
    '  --operator   <id>        your operator id (from the panel)',
    '  --instance   <id>        this Tor-Sockets instance id (from the panel)',
    '  --key        <path>      path to ed25519_master_id_secret_key',
    '',
    'The master key is read locally and never sent anywhere.',
    'Only the signature is printed - paste it into the operator panel.',
  ].join('\n');
}

function usage(): never {
  console.error(printUsage());
  process.exit(1);
}

/**
 * Read a Tor Ed25519 secret key file and return the 32-byte seed.
 *
 * Format: a header line (`==ed25519v1-secret-key-type==` or similar tag) + 64
 * raw bytes, where the first 32 bytes are the standard Ed25519 seed. We skip
 * the header (everything up to and including the first newline) and take the
 * following 32 bytes. The seed alone fully determines signing for standard
 * Ed25519 and derives the master identity public key.
 */
async function readSeed(path: string): Promise<Uint8Array> {
  const buf = await readFile(path);
  const nl = buf.indexOf(0x0a);
  if (nl < 0) throw new Error(`key file ${path} has no header line`);
  const start = nl + 1;
  if (buf.length - start < 32) {
    throw new Error(`key file ${path} is too short (expected ≥32 key bytes after header)`);
  }
  return new Uint8Array(buf.subarray(start, start + 32));
}

async function main() {
  const subcommand = process.argv[2];
  if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help' || !subcommand) {
    console.log(printUsage());
    process.exit(0);
  }
  if (subcommand !== 'sign') {
    console.error(`Unknown subcommand: ${subcommand}`);
    usage();
  }
  const parsed = parseArgs(process.argv.slice(3));
  if (!parsed) usage();

  const { fingerprint, operator, instance, key } = parsed;
  if (!/^[0-9A-Fa-f]{40}$/.test(fingerprint)) {
    console.error('Invalid fingerprint: must be 40 hex chars');
    process.exit(1);
  }

  let seed: Uint8Array;
  try {
    seed = await readSeed(key);
  } catch (err) {
    console.error(`Could not read key file: ${err instanceof Error ? err.message : err}`);
    console.error('Tip: run as the tor user, or point --key at your DataDirectory/keys/');
    process.exit(1);
  }

  const message = buildT2ClaimMessage(instance, operator, fingerprint);
  const signature = sign(message, seed);
  const pubkeyB64 = toBase64(derivePublicKey(seed));

  process.stderr.write(
    [
      `derived master pubkey: ${pubkeyB64}`,
      `(this should match the relay's master-key-ed25519 in the Tor consensus)`,
      '',
    ].join('\n'),
  );
  process.stdout.write(`${toBase64(signature)}\n`);
}

main().catch((err) => {
  console.error(`fatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
