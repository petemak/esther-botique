# API Contract — House of Esther

_The build-time agreement between frontend and backend. Every dynamic block in
`design-spec.md` (D1-D28, A1-A15) maps to endpoints here. Constrained by
`engineering-standards.md`._

---

## Conventions (apply to every endpoint)

- **Base path:** `/api`. Admin: `/api/admin`. All JSON, `Content-Type: application/json`
  (except image upload, which is `multipart/form-data`).
- **Keys:** `camelCase` everywhere, in requests and responses.
- **Dates/times:** ISO 8601 UTC strings, e.g. `2026-09-06T14:30:00Z`.
- **Money:** integer whole Kenyan shillings (KES has no working subunit here). Every
  money value is an object `{ "amount": 4500, "currency": "KES" }`. `amount` is an
  integer.
- **Error shape (every non-2xx, no exceptions):**
  ```json
  { "error": { "code": "SNAKE_OR_KEBAB_CODE", "message": "Human-readable, brand-voiced." } }
  ```
  Optional `error.details` (array of `{ field, message }`) only for validation errors
  (`code: "validation_error"`, HTTP 422).
- **Standard error codes:** `validation_error` (422), `unauthorized` (401),
  `forbidden` (403), `not_found` (404), `conflict` (409), `rate_limited` (429),
  `payment_failed` (402), `idempotency_key_reused` (409), `internal_error` (500),
  `service_unavailable` (503, e.g. Safaricom down).
- **Auth:** httpOnly, Secure, SameSite=Lax session cookie (`he_session`) set on
  login/register. Mutating requests require a `X-CSRF-Token` header matching the
  `he_csrf` readable cookie. Admin session is a separate cookie (`he_admin_session`) and
  role is checked server-side on every `/api/admin/*` call — never inferred from the UI.
- **Guest identity:** an httpOnly `he_cart` cookie holds an opaque cart id for
  unauthenticated shoppers. On login the guest cart is merged into the account cart
  server-side.
- **Idempotency:** `POST /api/orders` and `POST /api/payments/mpesa/stk-push` require an
  `Idempotency-Key` header (client-generated UUID). Same key + same body within 24h
  returns the original result; same key + different body returns `409
  idempotency_key_reused`.
- **Pagination:** query `page` (1-based, default 1) and `pageSize` (default 24, max 60).
  List responses wrap items:
  ```json
  { "items": [ ... ], "page": 1, "pageSize": 24, "total": 137, "totalPages": 6 }
  ```
- **Caching (headers the backend sets; frontend tolerates slightly stale reads):**
  - Catalog reads (`GET /products`, `/products/{slug}`, `/categories`, `/collections`,
    `/content/home`, `/journal*`, `/legal/*`, `/delivery/zones`):
    `Cache-Control: public, max-age=120, stale-while-revalidate=600`.
  - `POST /checkout/quote`: `Cache-Control: private, max-age=30`.
  - Anything user-specific, cart, orders, payments, auth, all admin: `Cache-Control:
    no-store`.
- **Validation:** all external input is validated at the API boundary before it reaches
  business logic. `422` with `error.details` on failure.
- **Rate limiting:** auth, contact, subscribe, review submit, password reset, and STK
  push are rate-limited per IP + per identity; exceed → `429 rate_limited`.

---

## Shared object shapes

### `Money`
```json
{ "amount": 4500, "currency": "KES" }
```

### `ImageRef`
```json
{
  "id": "img_9f2",
  "alt": "Tan leather crossbody bag, front view",
  "thumbUrl": "https://cdn.houseofesther.co.ke/p/9f2-800.webp",
  "fullUrl": "https://cdn.houseofesther.co.ke/p/9f2-2000.webp",
  "width": 2000,
  "height": 2500,
  "isPrimary": true
}
```
Image bytes are always served from the CDN, never from `/api`. Admin upload returns
these URLs after server-side re-encoding to budget.

### `ProductCard` (list/grid item)
```json
{
  "id": "prod_1042",
  "slug": "harlan-leather-crossbody",
  "name": "Harlan Leather Crossbody",
  "category": "accessories",
  "subcategory": "bags",
  "price": { "amount": 6800, "currency": "KES" },
  "compareAtPrice": { "amount": 8200, "currency": "KES" },
  "onSale": true,
  "isNew": false,
  "primaryImage": { "id": "img_9f2", "alt": "...", "thumbUrl": "...", "width": 800, "height": 1000 },
  "colors": [ { "name": "Tan", "hex": "#B98A5E" }, { "name": "Black", "hex": "#1A1A1A" } ],
  "rating": { "average": 4.6, "count": 23 },
  "inStock": true
}
```

### `ProductDetail`
```json
{
  "id": "prod_1042",
  "slug": "harlan-leather-crossbody",
  "name": "Harlan Leather Crossbody",
  "category": "accessories",
  "subcategory": "bags",
  "shortDescription": "A compact everyday crossbody in vegetable-tanned leather.",
  "story": "<p>We picked this leather because it softens instead of cracking...</p>",
  "care": "Wipe with a dry cloth. Keep out of prolonged direct sun.",
  "specs": [
    { "label": "Material", "value": "Vegetable-tanned cowhide" },
    { "label": "Dimensions", "value": "24 x 16 x 7 cm" },
    { "label": "Origin", "value": "Made in Kenya" }
  ],
  "price": { "amount": 6800, "currency": "KES" },
  "compareAtPrice": { "amount": 8200, "currency": "KES" },
  "onSale": true,
  "isNew": false,
  "vatInclusive": true,
  "images": [ { "id": "img_9f2", "alt": "...", "thumbUrl": "...", "fullUrl": "...", "width": 2000, "height": 2500, "isPrimary": true } ],
  "optionAxes": [
    { "name": "Colour", "values": ["Tan", "Black"] },
    { "name": "Size", "values": ["One size"] }
  ],
  "variants": [
    {
      "id": "var_55021",
      "sku": "HAR-CB-TAN-OS",
      "options": { "Colour": "Tan", "Size": "One size" },
      "price": { "amount": 6800, "currency": "KES" },
      "compareAtPrice": { "amount": 8200, "currency": "KES" },
      "inStock": true,
      "stockState": "in_stock",
      "quantityAvailable": 7,
      "imageId": "img_9f2"
    }
  ],
  "sizeGuideCategory": "bags",
  "rating": { "average": 4.6, "count": 23 },
  "seo": { "title": "Harlan Leather Crossbody — Bags — House of Esther", "description": "..." },
  "breadcrumbs": [
    { "label": "Home", "href": "/" },
    { "label": "Accessories", "href": "/accessories" },
    { "label": "Bags", "href": "/accessories/bags" }
  ]
}
```
`stockState` ∈ `in_stock` | `low_stock` | `out_of_stock`. `quantityAvailable` present
only when `low_stock` (drives "2 left" copy) or for cart max.

