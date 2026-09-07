import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState } from '../../components.js';
import { getParam, formatDateTime, titleCase } from '../../util.js';
import { adminShell, adminTable, pager } from './_shell.js';
import { toast } from '../../toast.js';

const TOPICS = ['order_issue', 'return', 'product_question', 'wholesale_press', 'other'];

let content;
let shell;
const state = {
  ref: getParam('ref') || null,
  handled: getParam('handled') === 'true' ? 'true' : getParam('handled') === '' || getParam('handled') === 'all' ? 'all' : 'false',
  topic: getParam('topic') || '',
  page: parseInt(getParam('page') || '1', 10),
};

start();

async function start() {
  shell = await adminShell('contacts', 'Contact messages');
  if (!shell) return;
  content = shell.content;
  if (state.ref) renderDetail(state.ref);
  else renderList();
}

/* ---------------- List ---------------- */
function renderList() {
  shell.setTitle('Contact messages');
  clear(content);

  const handledSel = el('select', { class: 'select', 'aria-label': 'Handled filter', id: 'c-handled' }, [
    el('option', { value: 'false', text: 'Unhandled', selected: state.handled === 'false' }),
    el('option', { value: 'true', text: 'Handled', selected: state.handled === 'true' }),
    el('option', { value: 'all', text: 'All', selected: state.handled === 'all' }),
  ]);
  const topicSel = el('select', { class: 'select', 'aria-label': 'Topic filter', id: 'c-topic' }, [
    el('option', { value: '', text: 'All topics', selected: !state.topic }),
    ...TOPICS.map((t) => el('option', { value: t, text: titleCase(t), selected: state.topic === t })),
  ]);
  const apply = () => {
    state.handled = handledSel.value;
    state.topic = topicSel.value;
    state.page = 1;
    syncUrl();
    loadList();
  };
  handledSel.addEventListener('change', apply);
  topicSel.addEventListener('change', apply);

  content.append(
    el('p', { class: 'hint', text: 'Messages from the public contact form. Read-only — reply to the customer by email or WhatsApp using the details on each message.' }),
    el('div', { class: 'admin-filters' }, [
      el('label', { class: 'field', style: 'margin:0' }, [el('span', { class: 'hint', text: 'Show' }), handledSel]),
      el('label', { class: 'field', style: 'margin:0' }, [el('span', { class: 'hint', text: 'Topic' }), topicSel]),
    ]),
    el('div', { id: 'c-results' }, [el('div', { class: 'spinner' })])
  );
  loadList();
}

async function loadList() {
  const results = $('#c-results');
  clear(results).append(el('div', { class: 'spinner' }));
  try {
    const query = { topic: state.topic || undefined, page: state.page, pageSize: 25 };
    if (state.handled !== 'all') query.handled = state.handled; // omit for "all"
    const data = await api.admin.getContacts(query);
    clear(results);
    const rows = (data.items || []).map((m) =>
      el('tr', {}, [
        el('td', {}, [el('a', { href: `/admin/contacts.html?ref=${encodeURIComponent(m.reference)}`, text: m.reference })]),
        el('td', { text: formatDateTime(m.createdAt) }),
        el('td', { text: m.name }),
        el('td', { text: titleCase(m.topic) }),
        el('td', {}, [m.orderNumber ? el('a', { href: `/admin/order.html?order=${encodeURIComponent(m.orderNumber)}`, text: m.orderNumber }) : document.createTextNode('—')]),
        el('td', { text: m.messageExcerpt || '' }),
        el('td', {}, [el('span', { class: `status-badge status-badge--${m.handled ? 'confirmed' : 'pending'}`, text: m.handled ? 'handled' : 'unhandled' })]),
      ])
    );
    results.append(
      el('p', { class: 'hint', text: `${data.total || 0} message${data.total === 1 ? '' : 's'}` }),
      adminTable(['Reference', 'Received', 'Name', 'Topic', 'Order', 'Message', 'State'], rows),
      pager(data.page || 1, data.totalPages || 1, (p) => { state.page = p; syncUrl(); loadList(); })
    );
  } catch (err) {
    clear(results).append(errorState(err, loadList));
  }
}

