/**
 * In-memory mock of api-contract.md, just complete enough to click-test the
 * journeys end to end without a backend. Shapes mirror the contract exactly.
 */

const KES = (amount) => ({ amount, currency: 'KES' });

const IMG = (id, alt) => ({
  id,
  alt,
  // Real seed photos deploy to the site origin at /seed/{id}-{size}.jpg (see
  // deploy/build-staging-frontend.sh + tools/serve.js). imageEl() falls back to the
  // neutral SVG placeholder if a file is genuinely missing.
  thumbUrl: `/seed/${id}-800.jpg`,
  fullUrl: `/seed/${id}-2000.jpg`,
  width: 1600,
  height: 2000,
  isPrimary: false,
});

const PRODUCTS = [
  {
    id: 'prod_1042',
    slug: 'harlan-leather-crossbody',
    name: 'Harlan Leather Crossbody',
    category: 'accessories',
    subcategory: 'bags',
    shortDescription: 'A compact everyday crossbody in vegetable-tanned leather.',
    story: '<p>We picked this leather because it softens instead of cracking.</p>',
    care: 'Wipe with a dry cloth. Keep out of prolonged direct sun.',
    specs: [
      { label: 'Material', value: 'Vegetable-tanned cowhide' },
      { label: 'Dimensions', value: '24 x 16 x 7 cm' },
      { label: 'Origin', value: 'Made in Kenya' },
    ],
    price: KES(6800),
    compareAtPrice: KES(8200),
    onSale: true,
    isNew: true,
    vatInclusive: true,
    images: [{ ...IMG('img_harlan1', 'Tan leather crossbody bag, front view'), isPrimary: true }, IMG('img_harlan2', 'Tan leather crossbody bag, side view')],
    primaryImage: { ...IMG('img_harlan1', 'Tan leather crossbody bag, front view'), width: 800, height: 1000 },
    optionAxes: [
      { name: 'Colour', values: ['Tan', 'Black'] },
      { name: 'Size', values: ['One size'] },
    ],
    variants: [
      { id: 'var_tan', sku: 'HAR-CB-TAN-OS', options: { Colour: 'Tan', Size: 'One size' }, price: KES(6800), compareAtPrice: KES(8200), inStock: true, stockState: 'in_stock', quantityAvailable: 7, imageId: 'img_harlan1' },
      { id: 'var_black', sku: 'HAR-CB-BLK-OS', options: { Colour: 'Black', Size: 'One size' }, price: KES(6800), compareAtPrice: KES(8200), inStock: true, stockState: 'low_stock', quantityAvailable: 2, imageId: 'img_harlan2' },
    ],
    sizeGuideCategory: 'bags',
    rating: { average: 4.6, count: 23 },
    seo: { title: 'Harlan Leather Crossbody — Bags — House of Esther', description: 'A compact everyday crossbody.' },
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Accessories', href: '/accessories' },
      { label: 'Bags', href: '/accessories/bags' },
    ],
    colors: [{ name: 'Tan', hex: '#B98A5E' }, { name: 'Black', hex: '#1A1A1A' }],
    inStock: true,
  },
  {
    id: 'prod_2001',
    slug: 'orin-linen-dress',
    name: 'Orin Linen Dress',
    category: 'women',
    subcategory: 'dresses',
    shortDescription: 'A breathable linen dress that only gets softer.',
    story: '<p>We chose this linen because it breathes and only gets softer.</p>',
    care: 'Cool machine wash. Line dry.',
    specs: [{ label: 'Material', value: '100% linen' }, { label: 'Origin', value: 'Made in Kenya' }],
    price: KES(5400),
    compareAtPrice: null,
    onSale: false,
    isNew: true,
    vatInclusive: true,
    images: [{ ...IMG('img_orin1', 'Sand linen dress, front view'), isPrimary: true }, IMG('img_orin2', 'Sand linen dress, side view')],
    primaryImage: IMG('img_orin1', 'Sand linen dress, front view'),
    optionAxes: [
      { name: 'Colour', values: ['Sand', 'Black'] },
      { name: 'Size', values: ['S', 'M', 'L'] },
    ],
    variants: [
      { id: 'var_orin_sand_m', sku: 'ORIN-SND-M', options: { Colour: 'Sand', Size: 'M' }, price: KES(5400), inStock: true, stockState: 'in_stock', quantityAvailable: 9 },
      { id: 'var_orin_sand_s', sku: 'ORIN-SND-S', options: { Colour: 'Sand', Size: 'S' }, price: KES(5400), inStock: true, stockState: 'in_stock', quantityAvailable: 4 },
      { id: 'var_orin_black_m', sku: 'ORIN-BLK-M', options: { Colour: 'Black', Size: 'M' }, price: KES(5400), inStock: false, stockState: 'out_of_stock' },
      { id: 'var_orin_black_s', sku: 'ORIN-BLK-S', options: { Colour: 'Black', Size: 'S' }, price: KES(5400), inStock: true, stockState: 'in_stock', quantityAvailable: 3 },
      { id: 'var_orin_sand_l', sku: 'ORIN-SND-L', options: { Colour: 'Sand', Size: 'L' }, price: KES(5400), inStock: true, stockState: 'in_stock', quantityAvailable: 6 },
      { id: 'var_orin_black_l', sku: 'ORIN-BLK-L', options: { Colour: 'Black', Size: 'L' }, price: KES(5400), inStock: true, stockState: 'in_stock', quantityAvailable: 2 },
    ],
    sizeGuideCategory: 'dresses',
    rating: { average: 0, count: 0 }, // seed products ship with no reviews yet — drives the buy-box null-child path
    seo: { title: 'Orin Linen Dress — Women — House of Esther', description: 'A breathable linen dress.' },
    breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Women', href: '/women' }, { label: 'Dresses', href: '/women/dresses' }],
    colors: [{ name: 'Sand', hex: '#D9C9A8' }, { name: 'Black', hex: '#1A1A1A' }],
    inStock: true,
  },
];

function card(p) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    onSale: p.onSale,
    isNew: p.isNew,
    primaryImage: p.primaryImage,
    colors: p.colors,
    rating: p.rating,
    inStock: p.inStock,
  };
}

export function createMockState() {
  return {
    cart: { id: 'cart_test', items: [], discount: null, subtotal: KES(0), discountTotal: KES(0), estimatedDelivery: null, estimatedTotal: null, currency: 'KES', updatedAt: new Date().toISOString() },
    orders: {},
    admin: false,
    user: null,
  };
}

function recalcCart(cart) {
  let subtotal = 0;
  cart.items.forEach((it) => {
    it.lineTotal = KES(it.unitPrice.amount * it.quantity);
    subtotal += it.lineTotal.amount;
  });
  cart.subtotal = KES(subtotal);
  const disc = cart.discount ? -Math.round(subtotal * 0.1) : 0;
  cart.discountTotal = KES(disc);
  cart.estimatedTotal = KES(subtotal + disc);
  cart.updatedAt = new Date().toISOString();
}

function findVariant(variantId) {
  for (const p of PRODUCTS) {
    const v = (p.variants || []).find((x) => x.id === variantId);
    if (v) return { p, v };
  }
  return null;
}

