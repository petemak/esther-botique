import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { fieldError } from '../../components.js';
import { getParam, ensureAbsoluteCanonical } from '../../util.js';
import { CONFIG } from '../../config.js';

ensureAbsoluteCanonical();
const root = $('#view');
const nextUrl = safeNext(getParam('next'));

init();

async function init() {
  try {
    await api.admin.me();
    window.location.replace(nextUrl);
    return;
  } catch { /* not signed in — show form */ }
  render();
}

function render() {
  clear(root);
  const email = el('input', { class: 'input', id: 'a-email', name: 'email', type: 'email', required: true, autocomplete: 'username' });
  const password = el('input', { class: 'input', id: 'a-password', name: 'password', type: 'password', required: true, autocomplete: 'current-password' });
  [email, password].forEach((i) => i.addEventListener('input', () => fieldError(i, null)));
  const status = el('div', { role: 'alert' });

  root.append(
    el('div', { class: 'wrap' }, [
      el('div', { class: 'auth-card stack', style: 'margin-top:3rem' }, [
        el('p', { class: 'eyebrow', text: `${CONFIG.brand} Admin` }),
        el('h1', { text: 'Sign in' }),
        el('form', {
          class: 'stack',
          novalidate: true,
          on: {
            submit: async (e) => {
              e.preventDefault();
              clear(status);
              let ok = true;
              if (!email.checkValidity() || !email.value.trim()) { fieldError(email, 'Enter your admin email.'); ok = false; }
              if (!password.value) { fieldError(password, 'Enter your password.'); ok = false; }
              if (!ok) return;
              const btn = e.target.querySelector('button');
              btn.classList.add('is-loading');
              try {
                await api.admin.login(email.value.trim(), password.value);
                window.location.assign(nextUrl);
              } catch (err) {
                btn.classList.remove('is-loading');
                const msg = err instanceof ApiError && err.status === 401
                  ? 'That did not match. Check your details — repeated failures lock the account.'
                  : (err && err.message) || 'Could not sign you in.';
                status.append(el('div', { class: 'alert alert--error', text: msg }));
              }
            },
          },
        }, [
          el('div', { class: 'field' }, [el('label', { for: 'a-email', text: 'Email' }), email]),
          el('div', { class: 'field' }, [el('label', { for: 'a-password', text: 'Password' }), password]),
          status,
          el('button', { class: 'btn btn--block', type: 'submit', text: 'Sign in' }),
        ]),
        el('p', { class: 'hint', text: 'Admin access is by invitation only. There is no self-registration.' }),
      ]),
    ])
  );
}

function safeNext(next) {
  if (!next) return '/admin/';
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.startsWith('/admin')) return decoded;
  } catch { /* ignore */ }
  return '/admin/';
}
