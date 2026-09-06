import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState, fieldError } from '../../components.js';
import { adminShell } from './_shell.js';
import { toast } from '../../toast.js';

let content;

start();

async function start() {
  const shell = await adminShell('collections', 'Collections & categories');
  if (!shell) return;
  content = shell.content;
  await refresh();
}

async function refresh() {
  clear(content).append(el('div', { class: 'spinner' }));
  try {
    const [cats, cols] = await Promise.all([api.admin.getCategories(), api.admin.getCollections()]);
    render(cats.items || cats || [], cols.items || cols || []);
  } catch (err) {
    clear(content).append(errorState(err, refresh));
  }
}

function render(cats, cols) {
  clear(content);
  content.append(
    el('section', { 'aria-labelledby': 'cat-h' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
        el('h2', { id: 'cat-h', style: 'font-size:var(--step-1)', text: 'Categories' }),
        el('button', { class: 'btn btn--small', text: 'Add category', on: { click: () => categoryForm(null) } }),
      ]),
      el('div', { class: 'stack', style: 'margin:.5rem 0 2rem' }, cats.map(categoryRow)),
      el('div', { id: 'cat-slot' }),
    ]),
    el('section', { 'aria-labelledby': 'col-h' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
        el('h2', { id: 'col-h', style: 'font-size:var(--step-1)', text: 'Collections' }),
        el('button', { class: 'btn btn--small', text: 'Add collection', on: { click: () => collectionForm(null) } }),
      ]),
      el('div', { class: 'stack', style: 'margin:.5rem 0' }, cols.map(collectionRow)),
      el('div', { id: 'col-slot' }),
    ])
  );
}

function categoryRow(c) {
  return el('div', { class: 'card', style: 'display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap' }, [
    el('div', {}, [el('strong', { text: c.label }), document.createTextNode(` /${c.slug}`), c.productCount != null ? el('span', { class: 'hint', text: ` · ${c.productCount} products` }) : null,
      (c.subcategories && c.subcategories.length) ? el('p', { class: 'hint', text: `Subcategories: ${c.subcategories.map((s) => s.label).join(', ')}` }) : null]),
    el('div', { class: 'row-actions' }, [
      el('button', { class: 'btn btn--small btn--secondary', text: 'Edit', on: { click: () => categoryForm(c) } }),
      el('button', { class: 'btn btn--small btn--ghost', text: 'Delete', on: { click: () => del('category', c.slug) } }),
    ]),
  ]);
}

function collectionRow(c) {
  return el('div', { class: 'card', style: 'display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap' }, [
    el('div', {}, [el('strong', { text: c.title }), document.createTextNode(` /${c.slug}`), c.rule ? el('p', { class: 'hint', text: `Rule: ${c.rule.type}` }) : null]),
    el('div', { class: 'row-actions' }, [
      el('button', { class: 'btn btn--small btn--secondary', text: 'Edit', on: { click: () => collectionForm(c) } }),
      el('button', { class: 'btn btn--small btn--ghost', text: 'Delete', on: { click: () => del('collection', c.slug) } }),
    ]),
  ]);
}

function categoryForm(existing) {
  const slot = $('#cat-slot');
  clear(slot);
  const f = (name, label, val) => {
    const id = `c-${name}`;
    const i = el('input', { class: 'input', id, value: val || '' });
    i.addEventListener('input', () => fieldError(i, null));
    return el('div', { class: 'field' }, [el('label', { for: id, text: label }), i]);
  };
  const form = el('form', {
    class: 'card stack',
    on: {
      submit: async (e) => {
        e.preventDefault();
        const body = {
          slug: $('#c-slug').value.trim(),
          label: $('#c-label').value.trim(),
          description: $('#c-description').value.trim() || undefined,
          parentSlug: $('#c-parentSlug').value.trim() || undefined,
          sortOrder: parseInt($('#c-sortOrder').value, 10) || 0,
        };
        if (!body.slug || !body.label) { toast('Slug and label are required.', 'error'); return; }
        try {
          if (existing) await api.admin.updateCategory(existing.slug, body);
          else await api.admin.createCategory(body);
          toast('Category saved.', 'success');
          refresh();
        } catch (err) {
          toast((err && err.message) || 'Could not save the category.', 'error');
        }
      },
    },
  }, [
    el('h3', { text: existing ? `Edit ${existing.label}` : 'New category' }),
    f('slug', 'Slug', existing && existing.slug),
    f('label', 'Label', existing && existing.label),
    f('description', 'Curatorial description', existing && existing.description),
    f('parentSlug', 'Parent slug (for a subcategory)', existing && existing.parentSlug),
    f('sortOrder', 'Sort order', existing && existing.sortOrder),
    el('div', { style: 'display:flex;gap:.5rem' }, [
      el('button', { class: 'btn btn--small', type: 'submit', text: 'Save' }),
      el('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Cancel', on: { click: () => clear(slot) } }),
    ]),
  ]);
  slot.append(form);
}

