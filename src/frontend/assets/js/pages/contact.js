import { api, ApiError } from '../api.js';
import { el, clear } from '../dom.js';
import { fieldError, applyValidationErrors } from '../components.js';
import { getParam, injectJsonLd } from '../util.js';
import { CONFIG } from '../config.js';
import { bootStorefront, view } from './_boot.js';

bootStorefront({ active: '' });

const TOPICS = [
  ['order_issue', 'Order issue'],
  ['return', 'Return'],
  ['product_question', 'Product question'],
  ['wholesale_press', 'Wholesale / press'],
  ['other', 'Other'],
];

render();

function render() {
  const root = view();
  clear(root);
  const preTopic = getParam('topic');
  const preOrder = getParam('order');

  const name = input('name', 'Name', { required: true, autocomplete: 'name' });
  const email = input('email', 'Email', { required: true, type: 'email', autocomplete: 'email' });
  const phone = input('phone', 'Phone', { type: 'tel', autocomplete: 'tel' });
  const topic = el('select', { class: 'select', id: 'f-topic', name: 'topic', required: true },
    TOPICS.map(([v, label]) => el('option', { value: v, text: label, selected: v === preTopic }))
  );
  const orderNumber = input('orderNumber', 'Order number (if relevant)', { value: preOrder || '' });
  const message = el('textarea', { class: 'textarea', id: 'f-message', name: 'message', required: true, minlength: 10 });
  // honeypot — bots fill this; humans never see it
  const website = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const status = el('div', { role: 'alert' });

  const form = el('form', { class: 'stack', novalidate: true, on: { submit: submit } }, [
    name,
    el('div', { class: 'form-row form-row--2' }, [email, phone]),
    el('div', { class: 'field' }, [el('label', { for: 'f-topic', html: 'Topic <span class="req">*</span>' }), topic]),
    orderNumber,
    el('div', { class: 'field' }, [el('label', { for: 'f-message', html: 'Message <span class="req">*</span>' }), message]),
    el('div', { class: 'honeypot', 'aria-hidden': 'true' }, [el('label', { text: 'Leave this field empty' }), website]),
    status,
    el('button', { class: 'btn', type: 'submit', text: 'Send message' }),
  ]);

  root.append(
    el('div', { class: 'checkout-layout' }, [
      el('div', {}, [
        el('h1', { text: 'Contact us' }),
        el('p', { class: 'lede', text: 'Tell us what is going on and we will reply within one business day.' }),
        form,
      ]),
      el('aside', { class: 'card stack' }, [
        el('h2', { style: 'font-size:var(--step-1)', text: 'Other ways to reach us' }),
        el('p', {}, [el('a', { href: `https://wa.me/${CONFIG.whatsappNumber.replace(/[^\d]/g, '')}`, target: '_blank', rel: 'noopener', text: 'WhatsApp us' })]),
        el('p', {}, [el('a', { href: `mailto:${CONFIG.supportEmail}`, text: CONFIG.supportEmail })]),
        el('p', { class: 'hint', text: 'We reply within one business day, Monday to Saturday.' }),
        el('p', { class: 'hint', text: 'Boutique address and hours coming with our flagship store this year.' }),
      ]),
    ])
  );

  injectJsonLd({ '@context': 'https://schema.org', '@type': 'ContactPage', name: 'Contact Us — House of Esther' });
}

function input(name, label, opts = {}) {
  const id = `f-${name}`;
  const i = el('input', { class: 'input', id, name, type: opts.type || 'text' });
  if (opts.value) i.value = opts.value;
  if (opts.required) i.required = true;
  if (opts.autocomplete) i.autocomplete = opts.autocomplete;
  i.addEventListener('input', () => fieldError(i, null));
  return el('div', { class: 'field' }, [
    el('label', { for: id, html: `${label}${opts.required ? ' <span class="req">*</span>' : ''}` }),
    i,
  ]);
}

async function submit(e) {
  e.preventDefault();
  const form = e.target;
  const status = form.querySelector('[role="alert"]');
  clear(status);
  const get = (n) => form.querySelector(`[name="${n}"]`);

  let ok = true;
  ['name', 'email', 'message'].forEach((n) => {
    const i = get(n);
    const valid = n === 'email' ? i.checkValidity() && i.value.trim() : i.value.trim().length >= (n === 'message' ? 10 : 1);
    fieldError(i, valid ? null : n === 'message' ? 'Please write at least 10 characters.' : 'Required.');
    if (!valid) ok = false;
  });
  if (!ok) return;

  const btn = form.querySelector('button[type="submit"]');
  btn.classList.add('is-loading');
  btn.disabled = true;
  try {
    const res = await api.contact({
      name: get('name').value.trim(),
      email: get('email').value.trim(),
      phone: get('phone').value.trim() || undefined,
      topic: get('topic').value,
      orderNumber: get('orderNumber').value.trim() || undefined,
      message: get('message').value.trim(),
      website: get('website').value,
    });
    clear(view()).append(
      el('div', { class: 'center-narrow stack', style: 'text-align:center;padding:2rem 0' }, [
        el('h1', { text: 'Message sent' }),
        el('p', { text: res.message || 'Got it. We reply within one business day.' }),
        res.reference ? el('p', { class: 'hint', text: `Reference: ${res.reference}` }) : null,
        el('a', { class: 'btn btn--secondary', href: '/', text: 'Back to the shop' }),
      ])
    );
  } catch (err) {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    if (err instanceof ApiError && err.status === 422) {
      applyValidationErrors(form, err.details);
      status.append(el('div', { class: 'alert alert--error', text: err.message || 'Please check the highlighted fields.' }));
    } else if (err instanceof ApiError && err.status === 429) {
      status.append(el('div', { class: 'alert alert--warning', text: 'You have sent a few messages already — please wait a little before sending another.' }));
    } else {
      status.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not send your message just now.' }));
    }
  }
}
