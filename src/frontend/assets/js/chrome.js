/**
 * Shared storefront chrome: announcement bar, header/nav, mobile nav, search panel,
 * cart drawer wiring, footer + newsletter. Imported by every storefront page.
 */
import { CONFIG, CATEGORIES } from './config.js';
import { api } from './api.js';
import { el, $, clear, icon, imageEl, escapeHtml } from './dom.js';
import { debounce } from './util.js';
import { toast } from './toast.js';
import { currentUser } from './auth.js';
import { subscribeCart, cartCount, loadCart, mountCartDrawer, openCartDrawer } from './cart.js';
import { brandLink, logoLockup } from './logo.js';
import { copy } from './copy.js';

const NAV = [
  { href: '/new-in.html', label: 'New In' },
  ...CATEGORIES.map((c) => ({ href: `/${c.slug}.html`, label: c.label })),
  { href: '/sale.html', label: 'Sale' },
  { href: '/journal.html', label: 'Journal' },
];

export function initChrome({ active, transparentHeader } = {}) {
  ensureSkipLink();
  const header = buildHeader(active);
  const main = $('#main');
  document.body.insertBefore(header, document.body.firstChild);
  if (main) main.setAttribute('tabindex', '-1');

  if (transparentHeader) {
    document.body.classList.add('has-transparent-header');
    header.classList.add('site-header--transparent');
  }

  document.body.appendChild(buildFooter());

  mountCartDrawer();
  subscribeCart(updateCartCount);
  loadCart();

  hydrateAccountLink();
  loadAnnouncement();
}

/**
 * Home only: watch a sentinel (a zero-height marker at the TOP of the hero content,
 * before the eyebrow) and toggle the header between its transparent-over-photo state
 * and the solid state. An IntersectionObserver with a top rootMargin equal to the
 * header height fires exactly when the hero content's top edge reaches the header —
 * so the eyebrow/headline/CTA always scroll under a solid header, never the
 * transparent one. No scroll-position magic numbers.
 */
export function armHeaderScrollState(sentinel) {
  const header = $('.site-header');
  if (!header || !sentinel || typeof IntersectionObserver === 'undefined') return;

  const arm = () => {
    const headerH = Math.max(56, Math.round(header.getBoundingClientRect().height));
    const obs = new IntersectionObserver(
      ([entry]) => {
        header.classList.toggle('is-solid', !entry.isIntersecting);
      },
      { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 }
    );
    obs.observe(sentinel);
  };
  // let the (async) announcement bar settle into the header height first
  requestAnimationFrame(() => requestAnimationFrame(arm));
}

function ensureSkipLink() {
  if ($('.skip-link')) return;
  const link = el('a', { class: 'skip-link', href: '#main', text: 'Skip to content' });
  document.body.insertBefore(link, document.body.firstChild);
}

function buildHeader(active) {
  const header = el('header', { class: 'site-header' });

  const announcement = el('div', { class: 'announcement', id: 'announcement', hidden: true });
  header.appendChild(announcement);

  const navList = el(
    'ul',
    {},
    NAV.map((item) =>
      el('li', {}, [
        el('a', {
          href: item.href,
          text: item.label,
          'aria-current': active === item.label ? 'page' : null,
        }),
      ])
    )
  );

  const menuToggle = el('button', {
    class: 'icon-btn menu-toggle',
    'aria-expanded': 'false',
    'aria-controls': 'mobile-nav',
    'aria-label': 'Open menu',
    on: { click: toggleMobileNav },
  });
  menuToggle.appendChild(icon('menu'));

  const searchToggle = el('button', {
    class: 'icon-btn',
    'aria-expanded': 'false',
    'aria-controls': 'search-panel',
    'aria-label': 'Search',
    on: { click: toggleSearch },
  });
  searchToggle.appendChild(icon('search'));

  const accountLink = el('a', { class: 'icon-btn', id: 'account-link', href: '/account/', 'aria-label': 'Account' });
  accountLink.appendChild(icon('user'));

  const wishlistLink = el('a', { class: 'icon-btn', href: '/account/wishlist.html', 'aria-label': 'Wishlist' });
  wishlistLink.appendChild(icon('heart'));

  const cartBtn = el('button', {
    class: 'icon-btn',
    id: 'cart-button',
    'aria-label': 'Open cart',
    'aria-haspopup': 'dialog',
    on: { click: openCartDrawer },
  });
  cartBtn.appendChild(icon('bag'));
  cartBtn.appendChild(el('span', { class: 'cart-count', id: 'cart-count', hidden: true, 'aria-hidden': 'true' }));

  const bar = el('div', { class: 'site-header__bar wrap' }, [
    el('div', { style: 'display:flex;align-items:center;gap:.25rem' }, [
      menuToggle,
      brandLink('/'),
    ]),
    el('nav', { class: 'primary-nav', 'aria-label': 'Primary' }, [navList]),
    el('div', { class: 'header-actions' }, [searchToggle, wishlistLink, accountLink, cartBtn]),
  ]);
  header.appendChild(bar);

  header.appendChild(buildSearchPanel());
  header.appendChild(buildMobileNav(active));
  return header;
}

