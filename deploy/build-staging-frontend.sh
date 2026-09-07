#!/usr/bin/env bash
# Assemble a frontend bundle for Netlify. Defaults target STAGING; override the
# env vars below to build the production bundle (see deploy/build-prod-frontend.sh).
#
# - copies the static site from src/frontend (no app source is modified)
# - overrides robots.txt with the "disallow everything" version. Both staging and
#   the current production deploy use disallow-all: production has no custom
#   domain yet, so its URL is a *.netlify.app subdomain that must NOT be
#   crawlable. Flip to the allow-crawl robots.txt only once the real domain is
#   attached (see the manual checklist in the deploy report).
# - adds _redirects so the browser talks to /api same-origin and Netlify
#   proxies it to the Fly backend (the API client uses credentials:'same-origin',
#   so a cross-origin API host would drop cookies)
# - adds _headers with X-Robots-Tag: noindex as a second safety net
#
# sitemap.xml is left exactly as committed: it only ever contains real
# production-domain URLs and is never regenerated for a *.netlify.app host.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/src/frontend"
DIST="${FE_DIST:-$ROOT/dist}"
BACKEND_ORIGIN="${BACKEND_ORIGIN:-${STAGING_BACKEND_ORIGIN:-https://esther-botique-staging.fly.dev}}"
ENV_LABEL="${FE_ENV_LABEL:-staging}"

rm -rf "$DIST"
mkdir -p "$DIST"

# Static site only — leave out tooling, tests and deps.
rsync -a \
  --exclude 'node_modules/' \
  --exclude 'tests/' \
  --exclude 'tools/' \
  --exclude 'test-results/' \
  --exclude 'playwright-report/' \
  --exclude 'playwright.config.js' \
  --exclude 'eslint.config.js' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude '.gitignore' \
  --exclude 'README.md' \
  "$SRC"/ "$DIST"/

cp "$ROOT/deploy/robots.staging.txt" "$DIST/robots.txt"

# Seed product/editorial photos: brand/seed-images/{id}-{2000,800}.jpg -> /seed/ on the
# site origin. The backend returns {CDN_BASE_URL}/seed/{id}-{size}.jpg image URLs and
# deploy points CDN_BASE_URL at this Netlify origin.
mkdir -p "$DIST/seed"
cp "$ROOT/brand/seed-images/"*.jpg "$DIST/seed/"

cat > "$DIST/_redirects" <<EOF
# $ENV_LABEL: keep the browser same-origin; Netlify proxies the API to Fly.
/api/*  $BACKEND_ORIGIN/api/:splat  200
EOF

cat > "$DIST/_headers" <<'EOF'
/*
  X-Robots-Tag: noindex, nofollow
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff

# Asset filenames are not fingerprinted yet, so give the CDN edge a real (short)
# cache window instead of must-revalidate-on-every-hit. The engineering standard
# tolerates slightly stale static reads; 5 min is well inside that.
/assets/*
  Cache-Control: public, max-age=300, stale-while-revalidate=86400

# Seed photo filenames are stable (id + fixed size), so they can cache hard.
/seed/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/site.webmanifest
  Content-Type: application/manifest+json
EOF

echo "built $DIST for $ENV_LABEL (backend origin: $BACKEND_ORIGIN)"