### `CartItem` / `Cart`
```json
{
  "id": "cart_abc123",
  "items": [
    {
      "id": "ci_1",
      "productId": "prod_1042",
      "variantId": "var_55021",
      "slug": "harlan-leather-crossbody",
      "name": "Harlan Leather Crossbody",
      "options": { "Colour": "Tan", "Size": "One size" },
      "image": { "id": "img_9f2", "alt": "...", "thumbUrl": "...", "width": 800, "height": 1000 },
      "unitPrice": { "amount": 6800, "currency": "KES" },
      "quantity": 1,
      "lineTotal": { "amount": 6800, "currency": "KES" },
      "quantityAvailable": 7,
      "stockState": "in_stock"
    }
  ],
  "discount": {
    "code": "WELCOME10",
    "type": "percent",
    "value": 10,
    "amount": { "amount": -680, "currency": "KES" }
  },
  "subtotal": { "amount": 6800, "currency": "KES" },
  "discountTotal": { "amount": -680, "currency": "KES" },
  "estimatedDelivery": { "amount": 300, "currency": "KES" },
  "estimatedTotal": { "amount": 6420, "currency": "KES" },
  "currency": "KES",
  "updatedAt": "2026-09-06T14:30:00Z"
}
```
`estimatedDelivery` / `estimatedTotal` are null until a region is supplied to the quote.

### `Order`
```json
{
  "orderNumber": "HE-2026-04871",
  "status": "confirmed",
  "statusTimeline": [
    { "status": "placed", "at": "2026-09-06T14:31:00Z" },
    { "status": "confirmed", "at": "2026-09-06T15:02:00Z" },
    { "status": "packed", "at": null },
    { "status": "dispatched", "at": null },
    { "status": "out_for_delivery", "at": null },
    { "status": "delivered", "at": null }
  ],
  "placedAt": "2026-09-06T14:31:00Z",
  "customer": { "firstName": "Amina", "email": "a***@gmail.com", "phone": "+2547*****123" },
  "deliveryAddress": {
    "recipientName": "Amina W.",
    "phone": "+254712345123",
    "county": "Nairobi",
    "town": "Kilimani",
    "instructions": "Yaya Centre, call on arrival"
  },
  "deliveryMethod": { "code": "nairobi_next_day", "label": "Nairobi next-day", "eta": "1-2 business days" },
  "items": [
    {
      "productId": "prod_1042", "variantId": "var_55021",
      "name": "Harlan Leather Crossbody", "options": { "Colour": "Tan", "Size": "One size" },
      "image": { "id": "img_9f2", "alt": "...", "thumbUrl": "...", "width": 800, "height": 1000 },
      "unitPrice": { "amount": 6800, "currency": "KES" }, "quantity": 1,
      "lineTotal": { "amount": 6800, "currency": "KES" }
    }
  ],
  "subtotal": { "amount": 6800, "currency": "KES" },
  "discountTotal": { "amount": -680, "currency": "KES" },
  "deliveryFee": { "amount": 300, "currency": "KES" },
  "total": { "amount": 6420, "currency": "KES" },
  "payment": {
    "method": "mpesa",
    "state": "paid",
    "mpesaReceiptNumber": "SFE7X2K9Q1",
    "paidAt": "2026-09-06T14:33:10Z"
  },
  "trackingReference": null,
  "courier": null,
  "agreementAcceptance": {
    "id": "acc_77c1",
    "acceptedAt": "2026-09-06T14:31:00Z",
    "termsOfSaleVersion": 4,
    "returnsPolicyVersion": 2
  },
  "cancellable": true
}
```
`status` ∈ `placed` | `confirmed` | `packed` | `dispatched` | `out_for_delivery` |
`delivered` | `cancelled` | `refunded`. `payment.method` ∈ `mpesa` | `pay_on_delivery`.
`payment.state` ∈ `pending` | `paid` | `failed` | `refunded` | `awaiting_delivery`
(pay-on-delivery before delivery). Public reads mask email/phone as shown; the customer's
own authenticated read and admin read return them unmasked.

---

# STOREFRONT ENDPOINTS

## D1 — Home content

### `GET /api/content/home`
Response `200`:
```json
{
  "announcement": { "enabled": true, "text": "Delivered countrywide. Pay with M-Pesa or on delivery.", "href": "/delivery-returns" },
  "hero": {
    "headline": "Style worth the wait",
    "subcopy": "Curated pieces, honest sizing, delivered to your door.",
    "ctaLabel": "Shop new in",
    "ctaHref": "/new-in",
    "image": { "id": "img_hero1", "alt": "...", "fullUrl": "...", "thumbUrl": "...", "width": 2000, "height": 1200 }
  },
  "categoryTiles": [
    { "label": "Women", "href": "/women", "image": { "id": "img_c1", "alt": "...", "thumbUrl": "...", "width": 800, "height": 1000 } }
  ],
  "editorialBlocks": [
    { "id": "eb_1", "caption": "The September edit: dressing for the in-between season", "image": { "id": "img_e1", "alt": "...", "fullUrl": "...", "thumbUrl": "...", "width": 2000, "height": 1400 }, "href": "/journal/september-edit" }
  ],
  "featuredCollectionSlug": "workwear",
  "socialLinks": [ { "platform": "instagram", "url": "https://instagram.com/houseofesther" } ]
}
```
Product rails on the home page are fetched separately via D2 with
`collection=new-arrivals` and `collection={featuredCollectionSlug}` so first paint only
requests what it renders.

## D2 — Product list + facets

### `GET /api/products`
Query params (all optional): `category`, `subcategory`, `collection` (slug, e.g.
`new-arrivals`), `q` (search term), `color` (repeatable), `size` (repeatable),
`minPrice`, `maxPrice`, `onSale` (bool), `inStock` (bool), `sort`
(`newest` default | `price_asc` | `price_desc` | `rating` | `relevance`), `page`,
`pageSize`.

Response `200`:
```json
{
  "items": [ /* ProductCard */ ],
  "page": 1, "pageSize": 24, "total": 137, "totalPages": 6,
  "appliedFilters": { "category": "women", "color": ["Black"], "onSale": true },
  "facets": {
    "categories": [ { "value": "women", "label": "Women", "count": 64 } ],
    "subcategories": [ { "value": "dresses", "label": "Dresses", "count": 18 } ],
    "colors": [ { "value": "Black", "label": "Black", "hex": "#1A1A1A", "count": 22 } ],
    "sizes": [ { "value": "M", "label": "M", "count": 30 } ],
    "priceRange": { "min": 800, "max": 24000, "currency": "KES" }
  },
  "query": { "term": "linen dress", "didYouMean": null },
  "heading": { "title": "Women", "description": "Considered workwear and off-duty pieces." }
}
```

### `GET /api/categories`
Response `200`:
```json
{
  "items": [
    { "slug": "women", "label": "Women", "description": "...", "image": { "id": "img_c1", "alt": "...", "thumbUrl": "...", "width": 800, "height": 800 },
      "subcategories": [ { "slug": "dresses", "label": "Dresses" }, { "slug": "tops", "label": "Tops" } ] }
  ]
}
```

