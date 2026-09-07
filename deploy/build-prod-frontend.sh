#!/usr/bin/env bash
# Assemble the PRODUCTION frontend bundle -> ./dist-prod
#
# Same pipeline as build-staging-frontend.sh, pointed at the prod Fly backend.
# robots.txt is STILL disallow-all: production has no custom domain yet, so the
# URL is esther-botique.netlify.app and must not be crawlable. Once the real
# domain is attached, flip robots.txt (see the manual checklist).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FE_ENV_LABEL="production" \
FE_DIST="$ROOT/dist-prod" \
BACKEND_ORIGIN="${PROD_BACKEND_ORIGIN:-https://esther-botique-prod.fly.dev}" \
  bash "$ROOT/deploy/build-staging-frontend.sh"
