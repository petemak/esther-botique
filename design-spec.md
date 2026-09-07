# Design Spec — House of Esther

_From `brand-brief.md`, constrained by `engineering-standards.md`. See `scope-checklist.md`
for capability reasoning and `api-contract.md` for the endpoints behind every dynamic
block. Layout notes are build-intent, not pixel specs._

---

## 0. Design system (applies to every page)

### Brand tokens
- **Colour:** Ink Navy `#1B2A4A` (text, headers, primary buttons), Warm Clay `#C56A4E`
  (secondary CTA, sale/energy accents, links on Bone), Bone `#F4EEE4` (page ground),
  Muted Brass `#B08A46` (hairlines, icons, "New In" tags — under 10% of any layout),
  pure black reserved for legal/functional microcopy only. White `#FFFFFF` for cards and
  product-image grounds.
- **Type:** Fraunces for H1/H2 and campaign headlines; Inter all-caps + wide tracking
  for eyebrows, section labels, nav, buttons; Inter regular for body and UI. Fallback
  stack: Playfair Display → Fraunces for headings if testing finds Fraunces too
  expressive. Fonts self-hosted from the CDN (WOFF2, `font-display: swap`, preloaded).
- **Voice in UI copy:** confident, warm, discerning, specific about fit and quality.
  No "exclusive drop", no shouting, minimal exclamation. Empty states, errors and
  confirmations all carry this voice ("We could not reach M-Pesa just then — try again
  and we will hold your cart").
- **Layout feel:** editorial, breathable, gallery-like. Generous whitespace, a max
  content width around 1280px, 12-column grid on desktop collapsing to 4 on mobile.
  Mobile-first — every layout is designed at 360px first.

### Accessibility (WCAG 2.1 AA — non-negotiable per standards)
- All interactive elements keyboard reachable, visible focus ring (Brass, 2px offset).
- Colour is never the only signal (sale price also labelled; stock state has text).
- Check Warm-Clay-on-Bone and Brass-on-Bone contrast; if body text fails, use Clay/Brass
  for large text and non-text UI only, Ink Navy for body.
- Images have meaningful `alt`; decorative images `alt=""`.
- Forms: label every field, describe errors in text tied via `aria-describedby`, never
  rely on placeholder as label.
- Respect `prefers-reduced-motion` for the hero and any transitions.

### Global components (see full inventory in section 4)
Header/nav, announcement bar, footer, product card, price block, variant selector,
quantity stepper, filter panel, sort control, pagination / "load more", breadcrumb,
rating stars, review card, form field set, button set, toast/inline alert, modal /
lightbox, cart drawer, address form, order-status timeline, trust-strip, newsletter
block, image gallery.

---

## 1. Page list

### Public / storefront
1. Home
2. Category / listing page (Women, Men, Accessories, Watches, Fragrance, Sneakers, Wigs) — one template
3. New In (curated listing, same template + editorial header)
4. Sale (listing template, filtered to discounted items)
5. Search results (listing template, keyword-driven)
6. Product detail (PDP)
7. Cart
8. Checkout
9. Order confirmation / thank-you
10. Order tracking (guest-accessible via order number + email; also linked from account)
11. About / Our Story
12. The Journal — listing (editorial + "Shop the Look")
13. Journal article / lookbook detail
14. Size Guide
15. Delivery & Returns (info, not policy text)
16. Help / FAQ
17. Contact
18. Terms of Sale (legal, versioned)
19. Privacy Policy (legal, versioned)
20. Returns & Refund Policy (legal, versioned)
21. Newsletter / new-stock signup confirmation + unsubscribe landing
22. 404 / empty-state page

### Customer account (auth required unless noted)
23. Sign in / Register (combined, guest-checkout entry too)
24. Forgot password / Reset password
25. Account overview
26. Order history + order detail
27. Saved addresses
28. Profile & notification preferences
29. Wishlist

### Admin / back-office (auth + admin role, gated routes in the same build)
30. Admin sign in
31. Admin dashboard (today's orders, low-stock, pending reviews)
32. Products list
33. Product create / edit (variants, stock, images, SEO)
34. Inventory / stock adjustments
35. Collections & categories
36. Orders list
37. Order detail (fulfilment, payment, tracking, agreement-acceptance record)
38. Reviews moderation
38A. Contact messages (read-only inbox — list, detail, mark handled)
39. Subscribers & broadcasts (new-stock / back-in-stock announcements)
40. Homepage content editor
41. Legal documents editor (publish new versions)
42. Discount codes

---

## 2. Sections per page

### 1. Home
Target: give a first-time visitor from Instagram fast proof of taste + reliability, and
route them into the catalog in one tap.
- **Announcement bar** — one line, e.g. countrywide delivery + M-Pesa. Dismissible.
  Content from home content API.
- **Header/nav** — logo centre or left, category links, search, account, cart count.
- **Hero** — one editorial image (or a 2-slide set, reduced-motion aware), Fraunces
  headline, one sentence of brand promise, single primary CTA ("Shop new in"). Layout:
  full-bleed image, text block left-aligned over a scrim on mobile, beside image on
  desktop. Image is the one large asset on first paint.
- **Trust strip** — 3-4 short items with Brass icons: M-Pesa & pay on delivery /
  delivered countrywide / real photos, honest sizing / responsive support. Row on
  desktop, 2x2 on mobile.
- **Shop by category** — 7 tiles (one per category) as an image grid, 3-4 across
  desktop, 2 across mobile, each a thumbnail + label.
- **New in** — horizontal scroll / grid of ~8 product cards from the `new-arrivals`
  collection. "View all" link.
- **Editorial / Shop the Look** — 1-2 lookbook blocks: large image + short Fraunces
  caption + link to the Journal article, whose products are shoppable.
- **Featured collection** — optional second curated rail (e.g. "Workwear", "Fragrance").
- **From the Journal** — 3 latest article cards.
- **Newsletter / new-stock block** — email field, one line of copy ("Be first to know
  when new pieces land"), double opt-in.
- **Footer.**
- Dynamic: home content (hero, editorial blocks, featured collection ids), product rails,
  latest journal posts, newsletter subscribe.

### 2. Category / listing template
Target: someone browsing a category wants to scan a curated set and filter to their size.
- **Breadcrumb** — Home / Category.
- **Category header** — Fraunces H1, one or two sentences of curatorial copy, optional
  banner image. For New In / Sale, swap copy + tag styling.
- **Toolbar** — result count, sort control (Newest, Price low-high, Price high-low,
  Best rated), filter toggle (opens panel/drawer on mobile, sidebar on desktop).
- **Filter panel** — facets: category/subcategory, size, colour (swatches), price range,
  availability (in stock only), "new in", "on sale". Applied filters shown as removable
  chips. All filtering is server-driven via query params (shareable URLs).
- **Product grid** — product cards, 2 across mobile, 3-4 desktop. Card: thumbnail
  (lazy-loaded below the fold), name, price block, "New In" / sale tag, quick colour
  swatches, rating if present. Whole card is one link to the PDP.
- **Pagination** — "Load more" button (not infinite scroll — the boutique should feel
  edited) plus real numbered pages in the URL for crawlers.
- **Empty state** — voice-led message + link back to New In (used for "no results",
  over-filtered, and search).
- Dynamic: product list with facets, filter option metadata.

### 3-5. New In / Sale / Search results
Same template as (2). New In: `collection=new-arrivals`. Sale: `onSale=true`. Search:
`q=` term, header shows the query and count; if zero results, show suggestions + popular
categories. Search results page also renders "did you mean" if the API returns it.

### 6. Product detail (PDP)
Target: the conversion + trust page. Answer sizing, quality, and "will others vouch for
this" before the add-to-cart.
- **Breadcrumb.**
- **Gallery** — 3-6 images. Mobile: swipeable carousel with dots. Desktop: one large
  image + thumbnail column; click opens full-size lightbox (only place the full asset
  loads). First image eager, rest lazy.
- **Buy box** — product name (Fraunces H1), price block (current, was-price + "Save X"
  if discounted, all text-labelled), short one-line description, variant selectors
  (size as buttons, colour as swatches; disabled/again-styled when a combination is out
  of stock), quantity stepper, stock cue ("In stock" / "Low stock — 2 left" / "Out of
  stock — notify me"), primary "Add to cart", secondary "Add to wishlist". If out of
  stock: email field for back-in-stock alert instead of add-to-cart.
- **Delivery & payment note** — inline: delivery estimate by region, M-Pesa + pay on
  delivery, returns window. Links to Delivery & Returns.
- **Size guide** — link/'"Find your size" that opens the Size Guide modal, plus
  per-garment measurements table where available.
- **Product story** — the Etsy-style block: materials, why this piece was chosen, care
  ("We picked this leather because it softens instead of cracking"). Fraunces subhead,
  body copy, optional spec list.
- **Details / spec accordion** — composition, fit, dimensions, country of origin, SKU.
- **Reviews** — average rating + count, distribution bar, individual review cards
  (author first name, rating, date, verified-purchase badge, body), "Write a review"
  (opens form; auth required; goes to moderation). Pagination on reviews.
- **You may also like** — 4 related product cards.
- Dynamic: product detail, variant availability, reviews list + submit, related products,
  back-in-stock subscribe, add-to-cart, wishlist toggle.

### 7. Cart
Target: confirm what they're buying and the all-in cost before committing.
- **Line items** — thumbnail, name (link), variant, unit price, quantity stepper,
  line total, remove. Editing quantity revalidates stock server-side.
- **Order summary** — subtotal, estimated delivery (with a "where to?" region selector
  that calls the quote endpoint), discount code field, estimated total. Note that final
  delivery fee confirms at checkout.
- **Primary CTA** — "Checkout". Secondary — "Continue shopping".
- **Reassurance** — mini trust strip (secure M-Pesa, pay on delivery available, easy
  returns).
- **Empty cart state** — voice-led, links to New In and categories.
- Also available as a **cart drawer** (slide-over) triggered from the header on any page,
  with line items + subtotal + "View cart" / "Checkout".
- Dynamic: cart read/update, quote, discount validation.

### 8. Checkout
Target: get a mobile buyer through payment in as few fields as possible, and capture
agreement acceptance.
Single page, stacked sections (accordion on mobile), with an order summary that is
sticky on desktop / collapsible on mobile.
- **Contact** — email + phone (phone required — needed for M-Pesa and delivery). Option
  to sign in for saved details; guest allowed.
- **Delivery address** — recipient name, phone, county, town/estate, delivery
  instructions/landmark. Saved-address picker if signed in. Selecting a location
  triggers a fresh **quote** (delivery fee + which payment methods are available there).
- **Delivery method** — options returned by the quote (e.g. Nairobi next-day, upcountry
  courier), each with fee and ETA.
- **Payment** — radio: **M-Pesa (pay now)** → on submit, backend triggers an STK push;
  UI shows "Check your phone and enter your M-Pesa PIN" with a polling spinner and a
  resend option. **Pay on delivery** → shown only if the quote allows it for that
  location; copy explains cash or M-Pesa to the rider on arrival.
- **Review & accept agreement** — order lines, address, delivery, totals, and a
  **required, unticked checkbox**: "I have read and accept the Terms of Sale and the
  Returns & Refund Policy" with inline links that open each document (current version)
  in a modal. The order cannot be placed until it is ticked. On submit the acceptance
  is recorded server-side (customer identity, timestamp, both document versions,
  IP/user-agent) as a side effect of order creation — see `api-contract.md`
  `POST /api/orders` and the `agreementAcceptance` object. This is a real write, not a
  cosmetic checkbox.
- **Place order** button — disabled until valid + checkbox ticked. Sends an
  `Idempotency-Key` so a retry or double-tap cannot double-order or double-charge.
- Dynamic: quote, address save, order creation (+ agreement acceptance write), M-Pesa
  STK push initiation + status polling.

### 9. Order confirmation / thank-you
- **Confirmation header** — "Thank you, {firstName} — your order is in" (voice-led),
  order number, payment state (Paid via M-Pesa / To pay on delivery).
- **What happens next** — 3 steps: we confirm and pack → we dispatch and text you a
  tracking link → delivery to your door. Expected timeframe for their region.
- **Order summary** — items, address, totals, payment method.
- **CTAs** — "Track this order" (to page 10), "Create an account to track future
  orders" (if guest; pre-fills email), "Continue shopping".
- **Agreement receipt line** — "You accepted the Terms of Sale (v{x}) and Returns Policy
  (v{y}) on {date}." with links.
- Dynamic: order read by number (session-scoped or one-time token from checkout).

### 10. Order tracking
Target: "where is my House of Esther order".
- **Lookup form** (if arriving cold) — order number + email; or auto-loaded from account
  / confirmation link token.
- **Status timeline** — Placed → Confirmed → Packed → Dispatched → Out for delivery →
  Delivered, with timestamps for completed steps and the courier/tracking reference once
  dispatched. Cancelled/refunded states shown when applicable.
- **Order summary** — collapsed, expandable.
- **Support prompt** — "Something wrong? Message us on WhatsApp / contact support",
  deep-linking to Contact with the order number pre-filled.
- Dynamic: order status read.

### 11. About / Our Story
Target: "House of Esther Nairobi — who are they / are they legit".
- **Intro** — Fraunces headline + the founding story (Esther's eye, why the boutique
  exists, the gap between marketplace scale and boutique warmth).
- **How we choose** — the curation promise, in specifics.
- **Our delivery & support promise** — the explicit reliability pledge the brief calls
  for (fulfilment speed, responsive support, honest sizing). This is a differentiator,
  state it plainly.
- **The boutique** — note the flagship store coming within the year (placeholder for
  address / hours later).
- **Contact + social** — Instagram, TikTok, WhatsApp, email.
- Mostly static; social links and any "as featured in" logos can come from home content
  API.

### 12. The Journal — listing
- **Header** — short intro to the Journal ("Notes on fit, care, and what we're wearing").
- **Article grid** — cards: cover image, category tag (Style / Care / Lookbook), title,
  excerpt, date.
- **Pagination.**
- Dynamic: article list.

### 13. Journal article / lookbook detail
- **Article header** — title (Fraunces), date, hero image.
- **Body** — long-form content blocks (text, images, pull quotes).
- **Shop the Look** — inline product cards for items referenced, add-to-cart from the
  article.
- **Related articles** — 3 cards.
- Dynamic: article by slug, referenced products.

### 14. Size Guide
- **Intro** — how House of Esther sizing works, how to measure.
- **Tables per category** — Women's tops/dresses, Women's bottoms, Men's tops, Men's
  bottoms, Shoe size conversions (EU/UK/US), Wig cap sizes. Toggle by category.
- **Measuring guide** — labelled diagram + steps.
- Also rendered as a **modal** from the PDP (same content, scoped to that product's
  category).
- Static content (can be CMS-backed later); no dynamic dependency at launch.

### 15. Delivery & Returns (informational)
- **Delivery** — regions, timeframes, fees table, tracking explanation.
- **Payment** — M-Pesa flow explained, pay-on-delivery rules (where available, what to
  have ready).
- **Returns** — plain-language summary of the window, condition, and process, with a
  clear link to the full Returns & Refund Policy and to Contact to start a return.
- Static; fees table should match the quote engine's zones (single source: config the
  backend also reads).

### 16. Help / FAQ
- **Search / jump links** by topic: Ordering, Payment, Delivery, Sizing, Returns,
  Account, Product care.
- **Accordion Q&A** per topic.
- **Still need help** — link to Contact + WhatsApp.
- Static at launch; structure supports FAQ schema.

### 17. Contact
Target: "House of Esther contact / customer service".
- **Contact form** — name, email, phone, topic (dropdown: Order issue, Return, Product
  question, Wholesale/press, Other), optional order number, message. Success + error
  states in brand voice. Server-side validation + spam protection (honeypot + rate
  limit).
- **Direct channels** — WhatsApp click-to-chat, email, response-time expectation
  ("We reply within one business day").
- **Boutique / hours** — placeholder until the flagship opens.
- Dynamic: contact form submit (persisted to `contact_messages` and triaged in the admin
  Contact messages inbox, page 38A).

### 18-20. Legal pages (Terms of Sale, Privacy Policy, Returns & Refund Policy)
- **Document header** — title, "Version {n} — effective {date}", link to previous
  versions if any.
- **Body** — rendered document sections with anchor links.
- **Footer note** — contact route for questions.
- Dynamic: each fetched from the legal-document API by `docType`; the current version is
  what checkout links to and records acceptance against. CDN-cacheable (rarely changes).

### 21. Subscription confirm / unsubscribe landing
- Minimal page: confirms double opt-in ("You're on the list") or unsubscribe ("You're
  off the list — no hard feelings"), with a link back to the store.
- Dynamic: confirm token, unsubscribe token.

### 22. 404 / error
- Voice-led message, search field, links to New In and categories.

### 23. Sign in / Register
- **Tabs or toggle**: Sign in (email + password) / Create account (first name, email,
  phone, password). "Continue as guest" path visible when reached from checkout.
- Password rules shown inline; forgot-password link.
- Post-login redirect back to intended page (cart/checkout/PDP); guest cart merges into
  the account cart server-side.
- Dynamic: register, login.

### 24. Forgot / reset password
- Request form (email) → "If that email exists we've sent a link" (no account
  enumeration). Reset form (new password + confirm) behind a tokenised URL.
- Dynamic: forgot, reset.

### 25. Account overview
- Greeting, quick cards: latest order + status, saved addresses count, wishlist count,
  notification preferences shortcut. Sign out.

### 26. Order history + detail
- **List** — order number, date, item thumbnails, total, status badge.
- **Detail** — same content as Order tracking page plus invoice-style summary and the
  agreement-acceptance receipt line; "Buy again" adds items back to cart; "Start a
  return" links to Contact with order pre-filled.
- Dynamic: account orders list + detail.

### 27. Saved addresses
- List of addresses, add/edit/delete, set default. Address form component (county,
  town/estate, phone, instructions).
- Dynamic: address CRUD.

### 28. Profile & notification preferences
- **Profile** — name, email, phone, password change.
- **Notifications** — toggles: order updates (always on, informational), new-arrival
  announcements, back-in-stock alerts, Journal. Unsubscribe-all.
- Dynamic: profile read/update, notification preferences read/update.

### 29. Wishlist
- Grid of saved products with price + stock state, add-to-cart, remove. For signed-in
  users; guests prompted to sign in to save.
- Dynamic: wishlist list/add/remove.

### 30. Admin sign in
- Email + password, no public "register". Separate rate limiting + lockout. Server
  enforces admin role on every `/api/admin/*` call regardless of this screen.

### 31. Admin dashboard
- **Today** — new orders count, unpaid pay-on-delivery orders, orders awaiting dispatch.
- **Needs attention** — low-stock variants (below threshold), out-of-stock published
  products, reviews pending moderation, contact messages unhandled (links to Contact
  messages, page 38A).
- **Quick links** — add product, view orders, send a broadcast.
- Dynamic: admin summary endpoint.

### 32. Products list (admin)
- Table: image, name, category, price, total stock, status (Draft/Published/Archived),
  updated date. Search + filter by category/status. Bulk publish/archive.
- Dynamic: admin product list.

### 33. Product create / edit (admin)
- **Basics** — name, slug (auto from name, editable), category, subcategory, short
  description, product story (rich text), care, spec list.
- **Media** — image uploader: drag-drop, reorder, set alt text, mark primary. On upload
  the backend re-encodes to budget (full <= ~300 KB / ~2000px, thumb <= ~60 KB / ~800px)
  and stores to object storage / CDN; the form only ever holds URLs + ids, never the
  original bytes for display.
- **Variants** — define option axes (e.g. Size, Colour); grid of generated variants,
  each with SKU, price, compare-at price, stock quantity, low-stock threshold, per-variant
  image ref, enabled flag.
- **Pricing & tax** — base price, currency KES, VAT-inclusive flag.
- **SEO** — meta title, meta description, defaults derived from name/description.
- **Publishing** — Draft / Published / Archived; publish is what makes it visible on the
  storefront and searchable.
- **Preview** — a working "Preview" link, available on a product of any status. Opens the
  storefront PDP in a new tab in preview mode (calls
  `GET /api/admin/products/{id}/preview` — admin-guarded, `no-store` — which returns the
  exact public `ProductDetail` shape for draft / published / archived products). Preview
  mode shows a persistent "Draft — not visible to customers" banner (driven by the
  response's `previewStatus`) and a mobile / desktop width toggle so Esther can do the
  phone-width check before publishing.
- **Publish latency** — published catalog pages are CDN-cached (~2 min `max-age`), so a
  freshly published or edited product can lag on the public storefront by up to a couple
  of minutes; Preview and every admin view read live, uncached data, so use Preview to
  verify.
- Dynamic: admin product create/update, draft-product preview, image upload, variant
  update, inventory.

### 34. Inventory / stock adjustments (admin)
- Table of variants with current stock; inline quick-edit; "record adjustment" with
  reason (restock, correction, damage, return-to-stock) creating an auditable entry.
- Dynamic: inventory adjustments list + create.

### 35. Collections & categories (admin)
- Manage the 7 top categories + subcategories (name, slug, image, curatorial copy, sort).
- Manage curated collections (New In is rule-based on publish date; manual collections
  like "Shop the Look — September" have an ordered product list).
- Dynamic: category + collection CRUD.

### 36. Orders list (admin)
- Table: order number, date, customer, county, total, payment method + state, fulfilment
  status. Filters: status, payment state, date range, region. Search by order number /
  phone / email.
- Dynamic: admin orders list.

### 37. Order detail (admin)
- **Customer & delivery** — contact, address, instructions.
- **Items** — lines, variant, quantity, price; stock was decremented at order creation.
- **Payment** — method, state, M-Pesa receipt number / callback result, "mark as paid"
  for pay-on-delivery on delivery, refund action (records a refund; does not itself move
  money at launch — Esther refunds via M-Pesa and records the reference).
- **Fulfilment** — advance status through the timeline; set courier + tracking reference
  at dispatch; each transition can fire the customer notification.
- **Agreement acceptance record** — read-only panel: which Terms of Sale + Returns
  Policy versions were accepted, timestamp, captured IP/user-agent, acceptance id. This
  is the retrievable proof; it is never editable from the UI.
- **Notes / activity log** — internal timeline of changes.
- Dynamic: admin order read, status update, payment update, refund, notification trigger.

### 38. Reviews moderation (admin)
- Queue of pending reviews: product, author, rating, body, verified-purchase flag.
  Approve / reject (with reason). Approved reviews appear on the PDP.
- Dynamic: admin reviews list + moderate.

### 38A. Contact messages (admin) — read-only inbox
Target: let Esther see and triage the messages sent from the public Contact form
(page 17). Read-only — there is no in-app reply at launch; she responds by email (or
WhatsApp) outside the app. This page only tracks what has come in and what has been dealt
with.
- **List** — admin table of messages: reference (e.g. MSG-2026-0442), received date,
  name, topic (Order issue / Return / Product question / Wholesale-press / Other), order
  number if given, a one-line message excerpt, handled state. Filters: handled /
  unhandled (defaults to unhandled), topic. Standard admin table + pagination.
- **Detail** — full message body, sender name, email, phone, topic, linked order number
  (click through to the admin order detail when one was given), submitted timestamp, and
  handled state with handledAt / handledBy.
- **Mark handled** — a single toggle ("Mark handled" / "Reopen"). Marking handled records
  who and when; it sends nothing to the customer. Page copy states plainly that replies
  go out by email outside the app at launch.
- Dynamic: admin contact list (`GET /api/admin/contacts`), detail
  (`GET /api/admin/contacts/{reference}`), mark handled
  (`PATCH /api/admin/contacts/{reference}`). The dashboard "contact messages unhandled"
  count links here.

### 39. Subscribers & broadcasts (admin)
- **Subscribers** — list with source (footer, PDP back-in-stock, checkout opt-in),
  status (pending/confirmed/unsubscribed), date. Export.
- **Broadcasts** — compose a "new stock" announcement: subject, intro copy, pick
  products/collection, preview, send to confirmed subscribers who opted into
  new-arrival alerts. Back-in-stock alerts fire automatically when a subscribed
  variant's stock goes from 0 to positive.
- Dynamic: admin subscribers list, broadcast create/send.

### 40. Homepage content editor (admin)
- Edit: announcement bar text + link + on/off, hero (image, headline, subcopy, CTA
  label + target), editorial/Shop-the-Look blocks (image, caption, article link),
  featured collection reference, social links, "as featured in" logos.
- Dynamic: home content read/update.

### 41. Legal documents editor (admin)
- Per `docType` (terms-of-sale, privacy, returns): edit body, set effective date,
  **publish a new version** (increments version; previous versions retained and still
  referenceable by any order that accepted them).
- Dynamic: admin legal read/list/publish.

### 42. Discount codes (admin)
- Create codes: code, type (percent / fixed KES / free delivery), value, min spend,
  usage limit (total + per customer), start/end date, active flag, eligible categories.
- Dynamic: discount CRUD; validation happens server-side at cart/checkout.

---

## 3. Coverage map — every "applies" category has a home

| Category (scope-checklist) | Where it lives |
|---|---|
| Catalog / inventory | Pages 2-6 (storefront), 32-35 (admin products, inventory, collections) |
| Payments / checkout | Page 8 (checkout: M-Pesa STK + pay on delivery), 9 (confirmation), 37 (admin payment/refund) |
| Accounts / auth | Pages 23-29 (customer), 30 (admin sign in); guest checkout on page 8 |
| Admin / back-office | Pages 30-42 plus 38A (gated routes in the one build, server-enforced admin role) |
| Search / discovery | Pages 2-5 (facets, sort, collections), search box in global header, type-ahead |
| Notifications | Triggered from checkout (page 8), admin order transitions (page 37), broadcasts + back-in-stock (page 39); preferences on page 28; confirm/unsub landing page 21. Inbound Contact-form messages land in the read-only Contact messages inbox (page 38A) — the dashboard "contact messages unhandled" count links there and replies go out by email |
| Legal / compliance | Pages 18-20 (versioned docs), 41 (admin editor), footer links, checkout modal links |
| Customer agreements (partial) | Page 8 "Review & accept agreement" section — required unticked checkbox, recorded server-side as a side effect of `POST /api/orders`; receipt shown on pages 9, 26; proof panel on admin page 37 |

---

## 4. Component inventory (reused across pages)

- **Header / nav** — logo, category links (7) + New In + Sale, search trigger, account,
  wishlist, cart count. Sticky on scroll. Mobile: hamburger drawer, persistent search +
  cart.
- **Announcement bar** — dismissible, content-driven.
- **Footer** — 4 columns: Shop (categories), Help (FAQ, Delivery & Returns, Size Guide,
  Contact, Track order), About (Our Story, Journal, the boutique), Legal (Terms of Sale,
  Privacy, Returns & Refund). Newsletter block, social icons, payment marks (M-Pesa),
  copyright.
- **Product card** — thumbnail (lazy below fold), name, price block, tag (New In / Sale),
  colour swatches, optional rating. Entire card is one link.
- **Price block** — current price; if discounted: was-price (struck + "Was" label) and
  "Save KES X"; all states text-labelled, not colour-only.
- **Variant selector** — size buttons + colour swatches; unavailable combos disabled with
  accessible naming; drives stock cue.
- **Quantity stepper** — −/+ with typable field, min 1, max = available stock.
- **Filter panel** — faceted, chip summary, sidebar on desktop / drawer on mobile.
- **Sort control** — select.
- **Pagination / load more** — button + real paged URLs.
- **Breadcrumb.**
- **Rating stars** — display + input variant for the review form.
- **Review card.**
- **Form field set** — label, input, help text, inline error tied by `aria-describedby`,
  required marker. Covers text, email, tel, select, textarea, checkbox, radio group.
- **Button set** — primary (Ink Navy fill), secondary (Warm Clay outline/fill), tertiary
  (text link), destructive; loading and disabled states.
- **Toast / inline alert** — success / info / warning / error, voice-led.
- **Modal / lightbox** — image lightbox, size-guide modal, legal-document modal.
- **Cart drawer** — slide-over line items + subtotal + CTAs.
- **Address form** — name, phone, county (select), town/estate, instructions, default
  toggle.
- **Order-status timeline** — shared by order tracking, account order detail, admin
  (read-only vs editable variants).
- **Trust strip** — icon + label items.
- **Newsletter block** — email + submit + consent line + double-opt-in feedback.
- **Image gallery** — carousel (mobile) / thumb-column + main + lightbox (desktop).
- **Admin table** — sortable columns, filters, row actions, bulk actions, pagination
  (reused across products, orders, inventory, reviews, contact messages, subscribers,
  discounts).
- **Admin form shell** — section cards, sticky save bar, dirty-state guard.
- **Rich text editor** — product story, Journal, legal docs.
- **Image uploader** — drag-drop, reorder, alt text, primary flag, shows re-encoded
  result + size.

---

## 5. Dynamic content summary (full shapes in `api-contract.md`)

| # | Dynamic block | Pages | Direction |
|---|---|---|---|
| D1 | Home content (hero, editorial, featured) | Home | read |
| D2 | Product list + facets | Category, New In, Sale, Search, Home rails | read |
| D3 | Search suggestions (type-ahead) | Global header | read |
| D4 | Product detail + variant availability | PDP | read |
| D5 | Related products | PDP, Journal | read |
| D6 | Reviews list | PDP | read |
| D7 | Review submit | PDP | write (auth) |
| D8 | Cart (get / add / update / remove) | Cart, drawer, PDP | read + write |
| D9 | Discount validation | Cart, Checkout | write/validate |
| D10 | Delivery quote (fee + allowed payment methods) | Cart, Checkout | write/compute |
| D11 | Delivery zones / fees table | Delivery & Returns, Checkout | read (cacheable) |
| D12 | Order creation (+ agreement acceptance side effect) | Checkout | write (idempotent) |
| D13 | M-Pesa STK push initiate | Checkout | write (idempotent) |
| D14 | Payment status poll | Checkout | read |
| D15 | M-Pesa callback (Safaricom → backend) | — | inbound webhook |
| D16 | Order read by number + email/token | Confirmation, Tracking | read (no-store) |
| D17 | Auth: register / login / logout / me | Sign in, header | write + read |
| D18 | Password forgot / reset | Forgot/reset | write |
| D19 | Account orders list + detail | Account | read (auth) |
| D20 | Addresses CRUD | Addresses, Checkout | read + write (auth) |
| D21 | Profile read/update | Profile | read + write (auth) |
| D22 | Notification preferences read/update | Profile | read + write (auth) |
| D23 | Wishlist list / add / remove | Wishlist, PDP | read + write (auth) |
| D24 | Newsletter / back-in-stock subscribe | Home, footer, PDP | write |
| D25 | Subscription confirm / unsubscribe | Landing page | write |
| D26 | Contact form submit (persists to `contact_messages`) | Contact | write |
| D27 | Legal document by type (current + versions) | Legal pages, checkout modal | read (cacheable) |
| D28 | Journal list + article by slug | Journal | read (cacheable) |
| A1 | Admin auth | Admin sign in | write |
| A2 | Admin dashboard summary | Admin dashboard | read |
| A3 | Admin products CRUD + draft-product preview | Products admin, Product edit | read + write |
| A4 | Admin image upload / delete | Product edit | write |
| A5 | Admin variant + inventory adjustments | Product edit, Inventory | read + write |
| A6 | Admin categories + collections CRUD | Collections admin | read + write |
| A7 | Admin orders list / detail | Orders admin | read |
| A8 | Admin order status / payment / refund update | Order detail admin | write |
| A9 | Admin reviews list / moderate | Reviews admin | read + write |
| A10 | Admin subscribers list | Subscribers admin | read |
| A11 | Admin broadcast create / send | Subscribers admin | write |
| A12 | Admin home content update | Content editor | read + write |
| A13 | Admin legal list / publish version | Legal editor | read + write |
| A14 | Admin discounts CRUD | Discounts admin | read + write |
| A15 | Admin contact inbox — list, detail, mark handled (read-only; replies by email) | Contact messages admin (page 38A) | read + write |

---

## 6. Public pages — search intent, title, and site-wide schema.org

**Site-wide schema.org business type: `Store`** (online store; add `OnlineStore` as an
additional type where supported). Emit `Organization` + `WebSite` (with `SearchAction`)
on the home page, `Product` + `Offer` + `AggregateRating` on PDPs, `BreadcrumbList` on
listing/PDP/Journal, `ItemList` on listing pages, `FAQPage` on Help, `Article` on
Journal posts, `ContactPage` on Contact.

| Page | Target search intent (what they type) | `<title>` |
|---|---|---|
| Home | "House of Esther" / "online boutique Nairobi" / "quality clothing shop Kenya delivery" | House of Esther — Curated Fashion Boutique, Delivered Across Kenya |
| Women | "women's workwear Nairobi online" / "quality women's clothing Kenya" | Women's Clothing & Accessories — House of Esther |
| Men | "men's smart clothing Nairobi online" / "quality men's shirts Kenya delivery" | Men's Clothing & Accessories — House of Esther |
| Accessories | "leather bags Nairobi online" / "quality accessories Kenya" | Bags & Accessories — House of Esther |
| Watches | "watches for sale Nairobi" / "buy watch online Kenya M-Pesa" | Watches — House of Esther |
| Fragrance | "perfume Nairobi delivery" / "buy perfume online Kenya" | Fragrance & Perfume — House of Esther |
| Sneakers | "quality sneakers Nairobi online" / "buy sneakers Kenya M-Pesa delivery" | Sneakers — House of Esther |
| Wigs | "human hair wigs Nairobi" / "buy wig online Kenya delivery" | Wigs & Hair — House of Esther |
| New In | "new arrivals fashion Nairobi" / "latest clothing drop Kenya" | New In — Just Arrived at House of Esther |
| Sale | "fashion sale Nairobi online" / "discount clothing Kenya" | Sale — House of Esther |
| Search results | (varies by query) | "{query}" — Search — House of Esther |
| Product detail | "{product name} Nairobi" / "{brand/type} price Kenya" / "{product} review" | {Product Name} — {Category} — House of Esther |
| Cart | "shopping cart" (not really a search target) | Your Cart — House of Esther |
| Checkout | (not a search target; `noindex`) | Checkout — House of Esther |
| Order confirmation | (`noindex`) | Order Confirmed — House of Esther |
| Order tracking | "track House of Esther order" / "where is my order House of Esther" | Track Your Order — House of Esther |
| About / Our Story | "House of Esther about" / "who owns House of Esther" / "is House of Esther legit" | Our Story — House of Esther |
| Journal listing | "House of Esther journal" / "how to style workwear Kenya" | The Journal — Style, Fit & Care Notes — House of Esther |
| Journal article | "{article topic} e.g. how to measure your size" | {Article Title} — The Journal — House of Esther |
| Size Guide | "clothing size guide Kenya" / "UK to EU shoe size" / "how to measure for a wig" | Size Guide — House of Esther |
| Delivery & Returns | "House of Esther delivery" / "does House of Esther deliver countrywide" / "House of Esther returns" | Delivery & Returns — House of Esther |
| Help / FAQ | "House of Esther customer service" / "House of Esther payment options" | Help & FAQ — House of Esther |
| Contact | "House of Esther contact" / "House of Esther WhatsApp number" | Contact Us — House of Esther |
| Terms of Sale | "House of Esther terms" | Terms of Sale — House of Esther |
| Privacy Policy | "House of Esther privacy policy" | Privacy Policy — House of Esther |
| Returns & Refund Policy | "House of Esther refund policy" / "House of Esther return an item" | Returns & Refund Policy — House of Esther |
| Sign in / Register | "House of Esther account login" | Sign In or Create an Account — House of Esther |

Admin pages and account pages are `noindex, nofollow` and excluded from the sitemap.
