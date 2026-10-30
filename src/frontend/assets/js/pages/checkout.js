import { api, ApiError } from '../api.js';
import { el, clear, imageEl, $ } from '../dom.js';
import { errorState, emptyState, fieldError, applyValidationErrors } from '../components.js';
import { formatMoney } from '../money.js';
import { uuid, setPageMeta } from '../util.js';
import { openModal } from '../modal.js';
import { bootStorefront, view, showSpinner } from './_boot.js';
import { loadCart } from '../cart.js';
import { CONFIG } from '../config.js';
import { currentUser } from '../auth.js';
import { toast } from '../toast.js';
import { copy, effectivePaymentMethods, POD_TITLE, POD_DETAIL } from '../copy.js';

bootStorefront({ active: '' });
setPageMeta({ noindex: true });

const state = {
  user: null,
  cart: null,
  zones: null,
  quote: null,
  addresses: [],
  legal: { terms: null, returns: null },
  method: null,
  // With online M-Pesa off the only way to pay is on delivery, so it is preselected.
  payment: CONFIG.onlineMpesa ? 'mpesa' : 'pay_on_delivery',
  idempotencyKey: null,
  submitting: false,
};

init();

async function init() {
  showSpinner();
  try {
    state.user = await currentUser();
    state.cart = await loadCart(true);
    if (!state.cart || !state.cart.items || !state.cart.items.length) {
      clear(view());
      view().append(
        el('h1', { text: 'Checkout' }),
        emptyState({
          title: 'Your cart is empty',
          message: 'Add something you love, then come back to check out.',
          actions: [el('a', { class: 'btn', href: '/new-in.html', text: 'Shop New In' })],
        })
      );
      return;
    }
    [state.zones, state.legal.terms, state.legal.returns] = await Promise.all([
      api.getDeliveryZones().catch(() => null),
      api.getLegal('terms-of-sale').catch(() => null),
      api.getLegal('returns').catch(() => null),
    ]);
    if (state.user) {
      state.addresses = await api.getAddresses().then((r) => r.items || []).catch(() => []);
    }
    renderCheckout();
  } catch (err) {
    clear(view());
    view().append(errorState(err, init));
  }
}

function renderCheckout() {
  const root = view();
  clear(root);
  root.append(el('h1', { text: 'Checkout' }));

  const layout = el('div', { class: 'checkout-layout' });
  const form = el('form', { id: 'checkout-form', novalidate: true });

  form.append(contactSection(), addressSection(), methodSection(), paymentSection(), reviewSection());
  layout.append(form, summaryPanel());
  root.append(layout);

  refreshMethodSection();
  // Pay-on-delivery-only builds can say how payment works before the address is known.
  if (!CONFIG.onlineMpesa) refreshPaymentSection();
  updatePlaceOrderState();
}

/* ---------- Contact ---------- */
function contactSection() {
  const u = state.user;
  const section = el('section', { class: 'checkout-section', 'aria-labelledby': 'ct-h' }, [
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:1rem' }, [
      el('h2', { id: 'ct-h', text: 'Contact' }),
      u
        ? el('span', { class: 'hint', text: `Signed in as ${u.firstName || u.email}` })
        : el('a', { href: `/account/signin.html?next=${encodeURIComponent('/checkout.html')}`, text: 'Sign in for saved details' }),
    ]),
    field('First name', 'firstName', { value: u ? u.firstName || '' : '', required: true, autocomplete: 'given-name' }),
    field('Email', 'email', { type: 'email', value: u ? u.email || '' : '', required: true, autocomplete: 'email' }),
    field('Phone', 'phone', {
      type: 'tel',
      value: u ? u.phone || '' : '',
      required: true,
      autocomplete: 'tel',
      hint: copy.checkoutPhoneHint,
      placeholder: '+2547XXXXXXXX',
    }),
    !u
      ? checkbox('marketingOptIn', 'Email me when new pieces land (optional)')
      : null,
  ]);
  return section;
}

