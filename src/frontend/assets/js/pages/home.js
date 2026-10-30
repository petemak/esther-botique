import { api } from '../api.js';
import { el, clear, imageEl, escapeHtml } from '../dom.js';
import { productCard } from '../components.js';
import { formatDate, injectJsonLd } from '../util.js';
import { copy } from '../copy.js';
import { bootStorefront, view, renderError, armHeaderScrollState } from './_boot.js';

document.body.classList.add('page-home');
bootStorefront({ active: '', transparentHeader: true });
init();

async function init() {
  const root = view();
  try {
    const content = await api.getHomeContent();
    clear(root);
    const heroEl = hero(content.hero);
    // Every catalogue-driven section starts hidden and reveals itself only if it has
    // something to show, so an empty shop never renders bare headings or spinners.
    const featuredSlug = typeof content.featuredCollectionSlug === 'string' ? content.featuredCollectionSlug.trim() : '';
    root.append(
      heroEl,
      trustStrip(),
      content.categoryTiles && content.categoryTiles.length ? categoryTiles(content.categoryTiles) : categoryTilesFallback(),
      railSection('New In', 'Just arrived, chosen with care.', '/new-in.html', 'new-arrivals'),
      editorialSection(content.editorialBlocks || []),
      featuredSlug ? featuredSection(featuredSlug) : null,
      journalSection(),
      newsletterSection()
    );
    injectJsonLd({
      '@context': 'https://schema.org',
      '@type': ['Store', 'OnlineStore'],
      name: 'House of Esther',
      slogan: content.hero && content.hero.headline,
      url: window.location.origin + '/',
      areaServed: 'KE',
      paymentAccepted: copy.homePaymentAccepted,
    });
    // Header overlays the hero photo; swap to the solid header the instant the TOP of
    // the hero content (a zero-height sentinel before the eyebrow) reaches the header —
    // so the eyebrow/headline/CTA scroll under a SOLID header, never under the
    // transparent one where the nav links would overlap them.
    const heroSentinel = heroEl && heroEl.querySelector('.hero__sentinel');
    if (heroSentinel) armHeaderScrollState(heroSentinel);
  } catch (err) {
    renderError(err, init);
  }
}

/**
 * Full-bleed hero: real <img> backdrop (kept an <img>, not a CSS background, for LCP +
 * a11y), Aubergine section behind it, bottom scrim for legibility, content bottom-aligned
 * in Orchid Mist. Home only.
 */
function hero(h) {
  if (!h) return el('div');
  const img = imageEl(h.image, { full: true, eager: true, altFallback: 'House of Esther — new-season pieces' });
  img.setAttribute('fetchpriority', 'high');
  img.width = (h.image && h.image.width) || 2000;
  img.height = (h.image && h.image.height) || 1200;

  return el('section', { class: 'hero', 'aria-labelledby': 'hero-h' }, [
    el('div', { class: 'hero__media' }, [img]),
    el('div', { class: 'hero__inner wrap' }, [
      el('div', { class: 'hero__content' }, [
        el('div', { class: 'hero__sentinel', 'aria-hidden': 'true' }),
        el('p', { class: 'eyebrow', text: 'House of Esther' }),
        el('h1', { id: 'hero-h', text: h.headline || 'Style worth the wait' }),
        el('p', { class: 'lede', text: h.subcopy || 'Curated pieces, honest sizing, delivered to your door.' }),
        h.ctaHref ? el('a', { class: 'btn', href: normalize(h.ctaHref), text: h.ctaLabel || 'Shop new in' }) : null,
      ]),
    ]),
  ]);
}

function normalize(href) {
  if (!href || href.startsWith('http') || href.includes('.html')) return href || '/';
  const p = href.replace(/^\/+/, '');
  if (!p) return '/';
  if (p === 'new-in' || p === 'sale' || p === 'journal' || p === 'about') return `/${p}.html`;
  if (p.startsWith('journal/')) return `/journal-article.html?slug=${encodeURIComponent(p.slice(8))}`;
  return `/${p.split('/')[0]}.html`;
}

