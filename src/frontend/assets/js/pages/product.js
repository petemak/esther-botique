import { api, ApiError } from '../api.js';
import { el, clear, imageEl, $ } from '../dom.js';
import { productCard, priceEl, breadcrumb, stars, emptyState, errorState, fieldError, applyValidationErrors } from '../components.js';
import { formatDate, getParam, setPageMeta, injectJsonLd } from '../util.js';
import { openModal, openLightbox } from '../modal.js';
import { sizeGuideSections } from '../sizeguide.js';
import { bootStorefront, view, showSpinner } from './_boot.js';
import { addToCart } from '../cart.js';
import { openCartDrawer } from '../cart.js';
import { currentUser } from '../auth.js';
import { toast } from '../toast.js';

bootStorefront({ active: '' });

const slug = getParam('slug');
let product;
const selection = {};
let selectedVariant = null;
let qty = 1;

if (!slug) {
  render404();
} else {
  load();
}

async function load() {
  showSpinner();
  try {
    product = await api.getProduct(slug);
    // Fresh stock re-check when the buy box mounts (D4 availability).
    try {
      const avail = await api.getProductAvailability(slug);
      const map = new Map((avail.variants || []).map((v) => [v.id, v]));
      product.variants = (product.variants || []).map((v) => ({ ...v, ...(map.get(v.id) || {}) }));
    } catch { /* availability is best-effort */ }
    renderProduct();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) render404();
    else {
      clear(view());
      view().append(errorState(err, load));
    }
  }
}

function render404() {
  clear(view());
  setPageMeta({ title: 'Piece not found — House of Esther', noindex: true });
  view().append(
    emptyState({
      title: 'We could not find that piece',
      message: 'It may have sold out or been retired. Have a look at what is new.',
      actions: [
        el('a', { class: 'btn', href: '/new-in.html', text: 'Shop New In' }),
        el('a', { class: 'btn btn--secondary', href: '/', text: 'Back home' }),
      ],
    })
  );
}

function renderProduct() {
  const root = view();
  clear(root);

  setPageMeta({
    title: (product.seo && product.seo.title) || `${product.name} — House of Esther`,
    description: (product.seo && product.seo.description) || product.shortDescription,
    canonicalPath: `/product.html?slug=${encodeURIComponent(product.slug)}`,
  });

  if (product.breadcrumbs && product.breadcrumbs.length) root.append(breadcrumb(product.breadcrumbs));

  const layout = el('div', { class: 'pdp' }, [gallery(), buyBox()]);
  root.append(layout);

  root.append(
    el('section', { class: 'section', 'aria-labelledby': 'story-h' }, [
      el('p', { class: 'eyebrow', text: 'The story' }),
      el('h2', { id: 'story-h', text: 'Why we chose this piece' }),
      el('div', { class: 'prose', html: sanitize(product.story || '') }),
      product.care ? el('div', { class: 'prose', style: 'margin-top:1rem' }, [el('h3', { text: 'Care' }), el('p', { text: product.care })]) : null,
    ]),
    specAccordion(),
    reviewsSection(),
    relatedSection()
  );

  injectJsonLd(productJsonLd());
}

/* ---------------- Gallery ---------------- */
function gallery() {
  const images = product.images && product.images.length ? product.images : [null];
  const main = el('div', { class: 'gallery__main' }, [imageEl(images[0], { full: true, eager: true, altFallback: product.name })]);
  main.querySelector('img').addEventListener('click', () => {
    if (product.images && product.images.length) openLightbox(product.images, currentThumb);
  });

  let currentThumb = 0;
  const thumbs = el('div', { class: 'gallery__thumbs', role: 'tablist', 'aria-label': 'Product images' });
  images.forEach((img, i) => {
    if (!img) return;
    const b = el('button', {
      type: 'button',
      'aria-label': `Show image ${i + 1}: ${img.alt || product.name}`,
      'aria-current': i === 0 ? 'true' : 'false',
      on: {
        click: () => {
          currentThumb = i;
          clear(main).append(imageEl(img, { full: true, eager: true, altFallback: product.name }));
          main.querySelector('img').addEventListener('click', () => openLightbox(product.images, i));
          thumbs.querySelectorAll('button').forEach((btn) => btn.setAttribute('aria-current', 'false'));
          b.setAttribute('aria-current', 'true');
        },
      },
    }, [imageEl(img, { altFallback: '' })]);
    thumbs.appendChild(b);
  });

  return el('div', {}, [main, images.length > 1 ? thumbs : null]);
}