/* ---------- Address ---------- */
function addressSection() {
  const counties = allCounties();
  const wrap = el('section', { class: 'checkout-section', 'aria-labelledby': 'ad-h' }, [el('h2', { id: 'ad-h', text: 'Delivery address' })]);

  if (state.addresses.length) {
    const picker = el('div', { class: 'field' }, [el('span', { class: 'variant-group__label', text: 'Saved addresses' })]);
    state.addresses.forEach((a, i) => {
      const id = `saved-addr-${i}`;
      picker.append(
        el('label', { class: 'radio', for: id }, [
          el('input', {
            type: 'radio',
            name: 'savedAddress',
            id,
            value: a.id,
            checked: a.isDefault || (i === 0 && !state.addresses.some((x) => x.isDefault)),
            on: { change: () => fillAddress(a) },
          }),
          el('span', { text: `${a.recipientName} — ${a.town}, ${a.county}${a.isDefault ? ' (default)' : ''}` }),
        ])
      );
    });
    picker.append(
      el('label', { class: 'radio', for: 'addr-new' }, [
        el('input', { type: 'radio', name: 'savedAddress', id: 'addr-new', value: '', on: { change: () => fillAddress(null) } }),
        el('span', { text: 'Use a new address' }),
      ])
    );
    wrap.append(picker);
  }

  const countySelect = el('select', { class: 'select', id: 'f-county', name: 'county', required: true }, [
    el('option', { value: '', text: 'Select county…' }),
    ...counties.map((c) => el('option', { value: c, text: c })),
  ]);
  countySelect.addEventListener('change', requestQuote);

  wrap.append(
    field('Recipient name', 'recipientName', { required: true, autocomplete: 'name', value: state.user ? state.user.firstName || '' : '' }),
    field('Recipient phone', 'recipientPhone', { type: 'tel', required: true, autocomplete: 'tel' }),
    el('div', { class: 'field' }, [el('label', { for: 'f-county', html: 'County <span class="req">*</span>' }), countySelect]),
    field('Town / estate', 'town', { required: true, onBlur: requestQuote }),
    field('Delivery instructions / landmark', 'instructions', { textarea: true, placeholder: 'e.g. Yaya Centre, call on arrival' }),
    state.user ? checkbox('saveToAccount', 'Save this address to my account') : null,
    el('p', { class: 'hint', id: 'quote-status', role: 'status' })
  );

  if (state.addresses.length) {
    const def = state.addresses.find((a) => a.isDefault) || state.addresses[0];
    setTimeout(() => fillAddress(def), 0);
  }
  return wrap;
}

function fillAddress(a) {
  const form = $('#checkout-form');
  if (!form) return;
  const set = (name, val) => { const i = form.querySelector(`[name="${name}"]`); if (i) i.value = val || ''; };
  if (a) {
    set('recipientName', a.recipientName);
    set('recipientPhone', a.phone);
    set('county', a.county);
    set('town', a.town);
    set('instructions', a.instructions);
    requestQuote();
  } else {
    set('recipientName', ''); set('recipientPhone', ''); set('county', ''); set('town', ''); set('instructions', '');
  }
}

/* ---------- Quote ---------- */
async function requestQuote() {
  const form = $('#checkout-form');
  const county = form.querySelector('[name="county"]').value;
  const town = form.querySelector('[name="town"]').value.trim();
  const status = $('#quote-status');
  if (!county) return;
  status.textContent = 'Checking delivery options…';
  try {
    state.quote = await api.quote(county, town || undefined);
    if (state.method && !(state.quote.methods || []).some((m) => m.code === state.method)) state.method = null;
    if (!state.method && state.quote.methods && state.quote.methods.length) state.method = state.quote.methods[0].code;
    // Only methods the quote allows (and this build supports) are selectable. With a
    // single option it is preselected; with none, payment stays null and the Payment
    // section shows a blocking message (place order stays disabled).
    const usable = effectivePaymentMethods(state.quote.allowedPaymentMethods);
    if (!usable.includes(state.payment)) state.payment = usable.length ? usable[0] : null;
    status.textContent = '';
    refreshMethodSection();
    refreshPaymentSection();
    refreshSummary();
    updatePlaceOrderState();
  } catch (err) {
    state.quote = null;
    status.textContent = err instanceof ApiError ? err.message : 'We could not work out delivery for that address.';
    refreshMethodSection();
    refreshSummary();
    updatePlaceOrderState();
  }
}

/* ---------- Delivery method ---------- */
function methodSection() {
  return el('section', { class: 'checkout-section', 'aria-labelledby': 'dm-h', id: 'method-section' }, [
    el('h2', { id: 'dm-h', text: 'Delivery method' }),
    el('div', { id: 'method-options' }, [el('p', { class: 'hint', text: 'Enter your county and town above to see delivery options.' })]),
  ]);
}