### `GET /api/collections/{slug}`
Metadata for a curated collection (the products come from D2 `?collection={slug}`).
Response `200`:
```json
{ "slug": "workwear", "title": "Workwear", "description": "...", "heroImage": { "id": "img_col1", "alt": "...", "fullUrl": "...", "thumbUrl": "...", "width": 2000, "height": 1000 } }
```
`404 not_found` if unknown.

## D3 — Search suggestions

### `GET /api/search/suggestions?q={term}`
`q` min 2 chars. Response `200`:
```json
{
  "terms": ["linen dress", "linen trousers"],
  "products": [ { "slug": "orin-linen-dress", "name": "Orin Linen Dress", "price": { "amount": 5400, "currency": "KES" }, "thumbUrl": "...", "alt": "..." } ],
  "categories": [ { "slug": "women", "label": "Women" } ]
}
```

## D4 — Product detail

### `GET /api/products/{slug}`
Response `200`: `ProductDetail`. `404 not_found` if unknown or unpublished.

### `GET /api/products/{slug}/availability`
Lightweight re-check used when the buy box mounts / a variant is selected (no-store).
Response `200`:
```json
{ "variants": [ { "id": "var_55021", "inStock": true, "stockState": "in_stock", "quantityAvailable": 7 } ] }
```

## D5 — Related products

### `GET /api/products/{slug}/related?limit=4`
Response `200`: `{ "items": [ /* ProductCard */ ] }`.

## D6 / D7 — Reviews

### `GET /api/products/{productId}/reviews`
Query: `page`, `pageSize`, `sort` (`newest` | `highest` | `lowest`).
Response `200`:
```json
{
  "items": [
    { "id": "rev_88", "authorFirstName": "Wanjiru", "rating": 5, "title": "Runs true to size",
      "body": "Ordered my usual M and it fit exactly right...", "verifiedPurchase": true, "createdAt": "2026-08-20T09:00:00Z" }
  ],
  "page": 1, "pageSize": 10, "total": 23, "totalPages": 3,
  "summary": { "average": 4.6, "count": 23, "distribution": { "5": 16, "4": 5, "3": 1, "2": 1, "1": 0 } }
}
```

### `POST /api/products/{productId}/reviews`  (auth required)
Request:
```json
{ "rating": 5, "title": "Runs true to size", "body": "Ordered my usual M...", "orderNumber": "HE-2026-04871" }
```
`rating` 1-5 integer required; `body` 10-2000 chars; `orderNumber` optional but if it
matches a delivered order for this user containing this product, `verifiedPurchase` is
set. Response `201`:
```json
{ "id": "rev_91", "status": "pending_moderation", "message": "Thanks — we read every review before it goes live." }
```
Errors: `401 unauthorized`, `409 conflict` (already reviewed this product),
`422 validation_error`.

## D8 — Cart

### `GET /api/cart`
Returns the current cart (guest cookie or account). Creates an empty one if none.
Response `200`: `Cart`.

### `POST /api/cart/items`
Request: `{ "variantId": "var_55021", "quantity": 1 }`
Response `200`: full `Cart`. Server clamps `quantity` to available stock and returns the
actual quantity set. Errors: `404 not_found` (variant), `409 conflict` (out of stock),
`422`.

### `PATCH /api/cart/items/{itemId}`
Request: `{ "quantity": 3 }` (quantity 0 is rejected — use DELETE).
Response `200`: `Cart`.

### `DELETE /api/cart/items/{itemId}`
Response `200`: `Cart`.

### `POST /api/cart/discount`
Request: `{ "code": "WELCOME10" }`
Response `200`: `Cart` with `discount` populated. Errors: `404 not_found` (no such code),
`422 validation_error` with `error.message` explaining ineligibility (min spend, expired,
usage limit, category mismatch).

### `DELETE /api/cart/discount`
Response `200`: `Cart` with `discount: null`.

## D11 — Delivery zones

### `GET /api/delivery/zones`
Response `200` (cacheable; also powers the Delivery & Returns fees table):
```json
{
  "zones": [
    { "code": "nairobi", "label": "Nairobi", "counties": ["Nairobi"],
      "methods": [ { "code": "nairobi_next_day", "label": "Nairobi next-day", "fee": { "amount": 300, "currency": "KES" }, "eta": "1-2 business days", "payOnDeliveryAllowed": true } ] },
    { "code": "major_towns", "label": "Major towns",
      "counties": ["Mombasa", "Kisumu", "Nakuru", "Eldoret", "..."],
      "methods": [ { "code": "town_courier", "label": "Courier to town", "fee": { "amount": 450, "currency": "KES" }, "eta": "2-4 business days", "payOnDeliveryAllowed": true } ] },
    { "code": "rest_of_kenya", "label": "Rest of Kenya",
      "counties": ["..."],
      "methods": [ { "code": "upcountry_courier", "label": "Upcountry courier", "fee": { "amount": 650, "currency": "KES" }, "eta": "3-6 business days", "payOnDeliveryAllowed": false } ] }
  ]
}
```

## D10 — Delivery quote

### `POST /api/checkout/quote`
Request:
```json
{ "county": "Nairobi", "town": "Kilimani" }
```
Response `200`:
```json
{
  "zone": "nairobi",
  "methods": [
    { "code": "nairobi_next_day", "label": "Nairobi next-day", "fee": { "amount": 300, "currency": "KES" }, "eta": "1-2 business days" }
  ],
  "allowedPaymentMethods": ["mpesa", "pay_on_delivery"],
  "cart": { "subtotal": { "amount": 6800, "currency": "KES" }, "discountTotal": { "amount": -680, "currency": "KES" }, "deliveryFee": { "amount": 300, "currency": "KES" }, "total": { "amount": 6420, "currency": "KES" } }
}
```
`allowedPaymentMethods` omits `pay_on_delivery` where the zone disallows it. Errors:
`422 validation_error` (unknown county), `409 conflict` (cart empty or a line went out of
stock — `error.details` lists affected items).

## D9 — Discount validation
Covered by `POST /api/cart/discount` above; checkout re-validates on order creation.

## Legal documents (D27) — needed by checkout and legal pages

### `GET /api/legal/{docType}`
`docType` ∈ `terms-of-sale` | `privacy` | `returns`. Response `200` (cacheable):
```json
{
  "docType": "terms-of-sale",
  "version": 4,
  "effectiveDate": "2026-07-01",
  "title": "Terms of Sale",
  "bodyHtml": "<h2>1. These terms</h2><p>...</p>",
  "previousVersions": [ { "version": 3, "effectiveDate": "2026-02-01" } ]
}
```

### `GET /api/legal/{docType}/versions/{version}`
Returns a specific historical version (used when an order references an old version).
Response `200`: same shape without `previousVersions`.