function collectionForm(existing) {
  const slot = $('#col-slot');
  clear(slot);
  const ruleType = el('select', { class: 'select', id: 'cl-ruleType' }, ['manual', 'auto_new_arrivals', 'auto_sale'].map((r) => el('option', { value: r, text: r, selected: existing && existing.rule && existing.rule.type === r })));
  const productIds = el('input', { class: 'input', id: 'cl-productIds', placeholder: 'prod_1, prod_2 (manual only)', value: existing && existing.rule && existing.rule.productIds ? existing.rule.productIds.join(', ') : '' });
  const days = el('input', { class: 'input', id: 'cl-days', type: 'number', value: existing && existing.rule && existing.rule.days ? existing.rule.days : 30 });

  const form = el('form', {
    class: 'card stack',
    on: {
      submit: async (e) => {
        e.preventDefault();
        const type = ruleType.value;
        let rule;
        if (type === 'manual') rule = { type, productIds: productIds.value.split(',').map((s) => s.trim()).filter(Boolean) };
        else if (type === 'auto_new_arrivals') rule = { type, days: parseInt(days.value, 10) || 30 };
        else rule = { type };
        const body = {
          slug: $('#cl-slug').value.trim(),
          title: $('#cl-title').value.trim(),
          description: $('#cl-description').value.trim() || undefined,
          heroImageId: $('#cl-heroImageId').value.trim() || undefined,
          rule,
        };
        if (!body.slug || !body.title) { toast('Slug and title are required.', 'error'); return; }
        try {
          if (existing) await api.admin.updateCollection(existing.slug, body);
          else await api.admin.createCollection(body);
          toast('Collection saved.', 'success');
          refresh();
        } catch (err) {
          toast((err && err.message) || 'Could not save the collection.', 'error');
        }
      },
    },
  }, [
    el('h3', { text: existing ? `Edit ${existing.title}` : 'New collection' }),
    textField('cl-slug', 'Slug', existing && existing.slug),
    textField('cl-title', 'Title', existing && existing.title),
    textField('cl-description', 'Description', existing && existing.description),
    textField('cl-heroImageId', 'Hero image id', existing && existing.heroImageId),
    el('div', { class: 'field' }, [el('label', { for: 'cl-ruleType', text: 'Rule type' }), ruleType]),
    el('div', { class: 'field' }, [el('label', { for: 'cl-productIds', text: 'Product ids (manual)' }), productIds]),
    el('div', { class: 'field' }, [el('label', { for: 'cl-days', text: 'Days (auto new arrivals)' }), days]),
    el('div', { style: 'display:flex;gap:.5rem' }, [
      el('button', { class: 'btn btn--small', type: 'submit', text: 'Save' }),
      el('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Cancel', on: { click: () => clear(slot) } }),
    ]),
  ]);
  slot.append(form);
}

function textField(id, label, val) {
  return el('div', { class: 'field' }, [el('label', { for: id, text: label }), el('input', { class: 'input', id, value: val || '' })]);
}

async function del(kind, slug) {
  if (!window.confirm(`Delete this ${kind}? This is blocked if products are still assigned.`)) return;
  try {
    if (kind === 'category') await api.admin.deleteCategory(slug);
    else await api.admin.deleteCollection(slug);
    toast(`${kind} deleted.`, 'success');
    refresh();
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) toast('Cannot delete — products are still assigned.', 'error');
    else toast((err && err.message) || 'Could not delete.', 'error');
  }
}
