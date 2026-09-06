/**
 * Generates the static HTML shells for every route. Each shell carries its own
 * baked <title>/description/canonical/robots + JSON-LD stub; the matching JS module
 * (assets/js/pages/<module>.js) renders the dynamic content into #view.
 *
 * Run: npm run gen  (from src/frontend)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = 'House of Esther';

/** [outputPath, module, {title, desc, active, noindex, admin, bare}] */
const PAGES = [
  ['index.html', 'home', { title: `${BRAND} — Curated Fashion Boutique, Delivered Across Kenya`, desc: 'A tightly curated boutique of clothing, accessories, watches, fragrance, sneakers and wigs. Honest sizing, real photos, M-Pesa or pay on delivery, delivered across Kenya.', active: '' }],

  ['new-in.html', 'listing', { title: `New In — Just Arrived at ${BRAND}`, desc: 'The latest pieces to land at House of Esther. New arrivals across women, men and accessories, updated as stock comes in.', active: 'New In' }],
  ['sale.html', 'listing', { title: `Sale — ${BRAND}`, desc: 'Reduced pieces at House of Esther, while stock lasts. Honest discounts on quality clothing and accessories.', active: 'Sale' }],
  ['search.html', 'listing', { title: `Search — ${BRAND}`, desc: 'Search the House of Esther boutique for clothing, accessories, watches, fragrance, sneakers and wigs.', active: '' }],
  ['women.html', 'listing', { title: `Women's Clothing & Accessories — ${BRAND}`, desc: 'Considered workwear and off-duty pieces for women. Curated by House of Esther, delivered across Kenya.', active: 'Women' }],
  ['men.html', 'listing', { title: `Men's Clothing & Accessories — ${BRAND}`, desc: 'Smart, well-made menswear and accessories, curated by House of Esther and delivered across Kenya.', active: 'Men' }],
  ['accessories.html', 'listing', { title: `Bags & Accessories — ${BRAND}`, desc: 'Leather bags, belts and finishing pieces, chosen for how they wear over time. House of Esther.', active: 'Accessories' }],
  ['watches.html', 'listing', { title: `Watches — ${BRAND}`, desc: 'A small, careful selection of watches. Buy online with M-Pesa or pay on delivery. House of Esther.', active: 'Watches' }],
  ['fragrance.html', 'listing', { title: `Fragrance & Perfume — ${BRAND}`, desc: 'Fragrance chosen to last on the skin. Delivered across Kenya by House of Esther.', active: 'Fragrance' }],
  ['sneakers.html', 'listing', { title: `Sneakers — ${BRAND}`, desc: 'Quality sneakers, honest sizing, delivered across Kenya. House of Esther.', active: 'Sneakers' }],
  ['wigs.html', 'listing', { title: `Wigs & Hair — ${BRAND}`, desc: 'Human-hair wigs and hair pieces with cap-size guidance. Delivered discreetly across Kenya by House of Esther.', active: 'Wigs' }],

  ['product.html', 'product', { title: `Product — ${BRAND}`, desc: 'Product details, honest sizing, real photos and verified reviews from House of Esther.', active: '' }],
  ['cart.html', 'cart', { title: `Your Cart — ${BRAND}`, desc: 'Review your House of Esther cart and the all-in cost before checkout.', active: '', noindex: true }],
  ['checkout.html', 'checkout', { title: `Checkout — ${BRAND}`, desc: 'Secure checkout at House of Esther.', active: '', noindex: true }],
  ['order-confirmation.html', 'confirmation', { title: `Order Confirmed — ${BRAND}`, desc: 'Your House of Esther order confirmation.', active: '', noindex: true }],
  ['order-tracking.html', 'tracking', { title: `Track Your Order — ${BRAND}`, desc: 'Track your House of Esther order with your order number and email.', active: '' }],

  ['about.html', 'about', { title: `Our Story — ${BRAND}`, desc: 'Why House of Esther exists: the gap between marketplace scale and boutique warmth, and our plain promise on delivery, sizing and support.', active: '' }],
  ['journal.html', 'journal', { title: `The Journal — Style, Fit & Care Notes — ${BRAND}`, desc: 'Notes on fit, care, and what we are wearing, from House of Esther.', active: 'Journal' }],
  ['journal-article.html', 'journalArticle', { title: `The Journal — ${BRAND}`, desc: 'A note on style, fit and care from House of Esther.', active: 'Journal' }],
  ['size-guide.html', 'sizeGuide', { title: `Size Guide — ${BRAND}`, desc: 'How House of Esther sizing works, how to measure, and size conversion tables for clothing, shoes and wig caps.', active: '' }],
  ['delivery-returns.html', 'deliveryReturns', { title: `Delivery & Returns — ${BRAND}`, desc: 'How House of Esther delivers across Kenya, what it costs, how tracking works, and how to start a return.', active: '' }],
  ['help.html', 'help', { title: `Help & FAQ — ${BRAND}`, desc: 'Answers on ordering, payment, delivery, sizing, returns, accounts and product care at House of Esther.', active: '' }],
  ['contact.html', 'contact', { title: `Contact Us — ${BRAND}`, desc: 'Message House of Esther about an order, a return, a product question or wholesale and press. We reply within one business day.', active: '' }],
  ['legal.html', 'legal', { title: `Legal — ${BRAND}`, desc: 'House of Esther Terms of Sale, Privacy Policy and Returns & Refund Policy, versioned.', active: '' }],
  ['subscription.html', 'subscription', { title: `Newsletter — ${BRAND}`, desc: 'Confirm or update your House of Esther new-stock alerts.', active: '', noindex: true }],
  ['404.html', 'notFound', { title: `Page not found — ${BRAND}`, desc: 'That page could not be found. Browse New In or the categories instead.', active: '', noindex: true }],

  ['account/signin.html', 'account/signin', { title: `Sign In or Create an Account — ${BRAND}`, desc: 'Sign in to House of Esther for order history, saved addresses, your wishlist and new-stock alerts.', active: '', noindex: true }],
  ['account/forgot-password.html', 'account/forgot', { title: `Reset your password — ${BRAND}`, desc: 'Request a password reset link for your House of Esther account.', active: '', noindex: true }],
  ['account/reset-password.html', 'account/reset', { title: `Set a new password — ${BRAND}`, desc: 'Choose a new password for your House of Esther account.', active: '', noindex: true }],
  ['account/index.html', 'account/overview', { title: `Your Account — ${BRAND}`, desc: 'Your House of Esther account overview.', active: '', noindex: true }],
  ['account/orders.html', 'account/orders', { title: `Your Orders — ${BRAND}`, desc: 'Your House of Esther order history.', active: '', noindex: true }],
  ['account/order.html', 'account/order', { title: `Order detail — ${BRAND}`, desc: 'Your House of Esther order detail.', active: '', noindex: true }],
  ['account/addresses.html', 'account/addresses', { title: `Saved Addresses — ${BRAND}`, desc: 'Manage your saved delivery addresses.', active: '', noindex: true }],
  ['account/profile.html', 'account/profile', { title: `Profile & Notifications — ${BRAND}`, desc: 'Update your details and notification preferences.', active: '', noindex: true }],
  ['account/wishlist.html', 'account/wishlist', { title: `Your Wishlist — ${BRAND}`, desc: 'Pieces you have saved at House of Esther.', active: '', noindex: true }],

  ['admin/index.html', 'admin/dashboard', { title: `Admin — Dashboard — ${BRAND}`, admin: true }],
  ['admin/signin.html', 'admin/signin', { title: `Admin Sign In — ${BRAND}`, admin: true, bare: true }],
  ['admin/products.html', 'admin/products', { title: `Admin — Products — ${BRAND}`, admin: true }],
  ['admin/product-edit.html', 'admin/productEdit', { title: `Admin — Edit Product — ${BRAND}`, admin: true }],
  ['admin/inventory.html', 'admin/inventory', { title: `Admin — Inventory — ${BRAND}`, admin: true }],
  ['admin/collections.html', 'admin/collections', { title: `Admin — Collections & Categories — ${BRAND}`, admin: true }],
  ['admin/orders.html', 'admin/orders', { title: `Admin — Orders — ${BRAND}`, admin: true }],
  ['admin/order.html', 'admin/order', { title: `Admin — Order — ${BRAND}`, admin: true }],
  ['admin/reviews.html', 'admin/reviews', { title: `Admin — Reviews — ${BRAND}`, admin: true }],
  ['admin/subscribers.html', 'admin/subscribers', { title: `Admin — Subscribers & Broadcasts — ${BRAND}`, admin: true }],
  ['admin/content.html', 'admin/content', { title: `Admin — Homepage Content — ${BRAND}`, admin: true }],
  ['admin/legal.html', 'admin/legal', { title: `Admin — Legal Documents — ${BRAND}`, admin: true }],
  ['admin/discounts.html', 'admin/discounts', { title: `Admin — Discount Codes — ${BRAND}`, admin: true }],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function depth(outPath) {
  return outPath.includes('/') ? '../' : './';
}

function shell(outPath, mod, meta) {
  const up = depth(outPath);
  const admin = !!meta.admin;
  const noindex = admin || meta.noindex;
  const cssHref = `${up}assets/css/${admin ? 'app-admin.css' : 'app.css'}`;
  const canonical = outPath === 'index.html' ? '/' : '/' + outPath.replace(/index\.html$/, '');
  const desc = meta.desc || `${BRAND} admin.`;
  const bodyClass = admin ? 'admin-body' : '';
  const jsonld = admin
    ? ''
    : `\n  <script type="application/ld+json">${JSON.stringify(baseJsonLd(outPath, meta))}</script>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${esc(canonical)}">${noindex ? '\n  <meta name="robots" content="noindex, nofollow">' : ''}
  <meta property="og:site_name" content="${BRAND}">
  <meta property="og:title" content="${esc(meta.title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta name="theme-color" content="#1B2A4A">
  <link rel="icon" href="${up}assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="/api" crossorigin>
  <link rel="preload" as="style" href="${cssHref}">
  <link rel="stylesheet" href="${cssHref}">${jsonld}
  <script type="module" src="${up}assets/js/pages/${mod}.js"></script>
</head>
<body class="${bodyClass}">
  <main id="main" class="${admin ? '' : 'page'}">
    ${admin ? '' : '<div class="wrap">'}
      <div id="view" aria-live="polite" aria-busy="true">
        <div class="spinner" role="status" aria-label="Loading"></div>
      </div>
    ${admin ? '' : '</div>'}
  </main>
  <noscript>
    <p style="padding:1rem;text-align:center">This page needs JavaScript to load live catalogue, cart and account data. Please enable it, or contact us at hello@houseofesther.co.ke.</p>
  </noscript>
</body>
</html>
`;
}

function baseJsonLd(outPath, meta) {
  if (outPath === 'index.html') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': ['Store', 'OnlineStore'],
          '@id': 'https://houseofesther.co.ke/#store',
          name: BRAND,
          description: meta.desc,
          url: 'https://houseofesther.co.ke/',
          areaServed: 'KE',
          paymentAccepted: ['M-Pesa', 'Cash on delivery'],
        },
        {
          '@type': 'WebSite',
          url: 'https://houseofesther.co.ke/',
          name: BRAND,
          potentialAction: {
            '@type': 'SearchAction',
            target: 'https://houseofesther.co.ke/search.html?q={search_term_string}',
            'query-input': 'required name=search_term_string',
          },
        },
        { '@type': 'Organization', name: BRAND, url: 'https://houseofesther.co.ke/' },
      ],
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: meta.title,
    description: meta.desc,
    isPartOf: { '@type': 'WebSite', name: BRAND, url: 'https://houseofesther.co.ke/' },
  };
}

let count = 0;
for (const [outPath, mod, meta] of PAGES) {
  const full = resolve(ROOT, outPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, shell(outPath, mod, meta));
  count += 1;
}
console.log(`generated ${count} page shells`);
