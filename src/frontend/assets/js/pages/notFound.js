import { el, clear } from '../dom.js';
import { bootStorefront, view } from './_boot.js';

bootStorefront({ active: '' });

const root = view();
clear(root);
root.append(
  el('div', { class: 'empty-state stack' }, [
    el('p', { class: 'eyebrow', text: 'Error 404' }),
    el('h1', { text: 'We could not find that page' }),
    el('p', { class: 'text-muted', text: 'The link may be old, or the piece may have sold out. Try a search or start from what is new.' }),
    el('form', { role: 'search', action: '/search.html', method: 'get', style: 'display:flex;gap:.5rem;justify-content:center;max-width:26rem;margin:1rem auto' }, [
      el('input', { class: 'input', type: 'search', name: 'q', 'aria-label': 'Search products', placeholder: 'Search the boutique' }),
      el('button', { class: 'btn', type: 'submit', text: 'Search' }),
    ]),
    el('div', { style: 'display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap' }, [
      el('a', { class: 'btn btn--secondary', href: '/new-in.html', text: 'Shop New In' }),
      el('a', { class: 'btn--ghost', href: '/', text: 'Back home' }),
    ]),
  ])
);
