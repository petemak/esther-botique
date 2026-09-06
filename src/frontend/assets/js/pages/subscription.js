import { api, ApiError } from '../api.js';
import { el, clear } from '../dom.js';
import { getParam } from '../util.js';
import { bootStorefront, view } from './_boot.js';

bootStorefront({ active: '' });

const action = getParam('action') || (getParam('unsubscribe') ? 'unsubscribe' : 'confirm');
const token = getParam('token');

run();

async function run() {
  const root = view();
  clear(root);
  if (!token) {
    return show('Link incomplete', 'This link is missing its token. Please open it directly from the email we sent.');
  }
  root.append(el('div', { class: 'spinner' }));
  try {
    if (action === 'unsubscribe') {
      await api.unsubscribe(token);
      show('You are off the list', 'No hard feelings. You can re-subscribe any time from the footer of the site.');
    } else {
      await api.confirmSubscription(token);
      show('You are on the list', 'Thanks for confirming. We will email you when new pieces land — and nothing else.');
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 422) {
      show('That link has expired', 'Subscription links are single-use and time-limited. Sign up again from the site footer and we will send a fresh one.');
    } else {
      show('Something went wrong', (err && err.message) || 'Please try the link again in a moment.');
    }
  }
}

function show(title, message) {
  clear(view()).append(
    el('div', { class: 'center-narrow stack', style: 'text-align:center;padding:2rem 0' }, [
      el('h1', { text: title }),
      el('p', { class: 'lede', text: message }),
      el('a', { class: 'btn btn--secondary', href: '/', text: 'Back to House of Esther' }),
    ])
  );
}
