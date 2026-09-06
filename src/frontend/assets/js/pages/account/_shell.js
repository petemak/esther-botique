import { el } from '../../dom.js';
import { setPageMeta } from '../../util.js';
import { bootStorefront, render } from '../_boot.js';
import { guardAccountPage, logout } from '../../auth.js';

const NAV = [
  ['overview', 'Overview', '/account/'],
  ['orders', 'Orders', '/account/orders.html'],
  ['addresses', 'Addresses', '/account/addresses.html'],
  ['profile', 'Profile & notifications', '/account/profile.html'],
  ['wishlist', 'Wishlist', '/account/wishlist.html'],
];

/** Boots chrome, guards auth, renders the account layout. Returns { user, content } or null. */
export async function accountShell(activeKey) {
  bootStorefront({ active: '' });
  setPageMeta({ noindex: true });
  const user = await guardAccountPage();
  if (!user) return null;

  const content = el('div', { id: 'account-content' });
  render(
    el('div', {}, [
      el('h1', { text: 'Your account' }),
      el('div', { class: 'account-layout', style: 'margin-top:1.5rem' }, [
        el('nav', { class: 'account-nav', 'aria-label': 'Account' }, [
          el('p', { class: 'eyebrow', text: `Hi, ${user.firstName || 'there'}` }),
          el('ul', {}, [
            ...NAV.map(([key, label, href]) =>
              el('li', {}, [el('a', { href, text: label, 'aria-current': key === activeKey ? 'page' : null })])
            ),
            el('li', {}, [
              el('button', {
                class: 'btn--ghost',
                style: 'background:none;border:0;text-decoration:underline;cursor:pointer;padding:.5rem',
                text: 'Sign out',
                on: {
                  click: async () => {
                    await logout();
                    window.location.href = '/';
                  },
                },
              }),
            ]),
          ]),
        ]),
        content,
      ]),
    ])
  );
  return { user, content };
}
