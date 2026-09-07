import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { CONFIG } from '../../config.js';
import { ensureAbsoluteCanonical } from '../../util.js';
import { logoMonogram } from '../../logo.js';

const NAV = [
  ['dashboard', 'Dashboard', '/admin/'],
  ['products', 'Products', '/admin/products.html'],
  ['inventory', 'Inventory', '/admin/inventory.html'],
  ['orders', 'Orders', '/admin/orders.html'],
  ['reviews', 'Reviews', '/admin/reviews.html'],
  ['contacts', 'Contact messages', '/admin/contacts.html'],
  ['collections', 'Collections & categories', '/admin/collections.html'],
  ['subscribers', 'Subscribers & broadcasts', '/admin/subscribers.html'],
  ['content', 'Homepage content', '/admin/content.html'],
  ['legal', 'Legal documents', '/admin/legal.html'],
  ['discounts', 'Discount codes', '/admin/discounts.html'],
];

export function adminView() {
  return $('#view');
}

/**
 * Guards the admin session (server re-checks role on every /api/admin/* call regardless),
 * renders the chrome, and returns { user, content, setTitle }.
 */
export async function adminShell(activeKey, title) {
  ensureAbsoluteCanonical();
  const root = adminView();
  let user;
  try {
    const res = await api.admin.me();
    user = res && res.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/admin/signin.html?next=${next}`);
      return null;
    }
    clear(root).append(el('p', { class: 'alert alert--error', text: 'Could not verify your admin session.' }));
    return null;
  }

  const content = el('div', { id: 'admin-content' });
  const heading = el('h1', { text: title || '' });

  clear(root).append(
    el('div', { class: 'admin-shell' }, [
      el('aside', { class: 'admin-sidebar' }, [
        el('a', { class: 'brand', href: '/admin/', 'aria-label': `${CONFIG.brand} Admin — home`, style: 'color:var(--color-bg)' }, [
          logoMonogram('brand__mark'),
          el('span', { class: 'brand__word', text: 'Esther Admin', 'aria-hidden': 'true' }),
        ]),
        el('nav', { 'aria-label': 'Admin' }, [
          el('ul', {}, NAV.map(([key, label, href]) =>
            el('li', {}, [el('a', { href, text: label, 'aria-current': key === activeKey ? 'page' : null })])
          )),
        ]),
        el('p', { style: 'margin-top:2rem;font-size:var(--step--1)' }, [
          el('a', { href: '/', target: '_blank', rel: 'noopener', style: 'color:var(--color-bg)', text: 'View storefront ↗' }),
        ]),
        el('button', {
          class: 'btn btn--small btn--secondary',
          style: 'margin-top:1rem;border-color:var(--color-bg);color:var(--color-bg)',
          text: 'Sign out',
          on: {
            click: async () => {
              try { await api.admin.logout(); } catch { /* ignore */ }
              window.location.href = '/admin/signin.html';
            },
          },
        }),
      ]),
      el('main', { class: 'admin-main' }, [
        el('div', { class: 'admin-topbar' }, [heading, el('span', { class: 'hint', text: user ? user.name || user.email : '' })]),
        content,
      ]),
    ])
  );

  return {
    user,
    content,
    setTitle: (t) => {
      heading.textContent = t;
      document.title = `${t} — ${CONFIG.brand} Admin`;
    },
  };
}

/* ---- shared admin helpers ---- */

export function adminTable(columns, rows) {
  return el('div', { class: 'admin-table-wrap' }, [
    el('table', { class: 'admin-table' }, [
      el('thead', {}, [el('tr', {}, columns.map((c) => el('th', { scope: 'col', text: c })))]),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, [el('td', { colspan: columns.length, text: 'Nothing to show.' })])]),
    ]),
  ]);
}

export function pager(page, totalPages, onGo) {
  if (!totalPages || totalPages <= 1) return el('span');
  return el('div', { class: 'pagination', style: 'justify-content:flex-start;margin-top:1rem' }, [
    el('button', { class: 'btn btn--small btn--secondary', disabled: page <= 1, text: 'Previous', on: { click: () => onGo(page - 1) } }),
    el('span', { text: `Page ${page} of ${totalPages}`, style: 'border:0' }),
    el('button', { class: 'btn btn--small btn--secondary', disabled: page >= totalPages, text: 'Next', on: { click: () => onGo(page + 1) } }),
  ]);
}

export function money(m) {
  if (!m) return '—';
  return `${m.currency || 'KES'} ${Number(m.amount).toLocaleString('en-KE')}`;
}