function refreshMethodSection() {
  const wrap = $('#method-options');
  if (!wrap) return;
  clear(wrap);
  const methods = (state.quote && state.quote.methods) || [];
  if (!methods.length) {
    wrap.append(el('p', { class: 'hint', text: 'Enter your county and town above to see delivery options.' }));
    return;
  }
  methods.forEach((m) => {
    const id = `method-${m.code}`;
    wrap.append(
      el('label', { class: 'radio', for: id, style: 'padding:.5rem 0' }, [
        el('input', {
          type: 'radio', name: 'deliveryMethod', id, value: m.code, checked: state.method === m.code,
          on: { change: () => { state.method = m.code; refreshSummary(); updatePlaceOrderState(); } },
        }),
        el('span', {}, [el('strong', { text: m.label }), document.createTextNode(` — ${formatMoney(m.fee)} · ${m.eta}`)]),
      ])
    );
  });
}

/* ---------- Payment ---------- */
function paymentSection() {
  const section = el('section', { class: 'checkout-section', 'aria-labelledby': 'pm-h', id: 'payment-section' }, [
    el('h2', { id: 'pm-h', text: 'Payment' }),
    el('div', { id: 'payment-options' }),
  ]);
  return section;
}

/** The single, clear statement shown when pay on delivery is the only way to pay. */
function podOnlyStatement() {
  return el('p', { class: 'payment-single', id: 'pay-single' }, [
    el('strong', { text: POD_TITLE }),
    document.createTextNode(` — ${POD_DETAIL}`),
  ]);
}

function refreshPaymentSection() {
  const wrap = $('#payment-options');
  if (!wrap) return;
  clear(wrap);
  const allowed = effectivePaymentMethods(state.quote && state.quote.allowedPaymentMethods);

  if (!allowed.length) {
    wrap.append(
      el('div', { class: 'alert alert--error', role: 'alert', id: 'pay-none' }, [
        el('p', { text: 'We cannot take an order for this address right now, because no payment option is available for it.' }),
        el('p', {}, [
          document.createTextNode('Please try another town or county, or '),
          el('a', { href: '/contact.html', text: 'contact us' }),
          document.createTextNode(' and we will sort it out with you.'),
        ]),
      ])
    );
    return;
  }

  if (allowed.length === 1 && allowed[0] === 'pay_on_delivery') {
    state.payment = 'pay_on_delivery';
    wrap.append(podOnlyStatement());
    return;
  }

  const opt = (value, title, desc) => {
    const id = `pay-${value}`;
    return el('label', { class: 'radio', for: id, style: 'padding:.5rem 0' }, [
      el('input', {
        type: 'radio', name: 'payment', id, value, checked: state.payment === value,
        on: { change: () => { state.payment = value; updatePlaceOrderState(); } },
      }),
      el('span', {}, [el('strong', { text: title }), el('br'), el('span', { class: 'text-muted', text: desc })]),
    ]);
  };
  if (allowed.includes('mpesa')) {
    wrap.append(opt('mpesa', 'M-Pesa (pay now)', 'We send an STK prompt to your phone. Enter your PIN to pay.'));
  }
  if (allowed.includes('pay_on_delivery')) {
    wrap.append(opt('pay_on_delivery', POD_TITLE, 'Cash or M-Pesa to the rider when your order arrives.'));
  } else {
    wrap.append(el('p', { class: 'hint', text: 'Pay on delivery is not available for this area — prepay with M-Pesa.' }));
  }
}

