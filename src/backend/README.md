# House of Esther — Backend

Clojure API implementing `api-contract.md` (103 endpoints — contract md5
`ff9bf99dd4adae4a893b7a7a172aabd1`). One service, one Postgres database,
versioned migrations.

## Stack

| Concern | Choice |
|---|---|
| Routing | reitit + ring (Jetty adapter) |
| JSON | muuntaja (plain maps in/out, `camelCase` keys end to end) |
| Validation | malli, at the API boundary |
| DB | Postgres via next.jdbc + HikariCP |
| Migrations | migratus (`resources/migrations/*.sql`, numbered) |
| Passwords | buddy-hashers (bcrypt+sha512) |
| M-Pesa | server-side Daraja client (`clj-http`); `MPESA_ENV=stub` for local |
| Logging | clojure.tools.logging + logback, structured event + context |

## Layout (backend-owned paths)

```
deps.edn                              project (root — agreed with lead)
src/backend/house_of_esther/          source, organised by feature slice
  catalog.clj cart.clj checkout.clj orders.clj payments.clj auth.clj
  account.clj reviews.clj subscriptions.clj contact.clj journal.clj
  content.clj legal.clj delivery.clj search.clj
  admin/…                             admin slices
  http/…                              cross-cutting HTTP (error, validate, middleware, page)
  db.clj present.clj money.clj util.clj config.clj runtime.clj obs.clj
  router.clj system.clj main.clj migrate.clj seed.clj
resources/migrations/                 numbered SQL migrations
resources/logback.xml, common-passwords.txt
test/backend/house_of_esther/         pure unit tests (no DB needed)
```

## Run it

### 1. Postgres

```bash
docker compose -f src/backend/docker-compose.yml up -d
```

or point `DATABASE_URL` at any Postgres 14+.

### 2. Environment

Copy `src/backend/env.example.txt` to `.env` and export it (nothing sensitive is
hardcoded — every secret is an env var). Minimum for local dev:

```bash
export DATABASE_URL="jdbc:postgresql://localhost:5432/house_of_esther?user=house_of_esther&password=house_of_esther"
export SESSION_COOKIE_SECURE=false
export MPESA_ENV=stub
export SEED_ADMIN_PASSWORD='pick-a-strong-one'
```

### 3. Migrate + seed + serve

```bash
clojure -X:migrate     # apply migrations (also runs automatically on startup)
clojure -X:seed        # SEED_PROFILE=demo (default): demo catalogue, zones, legal docs, admin user
clojure -M:run         # serve on :3000
```

### 4. Tests + lint

```bash
clojure -X:test
clj-kondo --lint src
```

`:test` runs DB-free pure-domain tests always (pricing, discounts, status
transitions, masking, pagination, validation flattening, the error envelope).
The end-to-end suite in `integration_test.clj` (full ring stack: muuntaja +
reitit + auth + CSRF + Postgres) runs automatically **when `DATABASE_URL` is
set** and no-ops otherwise:

```bash
docker compose -f src/backend/docker-compose.yml up -d
export DATABASE_URL="jdbc:postgresql://localhost:5432/house_of_esther?user=house_of_esther&password=house_of_esther"
export SEED_ADMIN_PASSWORD='pick-a-strong-one'
clojure -X:test
```

## Contract notes / intentional decisions

- **`camelCase` keyword keys throughout** the Clojure code (`:firstName`), so
  request and response maps match the contract with zero key translation.
- **`409 price_changed`** (`POST /api/orders`): the body is the standard
  `{ "error": { code, message } }` envelope **plus** a sibling `"order"` key
  carrying the corrected preview, exactly as the contract's D12 requires.
- **CSRF**: a readable `he_csrf` cookie is set on the first request that doesn't
  already have one (so a fresh visitor can make their first mutation). Mutating
  requests must echo it in `X-CSRF-Token`. The M-Pesa callback is exempt.
- **Guest cart**: httpOnly `he_cart` cookie; merged into the account cart on
  login/register.
- **Idempotency**: `POST /api/orders`, `POST /api/payments/mpesa/stk-push`, and
  the admin status/refund mutations store `(scope, key, body-hash) -> response`.
  Same key + different body → `409 idempotency_key_reused`.