---

## D12 — Order creation (with agreement acceptance side effect)

### `POST /api/orders`
Headers: `Idempotency-Key: <uuid>` (required), `X-CSRF-Token`.

Request:
```json
{
  "contact": { "email": "amina@gmail.com", "phone": "+254712345123", "firstName": "Amina" },
  "deliveryAddress": {
    "recipientName": "Amina W.",
    "phone": "+254712345123",
    "county": "Nairobi",
    "town": "Kilimani",
    "instructions": "Yaya Centre, call on arrival",
    "saveToAccount": false
  },
  "deliveryMethodCode": "nairobi_next_day",
  "paymentMethod": "mpesa",
  "discountCode": "WELCOME10",
  "marketingOptIn": true,
  "agreementAcceptance": {
    "accepted": true,
    "termsOfSaleVersion": 4,
    "returnsPolicyVersion": 2
  },
  "clientTotal": { "amount": 6420, "currency": "KES" }
}
```

**Server behaviour (all server-side, non-negotiable):**
1. Validate every field. Re-price the cart from scratch; re-check every variant's stock.
   If `clientTotal` disagrees with the server total → `409 conflict`, code
   `price_changed`, body includes the corrected `order` preview so the UI can show
   "the total changed, please review".
2. Validate `agreementAcceptance.accepted === true` AND that
   `termsOfSaleVersion` / `returnsPolicyVersion` equal the **currently published**
   versions. Mismatch or `accepted !== true` → `422 validation_error`, code
   `agreement_not_accepted` (or `agreement_version_stale` with the current versions in
   `error.details`). The order is **not** created.
3. Create the order (status `placed`), decrement stock atomically.
4. **Write an `agreementAcceptance` record** as a side effect in the same transaction:
   `{ id, orderNumber, customerEmail, customerUserId (nullable), acceptedAt (server
   time), termsOfSaleVersion, returnsPolicyVersion, ipAddress, userAgent }`. This row is
   immutable and is the retrievable proof. An order cannot exist without it.
5. If `paymentMethod === "mpesa"`: create a `payment` in state `pending` and return it;
   the client then calls `POST /api/payments/mpesa/stk-push`. If
   `paymentMethod === "pay_on_delivery"`: `payment.state = "awaiting_delivery"`.
6. Enqueue the order-confirmation notification (email; SMS when enabled).
7. Idempotency: replaying the same `Idempotency-Key` returns the same order and does not
   re-decrement stock or re-charge.

Response `201`:
```json
{
  "order": { /* Order */ },
  "payment": {
    "id": "pay_5567",
    "method": "mpesa",
    "state": "pending",
    "amount": { "amount": 6420, "currency": "KES" }
  },
  "trackingToken": "trk_c9f1a0...",
  "agreementAcceptanceId": "acc_77c1"
}
```
`trackingToken` is a one-time-ish opaque token letting the confirmation and tracking
pages read this order without auth (also retrievable via order number + email).

Errors: `409 conflict` (`price_changed`, `out_of_stock` with `error.details` per line,
`idempotency_key_reused`), `422 validation_error` (includes `agreement_not_accepted` /
`agreement_version_stale`), `404 not_found` (discount/method), `401` only if
`saveToAccount` true while unauthenticated.

---

## D13 — M-Pesa STK push

### `POST /api/payments/mpesa/stk-push`
Headers: `Idempotency-Key: <uuid>`, `X-CSRF-Token`.
Request: `{ "paymentId": "pay_5567", "phone": "+254712345123" }`
(`phone` optional — defaults to the order contact phone; used if paying from a different
number.)

Server: calls Safaricom Daraja STK push **from the backend only** (frontend never touches
Safaricom, holds no keys — non-negotiable). Returns immediately.

Response `202`:
```json
{ "paymentId": "pay_5567", "state": "processing", "message": "Check your phone and enter your M-Pesa PIN.", "checkoutRequestId": "ws_CO_06092026..." }
```
Errors: `402 payment_failed` (Daraja rejected the request), `409 conflict` (payment not
in a chargeable state, or key reused with different body), `503 service_unavailable`
(Daraja unreachable — safe to retry with the same key).

## D14 — Payment status poll

### `GET /api/payments/{paymentId}`
No-store. Frontend polls every ~3s for up to ~90s after STK push.
Response `200`:
```json
{
  "id": "pay_5567",
  "orderNumber": "HE-2026-04871",
  "method": "mpesa",
  "state": "paid",
  "amount": { "amount": 6420, "currency": "KES" },
  "mpesaReceiptNumber": "SFE7X2K9Q1",
  "failureReason": null,
  "updatedAt": "2026-09-06T14:33:10Z"
}
```
`state` ∈ `pending` | `processing` | `paid` | `failed`. On `failed`, `failureReason` is a
short brand-voiced string ("You cancelled the prompt" / "Insufficient funds" / "The
request timed out"). UI offers "Try M-Pesa again" (re-issues STK with a new
`Idempotency-Key`) or "Switch to pay on delivery" (if the zone allows —
`PATCH /api/orders/{orderNumber}/payment-method`).

### `PATCH /api/orders/{orderNumber}/payment-method`  (trackingToken or auth)
Request: `{ "paymentMethod": "pay_on_delivery" }`
Only allowed while the order is unpaid and unfulfilled and the zone permits it.
Response `200`: updated `Order`.

## D15 — M-Pesa callback (inbound webhook, not called by the frontend)

### `POST /api/payments/mpesa/callback`
Safaricom → backend. Auth by shared secret / IP allowlist / URL nonce (env-configured,
no hardcoded secret). Backend validates, marks the payment `paid` or `failed`, sets
`mpesaReceiptNumber`, transitions the order to `confirmed` on success, enqueues the
payment-receipt notification. Idempotent on `checkoutRequestId`. Always responds `200`
with `{ "resultCode": 0 }` to Safaricom once processed.

---

## D16 — Order read (confirmation + tracking)

