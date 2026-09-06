import { api } from '../../api.js';
import { el, clear, imageEl } from '../../dom.js';
import { pagination, emptyState, errorState } from '../../components.js';
import { formatMoney } from '../../money.js';
import { formatDate, getParam } from '../../util.js';
import { accountShell } from './_shell.js';

start();

async function start() {
  const shell = await accountShell('orders');
  if (!shell) return;
  const { content } = shell;
  const page = parseInt(getParam('page') || '1', 10);
  content.append(el('div', { class: 'spinner' }));

  try {
    const data = await api.getAccountOrders({ page, pageSize: 10 });
    clear(content);
    content.append(el('h2', { text: 'Orders', style: 'font-size:var(--step-2)' }));

    if (!data.items || !data.items.length) {
      content.append(emptyState({ title: 'No orders yet', message: 'Your orders will appear here once you have bought something.', actions: [el('a', { class: 'btn', href: '/new-in.html', text: 'Shop New In' })] }));
      return;
    }

    const list = el('div', { class: 'stack' });
    data.items.forEach((o) => {
      list.append(
        el('a', { class: 'order-row', href: `/account/order.html?order=${encodeURIComponent(o.orderNumber)}` }, [
          el('div', { class: 'order-row__thumbs' }, (o.thumbnails || []).slice(0, 3).map((src) => imageEl({ thumbUrl: src, alt: '' }, { altFallback: 'Order item' }))),
          el('div', {}, [
            el('strong', { text: o.orderNumber }),
            el('br'),
            el('span', { class: 'text-muted', text: `${formatDate(o.placedAt)} · ${o.itemCount} item${o.itemCount === 1 ? '' : 's'} · ${formatMoney(o.total)}` }),
          ]),
          el('span', { class: `status-badge status-badge--${o.status}`, text: o.status.replace(/_/g, ' ') }),
        ])
      );
    });
    content.append(list);
    content.append(pagination(data.page || 1, data.totalPages || 1, (p) => `/account/orders.html?page=${p}`));
  } catch (err) {
    clear(content);
    content.append(errorState(err, start));
  }
}