function buildMobileNav(active) {
  const overlay = el('div', {
    class: 'drawer__overlay',
    id: 'mobile-nav-overlay',
    on: { click: () => toggleMobileNav(false) },
  });
  const nav = el('nav', { class: 'mobile-nav', id: 'mobile-nav', 'aria-label': 'Mobile', 'aria-hidden': 'true' }, [
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem' }, [
      el('span', { class: 'eyebrow', text: 'Menu' }),
      el('button', { class: 'modal__close', 'aria-label': 'Close menu', text: '×', on: { click: () => toggleMobileNav(false) } }),
    ]),
    el(
      'ul',
      {},
      NAV.map((item) =>
        el('li', {}, [el('a', { href: item.href, text: item.label, 'aria-current': active === item.label ? 'page' : null })])
      )
    ),
    el('ul', { style: 'margin-top:1rem' }, [
      el('li', {}, [el('a', { href: '/account/', text: 'Account' })]),
      el('li', {}, [el('a', { href: '/account/wishlist.html', text: 'Wishlist' })]),
      el('li', {}, [el('a', { href: '/order-tracking.html', text: 'Track order' })]),
      el('li', {}, [el('a', { href: '/help.html', text: 'Help & FAQ' })]),
    ]),
  ]);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) toggleMobileNav(false);
  });
  const frag = document.createDocumentFragment();
  frag.append(overlay, nav);
  return frag;
}

function toggleMobileNav(force) {
  const nav = $('#mobile-nav');
  const overlay = $('#mobile-nav-overlay');
  const toggle = $('.menu-toggle');
  const open = typeof force === 'boolean' ? force : !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', open);
  overlay.classList.toggle('is-open', open);
  nav.setAttribute('aria-hidden', open ? 'false' : 'true');
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) nav.querySelector('a').focus();
}

function buildSearchPanel() {
  const input = el('input', {
    class: 'input',
    type: 'search',
    name: 'q',
    id: 'site-search-input',
    'aria-label': 'Search products',
    placeholder: 'Search for linen, leather, watches…',
    autocomplete: 'off',
  });
  const results = el('div', { class: 'search-suggestions', id: 'search-suggestions', role: 'listbox', hidden: true });

  const form = el('form', {
    role: 'search',
    action: '/search.html',
    method: 'get',
    on: {
      submit: (e) => {
        if (!input.value.trim()) e.preventDefault();
      },
    },
  }, [input, el('button', { class: 'btn', type: 'submit', text: 'Search' })]);

  input.addEventListener(
    'input',
    debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        results.hidden = true;
        clear(results);
        return;
      }
      try {
        const data = await api.getSearchSuggestions(q);
        renderSuggestions(results, data, q);
      } catch {
        results.hidden = true;
      }
    }, 220)
  );

  const panel = el('div', { class: 'search-panel', id: 'search-panel', hidden: true }, [form, results]);
  return panel;
}

