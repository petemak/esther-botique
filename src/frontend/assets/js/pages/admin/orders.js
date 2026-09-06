import { api } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState } from '../../components.js';
import { getParam, formatDate } from '../../util.js';
import { adminShell, adminTable, pager, money } from './_shell.js';

let content;
const filters = {
  status: getParam('status') || '',
  paymentState: getParam('paymentState') || '',
  paymentMethod: getParam('paymentMethod') || '',
  q: getParam('q') || '',
  page: 1,
};

start();

async function start() {
  const shell = await adminShell('orders', 'Orders');
  if (!shell) return;
  content = shell.content;

  const q = el('input', { class: 'input', 'aria-label': 'Search orders', placeholder: 'Order #, phone or email', value: filters.q });
  const status = sel('Status', ['', 'placed', 'confirmed', 'packed', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'], filters.status);
  const pstate = sel('Payment', ['', 'pending', 'paid', 'failed', 'refunded', 'awaiting_delivery'], filters.paymentState);
  const pmethod = sel('Method', ['', 'mpesa', 'pay_on_delivery'], filters.paymentMethod);
  const apply = () => {
    Object.assign(filters, { q: q.value.trim(), status: status.value, paymentState: pstate.value, paymentMethod: pmethod.value, page: 1 });
    load();
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  [status, pstate, pmethod].forEach((s) => s.addEventListener('change', apply));

  content.append(
    el('div', { class: 'admin-filters' }, [
      lab('Search', q), lab('Status', status), lab('Payment', pstate), lab('Method', pmethod),
      el('button', { class: 'btn btn--small', text: 'Apply', on: { click: apply } }),
    ]),
    el('div', { id: 'o-results' }, [el('div', { class: 'spinner' })])
  );
  await load();
}

async function load() {
  const results = $('#o-results');
  clear(results).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.admin.getOrders({
      status: filters.status || undefined,
      paymentState: filters.paymentState || undefined,
      paymentMethod: filters.paymentMethod || undefined,
      q: filters.q || undefined,
      page: filters.page,
      pageSize: 25,
    });
    clear(results);
    const rows = (data.items || []).map((o) =>
      el('tr', {}, [
        el('td', {}, [el('a', { href: `/admin/order.html?order=${encodeURIComponent(o.orderNumber)}`, text: o.orderNumber })]),
        el('td', { text: formatDate(o.placedAt) }),
        el('td', { text: o.customerName }),
        el('td', { text: o.county }),
        el('td', { text: money(o.total) }),
        el('td', { text: o.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Pay on delivery' }),
        el('td', {}, [el('span', { class: `status-badge status-badge--${o.paymentState}`, text: o.paymentState.replace(/_/g, ' ') })]),
        el('td', {}, [el('span', { class: `status-badge status-badge--${o.status}`, text: o.status.replace(/_/g, ' ') })]),
      ])
    );
    results.append(
      el('p', { class: 'hint', text: `${data.total || 0} orders` }),
      adminTable(['Order', 'Placed', 'Customer', 'County', 'Total', 'Method', 'Payment', 'Status'], rows),
      pager(data.page || 1, data.totalPages || 1, (p) => { filters.page = p; load(); })
    );
  } catch (err) {
    clear(results).append(errorState(err, load));
  }
}

function sel(label, opts, value) {
  return el('select', { class: 'select', 'aria-label': label }, opts.map((o) => el('option', { value: o, text: o ? o.replace(/_/g, ' ') : `All`, selected: o === value })));
}
function lab(label, node) {
  return el('label', { class: 'field', style: 'margin:0' }, [el('span', { class: 'hint', text: label }), node]);
}
