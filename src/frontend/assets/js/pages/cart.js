import { api, ApiError } from '../api.js';
import { el, clear, imageEl } from '../dom.js';
import { emptyState, errorState } from '../components.js';
import { formatMoney } from '../money.js';
import { bootStorefront, view, showSpinner } from './_boot.js';
import { loadCart, getCart, updateCartItem, removeCartItem, applyDiscount, removeDiscount, subscribeCart } from '../cart.js';

bootStorefront({ active: '' });

let zones = null;
let lastQuote = null;
// Chosen delivery location, kept at module scope so a re-render of the summary
// (from add/remove/qty/discount, or from the quote itself) does not wipe the
// county the shopper picked or the town they typed into the region picker.
const pickedLocation = { county: '', town: '' };
// Live refs to the two summary figures that depend on `lastQuote`, so `doQuote`
// can update them in place instead of forcing a full cart re-render.
let summaryRefs = { delivery: null, total: null };

init();

async function init() {
  showSpinner();
  try {
    await loadCart(true);
    zones = await api.getDeliveryZones().catch(() => null);
    subscribeCart(renderCart);
    renderCart(getCart());
  } catch (err) {
    clear(view());
    view().append(errorState(err, init));
  }
}

function renderCart(cart) {
  const root = view();
  clear(root);
  root.append(el('h1', { text: 'Your cart' }));

  if (!cart || !cart.items || cart.items.length === 0) {
    root.append(
      emptyState({
        title: 'Your cart is empty',
        message: 'When you add pieces they will show up here, with the all-in cost before you commit.',
        actions: [
          el('a', { class: 'btn', href: '/new-in.html', text: 'Shop New In' }),
          el('a', { class: 'btn btn--secondary', href: '/women.html', text: 'Browse Women' }),
        ],
      })
    );
    return;
  }

  const layout = el('div', { class: 'checkout-layout' });

  const list = el('div', {});
  cart.items.forEach((item) => list.append(lineItem(item)));
  list.append(el('a', { class: 'btn btn--ghost', href: '/new-in.html', text: '← Continue shopping', style: 'margin-top:1rem;display:inline-block' }));

  layout.append(list, summary(cart));
  root.append(layout);
  root.append(trustMini());
}