function trustStrip() {
  const items = [
    ['shield', ...copy.homeTrust],
    ['truck', 'Delivered countrywide', 'Nairobi next-day, courier to every county.'],
    ['camera', 'Real photos, honest sizing', 'What you see is what arrives. Measurements on every piece.'],
    ['chat', 'We actually reply', 'Questions answered within one business day.'],
  ];
  const strip = el('div', { class: 'trust-strip section wrap' });
  items.forEach(([, title, body]) => {
    strip.appendChild(
      el('div', { class: 'trust-strip__item' }, [
        el('svg', { viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': 'true', html: '<path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"/>' }),
        el('div', {}, [el('strong', { text: title }), el('br'), el('span', { class: 'text-muted', text: body })]),
      ])
    );
  });
  return strip;
}

function categoryTiles(tiles) {
  return el('section', { class: 'section wrap', 'aria-labelledby': 'cats-h' }, [
    el('div', { class: 'section-head' }, [el('h2', { id: 'cats-h', text: 'Shop by category' })]),
    el('div', { class: `tiles${tiles.length < 4 ? ` tiles--${tiles.length}` : ''}` }, tiles.map((t) =>
      el('a', { class: 'tile', href: normalize(t.href) }, [imageEl(t.image, { altFallback: t.label }), el('span', { text: t.label })])
    )),
  ]);
}

function categoryTilesFallback() {
  const cats = ['Women', 'Men', 'Accessories', 'Watches', 'Fragrance', 'Sneakers', 'Wigs'];
  return el('section', { class: 'section wrap', 'aria-labelledby': 'cats-h' }, [
    el('div', { class: 'section-head' }, [el('h2', { id: 'cats-h', text: 'Shop by category' })]),
    el('div', { class: 'tiles' }, cats.map((label) =>
      el('a', { class: 'tile', href: `/${label.toLowerCase()}.html` }, [
        imageEl(null, { altFallback: label }),
        el('span', { text: label }),
      ])
    )),
  ]);
}

function railSection(title, sub, viewAllHref, collection) {
  const section = el('section', { class: 'section wrap', 'aria-labelledby': `rail-${collection}`, hidden: true }, [
    el('div', { class: 'section-head' }, [
      el('div', {}, [el('h2', { id: `rail-${collection}`, text: title }), el('p', { class: 'text-muted', text: sub })]),
      el('a', { href: viewAllHref, text: 'View all' }),
    ]),
    el('div', { class: 'rail', 'data-rail': collection }),
  ]);
  loadRail(section, section.querySelector('[data-rail]'), collection);
  return section;
}

/** Reveal the section only when there are products; an empty or failed rail removes it. */
async function loadRail(section, container, collection) {
  try {
    const data = await api.getProducts({ collection, sort: 'newest', pageSize: 8 });
    const items = (data && data.items) || [];
    if (!items.length) { section.remove(); return; }
    items.slice(0, 8).forEach((p) => container.appendChild(productCard(p)));
    section.hidden = false;
  } catch {
    section.remove();
  }
}

function featuredSection(slug) {
  const section = el('section', { class: 'section wrap', 'aria-labelledby': 'featured-h', hidden: true }, [
    el('div', { class: 'section-head' }, [el('h2', { id: 'featured-h', text: 'Featured', 'data-featured-title': '' })]),
    el('div', { class: 'rail', 'data-featured-rail': '' }),
  ]);
  (async () => {
    try {
      const [meta, products] = await Promise.all([
        api.getCollection(slug).catch(() => null),
        api.getProducts({ collection: slug, pageSize: 8 }),
      ]);
      const items = (products && products.items) || [];
      if (!items.length) { section.remove(); return; }
      if (meta && meta.title) section.querySelector('[data-featured-title]').textContent = meta.title;
      const rail = section.querySelector('[data-featured-rail]');
      items.forEach((p) => rail.appendChild(productCard(p)));
      const head = section.querySelector('.section-head');
      head.appendChild(el('a', { href: `/sale.html`, hidden: true }));
      head.appendChild(el('a', { href: `/new-in.html?collection=${encodeURIComponent(slug)}`, text: 'View all' }));
      section.hidden = false;
    } catch {
      section.remove();
    }
  })();
  return section;
}

function journalSection() {
  const section = el('section', { class: 'section wrap', 'aria-labelledby': 'journal-h', hidden: true }, [
    el('div', { class: 'section-head' }, [
      el('h2', { id: 'journal-h', text: 'From the Journal' }),
      el('a', { href: '/journal.html', text: 'All notes' }),
    ]),
    el('div', { class: 'product-grid', 'data-journal': '' }),
  ]);
  (async () => {
    try {
      const data = await api.getJournal({ page: 1, pageSize: 3 });
      const items = (data && data.items) || [];
      if (!items.length) { section.remove(); return; }
      const grid = section.querySelector('[data-journal]');
      items.slice(0, 3).forEach((a) => grid.appendChild(journalCard(a)));
      section.hidden = false;
    } catch {
      section.remove();
    }
  })();
  return section;
}

export function journalCard(a) {
  return el('article', { class: 'editorial' }, [
    el('a', { href: `/journal-article.html?slug=${encodeURIComponent(a.slug)}`, style: 'text-decoration:none;color:inherit' }, [
      el('div', { class: 'editorial__media' }, [imageEl(a.coverImage || a.heroImage, { altFallback: a.title })]),
      a.tag ? el('p', { class: 'eyebrow', text: a.tag, style: 'margin-top:.5rem' }) : null,
      el('h3', { text: a.title }),
      a.excerpt ? el('p', { class: 'text-muted', text: a.excerpt }) : null,
      el('p', { class: 'hint', text: formatDate(a.publishedAt) }),
    ]),
  ]);
}

function editorialSection(blocks) {
  if (!blocks.length) return null;
  return el('section', { class: 'section wrap', 'aria-label': 'Editorial' },
    blocks.map((b) =>
      el('article', { class: 'editorial', style: 'margin-bottom:2rem' }, [
        el('div', { class: 'editorial__media' }, [imageEl(b.image, { full: true, altFallback: b.caption || 'Editorial' })]),
        el('h3', { html: escapeHtml(b.caption || '') }),
        b.href ? el('a', { class: 'btn btn--secondary', href: normalize(b.href), text: 'Read & shop the look' }) : null,
      ])
    )
  );
}

function newsletterSection() {
  const email = el('input', { class: 'input', type: 'email', required: true, id: 'home-news-email', name: 'email', placeholder: 'you@example.com', 'aria-label': 'Email address' });
  const status = el('p', { class: 'hint', role: 'status' });
  return el('section', { class: 'section wrap center-narrow', style: 'text-align:center', 'aria-labelledby': 'news-h' }, [
    el('h2', { id: 'news-h', text: 'Be first to know when new pieces land' }),
    el('p', { class: 'text-muted', text: 'One email when new stock arrives. Confirm your address and you are in.' }),
    el('form', {
      style: 'display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin-top:1rem',
      novalidate: true,
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (!email.checkValidity()) { status.textContent = 'Please enter a valid email address.'; return; }
          try {
            const res = await api.subscribe({ email: email.value.trim(), source: 'home', productId: null, variantId: null });
            status.textContent = res.message || 'Almost there — check your inbox.';
            email.value = '';
          } catch (err) { status.textContent = err.message || 'Could not sign you up just now.'; }
        },
      },
    }, [email, el('button', { class: 'btn', type: 'submit', text: 'Sign up' })]),
    status,
  ]);
}
