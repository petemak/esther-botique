import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState, fieldError, applyValidationErrors } from '../../components.js';
import { accountShell } from './_shell.js';
import { toast } from '../../toast.js';

let content;

start();

async function start() {
  const shell = await accountShell('addresses');
  if (!shell) return;
  content = shell.content;
  await refresh();
}

async function refresh() {
  clear(content).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.getAddresses();
    render(data.items || []);
  } catch (err) {
    clear(content).append(errorState(err, refresh));
  }
}

function render(items) {
  clear(content);
  content.append(el('h2', { text: 'Saved addresses', style: 'font-size:var(--step-2)' }));

  if (!items.length) {
    content.append(el('p', { class: 'text-muted', text: 'No saved addresses yet. Add one to speed up checkout.' }));
  }

  const list = el('div', { class: 'stack' });
  items.forEach((a) => {
    list.append(
      el('div', { class: 'card' }, [
        el('p', {}, [
          el('strong', { text: a.recipientName }),
          a.isDefault ? el('span', { class: 'status-badge status-badge--confirmed', style: 'margin-left:.5rem', text: 'Default' }) : null,
        ]),
        el('p', { class: 'text-muted', text: `${a.town}, ${a.county} · ${a.phone}` }),
        a.instructions ? el('p', { class: 'hint', text: a.instructions }) : null,
        el('div', { class: 'row-actions', style: 'margin-top:.5rem' }, [
          el('button', { class: 'btn btn--small btn--secondary', text: 'Edit', on: { click: () => openForm(a) } }),
          !a.isDefault ? el('button', { class: 'btn btn--small btn--ghost', text: 'Make default', on: { click: () => setDefault(a.id) } }) : null,
          el('button', { class: 'btn btn--small btn--ghost', text: 'Delete', on: { click: () => remove(a.id) } }),
        ]),
      ])
    );
  });
  content.append(list);
  content.append(el('button', { class: 'btn', style: 'margin-top:1rem', text: 'Add an address', on: { click: () => openForm(null) } }));
  content.append(el('div', { id: 'addr-form-slot' }));
}

function openForm(existing) {
  const slot = $('#addr-form-slot');
  clear(slot);
  const f = (name, label, opts = {}) => {
    const id = `af-${name}`;
    const node = opts.textarea ? el('textarea', { class: 'textarea', id, name }) : el('input', { class: 'input', id, name });
    if (existing && existing[opts.key || name] != null) node.value = existing[opts.key || name];
    if (opts.required) node.required = true;
    node.addEventListener('input', () => fieldError(node, null));
    return el('div', { class: 'field' }, [el('label', { for: id, html: `${label}${opts.required ? ' <span class="req">*</span>' : ''}` }), node]);
  };

  const form = el('form', {
    class: 'card stack',
    novalidate: true,
    on: { submit: (e) => save(e, existing) },
  }, [
    el('h3', { text: existing ? 'Edit address' : 'New address' }),
    f('recipientName', 'Recipient name', { required: true }),
    f('phone', 'Phone', { required: true }),
    f('county', 'County', { required: true }),
    f('town', 'Town / estate', { required: true }),
    f('instructions', 'Delivery instructions', { textarea: true }),
    el('label', { class: 'checkbox' }, [
      el('input', { type: 'checkbox', name: 'isDefault', checked: existing ? !!existing.isDefault : false }),
      el('span', { text: 'Make this my default address' }),
    ]),
    el('div', { role: 'alert', id: 'addr-form-alert' }),
    el('div', { style: 'display:flex;gap:.5rem' }, [
      el('button', { class: 'btn', type: 'submit', text: 'Save address' }),
      el('button', { class: 'btn btn--ghost', type: 'button', text: 'Cancel', on: { click: () => clear(slot) } }),
    ]),
  ]);
  slot.append(form);
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function save(e, existing) {
  e.preventDefault();
  const form = e.target;
  const alert = $('#addr-form-alert');
  clear(alert);
  const body = {};
  ['recipientName', 'phone', 'county', 'town', 'instructions'].forEach((n) => {
    body[n] = form.querySelector(`[name="${n}"]`).value.trim();
  });
  body.isDefault = form.querySelector('[name="isDefault"]').checked;
  let ok = true;
  ['recipientName', 'phone', 'county', 'town'].forEach((n) => {
    const valid = body[n].length > 0;
    fieldError(form.querySelector(`[name="${n}"]`), valid ? null : 'Required.');
    if (!valid) ok = false;
  });
  if (!ok) return;
  if (!body.instructions) delete body.instructions;

  const btn = form.querySelector('button[type="submit"]');
  btn.classList.add('is-loading');
  try {
    if (existing) await api.updateAddress(existing.id, body);
    else await api.createAddress(body);
    toast('Address saved.', 'success');
    await refresh();
  } catch (err) {
    btn.classList.remove('is-loading');
    if (err instanceof ApiError && err.status === 422) {
      applyValidationErrors(form, err.details);
      alert.append(el('div', { class: 'alert alert--error', text: err.message || 'Please check the fields.' }));
    } else {
      alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not save that address.' }));
    }
  }
}

async function setDefault(id) {
  try {
    await api.updateAddress(id, { isDefault: true });
    await refresh();
  } catch (err) {
    toast((err && err.message) || 'Could not update the default.', 'error');
  }
}

async function remove(id) {
  try {
    await api.deleteAddress(id);
    toast('Address removed.');
    await refresh();
  } catch (err) {
    toast((err && err.message) || 'Could not remove that address.', 'error');
  }
}
