import { api } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState } from '../../components.js';
import { getParam } from '../../util.js';
import { adminShell, adminTable, pager } from './_shell.js';
import { toast } from '../../toast.js';

let content;
let q = getParam('q') || '';
let stock = getParam('stock') || '';
let page = 1;

start();

async function start() {
  const shell = await adminShell('inventory', 'Inventory');
  if (!shell) return;
  content = shell.content;

  const search = el('input', { class: 'input', 'aria-label': 'Search inventory', placeholder: 'Search product or SKU', value: q });
  const stockSel = el('select', { class: 'select', 'aria-label': 'Stock filter' }, ['', 'in', 'low', 'out'].map((s) => el('option', { value: s, text: s || 'All stock', selected: s === stock })));
  const apply = () => { q = search.value.trim(); stock = stockSel.value; page = 1; load(); };
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  stockSel.addEventListener('change', apply);

  content.append(
    el('div', { class: 'admin-filters' }, [
      el('label', { class: 'field', style: 'margin:0' }, [el('span', { class: 'hint', text: 'Search' }), search]),
      el('label', { class: 'field', style: 'margin:0' }, [el('span', { class: 'hint', text: 'Stock' }), stockSel]),
      el('button', { class: 'btn btn--small', text: 'Apply', on: { click: apply } }),
    ]),
    el('div', { id: 'inv-results' }, [el('div', { class: 'spinner' })])
  );
  await load();
}

async function load() {
  const results = $('#inv-results');
  clear(results).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.admin.getInventory({ q: q || undefined, stock: stock || undefined, page, pageSize: 25 });
    clear(results);
    const rows = (data.items || []).map((v) =>
      el('tr', {}, [
        el('td', { text: v.productName }),
        el('td', { text: v.sku }),
        el('td', { text: Object.values(v.options || {}).join(' / ') }),
        el('td', { text: String(v.stock) }),
        el('td', { text: String(v.lowStockThreshold) }),
        el('td', {}, [el('span', { class: `stock-cue stock-cue--${v.stockState === 'in_stock' ? 'in' : v.stockState === 'low_stock' ? 'low' : 'out'}`, text: v.stockState.replace(/_/g, ' ') })]),
        el('td', {}, [
          el('button', { class: 'btn btn--small btn--secondary', text: 'Record adjustment', on: { click: () => openAdjust(v) } }),
          el('button', { class: 'btn btn--small btn--ghost', text: 'History', on: { click: () => showHistory(v) } }),
        ]),
      ])
    );
    results.append(
      el('p', { class: 'hint', text: `${data.total || 0} variants` }),
      adminTable(['Product', 'SKU', 'Options', 'Stock', 'Low at', 'State', ''], rows),
      pager(data.page || 1, data.totalPages || 1, (p) => { page = p; load(); }),
      el('div', { id: 'inv-slot' })
    );
  } catch (err) {
    clear(results).append(errorState(err, load));
  }
}

function openAdjust(v) {
  const slot = $('#inv-slot');
  clear(slot);
  const delta = el('input', { class: 'input', type: 'number', inputmode: 'numeric', 'aria-label': 'Quantity change', placeholder: 'e.g. 12 or -3' });
  const reason = el('select', { class: 'select', 'aria-label': 'Reason' }, ['restock', 'correction', 'damage', 'return_to_stock'].map((r) => el('option', { value: r, text: r.replace(/_/g, ' ') })));
  const note = el('input', { class: 'input', 'aria-label': 'Note', placeholder: 'PO #, context…' });
  const status = el('div', { role: 'alert' });
  slot.append(
    el('form', {
      class: 'card stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          const n = parseInt(delta.value, 10);
          if (Number.isNaN(n) || n === 0) { status.append(el('p', { class: 'error-text', text: 'Enter a non-zero whole number.' })); return; }
          const btn = e.target.querySelector('button');
          btn.classList.add('is-loading');
          try {
            const res = await api.admin.createAdjustment({ variantId: v.variantId, delta: n, reason: reason.value, note: note.value.trim() || undefined });
            toast(`${v.sku}: stock now ${res.resultingStock}.`, 'success');
            clear(slot);
            load();
          } catch (err) {
            btn.classList.remove('is-loading');
            status.append(el('p', { class: 'error-text', text: (err && err.message) || 'Could not record that adjustment.' }));
          }
        },
      },
    }, [
      el('h3', { text: `Adjust ${v.productName} — ${v.sku}` }),
      el('p', { class: 'hint', text: `Current stock: ${v.stock}. Positive adds, negative removes. Crossing 0 → positive fires back-in-stock alerts.` }),
      el('div', { class: 'form-row form-row--2' }, [
        el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Change' }), delta]),
        el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Reason' }), reason]),
      ]),
      el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Note' }), note]),
      status,
      el('div', { style: 'display:flex;gap:.5rem' }, [
        el('button', { class: 'btn', type: 'submit', text: 'Record adjustment' }),
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Cancel', on: { click: () => clear(slot) } }),
      ]),
    ])
  );
  slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function showHistory(v) {
  const slot = $('#inv-slot');
  clear(slot).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.admin.getAdjustments({ variantId: v.variantId, page: 1, pageSize: 20 });
    clear(slot);
    slot.append(
      el('div', { class: 'card' }, [
        el('h3', { text: `Adjustment history — ${v.sku}` }),
        adminTable(['When', 'Change', 'Reason', 'Result', 'By'], (data.items || []).map((a) =>
          el('tr', {}, [
            el('td', { text: new Date(a.createdAt).toLocaleString('en-KE') }),
            el('td', { text: (a.delta > 0 ? '+' : '') + a.delta }),
            el('td', { text: a.reason }),
            el('td', { text: String(a.resultingStock) }),
            el('td', { text: a.createdBy || '—' }),
          ])
        )),
        el('button', { class: 'btn btn--small btn--ghost', text: 'Close', on: { click: () => clear(slot) } }),
      ])
    );
  } catch (err) {
    clear(slot).append(errorState(err, () => showHistory(v)));
  }
}
