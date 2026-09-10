import { api } from '../../api.js';
import { el, clear, imageEl, $, $$ } from '../../dom.js';
import { errorState } from '../../components.js';
import { getParam, formatDate } from '../../util.js';
import { adminShell, pager, money } from './_shell.js';
import { toast } from '../../toast.js';

const BULK_CAP = 200;

let content;
let query = {
  q: getParam('q') || '',
  category: getParam('category') || '',
  status: getParam('status') || '',
  stock: getParam('stock') || '',
  page: parseInt(getParam('page') || '1', 10),
};

/** Product ids ticked for a bulk status action. Survives pagination within the page session. */
const selectedIds = new Set();
/** Ids shown on the page currently rendered — drives the "select all (this page)" checkbox. */
let pageIds = [];

start();

async function start() {
  const shell = await adminShell('products', 'Products');
  if (!shell) return;
  content = shell.content;
  renderFilters();
  await load();
}

function renderFilters() {
  clear(content);
  const q = el('input', { class: 'input', id: 'p-q', 'aria-label': 'Search products', placeholder: 'Search name or SKU', value: query.q });
  const status = select('p-status', 'Status', ['', 'draft', 'published', 'archived'], query.status);
  const stock = select('p-stock', 'Stock', ['', 'in', 'low', 'out'], query.stock);
  const apply = () => {
    query = { ...query, q: q.value.trim(), status: status.value, stock: stock.value, page: 1 };
    load();
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  status.addEventListener('change', apply);
  stock.addEventListener('change', apply);

  content.append(
    el('div', { class: 'admin-topbar' }, [
      el('div', { class: 'admin-filters' }, [
        labelled('Search', q),
        labelled('Status', status),
        labelled('Stock', stock),
        el('button', { class: 'btn btn--small', text: 'Apply', on: { click: apply } }),
      ]),
      el('a', { class: 'btn', href: '/admin/product-edit.html', text: 'Add product' }),
    ]),
    catalogueTools(),
    el('div', { id: 'p-bulkbar', class: 'bulk-bar', role: 'region', 'aria-label': 'Bulk actions', hidden: true }),
    el('div', { id: 'p-results' }, [el('div', { class: 'spinner' })])
  );
}

function catalogueTools() {
  return el('div', { class: 'catalogue-tools' }, [
    el('h2', { class: 'catalogue-tools__title', text: 'Catalogue tools' }),
    el('div', { class: 'catalogue-tools__actions' }, [
      el('a', { class: 'btn btn--small btn--secondary', href: '/admin/product-import.html', text: 'Bulk import' }),
      el('a', { class: 'btn btn--small btn--ghost', href: api.admin.productsExportUrl(), download: '', text: 'Download current products (CSV)' }),
      el('a', { class: 'btn btn--small btn--ghost', href: api.admin.importTemplateUrl(), download: '', text: 'Download template' }),
    ]),
    el('p', { class: 'hint', text: 'Export the catalogue or the template, edit it in a spreadsheet, then upload it (with photos) to add or bulk-update products. Tick rows below to publish or archive several at once.' }),
  ]);
}

async function load() {
  const results = $('#p-results');
  clear(results).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.admin.getProducts({
      q: query.q || undefined,
      category: query.category || undefined,
      status: query.status || undefined,
      stock: query.stock || undefined,
      page: query.page,
      pageSize: 20,
    });
    clear(results);
    const items = data.items || [];
    pageIds = items.map((p) => p.id);

    const selectAll = el('input', {
      type: 'checkbox',
      class: 'p-check-all',
      'aria-label': 'Select all products on this page',
    });
    selectAll.addEventListener('change', () => {
      pageIds.forEach((id) => {
        if (selectAll.checked) selectedIds.add(id);
        else selectedIds.delete(id);
      });
      $$('.p-row-check').forEach((cb) => { cb.checked = selectAll.checked; });
      syncSelectionUi();
    });

    const rows = items.map((p) => {
      const cb = el('input', {
        type: 'checkbox',
        class: 'p-row-check',
        value: p.id,
        checked: selectedIds.has(p.id),
        'aria-label': `Select ${p.name}`,
      });
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(p.id);
        else selectedIds.delete(p.id);
        syncSelectionUi();
      });
      return el('tr', {}, [
        el('td', {}, [cb]),
        el('td', {}, [imageEl({ thumbUrl: p.primaryThumbUrl, alt: '' }, { altFallback: p.name })]),
        el('td', {}, [el('a', { href: `/admin/product-edit.html?id=${encodeURIComponent(p.id)}`, text: p.name })]),
        el('td', { text: p.category }),
        el('td', { text: money(p.price) }),
        el('td', { text: String(p.totalStock) }),
        el('td', {}, [el('span', { class: `status-badge status-badge--${p.status === 'published' ? 'confirmed' : p.status === 'draft' ? 'pending' : 'cancelled'}`, text: p.status })]),
        el('td', { text: formatDate(p.updatedAt) }),
        el('td', {}, [
          el('a', { class: 'btn btn--small btn--secondary', href: `/admin/product-edit.html?id=${encodeURIComponent(p.id)}`, text: 'Edit' }),
          p.status !== 'archived'
            ? el('button', { class: 'btn btn--small btn--ghost', text: 'Archive', on: { click: () => archive(p.id) } })
            : null,
        ]),
      ]);
    });

    results.append(
      el('p', { class: 'hint', text: `${data.total || 0} products` }),
      el('div', { class: 'admin-table-wrap' }, [
        el('table', { class: 'admin-table admin-table--select' }, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', { scope: 'col' }, [selectAll]),
              ...['Image', 'Name', 'Category', 'Price', 'Stock', 'Status', 'Updated', ''].map((c) =>
                el('th', { scope: 'col', text: c })
              ),
            ]),
          ]),
          el('tbody', {}, rows.length ? rows : [el('tr', {}, [el('td', { colspan: 9, text: 'Nothing to show.' })])]),
        ]),
      ]),
      pager(data.page || 1, data.totalPages || 1, (p) => { query.page = p; load(); })
    );
    syncSelectionUi();
  } catch (err) {
    clear(results).append(errorState(err, load));
  }
}