### `GET /api/orders/{orderNumber}`
Auth options (any one): valid `trackingToken` query param, OR `email` query param
matching the order, OR authenticated owner, OR admin session.
Response `200`: `Order` (email/phone masked unless authenticated owner or admin).
Errors: `404 not_found` (also returned when the email doesn't match — no enumeration).

### `POST /api/orders/{orderNumber}/lookup`
For the cold tracking form. Request: `{ "email": "amina@gmail.com" }`
Response `200`: `{ "order": { /* Order, masked */ } }` or `404 not_found`.
Rate-limited hard.

---

# AUTH & ACCOUNT

## D17 — Auth

### `POST /api/auth/register`
Request: `{ "firstName": "Amina", "email": "amina@gmail.com", "phone": "+254712345123", "password": "..." }`
Password min 8 chars, must not be in a common-password list. Response `201`: sets session
cookie, returns `{ "user": { "id": "usr_1", "firstName": "Amina", "email": "...", "phone": "..." } }`.
Merges the guest cart. Errors: `409 conflict` (email exists), `422`.

### `POST /api/auth/login`
Request: `{ "email": "...", "password": "..." }`
Response `200`: session cookie + `{ "user": { ... } }`. `401 unauthorized` on bad creds
(generic message). Rate-limited; lockout after repeated failures.

### `POST /api/auth/logout`
Response `204`. Clears session.

### `GET /api/auth/me`
Response `200`: `{ "user": { "id", "firstName", "email", "phone" } }` or `401`.

## D18 — Password reset

### `POST /api/auth/password/forgot`
Request: `{ "email": "..." }`
Response `200` always: `{ "message": "If that email is registered, a reset link is on its way." }`

### `POST /api/auth/password/reset`
Request: `{ "token": "...", "password": "..." }`
Response `200`: `{ "message": "Password updated. You can sign in now." }`. `422` (weak
password), `410 not_found`-style → use `422` code `reset_token_invalid` for expired/used.

## D19 — Account orders

### `GET /api/account/orders`  (auth)
Query: `page`, `pageSize`. Response `200`:
```json
{ "items": [ { "orderNumber": "HE-2026-04871", "placedAt": "...", "status": "confirmed", "total": { "amount": 6420, "currency": "KES" }, "itemCount": 1, "thumbnails": ["https://cdn.../9f2-800.webp"] } ],
  "page": 1, "pageSize": 24, "total": 3, "totalPages": 1 }
```

### `GET /api/account/orders/{orderNumber}`  (auth, owner)
Response `200`: `Order` (unmasked), plus `"agreementDocuments": { "termsOfSale": { "version": 4, "href": "/legal/terms-of-sale/versions/4" }, "returnsPolicy": { "version": 2, "href": "/legal/returns/versions/2" } }`.

### `POST /api/account/orders/{orderNumber}/reorder`  (auth)
Adds still-available lines back to the cart. Response `200`: `Cart` plus
`"unavailable": [ { "name": "...", "reason": "out_of_stock" } ]`.

## D20 — Addresses

### `GET /api/account/addresses`  (auth)
Response `200`: `{ "items": [ { "id": "adr_1", "recipientName": "...", "phone": "...", "county": "Nairobi", "town": "Kilimani", "instructions": "...", "isDefault": true } ] }`

### `POST /api/account/addresses`  (auth)
Request: address object (no `id`, no `isDefault` unless setting). Response `201`: the address.

### `PATCH /api/account/addresses/{id}`  (auth)
Partial address; `{ "isDefault": true }` moves the default. Response `200`.

### `DELETE /api/account/addresses/{id}`  (auth)
Response `204`.

## D21 — Profile

### `GET /api/account/profile`  (auth)
Response `200`: `{ "firstName", "lastName", "email", "phone" }`

### `PATCH /api/account/profile`  (auth)
Request: any of `{ "firstName", "lastName", "phone", "currentPassword", "newPassword" }`.
Changing email or password requires `currentPassword`. Response `200`: updated profile.
Errors: `422`, `409` (email in use).

## D22 — Notification preferences

### `GET /api/account/notification-preferences`  (auth)
Response `200`:
```json
{ "orderUpdates": true, "newArrivals": true, "backInStock": true, "journal": false }
```
(`orderUpdates` is always `true` and read-only — transactional.)

### `PUT /api/account/notification-preferences`  (auth)
Request: `{ "newArrivals": false, "backInStock": true, "journal": false }`
Response `200`: full preferences object.

## D23 — Wishlist

### `GET /api/account/wishlist`  (auth)
Response `200`: `{ "items": [ /* ProductCard */ ] }`

### `POST /api/account/wishlist`  (auth)
Request: `{ "productId": "prod_1042" }`. Response `200`: `{ "items": [ ... ] }`.

### `DELETE /api/account/wishlist/{productId}`  (auth)
Response `200`: `{ "items": [ ... ] }`.

---

# SUBSCRIPTIONS, CONTACT, JOURNAL

## D24 — Subscribe (newsletter + back-in-stock)

### `POST /api/subscriptions`
Request:
```json
{ "email": "amina@gmail.com", "source": "footer", "productId": null, "variantId": null }
```
`source` ∈ `footer` | `home` | `checkout` | `product_back_in_stock`. When `variantId` is
set, it's a back-in-stock request for that variant. Response `202`:
```json
{ "status": "pending_confirmation", "message": "Almost there — tap the link in the email to confirm." }
```
Already-confirmed email + newsletter → `200 { "status": "confirmed" }` (idempotent).
Back-in-stock for an already-in-stock variant → `200` with an immediate note.

## D25 — Confirm / unsubscribe

### `POST /api/subscriptions/confirm`
Request: `{ "token": "..." }`. Response `200`: `{ "status": "confirmed" }`. `422` code
`token_invalid`.

### `POST /api/subscriptions/unsubscribe`
Request: `{ "token": "..." }` (from email footer link). Response `200`:
`{ "status": "unsubscribed" }`.

## D26 — Contact form

### `POST /api/contact`
Request:
```json
{
  "name": "Amina W.",
  "email": "amina@gmail.com",
  "phone": "+254712345123",
  "topic": "order_issue",
  "orderNumber": "HE-2026-04871",
  "message": "My delivery ETA passed — any update?",
  "website": ""
}
```
`topic` ∈ `order_issue` | `return` | `product_question` | `wholesale_press` | `other`.
`website` is a honeypot — non-empty → silently `200` without creating a ticket.
Response `201`:
```json
{ "reference": "MSG-2026-0442", "message": "Got it. We reply within one business day." }
```
**Persistence:** a successful (non-honeypot) submission is written to the
`contact_messages` table — `id`, `reference` (`MSG-<year>-<seq>`, the external handle
returned to the customer), `name`, `email`, `phone`, `topic`, `orderNumber` (nullable),
`message`, `handled` (boolean, defaults `false`), `createdAt`. Honeypot hits return `200`
and are not persisted. These rows are read and triaged through the admin contact inbox
(A15); there is no automated staff notification beyond the `attention.contactUnhandled`
count on the admin dashboard (A2). Replies to customers are sent by email outside the app
at launch.
Errors: `422`, `429 rate_limited`.

## D28 — Journal

### `GET /api/journal`
Query: `page`, `pageSize`, `tag`. Response `200`:
```json
{ "items": [ { "slug": "september-edit", "title": "The September Edit", "excerpt": "...", "tag": "lookbook", "coverImage": { "id": "img_j1", "alt": "...", "thumbUrl": "...", "width": 800, "height": 600 }, "publishedAt": "2026-09-01T08:00:00Z" } ],
  "page": 1, "pageSize": 12, "total": 8, "totalPages": 1 }
```

### `GET /api/journal/{slug}`
Response `200`:
```json
{
  "slug": "september-edit",
  "title": "The September Edit",
  "tag": "lookbook",
  "heroImage": { "id": "img_j1", "alt": "...", "fullUrl": "...", "thumbUrl": "...", "width": 2000, "height": 1200 },
  "publishedAt": "2026-09-01T08:00:00Z",
  "bodyHtml": "<p>...</p>",
  "shopTheLook": [ /* ProductCard */ ],
  "related": [ { "slug": "...", "title": "...", "coverImage": { }, "publishedAt": "..." } ],
  "seo": { "title": "The September Edit — The Journal — House of Esther", "description": "..." }
}
```
`404 not_found` if unknown/unpublished.

---

# ADMIN ENDPOINTS  (`/api/admin/*` — admin session + role checked server-side on every call)

## A1 — Admin auth

### `POST /api/admin/auth/login`
Request: `{ "email": "...", "password": "..." }`. Response `200`: `he_admin_session`
cookie + `{ "user": { "id", "name", "role": "admin" } }`. Separate, stricter rate limit
and lockout. No admin self-registration endpoint exists.

### `POST /api/admin/auth/logout` → `204`
### `GET /api/admin/auth/me` → `200 { "user": { ... } }` | `401`

## A2 — Dashboard

### `GET /api/admin/dashboard`
Response `200`:
```json
{
  "orders": { "newToday": 6, "awaitingDispatch": 4, "payOnDeliveryUnpaid": 3 },
  "attention": {
    "lowStockVariants": 5,
    "outOfStockPublished": 2,
    "reviewsPending": 3,
    "contactUnhandled": 2
  },
  "revenueToday": { "amount": 41200, "currency": "KES" }
}
```
`attention.contactUnhandled` is the count of `contact_messages` rows with
`handled = false` (see A15); the dashboard links it through to the contact inbox.

## A3 — Products (admin)

### `GET /api/admin/products`
Query: `q`, `category`, `status` (`draft` | `published` | `archived`), `stock`
(`in` | `low` | `out`), `page`, `pageSize`, `sort`.
Response `200`: paginated list of:
```json
{ "id": "prod_1042", "name": "Harlan Leather Crossbody", "slug": "harlan-leather-crossbody",
  "category": "accessories", "status": "published", "price": { "amount": 6800, "currency": "KES" },
  "totalStock": 7, "variantCount": 2, "primaryThumbUrl": "https://cdn.../9f2-800.webp",
  "updatedAt": "2026-09-05T10:00:00Z" }
```

### `GET /api/admin/products/{id}`
Response `200`: full admin product (all fields from `ProductDetail` plus `status`,
per-variant `lowStockThreshold`, `costPrice` optional, `seo`, timestamps).

### `GET /api/admin/products/{id}/preview`
Admin session + role required (the same guard as every other `/api/admin/*` route).
`Cache-Control: no-store`.

Returns the product in the **exact storefront `ProductDetail` shape** that the public
`GET /api/products/{slug}` returns — same `breadcrumbs`, `optionAxes`, `variants` (with
`inStock` / `stockState` / `quantityAvailable`), `images` (thumb + full URLs), `story`,
`care`, `specs`, `rating`, `sizeGuideCategory`, and `seo` block — **for a product of any
`status`**: `draft`, `published`, or `archived`. `related` is not part of this shape and
callers should treat it as empty. This is what the admin "Preview" link renders so Esther
sees an unpublished PDP exactly as customers will once it goes live.

Response `200`: `ProductDetail` (identical schema to `GET /api/products/{slug}`) with one
additive top-level field used only to drive the preview banner:
```json
{ "previewStatus": "draft" }
```
`previewStatus` ∈ `draft` | `published` | `archived`. Public storefront clients never
call this endpoint and never receive this field.

Errors: `404 not_found` (no product with that id), `401 unauthorized`, `403 forbidden`.

The public `GET /api/products/{slug}` is **unchanged** — it still returns `404 not_found`
for any non-published product, to everyone, admin or not.

### `POST /api/admin/products`
Request:
```json
{
  "name": "Harlan Leather Crossbody",
  "slug": "harlan-leather-crossbody",
  "category": "accessories",
  "subcategory": "bags",
  "shortDescription": "...",
  "story": "<p>...</p>",
  "care": "...",
  "specs": [ { "label": "Material", "value": "Vegetable-tanned cowhide" } ],
  "basePrice": { "amount": 6800, "currency": "KES" },
  "compareAtPrice": { "amount": 8200, "currency": "KES" },
  "vatInclusive": true,
  "optionAxes": [ { "name": "Colour", "values": ["Tan", "Black"] }, { "name": "Size", "values": ["One size"] } ],
  "variants": [
    { "options": { "Colour": "Tan", "Size": "One size" }, "sku": "HAR-CB-TAN-OS",
      "price": { "amount": 6800, "currency": "KES" }, "compareAtPrice": { "amount": 8200, "currency": "KES" },
      "stock": 7, "lowStockThreshold": 2, "imageId": "img_9f2", "enabled": true }
  ],
  "imageIds": ["img_9f2", "img_9f3"],
  "primaryImageId": "img_9f2",
  "seo": { "title": "...", "description": "..." },
  "status": "draft"
}
```
Response `201`: full admin product. `422` on validation (duplicate slug/SKU →
`error.details`).

### `PATCH /api/admin/products/{id}`
Partial update, same field set. Setting `status: "published"` makes it live and
indexable. Response `200`.

### `DELETE /api/admin/products/{id}`
Soft-delete → `status: "archived"` (never hard-deletes; orders reference it). Response
`200`.

## A4 — Images (admin)

### `POST /api/admin/images`  (`multipart/form-data`)
Fields: `file` (binary), `alt` (string). Server **re-encodes on ingest** to meet the
budget: full <= ~300 KB at <= ~2000px, thumb <= ~60 KB at <= ~800px, strips EXIF,
converts to WebP (+ JPEG fallback), uploads to object storage / CDN. Rejects files over
~15 MB or non-image types at the boundary.
Response `201`: `ImageRef` (with final CDN URLs and byte sizes:
`"thumbBytes": 41213, "fullBytes": 214880`).
Errors: `422 validation_error` (bad type / too large / decode failed).

### `DELETE /api/admin/images/{id}` → `204` (blocked with `409 conflict` if still
referenced by a product).

