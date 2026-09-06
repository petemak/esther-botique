import { ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { fieldError, applyValidationErrors } from '../../components.js';
import { getParam, setPageMeta } from '../../util.js';
import { bootStorefront, view } from '../_boot.js';
import { login, register, currentUser } from '../../auth.js';

bootStorefront({ active: '' });
setPageMeta({ noindex: true });

const nextUrl = safeNext(getParam('next'));
let tab = getParam('tab') === 'register' ? 'register' : 'signin';
const prefillEmail = getParam('email') || '';

init();

async function init() {
  const user = await currentUser();
  if (user) {
    window.location.replace(nextUrl);
    return;
  }
  renderTabs();
}

function renderTabs() {
  const root = view();
  clear(root);
  root.append(
    el('div', { class: 'auth-card' }, [
      el('h1', { text: tab === 'register' ? 'Create your account' : 'Sign in' }),
      el('div', { class: 'tabs', role: 'tablist' }, [
        tabBtn('signin', 'Sign in'),
        tabBtn('register', 'Create account'),
      ]),
      el('div', { id: 'auth-panel' }),
      getParam('next') && getParam('next').includes('checkout')
        ? el('p', { class: 'hint', style: 'margin-top:1rem' }, [
            document.createTextNode('In a hurry? '),
            el('a', { href: '/checkout.html', text: 'Continue as guest' }),
          ])
        : null,
    ])
  );
  renderPanel();
}

function tabBtn(id, label) {
  return el('button', {
    type: 'button',
    role: 'tab',
    'aria-selected': tab === id ? 'true' : 'false',
    text: label,
    on: { click: () => { tab = id; renderTabs(); } },
  });
}

function renderPanel() {
  const panel = $('#auth-panel');
  clear(panel);
  panel.append(tab === 'register' ? registerForm() : signinForm());
}

function signinForm() {
  const email = textField('email', 'Email', { type: 'email', required: true, autocomplete: 'email', value: prefillEmail });
  const password = textField('password', 'Password', { type: 'password', required: true, autocomplete: 'current-password' });
  const status = el('div', { role: 'alert' });
  return el('form', {
    class: 'stack',
    novalidate: true,
    on: {
      submit: async (e) => {
        e.preventDefault();
        clear(status);
        const btn = e.target.querySelector('button');
        if (!validate(e.target, ['email', 'password'])) return;
        btn.classList.add('is-loading');
        try {
          await login($('#f-email').value.trim(), $('#f-password').value);
          window.location.assign(nextUrl);
        } catch (err) {
          btn.classList.remove('is-loading');
          status.append(el('div', { class: 'alert alert--error', text: err instanceof ApiError && err.status === 401 ? 'That email and password did not match.' : (err && err.message) || 'Could not sign you in.' }));
        }
      },
    },
  }, [
    email,
    password,
    el('p', {}, [el('a', { href: '/account/forgot-password.html', text: 'Forgot your password?' })]),
    status,
    el('button', { class: 'btn btn--block', type: 'submit', text: 'Sign in' }),
  ]);
}

function registerForm() {
  const first = textField('firstName', 'First name', { required: true, autocomplete: 'given-name' });
  const email = textField('email', 'Email', { type: 'email', required: true, autocomplete: 'email', value: prefillEmail });
  const phone = textField('phone', 'Phone', { type: 'tel', required: true, autocomplete: 'tel', placeholder: '+2547XXXXXXXX' });
  const password = textField('password', 'Password', { type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters, and not a common password.' });
  const status = el('div', { role: 'alert' });
  return el('form', {
    class: 'stack',
    novalidate: true,
    on: {
      submit: async (e) => {
        e.preventDefault();
        clear(status);
        if (!validate(e.target, ['firstName', 'email', 'phone', 'password'])) return;
        if ($('#f-password').value.length < 8) { fieldError($('#f-password'), 'Use at least 8 characters.'); return; }
        const btn = e.target.querySelector('button');
        btn.classList.add('is-loading');
        try {
          await register({
            firstName: $('#f-firstName').value.trim(),
            email: $('#f-email').value.trim(),
            phone: $('#f-phone').value.trim(),
            password: $('#f-password').value,
          });
          window.location.assign(nextUrl);
        } catch (err) {
          btn.classList.remove('is-loading');
          if (err instanceof ApiError && err.status === 409) {
            status.append(el('div', { class: 'alert alert--warning', text: 'That email already has an account. Try signing in instead.' }));
          } else if (err instanceof ApiError && err.status === 422) {
            applyValidationErrors(e.target, err.details);
            status.append(el('div', { class: 'alert alert--error', text: err.message || 'Please check the highlighted fields.' }));
          } else {
            status.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not create your account.' }));
          }
        }
      },
    },
  }, [
    first,
    email,
    phone,
    password,
    el('p', { class: 'hint', text: 'Creating an account attaches any order you placed as a guest with this email.' }),
    status,
    el('button', { class: 'btn btn--block', type: 'submit', text: 'Create account' }),
  ]);
}

function textField(name, label, opts = {}) {
  const id = `f-${name}`;
  const i = el('input', { class: 'input', id, name, type: opts.type || 'text' });
  if (opts.value) i.value = opts.value;
  if (opts.required) i.required = true;
  if (opts.autocomplete) i.autocomplete = opts.autocomplete;
  if (opts.placeholder) i.placeholder = opts.placeholder;
  i.addEventListener('input', () => fieldError(i, null));
  return el('div', { class: 'field' }, [
    el('label', { for: id, html: `${label}${opts.required ? ' <span class="req">*</span>' : ''}` }),
    i,
    opts.hint ? el('p', { class: 'hint', text: opts.hint }) : null,
  ]);
}

function validate(form, names) {
  let ok = true;
  names.forEach((n) => {
    const i = form.querySelector(`#f-${n}`);
    const valid = i.type === 'email' ? i.checkValidity() && i.value.trim() : i.value.trim().length > 0;
    fieldError(i, valid ? null : 'Required.');
    if (!valid) ok = false;
  });
  return ok;
}

function safeNext(next) {
  if (!next) return '/account/';
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.startsWith('/') && !decoded.startsWith('//')) return decoded;
  } catch { /* ignore */ }
  return '/account/';
}
