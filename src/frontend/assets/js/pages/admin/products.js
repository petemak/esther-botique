import { api } from '../../api.js';
import { el, clear, imageEl, $ } from '../../dom.js';
import { errorState } from '../../components.js';
import { getParam, formatDate } from '../../util.js';
import { adminShell, adminTable, pager, money } from './_shell.js';
import { toast } from '../../toast.js';

let content;
let query = {
  q: getParam('q') || '',
  category: getParam('category') || '',
  status: getParam('status') || '',
  stock: getParam('stock') || '',
  page: parseInt(getParam('page') || '1', 10),
};

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
    el('div', { id: 'p-results' }, [el('div', { class: 'spinner' })])
  );
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
    const rows = (data.items || []).map((p) =>
      el('tr', {}, [
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
      ])
    );
    results.append(
      el('p', { class: 'hint', text: `${data.total || 0} products` }),
      adminTable(['', 'Name', 'Category', 'Price', 'Stock', 'Status', 'Updated', ''], rows),
      pager(data.page || 1, data.totalPages || 1, (p) => { query.page = p; load(); })
    );
  } catch (err) {
    clear(results).append(errorState(err, load));
  }
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
