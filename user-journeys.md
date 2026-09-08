# User Journeys — House of Esther

_The sequences real people follow across pages. `design-spec.md` describes pages in
isolation; this file checks that getting from one step to the next is obvious. Endpoints
in parentheses map to `api-contract.md`._

Five journeys, in priority order:
1. First-time customer: Instagram → product → M-Pesa checkout → confirmation
2. Returning customer: new-stock email → pay-on-delivery → track in account
3. Owner (Esther): add a product with photos and stock, verify it's live
4. Owner (Esther): fulfil an order (mark dispatched) and handle a return/refund
5. Owner (Esther): add a staff member; the staff member is forced to set their own password

---

## Journey 1 — First-time customer buys via M-Pesa

**Persona:** Amina, Nairobi professional, tapped a link in House of Esther's Instagram
story on her phone. Never bought here before. Wants to know it's legit, that the size is
right, and that delivery is real.

1. Amina lands on the **PDP** for "Orin Linen Dress" (`GET /api/products/orin-linen-dress`,
   `GET /api/products/orin-linen-dress/availability`). She sees the gallery, price,
   "In stock", a delivery line ("Nairobi next-day, KES 300 — or pay on delivery"), and
   the average rating.
2. She swipes the gallery, taps one image to open the **lightbox** (full asset loads
   only now), closes it.
3. She's unsure of size. She taps **"Find your size"** → the **Size Guide modal** opens
   scoped to dresses, with a measurement table. She closes it.
