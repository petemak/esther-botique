/** Shared UI builders used across multiple pages. */
import { el, imageEl, escapeHtml } from './dom.js';
import { formatMoney, saving } from './money.js';

/**
 * Product card. The whole card is one link to the PDP (design-spec §2/§4):
 * an absolutely-positioned ::after on .product-card__link covers the card, and
 * .product-card is position:relative so the overlay is scoped to this card only.
 *
 * Positioning-context gotcha (agent brief): the tags and the wishlist toggle are
 * appended as DIRECT children of .product-card, NOT of .product-card__media.
 * .product-card__media must NOT be a positioned element, otherwise it forms its own
 * stacking context and the whole media subtree paints *below* the overlay ::after —
 * silently swallowing clicks meant for the heart. Keeping them siblings of the
 * overlay, in the same stacking context, lets z-index:2 actually win.
 */
export function productCard(p, { onWishlist, wishlisted } = {}) {
  const media = el('div', { class: 'product-card__media' }, [
    imageEl(p.primaryImage, { altFallback: p.name }),
  ]);

  const overlays = [];

  const tags = el('div', { class: 'product-card__tags' });
  if (p.isNew) tags.appendChild(el('span', { class: 'tag tag--new', text: 'New In' }));
  if (p.onSale) tags.appendChild(el('span', { class: 'tag tag--sale', text: 'Sale' }));
  if (tags.children.length) overlays.push(tags);

  if (onWishlist) {
    const btn = el('button', {
      class: 'wishlist-toggle',
      type: 'button',
      'aria-pressed': wishlisted ? 'true' : 'false',
      'aria-label': wishlisted ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`,
      html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C1 8.5 2.5 5 6 5c2 0 3.4 1.2 4 2 .6-.8 2-2 4-2 3.5 0 5 3.5 3.6 6.8C19.5 16.4 12 21 12 21Z"/></svg>',
      on: {
        click: (e) => {
          e.preventDefault();
          e.stopPropagation();
          onWishlist(p, btn);
        },
      },
    });
    overlays.push(btn);
  }

  const priceBlock = priceEl(p.price, p.compareAtPrice, p.onSale);

  const swatches = el('div', { class: 'swatch-row' });
  (p.colors || []).slice(0, 5).forEach((c) => {
    swatches.appendChild(el('span', { class: 'swatch', style: `background:${c.hex || '#ccc'}`, title: c.name, 'aria-hidden': 'true' }));
  });

  const ratingNode = p.rating && p.rating.count
    ? el('span', { class: 'text-muted', style: 'font-size:var(--step--1)', html: `${stars(p.rating.average)} <span>(${p.rating.count})</span>` })
    : null;

  const body = el('div', { class: 'product-card__body' }, [
    el('a', {
      class: 'product-card__link',
      href: `/product.html?slug=${encodeURIComponent(p.slug)}`,
      html: `<span class="product-card__name">${escapeHtml(p.name)}</span>`,
    }),
    priceBlock,
    !p.inStock ? el('span', { class: 'stock-cue stock-cue--out', text: 'Out of stock' }) : null,
    (p.colors && p.colors.length) ? swatches : null,
    ratingNode,
  ]);

  return el('article', { class: 'product-card' }, [media, body, ...overlays]);
}

export function priceEl(price, compareAt, onSale) {
  const wrap = el('div', { class: 'price' });
  wrap.appendChild(el('span', { class: 'price__current', text: formatMoney(price) }));
  const save = saving(price, compareAt);
  if (onSale && save) {
    wrap.appendChild(el('span', { class: 'price__was' }, [
      el('span', { class: 'visually-hidden', text: 'Was ' }),
      document.createTextNode(formatMoney(compareAt)),
    ]));
    wrap.appendChild(el('span', { class: 'price__save', text: `Save ${formatMoney(save)}` }));
  }
  return wrap;
}

export function stars(average) {
  const pct = Math.max(0, Math.min(100, (Number(average) / 5) * 100));
  return `<span class="stars" style="--pct:${pct}%" role="img" aria-label="${Number(average).toFixed(1)} out of 5 stars">${starGlyphs(average)}</span>`;
}

function starGlyphs(average) {
  const rounded = Math.round(Number(average) * 2) / 2;
  let out = '';
  for (let i = 1; i <= 5; i += 1) {
    if (rounded >= i) out += '★';
    else if (rounded >= i - 0.5) out += '⯨';
    else out += '☆';
  }
  return out;
}

export function breadcrumb(items) {
  const nav = el('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' });
  const ol = el('ol', {});
  items.forEach((item, i) => {
    const last = i === items.length - 1;
    ol.appendChild(
      el('li', {}, [
        last || !item.href
          ? el('span', { text: item.label, 'aria-current': last ? 'page' : null })
          : el('a', { href: normalizeHref(item.href), text: item.label }),
      ])
    );
  });
  nav.appendChild(ol);
  return nav;
}

/** Map contract-style hrefs ("/accessories", "/accessories/bags") to our static routes. */
export function normalizeHref(href) {
  if (!href || href === '/') return '/';
  if (href.startsWith('http') || href.includes('.html')) return href;
  const parts = href.replace(/^\/+/, '').split('/');
  if (parts.length === 1) return `/${parts[0]}.html`;
  return `/${parts[0]}.html?subcategory=${encodeURIComponent(parts.slice(1).join('/'))}`;
}

export function pagination(page, totalPages, hrefForPage) {
  if (!totalPages || totalPages <= 1) return el('div');
  const nav = el('nav', { class: 'pagination', 'aria-label': 'Pagination' });
  const add = (label, p, current, disabled) => {
    if (disabled) {
      nav.appendChild(el('span', { text: label, 'aria-hidden': 'true', style: 'opacity:.4' }));
    } else if (current) {
      nav.appendChild(el('span', { text: label, 'aria-current': 'page' }));
    } else {
      nav.appendChild(el('a', { href: hrefForPage(p), text: label, rel: label === '‹' ? 'prev' : label === '›' ? 'next' : null }));
    }
  };
  add('‹', page - 1, false, page <= 1);
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let p = start; p <= end; p += 1) add(String(p), p, p === page, false);
  add('›', page + 1, false, page >= totalPages);
  return nav;
}

export function emptyState({ title, message, actions }) {
  return el('div', { class: 'empty-state stack' }, [
    el('h2', { text: title }),
    el('p', { class: 'text-muted', text: message }),
    actions ? el('div', { style: 'display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap' }, actions) : null,
  ]);
}

export function errorState(err, retry) {
  const box = el('div', { class: 'empty-state stack' }, [
    el('h2', { text: 'That did not load' }),
    el('p', { class: 'text-muted', text: (err && err.message) || 'Something went wrong at our end. Please try again in a moment.' }),
  ]);
  if (retry) {
    box.appendChild(el('button', { class: 'btn btn--secondary', text: 'Try again', on: { click: retry } }));
  }
  return box;
}

export function fieldError(input, message) {
  const field = input.closest('.field') || input.parentElement;
  let node = field.querySelector('.error-text');
  if (!message) {
    if (node) node.remove();
    input.removeAttribute('aria-invalid');
    return;
  }
  if (!node) {
    node = el('p', { class: 'error-text' });
    node.id = `${input.id || input.name || 'f'}-error-${Math.random().toString(36).slice(2, 6)}`;
    field.appendChild(node);
  }
  node.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', node.id);
}

/** Apply a 422 error.details array to a form's named fields. */
export function applyValidationErrors(form, details) {
  if (!Array.isArray(details)) return;
  details.forEach((d) => {
    const input = form.querySelector(`[name="${CSS.escape(d.field)}"]`);
    if (input) fieldError(input, d.message);
  });
}