- **Cache-Control**: catalog/content/legal/journal/zones GETs send
  `public, max-age=120, stale-while-revalidate=600`; `POST /checkout/quote` sends
  `private, max-age=30`; everything else `no-store`.
- **M-Pesa** is fully server-side. The frontend never sees Safaricom. With
  `MPESA_ENV=stub` the STK push returns a synthetic `checkoutRequestId` and the
  callback endpoint can be driven manually to simulate `paid`/`failed`.

## Launch switches

### `MPESA_ONLINE_ENABLED` (default `true`)

Master switch for online M-Pesa. Set it to `false` to run pay-on-delivery only
(production launch before Daraja credentials exist). When off:

- `POST /api/checkout/quote` returns `allowedPaymentMethods` of only
  `["pay_on_delivery"]` (or `[]` for a zone that disallows it), never `"mpesa"`.
- `POST /api/orders` with `paymentMethod: "mpesa"` -> `422` with
  `error.code = "payment_method_not_allowed"`; nothing is written.
- `POST /api/payments/mpesa/stk-push` -> the same `422`, no Daraja call.

Independent of the flag, the server also rejects a `pay_on_delivery` order
(`422 payment_method_not_allowed`) when the chosen delivery method does not allow
it, so the zone rule is not only a client-side convenience. Unset means enabled;
only `1`/`true`/`yes` enable it when set (a typo fails closed). Do not use
`MPESA_ENV=stub` in production: it shows a prompt that never charges anyone.

### `SEED_PROFILE` (`demo` default | `production`)

`clojure -X:seed` loads one of two profiles from the same data definitions
(`seed.clj`); an unknown value fails immediately.

- `demo`: unchanged — products, variants, collections, journal, discounts, demo
  home page, 21 images, staging admin. Re-runs upsert images and reset the admin
  password.
- `production`: only the 3 images the home page uses, delivery zones/methods with
  `pay_on_delivery_allowed = true` everywhere (revisit when online M-Pesa goes
  live), legal docs, the 7 nav categories (women, men, accessories, watches,
  fragrance, sneakers, wigs), a minimal home page (empty editorial blocks and
  social links, no featured collection), and the `usr_admin1` owner with
  `must_change_password = true`. `SEED_ADMIN_PASSWORD` is still required. Every
  insert is `ON CONFLICT DO NOTHING`, so re-running never overwrites the admin
  account or anything the owner has since edited.

## Seed images

`seed.clj` now seeds **real photographs** (21 images: products, category tiles,
journal covers, home hero + editorial, collection heroes). All are sourced from
Pexels under the Pexels License (free for commercial use, no attribution
required); per-image source page, photographer and licence are in
`brand/seed-images/CREDITS.md`, and real dimensions / byte sizes come from
`brand/seed-images/manifest.json`.

The image files are deployed into the frontend static build and served from
`{CDN_BASE_URL}/seed/{id}-{800|2000}.jpg`. The backend does not copy or serve the
files — it only stores the rows. `CDN_BASE_URL` is read from config, so
staging/prod point `seed.clj`'s URLs at their own origin (the deploy step sets it
to the frontend origin).

## Known gaps (flagged to lead)

- **Image ingest** (`POST /api/admin/images`) really re-encodes and enforces the
  size budget (full ≤ ~300 KB/2000px, thumb ≤ ~60 KB/800px, EXIF stripped) but
  writes to a local dir and returns CDN-shaped URLs. A real object-storage/CDN
  uploader and the WebP-alongside-JPEG variant must be wired before production —
  the app must not serve these bytes itself.
- **Notifications** are written to `notification_outbox`; a delivery worker
  (email/SMS) is not part of this milestone.
- **Facets** in `GET /api/products` are computed over the whole published
  catalogue, not re-filtered per query. `colors`/`sizes` facets return `[]`.
- **Rate limiting** (auth, contact, subscribe, review, STK, order lookup) is
  specified in the contract but not yet enforced here.
- **Proxy headers**: client IP on the agreement-acceptance row uses the socket
  peer by default; set `TRUST_PROXY_HEADERS=true` only when the app sits behind a
  proxy you control so `X-Forwarded-For` can be trusted.
