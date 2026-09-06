import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState, fieldError } from '../../components.js';
import { adminShell, adminTable, money } from './_shell.js';
import { formatDate } from '../../util.js';
import { toast } from '../../toast.js';

let content;

start();

async function start() {
  const shell = await adminShell('discounts', 'Discount codes');
  if (!shell) return;
  content = shell.content;
  await refresh();
}

async function refresh() {
  clear(content).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.admin.getDiscounts();
    render(data.items || data || []);
  } catch (err) {
    clear(content).append(errorState(err, refresh));
  }
}

function render(items) {
  clear(content);
  content.append(
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
      el('h2', { style: 'font-size:var(--step-1)', text: 'Codes' }),
      el('button', { class: 'btn btn--small', text: 'New code', on: { click: () => openForm(null) } }),
    ]),
    adminTable(['Code', 'Type', 'Value', 'Min spend', 'Used', 'Window', 'Active', ''], items.map((d) =>
      el('tr', {}, [
        el('td', { text: d.code }),
        el('td', { text: d.type }),
        el('td', { text: d.type === 'percent' ? `${d.value}%` : d.type === 'fixed' ? money({ amount: d.value, currency: 'KES' }) : 'Free delivery' }),
        el('td', { text: d.minSpend ? money(d.minSpend) : '—' }),
        el('td', { text: d.usageCount != null ? `${d.usageCount}${d.usageLimitTotal ? '/' + d.usageLimitTotal : ''}` : '—' }),
        el('td', { text: `${d.startsAt ? formatDate(d.startsAt) : '—'} → ${d.endsAt ? formatDate(d.endsAt) : '—'}` }),
        el('td', {}, [el('span', { class: `status-badge status-badge--${d.active ? 'confirmed' : 'cancelled'}`, text: d.active ? 'active' : 'off' })]),
        el('td', {}, [
          el('button', { class: 'btn btn--small btn--secondary', text: 'Edit', on: { click: () => openForm(d) } }),
          el('button', { class: 'btn btn--small btn--ghost', text: 'Delete', on: { click: () => del(d.code) } }),
        ]),
      ])
    )),
    el('div', { id: 'd-slot' })
  );
}

function openForm(existing) {
  const slot = $('#d-slot');
  clear(slot);
  const code = field('d-code', 'Code', existing && existing.code);
  const type = el('select', { class: 'select', id: 'd-type' }, ['percent', 'fixed', 'free_delivery'].map((t) => el('option', { value: t, text: t, selected: existing && existing.type === t })));
  const value = field('d-value', 'Value (percent or KES)', existing && existing.value, 'number');
  const minSpend = field('d-min', 'Minimum spend (KES)', existing && existing.minSpend && existing.minSpend.amount, 'number');
  const limitTotal = field('d-lt', 'Usage limit (total)', existing && existing.usageLimitTotal, 'number');
  const limitPer = field('d-lp', 'Usage limit per customer', existing && existing.usageLimitPerCustomer, 'number');
  const cats = field('d-cats', 'Eligible categories (comma separated, blank = all)', existing && (existing.eligibleCategories || []).join(', '));
  const startsAt = field('d-start', 'Starts at', existing && existing.startsAt && existing.startsAt.slice(0, 10), 'date');
  const endsAt = field('d-end', 'Ends at', existing && existing.endsAt && existing.endsAt.slice(0, 10), 'date');
  const active = el('label', { class: 'checkbox' }, [el('input', { type: 'checkbox', id: 'd-active', checked: existing ? !!existing.active : true }), el('span', { text: 'Active' })]);
  const alert = el('div', { role: 'alert' });

  slot.append(
    el('form', {
      class: 'card stack',
      on: { submit: (e) => save(e, existing) },
    }, [
      el('h3', { text: existing ? `Edit ${existing.code}` : 'New discount code' }),
      code,
      el('div', { class: 'field' }, [el('label', { for: 'd-type', text: 'Type' }), type]),
      value,
      minSpend,
      el('div', { class: 'form-row form-row--2' }, [limitTotal, limitPer]),
      cats,
      el('div', { class: 'form-row form-row--2' }, [startsAt, endsAt]),
      active,
      alert,
      el('div', { style: 'display:flex;gap:.5rem' }, [
        el('button', { class: 'btn btn--small', type: 'submit', text: 'Save code' }),
        el('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Cancel', on: { click: () => clear(slot) } }),
      ]),
    ])
  );
  slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function field(id, label, value, type) {
  const i = el('input', { class: 'input', id, type: type || 'text' });
  if (value != null && value !== '') i.value = value;
  i.addEventListener('input', () => fieldError(i, null));
  return el('div', { class: 'field' }, [el('label', { for: id, text: label }), i]);
}

async function save(e, existing) {
  e.preventDefault();
  const alert = e.target.querySelector('[role="alert"]');
  clear(alert);
  const v = (id) => $(`#${id}`).value.trim();
  const num = (id) => (v(id) === '' ? undefined : Number(v(id)));
  if (!v('d-code')) { fieldError($('#d-code'), 'A code is required.'); return; }

  const body = {
    code: v('d-code'),
    type: v('d-type'),
    value: num('d-value') || 0,
    minSpend: num('d-min') != null ? { amount: num('d-min'), currency: 'KES' } : undefined,
    usageLimitTotal: num('d-lt'),
    usageLimitPerCustomer: num('d-lp'),
    eligibleCategories: v('d-cats') ? v('d-cats').split(',').map((s) => s.trim()).filter(Boolean) : [],
    startsAt: v('d-start') ? `${v('d-start')}T00:00:00Z` : undefined,
    endsAt: v('d-end') ? `${v('d-end')}T23:59:59Z` : undefined,
    active: $('#d-active').checked,
  };

  const btn = e.target.querySelector('button[type="submit"]');
  btn.classList.add('is-loading');
  try {
    if (existing) await api.admin.updateDiscount(existing.code, body);
    else await api.admin.createDiscount(body);
    toast('Discount saved.', 'success');
    refresh();
  } catch (err) {
    btn.classList.remove('is-loading');
    if (err instanceof ApiError && err.status === 422) {
      alert.append(el('div', { class: 'alert alert--error', text: err.message || 'Please check the fields.' }));
    } else {
      alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not save the discount.' }));
    }
  }
}

async function del(code) {
  if (!window.confirm(`Delete discount ${code}?`)) return;
  try {
    await api.admin.deleteDiscount(code);
    toast('Discount deleted.');
    refresh();
  } catch (err) {
    toast((err && err.message) || 'Could not delete that code.', 'error');
  }
}