## A5 — Variants & inventory (admin)

### `PATCH /api/admin/products/{id}/variants/{variantId}`
Request: any of `{ "price", "compareAtPrice", "sku", "lowStockThreshold", "enabled", "imageId" }`.
Response `200`: the variant. (Stock is not set here — use adjustments for an audit trail.)

### `GET /api/admin/inventory`
Query: `q`, `stock` (`in`|`low`|`out`), `page`, `pageSize`. Response `200`: paginated:
```json
{ "productId": "prod_1042", "productName": "Harlan Leather Crossbody", "variantId": "var_55021",
  "sku": "HAR-CB-TAN-OS", "options": { "Colour": "Tan", "Size": "One size" },
  "stock": 7, "lowStockThreshold": 2, "stockState": "in_stock" }
```

### `POST /api/admin/inventory/adjustments`
Request:
```json
{ "variantId": "var_55021", "delta": 12, "reason": "restock", "note": "PO #A-118" }
```
`reason` ∈ `restock` | `correction` | `damage` | `return_to_stock`. Response `201`:
```json
{ "id": "adj_309", "variantId": "var_55021", "delta": 12, "reason": "restock",
  "resultingStock": 19, "createdAt": "2026-09-06T09:00:00Z", "createdBy": "usr_admin1" }
```
**Side effect:** if `resultingStock` crosses from 0 to positive, back-in-stock alerts for
that variant are enqueued to confirmed subscribers who kept `backInStock` on.

