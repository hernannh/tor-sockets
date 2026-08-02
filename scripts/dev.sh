#!/usr/bin/env bash
# Tor-Sockets - dev launcher: loads .env, then starts web and the ingestion
# worker through turbo.
#
# It exists because turbo does not read .env by itself, so running `pnpm dev`
# directly leaves the worker without DATABASE_URL and REDIS_URL.
#
# Usage: ./scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Load .env into this process and export it to the children.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

exec pnpm dev
