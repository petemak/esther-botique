import { api } from '../../api.js';
import { el, clear } from '../../dom.js';
import { fieldError } from '../../components.js';
import { setPageMeta } from '../../util.js';
import { bootStorefront, view } from '../_boot.js';

bootStorefront({ active: '' });
setPageMeta({ noindex: true });

render();

function render() {
  const root = view();
  clear(root);
  const email = el('input', { class: 'input', id: 'fp-email', name: 'email', type: 'email', required: true, autocomplete: 'email' });
  email.addEventListener('input', () => fieldError(email, null));
  const status = el('div', { role: 'alert' });

  root.append(
    el('div', { class: 'auth-card stack' }, [
      el('h1', { text: 'Reset your password' }),
      el('p', { class: 'text-muted', text: 'Enter your email and we will send a reset link if it is registered.' }),
      el('form', {
        class: 'stack',
        novalidate: true,
        on: {
          submit: async (e) => {
            e.preventDefault();
            if (!email.checkValidity() || !email.value.trim()) { fieldError(email, 'Enter a valid email address.'); return; }
            const btn = e.target.querySelector('button');
            btn.classList.add('is-loading');
            try {
              const res = await api.forgotPassword(email.value.trim());
              clear(root).append(
                el('div', { class: 'auth-card stack', style: 'text-align:center' }, [
                  el('h1', { text: 'Check your inbox' }),
                  el('p', { text: res.message || 'If that email is registered, a reset link is on its way.' }),
                  el('a', { class: 'btn btn--secondary', href: '/account/signin.html', text: 'Back to sign in' }),
                ])
              );
            } catch (err) {
              btn.classList.remove('is-loading');
              status.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not send a reset link just now.' }));
            }
          },
        },
      }, [
        el('div', { class: 'field' }, [el('label', { for: 'fp-email', html: 'Email <span class="req">*</span>' }), email]),
        status,
        el('button', { class: 'btn btn--block', type: 'submit', text: 'Send reset link' }),
      ]),
      el('p', {}, [el('a', { href: '/account/signin.html', text: 'Back to sign in' })]),
    ])
  );
}
