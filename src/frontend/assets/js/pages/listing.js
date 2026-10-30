import { api } from '../api.js';
import { el, clear, $ } from '../dom.js';
import { productCard, pagination, emptyState, errorState } from '../components.js';
import { formatMoney } from '../money.js';
import { setPageMeta, injectJsonLd, titleCase } from '../util.js';
import { bootStorefront, view, showSpinner } from './_boot.js';
import { currentUser } from '../auth.js';
import { toast } from '../toast.js';

const CATEGORY_SLUGS = ['women', 'men', 'accessories', 'watches', 'fragrance', 'sneakers', 'wigs'];
const SORTS = [
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Best rated'],
];

const path = window.location.pathname.replace(/\/$/, '');
const file = path.split('/').pop() || 'index.html';
const base = file.replace('.html', '');

const mode = base === 'new-in' ? 'new-in' : base === 'sale' ? 'sale' : base === 'search' ? 'search' : 'category';
const activeNav =
  mode === 'new-in' ? 'New In' : mode === 'sale' ? 'Sale' : mode === 'search' ? '' : titleCase(base);

bootStorefront({ active: activeNav });
let wishlistIds = new Set();
run();

function currentParams() {
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get('q') || undefined,
    category: mode === 'category' ? base : sp.get('category') || undefined,
    subcategory: sp.get('subcategory') || undefined,
    collection: mode === 'new-in' ? 'new-arrivals' : sp.get('collection') || undefined,
    onSale: mode === 'sale' ? true : sp.get('onSale') === 'true' ? true : undefined,
    inStock: sp.get('inStock') === 'true' ? true : undefined,
    color: sp.getAll('color'),
    size: sp.getAll('size'),
    minPrice: sp.get('minPrice') || undefined,
    maxPrice: sp.get('maxPrice') || undefined,
    sort: sp.get('sort') || undefined,
    page: sp.get('page') || undefined,
  };
}

function writeParams(next, { replace } = {}) {
  const sp = new URLSearchParams();
  const keep = ['q', 'subcategory', 'collection', 'onSale', 'inStock', 'minPrice', 'maxPrice', 'sort', 'page'];
  keep.forEach((k) => {
    if (next[k] != null && next[k] !== '' && next[k] !== false) sp.set(k, next[k] === true ? 'true' : next[k]);
  });
  (next.color || []).forEach((c) => sp.append('color', c));
  (next.size || []).forEach((s) => sp.append('size', s));
  const url = `${window.location.pathname}${sp.toString() ? '?' + sp : ''}`;
  if (replace) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
}

async function run() {
  showSpinner();
  const params = currentParams();
  if (mode === 'search' && !params.q) {
    renderSearchLanding();
    return;
  }
  try {
    const [data, user] = await Promise.all([api.getProducts(cleanQuery(params)), currentUser()]);
    if (user) {
      try {
        const wl = await api.getWishlist();
        wishlistIds = new Set((wl.items || []).map((p) => p.id));
      } catch { /* ignore */ }
    }
    renderResults(data, params);
  } catch (err) {
    clear(view());
    view().append(errorState(err, run));
  }
}

function cleanQuery(p) {
  const out = {};
  Object.entries(p).forEach(([k, v]) => {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
    out[k] = v;
  });
  return out;
}