/* ---------------- Buy box ---------------- */
function buyBox() {
  const box = el('div', { class: 'buy-box stack' });

  box.append(
    el('h1', { text: product.name }),
    priceEl(displayPrice(), displayCompareAt(), product.onSale),
    product.vatInclusive ? el('p', { class: 'hint', text: 'Price includes VAT.' }) : null,
    product.shortDescription ? el('p', { text: product.shortDescription }) : null,
    product.rating && product.rating.count
      ? el('p', { html: `${stars(product.rating.average)} <a href="#reviews">${product.rating.count} review${product.rating.count === 1 ? '' : 's'}</a>` })
      : null
  );

  const axes = product.optionAxes || [];
  axes.forEach((axis) => box.append(axisSelector(axis)));

  const stockCue = el('p', { id: 'stock-cue', class: 'stock-cue', 'aria-live': 'polite' });
  const qtyRow = quantityRow();
  const addBtn = el('button', { class: 'btn btn--block', id: 'add-to-cart', type: 'button', text: axes.length ? 'Select options' : 'Add to cart', disabled: axes.length > 0 });
  const wishBtn = el('button', {
    class: 'btn btn--secondary btn--block',
    id: 'add-wishlist',
    type: 'button',
    text: 'Save to wishlist',
    'aria-pressed': 'false',
    on: { click: toggleWishlist },
  });
  const backInStock = el('div', { id: 'back-in-stock', hidden: true });

  addBtn.addEventListener('click', onAddToCart);

  box.append(stockCue, el('div', { id: 'qty-wrap' }, [qtyRow]), addBtn, wishBtn, backInStock, deliveryNote(), sizeGuideLink());

  // Pre-select when only one variant / single-value axes
  if (axes.length) {
    axes.forEach((axis) => {
      if (axis.values.length === 1) selection[axis.name] = axis.values[0];
    });
    resolveVariant();
  } else if (product.variants && product.variants.length === 1) {
    selectedVariant = product.variants[0];
  }
  updateBuyState();

  return box;
}

function axisSelector(axis) {
  const isColour = /colou?r/i.test(axis.name);
  const group = el('div', { class: 'variant-group' }, [
    el('div', { class: 'variant-group__label', id: `axis-${axis.name}` }, [
      document.createTextNode(axis.name + ': '),
      el('span', { id: `axis-val-${axis.name}`, class: 'text-muted', text: selection[axis.name] || '—' }),
    ]),
  ]);
  const list = el('div', { class: 'option-btns', role: 'group', 'aria-labelledby': `axis-${axis.name}` });
  axis.values.forEach((value) => {
    const hex = colourHex(value);
    const btn = el('button', {
      type: 'button',
      class: isColour ? 'option-btn option-swatch' : 'option-btn',
      'aria-pressed': selection[axis.name] === value ? 'true' : 'false',
      'aria-label': isColour ? value : null,
      title: isColour ? value : null,
      text: isColour ? null : value,
      style: isColour && hex ? `background:${hex}` : null,
      on: {
        click: () => {
          selection[axis.name] = value;
          $(`#axis-val-${CSS.escape(axis.name)}`).textContent = value;
          list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', 'true');
          resolveVariant();
          updateBuyState();
        },
      },
    });
    list.appendChild(btn);
  });
  group.appendChild(list);
  return group;
}

function colourHex(name) {
  // ProductCard colours carry hex; ProductDetail axes do not — best effort from any variant hint or a small map.
  const map = { black: '#1A1A1A', tan: '#B98A5E', navy: '#1B2A4A', sand: '#D9C9A8', white: '#F2F0EA', brown: '#5A3E2B', olive: '#6B6B47', grey: '#8A8A8A', cream: '#EFE7D6', rust: '#A4482F' };
  return map[String(name).toLowerCase()] || null;
}

function resolveVariant() {
  const axes = product.optionAxes || [];
  const complete = axes.every((a) => selection[a.name]);
  if (!complete) {
    selectedVariant = null;
    markUnavailableOptions();
    return;
  }
  selectedVariant =
    (product.variants || []).find((v) =>
      axes.every((a) => (v.options || {})[a.name] === selection[a.name])
    ) || null;
  markUnavailableOptions();
}

