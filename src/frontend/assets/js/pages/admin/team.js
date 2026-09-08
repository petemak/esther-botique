import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState, fieldError } from '../../components.js';
import { adminShell, adminTable } from './_shell.js';
import { formatDateTime } from '../../util.js';
import { toast } from '../../toast.js';

/*
 * A16 — Team (admin users). Owner-only. The server enforces role = 'owner' on every
 * /api/admin/users* call and 403s a staff caller; this page additionally hides itself
 * from staff (no Team nav item) and bounces a staff session to the dashboard. That is
 * convenience only — the API is the authority.
 */

let content;
let currentUserId = null;
let notice = null; // the just-created AdminUser, kept across a table refresh

start();

async function start() {
  const shell = await adminShell('team', 'Team');
  if (!shell) return;

  if (shell.role !== 'owner') {
    window.location.replace('/admin/');
    return;
  }

  content = shell.content;
  currentUserId = shell.user && shell.user.id;
  await refresh();
}

async function refresh() {
  clear(content).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.admin.getUsers();
    render(data.items || []);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      window.location.replace('/admin/');
      return;
    }
    clear(content).append(errorState(err, refresh));
  }
}

function render(items) {
  clear(content);
  content.append(
    el('p', { class: 'hint', text: 'Add, adjust and retire the logins of people who help run the shop. Owner-only — staff never see this page.' }),
    addForm(),
    el('h2', { style: 'font-size:var(--step-1);margin-top:var(--space-l)', text: 'Administrators' }),
    adminTable(
      ['Name', 'Email', 'Role', 'Status', 'Last sign-in', ''],
      items.map((u) => row(u))
    ),
    el('div', { id: 'team-edit-slot' })
  );
  if (notice) showCreated($('#t-result'), notice);
}

