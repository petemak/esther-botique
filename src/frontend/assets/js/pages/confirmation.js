import { api, ApiError } from '../api.js';
import { el, clear } from '../dom.js';
import { errorState } from '../components.js';
import { getParam, setPageMeta } from '../util.js';
import { bootStorefront, view, showSpinner } from './_boot.js';
import { orderTimeline, orderSummary, paymentStateLabel, agreementReceiptLine } from '../order-view.js';
import { currentUser } from '../auth.js';

bootStorefront({ active: '' });
setPageMeta({ noindex: true });

const orderNumber = getParam('order');
const trackingToken = getParam('trackingToken') || (orderNumber && sessionStorage.getItem(`hoe:tt:${orderNumber}`)) || undefined;

if (!orderNumber) {
  clear(view());
  view().append(errorState({ message: 'No order was specified.' }));
} else {
  load();
}

async function load() {
  showSpinner();
  try {
    const [order, user] = await Promise.all([
      api.getOrder(orderNumber, { trackingToken }),
      currentUser(),
    ]);
    renderConfirmation(order, user);
  } catch (err) {
    clear(view());
    if (err instanceof ApiError && err.status === 404) {
      view().append(
        errorState({ message: 'We could not find that order. If you have just paid, wait a moment and refresh, or track it with your order number and email.' })
      );
      view().append(el('a', { class: 'btn btn--secondary', href: '/order-tracking.html', text: 'Track your order' }));
    } else {
      view().append(errorState(err, load));
    }
  }
}

function renderConfirmation(order, user) {
  const root = view();
  clear(root);
  const firstName = (order.customer && order.customer.firstName) || '';

  root.append(
    el('div', { class: 'stack-l' }, [
      el('header', { class: 'stack' }, [
        el('p', { class: 'eyebrow', text: 'Order confirmed' }),
        el('h1', { text: firstName ? `Thank you, ${firstName} — your order is in` : 'Your order is in' }),
        el('p', { class: 'lede', html: `Order <strong>${order.orderNumber}</strong> · ${paymentStateLabel(order)}` }),
      ]),

      el('section', { class: 'card', 'aria-labelledby': 'next-h' }, [
        el('h2', { id: 'next-h', style: 'font-size:var(--step-1)', text: 'What happens next' }),
        el('ol', { class: 'stack', style: 'padding-left:1.2rem' }, [
          el('li', { text: 'We confirm your order and pack it with care.' }),
          el('li', { text: 'We dispatch it and text you a tracking link.' }),
          el('li', {
            text: `Delivery to your door${order.deliveryMethod ? ` — ${order.deliveryMethod.eta}` : ''}.`,
          }),
        ]),
        order.payment && order.payment.method === 'pay_on_delivery'
          ? el('p', { html: `<strong>To pay on delivery — ${formatTotal(order)}.</strong> Have cash or M-Pesa ready for the rider.` })
          : null,
      ]),

      orderSummary(order),

      agreementReceiptLine(order),

      el('div', { style: 'display:flex;gap:.75rem;flex-wrap:wrap' }, [
        el('a', { class: 'btn', href: trackingHref(order), text: 'Track this order' }),
        !user
          ? el('a', {
              class: 'btn btn--secondary',
              href: `/account/signin.html?tab=register&next=${encodeURIComponent('/account/orders.html')}&email=${encodeURIComponent((order.customer && order.customer.email) || '')}`,
              text: 'Create an account to track future orders',
            })
          : null,
        el('a', { class: 'btn--ghost', href: '/new-in.html', text: 'Continue shopping' }),
      ]),

      el('p', { class: 'hint', text: 'We have also emailed your confirmation with a tracking link.' }),
    ])
  );

  root.append(orderTimeline(order));
}

function trackingHref(order) {
  const tt = trackingToken ? `&trackingToken=${encodeURIComponent(trackingToken)}` : '';
  return `/order-tracking.html?order=${encodeURIComponent(order.orderNumber)}${tt}`;
}

function formatTotal(order) {
  return order.total ? `${order.total.currency} ${Number(order.total.amount).toLocaleString('en-KE')}` : '';
}
