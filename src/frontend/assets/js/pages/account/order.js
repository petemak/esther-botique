import { api, ApiError } from '../../api.js';
import { el, clear } from '../../dom.js';
import { errorState, emptyState } from '../../components.js';
import { getParam } from '../../util.js';
import { accountShell } from './_shell.js';
import { orderTimeline, orderSummary, paymentStateLabel, agreementReceiptLine } from '../../order-view.js';
import { toast } from '../../toast.js';

start();

async function start() {
  const shell = await accountShell('orders');
  if (!shell) return;
  const { content } = shell;
  const orderNumber = getParam('order');
  if (!orderNumber) {
    clear(content).append(emptyState({ title: 'No order specified', message: 'Pick an order from your list.', actions: [el('a', { class: 'btn', href: '/account/orders.html', text: 'Your orders' })] }));
    return;
  }
  content.append(el('div', { class: 'spinner' }));

  try {
    const order = await api.getAccountOrder(orderNumber);
    render(content, order);
  } catch (err) {
    clear(content);
    if (err instanceof ApiError && err.status === 404) {
      content.append(emptyState({ title: 'Order not found', message: 'We could not find that order on your account.', actions: [el('a', { class: 'btn', href: '/account/orders.html', text: 'Your orders' })] }));
    } else {
      content.append(errorState(err, start));
    }
  }
}

function render(content, order) {
  clear(content);
  content.append(
    el('div', { class: 'stack-l' }, [
      el('a', { href: '/account/orders.html', class: 'btn--ghost', text: '← All orders' }),
      el('header', { class: 'stack' }, [
        el('h2', { style: 'font-size:var(--step-2)', text: order.orderNumber }),
        el('p', { class: 'lede', text: paymentStateLabel(order) }),
      ]),
      orderTimeline(order),
      orderSummary(order),
      agreementReceiptLine(order, order.agreementDocuments),
      el('div', { style: 'display:flex;gap:.75rem;flex-wrap:wrap' }, [
        el('button', { class: 'btn btn--secondary', text: 'Buy these again', on: { click: (e) => reorder(e, order.orderNumber) } }),
        el('a', { class: 'btn--ghost', href: `/contact.html?topic=return&order=${encodeURIComponent(order.orderNumber)}`, text: 'Start a return' }),
        el('a', { class: 'btn--ghost', href: `/order-tracking.html?order=${encodeURIComponent(order.orderNumber)}`, text: 'Tracking page' }),
      ]),
    ])
  );
}

async function reorder(e, orderNumber) {
  e.target.classList.add('is-loading');
  try {
    const res = await api.reorder(orderNumber);
    const unavailable = res.unavailable || [];
    if (unavailable.length) {
      toast(`${unavailable.length} item${unavailable.length === 1 ? '' : 's'} could not be added (out of stock).`, 'info');
    }
    toast('Added to your cart.', 'success');
    window.location.href = '/cart.html';
  } catch (err) {
    e.target.classList.remove('is-loading');
    toast((err && err.message) || 'Could not add those items.', 'error');
  }
}