const ZONES = {
  zones: [
    { code: 'nairobi', label: 'Nairobi', counties: ['Nairobi'], methods: [{ code: 'nairobi_next_day', label: 'Nairobi next-day', fee: KES(300), eta: '1-2 business days', payOnDeliveryAllowed: true }] },
    { code: 'major_towns', label: 'Major towns', counties: ['Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'], methods: [{ code: 'town_courier', label: 'Courier to town', fee: KES(450), eta: '2-4 business days', payOnDeliveryAllowed: true }] },
    { code: 'rest_of_kenya', label: 'Rest of Kenya', counties: ['Garissa', 'Isiolo', 'Lodwar'], methods: [{ code: 'upcountry_courier', label: 'Upcountry courier', fee: KES(650), eta: '3-6 business days', payOnDeliveryAllowed: false }] },
  ],
};

const LEGAL = {
  'terms-of-sale': { docType: 'terms-of-sale', version: 4, effectiveDate: '2026-07-01', title: 'Terms of Sale', bodyHtml: '<h2>1. These terms</h2><p>These are the mock Terms of Sale.</p>', previousVersions: [{ version: 3, effectiveDate: '2026-02-01' }] },
  returns: { docType: 'returns', version: 2, effectiveDate: '2026-05-01', title: 'Returns & Refund Policy', bodyHtml: '<h2>Returns</h2><p>14 days, unworn.</p>', previousVersions: [] },
  privacy: { docType: 'privacy', version: 1, effectiveDate: '2026-01-01', title: 'Privacy Policy', bodyHtml: '<h2>Privacy</h2><p>Mock privacy policy.</p>', previousVersions: [] },
};

const CONTACTS = [
  { reference: 'MSG-2026-0442', name: 'Amina W.', email: 'amina@gmail.com', phone: '+254712345123', topic: 'return', orderNumber: 'HE-2026-04871', message: 'My delivery ETA passed — any update? I also want to return the Orin Linen Dress, it did not fit.', handled: false, handledAt: null, handledBy: null, createdAt: '2026-09-13T08:04:00Z' },
  { reference: 'MSG-2026-0441', name: 'Brian K.', email: 'brian@example.com', phone: '+254700111222', topic: 'product_question', orderNumber: null, message: 'Is the Harlan crossbody strap adjustable?', handled: true, handledAt: '2026-09-12T10:00:00Z', handledBy: 'usr_admin1', createdAt: '2026-09-12T09:30:00Z' },
];

const ADMIN_USERS_SEED = [
  {
    id: 'usr_admin1',
    name: 'Esther Wanjiru',
    email: 'esther@houseofesther.co.ke',
    role: 'owner',
    status: 'active',
    mustChangePassword: false,
    createdAt: '2026-09-06T09:00:00Z',
    lastLoginAt: '2026-09-08T07:14:00Z',
  },
];

const COMMON_PASSWORDS = new Set(['password', 'password1', '12345678', 'qwertyui', 'letmein1']);

function adminMe(state) {
  const s = state.session;
  const u = state.adminUsers.find((x) => x.id === s.userId) || { id: s.userId, name: 'Admin', email: 'admin@houseofesther.co.ke' };
  return { user: { id: u.id, name: u.name, email: u.email, role: s.role }, mustChangePassword: !!s.mustChangePassword };
}

/**
 * Attach to a Playwright page.
 *  - opts.admin=true               makes admin/me succeed (default role owner)
 *  - opts.adminRole='staff'|'owner'
 *  - opts.adminMustChangePassword=true forces the change-password gate
 *  - opts.adminUserId              which seeded admin the session belongs to
 */