/* ---------- Review & accept ---------- */
function reviewSection() {
  const termsV = state.legal.terms ? state.legal.terms.version : '—';
  const returnsV = state.legal.returns ? state.legal.returns.version : '—';

  const check = el('input', {
    type: 'checkbox',
    id: 'agree',
    name: 'agree',
    required: true,
    on: { change: updatePlaceOrderState },
  });

  return el('section', { class: 'checkout-section', 'aria-labelledby': 'rv-h' }, [
    el('h2', { id: 'rv-h', text: 'Review & accept' }),
    el('div', { id: 'review-lines' }),
    el('div', { class: 'field', style: 'margin-top:1rem' }, [
      el('label', { class: 'checkbox', for: 'agree' }, [
        check,
        el('span', {}, [
          document.createTextNode('I have read and accept the '),
          el('button', { type: 'button', class: 'btn--ghost', style: 'background:none;border:0;text-decoration:underline;cursor:pointer;padding:0', text: `Terms of Sale (v${termsV})`, on: { click: () => openLegal('terms-of-sale') } }),
          document.createTextNode(' and the '),
          el('button', { type: 'button', class: 'btn--ghost', style: 'background:none;border:0;text-decoration:underline;cursor:pointer;padding:0', text: `Returns & Refund Policy (v${returnsV})`, on: { click: () => openLegal('returns') } }),
          document.createTextNode('.'),
        ]),
      ]),
      el('p', { class: 'error-text', id: 'agree-error', hidden: true, text: 'Please accept the Terms of Sale and Returns Policy to place your order.' }),
    ]),
    el('div', { id: 'checkout-alert', role: 'alert' }),
    el('button', { class: 'btn btn--block', id: 'place-order', type: 'submit', text: 'Place order', disabled: true }),
    el('p', { class: 'hint', text: copy.checkoutPlaceHint }),
  ]);
}

function refreshReviewLines() {
  const wrap = $('#review-lines');
  if (!wrap) return;
  clear(wrap);
  const cart = state.cart;
  const form = $('#checkout-form');
  const county = form ? form.querySelector('[name="county"]').value : '';
  const town = form ? form.querySelector('[name="town"]').value : '';
  const method = (state.quote && (state.quote.methods || []).find((m) => m.code === state.method)) || null;

  wrap.append(
    el('ul', { style: 'list-style:none;padding:0', class: 'stack' },
      (cart.items || []).map((it) =>
        el('li', { style: 'display:flex;gap:.75rem;align-items:center' }, [
          el('div', { style: 'width:3rem;flex:none' }, [imageEl(it.image, { altFallback: it.name })]),
          el('div', {}, [
            el('strong', { text: it.name }),
            el('br'),
            el('span', { class: 'text-muted', text: `${Object.values(it.options || {}).join(' / ')} · Qty ${it.quantity} · ${formatMoney(it.lineTotal)}` }),
          ]),
        ])
      )
    ),
    el('p', { style: 'margin-top:.5rem' }, [el('strong', { text: 'Deliver to: ' }), document.createTextNode(county ? `${town ? town + ', ' : ''}${county}` : 'address above')]),
    method ? el('p', {}, [el('strong', { text: 'Method: ' }), document.createTextNode(`${method.label} — ${formatMoney(method.fee)}`)]) : null
  );
}

async function openLegal(docType) {
  const modal = openModal({ title: 'Loading…', body: el('div', { class: 'spinner' }) });
  try {
    const doc = await api.getLegal(docType);
    if (docType === 'terms-of-sale') state.legal.terms = doc;
    if (docType === 'returns') state.legal.returns = doc;
    modal.dialog.querySelector('.modal__head h2').textContent = `${doc.title} — v${doc.version}`;
    modal.setBody(el('div', { class: 'prose', html: sanitizeHtml(doc.bodyHtml) }));
  } catch {
    modal.setBody(el('p', { text: 'Could not load that document right now. It is also linked in the footer.' }));
  }
}

/* ---------- Summary panel ---------- */
function summaryPanel() {
  return el('aside', { class: 'checkout-summary', id: 'summary-panel', 'aria-label': 'Order summary' });
}

function refreshSummary() {
  const panel = $('#summary-panel');
  if (!panel) return;
  clear(panel);
  const cart = state.cart;
  const q = state.quote;
  const fee = state.method && q ? (q.methods.find((m) => m.code === state.method) || {}).fee : q ? (q.cart && q.cart.deliveryFee) : null;
  const subtotal = (q && q.cart && q.cart.subtotal) || cart.subtotal;
  const discountTotal = (q && q.cart && q.cart.discountTotal) || cart.discountTotal;
  let total = (q && q.cart && q.cart.total) || cart.estimatedTotal || cart.subtotal;
  if (fee && q && q.cart) {
    total = { amount: subtotal.amount + (discountTotal ? discountTotal.amount : 0) + fee.amount, currency: subtotal.currency };
  }

  panel.append(
    el('h2', { text: 'Order summary', style: 'font-size:var(--step-1)' }),
    el('ul', { style: 'list-style:none;padding:0', class: 'stack' },
      (cart.items || []).map((it) =>
        el('li', { class: 'summary-line' }, [
          el('span', { text: `${it.name} × ${it.quantity}` }),
          el('span', { text: formatMoney(it.lineTotal) }),
        ])
      )
    ),
    line('Subtotal', formatMoney(subtotal)),
    cart.discount ? line(`Discount (${cart.discount.code})`, formatMoney(discountTotal)) : null,
    line('Delivery', fee ? formatMoney(fee) : 'Enter address'),
    el('div', { class: 'summary-line summary-line--total' }, [el('span', { text: 'Total' }), el('span', { text: formatMoney(total) })])
  );
  refreshReviewLines();
}