### `GET /api/admin/inventory/adjustments?variantId=` → paginated history.

## A6 — Categories & collections (admin)

### `GET /api/admin/categories` → list (same as public plus `productCount`, `sortOrder`).
### `POST /api/admin/categories` / `PATCH /api/admin/categories/{slug}` / `DELETE ...`
Request: `{ "slug", "label", "description", "imageId", "parentSlug", "sortOrder" }`.
`DELETE` blocked (`409`) if products are assigned.

### `GET /api/admin/collections` → list.
### `POST /api/admin/collections`
```json
{ "slug": "workwear", "title": "Workwear", "description": "...", "heroImageId": "img_col1",
  "rule": { "type": "manual", "productIds": ["prod_1042", "prod_1050"] } }
```
`rule.type` ∈ `manual` (ordered `productIds`) | `auto_new_arrivals`
(`{ "type": "auto_new_arrivals", "days": 30 }`) | `auto_sale`.
### `PATCH /api/admin/collections/{slug}` / `DELETE /api/admin/collections/{slug}`

## A7 — Orders (admin)

### `GET /api/admin/orders`
Query: `status`, `paymentState`, `paymentMethod`, `zone`, `dateFrom`, `dateTo`,
`q` (order number / phone / email), `page`, `pageSize`.
Response `200`: paginated:
```json
{ "orderNumber": "HE-2026-04871", "placedAt": "...", "customerName": "Amina W.",
  "county": "Nairobi", "total": { "amount": 6420, "currency": "KES" },
  "paymentMethod": "mpesa", "paymentState": "paid", "status": "confirmed" }
```

### `GET /api/admin/orders/{orderNumber}`
Response `200`: full `Order`, unmasked, plus:
```json
{
  "agreementAcceptance": {
    "id": "acc_77c1",
    "acceptedAt": "2026-09-06T14:31:00Z",
    "customerEmail": "amina@gmail.com",
    "customerUserId": null,
    "termsOfSaleVersion": 4,
    "returnsPolicyVersion": 2,
    "termsOfSaleHref": "/api/legal/terms-of-sale/versions/4",
    "returnsPolicyHref": "/api/legal/returns/versions/2",
    "ipAddress": "197.232.x.x",
    "userAgent": "Mozilla/5.0 (Linux; Android 13; ...)"
  },
  "activityLog": [ { "at": "...", "actor": "usr_admin1", "event": "status_changed", "from": "placed", "to": "confirmed" } ],
  "internalNotes": [ { "id": "n1", "at": "...", "author": "usr_admin1", "body": "Customer asked to deliver Sat." } ]
}
```
The `agreementAcceptance` block is read-only — there is no endpoint to edit or delete it.

## A8 — Order mutations (admin)

### `PATCH /api/admin/orders/{orderNumber}/status`
Headers: `Idempotency-Key`.
Request: `{ "status": "dispatched", "courier": "Fargo Courier", "trackingReference": "FG12345", "notifyCustomer": true }`
`courier` / `trackingReference` required when moving to `dispatched`. Server enforces
legal transitions (no skipping backwards except to `cancelled`). On success optionally
enqueues the matching customer notification. Response `200`: updated `Order`.
Errors: `409 conflict` (illegal transition).

### `PATCH /api/admin/orders/{orderNumber}/payment`
Request: `{ "state": "paid", "reference": "manual M-Pesa SFE...", "note": "Paid to rider on delivery" }`
Used mainly to mark pay-on-delivery orders paid. Response `200`.

### `POST /api/admin/orders/{orderNumber}/refund`
Headers: `Idempotency-Key`.
Request: `{ "amount": { "amount": 6420, "currency": "KES" }, "reason": "return_accepted", "reference": "M-Pesa B2C QLM...", "restock": true }`
Records a refund (does not itself move money at launch — Esther pays out via M-Pesa and
records the reference), sets `payment.state` / order `status` to `refunded`, optionally
restocks the lines (creating `return_to_stock` adjustments). Response `201`: refund
record. Idempotent on the key.

### `POST /api/admin/orders/{orderNumber}/notes`
Request: `{ "body": "..." }`. Response `201`: the note.

### `POST /api/admin/orders/{orderNumber}/resend-notification`
Request: `{ "type": "confirmation" | "dispatched" | "receipt" }`. Response `202`.

## A9 — Reviews (admin)

### `GET /api/admin/reviews`
Query: `status` (`pending` | `approved` | `rejected`), `productId`, `page`, `pageSize`.
Response `200`: paginated review objects (with `productName`, `authorEmail`,
`verifiedPurchase`).

### `PATCH /api/admin/reviews/{id}`
Request: `{ "status": "approved" }` or `{ "status": "rejected", "reason": "Off-topic" }`.
Approved → visible on the PDP and counted in the aggregate. Response `200`.

## A10 / A11 — Subscribers & broadcasts (admin)

### `GET /api/admin/subscribers`
Query: `status` (`pending` | `confirmed` | `unsubscribed`), `source`, `page`, `pageSize`.
Response `200`: paginated:
```json
{ "id": "sub_88", "email": "amina@gmail.com", "status": "confirmed", "source": "footer",
  "newArrivals": true, "backInStock": true, "createdAt": "...", "confirmedAt": "..." }
```

### `GET /api/admin/subscribers/export?status=confirmed` → `200` CSV
(`Content-Type: text/csv`).

### `POST /api/admin/broadcasts`
Request:
```json
{
  "subject": "New in: the September leather edit",
  "introHtml": "<p>Six new pieces landed this morning.</p>",
  "productIds": ["prod_1042", "prod_1050", "prod_1061"],
  "collectionSlug": null,
  "audience": "new_arrivals_optin"
}
```
`audience` ∈ `new_arrivals_optin` (default) . Response `201`:
```json
{ "id": "bcast_12", "status": "queued", "recipientCount": 812, "createdAt": "..." }
```

### `GET /api/admin/broadcasts` → list with `status` (`queued` | `sending` | `sent`),
`sentCount`, `openCount` (if tracked).

### `POST /api/admin/broadcasts/{id}/test`
Request: `{ "email": "esther@houseofesther.co.ke" }` → `202` (sends one test).

