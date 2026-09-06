import { api, ApiError } from '../api.js';
import { el, clear, imageEl } from '../dom.js';
import { productCard, emptyState, errorState } from '../components.js';
import { formatDate, getParam, setPageMeta, injectJsonLd } from '../util.js';
import { bootStorefront, view, showSpinner } from './_boot.js';

bootStorefront({ active: 'Journal' });

const slug = getParam('slug');

if (!slug) {
  clear(view());
  view().append(emptyState({ title: 'No article specified', message: 'Head back to the Journal.', actions: [el('a', { class: 'btn', href: '/journal.html', text: 'The Journal' })] }));
} else {
  load();
}

async function load() {
  showSpinner();
  try {
    const a = await api.getJournalArticle(slug);
    render(a);
  } catch (err) {
    clear(view());
    if (err instanceof ApiError && err.status === 404) {
      view().append(emptyState({ title: 'That note could not be found', message: 'It may have moved. Browse the Journal instead.', actions: [el('a', { class: 'btn', href: '/journal.html', text: 'The Journal' })] }));
    } else {
      view().append(errorState(err, load));
    }
  }
}

function render(a) {
  const root = view();
  clear(root);
  setPageMeta({
    title: (a.seo && a.seo.title) || `${a.title} — The Journal — House of Esther`,
    description: (a.seo && a.seo.description) || undefined,
    canonicalPath: `/journal-article.html?slug=${encodeURIComponent(a.slug)}`,
  });

  root.append(
    el('article', { class: 'stack-l' }, [
      el('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' }, [
        el('ol', {}, [
          el('li', {}, [el('a', { href: '/', text: 'Home' })]),
          el('li', {}, [el('a', { href: '/journal.html', text: 'The Journal' })]),
          el('li', {}, [el('span', { text: a.title, 'aria-current': 'page' })]),
        ]),
      ]),
      el('header', { class: 'stack center-narrow', style: 'text-align:center' }, [
        a.tag ? el('p', { class: 'eyebrow', text: a.tag }) : null,
        el('h1', { text: a.title }),
        el('p', { class: 'hint', text: formatDate(a.publishedAt) }),
      ]),
      a.heroImage ? el('div', { class: 'editorial__media', style: 'aspect-ratio:16/9' }, [imageEl(a.heroImage, { full: true, eager: true, altFallback: a.title })]) : null,
      el('div', { class: 'prose center-narrow', html: sanitize(a.bodyHtml || '') }),
    ])
  );

  if (a.shopTheLook && a.shopTheLook.length) {
    root.append(
      el('section', { class: 'section', 'aria-labelledby': 'stl-h' }, [
        el('h2', { id: 'stl-h', text: 'Shop the look' }),
        el('div', { class: 'product-grid' }, a.shopTheLook.map((p) => productCard(p))),
      ])
    );
  }

  if (a.related && a.related.length) {
    root.append(
      el('section', { class: 'section', 'aria-labelledby': 'rel-h' }, [
        el('h2', { id: 'rel-h', text: 'More from the Journal' }),
        el('div', { class: 'product-grid' }, a.related.map((r) =>
          el('article', { class: 'editorial' }, [
            el('a', { href: `/journal-article.html?slug=${encodeURIComponent(r.slug)}`, style: 'text-decoration:none;color:inherit' }, [
              el('div', { class: 'editorial__media' }, [imageEl(r.coverImage, { altFallback: r.title })]),
              el('h3', { style: 'font-size:var(--step-1)', text: r.title }),
              el('p', { class: 'hint', text: formatDate(r.publishedAt) }),
            ]),
          ])
        )),
      ])
    );
  }

  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    datePublished: a.publishedAt,
    image: a.heroImage ? a.heroImage.fullUrl : undefined,
    articleSection: a.tag,
    publisher: { '@type': 'Organization', name: 'House of Esther' },
    mainEntityOfPage: window.location.href,
  });
}

function sanitize(html) {
  return String(html)
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '');
}
