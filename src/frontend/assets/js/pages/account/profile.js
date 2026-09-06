import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState, fieldError, applyValidationErrors } from '../../components.js';
import { accountShell } from './_shell.js';
import { toast } from '../../toast.js';

let content;

start();

async function start() {
  const shell = await accountShell('profile');
  if (!shell) return;
  content = shell.content;
  content.append(el('div', { class: 'spinner' }));
  try {
    const [profile, prefs] = await Promise.all([api.getProfile(), api.getNotificationPrefs().catch(() => null)]);
    render(profile, prefs);
  } catch (err) {
    clear(content).append(errorState(err, start));
  }
}

function render(profile, prefs) {
  clear(content);
  content.append(
    el('h2', { style: 'font-size:var(--step-2)', text: 'Profile' }),
    profileForm(profile),
    el('h2', { style: 'font-size:var(--step-2);margin-top:2rem', text: 'Notifications' }),
    prefs ? prefsForm(prefs) : el('p', { class: 'text-muted', text: 'Notification preferences could not load right now.' })
  );
}

function profileForm(p) {
  const f = (name, label, opts = {}) => {
    const id = `pf-${name}`;
    const i = el('input', { class: 'input', id, name, type: opts.type || 'text' });
    if (p[name]) i.value = p[name];
    if (opts.autocomplete) i.autocomplete = opts.autocomplete;
    i.addEventListener('input', () => fieldError(i, null));
    return el('div', { class: 'field' }, [el('label', { for: id, text: label }), i, opts.hint ? el('p', { class: 'hint', text: opts.hint }) : null]);
  };

  return el('form', {
    class: 'card stack',
    novalidate: true,
    on: { submit: saveProfile },
  }, [
    el('div', { class: 'form-row form-row--2' }, [f('firstName', 'First name', { autocomplete: 'given-name' }), f('lastName', 'Last name', { autocomplete: 'family-name' })]),
    f('email', 'Email', { type: 'email', autocomplete: 'email' }),
    f('phone', 'Phone', { type: 'tel', autocomplete: 'tel' }),
    el('fieldset', { class: 'fieldset' }, [
      el('legend', { text: 'Change password (optional)' }),
      f('currentPassword', 'Current password', { type: 'password', hint: 'Required to change your email or password.' }),
      f('newPassword', 'New password', { type: 'password' }),
    ]),
    el('div', { role: 'alert', id: 'pf-alert' }),
    el('button', { class: 'btn', type: 'submit', text: 'Save changes' }),
  ]);
}

async function saveProfile(e) {
  e.preventDefault();
  const form = e.target;
  const alert = $('#pf-alert');
  clear(alert);
  const val = (n) => form.querySelector(`[name="${n}"]`).value.trim();
  const body = { firstName: val('firstName'), lastName: val('lastName'), phone: val('phone') };
  if (val('email')) body.email = val('email');
  if (val('currentPassword')) body.currentPassword = val('currentPassword');
  if (val('newPassword')) body.newPassword = val('newPassword');

  const btn = form.querySelector('button[type="submit"]');
  btn.classList.add('is-loading');
  try {
    await api.updateProfile(body);
    toast('Profile updated.', 'success');
    form.querySelector('[name="currentPassword"]').value = '';
    form.querySelector('[name="newPassword"]').value = '';
  } catch (err) {
    if (err instanceof ApiError && err.status === 422) {
      applyValidationErrors(form, err.details);
      alert.append(el('div', { class: 'alert alert--error', text: err.message || 'Please check the fields.' }));
    } else if (err instanceof ApiError && err.status === 409) {
      alert.append(el('div', { class: 'alert alert--warning', text: 'That email is already in use.' }));
    } else {
      alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not save your profile.' }));
    }
  } finally {
    btn.classList.remove('is-loading');
  }
}

function prefsForm(prefs) {
  const toggle = (name, label, locked) =>
    el('label', { class: 'checkbox' }, [
      el('input', { type: 'checkbox', name, checked: !!prefs[name], disabled: !!locked }),
      el('span', {}, [document.createTextNode(label), locked ? el('span', { class: 'hint', text: ' — always on (transactional)' }) : null]),
    ]);

  return el('form', {
    class: 'card stack',
    on: {
      submit: async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.classList.add('is-loading');
        try {
          await api.updateNotificationPrefs({
            newArrivals: e.target.querySelector('[name="newArrivals"]').checked,
            backInStock: e.target.querySelector('[name="backInStock"]').checked,
            journal: e.target.querySelector('[name="journal"]').checked,
          });
          toast('Preferences saved.', 'success');
        } catch (err) {
          toast((err && err.message) || 'Could not save preferences.', 'error');
        } finally {
          btn.classList.remove('is-loading');
        }
      },
    },
  }, [
    toggle('orderUpdates', 'Order updates', true),
    toggle('newArrivals', 'New-arrival announcements'),
    toggle('backInStock', 'Back-in-stock alerts'),
    toggle('journal', 'The Journal'),
    el('button', { class: 'btn', type: 'submit', text: 'Save preferences' }),
  ]);
}