/* ---------- bulk status actions ---------- */

function syncSelectionUi() {
  const boxes = $$('.p-row-check');
  const checked = boxes.filter((b) => b.checked).length;
  const selectAll = $('.p-check-all');
  if (selectAll) {
    selectAll.checked = boxes.length > 0 && checked === boxes.length;
    selectAll.indeterminate = checked > 0 && checked < boxes.length;
  }
  renderBulkBar();
}

function renderBulkBar() {
  const bar = $('#p-bulkbar');
  if (!bar) return;
  const n = selectedIds.size;
  if (n === 0) {
    bar.hidden = true;
    clear(bar);
    return;
  }
  bar.hidden = false;
  const overCap = n > BULK_CAP;
  clear(bar).append(
    el('span', { class: 'bulk-bar__count', text: `${n} selected` }),
    el('button', { class: 'btn btn--small', type: 'button', disabled: overCap, text: 'Publish selected', on: { click: () => runBulk('published') } }),
    el('button', { class: 'btn btn--small btn--danger', type: 'button', disabled: overCap, text: 'Archive selected', on: { click: confirmArchive } }),
    el('button', { class: 'btn btn--small btn--secondary', type: 'button', disabled: overCap, text: 'Move to draft', on: { click: () => runBulk('draft') } }),
    el('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Clear selection', on: { click: clearSelection } }),
    overCap
      ? el('p', { class: 'bulk-bar__hint hint', text: `You can change up to ${BULK_CAP} products at once — narrow the filter first.` })
      : null
  );
}

function clearSelection() {
  selectedIds.clear();
  $$('.p-row-check').forEach((cb) => { cb.checked = false; });
  syncSelectionUi();
}

function confirmArchive() {
  const bar = $('#p-bulkbar');
  const n = selectedIds.size;
  clear(bar).append(
    el('p', { class: 'bulk-bar__confirm', text: `Archive ${n} product${n === 1 ? '' : 's'}? They'll be hidden from the shop but kept in past orders.` }),
    el('button', { class: 'btn btn--small btn--danger', type: 'button', text: 'Archive', on: { click: () => runBulk('archived') } }),
    el('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Cancel', on: { click: renderBulkBar } })
  );
}

async function runBulk(status) {
  const ids = [...selectedIds];
  if (!ids.length) return;
  if (ids.length > BULK_CAP) {
    toast(`You can change up to ${BULK_CAP} products at once — narrow the filter first.`, 'error');
    return;
  }
  const bar = $('#p-bulkbar');
  clear(bar).append(el('span', { class: 'bulk-bar__count', text: 'Working…' }));
  try {
    const res = await api.admin.bulkProductStatus(ids, status);
    toast(bulkResultText(res, status), 'success');
    selectedIds.clear();
    await load();
  } catch (err) {
    toast((err && err.message) || 'Could not update those products.', 'error');
    renderBulkBar();
  }
}

function bulkResultText(res, status) {
  const verb = status === 'published' ? 'published' : status === 'archived' ? 'archived' : 'moved to draft';
  const results = res.results || [];
  const updated = res.updated != null ? res.updated : results.filter((r) => r.result === 'updated').length;
  const skipped = results.filter((r) => r.result === 'skipped').length;
  const failed = results.filter((r) => r.result === 'failed').length;
  const parts = [`${updated} ${verb}`];
  if (skipped) parts.push(`${skipped} ${status === 'draft' ? 'already a draft' : `already ${verb}`}`);
  if (failed) parts.push(`${failed} not found`);
  return parts.join(' · ');
}

async function archive(id) {
  try {
    await api.admin.deleteProduct(id);
    toast('Product archived.', 'success');
    load();
  } catch (err) {
    toast((err && err.message) || 'Could not archive that product.', 'error');
  }
}

function select(id, label, options, value) {
  return el('select', { class: 'select', id, 'aria-label': label },
    options.map((o) => el('option', { value: o, text: o || `All ${label.toLowerCase()}`, selected: o === value }))
  );
}
function labelled(label, node) {
  return el('label', { class: 'field', style: 'margin:0' }, [el('span', { class: 'hint', text: label }), node]);
}
