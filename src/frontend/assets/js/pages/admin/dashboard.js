import { api } from '../../api.js';
import { el, clear } from '../../dom.js';
import { errorState } from '../../components.js';
import { adminShell, money } from './_shell.js';

start();

async function start() {
  const shell = await adminShell('dashboard', 'Dashboard');
  if (!shell) return;
  const { content } = shell;
  content.append(el('div', { class: 'spinner' }));

  try {
    const d = await api.admin.dashboard();
    clear(content);

    content.append(
      el('section', { 'aria-labelledby': 'today-h' }, [
        el('h2', { id: 'today-h', style: 'font-size:var(--step-1)', text: 'Today' }),
        el('div', { class: 'stat-grid', style: 'margin-bottom:1.5rem' }, [
          stat(d.orders.newToday, 'New orders today', '/admin/orders.html'),
          stat(d.orders.awaitingDispatch, 'Awaiting dispatch', '/admin/orders.html?status=confirmed'),
          stat(d.orders.payOnDeliveryUnpaid, 'Pay-on-delivery unpaid', '/admin/orders.html?paymentMethod=pay_on_delivery&paymentState=awaiting_delivery'),
          stat(money(d.revenueToday), 'Revenue today'),
        ]),
      ]),
      el('section', { 'aria-labelledby': 'attn-h' }, [
        el('h2', { id: 'attn-h', style: 'font-size:var(--step-1)', text: 'Needs attention' }),
        el('div', { class: 'stat-grid' }, [
          stat(d.attention.lowStockVariants, 'Low-stock variants', '/admin/inventory.html?stock=low', true),
          stat(d.attention.outOfStockPublished, 'Out of stock (published)', '/admin/inventory.html?stock=out', true),
          stat(d.attention.reviewsPending, 'Reviews pending', '/admin/reviews.html?status=pending', true),
          stat(d.attention.contactUnhandled, 'Contact messages unhandled', null, true),
        ]),
        el('p', { class: 'hint', style: 'margin-top:.5rem', text: 'Contact messages are handled by email for now — this is a count only.' }),
      ]),
      el('section', { style: 'margin-top:1.5rem' }, [
        el('h2', { style: 'font-size:var(--step-1)', text: 'Quick actions' }),
        el('div', { style: 'display:flex;gap:.75rem;flex-wrap:wrap' }, [
          el('a', { class: 'btn', href: '/admin/product-edit.html', text: 'Add product' }),
          el('a', { class: 'btn btn--secondary', href: '/admin/orders.html', text: 'View orders' }),
          el('a', { class: 'btn btn--secondary', href: '/admin/subscribers.html#broadcast', text: 'Send a broadcast' }),
        ]),
      ])
    );
  } catch (err) {
    clear(content).append(errorState(err, start));
  }
}

function stat(value, label, href, alert) {
  const inner = [el('div', { class: 'stat__value', text: String(value) }), el('div', { class: 'stat__label', text: label })];
  if (href) return el('a', { class: `stat ${alert ? 'stat--alert' : ''}`, href, style: 'text-decoration:none;color:inherit;display:block' }, inner);
  return el('div', { class: `stat ${alert && Number(value) > 0 ? 'stat--alert' : ''}` }, inner);
}