export async function installMockApi(page, opts = {}) {
  const state = createMockState();
  state.admin = !!opts.admin;
  state.adminUsers = ADMIN_USERS_SEED.map((u) => ({ ...u }));
  state.session = opts.admin
    ? {
        userId: opts.adminUserId || 'usr_admin1',
        role: opts.adminRole || 'owner',
        mustChangePassword: !!opts.adminMustChangePassword,
      }
    : null;
  state.contacts = CONTACTS.map((c) => ({ ...c }));
  state.user = opts.user || null;
  // A3 bulk-status: admin list statuses live here so bulk actions + refresh round-trip.
  state.adminProductStatus = { prod_1042: 'published', prod_2001: 'draft' };

  // Route on the context so popups (e.g. the admin "Preview" new tab) share the mock + state.
  await page.context().route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    const body = req.postData() ? safeJson(req.postData()) : {};
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });
    const err = (status, code, message) => json(status, { error: { code, message } });

    // ---- content / catalog ----
    if (path === '/content/home') {
      return json(200, {
        announcement: { enabled: true, text: 'Delivered countrywide. Pay with M-Pesa or on delivery.', href: '/delivery-returns.html' },
        hero: { headline: 'Style worth the wait', subcopy: 'Curated pieces, honest sizing, delivered to your door.', ctaLabel: 'Shop new in', ctaHref: '/new-in.html', image: IMG('img_hero1', 'Editorial hero') },
        categoryTiles: [{ label: 'Women', href: '/women.html', image: IMG('img_cat_women', 'Womenswear') }, { label: 'Accessories', href: '/accessories.html', image: IMG('img_cat_accessories', 'Accessories') }],
        editorialBlocks: [{ id: 'eb_1', caption: 'The September edit', image: IMG('img_ed1', 'September edit'), href: '/journal-article.html?slug=september-edit' }],
        featuredCollectionSlug: 'workwear',
        socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/houseofesther' }],
      });
    }
    if (path === '/products' && method === 'GET') {
      const items = PRODUCTS.map(card);
      const cat = url.searchParams.get('category');
      // Some categories (watches, fragrance) legitimately have no colour/size/subcategory
      // facets — the API returns [] — which is what produced the `nullnull` regression.
      const sparse = cat === 'watches' || cat === 'fragrance';
      return json(200, {
        items,
        page: 1,
        pageSize: 24,
        total: items.length,
        totalPages: 1,
        appliedFilters: {},
        facets: {
          categories: [{ value: 'women', label: 'Women', count: 1 }, { value: 'accessories', label: 'Accessories', count: 1 }],
          subcategories: sparse ? [] : [{ value: 'bags', label: 'Bags', count: 1 }, { value: 'dresses', label: 'Dresses', count: 1 }],
          colors: sparse ? [] : [{ value: 'Black', label: 'Black', hex: '#1A1A1A', count: 2 }, { value: 'Tan', label: 'Tan', hex: '#B98A5E', count: 1 }],
          sizes: sparse ? [] : [{ value: 'M', label: 'M', count: 1 }, { value: 'S', label: 'S', count: 1 }],
          priceRange: { min: 5400, max: 6800, currency: 'KES' },
        },
        query: { term: url.searchParams.get('q') || null, didYouMean: null },
        heading: { title: cat ? cap(cat) : 'New In', description: 'Considered pieces, chosen with care.' },
      });
    }
    if (path === '/categories') {
      return json(200, { items: [
        { slug: 'women', label: 'Women', description: 'Workwear and off-duty.', image: IMG('img_cat_women', 'Women'), subcategories: [{ slug: 'dresses', label: 'Dresses' }, { slug: 'tops', label: 'Tops' }] },
        { slug: 'accessories', label: 'Accessories', description: 'Bags and finishing pieces.', image: IMG('img_cat_accessories', 'Accessories'), subcategories: [{ slug: 'bags', label: 'Bags' }] },
      ] });
    }
    if (path.startsWith('/collections/')) {
      return json(200, { slug: path.split('/')[2], title: 'Workwear', description: 'Considered workwear.', heroImage: IMG('img_col_workwear', 'Workwear') });
    }
    if (path === '/search/suggestions') {
      return json(200, { terms: ['linen dress'], products: [{ slug: 'orin-linen-dress', name: 'Orin Linen Dress', price: KES(5400), thumbUrl: '/assets/img/placeholder.svg', alt: 'Orin Linen Dress' }], categories: [{ slug: 'women', label: 'Women' }] });
    }
    const prodMatch = path.match(/^\/products\/([^/]+)$/);
    if (prodMatch && method === 'GET') {
      const p = PRODUCTS.find((x) => x.slug === prodMatch[1]);
      return p ? json(200, p) : err(404, 'not_found', 'No such product.');
    }
    if (path.match(/^\/products\/[^/]+\/availability$/)) {
      const p = PRODUCTS.find((x) => x.slug === path.split('/')[2]);
      return json(200, { variants: (p ? p.variants : []).map((v) => ({ id: v.id, inStock: v.inStock, stockState: v.stockState, quantityAvailable: v.quantityAvailable })) });
    }
    if (path.match(/^\/products\/[^/]+\/related$/)) {
      return json(200, { items: PRODUCTS.map(card) });
    }
    if (path.match(/^\/products\/[^/]+\/reviews$/) && method === 'GET') {
      return json(200, { items: [{ id: 'rev_88', authorFirstName: 'Wanjiru', rating: 5, title: 'Runs true to size', body: 'Ordered my usual M and it fit exactly right, lovely fabric too.', verifiedPurchase: true, createdAt: '2026-08-20T09:00:00Z' }], page: 1, pageSize: 5, total: 1, totalPages: 1, summary: { average: 4.6, count: 23, distribution: { 5: 16, 4: 5, 3: 1, 2: 1, 1: 0 } } });
    }
    if (path.match(/^\/products\/[^/]+\/reviews$/) && method === 'POST') {
      return json(201, { id: 'rev_91', status: 'pending_moderation', message: 'Thanks — we read every review before it goes live.' });
    }

    // ---- cart ----
    if (path === '/cart' && method === 'GET') return json(200, state.cart);
    if (path === '/cart/items' && method === 'POST') {
      const fv = findVariant(body.variantId);
      if (!fv) return err(404, 'not_found', 'That option is no longer available.');
      const qty = Math.min(body.quantity || 1, fv.v.quantityAvailable || 5);
      const existing = state.cart.items.find((i) => i.variantId === body.variantId);
      if (existing) existing.quantity += qty;
      else {
        state.cart.items.push({
          id: `ci_${state.cart.items.length + 1}`,
          productId: fv.p.id,
          variantId: fv.v.id,
          slug: fv.p.slug,
          name: fv.p.name,
          options: fv.v.options,
          image: fv.p.primaryImage,
          unitPrice: fv.v.price,
          quantity: qty,
          lineTotal: KES(fv.v.price.amount * qty),
          quantityAvailable: fv.v.quantityAvailable,
          stockState: fv.v.stockState,
        });
      }
      recalcCart(state.cart);
      return json(200, state.cart);
    }
    const ciMatch = path.match(/^\/cart\/items\/([^/]+)$/);
    if (ciMatch && method === 'PATCH') {
      const it = state.cart.items.find((i) => i.id === ciMatch[1]);
      if (it) it.quantity = Math.max(1, body.quantity);
      recalcCart(state.cart);
      return json(200, state.cart);
    }
    if (ciMatch && method === 'DELETE') {
      state.cart.items = state.cart.items.filter((i) => i.id !== ciMatch[1]);
      recalcCart(state.cart);
      return json(200, state.cart);
    }
    if (path === '/cart/discount' && method === 'POST') {
      if ((body.code || '').toUpperCase() !== 'WELCOME10') return err(404, 'not_found', 'We do not recognise that code.');
      state.cart.discount = { code: 'WELCOME10', type: 'percent', value: 10, amount: KES(-Math.round(state.cart.subtotal.amount * 0.1)) };
      recalcCart(state.cart);
      return json(200, state.cart);
    }
    if (path === '/cart/discount' && method === 'DELETE') {
      state.cart.discount = null;
      recalcCart(state.cart);
      return json(200, state.cart);
    }

    // ---- delivery / quote / legal ----
    if (path === '/delivery/zones') return json(200, ZONES);
    if (path === '/checkout/quote' && method === 'POST') {
      const county = body.county;
      const zone = ZONES.zones.find((z) => z.counties.includes(county));
      if (!zone) return err(422, 'validation_error', 'We do not deliver to that county yet.');
      if (!state.cart.items.length) return err(409, 'conflict', 'Your cart is empty.');
      const fee = zone.methods[0].fee;
      const sub = state.cart.subtotal.amount;
      const disc = state.cart.discount ? -Math.round(sub * 0.1) : 0;
      return json(200, {
        zone: zone.code,
        methods: zone.methods.map((m) => ({ code: m.code, label: m.label, fee: m.fee, eta: m.eta })),
        allowedPaymentMethods: zone.methods[0].payOnDeliveryAllowed ? ['mpesa', 'pay_on_delivery'] : ['mpesa'],
        cart: { subtotal: KES(sub), discountTotal: KES(disc), deliveryFee: fee, total: KES(sub + disc + fee.amount) },
      });
    }
    if (path.match(/^\/legal\/[^/]+$/)) {
      const doc = LEGAL[path.split('/')[2]];
      return doc ? json(200, doc) : err(404, 'not_found', 'No such document.');
    }
    if (path.match(/^\/legal\/[^/]+\/versions\/\d+$/)) {
      const doc = LEGAL[path.split('/')[2]];
      return doc ? json(200, { ...doc, previousVersions: undefined }) : err(404, 'not_found', 'No such version.');
    }

    // ---- orders / payments ----
    if (path === '/orders' && method === 'POST') {
      const orderNumber = 'HE-2026-04871';
      const sub = state.cart.subtotal.amount;
      const disc = state.cart.discount ? -Math.round(sub * 0.1) : 0;
      const fee = body.deliveryMethodCode === 'nairobi_next_day' ? 300 : body.deliveryMethodCode === 'town_courier' ? 450 : 650;
      const total = sub + disc + fee;
      const order = {
        orderNumber,
        status: 'placed',
        statusTimeline: [
          { status: 'placed', at: new Date().toISOString() },
          { status: 'confirmed', at: null }, { status: 'packed', at: null }, { status: 'dispatched', at: null },
          { status: 'out_for_delivery', at: null }, { status: 'delivered', at: null },
        ],
        placedAt: new Date().toISOString(),
        customer: { firstName: body.contact.firstName, email: body.contact.email, phone: body.contact.phone },
        deliveryAddress: body.deliveryAddress,
        deliveryMethod: { code: body.deliveryMethodCode, label: 'Nairobi next-day', eta: '1-2 business days' },
        items: state.cart.items.map((it) => ({ productId: it.productId, variantId: it.variantId, name: it.name, options: it.options, image: it.image, unitPrice: it.unitPrice, quantity: it.quantity, lineTotal: it.lineTotal })),
        subtotal: KES(sub),
        discountTotal: KES(disc),
        deliveryFee: KES(fee),
        total: KES(total),
        payment: body.paymentMethod === 'mpesa'
          ? { method: 'mpesa', state: 'pending' }
          : { method: 'pay_on_delivery', state: 'awaiting_delivery' },
        agreementAcceptance: { id: 'acc_77c1', acceptedAt: new Date().toISOString(), termsOfSaleVersion: body.agreementAcceptance.termsOfSaleVersion, returnsPolicyVersion: body.agreementAcceptance.returnsPolicyVersion },
        cancellable: true,
      };
      state.orders[orderNumber] = order;
      state.paymentId = 'pay_5567';
      state.paymentPollCount = 0;
      return json(201, {
        order,
        payment: { id: 'pay_5567', method: body.paymentMethod, state: body.paymentMethod === 'mpesa' ? 'pending' : 'awaiting_delivery', amount: KES(total) },
        trackingToken: 'trk_test_token',
        agreementAcceptanceId: 'acc_77c1',
      });
    }
    if (path === '/payments/mpesa/stk-push' && method === 'POST') {
      return json(202, { paymentId: body.paymentId, state: 'processing', message: 'Check your phone and enter your M-Pesa PIN.', checkoutRequestId: 'ws_CO_test' });
    }
    const payMatch = path.match(/^\/payments\/([^/]+)$/);
    if (payMatch && method === 'GET') {
      state.paymentPollCount = (state.paymentPollCount || 0) + 1;
      const paid = state.paymentPollCount >= 2;
      if (paid && state.orders['HE-2026-04871']) {
        const o = state.orders['HE-2026-04871'];
        o.status = 'confirmed';
        o.statusTimeline[1].at = new Date().toISOString();
        o.payment = { method: 'mpesa', state: 'paid', mpesaReceiptNumber: 'SFE7X2K9Q1', paidAt: new Date().toISOString() };
      }
      return json(200, { id: payMatch[1], orderNumber: 'HE-2026-04871', method: 'mpesa', state: paid ? 'paid' : 'processing', amount: KES(6420), mpesaReceiptNumber: paid ? 'SFE7X2K9Q1' : null, failureReason: null, updatedAt: new Date().toISOString() });
    }
    const ordMatch = path.match(/^\/orders\/([^/]+)$/);
    if (ordMatch && method === 'GET') {
      const o = state.orders[ordMatch[1]];
      return o ? json(200, o) : err(404, 'not_found', 'We could not find that order.');
    }
    if (path.match(/^\/orders\/[^/]+\/lookup$/) && method === 'POST') {
      const o = state.orders[path.split('/')[2]];
      return o ? json(200, { order: o }) : err(404, 'not_found', 'No matching order.');
    }
    if (path.match(/^\/orders\/[^/]+\/payment-method$/) && method === 'PATCH') {
      const o = state.orders[path.split('/')[2]];
      if (o) o.payment = { method: 'pay_on_delivery', state: 'awaiting_delivery' };
      return json(200, o);
    }

    // ---- auth ----
    if (path === '/auth/me') return state.user ? json(200, { user: state.user }) : err(401, 'unauthorized', 'Not signed in.');
    if (path === '/auth/login' && method === 'POST') { state.user = { id: 'usr_1', firstName: 'Wanjiru', email: body.email, phone: '+254712345123' }; return json(200, { user: state.user }); }
    if (path === '/auth/register' && method === 'POST') { state.user = { id: 'usr_1', firstName: body.firstName, email: body.email, phone: body.phone }; return json(201, { user: state.user }); }
    if (path === '/auth/logout') { state.user = null; return route.fulfill({ status: 204, body: '' }); }
    if (path === '/auth/password/forgot') return json(200, { message: 'If that email is registered, a reset link is on its way.' });
    if (path === '/auth/password/reset') return json(200, { message: 'Password updated. You can sign in now.' });

    // ---- account ----
    if (path === '/account/orders' && method === 'GET') {
      return json(200, { items: Object.values(state.orders).map((o) => ({ orderNumber: o.orderNumber, placedAt: o.placedAt, status: o.status, total: o.total, itemCount: o.items.length, thumbnails: ['/assets/img/placeholder.svg'] })), page: 1, pageSize: 24, total: Object.keys(state.orders).length, totalPages: 1 });
    }
    if (path.match(/^\/account\/orders\/[^/]+$/) && method === 'GET') {
      const o = state.orders[path.split('/')[3]];
      return o ? json(200, { ...o, agreementDocuments: { termsOfSale: { version: 4, href: '/legal.html?doc=terms-of-sale&v=4' }, returnsPolicy: { version: 2, href: '/legal.html?doc=returns&v=2' } } }) : err(404, 'not_found', 'Not found.');
    }
    if (path.match(/^\/account\/orders\/[^/]+\/reorder$/)) return json(200, { ...state.cart, unavailable: [] });
    if (path === '/account/addresses' && method === 'GET') return json(200, { items: [{ id: 'adr_1', recipientName: 'Wanjiru M.', phone: '+254712345123', county: 'Nakuru', town: 'Milimani', instructions: 'Gate 3', isDefault: true }] });
    if (path === '/account/addresses' && method === 'POST') return json(201, { id: 'adr_2', ...body });
    if (path.match(/^\/account\/addresses\/[^/]+$/) && method === 'PATCH') return json(200, { id: path.split('/')[3], ...body });
    if (path.match(/^\/account\/addresses\/[^/]+$/) && method === 'DELETE') return route.fulfill({ status: 204, body: '' });
    if (path === '/account/profile' && method === 'GET') return json(200, { firstName: 'Wanjiru', lastName: 'M', email: 'wanjiru@example.com', phone: '+254712345123' });
    if (path === '/account/profile' && method === 'PATCH') return json(200, { firstName: body.firstName || 'Wanjiru', lastName: body.lastName || 'M', email: body.email || 'wanjiru@example.com', phone: body.phone || '+254712345123' });
    if (path === '/account/notification-preferences' && method === 'GET') return json(200, { orderUpdates: true, newArrivals: true, backInStock: true, journal: false });
    if (path === '/account/notification-preferences' && method === 'PUT') return json(200, { orderUpdates: true, ...body });
    if (path === '/account/wishlist' && method === 'GET') return json(200, { items: state.wishlist || [] });
    if (path === '/account/wishlist' && method === 'POST') { state.wishlist = [...(state.wishlist || []), card(PRODUCTS.find((p) => p.id === body.productId) || PRODUCTS[0])]; return json(200, { items: state.wishlist }); }
    if (path.match(/^\/account\/wishlist\/[^/]+$/) && method === 'DELETE') { state.wishlist = (state.wishlist || []).filter((p) => p.id !== path.split('/')[3]); return json(200, { items: state.wishlist }); }

    // ---- subscriptions / contact / journal ----
    if (path === '/subscriptions' && method === 'POST') return json(202, { status: 'pending_confirmation', message: 'Almost there — tap the link in the email to confirm.' });
    if (path === '/subscriptions/confirm') return json(200, { status: 'confirmed' });
    if (path === '/subscriptions/unsubscribe') return json(200, { status: 'unsubscribed' });
    if (path === '/contact' && method === 'POST') return json(201, { reference: 'MSG-2026-0442', message: 'Got it. We reply within one business day.' });
    if (path === '/journal' && method === 'GET') return json(200, { items: [{ slug: 'september-edit', title: 'The September Edit', excerpt: 'Dressing for the in-between season.', tag: 'lookbook', coverImage: IMG('img_j_sept', 'September edit'), publishedAt: '2026-09-01T08:00:00Z' }], page: 1, pageSize: 12, total: 1, totalPages: 1 });
    if (path.match(/^\/journal\/[^/]+$/)) return json(200, { slug: path.split('/')[2], title: 'The September Edit', tag: 'lookbook', heroImage: IMG('img_j_sept', 'September edit'), publishedAt: '2026-09-01T08:00:00Z', bodyHtml: '<p>A note on the season.</p>', shopTheLook: PRODUCTS.map(card), related: [], seo: { title: 'The September Edit — The Journal — House of Esther', description: 'A note.' } });

    // ---- admin auth (A1) ----
    if (path === '/admin/auth/me') return state.session ? json(200, adminMe(state)) : err(401, 'unauthorized', 'Sign in.');
    if (path === '/admin/auth/login' && method === 'POST') {
      state.admin = true;
      state.session = { userId: opts.adminUserId || 'usr_admin1', role: opts.adminRole || 'owner', mustChangePassword: !!opts.adminMustChangePassword };
      return json(200, adminMe(state));
    }
    if (path === '/admin/auth/logout') { state.admin = false; state.session = null; return route.fulfill({ status: 204, body: '' }); }
    if (path === '/admin/auth/change-password' && method === 'POST') {
      if (!state.session) return err(401, 'unauthorized', 'Sign in.');
      const CURRENT_OK = new Set(['Temp-Handover-2026', 'correct horse battery staple', 'old-password-123']);
      if (!CURRENT_OK.has(body.currentPassword)) {
        return err(422, 'current_password_incorrect', "That current password doesn't match.");
      }
      if (!body.newPassword || body.newPassword.length < 8 || COMMON_PASSWORDS.has(body.newPassword)) {
        return err(422, 'validation_error', 'Choose at least 8 characters and avoid common passwords.');
      }
      state.session.mustChangePassword = false;
      const u = state.adminUsers.find((x) => x.id === state.session.userId);
      if (u) u.mustChangePassword = false;
      return json(200, adminMe(state));
    }

    // ---- admin team / users (A16, owner-only) ----
    if (path.startsWith('/admin/users')) {
      if (!state.session) return err(401, 'unauthorized', 'Sign in.');
      if (state.session.role !== 'owner') return err(403, 'forbidden', 'Owners only.');

      if (path === '/admin/users' && method === 'GET') {
        return json(200, { items: state.adminUsers.slice() });
      }
      if (path === '/admin/users' && method === 'POST') {
        if (!body.name || !body.name.trim() || !body.email || !body.role) {
          return err(422, 'validation_error', 'Name, email and role are all required.');
        }
        if (!['owner', 'staff'].includes(body.role)) return err(422, 'validation_error', 'Pick a valid role.');
        if (!body.initialPassword || body.initialPassword.length < 8 || COMMON_PASSWORDS.has(body.initialPassword)) {
          return err(422, 'validation_error', 'The initial password must be at least 8 characters and not a common one.');
        }
        if (state.adminUsers.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) {
          return err(409, 'email_taken', 'An admin already uses that email.');
        }
        const user = {
          id: `usr_${Date.now()}`,
          name: body.name.trim(),
          email: body.email.toLowerCase(),
          role: body.role,
          status: 'active',
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
        };
        state.adminUsers.unshift(user);
        return json(201, user);
      }
      const resetMatch = path.match(/^\/admin\/users\/([^/]+)\/reset-password$/);
      if (resetMatch && method === 'POST') {
        const u = state.adminUsers.find((x) => x.id === resetMatch[1]);
        if (!u) return err(404, 'not_found', 'No such admin.');
        if (!body.newPassword || body.newPassword.length < 8 || COMMON_PASSWORDS.has(body.newPassword)) {
          return err(422, 'validation_error', 'That password is too weak or too common.');
        }
        u.mustChangePassword = true;
        return json(200, u);
      }
      const idMatch = path.match(/^\/admin\/users\/([^/]+)$/);
      if (idMatch && method === 'PATCH') {
        const u = state.adminUsers.find((x) => x.id === idMatch[1]);
        if (!u) return err(404, 'not_found', 'No such admin.');
        const activeOwners = state.adminUsers.filter((x) => x.role === 'owner' && x.status === 'active');
        const isLastActiveOwner = u.role === 'owner' && u.status === 'active' && activeOwners.length === 1;
        if (body.role && !['owner', 'staff'].includes(body.role)) return err(422, 'validation_error', 'Bad role.');
        if (body.status && !['active', 'disabled'].includes(body.status)) return err(422, 'validation_error', 'Bad status.');
        if ('name' in body && (!body.name || !body.name.trim())) return err(422, 'validation_error', 'Name cannot be empty.');
        if (isLastActiveOwner && body.role === 'staff') return err(409, 'last_owner', 'There has to be at least one active owner.');
        if (isLastActiveOwner && body.status === 'disabled') return err(409, 'last_owner', 'There has to be at least one active owner.');
        if (body.name != null) u.name = body.name.trim();
        if (body.role) u.role = body.role;
        if (body.status) u.status = body.status;
        return json(200, u);
      }
      return err(404, 'not_found', `Mock has no handler for ${method} ${path}`);
    }

    if (path === '/admin/dashboard') return json(200, { orders: { newToday: 6, awaitingDispatch: 4, payOnDeliveryUnpaid: 3 }, attention: { lowStockVariants: 5, outOfStockPublished: 2, reviewsPending: 3, contactUnhandled: 2 }, revenueToday: KES(41200) });
    if (path === '/admin/products' && method === 'GET') return json(200, { items: PRODUCTS.map((p) => ({ id: p.id, name: p.name, slug: p.slug, category: p.category, status: state.adminProductStatus[p.id] || 'published', price: p.price, totalStock: 7, variantCount: p.variants.length, primaryThumbUrl: '/assets/img/placeholder.svg', updatedAt: '2026-09-05T10:00:00Z' })), page: 1, pageSize: 20, total: PRODUCTS.length, totalPages: 1 });
    if (path === '/admin/products/bulk-status' && method === 'POST') {
      if (!state.session) return err(401, 'unauthorized', 'Sign in.');
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
      if (!ids.length || ids.length > 200) return err(422, 'validation_error', 'ids must be 1–200 product ids.');
      if (!['published', 'archived', 'draft'].includes(body.status)) return err(422, 'validation_error', 'Bad status.');
      const results = ids.map((id) => {
        const cur = state.adminProductStatus[id];
        if (cur === undefined) return { id, result: 'failed', message: 'No product with that id' };
        if (cur === body.status) return { id, result: 'skipped', message: `Already ${body.status}` };
        state.adminProductStatus[id] = body.status;
        return { id, result: 'updated', message: null };
      });
      return json(200, { updated: results.filter((r) => r.result === 'updated').length, results });
    }
    if (path.match(/^\/admin\/products\/[^/]+\/preview$/) && method === 'GET') {
      const id = path.split('/')[3];
      const p = PRODUCTS.find((x) => x.id === id) || (id === 'prod_new' ? { ...PRODUCTS[0], id: 'prod_new', slug: 'test-sample-product', name: 'Test Sample Product' } : null);
      return p ? json(200, { ...p, related: [], previewStatus: 'draft' }) : err(404, 'not_found', 'No such product.');
    }
    if (path.match(/^\/admin\/products\/[^/]+$/) && method === 'GET') {
      const p = PRODUCTS.find((x) => x.id === path.split('/')[3]);
      if (!p) return err(404, 'not_found', 'No such product.');
      const primary = (p.images || []).find((im) => im.isPrimary);
      return json(200, { ...p, status: 'published', basePrice: p.price, primaryImageId: primary ? primary.id : null });
    }
    if (path === '/admin/products' && method === 'POST') return json(201, { id: 'prod_new', slug: body.slug, status: body.status, ...body });
    if (path.match(/^\/admin\/products\/[^/]+$/) && method === 'PATCH') return json(200, { id: path.split('/')[3], ...body });
    if (path.match(/^\/admin\/products\/[^/]+$/) && method === 'DELETE') return json(200, { id: path.split('/')[3], status: 'archived' });
    if (path === '/admin/images' && method === 'POST') {
      // A17 photo phase: each matched photo uploads individually (sequenced / light
      // concurrency, see productImport.js runPhotoPhase()). Ids increment so tests can
      // assert PATCH imageIds ordering deterministically. opts.imageUploadFailNames lets a
      // test force a specific selected file to fail (500) without touching the others.
      const rawBuf = typeof req.postDataBuffer === 'function' ? req.postDataBuffer() : null;
      const raw = rawBuf ? rawBuf.toString('latin1') : (req.postData() || '');
      const filenameMatch = raw.match(/name="file";\s*filename="([^"]*)"/i);
      const uploadedName = filenameMatch ? filenameMatch[1] : '';
      const failNames = (opts.imageUploadFailNames || []).map((n) => n.toLowerCase());
      if (failNames.includes(uploadedName.toLowerCase())) {
        return err(500, 'internal_error', `Could not process ${uploadedName || 'that photo'}.`);
      }
      state.imageUploadCount = (state.imageUploadCount || 0) + 1;
      const id = `img_up_${state.imageUploadCount}`;
      return json(201, { ...IMG(id, body.alt || ''), thumbBytes: 41213, fullBytes: 214880 });
    }

    // ---- A17 product bulk import / export ----
    if (path === '/admin/products/export' && method === 'GET') {
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="house-of-esther-products-2026-09-09.csv"',
          'Cache-Control': 'no-store',
        },
        body: [
          'name,price,description,quantity,category,status',
          'Harlan Leather Crossbody,6800,"A compact everyday crossbody.",7,accessories,published',
          'Orin Linen Dress,5400,"A breathable linen dress.",9,women,published',
          'Sample Multi Bag,6800,"Roomy two-tone tote.",,accessories,published',
          '',
        ].join('\n'),
      });
    }
    if (path === '/admin/products/import/template' && method === 'GET') {
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="house-of-esther-import-template.csv"',
          'Cache-Control': 'no-store',
        },
        body: [
          '# Fill one row per product. A matching name updates it; a new name creates a DRAFT. Delete these example rows before importing.',
          'name,price,description,quantity,category',
          'Orin Linen Dress,5400,A compact everyday linen dress.,8,women',
          'Harlan Leather Belt,2200,,15,accessories',
          '',
        ].join('\n'),
      });
    }
    if (path === '/admin/products/import' && method === 'POST') {
      if (!state.session) return err(401, 'unauthorized', 'Sign in.');
      const rawBuf = typeof req.postDataBuffer === 'function' ? req.postDataBuffer() : null;
      const raw = rawBuf ? rawBuf.toString('latin1') : (req.postData() || '');
      if (/filename="[^"]*(broken|badfile)[^"]*"/i.test(raw)) {
        return err(422, 'validation_error', 'The file is missing a required column: quantity.');
      }
      // A17: the frontend sends one `filename` text part per selected photo (name only).
      const selectedNames = [...raw.matchAll(/name="filename"\r?\n\r?\n([^\r\n]+)/g)].map((m) => m[1].trim());
      const has = (n) => selectedNames.some((s) => s.toLowerCase() === n.toLowerCase());
      // Which photo file names each row's `photos` column references (fixed test fixture).
      const wants = {
        'Orin Linen Dress': ['orin-front.jpg', 'orin-back.jpg'],
        'Marren Wool Coat': ['marren-front.jpg', 'marren-back.jpg'],
        'Suede Weekender': [],
        'Harlan Leather Belt': ['harlan-front.jpg'],
      };
      const photosFor = (name) => {
        const list = wants[name] || [];
        const matched = list.filter(has);
        const missing = list.filter((n) => !has(n));
        return { count: list.length, matched, missing };
      };
      const matchedSet = new Set();
      const missingSet = new Set();
      Object.keys(wants).forEach((name) => {
        const pf = photosFor(name);
        pf.matched.forEach((n) => matchedSet.add(n.toLowerCase()));
        pf.missing.forEach((n) => missingSet.add(n.toLowerCase()));
      });
      const rowNote = (name) => {
        const pf = photosFor(name);
        return pf.missing.map((n) => `Photo ${n} was not selected — add it on the product page`);
      };

      state.importToken = `imp_${Date.now().toString(16)}`;
      state.importUsed = false;
      return json(200, {
        token: state.importToken,
        summary: {
          toCreate: 2, toUpdate: 3, toSkip: 1, errors: 1, totalRows: 7,
          photos: { selected: selectedNames.length, matched: matchedSet.size, missing: missingSet.size },
        },
        rows: [
          {
            row: 2, name: 'Orin Linen Dress', slug: 'orin-linen-dress', action: 'update',
            changes: {
              price: { from: 5400, to: 5900 },
              quantity: { from: 9, to: 12 },
              description: { changed: true },
              category: { from: 'women', to: 'women' },
            },
            photos: photosFor('Orin Linen Dress'),
            notes: rowNote('Orin Linen Dress'), message: null,
          },
          {
            row: 3, name: 'Marren Wool Coat', slug: 'marren-wool-coat', action: 'create',
            changes: {
              price: { from: null, to: 12800 },
              quantity: { from: null, to: 4 },
              description: { changed: true },
              category: { from: null, to: 'women' },
            },
            photos: photosFor('Marren Wool Coat'),
            notes: ['Created as a draft — add photos and publish from the Products page', ...rowNote('Marren Wool Coat')], message: null,
          },
          {
            row: 4, name: 'Suede Weekender', slug: 'suede-weekender', action: 'create',
            changes: {
              price: { from: null, to: 9500 },
              quantity: { from: null, to: 6 },
              category: { from: null, to: 'accessories' },
            },
            photos: photosFor('Suede Weekender'),
            notes: ['No photos — will be created as a draft with no image'], message: null,
          },
          {
            row: 5, name: 'Sample Multi Bag', slug: 'sample-multi-bag', action: 'update',
            changes: { price: { from: 6800, to: 7200 }, description: { changed: false } },
            photos: { count: 0, matched: [], missing: [] },
            notes: ['Displayed price and description updated — set stock and per-option prices on the product page'], message: null,
          },
          {
            row: 6, name: 'Harlan Leather Belt', slug: 'harlan-leather-belt', action: 'update',
            changes: { price: { from: 2200, to: 2400 } },
            photos: photosFor('Harlan Leather Belt'),
            notes: rowNote('Harlan Leather Belt'), message: null,
          },
          {
            row: 7, name: 'Vintage Scarf', slug: 'vintage-scarf', action: 'skip',
            changes: {},
            photos: { count: 0, matched: [], missing: [] },
            notes: ['This product is archived — restore it first, then re-import'], message: null,
          },
          {
            row: 8, name: 'Broken Row', slug: 'broken-row', action: 'error',
            changes: {},
            photos: { count: 0, matched: [], missing: [] },
            notes: [], message: 'Price must be a whole number of shillings',
          },
        ],
      });
    }
    if (path === '/admin/products/import/commit' && method === 'POST') {
      if (!state.session) return err(401, 'unauthorized', 'Sign in.');
      const idemKey = req.headers()['idempotency-key'];
      if (!idemKey) return err(422, 'validation_error', 'Missing Idempotency-Key header.');
      const ctype = req.headers()['content-type'] || '';
      // A17 fix: the commit is ALWAYS application/json now — no photos ride along (see
      // api.js commitImport / productImport.js runPhotoPhase). Multipart here would mean
      // the frontend regressed back to the old body-size-ceiling-blowing behaviour.
      if (ctype.includes('multipart/form-data')) {
        return err(422, 'validation_error', 'Mock only accepts a JSON commit — this frontend must never send photos on /commit any more.');
      }
      const token = body && body.token;
      if (typeof token !== 'string') return err(422, 'validation_error', 'No token in JSON body.');
      if (opts.importCommitTooLarge) {
        return err(413, 'import_batch_too_large', 'Import fewer photos at a time — split the CSV into smaller batches');
      }
      if (opts.importCommitExpired) return err(410, 'import_token_expired', 'This preview has expired — upload the file again.');
      if (opts.importCommitUsed) return err(409, 'import_token_used', 'These changes were already applied.');
      if (token !== state.importToken) return err(404, 'not_found', 'Unknown import token.');
      if (state.importUsed && state.importIdemKey !== idemKey) {
        return err(409, 'import_token_used', 'These changes were already applied.');
      }
      state.importUsed = true;
      state.importIdemKey = idemKey;
      // photosAttached/photosFailed are always 0 here — no images were ever sent to this
      // endpoint. The frontend computes its own photo tallies client-side, from the
      // separate POST /admin/images + PATCH /admin/products/{id} calls that follow.
      return json(200, {
        created: 2,
        updated: 2,
        skipped: 1,
        failed: 1,
        rows: [
          { row: 2, name: 'Orin Linen Dress', result: 'updated', productId: 'prod_2001', message: null, photosAttached: 0, photosFailed: 0, photoMessages: [] },
          { row: 3, name: 'Marren Wool Coat', result: 'created', productId: 'prod_marren', message: 'Created as a draft — add photos and publish', photosAttached: 0, photosFailed: 0, photoMessages: [] },
          { row: 4, name: 'Suede Weekender', result: 'created', productId: 'prod_suede', message: 'Created as a draft — add photos and publish', photosAttached: 0, photosFailed: 0, photoMessages: [] },
          { row: 5, name: 'Sample Multi Bag', result: 'updated', productId: 'prod_multibag', message: null, photosAttached: 0, photosFailed: 0, photoMessages: [] },
          { row: 6, name: 'Harlan Leather Belt', result: 'failed', productId: null, message: 'Someone edited this product while you were reviewing — re-export and try again', photosAttached: 0, photosFailed: 0, photoMessages: [] },
          { row: 7, name: 'Vintage Scarf', result: 'skipped', productId: null, message: 'Archived — restore it first, then re-import', photosAttached: 0, photosFailed: 0, photoMessages: [] },
        ],
      });
    }
    if (path.match(/^\/admin\/images\/[^/]+$/) && method === 'DELETE') return route.fulfill({ status: 204, body: '' });
    if (path.match(/^\/admin\/products\/[^/]+\/variants\/[^/]+$/) && method === 'PATCH') return json(200, { id: path.split('/')[5], ...body });
    if (path === '/admin/inventory' && method === 'GET') return json(200, { items: PRODUCTS.flatMap((p) => p.variants.map((v) => ({ productId: p.id, productName: p.name, variantId: v.id, sku: v.sku, options: v.options, stock: v.quantityAvailable || 0, lowStockThreshold: 2, stockState: v.stockState }))), page: 1, pageSize: 25, total: 8, totalPages: 1 });
    if (path === '/admin/inventory/adjustments' && method === 'POST') return json(201, { id: 'adj_309', variantId: body.variantId, delta: body.delta, reason: body.reason, resultingStock: 19, createdAt: new Date().toISOString(), createdBy: 'usr_admin1' });
    if (path === '/admin/inventory/adjustments' && method === 'GET') return json(200, { items: [{ id: 'adj_1', variantId: url.searchParams.get('variantId'), delta: 12, reason: 'restock', resultingStock: 19, createdAt: '2026-09-06T09:00:00Z', createdBy: 'usr_admin1' }], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    if (path === '/admin/categories' && method === 'GET') return json(200, { items: [{ slug: 'women', label: 'Women', description: '', productCount: 12, sortOrder: 1, subcategories: [{ slug: 'dresses', label: 'Dresses' }] }] });
    if (path === '/admin/categories' && method === 'POST') return json(201, body);
    if (path.match(/^\/admin\/categories\/[^/]+$/)) return method === 'DELETE' ? route.fulfill({ status: 204, body: '' }) : json(200, body);
    if (path === '/admin/collections' && method === 'GET') return json(200, { items: [{ slug: 'workwear', title: 'Workwear', description: '', rule: { type: 'manual', productIds: ['prod_1042'] } }] });
    if (path === '/admin/collections' && method === 'POST') return json(201, body);
    if (path.match(/^\/admin\/collections\/[^/]+$/)) return method === 'DELETE' ? route.fulfill({ status: 204, body: '' }) : json(200, body);
    if (path === '/admin/orders' && method === 'GET') {
      const list = Object.values(state.orders);
      const rows = list.length ? list : [{ orderNumber: 'HE-2026-04903', placedAt: '2026-09-06T09:00:00Z', customerName: 'Wanjiru M.', county: 'Nakuru', total: KES(3600), paymentMethod: 'pay_on_delivery', paymentState: 'awaiting_delivery', status: 'confirmed' }];
      return json(200, { items: rows.map((o) => ({ orderNumber: o.orderNumber, placedAt: o.placedAt, customerName: o.customerName || (o.customer && o.customer.firstName) || 'Customer', county: o.county || (o.deliveryAddress && o.deliveryAddress.county) || 'Nairobi', total: o.total, paymentMethod: o.paymentMethod || (o.payment && o.payment.method) || 'mpesa', paymentState: o.paymentState || (o.payment && o.payment.state) || 'pending', status: o.status })), page: 1, pageSize: 25, total: rows.length, totalPages: 1 });
    }
    if (path.match(/^\/admin\/orders\/[^/]+$/) && method === 'GET') {
      const num = path.split('/')[3];
      const o = state.orders[num] || sampleAdminOrder(num);
      return json(200, { ...o, agreementAcceptance: { id: 'acc_77c1', acceptedAt: '2026-09-06T09:12:00Z', customerEmail: 'amina@gmail.com', customerUserId: null, termsOfSaleVersion: 4, returnsPolicyVersion: 2, termsOfSaleHref: '/api/legal/terms-of-sale/versions/4', returnsPolicyHref: '/api/legal/returns/versions/2', ipAddress: '197.232.1.1', userAgent: 'Mozilla/5.0' }, activityLog: [{ at: '2026-09-06T09:00:00Z', actor: 'system', event: 'order_placed', from: null, to: 'placed' }], internalNotes: [] });
    }
    if (path.match(/^\/admin\/orders\/[^/]+\/status$/) && method === 'PATCH') {
      const num = path.split('/')[3];
      const o = state.orders[num] || sampleAdminOrder(num);
      o.status = body.status;
      o.courier = body.courier || o.courier;
      o.trackingReference = body.trackingReference || o.trackingReference;
      state.orders[num] = o;
      return json(200, o);
    }
    if (path.match(/^\/admin\/orders\/[^/]+\/payment$/) && method === 'PATCH') { const num = path.split('/')[3]; const o = state.orders[num] || sampleAdminOrder(num); o.payment = { ...o.payment, state: body.state }; state.orders[num] = o; return json(200, o); }
    if (path.match(/^\/admin\/orders\/[^/]+\/refund$/) && method === 'POST') return json(201, { id: 'ref_1', amount: body.amount, reason: body.reason, createdAt: new Date().toISOString() });
    if (path.match(/^\/admin\/orders\/[^/]+\/notes$/) && method === 'POST') return json(201, { id: 'n1', at: new Date().toISOString(), author: 'usr_admin1', body: body.body });
    if (path.match(/^\/admin\/orders\/[^/]+\/resend-notification$/)) return route.fulfill({ status: 202, body: '' });
    if (path === '/admin/reviews' && method === 'GET') return json(200, { items: [{ id: 'rev_1', productName: 'Orin Linen Dress', authorFirstName: 'Amina', authorEmail: 'a@example.com', rating: 5, title: 'Lovely', body: 'Fits great and washes well.', verifiedPurchase: true, status: url.searchParams.get('status') || 'pending', createdAt: '2026-09-01T09:00:00Z' }], page: 1, pageSize: 15, total: 1, totalPages: 1 });
    if (path.match(/^\/admin\/reviews\/[^/]+$/) && method === 'PATCH') return json(200, { id: path.split('/')[3], ...body });
    if (path === '/admin/contacts' && method === 'GET') {
      let items = state.contacts;
      if (url.searchParams.has('handled')) items = items.filter((c) => String(c.handled) === url.searchParams.get('handled'));
      if (url.searchParams.get('topic')) items = items.filter((c) => c.topic === url.searchParams.get('topic'));
      return json(200, {
        items: items.map((c) => ({ reference: c.reference, name: c.name, email: c.email, phone: c.phone, topic: c.topic, orderNumber: c.orderNumber, messageExcerpt: c.message.slice(0, 120), handled: c.handled, handledAt: c.handledAt, createdAt: c.createdAt })),
        page: 1, pageSize: 25, total: items.length, totalPages: 1,
      });
    }
    if (path.match(/^\/admin\/contacts\/[^/]+$/) && method === 'GET') {
      const c = state.contacts.find((x) => x.reference === decodeURIComponent(path.split('/')[3]));
      return c ? json(200, c) : err(404, 'not_found', 'No message has that reference.');
    }
    if (path.match(/^\/admin\/contacts\/[^/]+$/) && method === 'PATCH') {
      const c = state.contacts.find((x) => x.reference === decodeURIComponent(path.split('/')[3]));
      if (!c) return err(404, 'not_found', 'No message has that reference.');
      if (typeof body.handled !== 'boolean') return err(422, 'validation_error', 'Body must be { handled: boolean }.');
      c.handled = body.handled;
      c.handledAt = body.handled ? new Date().toISOString() : null;
      c.handledBy = body.handled ? 'usr_admin1' : null;
      return json(200, c);
    }
    if (path === '/admin/subscribers' && method === 'GET') return json(200, { items: [{ id: 'sub_88', email: 'amina@gmail.com', status: 'confirmed', source: 'footer', newArrivals: true, backInStock: true, createdAt: '2026-08-01T00:00:00Z', confirmedAt: '2026-08-01T00:10:00Z' }], page: 1, pageSize: 25, total: 1, totalPages: 1 });
    if (path === '/admin/broadcasts' && method === 'GET') return json(200, { items: [{ id: 'bcast_12', subject: 'New in: the September leather edit', status: 'sent', sentCount: 812, openCount: 240, createdAt: '2026-09-02T08:00:00Z' }] });
    if (path === '/admin/broadcasts' && method === 'POST') return json(201, { id: 'bcast_13', status: 'queued', recipientCount: 812, createdAt: new Date().toISOString() });
    if (path.match(/^\/admin\/broadcasts\/[^/]+\/test$/)) return route.fulfill({ status: 202, body: '' });
    if (path === '/admin/content/home' && method === 'GET') return json(200, { announcement: { enabled: true, text: 'Delivered countrywide.', href: '/delivery-returns.html' }, hero: { headline: 'Style worth the wait', subcopy: 'Curated pieces.', ctaLabel: 'Shop new in', ctaHref: '/new-in.html', imageId: 'img_hero1' }, categoryTiles: [{ label: 'Women', href: '/women.html', imageId: 'img_cat_women' }], editorialBlocks: [{ id: 'eb_1', caption: 'The September edit', imageId: 'img_ed1', href: '/journal-article.html?slug=september-edit' }], featuredCollectionSlug: 'workwear', socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/houseofesther' }] });
    if (path === '/admin/content/home' && method === 'PUT') return json(200, body);
    if (path === '/admin/legal' && method === 'GET') return json(200, { items: Object.values(LEGAL).map((d) => ({ docType: d.docType, currentVersion: d.version, effectiveDate: d.effectiveDate, updatedAt: d.effectiveDate })) });
    if (path.match(/^\/admin\/legal\/[^/]+$/) && method === 'GET') { const d = LEGAL[path.split('/')[3]]; return json(200, { ...d, versions: d.previousVersions }); }
    if (path.match(/^\/admin\/legal\/[^/]+\/versions$/) && method === 'POST') { const slug = path.split('/')[3]; LEGAL[slug].version += 1; return json(201, { docType: slug, version: LEGAL[slug].version, effectiveDate: body.effectiveDate || '2026-10-01' }); }
    if (path === '/admin/discounts' && method === 'GET') return json(200, { items: [{ code: 'WELCOME10', type: 'percent', value: 10, minSpend: KES(3000), usageLimitTotal: 500, usageCount: 42, startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-12-31T23:59:59Z', active: true }] });
    if (path === '/admin/discounts' && method === 'POST') return json(201, body);
    if (path.match(/^\/admin\/discounts\/[^/]+$/)) return method === 'DELETE' ? route.fulfill({ status: 204, body: '' }) : json(200, body);

    return err(404, 'not_found', `Mock has no handler for ${method} ${path}`);
  });

  return state;
}

function sampleAdminOrder(num) {
  return {
    orderNumber: num,
    status: 'confirmed',
    statusTimeline: [
      { status: 'placed', at: '2026-09-06T09:00:00Z' },
      { status: 'confirmed', at: '2026-09-06T09:30:00Z' },
      { status: 'packed', at: null }, { status: 'dispatched', at: null },
      { status: 'out_for_delivery', at: null }, { status: 'delivered', at: null },
    ],
    placedAt: '2026-09-06T09:00:00Z',
    customer: { firstName: 'Wanjiru', email: 'wanjiru@example.com', phone: '+254712345123' },
    deliveryAddress: { recipientName: 'Wanjiru M.', phone: '+254712345123', county: 'Nakuru', town: 'Milimani', instructions: 'Gate 3' },
    deliveryMethod: { code: 'town_courier', label: 'Courier to town', eta: '2-4 business days' },
    items: [{ productId: 'prod_1042', variantId: 'var_tan', name: 'Harlan Leather Crossbody', options: { Colour: 'Tan', Size: 'One size' }, image: IMG('img_harlan1', 'bag'), unitPrice: KES(6800), quantity: 1, lineTotal: KES(6800) }],
    subtotal: KES(6800), discountTotal: KES(0), deliveryFee: KES(450), total: KES(7250),
    payment: { method: 'pay_on_delivery', state: 'awaiting_delivery' },
    cancellable: true,
  };
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return {}; }
}
function cap(s) {
  return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}