function lineItem(item) {
  const opts = Object.entries(item.options || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const qtyInput = el('input', {
    type: 'number',
    min: 1,
    max: item.quantityAvailable || 99,
    value: item.quantity,
    'aria-label': `Quantity for ${item.name}`,
    inputmode: 'numeric',
  });
  const commit = async (n) => {
    const q = Math.max(1, Math.min(n, item.quantityAvailable || 99));
    qtyInput.value = String(q);
    if (q === item.quantity) return;
    try {
      await updateCartItem(item.id, q);
    } catch { /* toast shown by cart module */ }
  };
  qtyInput.addEventListener('change', () => commit(parseInt(qtyInput.value, 10) || 1));

  return el('div', { class: 'line-item', style: 'grid-template-columns:5.5rem 1fr' }, [
    el('a', { class: 'line-item__media', href: `/product.html?slug=${encodeURIComponent(item.slug)}`, 'aria-label': item.name }, [
      imageEl(item.image, { altFallback: item.name }),
    ]),
    el('div', { class: 'stack', style: 'gap:.4rem' }, [
      el('a', { href: `/product.html?slug=${encodeURIComponent(item.slug)}`, text: item.name, style: 'font-weight:600;text-decoration:none' }),
      opts ? el('p', { class: 'line-item__opts', text: opts }) : null,
      item.stockState === 'low_stock' && item.quantityAvailable
        ? el('p', { class: 'stock-cue stock-cue--low', text: `Only ${item.quantityAvailable} left` })
        : null,
      el('p', { class: 'text-muted', text: `${formatMoney(item.unitPrice)} each` }),
      el('div', { style: 'display:flex;gap:1rem;align-items:center;flex-wrap:wrap' }, [
        el('span', { class: 'qty' }, [
          el('button', { type: 'button', 'aria-label': 'Decrease quantity', text: '−', on: { click: () => commit(item.quantity - 1) } }),
          qtyInput,
          el('button', { type: 'button', 'aria-label': 'Increase quantity', text: '+', on: { click: () => commit(item.quantity + 1) } }),
        ]),
        el('strong', { text: formatMoney(item.lineTotal) }),
        el('button', {
          type: 'button',
          class: 'btn--ghost',
          style: 'background:none;border:0;cursor:pointer;text-decoration:underline',
          text: 'Remove',
          on: { click: () => removeCartItem(item.id) },
        }),
      ]),
    ]),
  ]);
}

function summary(cart) {
  const box = el('div', { class: 'checkout-summary stack', 'aria-label': 'Order summary' });
  box.append(el('h2', { text: 'Summary', style: 'font-size:var(--step-1)' }));

  box.append(line('Subtotal', formatMoney(cart.subtotal)));
  if (cart.discount) {
    box.append(
      el('div', { class: 'summary-line' }, [
        el('span', {}, [document.createTextNode(`Discount (${cart.discount.code}) `), el('button', {
          type: 'button', class: 'btn--ghost', style: 'background:none;border:0;text-decoration:underline;cursor:pointer', text: 'remove',
          on: { click: () => removeDiscount().catch(() => {}) },
        })]),
        el('span', { text: formatMoney(cart.discountTotal) }),
      ])
    );
  }

  const deliveryVal = lastQuote
    ? formatMoney(lastQuote.cart.deliveryFee)
    : cart.estimatedDelivery != null
      ? formatMoney(cart.estimatedDelivery)
      : 'Enter location';
  const deliveryValueEl = el('span', { id: 'sum-delivery', text: deliveryVal });
  box.append(el('div', { class: 'summary-line' }, [el('span', { text: 'Estimated delivery' }), deliveryValueEl]));

  box.append(regionPicker());
  box.append(discountField(cart));

  const total = lastQuote
    ? formatMoney(lastQuote.cart.total)
    : cart.estimatedTotal != null
      ? formatMoney(cart.estimatedTotal)
      : formatMoney(cart.subtotal);
  const totalValueEl = el('span', { id: 'sum-total', text: total });
  box.append(
    el('div', { class: 'summary-line summary-line--total' }, [el('span', { text: 'Estimated total' }), totalValueEl]),
    el('p', { class: 'hint', text: 'Final delivery fee confirms at checkout.' }),
    el('a', { class: 'btn btn--block', href: '/checkout.html', text: 'Checkout' })
  );

  // Hold refs so a fresh quote can rewrite just these two figures (see doQuote).
  summaryRefs = { delivery: deliveryValueEl, total: totalValueEl };
  return box;
}

function line(label, value) {
  return el('div', { class: 'summary-line' }, [el('span', { text: label }), el('span', { text: value })]);
}

function regionPicker() {
  const counties = [];
  if (zones && zones.zones) {
    zones.zones.forEach((z) => (z.counties || []).forEach((c) => { if (c && c !== '...' && !counties.includes(c)) counties.push(c); }));
  }
  counties.sort();
  const county = el('select', { class: 'select', id: 'cart-county', 'aria-label': 'Delivery county' }, [
    el('option', { value: '', text: counties.length ? 'Select county…' : 'Nairobi' }),
    ...counties.map((c) => el('option', { value: c, text: c })),
  ]);
  const town = el('input', { class: 'input', id: 'cart-town', placeholder: 'Town / estate', 'aria-label': 'Town or estate' });
  const status = el('p', { class: 'hint', role: 'status' });

  // Restore what the shopper already chose/typed — this builder runs on every
  // summary re-render, so without this the field would snap back to empty.
  county.value = pickedLocation.county;
  town.value = pickedLocation.town;

  const doQuote = async () => {
    if (!county.value && !counties.length) county.value = 'Nairobi';
    if (!county.value) return;
    // Persist the current field values before the async call so any re-render
    // triggered while the quote is in flight keeps them.
    pickedLocation.county = county.value;
    pickedLocation.town = town.value.trim();
    status.textContent = 'Checking delivery…';
    try {
      lastQuote = await api.quote(county.value, town.value.trim() || undefined);
      const methods = (lastQuote.methods || []).map((m) => `${m.label} — ${formatMoney(m.fee)} (${m.eta})`).join('; ');
      const pod = (lastQuote.allowedPaymentMethods || []).includes('pay_on_delivery');
      status.textContent = `${methods}. ${pod ? 'Pay on delivery available here.' : 'Prepay with M-Pesa for this area.'}`;
      // Targeted update of just the two figures that depend on the quote —
      // no full re-render, so the county/town fields keep focus and value.
      if (summaryRefs.delivery) summaryRefs.delivery.textContent = formatMoney(lastQuote.cart.deliveryFee);
      if (summaryRefs.total) summaryRefs.total.textContent = formatMoney(lastQuote.cart.total);
    } catch (err) {
      lastQuote = null;
      status.textContent = err instanceof ApiError ? err.message : 'Could not check delivery for that location.';
    }
  };
  county.addEventListener('change', doQuote);
  town.addEventListener('blur', doQuote);

  return el('details', { class: 'field', open: true }, [
    el('summary', { style: 'cursor:pointer;font-weight:600', text: 'Where should it go?' }),
    el('div', { class: 'form-row form-row--2', style: 'margin-top:.5rem' }, [county, town]),
    status,
  ]);
}

function discountField(cart) {
  if (cart.discount) return el('span');
  const input = el('input', { class: 'input', id: 'discount-code', placeholder: 'Discount code', 'aria-label': 'Discount code' });
  const status = el('p', { class: 'error-text', role: 'status', hidden: true });
  return el('form', {
    class: 'field',
    novalidate: true,
    on: {
      submit: async (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        status.hidden = true;
        const btn = e.target.querySelector('button');
        btn.classList.add('is-loading');
        try {
          await applyDiscount(input.value.trim());
        } catch (err) {
          status.hidden = false;
          status.textContent = (err && err.message) || 'That code did not work.';
        } finally {
          btn.classList.remove('is-loading');
        }
      },
    },
  }, [
    el('label', { for: 'discount-code', text: 'Discount code' }),
    el('div', { style: 'display:flex;gap:.5rem' }, [input, el('button', { class: 'btn btn--secondary', type: 'submit', text: 'Apply' })]),
    status,
  ]);
}

function trustMini() {
  return el('div', { class: 'trust-strip', style: 'margin-top:2rem' }, [
    trust('Secure M-Pesa checkout'),
    trust('Pay on delivery in many areas'),
    trust('14-day easy returns'),
    trust('Real support, one business day'),
  ]);
}
function trust(text) {
  return el('div', { class: 'trust-strip__item' }, [
    el('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', html: '<path fill="currentColor" d="m9 16.2-3.5-3.5L4 14.2 9 19l11-11-1.4-1.4L9 16.2Z"/>' }),
    el('span', { text }),
  ]);
}