/**
 * Disable option values only when NO variant exists for that combination at all.
 * Out-of-stock-but-real combinations stay selectable so the buyer can reach the
 * "notify me when it's back" form (design-spec §6 PDP buy box).
 */
function markUnavailableOptions() {
  const axes = product.optionAxes || [];
  axes.forEach((axis) => {
    const label = document.getElementById(`axis-${axis.name}`);
    if (!label) return;
    const buttons = label.parentElement.querySelectorAll('.option-btns button');
    buttons.forEach((btn, idx) => {
      const value = axis.values[idx];
      const partial = { ...selection, [axis.name]: value };
      const exists = (product.variants || []).some((v) =>
        Object.entries(partial).every(([k, val]) => (v.options || {})[k] === val)
      );
      const outOfStock = (product.variants || []).every((v) => {
        const matches = Object.entries(partial).every(([k, val]) => (v.options || {})[k] === val);
        return !matches || v.inStock === false || v.stockState === 'out_of_stock';
      });
      btn.disabled = !exists;
      btn.classList.toggle('is-oos', exists && outOfStock);
      if (!exists) btn.setAttribute('aria-pressed', 'false');
    });
  });
}

function quantityRow() {
  const input = el('input', { type: 'number', id: 'qty-input', min: 1, value: 1, 'aria-label': 'Quantity', inputmode: 'numeric' });
  const dec = el('button', { type: 'button', 'aria-label': 'Decrease quantity', text: '−', on: { click: () => setQty(qty - 1) } });
  const inc = el('button', { type: 'button', 'aria-label': 'Increase quantity', text: '+', on: { click: () => setQty(qty + 1) } });
  input.addEventListener('change', () => setQty(parseInt(input.value, 10) || 1));
  function setQty(n) {
    const max = maxQty();
    qty = Math.max(1, Math.min(n, max));
    input.value = String(qty);
    input.max = String(max);
  }
  return el('label', { class: 'stack', style: 'display:block' }, [
    el('span', { class: 'variant-group__label', text: 'Quantity' }),
    el('span', { class: 'qty' }, [dec, input, inc]),
  ]);
}

function maxQty() {
  if (selectedVariant && selectedVariant.quantityAvailable != null) return Math.max(1, selectedVariant.quantityAvailable);
  return 10;
}

function updateBuyState() {
  const axes = product.optionAxes || [];
  const cue = $('#stock-cue');
  const addBtn = $('#add-to-cart');
  const backInStock = $('#back-in-stock');
  const qtyWrap = $('#qty-wrap');
  if (!cue) return;

  const complete = !axes.length || axes.every((a) => selection[a.name]);
  if (!complete) {
    cue.textContent = '';
    cue.className = 'stock-cue';
    addBtn.textContent = 'Select options';
    addBtn.disabled = true;
    backInStock.hidden = true;
    return;
  }

  const v = selectedVariant;
  const state = v ? v.stockState || (v.inStock ? 'in_stock' : 'out_of_stock') : 'out_of_stock';

  if (state === 'out_of_stock' || !v) {
    cue.textContent = 'Out of stock';
    cue.className = 'stock-cue stock-cue--out';
    addBtn.hidden = true;
    qtyWrap.hidden = true;
    backInStock.hidden = false;
    clear(backInStock).append(backInStockForm());
    return;
  }

  addBtn.hidden = false;
  qtyWrap.hidden = false;
  backInStock.hidden = true;
  if (state === 'low_stock') {
    const left = v.quantityAvailable;
    cue.textContent = left ? `Low stock — ${left} left` : 'Low stock';
    cue.className = 'stock-cue stock-cue--low';
  } else {
    cue.textContent = 'In stock';
    cue.className = 'stock-cue stock-cue--in';
  }
  addBtn.disabled = false;
  addBtn.textContent = 'Add to cart';
  const qi = $('#qty-input');
  if (qi) qi.max = String(maxQty());
}