function renderSuggestions(container, data, q) {
  clear(container);
  const terms = data.terms || [];
  const products = data.products || [];
  const cats = data.categories || [];
  if (!terms.length && !products.length && !cats.length) {
    container.hidden = true;
    return;
  }
  if (terms.length) {
    container.append(
      el('p', { class: 'eyebrow', text: 'Suggestions' }),
      el('ul', {}, terms.map((t) => el('li', {}, [el('a', { href: `/search.html?q=${encodeURIComponent(t)}`, text: t })])))
    );
  }
  if (products.length) {
    container.append(
      el('p', { class: 'eyebrow', text: 'Products', style: 'margin-top:.5rem' }),
      el(
        'ul',
        {},
        products.map((p) =>
          el('li', {}, [
            el('a', { href: `/product.html?slug=${encodeURIComponent(p.slug)}` }, [
              imageEl({ thumbUrl: p.thumbUrl, alt: p.alt }, { altFallback: p.name }),
              el('span', {}, [el('strong', { text: p.name }), el('br'), el('span', { class: 'text-muted', text: money(p.price) })]),
            ]),
          ])
        )
      )
    );
  }
  if (cats.length) {
    container.append(
      el('p', { class: 'eyebrow', text: 'Categories', style: 'margin-top:.5rem' }),
      el('ul', {}, cats.map((c) => el('li', {}, [el('a', { href: `/${c.slug}.html`, text: c.label })])))
    );
  }
  container.append(
    el('a', { href: `/search.html?q=${encodeURIComponent(q)}`, text: `See all results for “${q}”`, style: 'display:block;padding:.5rem' })
  );
  container.hidden = false;
}

function money(m) {
  if (!m) return '';
  return `${m.currency || 'KES'} ${Number(m.amount).toLocaleString('en-KE')}`;
}

function toggleSearch() {
  const panel = $('#search-panel');
  const toggle = $('.header-actions .icon-btn');
  const open = panel.hidden;
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) $('#site-search-input').focus();
}

function updateCartCount(cart) {
  const badge = $('#cart-count');
  if (!badge) return;
  const n = cartCount(cart);
  badge.textContent = String(n);
  badge.hidden = n === 0;
  const btn = $('#cart-button');
  if (btn) btn.setAttribute('aria-label', n ? `Open cart, ${n} item${n === 1 ? '' : 's'}` : 'Open cart');
}

async function hydrateAccountLink() {
  const link = $('#account-link');
  if (!link) return;
  const user = await currentUser();
  if (user) {
    link.href = '/account/';
    link.setAttribute('aria-label', `Account: ${user.firstName || 'signed in'}`);
    link.setAttribute('title', `Signed in as ${user.firstName || user.email}`);
  } else {
    link.href = '/account/signin.html';
    link.setAttribute('aria-label', 'Sign in');
  }
}

async function loadAnnouncement() {
  const bar = $('#announcement');
  if (!bar) return;
  try {
    const data = await api.getHomeContent();
    const a = data && data.announcement;
    if (!a || !a.enabled || !a.text) return;
    if (sessionStorage.getItem('hoe:announcement:dismissed') === a.text) return;
    clear(bar);
    const inner = el('div', { class: 'announcement__inner wrap' }, [
      a.href
        ? el('a', { href: a.href, text: a.text })
        : el('span', { text: a.text }),
      el('button', {
        class: 'announcement__dismiss',
        'aria-label': 'Dismiss announcement',
        text: '×',
        on: {
          click: () => {
            bar.hidden = true;
            sessionStorage.setItem('hoe:announcement:dismissed', a.text);
          },
        },
      }),
    ]);
    bar.appendChild(inner);
    bar.hidden = false;
  } catch {
    /* announcement is non-critical */
  }
}