4. She scrolls to the **Product story** ("we chose this linen because it breathes and
   only gets softer") and then to **Reviews** — reads three, sees "Runs true to size"
   with a verified-purchase badge (`GET /api/products/{id}/reviews`). Trust cleared.
5. She selects **Colour: Sand** and **Size: M**. The variant selector confirms the combo
   is in stock; the button reads **Add to cart**. She taps it
   (`POST /api/cart/items { variantId, quantity: 1 }`).
6. The **cart drawer** slides in showing the line, subtotal KES 5,400, and two buttons:
   **View cart** / **Checkout**. She taps **Checkout**.
7. **Checkout page** loads with her one line and an order summary
   (`GET /api/cart`). She is not asked to create an account — a **"Checkout as guest"**
   flow is the default, with a subtle "Sign in for saved details" link.
8. **Contact** section: she enters email + phone (phone marked required — "we need it
   for M-Pesa and delivery").
9. **Delivery address**: she picks County = Nairobi, types Town = Kilimani, adds a
   landmark. On blur the page calls `POST /api/checkout/quote` → delivery method
   "Nairobi next-day, KES 300, 1-2 business days" appears pre-selected, and
   `allowedPaymentMethods` includes both `mpesa` and `pay_on_delivery`. Summary updates
   to total KES 5,700.
10. **Payment** section: she chooses **M-Pesa (pay now)**.
11. **Review & accept** section: she sees her items, address, delivery, and total again,
    then a single **unticked required checkbox**: "I have read and accept the Terms of
    Sale and the Returns & Refund Policy." She taps **Terms of Sale** — it opens in a
    modal (`GET /api/legal/terms-of-sale`, version 4). She closes it and ticks the box.
    The **Place order** button, disabled until now, becomes active.
12. She taps **Place order**. The frontend sends `POST /api/orders` with an
    `Idempotency-Key`, the `agreementAcceptance` object (`accepted: true`,
    `termsOfSaleVersion: 4`, `returnsPolicyVersion: 2`), and `clientTotal`.
    The server re-prices, re-checks stock, verifies the agreement versions are current,
    creates the order, **writes the immutable acceptance record** (email, server
    timestamp, versions, IP, user-agent) in the same transaction, decrements stock, and
    returns the order + a `pending` M-Pesa payment + a `trackingToken`.
13. The UI immediately calls `POST /api/payments/mpesa/stk-push { paymentId }` and shows
    **"Check your phone and enter your M-Pesa PIN"** with a spinner, while polling
    `GET /api/payments/{paymentId}` every ~3s.
14. Amina gets the STK prompt on her phone, enters her PIN. Safaricom calls
    `POST /api/payments/mpesa/callback`; the backend marks the payment `paid`, moves the
    order to `confirmed`, and queues the confirmation + receipt emails. Her next poll
    returns `state: "paid"`.
15. The page redirects to the **Order confirmation page** (`GET /api/orders/HE-2026-04871?trackingToken=...`).
    She sees "Thank you, Amina — your order is in", the order number, "Paid via M-Pesa",
    a 3-step "what happens next", the receipt line "You accepted the Terms of Sale (v4)
    and Returns Policy (v2) on 6 Sep 2026", and buttons **Track this order** and
    **Create an account to track future orders** (email pre-filled).
16. She also receives the confirmation email with a **Track your order** link.
17. **Ends at:** Order confirmation page, order `confirmed` and paid, acceptance recorded,
    tracking link in hand.

**Failure branch (STK fails/times out):** at step 14 the poll returns
`state: "failed"`, `failureReason: "You cancelled the prompt"`. The page shows the reason
and two choices: **Try M-Pesa again** (re-issues STK with a fresh `Idempotency-Key`) or
**Switch to pay on delivery** (`PATCH /api/orders/{orderNumber}/payment-method`, allowed
because Kilimani permits it). The order already exists and is not duplicated; stock is
held.

**Price-changed branch:** if `POST /api/orders` returns `409 price_changed` (an item
went on sale / off sale between cart and submit), the UI shows "The total changed — KES
5,500 now. Review and place again," renders the corrected summary from the response, and
the customer re-taps Place order.

---

## Journey 2 — Returning customer, new-stock email, pay on delivery

**Persona:** Wanjiru, bought once before, has an account, opted into new-arrival alerts.
Lives in Nakuru.

1. Wanjiru gets the **"New in: the September leather edit"** email (sent from
   `POST /api/admin/broadcasts`). She taps a product image → lands on that **PDP**.
2. Header shows she's signed in (session cookie still valid, `GET /api/auth/me`). She
   browses, taps **New In** in the nav → **listing page**
   (`GET /api/products?collection=new-arrivals&sort=newest`).
3. She opens a belt's PDP, likes it but wants to think — taps the **heart / Add to
   wishlist** (`POST /api/account/wishlist`). Toast: "Saved to your wishlist."
4. She goes back, opens the crossbody bag PDP, selects **Colour: Tan**, taps **Add to
   cart** (`POST /api/cart/items`). Cart drawer → **Checkout**.
5. **Checkout**: because she's signed in, Contact is pre-filled and the **saved-address
   picker** shows her Nakuru address. She selects it → `POST /api/checkout/quote` returns
   zone `major_towns`, method "Courier to town, KES 450, 2-4 business days",
   `allowedPaymentMethods: ["mpesa", "pay_on_delivery"]`.
6. She picks **Pay on delivery**. Copy explains: cash or M-Pesa to the rider on arrival.
7. **Review & accept**: the agreement checkbox is present and required exactly as for a
   guest — being a returning customer does not skip it (the accepted version could have
   changed since her last order). She ticks it and taps **Place order**.
8. `POST /api/orders` with `paymentMethod: "pay_on_delivery"` → order created, acceptance
   record written (this time with her `customerUserId`), `payment.state:
   "awaiting_delivery"`, no STK push. Confirmation email queued.
9. **Order confirmation page**: "To pay on delivery — KES 3,600." "What happens next"
   notes the courier timeframe for Nakuru.
10. Two days later she taps the **Track your order** link in her dispatch SMS/email →
    **Order tracking page** shows the timeline at **Dispatched** with courier "Fargo
    Courier" and a reference (set by Esther in step 3 of Journey 4).
11. Later she opens **Account → Orders** (`GET /api/account/orders`), sees this order and
    her previous one, opens the detail (`GET /api/account/orders/HE-2026-04903`), which
    also shows the agreement-acceptance receipt with links to the exact versions she
    accepted.
12. **Ends at:** Account order detail, order in flight, tracked, everything on record.

---

## Journey 3 — Esther adds a new product and confirms it's live

**Persona:** Esther, the owner. On a laptop. Has just photographed five new arrivals.

1. Esther goes to `/admin`, signs in (`POST /api/admin/auth/login`). The public UI and
   admin are the same deployed build; `/admin/*` routes are gated and every
   `/api/admin/*` call re-checks her admin role server-side.
2. **Admin dashboard** (`GET /api/admin/dashboard`): 6 orders today, 4 awaiting dispatch,
   2 reviews pending, 5 low-stock variants. She clicks **Add product**.
3. **Product create form.** She fills Basics: name "Harlan Leather Crossbody" (slug
   auto-fills `harlan-leather-crossbody`), Category = Accessories, Subcategory = Bags,
   short description, and the **Product story** ("We picked this leather because it
   softens instead of cracking") in the rich-text field, plus care and a spec list.
4. **Media.** She drags in 4 photos. Each upload is `POST /api/admin/images`
   (multipart); the backend re-encodes to budget (full <= ~300 KB / ~2000px, thumb
   <= ~60 KB / ~800px, EXIF stripped, WebP) and returns CDN URLs + byte sizes shown
   under each thumbnail. She writes alt text for each and marks the front shot
   **primary**.
5. **Variants.** She sets option axes Colour = [Tan, Black], Size = [One size]. The form
   generates 2 variant rows. For each she enters SKU, price KES 6,800, compare-at KES
   8,200, stock (Tan 7, Black 4), low-stock threshold 2, and links the matching image.
6. **SEO.** Meta title/description auto-fill from the name and description; she tweaks
   the description.
7. She clicks **Save as draft** (`POST /api/admin/products` with `status: "draft"`). The
   product is saved but not visible on the storefront.
8. She clicks the **Preview** link on the product. A new tab opens the storefront PDP in
   preview mode (`GET /api/admin/products/{id}/preview` — admin-guarded, `no-store`,
   returning the same `ProductDetail` shape customers get but for her draft, with
   `previewStatus: "draft"`). A persistent **"Draft — not visible to customers"** banner
   sits at the top. She flips the **width toggle** to phone width and checks the gallery,
   variant selector, stock cue and product story all read well.
9. She clicks **Publish** (`PATCH /api/admin/products/{id} { status: "published" }`).
10. **Verification.** She opens the storefront in a new tab, goes to **Accessories → Bags**
    (`GET /api/products?category=accessories&subcategory=bags`) — the crossbody appears
    in the grid with the "New In" tag. She opens its PDP; variants, stock cue ("Low
    stock — Black") and images are correct. She also checks it shows under **New In**.
    (Catalog GETs are CDN-cached ~2 min, so she knows a brand-new publish can take up to
    a couple of minutes to appear for everyone — Preview and the admin views are always
    live, so she has already confirmed the page is right.)
11. Back in admin, she creates a **broadcast** (`POST /api/admin/broadcasts`) — subject
    "New in: the September leather edit", picks this product + the other four, audience
    = new-arrivals opt-ins. She sends herself a **test** first
    (`POST /api/admin/broadcasts/{id}/test`), then sends.
12. **Ends at:** product live on the storefront, indexable, and announced to subscribers.

---

## Journey 4 — Esther fulfils an order, then processes a return

**Persona:** Esther, next morning, packing orders.

### Part A — dispatch

1. Admin dashboard → **Orders** (`GET /api/admin/orders?status=confirmed`). She opens
   Wanjiru's Nakuru order (`GET /api/admin/orders/HE-2026-04903`).
2. She sees items, the Nakuru address, `paymentMethod: pay_on_delivery`,
   `paymentState: awaiting_delivery`, and the **read-only agreement-acceptance panel**
   (Terms of Sale v4, Returns Policy v2, accepted 2026-09-06T09:12Z, IP, user-agent) —
   proof on file if there's ever a dispute.
3. She packs the parcel, books Fargo Courier, then clicks **Mark as dispatched**:
   `PATCH /api/admin/orders/HE-2026-04903/status { status: "dispatched", courier:
   "Fargo Courier", trackingReference: "FG12345", notifyCustomer: true }` (with an
   `Idempotency-Key`). The server enforces the transition, stamps the timeline, and
   queues the dispatch notification to Wanjiru.
4. When Fargo confirms delivery and Wanjiru pays the rider, Esther opens the order and
   uses **Update payment** (`PATCH /api/admin/orders/{n}/payment { state: "paid",
   reference: "M-Pesa SFG...", note: "Paid to rider" }`) and **Mark as delivered**
   (`PATCH .../status { status: "delivered" }`).
5. **Ends at:** order `delivered` and `paid`, customer notified at each step.

### Part B — return and refund

6. A week later Amina (Journey 1) messages via the **Contact form** (topic = Return,
   order number pre-filled from a link on her Account order detail) — `POST /api/contact`
   persists the message to `contact_messages` as reference MSG-2026-0442 and shows her
   "Got it. We reply within one business day."
7. Esther opens **Admin → Contact messages** (`GET /api/admin/contacts?handled=false`),
   opens MSG-2026-0442 (`GET /api/admin/contacts/MSG-2026-0442`), reads the full note
   (with a click-through to the linked order), approves the return per the Returns &
   Refund Policy, and replies to Amina by email (outside the app at launch) explaining
   how to send the dress back. She then marks the message handled
   (`PATCH /api/admin/contacts/MSG-2026-0442 { "handled": true }`), which stamps
   `handledAt` / `handledBy` and drops it off the dashboard's unhandled count.
8. When the dress arrives back in good condition, Esther opens the order in admin and
   clicks **Refund**: `POST /api/admin/orders/HE-2026-04871/refund` with an
   `Idempotency-Key`, `amount` = full item value, `reason: "return_accepted"`,
   `reference` = the M-Pesa B2C payout she just sent, `restock: true`.
9. The server records the refund, sets the order to `refunded`, and creates a
   `return_to_stock` inventory adjustment for the Sand / M variant. Because that
   variant's stock crosses from 0 back to positive, **back-in-stock alerts fire** to
   anyone who subscribed on that PDP.
10. Amina gets a refund-confirmation email; the order in her account now shows
    **Refunded** with the refund reference.
11. **Ends at:** money returned and recorded, stock corrected, waiting subscribers
    notified, order history accurate.

---

## Journey 5 — Esther adds a staff member; the staff member sets their own password

**Persona:** Esther (owner) has taken on Miriam to help with orders and stock. Miriam
needs her own login — not Esther's — but must not be able to touch team management or
anything that could lock Esther out.

1. Esther signs in at `/admin/signin.html` (`POST /api/admin/auth/login`). The response
   carries `user.role: "owner"` and `mustChangePassword: false`, so she lands on the
   **dashboard**.
2. In the sidebar she sees a **Team** item (visible because she is an `owner`). She
   clicks it → **Team page** (`GET /api/admin/users`), which lists just her own row
   (Owner / Active / last sign-in today).
3. She fills the **Add administrator** form: name "Miriam Otieno", email
   "miriam@houseofesther.co.ke", role **Staff**, and types a starting password into the
   field (using the show/hide toggle to check it). Helper text reminds her she must
   share it privately and that Miriam will set her own password on first sign-in. She
   submits → `POST /api/admin/users { name, email, role: "staff", initialPassword }`.
4. The server validates the password against the same rules as customer sign-up, creates
   the account `status: "active"`, `mustChangePassword: true`, and returns the new
   `AdminUser`. Miriam's row appears in the table (Staff / Active / "Never" signed in).
5. Esther sends Miriam the temporary password over WhatsApp — outside the app; there is
   no email invite.
6. Miriam opens `/admin/signin.html` on her laptop and signs in with her email + the
   temporary password (`POST /api/admin/auth/login`). The response is `200` with
   `user.role: "staff"` and **`mustChangePassword: true`**.
7. The admin app immediately shows the **forced change-password screen** — full page, no
   sidebar, no way around it. Miriam types the temporary password as "current password",
   then a new password twice. Submit → `POST /api/admin/auth/change-password
   { currentPassword, newPassword }`.
8. The server verifies the current password, applies the sign-up password rules to the
   new one, updates the hash, and clears `mustChangePassword`. The response has
   `mustChangePassword: false`.
9. Miriam lands on the **admin dashboard**. Her sidebar has products, inventory,
   collections, orders, reviews, contact messages, subscribers, homepage content, legal
   documents, discounts, the guide, plus Account and Sign out — **but no Team item**. If
   she types `/admin/team` directly, the route redirects her to the dashboard, and any
   direct call to `GET`/`POST`/`PATCH /api/admin/users*` returns `403 forbidden`.
10. Miriam opens **Orders** and starts working. From now on her actions are attributed to
    her (e.g. `createdBy` on a stock adjustment, `handledBy` on a contact message, the
    `actor` in an order's activity log).
11. **Ends at:** Miriam has her own working staff login, was forced to set a private
    password, can do all shop work, and cannot see or touch team management.

**Deactivation branch:** when Miriam leaves, Esther opens the Team page and clicks
**Deactivate** on Miriam's row (`PATCH /api/admin/users/{id} { status: "disabled" }`).
Miriam's live session stops working on her next request and she can no longer sign in
(same generic "those details don't match" message — the disabled state is not
disclosed), but her name stays on every order she dispatched and every stock change she
made. If Miriam ever returns, **Reactivate** on the same row restores access. Esther
cannot deactivate or demote her **own** account while she is the last active owner — the
server returns `409 last_owner` and the UI explains there must always be one active
owner.

---

## Cross-journey gaps this file is here to catch

- **The agreement checkbox must gate the submit button.** If "Place order" is tappable
  before the box is ticked, or the box renders but `POST /api/orders` doesn't send/verify
  the version numbers, journeys 1 and 2 look fine but the compliance record is fiction.
  It is a real, required step and a real write.
- **Guest → account handoff.** After Journey 1, "Create an account" on the confirmation
  page must pre-fill the email and, on register, attach the just-placed order to the new
  account (match on email) so it appears in Journey 2's order history.
- **Cart drawer must offer a direct Checkout button**, not only "View cart" — one of the
  two reference peers buries checkout behind an extra page and it costs conversions on
  mobile.
- **Quote drives payment options, not just price.** Pay-on-delivery must disappear from
  the Payment section the moment a `rest_of_kenya` address is chosen — deciding this only
  at `POST /api/orders` (after the customer picked it) is a dead end.
- **Publish latency is visible to Esther — handled.** Because public catalog reads are
  CDN-cached, the storefront can lag a publish by ~2 minutes (Journey 3 step 10). This is
  covered: `GET /api/admin/products/{id}/preview` and every admin view read live,
  uncached data, so Esther verifies the PDP via the Preview link (with its draft banner
  and phone-width toggle) both before and after publishing. The Publishing section of the
  product form states the ~2-minute public lag so the delay is expected, not alarming.
- **New-stock email links must deep-link to the live PDP**, not a generic "New In" page —
  Journey 2 depends on the tapped product still being purchasable when she arrives.
- **Role gating is server-truth, not a hidden nav item.** Journey 5 depends on a `staff`
  admin being unable to reach team management even by typing `/admin/team` or calling the
  API directly — `/api/admin/users*` must return `403` for `staff`, and `require-admin`
  must re-check `status = 'active'` on every request so a deactivated admin's live
  session dies on its next call. Hiding the Team link is cosmetic; the `403` and the
  per-request status check are the actual controls. Equally, the `mustChangePassword`
  gate must block every other admin view — if a new admin can navigate away from the
  forced screen, the "choose your own password on first sign-in" guarantee is fiction.