async function onAddToCart() {
  if (!selectedVariant) return;
  const btn = $('#add-to-cart');
  btn.classList.add('is-loading');
  btn.disabled = true;
  try {
    await addToCart(selectedVariant.id, qty, { silent: true });
    toast('Added to your cart.', 'success');
    openCartDrawer();
  } catch { /* toast shown by cart module */ } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

function backInStockForm() {
  const email = el('input', { class: 'input', type: 'email', required: true, id: 'bis-email', name: 'email', placeholder: 'you@example.com', 'aria-label': 'Email for back-in-stock alert' });
  const status = el('p', { class: 'hint', role: 'status' });
  return el('form', {
    class: 'stack',
    novalidate: true,
    on: {
      submit: async (e) => {
        e.preventDefault();
        if (!email.checkValidity()) { fieldError(email, 'Enter a valid email address.'); return; }
        try {
          const res = await api.subscribe({
            email: email.value.trim(),
            source: 'product_back_in_stock',
            productId: product.id,
            variantId: selectedVariant ? selectedVariant.id : null,
          });
          status.textContent = res.message || 'We will email you the moment it is back.';
          email.disabled = true;
        } catch (err) { status.textContent = err.message || 'Could not set that up just now.'; }
      },
    },
  }, [
    el('p', { text: 'Email me when this is back:' }),
    el('div', { style: 'display:flex;gap:.5rem' }, [email, el('button', { class: 'btn', type: 'submit', text: 'Notify me' })]),
    status,
  ]);
}

function deliveryNote() {
  return el('div', { class: 'delivery-note stack' }, [
    el('p', { html: '<strong>Delivery:</strong> Nairobi next-day (KES 300). Courier to other counties, 2–6 business days.' }),
    el('p', { html: '<strong>Payment:</strong> M-Pesa, or pay on delivery where available.' }),
    el('p', { html: '14-day returns on unworn pieces. <a href="/delivery-returns.html">Delivery &amp; Returns</a>.' }),
  ]);
}

function sizeGuideLink() {
  if (!product.sizeGuideCategory && !(product.optionAxes || []).some((a) => /size/i.test(a.name))) return el('span');
  return el('button', {
    type: 'button',
    class: 'btn--ghost',
    style: 'background:none;border:0;text-decoration:underline;cursor:pointer;padding:0',
    text: 'Find your size',
    on: {
      click: () => openModal({ title: 'Size guide', body: el('div', { class: 'stack' }, sizeGuideSections(product.sizeGuideCategory)) }),
    },
  });
}

function displayPrice() {
  return (selectedVariant && selectedVariant.price) || product.price;
}
function displayCompareAt() {
  return (selectedVariant && selectedVariant.compareAtPrice) || product.compareAtPrice;
}

/* ---------------- Specs ---------------- */
function specAccordion() {
  const specs = product.specs || [];
  const items = [];
  if (specs.length) {
    items.push(
      el('details', { open: true }, [
        el('summary', { text: 'Details & specification' }),
        el('dl', { class: 'readonly-panel', style: 'background:transparent;border:0' },
          specs.flatMap((s) => [el('dt', { text: s.label }), el('dd', { text: s.value })])
        ),
      ])
    );
  }
  const sku = selectedVariant && selectedVariant.sku;
  if (sku) items.push(el('details', {}, [el('summary', { text: 'SKU' }), el('p', { text: sku })]));
  if (!items.length) return el('div');
  return el('section', { class: 'accordion section' }, items);
}

/* ---------------- Reviews ---------------- */
let reviewPage = 1;
let reviewSort = 'newest';

function reviewsSection() {
  const section = el('section', { class: 'section', id: 'reviews', 'aria-labelledby': 'reviews-h' }, [
    el('h2', { id: 'reviews-h', text: 'Reviews' }),
    el('div', { id: 'reviews-body' }, [el('div', { class: 'spinner' })]),
  ]);
  loadReviews(section.querySelector('#reviews-body'));
  return section;
}

async function loadReviews(container) {
  try {
    const data = await api.getReviews(product.id, { page: reviewPage, pageSize: 5, sort: reviewSort });
    clear(container);
    const s = data.summary || { average: 0, count: 0, distribution: {} };

    container.append(
      el('div', { class: 'grid', style: 'grid-template-columns:1fr;gap:1rem' }, [
        el('div', {}, [
          el('p', { style: 'font-size:var(--step-2)', html: `${stars(s.average)} <strong>${Number(s.average || 0).toFixed(1)}</strong>` }),
          el('p', { class: 'text-muted', text: `${s.count} review${s.count === 1 ? '' : 's'}` }),
          el('div', {}, [5, 4, 3, 2, 1].map((star) => {
            const n = (s.distribution && s.distribution[star]) || 0;
            const pct = s.count ? Math.round((n / s.count) * 100) : 0;
            return el('div', { class: 'dist-bar' }, [
              el('span', { text: `${star} ★` }),
              el('span', { class: 'dist-bar__track' }, [el('span', { class: 'dist-bar__fill', style: `width:${pct}%` })]),
              el('span', { text: String(n) }),
            ]);
          })),
        ]),
        el('div', {}, [
          el('button', { class: 'btn btn--secondary', type: 'button', text: 'Write a review', on: { click: openReviewForm } }),
        ]),
      ])
    );

    if (data.items && data.items.length) {
      const sortSel = el('select', { class: 'select', style: 'width:auto;margin:1rem 0', 'aria-label': 'Sort reviews', on: { change: (e) => { reviewSort = e.target.value; reviewPage = 1; loadReviews(container); } } }, [
        el('option', { value: 'newest', text: 'Newest', selected: reviewSort === 'newest' }),
        el('option', { value: 'highest', text: 'Highest rated', selected: reviewSort === 'highest' }),
        el('option', { value: 'lowest', text: 'Lowest rated', selected: reviewSort === 'lowest' }),
      ]);
      container.append(sortSel);
      data.items.forEach((r) => container.append(reviewCard(r)));
      if ((data.page || 1) < (data.totalPages || 1)) {
        container.append(el('button', {
          class: 'btn btn--secondary',
          style: 'margin-top:1rem',
          type: 'button',
          text: 'More reviews',
          on: {
            click: () => {
              reviewPage += 1;
              loadReviews(container);
            },
          },
        }));
      }
    } else {
      container.append(el('p', { class: 'text-muted', text: 'No reviews yet. If you have bought this, you can be the first.' }));
    }
  } catch {
    clear(container);
    container.append(el('p', { class: 'text-muted', text: 'Reviews could not load right now.' }));
  }
}

function reviewCard(r) {
  return el('article', { class: 'review' }, [
    el('div', { class: 'review__meta' }, [
      el('span', { html: stars(r.rating) }),
      el('strong', { text: r.authorFirstName || 'Verified buyer' }),
      el('span', { text: formatDate(r.createdAt) }),
      r.verifiedPurchase ? el('span', { class: 'badge-verified', text: 'Verified purchase' }) : null,
    ]),
    r.title ? el('h3', { style: 'font-size:var(--step-1);margin-top:.5rem', text: r.title }) : null,
    el('p', { text: r.body }),
  ]);
}

async function openReviewForm() {
  const user = await currentUser();
  if (!user) {
    toast('Sign in to write a review.', 'info');
    window.location.href = `/account/signin.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  const ratingInputs = el('div', { class: 'rating-input', role: 'radiogroup', 'aria-label': 'Your rating' });
  [5, 4, 3, 2, 1].forEach((n) => {
    const id = `rate-${n}`;
    ratingInputs.append(
      el('input', { type: 'radio', name: 'rating', id, value: n, required: n === 5 }),
      el('label', { for: id, text: '★', 'aria-label': `${n} star${n === 1 ? '' : 's'}` })
    );
  });
  const title = el('input', { class: 'input', name: 'title', id: 'rv-title', maxlength: 120 });
  const body = el('textarea', { class: 'textarea', name: 'body', id: 'rv-body', required: true, minlength: 10, maxlength: 2000 });
  const orderNumber = el('input', { class: 'input', name: 'orderNumber', id: 'rv-order', placeholder: 'HE-2026-XXXXX' });
  const status = el('p', { role: 'status', class: 'hint' });

  const form = el('form', { class: 'stack', novalidate: true }, [
    el('div', { class: 'field' }, [el('label', { text: 'Your rating', for: 'rate-5' }), ratingInputs]),
    el('div', { class: 'field' }, [el('label', { for: 'rv-title', text: 'Headline' }), title]),
    el('div', { class: 'field' }, [el('label', { for: 'rv-body', html: 'Your review <span class="req">*</span>' }), body, el('p', { class: 'hint', text: '10–2000 characters.' })]),
    el('div', { class: 'field' }, [el('label', { for: 'rv-order', text: 'Order number (optional)' }), orderNumber, el('p', { class: 'hint', text: 'Add it and we can mark your review a verified purchase.' })]),
    status,
    el('button', { class: 'btn', type: 'submit', text: 'Submit for review' }),
  ]);

  const modal = openModal({ title: `Review ${product.name}`, body: form });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    fieldError(body, null);
    const rating = form.querySelector('input[name="rating"]:checked');
    if (!rating) { status.textContent = 'Please choose a star rating.'; return; }
    if (body.value.trim().length < 10) { fieldError(body, 'Please write at least 10 characters.'); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.classList.add('is-loading');
    try {
      const res = await api.submitReview(product.id, {
        rating: Number(rating.value),
        title: title.value.trim() || undefined,
        body: body.value.trim(),
        orderNumber: orderNumber.value.trim() || undefined,
      });
      modal.setBody(el('div', { class: 'stack' }, [
        el('p', { text: res.message || 'Thanks — we read every review before it goes live.' }),
        el('button', { class: 'btn', text: 'Close', on: { click: modal.close } }),
      ]));
    } catch (err) {
      btn.classList.remove('is-loading');
      if (err instanceof ApiError && err.status === 422) {
        applyValidationErrors(form, err.details);
        status.textContent = err.message;
      } else if (err instanceof ApiError && err.status === 409) {
        status.textContent = 'You have already reviewed this piece.';
      } else {
        status.textContent = (err && err.message) || 'Could not submit your review.';
      }
    }
  });
}

/* ---------------- Related ---------------- */
function relatedSection() {
  const section = el('section', { class: 'section', 'aria-labelledby': 'related-h' }, [
    el('h2', { id: 'related-h', text: 'You may also like' }),
    el('div', { class: 'product-grid', id: 'related-grid' }, [el('div', { class: 'spinner' })]),
  ]);
  (async () => {
    try {
      const data = await api.getRelated(product.slug, 4);
      const grid = section.querySelector('#related-grid');
      clear(grid);
      (data.items || []).forEach((p) => grid.appendChild(productCard(p)));
      if (!data.items || !data.items.length) section.remove();
    } catch {
      section.remove();
    }
  })();
  return section;
}

/* ---------------- Wishlist ---------------- */
async function toggleWishlist() {
  const user = await currentUser();
  const btn = $('#add-wishlist');
  if (!user) {
    toast('Sign in to save this to your wishlist.', 'info');
    window.location.href = `/account/signin.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  const pressed = btn.getAttribute('aria-pressed') === 'true';
  try {
    if (pressed) {
      await api.removeWishlist(product.id);
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = 'Save to wishlist';
      toast('Removed from your wishlist.');
    } else {
      await api.addWishlist(product.id);
      btn.setAttribute('aria-pressed', 'true');
      btn.textContent = 'Saved ✓';
      toast('Saved to your wishlist.', 'success');
    }
  } catch (err) {
    toast(err.message || 'Could not update your wishlist.', 'error');
  }
}

/* ---------------- JSON-LD ---------------- */
function productJsonLd() {
  const offers = (product.variants || []).map((v) => ({
    '@type': 'Offer',
    priceCurrency: (v.price && v.price.currency) || 'KES',
    price: (v.price && v.price.amount) || product.price.amount,
    availability:
      v.stockState === 'out_of_stock' || v.inStock === false
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
    sku: v.sku,
    url: `${window.location.origin}/product.html?slug=${product.slug}`,
  }));
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    sku: product.id,
    category: product.category,
    image: (product.images || []).map((i) => i && i.fullUrl).filter(Boolean),
    offers: offers.length
      ? offers
      : {
          '@type': 'Offer',
          priceCurrency: product.price.currency,
          price: product.price.amount,
          availability: 'https://schema.org/InStock',
        },
  };
  if (product.rating && product.rating.count) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating.average,
      reviewCount: product.rating.count,
    };
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      node,
      {
        '@type': 'BreadcrumbList',
        itemListElement: (product.breadcrumbs || []).map((b, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: b.label,
          item: window.location.origin + (b.href || '/'),
        })),
      },
    ],
  };
}

function sanitize(html) {
  // Story/care come from our own admin (trusted). Strip script/style/on* defensively.
  return String(html)
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}