function row(u) {
  const disabled = u.status === 'disabled';
  const isSelf = u.id === currentUserId;
  return el('tr', { class: disabled ? 'team-row--disabled' : null }, [
    el('td', {}, [
      document.createTextNode(u.name),
      isSelf ? el('span', { class: 'hint', text: ' (you)' }) : null,
      u.mustChangePassword ? el('span', { class: 'team-badge team-badge--pending', style: 'margin-left:.4rem', text: 'must set password' }) : null,
    ]),
    el('td', { text: u.email }),
    el('td', { text: u.role === 'owner' ? 'Owner' : 'Staff' }),
    el('td', {}, [
      el('span', { class: `team-badge team-badge--${disabled ? 'disabled' : 'active'}`, text: disabled ? 'Disabled' : 'Active' }),
    ]),
    el('td', { text: u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—' }),
    el('td', {}, [
      el('div', { class: 'row-actions' }, [
        el('button', { class: 'btn btn--small btn--secondary', type: 'button', text: 'Edit', on: { click: () => openEdit(u) } }),
        el('button', {
          class: 'btn btn--small btn--ghost',
          type: 'button',
          text: disabled ? 'Reactivate' : 'Deactivate',
          on: { click: () => toggleStatus(u) },
        }),
        isSelf ? null : el('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Reset password', on: { click: () => openReset(u) } }),
      ]),
    ]),
  ]);
}

/* ---------------- Add administrator ---------------- */
function addForm() {
  const name = textField('t-name', 'Name', 'name');
  const email = textField('t-email', 'Email', 'email');
  email.input.type = 'email';
  const role = el('select', { class: 'select', id: 't-role', name: 'role' }, [
    el('option', { value: 'staff', text: 'Staff', selected: true }),
    el('option', { value: 'owner', text: 'Owner' }),
  ]);
  const pw = textField('t-password', 'Initial password', 'new-password');
  pw.input.type = 'password';
  const pwToggle = el('button', {
    class: 'btn btn--small btn--ghost pw-toggle',
    type: 'button',
    'aria-pressed': 'false',
    text: 'Show',
    on: {
      click: () => {
        const shown = pw.input.type === 'text';
        pw.input.type = shown ? 'password' : 'text';
        pwToggle.textContent = shown ? 'Show' : 'Hide';
        pwToggle.setAttribute('aria-pressed', String(!shown));
      },
    },
  });
  pw.wrap.append(pwToggle);

  const alert = el('div', { role: 'alert' });
  const result = el('div', { id: 't-result' });

  const form = el('form', {
    class: 'card stack',
    novalidate: true,
    on: {
      submit: async (e) => {
        e.preventDefault();
        clearNode(alert);
        [name, email, pw].forEach((f) => fieldError(f.input, null));

        let ok = true;
        if (!name.input.value.trim()) { fieldError(name.input, 'Enter their name.'); ok = false; }
        if (!email.input.value.trim()) { fieldError(email.input, 'Enter their email.'); ok = false; }
        if (!pw.input.value || pw.input.value.length < 8) { fieldError(pw.input, 'Use at least 8 characters.'); ok = false; }
        if (!ok) return;

        const btn = form.querySelector('button[type="submit"]');
        btn.classList.add('is-loading');
        btn.disabled = true;
        try {
          const created = await api.admin.createUser({
            name: name.input.value.trim(),
            email: email.input.value.trim(),
            role: role.value,
            initialPassword: pw.input.value,
          });
          form.reset();
          role.value = 'staff';
          notice = created;
          await refresh();
        } catch (err) {
          btn.classList.remove('is-loading');
          btn.disabled = false;
          if (err instanceof ApiError && err.code === 'email_taken') {
            fieldError(email.input, 'An admin already uses that email — reactivate them instead.');
          } else if (err instanceof ApiError && err.status === 422) {
            alert.append(el('div', { class: 'alert alert--error', text: err.message || 'Please check the fields — the password must be at least 8 characters and not a common one.' }));
          } else {
            alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not add that administrator.' }));
          }
        }
      },
    },
  }, [
    el('h2', { style: 'font-size:var(--step-1)', text: 'Add administrator' }),
    el('p', { class: 'hint', text: 'You set a starting password and share it with them privately — there is no email invite. They choose their own password the first time they sign in.' }),
    el('div', { class: 'form-row form-row--2' }, [name.node, email.node]),
    el('div', { class: 'field' }, [el('label', { for: 't-role', text: 'Role' }), role]),
    pw.node,
    alert,
    el('button', { class: 'btn', type: 'submit', text: 'Add administrator' }),
    result,
  ]);

  return form;
}

function showCreated(slot, u) {
  clearNode(slot);
  slot.append(
    el('div', { class: 'alert alert--success stack' }, [
      el('p', {}, [
        el('strong', { text: `${u.name} added` }),
        document.createTextNode(` as ${u.role === 'owner' ? 'an Owner' : 'a Staff'} admin (${u.email}).`),
      ]),
      el('p', { text: 'Share the initial password with them privately — over a call or a message, not email. They will be asked to set their own password the first time they sign in.' }),
    ])
  );
}

/* ---------------- Edit name + role ---------------- */
function openEdit(u) {
  const slot = $('#team-edit-slot');
  clearNode(slot);

  const name = textField('e-name', 'Name', 'name');
  name.input.value = u.name;
  const role = el('select', { class: 'select', id: 'e-role', name: 'role' }, [
    el('option', { value: 'staff', text: 'Staff', selected: u.role === 'staff' }),
    el('option', { value: 'owner', text: 'Owner', selected: u.role === 'owner' }),
  ]);
  const alert = el('div', { role: 'alert' });

  slot.append(
    el('form', {
      class: 'card stack',
      novalidate: true,
      on: {
        submit: async (e) => {
          e.preventDefault();
          clearNode(alert);
          fieldError(name.input, null);
          if (!name.input.value.trim()) { fieldError(name.input, 'Name cannot be empty.'); return; }

          const btn = e.target.querySelector('button[type="submit"]');
          btn.classList.add('is-loading');
          btn.disabled = true;
          try {
            await api.admin.updateUser(u.id, { name: name.input.value.trim(), role: role.value });
            toast('Saved.', 'success');
            notice = null;
            clearNode(slot);
            await refresh();
          } catch (err) {
            btn.classList.remove('is-loading');
            btn.disabled = false;
            alert.append(el('div', { class: 'alert alert--error', text: editErrorMessage(err) }));
          }
        },
      },
    }, [
      el('h3', { text: `Edit ${u.name}` }),
      name.node,
      el('div', { class: 'field' }, [el('label', { for: 'e-role', text: 'Role' }), role]),
      el('p', { class: 'hint', text: 'There has to be at least one active owner at all times, including your own account.' }),
      alert,
      el('div', { style: 'display:flex;gap:.5rem' }, [
        el('button', { class: 'btn btn--small', type: 'submit', text: 'Save' }),
        el('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Cancel', on: { click: () => clearNode(slot) } }),
      ]),
    ])
  );
  slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------------- Deactivate / Reactivate ---------------- */
async function toggleStatus(u) {
  notice = null;
  const next = u.status === 'disabled' ? 'active' : 'disabled';
  if (next === 'disabled') {
    const ok = window.confirm(`${u.name} will be signed out and cannot sign in until you reactivate them. Their name stays on past orders and stock changes. Continue?`);
    if (!ok) return;
  }
  try {
    await api.admin.updateUser(u.id, { status: next });
    toast(next === 'disabled' ? 'Administrator deactivated.' : 'Administrator reactivated.', 'success');
    await refresh();
  } catch (err) {
    toast(editErrorMessage(err), 'error');
  }
}

/* ---------------- Reset password ---------------- */
function openReset(u) {
  const slot = $('#team-edit-slot');
  clearNode(slot);

  const pw = textField('r-password', 'New temporary password', 'new-password');
  pw.input.type = 'password';
  const toggle = el('button', {
    class: 'btn btn--small btn--ghost pw-toggle',
    type: 'button',
    'aria-pressed': 'false',
    text: 'Show',
    on: {
      click: () => {
        const shown = pw.input.type === 'text';
        pw.input.type = shown ? 'password' : 'text';
        toggle.textContent = shown ? 'Show' : 'Hide';
        toggle.setAttribute('aria-pressed', String(!shown));
      },
    },
  });
  pw.wrap.append(toggle);
  const alert = el('div', { role: 'alert' });

  slot.append(
    el('form', {
      class: 'card stack',
      novalidate: true,
      on: {
        submit: async (e) => {
          e.preventDefault();
          clearNode(alert);
          fieldError(pw.input, null);
          if (!pw.input.value || pw.input.value.length < 8) { fieldError(pw.input, 'Use at least 8 characters.'); return; }

          const btn = e.target.querySelector('button[type="submit"]');
          btn.classList.add('is-loading');
          btn.disabled = true;
          try {
            await api.admin.resetUserPassword(u.id, { newPassword: pw.input.value });
            toast('Temporary password set. Share it privately.', 'success');
            clearNode(slot);
            await refresh();
          } catch (err) {
            btn.classList.remove('is-loading');
            btn.disabled = false;
            if (err instanceof ApiError && err.status === 422) {
              fieldError(pw.input, err.message || 'That password is too weak or too common.');
            } else {
              alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not reset that password.' }));
            }
          }
        },
      },
    }, [
      el('h3', { text: `Reset ${u.name}'s password` }),
      el('p', { class: 'hint', text: 'Sets a temporary password and signs them out. Share the new password privately; they set their own on next sign-in.' }),
      pw.node,
      alert,
      el('div', { style: 'display:flex;gap:.5rem' }, [
        el('button', { class: 'btn btn--small', type: 'submit', text: 'Set temporary password' }),
        el('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Cancel', on: { click: () => clearNode(slot) } }),
      ]),
    ])
  );
  slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------------- helpers ---------------- */
function editErrorMessage(err) {
  if (err instanceof ApiError && err.code === 'last_owner') {
    return "You can't remove or demote the only owner — add another owner first.";
  }
  if (err instanceof ApiError && err.status === 422) {
    return err.message || 'That change was rejected.';
  }
  return (err && err.message) || 'Could not save that change.';
}

function textField(id, label, autocomplete) {
  const input = el('input', { class: 'input', id, name: id, type: 'text', autocomplete });
  input.addEventListener('input', () => fieldError(input, null));
  const wrap = el('div', { class: 'pw-input' }, [input]);
  const node = el('div', { class: 'field' }, [el('label', { for: id, text: label }), wrap]);
  return { node, input, wrap };
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
