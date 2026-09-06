# Scope Checklist — House of Esther (esther-botique)

_Derived from `brand-brief.md` and constrained by `engineering-standards.md`. Prepared 2026-09-06._

## What kind of site is this?

An online boutique (direct-to-consumer retailer) selling a curated, upper-mid-range
range of physical goods — women's and men's clothing, accessories, watches, fragrance,
sneakers, and wigs — to urban professionals in Nairobi and, increasingly, nationwide in
Kenya. Esther (the owner) is the sole curator and operator. The business ships physical
product, takes payment by M-Pesa and pay-on-delivery, and plans to open a physical
flagship boutique within a year. Traffic is mobile-first and arrives from Instagram,
TikTok, WhatsApp groups and word of mouth, with buyers researching before purchase and
returning once trust is established.

This is a **Store** (retail sale of physical goods). It is not a marketplace (single
seller, not multi-vendor), not a service booking business, and not a rental business.

## Engineering-standards conflict check

No hard conflict found between `engineering-standards.md` non-negotiables and the brand
brief. Two tensions to manage during build (guardrails, not conflicts):

1. **Editorial photography ambition vs per-image size budgets.** The brief wants
   "real photos", consistent multi-angle product shots, and editorial "shop the look"
   grids. The standards impose hard per-image budgets (hero <= ~300 KB, thumb <= ~60 KB)
   and re-encode-on-ingest. Resolution: responsive `srcset`, thumbnail grids, full image
   only in the lightbox, admin upload pipeline re-encodes. The look is achievable within
   budget; the budget wins if they ever collide.
2. **"Live order tracking" (Glovo-style) vs "simplest architecture / single developer".**
   Resolution: tracking is a status timeline on the order record (placed → confirmed →
   packed → dispatched → out for delivery → delivered), updated by Esther in the admin
   and optionally by a courier webhook later. No real-time GPS map at launch.

If a later instruction reintroduces a genuine conflict (e.g. "add a second vendor
portal" vs "no micro-frontends"), stop and flag it rather than resolving it silently.

## Capability categories

| Category | Verdict | Reason |
|---|---|---|
| **Catalog / inventory** | **Applies** | Core of the business. Curated product range across ~7 categories, each product having size/colour/volume variants and per-variant stock. Managed solely by Esther via an admin back-office; no customer-generated listings. |
| **Payments / checkout** | **Applies** | One-time purchases only. M-Pesa STK push (via backend proxy to Safaricom Daraja) and pay-on-delivery (cash or M-Pesa to rider). No subscription or recurring billing anywhere in the brief. |
| **Accounts / auth** | **Applies** | Customers: optional account for order history, saved addresses, wishlist, and "tell me when new stock arrives" preferences — but guest checkout must be supported (low-friction repeat buying is a stated goal). Admin: Esther must log in to a protected back-office. Authorization enforced server-side on every protected and admin endpoint. |
| **Admin / back-office** | **Applies** | Esther updates products, photos, stock, prices, collections, homepage content, legal-document versions, and order fulfilment status after launch. Delivered as gated routes inside the single frontend build (not a separate app — no micro-frontends), with server-enforced admin role. |
| **Search / discovery** | **Applies** | Brief explicitly cites Walmart-style search focus and ASOS-style filter/sort UX. Needs keyword search, type-ahead suggestions, category browse, faceted filters (size, colour, price, category, availability), sort, and curated collections ("New In", "Shop the Look"). |
| **Notifications** | **Applies** | Order confirmation, payment receipt, dispatch/out-for-delivery/delivered updates, password reset, contact-form acknowledgement, and "new stock arrived" / back-in-stock alerts (a stated retention driver). Email at launch; SMS/WhatsApp for delivery updates is a fast follow given the Kenyan audience. All sent from the backend. |
| **Legal / compliance** | **Applies** | Terms of Sale, Privacy Policy (Kenya Data Protection Act 2019 — the site collects names, phone numbers, addresses, purchase history), and a Returns & Refund Policy. Served as versioned documents so the version a customer agreed to is recoverable. |
| **Customer agreements** | **Partially applies** | No rental agreement, service contract, or waiver — this is retail sale of goods, so the heavyweight "first-class agreement per transaction" pattern (as for car/equipment rental) does **not** apply. However, because pay-on-delivery creates a real obligation and returns/refunds are a named brand promise, checkout **must** capture explicit acceptance of the Terms of Sale + Returns & Refund Policy as a recorded event (who accepted, when, which document versions, IP/user-agent), written as a side effect of order creation — not a checkbox that does nothing on submit. It is a numbered step in `user-journeys.md` ("review order and accept Terms of Sale & Return Policy") and has a backing write in `api-contract.md`. Treated as lighter than a rental agreement but heavier than a footer link. |

## schema.org type for the business

**`Store`** (specifically an online store; use `Store` for broad crawler support, and
add `OnlineStore` as an additional type where the consuming tool understands it). A
physical `address` / `openingHoursSpecification` can be added to the same node once the
flagship boutique opens.
