import { api, ApiError } from '../api.js';
import { el, clear, $ } from '../dom.js';
import { errorState, fieldError } from '../components.js';
import { getParam, setPageMeta, injectJsonLd } from '../util.js';
import { CONFIG } from '../config.js';
import { bootStorefront, view, showSpinner } from './_boot.js';
import { orderTimeline, orderSummary, paymentStateLabel } from '../order-view.js';

bootStorefront({ active: '' });

const orderNumber = getParam('order');
const trackingToken = getParam('trackingToken') || (orderNumber && sessionStorage.getItem(`hoe:tt:${orderNumber}`)) || undefined;
const emailParam = getParam('email');

if (orderNumber && (trackingToken || emailParam)) {
  loadOrder({ trackingToken, email: emailParam });
} else {
  renderLookup();
}

function renderLookup(message) {
  const root = view();
  clear(root);
  setPageMeta({ title: 'Track Your Order — House of Esther', canonicalPath: '/order-tracking.html' });
  injectJsonLd({ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Track Your Order — House of Esther' });

  const onum = el('input', { class: 'input', id: 't-order', name: 'orderNumber', required: true, placeholder: 'HE-2026-XXXXX', value: orderNumber || '' });
  const email = el('input', { class: 'input', id: 't-email', name: 'email', type: 'email', required: true, placeholder: 'you@example.com' });
  const status = el('p', { class: 'error-text', role: 'alert', hidden: !message, text: message || '' });

  root.append(
    el('div', { class: 'center-narrow stack' }, [
      el('h1', { text: 'Track your order' }),
      el('p', { class: 'text-muted', text: 'Enter your order number and the email you used. We will not reveal anything unless they match.' }),
      el('form', {
        class: 'stack',
        novalidate: true,
        on: { submit: onLookup },
      }, [
        el('div', { class: 'field' }, [el('label', { for: 't-order', html: 'Order number <span class="req">*</span>' }), onum]),
        el('div', { class: 'field' }, [el('label', { for: 't-email', html: 'Email <span class="req">*</span>' }), email]),
        status,
        el('button', { class: 'btn', type: 'submit', text: 'Find my order' }),
      ]),
      el('p', { class: 'hint' }, [
        document.createTextNode('Have an account? '),
        el('a', { href: '/account/orders.html', text: 'See all your orders' }),
        document.createTextNode('.'),
      ]),
    ])
  );
}

async function onLookup(e) {
  e.preventDefault();
  const onum = $('#t-order');
  const email = $('#t-email');
  fieldError(onum, onum.value.trim() ? null : 'Required.');
  fieldError(email, email.checkValidity() ? null : 'Enter the email you ordered with.');
  if (!onum.value.trim() || !email.checkValidity()) return;

  const btn = e.target.querySelector('button');
  btn.classList.add('is-loading');
  try {
    const res = await api.lookupOrder(onum.value.trim(), email.value.trim());
    renderOrder(res.order);
  } catch (err) {
    btn.classList.remove('is-loading');
    if (err instanceof ApiError && err.status === 404) {
      renderLookup('We could not find an order matching that number and email.');
    } else if (err instanceof ApiError && err.status === 429) {
      renderLookup('Too many attempts. Please wait a few minutes and try again.');
    } else {
      renderLookup((err && err.message) || 'Something went wrong. Please try again.');
    }
  }
}

async function loadOrder(auth) {
  showSpinner();
  try {
    const order = await api.getOrder(orderNumber, auth);
    renderOrder(order);
  } catch (err) {
    clear(view());
    if (err instanceof ApiError && err.status === 404) {
      renderLookup('That tracking link did not work. Enter your order number and email instead.');
    } else {
      view().append(errorState(err, () => loadOrder(auth)));
    }
  }
}

let pollTimer = null;

function renderOrder(order) {
  const root = view();
  clear(root);
  setPageMeta({ title: `Track ${order.orderNumber} — House of Esther`, canonicalPath: '/order-tracking.html', noindex: true });

  root.append(
    el('div', { class: 'stack-l' }, [
      el('header', { class: 'stack' }, [
        el('p', { class: 'eyebrow', text: 'Order tracking' }),
        el('h1', { text: order.orderNumber }),
        el('p', { class: 'lede', text: paymentStateLabel(order) }),
      ]),
      el('section', { 'aria-label': 'Status' }, [orderTimeline(order)]),
      order.payment && order.payment.method === 'mpesa' && order.payment.state === 'pending'
        ? el('p', { class: 'hint', id: 'poll-note', text: 'Waiting on payment confirmation…' })
        : null,
      orderSummary(order, { collapsible: true }),
      el('div', { class: 'card' }, [
        el('h2', { style: 'font-size:var(--step-1)', text: 'Something wrong?' }),
        el('p', { class: 'text-muted', text: 'Message us and we will look into it — usually within one business day.' }),
        el('div', { style: 'display:flex;gap:.75rem;flex-wrap:wrap' }, [
          el('a', { class: 'btn btn--secondary', href: `/contact.html?topic=order_issue&order=${encodeURIComponent(order.orderNumber)}`, text: 'Contact support' }),
          el('a', { class: 'btn--ghost', href: `https://wa.me/${CONFIG.whatsappNumber.replace(/[^\d]/g, '')}`, target: '_blank', rel: 'noopener', text: 'WhatsApp us' }),
        ]),
      ]),
    ])
  );

  // Poll while an M-Pesa payment is still pending (e.g. user landed here from a failed STK retry).
  if (pollTimer) clearTimeout(pollTimer);
  if (order.payment && order.payment.method === 'mpesa' && ['pending', 'processing'].includes(order.payment.state)) {
    pollTimer = setTimeout(async () => {
      try {
        const fresh = await api.getOrder(order.orderNumber, { trackingToken, email: emailParam });
        if (JSON.stringify(fresh.statusTimeline) !== JSON.stringify(order.statusTimeline) || (fresh.payment && fresh.payment.state !== order.payment.state)) {
          renderOrder(fresh);
        } else {
          renderOrder(order);
        }
      } catch { /* stop polling on error */ }
    }, 5000);
  }
}