function line(label, value) {
  return el('div', { class: 'summary-line' }, [el('span', { text: label }), el('span', { text: value })]);
}

/* ---------- Place order ---------- */
function clientTotal() {
  const q = state.quote;
  if (q && q.cart) {
    const fee = state.method ? (q.methods.find((m) => m.code === state.method) || {}).fee : q.cart.deliveryFee;
    const sub = q.cart.subtotal.amount + (q.cart.discountTotal ? q.cart.discountTotal.amount : 0);
    return { amount: sub + (fee ? fee.amount : 0), currency: q.cart.subtotal.currency };
  }
  return state.cart.estimatedTotal || state.cart.subtotal;
}

function formValid() {
  const form = $('#checkout-form');
  if (!form) return false;
  const required = ['firstName', 'email', 'phone', 'recipientName', 'recipientPhone', 'county', 'town'];
  const ok = required.every((n) => {
    const i = form.querySelector(`[name="${n}"]`);
    return i && i.value.trim();
  });
  return ok && !!state.method && !!state.payment && !!state.quote;
}

function updatePlaceOrderState() {
  refreshSummary();
  const btn = $('#place-order');
  const agree = $('#agree');
  if (!btn) return;
  btn.disabled = !(formValid() && agree && agree.checked) || state.submitting;
}

function buildOrderBody() {
  const form = $('#checkout-form');
  const val = (n) => { const i = form.querySelector(`[name="${n}"]`); return i ? i.value.trim() : ''; };
  const checked = (n) => { const i = form.querySelector(`[name="${n}"]`); return !!(i && i.checked); };
  return {
    contact: { email: val('email'), phone: val('phone'), firstName: val('firstName') },
    deliveryAddress: {
      recipientName: val('recipientName'),
      phone: val('recipientPhone'),
      county: val('county'),
      town: val('town'),
      instructions: val('instructions') || undefined,
      saveToAccount: checked('saveToAccount'),
    },
    deliveryMethodCode: state.method,
    paymentMethod: state.payment,
    discountCode: state.cart.discount ? state.cart.discount.code : undefined,
    marketingOptIn: checked('marketingOptIn'),
    agreementAcceptance: {
      accepted: true,
      termsOfSaleVersion: state.legal.terms ? state.legal.terms.version : undefined,
      returnsPolicyVersion: state.legal.returns ? state.legal.returns.version : undefined,
    },
    clientTotal: clientTotal(),
  };
}

async function onSubmit(e) {
  e.preventDefault();
  const form = $('#checkout-form');
  const agree = $('#agree');
  const alertBox = $('#checkout-alert');
  clear(alertBox);
  $('#agree-error').hidden = agree.checked;

  ['firstName', 'email', 'phone', 'recipientName', 'recipientPhone', 'town'].forEach((n) => {
    const i = form.querySelector(`[name="${n}"]`);
    if (i) fieldError(i, i.value.trim() ? null : 'Required.');
  });
  if (!formValid()) {
    alertBox.append(el('div', { class: 'alert alert--error', text: 'Please complete the highlighted fields and choose a delivery method.' }));
    return;
  }
  if (!agree.checked) { agree.focus(); return; }

  if (!state.idempotencyKey) state.idempotencyKey = uuid();
  const btn = $('#place-order');
  state.submitting = true;
  btn.classList.add('is-loading');
  btn.disabled = true;

  try {
    const res = await api.createOrder(buildOrderBody(), state.idempotencyKey);
    sessionStorage.setItem(`hoe:tt:${res.order.orderNumber}`, res.trackingToken || '');
    if (CONFIG.onlineMpesa && res.payment && res.payment.method === 'mpesa') {
      await runMpesaFlow(res.order, res.payment);
    } else {
      goToConfirmation(res.order.orderNumber);
    }
  } catch (err) {
    state.submitting = false;
    btn.classList.remove('is-loading');
    handleOrderError(err);
    updatePlaceOrderState();
  }
}

