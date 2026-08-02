# Tor Federation Protocol - Specification (v0.1, draft)

> Status: **Draft**. Any third party can implement this protocol to run their
> own node and peer with other instances. Breaking changes require a major
> version bump.

This document is **normative** for the endpoints under `/federation/v1/*` and
for the actor document at `/.well-known/tor-federation.json`. The reference
implementation lives in `packages/federation/` and `apps/web/app/federation/`.

---

## 1. Trust model

Tor-Sockets is **federated and deterministic at the raw layer**: every instance
pulls the same data from the same public sources (Onionoo, the consensus signed
by the directory authorities, CollecTor). There is nothing to disagree about
regarding the relay set or its weights, because those are publicly verifiable
facts.

Federation exists to:

1. **Remove the single point of failure**: if one instance goes offline, the
   others keep serving, and no single operator's outage takes the view of the
   network with it.
2. **Cross-verify**: compare snapshots across N peers to detect bugs,
   tampering, or a compromised instance.
3. **Carry provenance**: every derived metric ships `sources: [instance_a, ...]`
   so a consumer knows who computed it.

An Ed25519 signature **authenticates the origin** of a payload (which instance
emitted it) and **guarantees integrity** (it was not modified in transit). It
does **not** guarantee that the content is correct: that is what cross
verification between peers is for.

---

## 2. Instance identity

### 2.1 Ed25519 keypair

Every instance owns a 32-byte **Ed25519** pair:

- `private_key`: 32 bytes, secret, persisted on a volume with mode `0600`.
- `public_key`: 32 bytes derived from the private key, **public**.

Reference implementation: `@noble/curves/ed25519` (pure JS, no WASM).
libsodium-wrappers works as an alternative backend; the signature format is
standard Ed25519 either way.

### 2.2 `instance_id`

A stable, collision-resistant identifier:

```
instance_id = sha256(public_key)  // lowercase hex, 64 chars
```

Two instances with the same `instance_id` share the same public key, so they
are the same instance. Bootstrap generates a new key only when no previous file
exists at `FEDERATION_PRIVATE_KEY_PATH`.

> The keypair **is** the identity. Moving an instance to another host means
> carrying the private key with it. Regenerating it turns the same URL into a
> different instance for every peer that already trusted it.

### 2.3 Bootstrap

On first boot:

1. Generate a random 32-byte `private_key` (`crypto.randomBytes`).
2. Derive `public_key`.
3. Persist `base64(private_key)` to `${FEDERATION_PRIVATE_KEY_PATH}` with
   permissions `0600`.
4. Publish `public_key` in the actor document (section 3).

The key **never** leaves the host. It is only used to sign payloads.

---

## 3. Actor document

A public, **unsigned** endpoint. This document IS the root of trust: the
consumer fetches it over HTTPS and verifies everything else from there.

```
GET /.well-known/tor-federation.json
```

```json
{
  "spec": "tor-federation/0.1",
  "instance_id": "<sha256(pubkey) hex>",
  "instance_uri": "https://monitor.example.org",
  "pubkey": "<base64(ed25519 public key)>",
  "software": { "name": "tor-sockets", "version": "0.0.0" },
  "sources": ["onionoo"],
  "contact": null,
  "bootstrapped_at": "2026-06-29T00:00:00.000Z",
  "endpoints": {
    "status":   "/federation/v1/status",
    "snapshot": "/federation/v1/snapshot",
    "changes":  "/federation/v1/changes",
    "peers":    "/federation/v1/peers",
    "subscribe":"/federation/v1/subscribe"
  }
}
```

- `instance_uri` **must** match the URL the consumer used to reach the actor
  document. This prevents a malicious proxy from republishing someone else's
  actor.
- `pubkey` is the only cryptographic root. Compromising it compromises the
  instance. Rotation means a new `instance_id`; there is no in-place rotation
  in v0.1.
- `Cache-Control: public, max-age=300` (5 minutes). Public key changes are rare
  and the consumer must be able to revalidate.

---

## 4. Signed envelope

Every `/federation/v1/*` endpoint returns a `SignedEnvelope`:

```ts
interface SignedEnvelope<TPayload> {
  spec: 'tor-federation/0.1';
  signed_at: string;          // ISO 8601 UTC
  instance_id: string;        // sha256(pubkey) hex of the sender
  instance_uri: string;       // HTTPS URL of the sender
  payload: TPayload;          // endpoint-specific content
  sig: string;                // base64(Ed25519 signature)
}
```

### 4.1 Canonical JSON

Before signing or verifying, the `payload` is serialised to **canonical JSON**:

- Object keys are sorted lexicographically, **recursively**.
- Arrays preserve their order. This matters: the order of relays in `/changes`
  is significant.
- Numbers and strings are emitted with standard `JSON.stringify`.
- No whitespace between tokens.

```ts
canonicalJson({ b: 1, a: [2, 1] }) === '{"a":[2,1],"b":1}'
```

Implementation: `packages/federation/src/sign.ts` -> `canonicalJson`.

### 4.2 Signed message

The signature does not cover the payload alone, but:

```
message = `${signed_at}\n${instance_id}\n${canonicalJson(payload)}`
```

The `${signed_at}\n${instance_id}\n` prefix binds the signature to the time and
to the sender declared in the envelope, which prevents reusing that signature in
another context (replaying it across endpoints, or reassigning `instance_id`).

### 4.3 Signing and verification

```ts
sig = base64(ed25519_sign(message, private_key))
ok  = ed25519_verify(base64(sig), message, base64(pubkey))
```

`pubkey` comes from the sender's actor document at `instance_uri`. The verifier
**must**:

1. Fetch `GET ${instance_uri}/.well-known/tor-federation.json`.
2. Check `actor.instance_id === envelope.instance_id`.
3. Check `actor.instance_uri === envelope.instance_uri` (anti-republication).
4. Verify `envelope.sig` against `actor.pubkey` over the reconstructed message.

### 4.4 Freshness

`signed_at` lets a verifier reject envelopes that are too old. The recommended
maximum skew is **15 minutes** against the verifier's clock. Endpoints carrying
`Cache-Control: max-age=60` allow up to a minute of CDN caching; `signed_at`
stays valid because the content is immutable.

---

## 5. Endpoints (`/federation/v1/*`)

All of them return `application/json` carrying a `SignedEnvelope`. All of them
require `GET`. `Cache-Control: public, max-age=60` unless stated otherwise.

### 5.1 `GET /status`

Instance state: software, sources, last consensus processed, last sequence
number of the change log. Useful for spotting stalled instances, and for a peer
to learn which `seq` to request `/changes` from.

```jsonc
// envelope.payload
{
  "software": { "name": "tor-sockets", "version": "0.0.0" },
  "sources": ["onionoo"],
  "last_consensus_published": "2026-06-29T00:00:00Z" | null,
  "relays_total": 7142,
  "relays_running": 6891,
  "consensus_weight_max": 131072,
  "federation_log_last_seq": 42,
  "booted_at": "2026-06-29T00:00:00.000Z"
}
```

### 5.2 `GET /snapshot`

An aggregate view of the instance's relay set. It does **not** list relays: it
returns a hash of the set plus counts, so two peers can compare cheaply and
only exchange detail when they differ (through `/changes`).

```jsonc
// envelope.payload
{
  "relays_total": 7142,
  "relays_running": 6891,
  "consensus_weight_sum": 10485760,
  "relay_set_hash": "<sha256 hex of sorted fingerprints joined by '\n'>",
  "relay_set_count": 7142,
  "computed_at": "2026-06-29T12:00:00.000Z"
}
```

`relay_set_hash` is computed as:

```
sha256( sorted(fingerprints).join('\n') )
```

Two instances holding the same relay set produce the same hash even if their
databases order rows differently. When the hashes differ, the instances can pull
`/changes` to reconcile.

### 5.3 `GET /changes?since={seq}`

A signed change-data-capture log of the relay set and derived metrics. Each
entry is a `federation_log` row carrying `op`, `payload`, `payload_hash` and
`sig`.

Parameters:

| Param | Default | Description |
|---|---|---|
| `since` | `0` | Exclusive sequence number to return changes from |
| `limit` | `1000` | Maximum entries (capped at 10000) |

