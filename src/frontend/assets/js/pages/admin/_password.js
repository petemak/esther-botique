import { api, ApiError } from '../../api.js';
import { el } from '../../dom.js';
import { fieldError } from '../../components.js';

/**
 * The change-password form used in two places (design-spec page 44):
 *  - the forced first-login / post-reset gate (see _shell.js)
 *  - the normal admin Account area (see account.js)
 *
 * Both call `POST /api/admin/auth/change-password` with
 * { currentPassword, newPassword }. The confirm-new field is a client-side
 * match check only.
 *
 * opts:
 *  - currentLabel   label for the current-password field (default "Current password")
 *  - submitLabel    submit button text (default "Change password")
 *  - onSuccess(res) called with the API response on 200
 */
export function passwordChangeForm({ currentLabel = 'Current password', submitLabel = 'Change password', onSuccess } = {}) {
  const idp = `pw-${Math.random().toString(36).slice(2, 7)}`;

  const current = passwordField(`${idp}-current`, currentLabel, 'current-password');
  const next = passwordField(`${idp}-new`, 'New password', 'new-password');
  const confirm = passwordField(`${idp}-confirm`, 'Confirm new password', 'new-password');
  const alert = el('div', { role: 'alert' });

  const form = el('form', {
    class: 'stack',
    novalidate: true,
    on: {
      submit: async (e) => {
        e.preventDefault();
        clearAlert(alert);
        [current, next, confirm].forEach((f) => fieldError(f.input, null));

        let ok = true;
        if (!current.input.value) { fieldError(current.input, 'Enter your current password.'); ok = false; }
        if (!next.input.value || next.input.value.length < 8) {
          fieldError(next.input, 'Use at least 8 characters.');
          ok = false;
        }
        if (confirm.input.value !== next.input.value) {
          fieldError(confirm.input, 'This does not match the new password.');
          ok = false;
        }
        if (!ok) return;

        const btn = form.querySelector('button[type="submit"]');
        btn.classList.add('is-loading');
        btn.disabled = true;
        try {
          const res = await api.admin.changePassword({
            currentPassword: current.input.value,
            newPassword: next.input.value,
          });
          if (onSuccess) onSuccess(res);
        } catch (err) {
          btn.classList.remove('is-loading');
          btn.disabled = false;
          if (err instanceof ApiError && err.code === 'current_password_incorrect') {
            fieldError(current.input, "That current password doesn't match.");
          } else if (err instanceof ApiError && err.status === 422) {
            alert.append(el('div', { class: 'alert alert--error', text: err.message || 'That new password was rejected. Pick a longer, less common one.' }));
          } else {
            alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not change your password. Try again.' }));
          }
        }
      },
    },
  }, [
    current.node,
    next.node,
    el('p', { class: 'hint', text: 'At least 8 characters. Not a common or easily-guessed password — the same rules as the shop sign-up form.' }),
    confirm.node,
    alert,
    el('button', { class: 'btn', type: 'submit', text: submitLabel }),
  ]);

  return form;
}

function passwordField(id, label, autocomplete) {
  const input = el('input', { class: 'input', id, name: id, type: 'password', autocomplete, required: true });
  input.addEventListener('input', () => fieldError(input, null));
  const toggle = el('button', {
    class: 'btn btn--small btn--ghost pw-toggle',
    type: 'button',
    'aria-pressed': 'false',
    text: 'Show',
    on: {
      click: () => {
        const shown = input.type === 'text';
        input.type = shown ? 'password' : 'text';
        toggle.textContent = shown ? 'Show' : 'Hide';
        toggle.setAttribute('aria-pressed', String(!shown));
      },
    },
  });
  const node = el('div', { class: 'field' }, [
    el('label', { for: id, text: label }),
    el('div', { class: 'pw-input' }, [input, toggle]),
  ]);
  return { node, input, toggle };
}

function clearAlert(alert) {
  while (alert.firstChild) alert.removeChild(alert.firstChild);
}
