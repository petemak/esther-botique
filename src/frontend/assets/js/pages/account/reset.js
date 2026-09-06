import { api, ApiError } from '../../api.js';
import { el, clear } from '../../dom.js';
import { fieldError } from '../../components.js';
import { getParam, setPageMeta } from '../../util.js';
import { bootStorefront, view } from '../_boot.js';

bootStorefront({ active: '' });
setPageMeta({ noindex: true });

const token = getParam('token');

render();

function render() {
  const root = view();
  clear(root);
  if (!token) {
    root.append(
      el('div', { class: 'auth-card stack', style: 'text-align:center' }, [
        el('h1', { text: 'Reset link incomplete' }),
        el('p', { text: 'This link is missing its token. Request a new one.' }),
        el('a', { class: 'btn btn--secondary', href: '/account/forgot-password.html', text: 'Request a reset link' }),
      ])
    );
    return;
  }

  const pw = el('input', { class: 'input', id: 'rp-pw', name: 'password', type: 'password', required: true, autocomplete: 'new-password' });
  const confirm = el('input', { class: 'input', id: 'rp-confirm', name: 'confirm', type: 'password', required: true, autocomplete: 'new-password' });
  [pw, confirm].forEach((i) => i.addEventListener('input', () => fieldError(i, null)));
  const status = el('div', { role: 'alert' });

  root.append(
    el('div', { class: 'auth-card stack' }, [
      el('h1', { text: 'Set a new password' }),
      el('form', {
        class: 'stack',
        novalidate: true,
        on: {
          submit: async (e) => {
            e.preventDefault();
            clear(status);
            if (pw.value.length < 8) { fieldError(pw, 'Use at least 8 characters.'); return; }
            if (pw.value !== confirm.value) { fieldError(confirm, 'Passwords do not match.'); return; }
            const btn = e.target.querySelector('button');
            btn.classList.add('is-loading');
            try {
              const res = await api.resetPassword(token, pw.value);
              clear(root).append(
                el('div', { class: 'auth-card stack', style: 'text-align:center' }, [
                  el('h1', { text: 'Password updated' }),
                  el('p', { text: res.message || 'You can sign in now.' }),
                  el('a', { class: 'btn', href: '/account/signin.html', text: 'Sign in' }),
                ])
              );
            } catch (err) {
              btn.classList.remove('is-loading');
              if (err instanceof ApiError && err.status === 422 && err.code === 'reset_token_invalid') {
                status.append(el('div', { class: 'alert alert--warning' }, [
                  document.createTextNode('This reset link has expired or was already used. '),
                  el('a', { href: '/account/forgot-password.html', text: 'Request a new one' }),
                  document.createTextNode('.'),
                ]));
              } else if (err instanceof ApiError && err.status === 422) {
                fieldError(pw, err.message || 'That password is too weak.');
              } else {
                status.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not reset your password.' }));
              }
            }
          },
        },
      }, [
        el('div', { class: 'field' }, [el('label', { for: 'rp-pw', html: 'New password <span class="req">*</span>' }), pw, el('p', { class: 'hint', text: 'At least 8 characters.' })]),
        el('div', { class: 'field' }, [el('label', { for: 'rp-confirm', html: 'Confirm password <span class="req">*</span>' }), confirm]),
        status,
        el('button', { class: 'btn btn--block', type: 'submit', text: 'Update password' }),
      ]),
    ])
  );
}
