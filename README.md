# Tor-Sockets

> Federated Tor network health and concentration monitor.

Tor-Sockets tracks the Tor network's health and centralization in real time:
how much guard/exit weight concentrates in a single AS, country, or hosting
provider, with anomaly detection and alerts. It is designed to **federate** -
any operator can run their own instance and peer with others, so the picture of
the network does not depend on any one service staying online, and no single
instance has to be taken at its word.

**Status**: running in production. Ingestion, the concentration and anomaly
engines, the UI, alerts, the operator console, the federation protocol and the
security hardening pass are all in place. The next milestone is the
first real peer: the federation cross-check only means something once two
independent hosts run it.

## What it does

- **Multi-source ingestion**: Onionoo as the primary source, the signed
  directory-authority consensus as an independent cross-check, CollecTor for
  history.
- **Concentration analysis**: Herfindahl-Hirschman Index per country, AS,
  hosting organisation and operator family, split by guard/middle/exit role,
  plus Nakamoto coefficients and guard-to-exit correlation risk.
- **Anomaly detection and alerts**: HHI jumps, Sybil-shaped relay clusters,
  rapid weight gain, consensus divergence. Delivered by email, Telegram or
  signed webhook.
- **Federation protocol v1**: Ed25519-signed, peer-to-peer, with gossip
  discovery. Specified in [`FEDERATION.md`](FEDERATION.md) so a third party can
  implement it.
- **Operator console**: three-tier relay ownership proof (consensus contact
  token, CLI Ed25519 signature, self-attested), with TOTP two-factor auth.
- **Open data**: documented REST API with OpenAPI, JSON and CSV export.
- Fully self-hostable with Docker Compose, OpenTelemetry tracing and Jaeger.

## Quickstart (local development)

### Requirements

- Docker and Docker Compose
- Node 22+
- pnpm 10+
- Bun 1.3+ (the ingestion worker runs on Bun)

### Run

```bash
git clone https://github.com/hernannh/tor-sockets.git
cd tor-sockets
cp .env.example .env                # set POSTGRES_PASSWORD, BETTER_AUTH_SECRET, REDIS_PASSWORD
docker compose up -d                # postgres + timescaledb, redis, jaeger
pnpm install
pnpm db:migrate
./scripts/dev.sh                    # web on :3000 + ingestion worker
```

Open http://localhost:3000.

Use `./scripts/dev.sh` rather than `pnpm dev` directly: turbo does not load
`.env` on its own, so the ingestion worker would start without `DATABASE_URL`
and `REDIS_URL`.

The dashboard is empty until the first ingestion cycle finishes. The worker
polls on a schedule and also runs once immediately on boot; a full Onionoo
fetch takes 30 to 90 seconds depending on the link.

### Verify

```bash
pnpm typecheck    # tsc --noEmit across the monorepo
pnpm lint         # biome
pnpm test         # unit and integration suites (integration needs docker up)
pnpm --filter @tor-sockets/web test:e2e   # Playwright, needs the dev server running
```

184 unit and integration tests (66 federation, 106 analysis, 12 ingestion) plus
34 Playwright end-to-end tests. The analysis suite runs against a real
Postgres with TimescaleDB rather than a mocked driver, which is why it needs
the Docker stack up. Nine of the end-to-end tests cover the Content-Security-
Policy and skip against the dev server, where the policy is relaxed because
Turbopack needs `unsafe-eval`; they run against a production build.

### Test federation locally

`docker/compose.override.peer.yml` brings up a second database and Redis on
different ports, and `./scripts/dev-peer.sh` starts a second instance on port
3001 with its own Ed25519 keypair. That is enough to exercise peering, signature
verification and the snapshot cross-check on one machine.

## Deployment

`docker/compose.prod.yml` builds and runs the full stack: web, ingestion worker,
database, Redis and a one-shot migration job.

```bash
docker compose --env-file .env -f docker/compose.yml -f docker/compose.prod.yml build
docker compose --env-file .env -f docker/compose.yml -f docker/compose.prod.yml run --rm migrate
docker compose --env-file .env -f docker/compose.yml -f docker/compose.prod.yml up -d
```

Two things that are easy to get wrong:

- **Build order is not optional.** `next build` prerenders the ISR pages and
  evaluates the auth route's module scope, and both need a reachable database.
  Start `db` and run `migrate` before building `web`.
- **`--env-file .env` is required on every invocation.** Passing
  `-f docker/compose.yml` sets the project directory to `docker/`, so the root
  `.env` is not picked up automatically and every `${VAR:?}` aborts.

The `./dc` wrapper in the repository root does both for you, and layers the
optional Cloudflare Tunnel overlay when `CF_TUNNEL_TOKEN` is set. That overlay
is a convenience for hosts with no reachable inbound ports, and it has a cost
worth understanding before using it: read
[`FEDERATION.md`](FEDERATION.md) section 9.1, which explains why whoever
terminates TLS for an instance becomes part of its trust model.

Read [`SECURITY.md`](SECURITY.md) before exposing an instance to the internet.
HTTPS is mandatory: the federation trust root assumes the actor document is
fetched over an authenticated channel.

## Documentation

- [`FEDERATION.md`](FEDERATION.md) - federation protocol v1 specification
- [`SECURITY.md`](SECURITY.md) - threat model, hardening checklist, dependency
  governance
- `/api/docs` on a running instance - the full REST API, from the OpenAPI
  description

## License

MIT for the code. Derived Tor network data is sourced under
[CC0](https://creativecommons.org/publicdomain/zero/1.0/) via
[Onionoo](https://metrics.torproject.org/onionoo.html) and
[CollecTor](https://metrics.torproject.org/collector.html).

## Acknowledgements

Data sourced from [The Tor Project](https://www.torproject.org/) under
[CC0](https://creativecommons.org/publicdomain/zero/1.0/) via
[Onionoo](https://metrics.torproject.org/onionoo.html) and
[CollecTor](https://metrics.torproject.org/collector.html). "Tor" and the Onion
Logo are registered trademarks of The Tor Project, Inc.
