import { api } from '../api.js';
import { el, clear, imageEl } from '../dom.js';
import { pagination, emptyState, errorState } from '../components.js';
import { formatDate, getParam, injectJsonLd } from '../util.js';
import { bootStorefront, view, showSpinner } from './_boot.js';

bootStorefront({ active: 'Journal' });

const page = parseInt(getParam('page') || '1', 10);
const tag = getParam('tag') || undefined;

load();

async function load() {
  showSpinner();
  try {
    const data = await api.getJournal({ page, pageSize: 12, tag });
    render(data);
  } catch (err) {
    clear(view());
    view().append(errorState(err, load));
  }
}

function render(data) {
  const root = view();
  clear(root);
  root.append(
    el('header', { class: 'stack', style: 'margin-bottom:1.5rem' }, [
      el('p', { class: 'eyebrow', text: 'The Journal' }),
      el('h1', { text: 'Notes on fit, care, and what we’re wearing' }),
      tag ? el('p', { class: 'text-muted' }, [document.createTextNode(`Filed under ${tag}. `), el('a', { href: '/journal.html', text: 'See all' })]) : null,
    ])
  );

  if (!data.items || !data.items.length) {
    root.append(emptyState({ title: 'Nothing here yet', message: 'The first notes are on their way — new pieces and stories are coming soon.', actions: [el('a', { class: 'btn', href: '/', text: 'Back to home' })] }));
    return;
  }

  const grid = el('div', { class: 'product-grid' });
  data.items.forEach((a) => grid.append(card(a)));
  root.append(grid);
  root.append(pagination(data.page || 1, data.totalPages || 1, (p) => `/journal.html?page=${p}${tag ? `&tag=${tag}` : ''}`));

  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'The Journal — House of Esther',
    blogPost: data.items.map((a) => ({ '@type': 'BlogPosting', headline: a.title, datePublished: a.publishedAt, url: `${window.location.origin}/journal-article.html?slug=${a.slug}` })),
  });
}

function card(a) {
  return el('article', { class: 'editorial' }, [
    el('a', { href: `/journal-article.html?slug=${encodeURIComponent(a.slug)}`, style: 'text-decoration:none;color:inherit' }, [
      el('div', { class: 'editorial__media' }, [imageEl(a.coverImage, { altFallback: a.title })]),
      a.tag ? el('p', { class: 'eyebrow', style: 'margin-top:.5rem', text: a.tag }) : null,
      el('h2', { style: 'font-size:var(--step-2)', text: a.title }),
      a.excerpt ? el('p', { class: 'text-muted', text: a.excerpt }) : null,
      el('p', { class: 'hint', text: formatDate(a.publishedAt) }),
    ]),
  ]);
}