function renderResults(data, params) {
  const root = view();
  clear(root);
  const heading = data.heading || {};
  const title =
    mode === 'search'
      ? `“${params.q}” — Search`
      : heading.title || (mode === 'new-in' ? 'New In' : mode === 'sale' ? 'Sale' : titleCase(base));

  setPageMeta({
    title: `${title} — House of Esther`,
    description: heading.description || `Browse ${title} at House of Esther.`,
    canonicalPath: window.location.pathname,
    noindex: mode === 'search',
  });

  root.append(
    el('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' }, [
      el('ol', {}, [
        el('li', {}, [el('a', { href: '/', text: 'Home' })]),
        el('li', {}, [el('span', { text: title, 'aria-current': 'page' })]),
      ]),
    ]),
    el('header', { class: 'stack', style: 'margin-bottom:1.5rem' }, [
      el('h1', { text: title }),
      heading.description ? el('p', { class: 'lede', text: heading.description }) : null,
      mode === 'search' && data.query && data.query.didYouMean
        ? el('p', {}, [document.createTextNode('Did you mean '), el('a', { href: `/search.html?q=${encodeURIComponent(data.query.didYouMean)}`, text: data.query.didYouMean }), document.createTextNode('?')])
        : null,
    ])
  );

  // A shop with nothing in this listing at all (no filters or search to blame): show a
  // friendly "on their way" state instead of an empty filter panel and a "0 pieces" toolbar.
  if ((!data.items || !data.items.length) && !hasNarrowing(params)) {
    root.append(
      emptyState({
        title: 'Nothing here yet',
        message: 'New pieces are on their way. Leave your email in the footer and we will tell you the moment they land.',
        actions: [
          el('a', { class: 'btn', href: '/', text: 'Back to home' }),
          el('button', {
            class: 'btn btn--secondary',
            type: 'button',
            text: 'Get notified',
            on: {
              click: () => {
                const input = $('#footer-newsletter-email');
                if (input) { input.scrollIntoView({ block: 'center' }); input.focus(); }
              },
            },
          }),
        ],
      })
    );
    injectJsonLd({ '@context': 'https://schema.org', '@type': 'ItemList', name: title, numberOfItems: 0, itemListElement: [] });
    return;
  }

  const layout = el('div', { class: 'listing-layout' });
  const filterCol = el('div', {}, [buildFilterPanel(data.facets || {}, params)]);
  const resultsCol = el('div', {});

  resultsCol.append(
    el('div', { class: 'toolbar' }, [
      el('p', { role: 'status', text: `${data.total || 0} ${data.total === 1 ? 'piece' : 'pieces'}` }),
      el('div', { style: 'display:flex;gap:.5rem;align-items:center' }, [
        el('button', {
          class: 'btn btn--secondary btn--small',
          id: 'filter-toggle',
          'aria-expanded': 'false',
          'aria-controls': 'filter-panel',
          text: 'Filter',
          on: { click: toggleFilters },
        }),
        sortControl(params),
      ]),
    ]),
    activeChips(data.appliedFilters || {}, params)
  );

  if (!data.items || !data.items.length) {
    resultsCol.append(
      emptyState({
        title: mode === 'search' ? 'No matches for that search' : 'Nothing matches those filters',
        message:
          mode === 'search'
            ? 'Try a shorter or different term, or browse a category.'
            : 'Try removing a filter, or start again from New In.',
        actions: [
          el('a', { class: 'btn btn--secondary', href: window.location.pathname, text: 'Clear filters' }),
          el('a', { class: 'btn', href: '/new-in.html', text: 'Shop New In' }),
        ],
      })
    );
  } else {
    const grid = el('div', { class: 'product-grid' });
    data.items.forEach((p) => grid.appendChild(productCard(p, { onWishlist: onWishlist, wishlisted: wishlistIds.has(p.id) })));
    resultsCol.append(grid);
    resultsCol.append(
      pagination(data.page || 1, data.totalPages || 1, (pg) => {
        const sp = new URLSearchParams(window.location.search);
        sp.set('page', pg);
        return `${window.location.pathname}?${sp}`;
      })
    );
    if ((data.page || 1) < (data.totalPages || 1)) {
      resultsCol.append(
        el('div', { style: 'text-align:center;margin-top:1rem' }, [
          el('button', {
            class: 'btn btn--secondary',
            text: 'Load more',
            on: {
              click: async (e) => {
                e.target.classList.add('is-loading');
                const nextPage = (data.page || 1) + 1;
                const more = await api.getProducts(cleanQuery({ ...params, page: nextPage }));
                more.items.forEach((p) => grid.appendChild(productCard(p, { onWishlist, wishlisted: wishlistIds.has(p.id) })));
                writeParams({ ...params, page: nextPage }, { replace: true });
                e.target.closest('div').remove();
              },
            },
          }),
        ])
      );
    }
  }

  layout.append(filterCol, resultsCol);
  root.append(layout);

  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    numberOfItems: data.total || (data.items || []).length,
    itemListElement: (data.items || []).slice(0, 24).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${window.location.origin}/product.html?slug=${p.slug}`,
      name: p.name,
    })),
  });
}

/** True when the shopper has narrowed the listing (search term or any filter). */
function hasNarrowing(params) {
  return !!(
    params.q || params.subcategory || params.minPrice || params.maxPrice || params.inStock ||
    (mode !== 'sale' && params.onSale) ||
    (params.color || []).length || (params.size || []).length ||
    (mode !== 'new-in' && params.collection)
  );
}

function sortControl(params) {
  const select = el('select', { class: 'select', 'aria-label': 'Sort products', id: 'sort-control', style: 'width:auto', on: { change: (e) => { writeParams({ ...currentParams(), sort: e.target.value, page: undefined }); run(); } } });
  const opts = mode === 'search' ? [['relevance', 'Most relevant'], ...SORTS] : SORTS;
  opts.forEach(([v, label]) => select.appendChild(el('option', { value: v, text: label, selected: params.sort === v })));
  return el('label', { style: 'display:flex;gap:.5rem;align-items:center;font-size:var(--step--1)' }, [
    el('span', { class: 'visually-hidden', text: 'Sort by' }),
    select,
  ]);
}

function buildFilterPanel(facets, params) {
  const panel = el('form', { class: 'filter-panel', id: 'filter-panel', 'aria-label': 'Filter products' });
  panel.append(
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem' }, [
      el('strong', { text: 'Filter' }),
      el('button', { type: 'button', class: 'modal__close', 'aria-label': 'Close filters', text: '×', on: { click: () => toggleFilters(false) } }),
    ])
  );

  const checkboxGroup = (legend, key, options, selected) => {
    if (!options || !options.length) return null;
    const fs = el('fieldset', {}, [el('legend', { text: legend })]);
    options.forEach((o) => {
      const id = `f-${key}-${o.value}`;
      fs.appendChild(
        el('label', { class: 'checkbox', for: id }, [
          el('input', {
            type: 'checkbox',
            id,
            name: key,
            value: o.value,
            checked: selected.includes(o.value),
            on: { change: applyFromPanel },
          }),
          el('span', { text: `${o.label}${o.count != null ? ` (${o.count})` : ''}` }),
        ])
      );
    });
    return fs;
  };

  if (mode !== 'category' && facets.categories) {
    panel.append(checkboxGroupSingle('Category', 'category', facets.categories, params.category));
  }
  panel.append(checkboxGroup('Type', 'subcategory-multi', facets.subcategories || [], params.subcategory ? [params.subcategory] : []));
  panel.append(colourGroup(facets.colors || [], params.color || []));
  panel.append(checkboxGroup('Size', 'size', facets.sizes || [], params.size || []));
  panel.append(priceGroup(facets.priceRange, params));

  const avail = el('fieldset', {}, [
    el('legend', { text: 'Availability' }),
    el('label', { class: 'checkbox' }, [
      el('input', { type: 'checkbox', name: 'inStock', checked: !!params.inStock, on: { change: applyFromPanel } }),
      el('span', { text: 'In stock only' }),
    ]),
    mode !== 'sale'
      ? el('label', { class: 'checkbox' }, [
          el('input', { type: 'checkbox', name: 'onSale', checked: !!params.onSale, on: { change: applyFromPanel } }),
          el('span', { text: 'On sale' }),
        ])
      : null,
  ]);
  panel.append(avail);
  panel.append(el('a', { class: 'btn btn--ghost', href: window.location.pathname, text: 'Clear all filters' }));

  return panel;
}

function checkboxGroupSingle(legend, key, options, selected) {
  const fs = el('fieldset', {}, [el('legend', { text: legend })]);
  options.forEach((o) => {
    const id = `f-${key}-${o.value}`;
    fs.appendChild(
      el('label', { class: 'radio', for: id }, [
        el('input', { type: 'radio', id, name: key, value: o.value, checked: selected === o.value, on: { change: applyFromPanel } }),
        el('span', { text: `${o.label}${o.count != null ? ` (${o.count})` : ''}` }),
      ])
    );
  });
  return fs;
}

function colourGroup(colors, selected) {
  if (!colors.length) return null;
  const fs = el('fieldset', {}, [el('legend', { text: 'Colour' })]);
  const row = el('div', { class: 'swatch-row', style: 'gap:.5rem' });
  colors.forEach((c) => {
    const id = `f-color-${c.value}`;
    const label = el('label', { class: 'checkbox', for: id, style: 'align-items:center', title: `${c.label} (${c.count ?? 0})` }, [
      el('input', { type: 'checkbox', id, name: 'color', value: c.value, checked: selected.includes(c.value), on: { change: applyFromPanel } }),
      el('span', { class: 'swatch', style: `background:${c.hex || '#ccc'};width:1.4rem;height:1.4rem`, 'aria-hidden': 'true' }),
      el('span', { text: c.label }),
    ]);
    row.appendChild(label);
  });
  fs.appendChild(row);
  return fs;
}

function priceGroup(range, params) {
  const fs = el('fieldset', {}, [el('legend', { text: 'Price (KES)' })]);
  const min = el('input', { class: 'input', type: 'number', inputmode: 'numeric', name: 'minPrice', 'aria-label': 'Minimum price', placeholder: range ? String(range.min) : 'Min', value: params.minPrice || '', min: 0 });
  const max = el('input', { class: 'input', type: 'number', inputmode: 'numeric', name: 'maxPrice', 'aria-label': 'Maximum price', placeholder: range ? String(range.max) : 'Max', value: params.maxPrice || '', min: 0 });
  fs.append(
    el('div', { style: 'display:flex;gap:.5rem;align-items:center' }, [min, el('span', { text: 'to' }), max]),
    el('button', { type: 'button', class: 'btn btn--small btn--secondary', style: 'margin-top:.5rem', text: 'Apply price', on: { click: applyFromPanel } })
  );
  return fs;
}

function applyFromPanel() {
  const panel = $('#filter-panel');
  const next = { ...currentParams(), page: undefined };
  const cat = panel.querySelector('input[name="category"]:checked');
  if (cat) { window.location.href = `/${cat.value}.html`; return; }
  const subMulti = Array.from(panel.querySelectorAll('input[name="subcategory-multi"]:checked')).map((i) => i.value);
  next.subcategory = subMulti[0];
  next.color = Array.from(panel.querySelectorAll('input[name="color"]:checked')).map((i) => i.value);
  next.size = Array.from(panel.querySelectorAll('input[name="size"]:checked')).map((i) => i.value);
  next.inStock = panel.querySelector('input[name="inStock"]') && panel.querySelector('input[name="inStock"]').checked;
  const onSaleInput = panel.querySelector('input[name="onSale"]');
  next.onSale = mode === 'sale' ? true : onSaleInput && onSaleInput.checked;
  next.minPrice = panel.querySelector('input[name="minPrice"]').value || undefined;
  next.maxPrice = panel.querySelector('input[name="maxPrice"]').value || undefined;
  writeParams(next);
  run();
}

function activeChips(applied, params) {
  const chips = el('div', { class: 'chips', style: 'margin-bottom:1rem' });
  const removeAndRun = (mutate) => {
    const next = { ...currentParams(), page: undefined };
    mutate(next);
    writeParams(next);
    run();
  };
  (params.color || []).forEach((c) =>
    chips.appendChild(chip(`Colour: ${c}`, () => removeAndRun((n) => { n.color = n.color.filter((x) => x !== c); })))
  );
  (params.size || []).forEach((s) =>
    chips.appendChild(chip(`Size: ${s}`, () => removeAndRun((n) => { n.size = n.size.filter((x) => x !== s); })))
  );
  if (params.subcategory) chips.appendChild(chip(`Type: ${titleCase(params.subcategory)}`, () => removeAndRun((n) => { n.subcategory = undefined; })));
  if (params.minPrice) chips.appendChild(chip(`Min ${formatMoney({ amount: +params.minPrice })}`, () => removeAndRun((n) => { n.minPrice = undefined; })));
  if (params.maxPrice) chips.appendChild(chip(`Max ${formatMoney({ amount: +params.maxPrice })}`, () => removeAndRun((n) => { n.maxPrice = undefined; })));
  if (params.inStock) chips.appendChild(chip('In stock only', () => removeAndRun((n) => { n.inStock = undefined; })));
  if (params.onSale && mode !== 'sale') chips.appendChild(chip('On sale', () => removeAndRun((n) => { n.onSale = undefined; })));
  return chips;
}

function chip(label, onRemove) {
  return el('span', { class: 'chip' }, [
    el('span', { text: label }),
    el('button', { type: 'button', 'aria-label': `Remove filter ${label}`, text: '×', on: { click: onRemove } }),
  ]);
}

function toggleFilters(force) {
  const panel = $('#filter-panel');
  const toggle = $('#filter-toggle');
  const open = typeof force === 'boolean' ? force : !panel.classList.contains('is-open');
  panel.classList.toggle('is-open', open);
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

async function onWishlist(product, btn) {
  const user = await currentUser();
  if (!user) {
    toast('Sign in to save pieces to your wishlist.', 'info');
    window.location.href = `/account/signin.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  const pressed = btn.getAttribute('aria-pressed') === 'true';
  try {
    if (pressed) {
      await api.removeWishlist(product.id);
      wishlistIds.delete(product.id);
      btn.setAttribute('aria-pressed', 'false');
      toast('Removed from your wishlist.');
    } else {
      await api.addWishlist(product.id);
      wishlistIds.add(product.id);
      btn.setAttribute('aria-pressed', 'true');
      toast('Saved to your wishlist.', 'success');
    }
  } catch (err) {
    toast(err.message || 'Could not update your wishlist.', 'error');
  }
}

function renderSearchLanding() {
  const root = view();
  clear(root);
  setPageMeta({ title: 'Search — House of Esther', description: 'Search the House of Esther boutique.', noindex: true });
  root.append(
    el('h1', { text: 'Search' }),
    el('form', { role: 'search', action: '/search.html', method: 'get', style: 'display:flex;gap:.5rem;margin:1rem 0;max-width:32rem' }, [
      el('input', { class: 'input', type: 'search', name: 'q', 'aria-label': 'Search products', placeholder: 'What are you looking for?', autofocus: true }),
      el('button', { class: 'btn', type: 'submit', text: 'Search' }),
    ]),
    el('p', { class: 'text-muted', text: 'Popular categories' }),
    el('div', { class: 'chips' }, CATEGORY_SLUGS.map((s) => el('a', { class: 'chip', href: `/${s}.html`, text: titleCase(s) })))
  );
}

window.addEventListener('popstate', run);