function handleOrderError(err) {
  const alertBox = $('#checkout-alert');
  clear(alertBox);
  if (!(err instanceof ApiError)) {
    alertBox.append(el('div', { class: 'alert alert--error', text: 'Something went wrong placing your order. Please try again.' }));
    return;
  }
  if (err.status === 409 && err.code === 'price_changed' && err.body && err.body.order) {
    const o = err.body.order;
    state.idempotencyKey = uuid(); // body will change on resubmit
    alertBox.append(
      el('div', { class: 'alert alert--warning' }, [
        el('p', { text: `The total changed to ${formatMoney(o.total)} since you started. Please review the summary and place your order again.` }),
      ])
    );
    // reflect corrected totals
    state.quote = state.quote || {};
    state.quote.cart = { subtotal: o.subtotal, discountTotal: o.discountTotal, deliveryFee: o.deliveryFee, total: o.total };
    refreshSummary();
    return;
  }
  if (err.status === 409 && (err.code === 'out_of_stock' || err.code === 'conflict')) {
    const lines = (err.details || []).map((d) => `${d.field || 'An item'}: ${d.message}`);
    alertBox.append(
      el('div', { class: 'alert alert--error' }, [
        el('p', { text: err.message || 'Something in your cart went out of stock.' }),
        lines.length ? el('ul', {}, lines.map((l) => el('li', { text: l }))) : null,
        el('a', { class: 'btn btn--secondary', href: '/cart.html', text: 'Review cart' }),
      ])
    );
    return;
  }
  if (err.status === 422 && (err.code === 'agreement_version_stale' || err.code === 'agreement_not_accepted')) {
    state.idempotencyKey = uuid();
    (err.details || []).forEach((d) => {
      if (/terms/i.test(d.field || '') && d.message) state.legal.terms = { ...state.legal.terms, version: extractVersion(d.message) || state.legal.terms.version };
      if (/returns/i.test(d.field || '') && d.message) state.legal.returns = { ...state.legal.returns, version: extractVersion(d.message) || state.legal.returns.version };
    });
    Promise.all([api.getLegal('terms-of-sale').catch(() => null), api.getLegal('returns').catch(() => null)]).then(([t, r]) => {
      if (t) state.legal.terms = t;
      if (r) state.legal.returns = r;
      renderCheckout();
      $('#checkout-alert').append(el('div', { class: 'alert alert--warning', text: 'Our Terms or Returns Policy were updated. Please review the current version and accept again.' }));
    });
    return;
  }
  if (err.status === 422) {
    applyValidationErrors($('#checkout-form'), err.details);
    alertBox.append(el('div', { class: 'alert alert--error', text: err.message || 'Please check the highlighted fields.' }));
    return;
  }
  if (err.status === 401) {
    alertBox.append(el('div', { class: 'alert alert--error', text: 'Please sign in to save this address, or untick "save to my account".' }));
    return;
  }
  alertBox.append(el('div', { class: 'alert alert--error', text: err.message || 'We could not place your order just now.' }));
}

function extractVersion(msg) {
  const m = String(msg).match(/\bv?(\d+)\b/);
  return m ? Number(m[1]) : null;
}

