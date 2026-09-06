import { api } from '../../api.js';
import { el, clear, imageEl } from '../../dom.js';
import { formatMoney } from '../../money.js';
import { formatDate } from '../../util.js';
import { accountShell } from './_shell.js';

start();

async function start() {
  const shell = await accountShell('overview');
  if (!shell) return;
  const { content } = shell;

  content.append(el('div', { class: 'spinner' }));

  const [orders, addresses, wishlist] = await Promise.all([
    api.getAccountOrders({ page: 1, pageSize: 3 }).catch(() => ({ items: [] })),
    api.getAddresses().catch(() => ({ items: [] })),
    api.getWishlist().catch(() => ({ items: [] })),
  ]);

  clear(content);
  const latest = (orders.items || [])[0];

  content.append(
    el('div', { class: 'grid', style: 'grid-template-columns:1fr;gap:1rem' }, [
      el('div', { class: 'card' }, [
        el('h2', { style: 'font-size:var(--step-1)', text: 'Latest order' }),
        latest
          ? el('div', { class: 'stack' }, [
              el('p', {}, [el('strong', { text: latest.orderNumber }), document.createTextNode(` · ${formatDate(latest.placedAt)}`)]),
              el('p', {}, [el('span', { class: `status-badge status-badge--${latest.status}`, text: latest.status.replace(/_/g, ' ') })]),
              el('p', { text: `${latest.itemCount} item${latest.itemCount === 1 ? '' : 's'} · ${formatMoney(latest.total)}` }),
              el('div', { class: 'order-row__thumbs' }, (latest.thumbnails || []).slice(0, 4).map((src) => imageEl({ thumbUrl: src, alt: '' }, { altFallback: 'Order item' }))),
              el('a', { class: 'btn btn--secondary btn--small', href: `/account/order.html?order=${encodeURIComponent(latest.orderNumber)}`, text: 'View order' }),
            ])
          : el('p', { class: 'text-muted', text: 'No orders yet. When you buy something it will show up here.' }),
      ]),
      quickCard('Saved addresses', `${(addresses.items || []).length} saved`, '/account/addresses.html'),
      quickCard('Wishlist', `${(wishlist.items || []).length} saved`, '/account/wishlist.html'),
      quickCard('Notifications', 'Manage what we email you', '/account/profile.html'),
    ])
  );
}

function quickCard(title, sub, href) {
  return el('a', { class: 'card', href, style: 'text-decoration:none;color:inherit;display:block' }, [
    el('h2', { style: 'font-size:var(--step-1)', text: title }),
    el('p', { class: 'text-muted', text: sub }),
  ]);
}
