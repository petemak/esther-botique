/** Shared order rendering: status timeline + summary. Used by confirmation, tracking, account. */
import { el, imageEl } from './dom.js';
import { formatMoney } from './money.js';
import { formatDateTime, titleCase } from './util.js';

const FLOW = ['placed', 'confirmed', 'packed', 'dispatched', 'out_for_delivery', 'delivered'];
const LABELS = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  dispatched: 'Dispatched',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export function orderTimeline(order) {
  const timeline = order.statusTimeline && order.statusTimeline.length
    ? order.statusTimeline
    : FLOW.map((s) => ({ status: s, at: null }));

  if (order.status === 'cancelled' || order.status === 'refunded') {
    return el('div', { class: 'alert alert--warning' }, [
      el('p', { html: `<strong>This order is ${LABELS[order.status]}.</strong>` }),
      order.status === 'refunded' && order.payment && order.payment.mpesaReceiptNumber
        ? el('p', { text: `Refund reference: ${order.payment.mpesaReceiptNumber}` })
        : null,
    ]);
  }

  const currentIndex = FLOW.indexOf(order.status);
  const list = el('ol', { class: 'timeline' });
  timeline
    .filter((s) => FLOW.includes(s.status))
    .forEach((step) => {
      const idx = FLOW.indexOf(step.status);
      const done = step.at || idx < currentIndex;
      const current = idx === currentIndex;
      list.append(
        el('li', { class: `${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`.trim() }, [
          el('div', {}, [
            el('span', { class: 'timeline__label', text: LABELS[step.status] || titleCase(step.status) }),
            step.at ? el('div', { class: 'timeline__time', text: formatDateTime(step.at) }) : null,
            current && step.status === 'dispatched' && order.courier
              ? el('div', { class: 'timeline__time', text: `${order.courier}${order.trackingReference ? ` · ${order.trackingReference}` : ''}` })
              : null,
          ]),
        ])
      );
    });
  return list;
}

export function paymentStateLabel(order) {
  const p = order.payment || {};
  if (p.method === 'pay_on_delivery') {
    return p.state === 'paid' ? 'Paid on delivery' : 'To pay on delivery';
  }
  if (p.state === 'paid') return `Paid via M-Pesa${p.mpesaReceiptNumber ? ` · ${p.mpesaReceiptNumber}` : ''}`;
  if (p.state === 'failed') return 'Payment failed';
  if (p.state === 'refunded') return 'Refunded';
  return 'Payment pending';
}

export function orderSummary(order, { collapsible } = {}) {
  const items = el('ul', { style: 'list-style:none;padding:0', class: 'stack' },
    (order.items || []).map((it) =>
      el('li', { style: 'display:flex;gap:.75rem;align-items:center' }, [
        el('div', { style: 'width:3.5rem;flex:none' }, [imageEl(it.image, { altFallback: it.name })]),
        el('div', {}, [
          el('strong', { text: it.name }),
          el('br'),
          el('span', { class: 'text-muted', text: `${Object.values(it.options || {}).join(' / ')} · Qty ${it.quantity}` }),
        ]),
        el('span', { style: 'margin-left:auto', text: formatMoney(it.lineTotal) }),
      ])
    )
  );

  const totals = el('div', { class: 'stack', style: 'margin-top:1rem' }, [
    line('Subtotal', formatMoney(order.subtotal)),
    order.discountTotal && order.discountTotal.amount ? line('Discount', formatMoney(order.discountTotal)) : null,
    line('Delivery', formatMoney(order.deliveryFee)),
    el('div', { class: 'summary-line summary-line--total' }, [el('span', { text: 'Total' }), el('span', { text: formatMoney(order.total) })]),
  ]);

  const addr = order.deliveryAddress || {};
  const body = el('div', {}, [
    items,
    totals,
    el('div', { style: 'margin-top:1rem' }, [
      el('h3', { style: 'font-size:var(--step-0)', text: 'Delivery to' }),
      el('p', { class: 'text-muted' }, [
        document.createTextNode(addr.recipientName || ''),
        el('br'),
        document.createTextNode(`${addr.town || ''}${addr.town ? ', ' : ''}${addr.county || ''}`),
        addr.phone ? el('br') : null,
        addr.phone ? document.createTextNode(addr.phone) : null,
        addr.instructions ? el('br') : null,
        addr.instructions ? document.createTextNode(addr.instructions) : null,
      ]),
      order.deliveryMethod ? el('p', { class: 'text-muted', text: `${order.deliveryMethod.label} · ${order.deliveryMethod.eta}` }) : null,
      el('p', {}, [el('strong', { text: paymentStateLabel(order) })]),
    ]),
  ]);

  if (collapsible) {
    return el('details', { class: 'card' }, [el('summary', { style: 'cursor:pointer;font-weight:600', text: 'Order summary' }), body]);
  }
  return el('div', { class: 'card' }, [el('h2', { style: 'font-size:var(--step-1)', text: 'Order summary' }), body]);
}

function line(label, value) {
  return el('div', { class: 'summary-line' }, [el('span', { text: label }), el('span', { text: value })]);
}

export function agreementReceiptLine(order, docs) {
  const acc = order.agreementAcceptance;
  if (!acc) return null;
  const termsHref = docs && docs.termsOfSale ? docs.termsOfSale.href : `/legal.html?doc=terms-of-sale&v=${acc.termsOfSaleVersion}`;
  const returnsHref = docs && docs.returnsPolicy ? docs.returnsPolicy.href : `/legal.html?doc=returns&v=${acc.returnsPolicyVersion}`;
  return el('p', { class: 'hint' }, [
    document.createTextNode(
      `You accepted the Terms of Sale (v${acc.termsOfSaleVersion}) and Returns Policy (v${acc.returnsPolicyVersion}) on ${formatDateTime(acc.acceptedAt)}. `
    ),
    el('a', { href: normalizeLegalHref(termsHref, 'terms-of-sale', acc.termsOfSaleVersion), text: 'View Terms' }),
    document.createTextNode(' · '),
    el('a', { href: normalizeLegalHref(returnsHref, 'returns', acc.returnsPolicyVersion), text: 'View Returns Policy' }),
  ]);
}

function normalizeLegalHref(href, doc, version) {
  if (href && href.startsWith('/legal.html')) return href;
  return `/legal.html?doc=${doc}&v=${version}`;
}