function buildFooter() {
  const footer = el('footer', { class: 'site-footer' });
  const col = (heading, links) =>
    el('div', { class: 'footer-col' }, [
      el('h2', { text: heading }),
      el('ul', {}, links.map(([label, href]) => el('li', {}, [el('a', { href, text: label })]))),
    ]);

  const newsletter = el('div', { class: 'footer-col' }, [
    el('h2', { text: 'New pieces, first' }),
    el('p', { class: 'hint', style: 'color:var(--color-bg)', text: 'Be first to know when new stock lands. Double opt-in, no spam.' }),
    buildNewsletterForm(),
  ]);

  footer.appendChild(
    el('div', { class: 'wrap' }, [
      el('a', { class: 'footer-brand', href: '/', 'aria-label': 'House of Esther — home' }, [logoLockup('footer-brand__mark')]),
      el('div', { class: 'footer-grid' }, [
        col('Shop', [
          ['New In', '/new-in.html'],
          ...CATEGORIES.map((c) => [c.label, `/${c.slug}.html`]),
          ['Sale', '/sale.html'],
        ]),
        col('Help', [
          ['Help & FAQ', '/help.html'],
          ['Delivery & Returns', '/delivery-returns.html'],
          ['Size Guide', '/size-guide.html'],
          ['Contact', '/contact.html'],
          ['Track your order', '/order-tracking.html'],
        ]),
        col('About', [
          ['Our Story', '/about.html'],
          ['The Journal', '/journal.html'],
          ['The boutique', '/about.html#boutique'],
        ]),
        col('Legal', [
          ['Terms of Sale', '/legal.html?doc=terms-of-sale'],
          ['Privacy Policy', '/legal.html?doc=privacy'],
          ['Returns & Refund Policy', '/legal.html?doc=returns'],
        ]),
        newsletter,
      ]),
      el('div', { class: 'footer-bottom' }, [
        el('span', { text: `© ${new Date().getFullYear()} ${CONFIG.brand}. Curated in Nairobi, delivered across Kenya.` }),
        el('span', { html: copy.footerPaymentHtml }),
        el('ul', { class: 'social-links', id: 'footer-social', hidden: true }),
      ]),
    ])
  );
  loadSocial();
  return footer;
}

function buildNewsletterForm() {
  const email = el('input', {
    class: 'input',
    type: 'email',
    name: 'email',
    required: true,
    'aria-label': 'Email address',
    placeholder: 'you@example.com',
    id: 'footer-newsletter-email',
  });
  const status = el('p', { class: 'hint', role: 'status', style: 'color:var(--color-bg)' });
  const form = el('form', {
    class: 'stack',
    novalidate: true,
    on: {
      submit: async (e) => {
        e.preventDefault();
        if (!email.checkValidity()) {
          status.textContent = 'Please enter a valid email address.';
          email.focus();
          return;
        }
        const btn = form.querySelector('button');
        btn.classList.add('is-loading');
        btn.disabled = true;
        try {
          const res = await api.subscribe({ email: email.value.trim(), source: 'footer', productId: null, variantId: null });
          status.textContent = res.message || 'Almost there — check your inbox to confirm.';
          form.reset();
        } catch (err) {
          status.textContent = err.message || 'Could not sign you up just now.';
        } finally {
          btn.classList.remove('is-loading');
          btn.disabled = false;
        }
      },
    },
  }, [
    el('div', { style: 'display:flex;gap:.5rem' }, [email, el('button', { class: 'btn btn--secondary', type: 'submit', text: 'Join' })]),
    status,
  ]);
  return form;
}

async function loadSocial() {
  try {
    const data = await api.getHomeContent();
    const links = (data && data.socialLinks) || [];
    const ul = $('#footer-social');
    if (!ul || !links.length) return;
    clear(ul);
    ul.hidden = false;
    links.forEach((l) => {
      ul.appendChild(
        el('li', {}, [
          el('a', { href: l.url, rel: 'me noopener', target: '_blank', html: `${escapeHtml(cap(l.platform))} <span aria-hidden="true">↗</span>` }),
        ])
      );
    });
  } catch {
    /* non-critical */
  }
}

function cap(s) {
  return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}

export { toast };