/* ---------------- Detail ---------------- */
async function renderDetail(reference) {
  shell.setTitle(`Message ${reference}`);
  clear(content).append(el('div', { class: 'spinner' }));
  try {
    const m = await api.admin.getContact(reference);
    paintDetail(m);
  } catch (err) {
    clear(content);
    if (err instanceof ApiError && err.status === 404) {
      content.append(errorState({ message: 'No message has that reference.' }));
      content.append(el('a', { class: 'btn btn--secondary', href: '/admin/contacts.html', text: 'Back to inbox' }));
    } else {
      content.append(errorState(err, () => renderDetail(reference)));
    }
  }
}

function paintDetail(m) {
  clear(content);
  content.append(
    el('a', { class: 'btn--ghost', href: '/admin/contacts.html', text: '← All messages' }),
    el('div', { class: 'admin-form-grid', style: 'margin-top:1rem' }, [
      el('div', {}, [
        el('div', { class: 'admin-section-card' }, [
          el('div', { style: 'display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:baseline' }, [
            el('h2', { text: `${titleCase(m.topic)} — ${m.reference}` }),
            el('span', { class: `status-badge status-badge--${m.handled ? 'confirmed' : 'pending'}`, text: m.handled ? 'handled' : 'unhandled' }),
          ]),
          el('p', { class: 'hint', text: `Received ${formatDateTime(m.createdAt)}` }),
          el('div', { class: 'prose', style: 'margin-top:1rem;white-space:pre-wrap' }, [el('p', { text: m.message })]),
        ]),
      ]),
      el('div', {}, [
        el('div', { class: 'admin-section-card' }, [
          el('h2', { text: 'Sender' }),
          el('dl', { class: 'readonly-panel' }, [
            row('Name', m.name),
            row('Email', m.email),
            row('Phone', m.phone || '—'),
            row('Order', m.orderNumber || '—'),
          ]),
          m.orderNumber
            ? el('a', { class: 'btn btn--small btn--secondary', style: 'margin-top:.5rem', href: `/admin/order.html?order=${encodeURIComponent(m.orderNumber)}`, text: 'Open order' })
            : null,
          el('p', { class: 'hint', style: 'margin-top:.75rem', text: 'Replies to the customer are sent by email (or WhatsApp) outside the app. Marking handled records who and when — it sends nothing to the customer.' }),
          el('div', { style: 'margin-top:.75rem' }, [handledButton(m)]),
          m.handled && m.handledAt
            ? el('p', { class: 'hint', text: `Handled ${formatDateTime(m.handledAt)}${m.handledBy ? ` by ${m.handledBy}` : ''}.` })
            : null,
        ]),
      ]),
    ])
  );
}

function handledButton(m) {
  const next = !m.handled;
  return el('button', {
    class: next ? 'btn' : 'btn btn--secondary',
    type: 'button',
    text: next ? 'Mark as handled' : 'Reopen',
    on: {
      click: async (e) => {
        e.target.classList.add('is-loading');
        e.target.disabled = true;
        try {
          const updated = await api.admin.updateContact(m.reference, { handled: next });
          toast(next ? 'Marked as handled.' : 'Reopened.', 'success');
          paintDetail(updated);
        } catch (err) {
          e.target.classList.remove('is-loading');
          e.target.disabled = false;
          toast((err && err.message) || 'Could not update the message.', 'error');
        }
      },
    },
  });
}

function row(dt, dd) {
  return el('div', { style: 'display:contents' }, [el('dt', { text: dt }), el('dd', { text: dd })]);
}

function syncUrl() {
  const sp = new URLSearchParams();
  if (state.handled !== 'false') sp.set('handled', state.handled === 'all' ? 'all' : 'true');
  if (state.topic) sp.set('topic', state.topic);
  if (state.page > 1) sp.set('page', String(state.page));
  window.history.replaceState({}, '', `/admin/contacts.html${sp.toString() ? '?' + sp : ''}`);
}