Current ops: `consensus_processed`, `snapshot_taken`, `anomaly_detected`,
`alert_triggered`, `peer_synced`.

### 5.4 `GET /peers`

The peers this instance knows about (gossip). It enables transitive discovery:
a peer querying this endpoint learns about other peers it could also sync from.
Each entry exposes only safe fields:

```jsonc
// envelope.payload
{
  "peers": [
    {
      "instance_id": "<sha256 hex>",
      "instance_uri": "https://peer.example.com",
      "trusted": true,
      "last_seen_at": "2026-06-30T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

- `trusted: true` means this instance cross-verifies against that peer. Peers
  discovered through `/subscribe` are recorded with `trusted: false`, an
  anti-Sybil measure, and must be promoted by hand by the operator.
- Internal sync state (`last_sync_seq`, `last_status`) is not published: that
  belongs to the operator, not to gossip.

### 5.5 `POST /subscribe`

Webhook and peer registration. The body is a `SignedEnvelope` whose `payload`
carries the subscriber's actor document and, optionally, a webhook URL:

```jsonc
// envelope.payload
{
  "actor": { /* the subscriber's full actor document */ },
  "webhook_url": "https://subscriber.example.com/hook"
}
```

The server:

1. Parses the payload with the `subscribePayloadSchema` zod schema.
2. **Fetches the actor document** from `payload.actor.instance_uri`
   (`/.well-known/tor-federation.json`). This is the anti-republication check
   of section 4.3: the public key must come from the canonical origin, never
   body.
3. **Verifies** the envelope signature against the fetched public key.
4. Checks freshness (`signed_at` within 15 minutes).
5. Upserts into `federation_peers` with `trusted: false`.

Response:

```jsonc
{
  "accepted": true,
  "instance_id": "<sha256 hex>",
  "trusted": false,
  "message": "peer registered; cross-verification requires operator trust"
}
```

> Webhook push is not implemented in v0.1: subscribers must pull `/changes`.
> Registration puts the peer on the list so it can be synced and so the operator
> can promote it to `trusted`.

The URL supplied by a subscriber is fetched by the server, which makes this
endpoint a server-side request forgery surface. The reference implementation
routes every outbound call through `packages/federation/src/safe-fetch.ts`:
HTTPS only in production, private and link-local address ranges blocked,
DNS pinned at connect time so the address cannot change between check and use,
redirects revalidated, and a hard byte cap. An alternative implementation is
expected to apply equivalent controls.

---

## 6. Cross-verification (anti-compromise)

How the network detects that an instance is lying or has been compromised:

1. **Snapshot agreement**: a peer periodically compares its own
   `relay_set_hash` against N peers. Divergence between otherwise honest peers
   points at a problem in one of them.
2. **Provenance**: derived metrics (HHI concentration, anomalies) expose
   `sources: [instance_a, instance_b, ...]` plus `reported_by[]`. When a
   consumer sees a single instance reporting something different from the rest,
   confidence in that instance drops.
3. **Recomputation**: the HHI algorithm is public and deterministic over the
   relay set. Any peer can recompute it from the raw snapshot and compare
   against the reported value.

The network does **not** attempt BFT-style consensus: the raw data is already
deterministic. It only flags divergence as a signal.

---

## 7. Anti-Sybil

Anyone can run an instance and publish an actor document. To keep the network
from being flooded with malicious instances:

- **Manual opt-in first**: the peer list is loaded by hand on each instance
  (`federation_peers.trusted = true`). There is no auto-peering in v0.1.
- `trusted` separates peers that are actually cross-verified from peers
  discovered through gossip, which are informational only.
- An operator can add new peers and mark them `trusted` after reviewing their
  `contact` and `instance_uri`.

Later versions may add cross-signatures between known operators (a web of
trust) or a small federated directory authority. Both are out of scope for
v0.1.

---

## 8. Versioning

- The `spec` string (`"tor-federation/0.1"`) travels in every envelope and in
  the actor document.
- **Backward-compatible** changes (adding optional fields, new endpoints under
  `/federation/v1/`, new `op` codes) bump the minor version (`0.1` -> `0.2`).
- **Breaking** changes (envelope format, canonicalisation algorithm,
  `instance_id` scheme, semantic changes to existing endpoints) bump the major
  version and introduce a new `/federation/v2/` route that coexists with v1 for
  a deprecation cycle.

Clients **must** check `spec` before consuming a payload and reject unknown
major versions.

---

## 9. Operational considerations

- **HTTPS is mandatory**: the root of trust depends on the actor document being
  fetched over an authenticated channel. Plain HTTP voids the whole scheme.
- **Clocks**: the freshness check (`signed_at`) needs reasonably synchronised
  clocks (NTP). Skew above 15 minutes should be rejected.
- **Key compromise**: if `private_key` is exposed, the operator must generate a
  new one, which means a new `instance_id`, and publish it. There is no
  revocation mechanism in v0.1; peers notice because the actor document changed.
- **Payload sizes**: `/snapshot` and `/status` are O(1). `/changes` is paginated
  and capped at 10000 entries. Full relay lists are never served over
  federation: each instance pulls them from Onionoo directly.

### 9.1 Who terminates your TLS is part of your trust model

The actor document is unsigned by construction, because it is the document that
carries the key everything else is verified against. Its authenticity therefore
rests entirely on the transport. Whoever terminates TLS for an instance is
consequently able to serve a **different** actor document, carrying a
**different public key**, to a peer fetching it for the first time.

That covers any third-party TLS terminator: a CDN, a tunnelling service such as
the optional Cloudflare Tunnel overlay shipped in `docker/compose.tunnel.yml`, a
reverse proxy operated by a hosting provider, or a corporate middlebox. None of
this breaks signatures already issued, and a peer that has previously recorded
an instance's key will see the substitution as a key change. What it breaks is
the **bootstrap**: a peer meeting an instance for the first time is trusting
that terminator, not the operator.

Consequences an implementation and an operator should be explicit about:

- An instance whose peers need the strongest guarantee should terminate TLS in
  its own process, or at a proxy under the same operator's control, and say so.
- A verifier that has already seen an instance should treat a changed `pubkey`
  as a security event to be confirmed out of band, not as a routine update.
  v0.1 has no revocation, so the actor document changing IS the only signal.
- Publishing the `instance_id` through an independent channel, so a peer can
  compare it against `sha256(pubkey)` from the actor document, closes the
  bootstrap gap without any protocol change.

This is a stated limitation of v0.1 rather than a defect in an implementation.
Pinning keys on first use and out-of-band confirmation are the intended
mitigations until the key revocation and rotation work lands.

---

## 10. Test vectors (canonicalisation)

To validate an alternative implementation of `canonicalJson`:

```
canonicalJson(null)                     === "null"
canonicalJson(42)                       === "42"
canonicalJson("foo")                    === "\"foo\""
canonicalJson([3,1,2])                  === "[3,1,2]"
canonicalJson({"b":1,"a":2})            === "{\"a\":2,\"b\":1}"
canonicalJson({"x":[1,{"b":2,"a":1}]})  === "{\"x\":[1,{\"a\":1,\"b\":2}]}"
```

An example signed message (not verifiable, the key is fictional):

```
signed_at    = "2026-06-29T00:00:00.000Z"
instance_id  = "deadbeef...42"
payload      = {"b":1,"a":2}
message      = "2026-06-29T00:00:00.000Z\ndeadbeef...42\n{\"a\":2,\"b\":1}"
```

The verifier **must** reconstruct `message` exactly like that. Any difference
in whitespace, key order or encoding invalidates the signature.

---

## 11. Implementation status

| Surface | State |
|---|---|
| Actor document, `/status`, `/snapshot`, Ed25519 envelope, keypair bootstrap | Implemented |
| `/changes` CDC log and automatic `relay_set_hash` cross-check | Implemented |
| `/peers` gossip, `/subscribe`, materialised cross-verification | Implemented |
| Webhook push to subscribers | Not implemented in v0.1 (pull `/changes`) |
| Key revocation and rotation, replay protection with a nonce | Planned for v0.2 |

Changes to this document require a spec version bump, and a major bump when
they are breaking.
