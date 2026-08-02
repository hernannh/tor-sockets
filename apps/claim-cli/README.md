# @tor-sockets/claim-cli

Local Ed25519 claim signer for **Tor relay operators**. Proves relay ownership
cryptographically without exposing the master identity key.

Part of the Tor-Sockets federated monitoring platform - this is the **T2 (cryptographic)** tier of the operator-claim
3-tier model.

## What it does

Tor-Sockets lets operators claim the relays they run. The strongest proof (T2)
is a signature from the relay's **Ed25519 master identity key**. This CLI:

- runs **on the relay host**,
- reads `ed25519_master_id_secret_key` **locally** (the secret never leaves the
  host - only the signature is printed),
- signs a proof bound to your Tor-Sockets operator account + the target relay,
- prints a base64 signature you paste into the operator panel.

The backend verifies it against the relay's published `master-key-ed25519` (from
the Tor server descriptors).

## Usage

```bash
npx @tor-sockets/claim-cli sign \
  --fingerprint <40-hex> \
  --operator   <operator-id> \
  --instance   <instance-id> \
  --key        /var/lib/tor/keys/ed25519_master_id_secret_key
```

All four flags are required. The `operator` and `instance` ids are shown in your
Tor-Sockets operator panel (the panel generates the exact command for you).

### Output

- **stdout**: the base64 signature (paste this into the panel).
- **stderr**: the derived master pubkey, for you to eyeball against the relay's
  `master-key-ed25519` in the consensus.

### Notes

- Run as a user that can read the Tor `keys/` directory (often the `debian-tor`
  or `tor` user), or pass `--key` an accessible path.
- The signed message is `tor-sockets-ed25519-claim-v1\n<instance>\n<operator>\n<FINGERPRINT>`.
  It is bound to your operator account and instance - a captured signature can
  only re-assert the same ownership, not impersonate another operator.
- Zero runtime dependencies (everything is bundled into the published file).

## License

MIT - see [LICENSE](./LICENSE).
