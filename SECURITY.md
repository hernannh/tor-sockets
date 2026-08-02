# Security Policy

Tor-Sockets is a federated monitor of the Tor network's health and
centralization. Because it ingests attacker-influenced data (relay `contact`,
`nickname`, `as_name`), exposes a public REST + federation API, and stores
operator accounts, security is a first-class concern.

## Supported versions

Only the latest release line on `main` receives security fixes. There are no
LTS branches.

## Reporting a vulnerability

**Please do NOT open a public GitHub issue for security problems.**

Report vulnerabilities privately:

- Open a **GitHub Security Advisory** on this repo ("Report a vulnerability"),
  OR
- Email the maintainer directly (see the repo owner's profile).

Include if possible:

- A description of the issue and its impact.
- Reproduction steps (inputs, endpoints, affected versions).
- A suggested fix or mitigation.

You should receive an initial response within **7 days**. Please give us 90 days
to address the issue before public disclosure (we will coordinate with you).

We credit responsible reporters in release notes unless you prefer otherwise.

## Threat model (summary)

Tor-Sockets assumes:

- **Untrusted upstream data** from Onionoo / consensus / CollecTor. All external
  input is validated with `zod`; user-supplied relay strings are never rendered
  with `dangerouslySetInnerHTML` (React escapes them) and CSV exports neutralize
  spreadsheet formula injection.
- **Untrusted federation peers.** Every `/federation/v1/*` payload is an
  Ed25519-signed envelope verified against the canonical actor document at the
  peer's origin (anti-republication). Peers are registered `trusted: false`;
  cross-verification trust is an explicit operator opt-in.
- **Untrusted public API callers.** The API and federation endpoints are
  rate-limited per IP (see `apps/web/proxy.ts`). Outbound fetches to URLs
  derived from untrusted input go through an SSRF-hardened `safeFetch`
  (https-only in production, blocks private/loopback/link-local/metadata IPs,
  follows redirects manually and re-validates each hop).

See [`FEDERATION.md`](FEDERATION.md) section 1 for the federation trust model.

## Dependency governance

Dependencies are watched automatically; nothing here relies on someone
remembering to check.

- **Dependabot** (`.github/dependabot.yml`) opens weekly PRs for three
  ecosystems: the pnpm workspace, the workflow actions, and the container base
  images under `docker/`. Routine minor/patch bumps are grouped into one PR per
  ecosystem; security updates arrive immediately and ungrouped.
- **`pnpm audit --audit-level high`** runs on every push and pull request
  (`.github/workflows/security.yml`) and fails the build on a HIGH or CRITICAL
  advisory. The full report, including moderate and low, is printed in the same
  job.
- **Trivy** scans the web, ingestion and migrate images on every push to `main`
  and on a weekly schedule, failing on fixable HIGH/CRITICAL findings. The
  schedule is the part that matters: an advisory can land for code that has not
  changed, and a push-triggered scan would never see it.
- **Workflow actions are pinned by commit SHA**, not by tag - a tag is mutable,
  and these actions run with a token in this repository. Dependabot moves the
  SHAs forward.

Locally: `pnpm audit --audit-level high` before a release, and
`docker save <image> -o /tmp/i.tar && docker run --rm -v /tmp:/tmp aquasec/trivy
image --input /tmp/i.tar --severity HIGH,CRITICAL --ignore-unfixed` to reproduce
the image gate without pushing.

## Hardening checklist for production

Before exposing an instance to the internet, verify:

- [ ] `REDIS_PASSWORD` set to a strong random value and used by both Redis and
      the apps; Redis port not exposed on a public interface.
- [ ] Postgres / Jaeger / Redis ports bound to `127.0.0.1` (or behind a
      firewall); only the web port (via a TLS-terminating reverse proxy).
- [ ] `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` are strong random values.
- [ ] HTTPS enforced (the federation trust root depends on an authenticated
      channel for the actor document).
- [ ] You know who terminates that TLS. A CDN, a tunnelling service or a
      provider-operated proxy can serve a different actor document, with a
      different public key, to a peer fetching it for the first time. See
      [`FEDERATION.md`](FEDERATION.md) section 9.1. Terminating TLS in the
      instance's own process, or at a proxy under the same operator's control,
      is what removes that party from the trust model.
- [ ] Security headers + CSP active (verify with your browser devtools).
- [ ] Operator account uses a strong password; consider enabling 2FA once the
      better-auth `twoFactor` plugin migration is applied.