/* ---------- M-Pesa ---------- */
async function runMpesaFlow(order, payment) {
  const root = view();
  clear(root);
  const status = el('p', { role: 'status', 'aria-live': 'polite', text: 'Sending an M-Pesa prompt to your phone…' });
  const detail = el('p', { class: 'hint' });
  const actions = el('div', { class: 'stack', style: 'margin-top:1rem' });
  root.append(
    el('div', { class: 'center-narrow stack', style: 'text-align:center;padding:2rem 0' }, [
      el('h1', { text: 'Confirm your payment' }),
      el('div', { class: 'spinner', id: 'pay-spinner' }),
      status,
      detail,
      actions,
    ])
  );

  let stkKey = uuid();
  const phone = order.deliveryAddress ? order.deliveryAddress.phone : undefined;

  async function issueStk() {
    clear(actions);
    $('#pay-spinner').hidden = false;
    status.textContent = 'Sending an M-Pesa prompt to your phone…';
    try {
      const res = await api.stkPush(payment.id, phone, stkKey);
      status.textContent = res.message || 'Check your phone and enter your M-Pesa PIN.';
      pollPayment();
    } catch (err) {
      $('#pay-spinner').hidden = true;
      if (err instanceof ApiError && err.status === 503) {
        status.textContent = 'We could not reach M-Pesa just then — try again and we will hold your cart.';
        offerRetry();
      } else {
        status.textContent = (err && err.message) || 'M-Pesa did not accept that request.';
        offerRetryOrPod();
      }
    }
  }

  let elapsed = 0;
  async function pollPayment() {
    try {
      const p = await api.getPayment(payment.id);
      if (p.state === 'paid') {
        status.textContent = `Paid. Receipt ${p.mpesaReceiptNumber || ''}`.trim();
        goToConfirmation(order.orderNumber);
        return;
      }
      if (p.state === 'failed') {
        $('#pay-spinner').hidden = true;
        status.textContent = p.failureReason || 'The payment did not go through.';
        offerRetryOrPod();
        return;
      }
    } catch { /* keep polling */ }
    elapsed += CONFIG.paymentPollIntervalMs;
    if (elapsed >= CONFIG.paymentPollTimeoutMs) {
      $('#pay-spinner').hidden = true;
      status.textContent = 'We have not seen the payment yet. It can take a moment — check your phone, or try again.';
      offerRetryOrPod();
      return;
    }
    setTimeout(pollPayment, CONFIG.paymentPollIntervalMs);
  }

  function offerRetry() {
    clear(actions);
    actions.append(el('button', { class: 'btn', text: 'Try M-Pesa again', on: { click: () => { stkKey = uuid(); issueStk(); } } }));
  }
  function offerRetryOrPod() {
    clear(actions);
    actions.append(el('button', { class: 'btn', text: 'Try M-Pesa again', on: { click: () => { stkKey = uuid(); issueStk(); } } }));
    const podAllowed = (state.quote && (state.quote.allowedPaymentMethods || []).includes('pay_on_delivery'));
    if (podAllowed) {
      actions.append(
        el('button', {
          class: 'btn btn--secondary',
          text: 'Switch to pay on delivery',
          on: {
            click: async (e) => {
              e.target.classList.add('is-loading');
              try {
                await api.changePaymentMethod(order.orderNumber, 'pay_on_delivery');
                goToConfirmation(order.orderNumber);
              } catch (err) {
                toast((err && err.message) || 'Could not switch payment method.', 'error');
                e.target.classList.remove('is-loading');
              }
            },
          },
        })
      );
    }
    actions.append(el('a', { class: 'btn--ghost', href: `/order-tracking.html?order=${encodeURIComponent(order.orderNumber)}`, text: 'View order status' }));
  }

  issueStk();
}

function goToConfirmation(orderNumber) {
  window.location.href = `/order-confirmation.html?order=${encodeURIComponent(orderNumber)}`;
}

/* ---------- helpers ---------- */
function allCounties() {
  const out = [];
  if (state.zones && state.zones.zones) {
    state.zones.zones.forEach((z) => (z.counties || []).forEach((c) => { if (c && c !== '...' && !out.includes(c)) out.push(c); }));
  }
  out.sort();
  return out;
}

function field(label, name, opts = {}) {
  const id = `f-${name}`;
  const input = opts.textarea
    ? el('textarea', { class: 'textarea', id, name })
    : el('input', { class: 'input', id, name, type: opts.type || 'text' });
  if (opts.value) input.value = opts.value;
  if (opts.required) input.required = true;
  if (opts.autocomplete) input.autocomplete = opts.autocomplete;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.onBlur) input.addEventListener('blur', opts.onBlur);
  input.addEventListener('input', () => { fieldError(input, null); updatePlaceOrderState(); });
  return el('div', { class: 'field' }, [
    el('label', { for: id, html: `${label}${opts.required ? ' <span class="req">*</span>' : ''}` }),
    input,
    opts.hint ? el('p', { class: 'hint', text: opts.hint }) : null,
  ]);
}

function checkbox(name, label) {
  return el('div', { class: 'field' }, [
    el('label', { class: 'checkbox' }, [el('input', { type: 'checkbox', name }), el('span', { text: label })]),
  ]);
}

function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '');
}

document.addEventListener('submit', (e) => {
  if (e.target && e.target.id === 'checkout-form') onSubmit(e);
});