## A12 — Home content (admin)

### `GET /api/admin/content/home` → `200`: the editable form of the D1 payload, with
`imageId`s instead of resolved `ImageRef`s.

### `PUT /api/admin/content/home`
Request: full home-content object (announcement, hero, categoryTiles order,
editorialBlocks, featuredCollectionSlug, socialLinks). Response `200`: saved object.
Publishing is immediate; CDN cache is purged for `/api/content/home`.

## A13 — Legal documents (admin)

### `GET /api/admin/legal` → `200`:
```json
{ "items": [ { "docType": "terms-of-sale", "currentVersion": 4, "effectiveDate": "2026-07-01", "updatedAt": "..." } ] }
```

### `GET /api/admin/legal/{docType}` → current draft/published body + version list.

### `POST /api/admin/legal/{docType}/versions`
Request: `{ "bodyHtml": "<h2>...</h2>", "effectiveDate": "2026-10-01", "title": "Terms of Sale" }`
Creates and publishes a new version (`currentVersion + 1`). Previous versions are
retained and remain fetchable at `/api/legal/{docType}/versions/{n}` so historical
`agreementAcceptance` records stay resolvable. Response `201`:
`{ "docType": "terms-of-sale", "version": 5, "effectiveDate": "2026-10-01" }`.
CDN cache purged for the affected `/api/legal/*` paths.
**Note:** publishing a new Terms of Sale or Returns Policy version means checkout
immediately requires acceptance of the new version numbers; in-flight carts that
pre-fetched the old numbers get `agreement_version_stale` on `POST /api/orders` and the
UI must re-show the updated document.

## A14 — Discounts (admin)

### `GET /api/admin/discounts` → list.
### `POST /api/admin/discounts`
```json
{
  "code": "WELCOME10",
  "type": "percent",
  "value": 10,
  "minSpend": { "amount": 3000, "currency": "KES" },
  "usageLimitTotal": 500,
  "usageLimitPerCustomer": 1,
  "eligibleCategories": [],
  "startsAt": "2026-09-01T00:00:00Z",
  "endsAt": "2026-12-31T23:59:59Z",
  "active": true
}
```
`type` ∈ `percent` | `fixed` | `free_delivery`. Response `201`: the discount.
### `PATCH /api/admin/discounts/{code}` / `DELETE /api/admin/discounts/{code}`
Validation and application always happen server-side (`POST /api/cart/discount` and again
in `POST /api/orders`); the code list is never trusted from the client.

## A15 — Contact inbox (admin, read-only)

Replies to customers happen by email (or WhatsApp) **outside the app** at launch — these
endpoints are list / read / mark-handled only. There is no reply or notes field. Admin
session + role are checked server-side on every call; the standard error shape applies;
`Cache-Control: no-store`. Records are addressed by **`reference`** (e.g.
`MSG-2026-0442`), consistent with orders being addressed by `orderNumber`.

Rows are created by the public `POST /api/contact` (D26), which persists to
`contact_messages`.

### `GET /api/admin/contacts`
Query: `handled` (bool, optional — omit for all), `topic` (optional:
`order_issue` | `return` | `product_question` | `wholesale_press` | `other`),
`page`, `pageSize`.
Response `200` (standard pagination envelope):
```json
{
  "items": [
    {
      "reference": "MSG-2026-0442",
      "name": "Amina W.",
      "email": "amina@gmail.com",
      "phone": "+254712345123",
      "topic": "return",
      "orderNumber": "HE-2026-04871",
      "messageExcerpt": "My delivery ETA passed — any update? I also want to return the...",
      "handled": false,
      "handledAt": null,
      "createdAt": "2026-09-13T08:04:00Z"
    }
  ],
  "page": 1, "pageSize": 24, "total": 12, "totalPages": 1
}
```
`messageExcerpt` is the first ~120 characters of the message body. `orderNumber` is
`null` when the sender did not give one.

### `GET /api/admin/contacts/{reference}`
Response `200`:
```json
{
  "reference": "MSG-2026-0442",
  "name": "Amina W.",
  "email": "amina@gmail.com",
  "phone": "+254712345123",
  "topic": "return",
  "orderNumber": "HE-2026-04871",
  "message": "My delivery ETA passed — any update? I also want to return the Orin Linen Dress, it did not fit.",
  "handled": false,
  "handledAt": null,
  "handledBy": null,
  "createdAt": "2026-09-13T08:04:00Z"
}
```
`404 not_found` if no message has that reference.

### `PATCH /api/admin/contacts/{reference}`
Request: `{ "handled": true }` (also accepts `{ "handled": false }` to reopen).
When moving to `handled: true` the server sets `handledAt` (server time) and `handledBy`
(the acting admin user id); when moving back to `false` it clears both.
Response `200`: the full detail object (same shape as `GET /api/admin/contacts/{reference}`).
Errors: `404 not_found`, `422 validation_error` (body is not `{ "handled": boolean }`),
`401 unauthorized`, `403 forbidden`.

---

## Endpoint ↔ capability coverage

| Capability | Key endpoints |
|---|---|
| Catalog / inventory | `GET /products*`, `GET /categories`, `GET /collections/*`, `/api/admin/products*`, `GET /api/admin/products/{id}/preview` (draft / any-status PDP preview), `/api/admin/inventory*`, `/api/admin/collections*`, `POST /api/admin/images` |
| Payments / checkout | `POST /checkout/quote`, `POST /orders`, `POST /payments/mpesa/stk-push`, `GET /payments/{id}`, `POST /payments/mpesa/callback`, `PATCH /api/admin/orders/{n}/payment`, `POST /api/admin/orders/{n}/refund` |
| Accounts / auth | `/api/auth/*`, `/api/account/*`, `/api/admin/auth/*` |
| Admin / back-office | all `/api/admin/*` — incl. `GET /api/admin/products/{id}/preview` (draft-product preview) and `GET`/`PATCH /api/admin/contacts` (read-only contact inbox) |
| Search / discovery | `GET /products` (facets/sort), `GET /search/suggestions` |
| Notifications | order-confirmation on `POST /orders`, receipt on callback, transition emails on `PATCH /api/admin/orders/{n}/status`, `/api/subscriptions*`, `/api/admin/broadcasts*`, back-in-stock side effect on `POST /api/admin/inventory/adjustments`, `/api/account/notification-preferences`; inbound contact-form messages persist to `contact_messages` and are triaged via `GET`/`PATCH /api/admin/contacts` (customer replies sent by email outside the app) |
| Legal / compliance | `GET /legal/{docType}`, `GET /legal/{docType}/versions/{n}`, `/api/admin/legal*` |
| Customer agreements (partial) | `agreementAcceptance` block in `POST /api/orders` request + the **immutable acceptance record written as a transaction side effect**; surfaced on `GET /orders/{n}`, `GET /account/orders/{n}`, `GET /api/admin/orders/{n}`. No update/delete endpoint exists for it by design. |
