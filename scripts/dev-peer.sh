#!/usr/bin/env bash
# Tor-Sockets - peer instance launcher for local federation testing.
#
# Starts web on :3001 and an ingestion worker pointed at peer-db (5434) and
# peer-redis (6380), with its own Ed25519 keypair, so the two instances are
# distinct identities and can actually peer with each other.
#
# PEER_MODE=1 makes Next write to .next-peer/ instead of .next/, keeping this
# instance's build output separate from the main one.
#
# Requires the peer services from docker/compose.override.peer.yml.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_ROOT="$(pwd)"

# Load the base .env first, then override with the peer-specific values below.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

export DATABASE_URL='postgresql://torsockets:torsockets_peer@localhost:5434/torsockets?sslmode=disable'
export REDIS_URL='redis://localhost:6380'
# Absolute path on purpose: `next dev` runs with CWD=apps/web, so a relative
# path would not resolve against the repository root.
export FEDERATION_PRIVATE_KEY_PATH="${REPO_ROOT}/docker/volumes/federation/peer.ed25519"
export TOR_SOCKETS_BASE_URL='http://localhost:3001'
export BETTER_AUTH_URL='http://localhost:3001'
export PEER_MODE=1

pnpm --filter @tor-sockets/ingestion exec bun run src/index.ts &
INGESTION_PID=$!

pnpm --filter @tor-sockets/web exec next dev --port 3001 &
WEB_PID=$!

trap 'kill '"$INGESTION_PID"' '"$WEB_PID"' 2>/dev/null || true' EXIT INT TERM
wait
