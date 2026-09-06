# House of Esther — Frontend

Storefront + gated admin back-office. Semantic HTML5, mobile-first CSS, and vanilla
ES-module JavaScript — no framework (engineering-standards.md specifies none, and rules
out micro-frontends; this is one static build).

It talks only to the backend JSON API described in `../../api-contract.md`, via
`assets/js/api.js`. It never calls a third party and holds no secrets. Static assets are
meant to be served from the CDN edge, not proxied through the API origin.

## Run it locally

```bash
npm install
npm run gen          # (re)generate the static page shells from tools/gen-pages.js
npm run serve        # static server on http://localhost:4321
```

Point the UI at a running backend by setting `window.__HOE_CONFIG__ = { apiBase: '/api' }`
before `config.js` loads (e.g. an injected `<script>` at deploy), or run behind a proxy
that forwards `/api` to the backend.

## Layout

```
*.html, account/*.html, admin/*.html   generated page shells (baked title/description/canonical/JSON-LD)
assets/css/                            tokens → fonts → base → components → storefront|admin  (bundled by app.css / app-admin.css)
assets/js/                             shared modules (api, cart, auth, chrome, components, modal, order-view, money, dom, util, sizeguide)
assets/js/pages/                       one controller per route; renders into #view
tools/gen-pages.js                     page-shell generator (npm run gen)
tools/serve.js                         zero-dependency dev/preview static server
tests/                                 Playwright click-tests + an in-memory mock of the API
```

Every page: `<main id="main">` contains `#view`; the matching module in `assets/js/pages/`
boots the shared chrome (header/nav/search/cart-drawer/footer) and renders the dynamic
content. Admin modules render their own `.admin-shell` and re-check the admin session on
load (the server also re-checks the role on every `/api/admin/*` call — the UI gate is
convenience only).

## Deploy notes (for the deployment engineer)

- **Brand fonts.** `assets/css/fonts.css` declares `@font-face` for Fraunces + Inter but
  the `.woff2` files are not committed. Drop them in `assets/fonts/` (or repoint the
  `src:` URLs at the CDN), then re-enable the `@import "./fonts.css"` line in
  `assets/css/app.css` and `app-admin.css`. Until then the fallback stack
  (Playfair Display → Georgia for display, system UI for body) renders everything
  correctly.
- **robots.txt.** The committed `robots.txt` is the production file. On **staging**,
  replace it with `User-agent: *` / `Disallow: /` — a staging site Google can index is a
  bug.
- **sitemap.xml** lists static routes only. Product / category / journal detail URLs are
  query-string driven; emit a fuller sitemap from live catalogue data at build/deploy
  time if desired.
- Add `rel=preconnect` / DNS-prefetch to the real API origin if it is cross-origin
  (there is a placeholder `<link rel="preconnect" href="/api">` in every shell).
- Consider fingerprinting `assets/**` filenames at deploy for long-cache immutability;
  the HTML shells should stay short-cache.

## Deferred (per the lead, this milestone)

- **Admin draft-PDP preview** — the "Preview" control on the product editor is a disabled
  stub. `GET /api/products/{slug}` 404s for unpublished products by design.
- **Admin contact-message inbox** — the dashboard shows the `contactUnhandled` count as
  plain text only; contact-form submissions are handled by email. No admin contacts page.

## Tests

```bash
npx playwright test          # runs mobile + desktop projects against tools/serve.js
```

`tests/mock-api.js` is an in-memory implementation of the contract used only by the
click-tests; it is never shipped.

## Lint

`npm run lint` (or `npx eslint .`). CI/hook runs `npx eslint src/frontend --max-warnings 0`
from the repo root against `eslint.config.js` here.
