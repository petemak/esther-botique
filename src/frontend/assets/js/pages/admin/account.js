import { el, clear } from '../../dom.js';
import { errorState } from '../../components.js';
import { adminShell } from './_shell.js';
import { passwordChangeForm } from './_password.js';
import { toast } from '../../toast.js';

/*
 * Admin account area (design-spec page 44, "Normal Account area").
 * Read-only name / email / role — those changes go through the owner on the Team
 * page — plus a self-service change-password form and the sign-out control (in the
 * shell sidebar). Any admin, owner or staff, can reach this.
 */

start();

async function start() {
  const shell = await adminShell('account', 'Account');
  if (!shell) return;
  const { content, user } = shell;

  if (!user) {
    clear(content).append(errorState({ message: 'Could not load your account details.' }));
    return;
  }

  clear(content).append(
    el('div', { class: 'admin-form-grid' }, [
      el('div', {}, [
        el('div', { class: 'admin-section-card' }, [
          el('h2', { text: 'Change password' }),
          el('p', { class: 'hint', text: 'Choose a password only you know. You will stay signed in.' }),
          passwordChangeForm({
            onSuccess: () => {
              toast('Password changed.', 'success');
            },
          }),
        ]),
      ]),
      el('div', {}, [
        el('div', { class: 'admin-section-card' }, [
          el('h2', { text: 'Your details' }),
          el('dl', { class: 'readonly-panel' }, [
            detail('Name', user.name || '—'),
            detail('Email', user.email || '—'),
            detail('Role', user.role === 'owner' ? 'Owner' : 'Staff'),
          ]),
          el('p', { class: 'hint', style: 'margin-top:.75rem', text: user.role === 'owner'
            ? 'Name, email and role changes are made on the Team page.'
            : 'Ask an owner to change your name, email or role from the Team page.' }),
        ]),
      ]),
    ])
  );
}

function detail(dt, dd) {
  return el('div', { style: 'display:contents' }, [el('dt', { text: dt }), el('dd', { text: dd })]);
}
