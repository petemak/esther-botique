import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { CONFIG } from '../../config.js';
import { ensureAbsoluteCanonical } from '../../util.js';
import { logoMonogram } from '../../logo.js';
import { passwordChangeForm } from './_password.js';

/** [key, label, href, ownerOnly?] — order is the sidebar order. */
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
  ['team', 'Team', '/admin/team.html', true],
  ['guide', 'Guide', '/admin/guide.html'],
];

export function adminView() {
  return $('#view');
}

/**
 * Guards the admin session (server re-checks role + status on every /api/admin/* call
 * regardless), renders the chrome, and returns { user, role, content, setTitle }.
 *
 * Two hard gates run before any page content:
 *  - not signed in / disabled  -> bounce to the sign-in screen
 *  - mustChangePassword === true -> full-page forced change-password step, no nav,
 *    no other admin view reachable until it succeeds (design-spec page 44).
 */
export async function adminShell(activeKey, title) {
  ensureAbsoluteCanonical();
  const root = adminView();
  let user;
  let mustChangePassword;
  try {
    const res = await api.admin.me();
    user = res && res.user;
    mustChangePassword = !!(res && res.mustChangePassword);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/admin/signin.html?next=${next}`);
      return null;
    }
    clear(root).append(el('p', { class: 'alert alert--error', text: 'Could not verify your admin session.' }));
    return null;
  }

  if (mustChangePassword) {
    renderForcedPasswordChange(root);
    return null;
  }

  const role = (user && user.role) || 'staff';
  const content = el('div', { id: 'admin-content' });
  const heading = el('h1', { text: title || '' });

  const navItems = NAV.filter(([, , , ownerOnly]) => !ownerOnly || role === 'owner');

  clear(root).append(
    el('div', { class: 'admin-shell' }, [
      el('aside', { class: 'admin-sidebar' }, [
        el('a', { class: 'brand', href: '/admin/', 'aria-label': `${CONFIG.brand} Admin — home`, style: 'color:var(--color-bg)' }, [
          logoMonogram('brand__mark'),
          el('span', { class: 'brand__word', text: 'Esther Admin', 'aria-hidden': 'true' }),
        ]),
        el('nav', { 'aria-label': 'Admin' }, [
          el('ul', {}, navItems.map(([key, label, href]) =>
            el('li', {}, [el('a', { href, text: label, 'aria-current': key === activeKey ? 'page' : null })])
          )),
        ]),
        el('p', { style: 'margin-top:2rem;font-size:var(--step--1)' }, [
          el('a', { href: '/', target: '_blank', rel: 'noopener', style: 'color:var(--color-bg)', text: 'View storefront ↗' }),
        ]),
        el('div', { class: 'admin-sidebar__account' }, [
          el('a', {
            class: 'btn btn--small btn--secondary',
            style: 'border-color:var(--color-bg);color:var(--color-bg)',
            href: '/admin/account.html',
            'aria-current': activeKey === 'account' ? 'page' : null,
            text: 'Account',
          }),
          el('button', {
            class: 'btn btn--small btn--secondary',
            style: 'border-color:var(--color-bg);color:var(--color-bg)',
            text: 'Sign out',
            on: {
              click: async () => {
                try { await api.admin.logout(); } catch { /* ignore */ }
                window.location.href = '/admin/signin.html';
              },
            },
          }),
        ]),
      ]),
      el('main', { class: 'admin-main' }, [
        el('div', { class: 'admin-topbar' }, [heading, el('span', { class: 'hint', text: user ? user.name || user.email : '' })]),
        content,
      ]),
    ])
  );

  return {
    user,
    role,
    content,
    setTitle: (t) => {
      heading.textContent = t;
      document.title = `${t} — ${CONFIG.brand} Admin`;
    },
  };
}

/**
 * Forced first-login / post-reset password change. Full page: no sidebar, no nav,
 * nothing else reachable. On success we reload the current URL — `me()` then reports
 * `mustChangePassword: false` and the page they were headed to renders normally
 * (default: the dashboard, since sign-in sends them to /admin/).
 */
function renderForcedPasswordChange(root) {
  document.title = `Set your password — ${CONFIG.brand} Admin`;
  clear(root).append(
    el('div', { class: 'admin-forced' }, [
      el('div', { class: 'admin-forced__card stack' }, [
        el('p', { class: 'eyebrow', text: `${CONFIG.brand} Admin` }),
        el('h1', { text: 'Set a password only you know' }),
        el('p', { text: 'Before you start — the password you were given is temporary. Choose your own now. Nothing else in the admin opens until this is done.' }),
        passwordChangeForm({
          currentLabel: 'Temporary password',
          submitLabel: 'Set my password',
          onSuccess: () => window.location.reload(),
        }),
      ]),
    ])
  );
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
