import { api } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState, fieldError } from '../../components.js';
import { getParam, formatDate } from '../../util.js';
import { adminShell, adminTable, pager } from './_shell.js';

let content;
let status = getParam('status') || 'confirmed';
let page = 1;

start();

async function start() {
  const shell = await adminShell('subscribers', 'Subscribers & broadcasts');
  if (!shell) return;
  content = shell.content;
  content.append(
    el('section', { 'aria-labelledby': 'subs-h' }, [
      el('h2', { id: 'subs-h', style: 'font-size:var(--step-1)', text: 'Subscribers' }),
      el('div', { class: 'admin-filters' }, [
        el('label', { class: 'field', style: 'margin:0' }, [
          el('span', { class: 'hint', text: 'Status' }),
          el('select', { class: 'select', id: 'sub-status', 'aria-label': 'Subscriber status', on: { change: (e) => { status = e.target.value; page = 1; load(); } } },
            ['confirmed', 'pending', 'unsubscribed'].map((s) => el('option', { value: s, text: s, selected: s === status }))),
        ]),
        el('a', { class: 'btn btn--small btn--secondary', id: 'export-link', href: api.admin.subscribersExportUrl(status), download: '', text: 'Export CSV' }),
      ]),
      el('div', { id: 'sub-results' }, [el('div', { class: 'spinner' })]),
    ]),
    el('section', { id: 'broadcast', 'aria-labelledby': 'bc-h', style: 'margin-top:2rem' }, [
      el('h2', { id: 'bc-h', style: 'font-size:var(--step-1)', text: 'Broadcasts' }),
      broadcastForm(),
      el('h3', { style: 'margin-top:1rem', text: 'Sent & queued' }),
      el('div', { id: 'bc-list' }, [el('div', { class: 'spinner' })]),
    ])
  );
  await load();
  await loadBroadcasts();
}

async function load() {
  const link = $('#export-link');
  if (link) link.href = api.admin.subscribersExportUrl(status);
  const results = $('#sub-results');
  clear(results).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.admin.getSubscribers({ status, page, pageSize: 25 });
    clear(results);
    const rows = (data.items || []).map((s) =>
      el('tr', {}, [
        el('td', { text: s.email }),
        el('td', { text: s.source }),
        el('td', { text: s.newArrivals ? 'yes' : 'no' }),
        el('td', { text: s.backInStock ? 'yes' : 'no' }),
        el('td', { text: formatDate(s.createdAt) }),
        el('td', { text: s.confirmedAt ? formatDate(s.confirmedAt) : '—' }),
      ])
    );
    results.append(
      el('p', { class: 'hint', text: `${data.total || 0} subscribers` }),
      adminTable(['Email', 'Source', 'New arrivals', 'Back in stock', 'Joined', 'Confirmed'], rows),
      pager(data.page || 1, data.totalPages || 1, (p) => { page = p; load(); })
    );
  } catch (err) {
    clear(results).append(errorState(err, load));
  }
}

function broadcastForm() {
  const subject = el('input', { class: 'input', id: 'bc-subject', 'aria-label': 'Subject' });
  const intro = el('textarea', { class: 'textarea', id: 'bc-intro', 'aria-label': 'Intro HTML', placeholder: '<p>Six new pieces landed this morning.</p>' });
  const productIds = el('input', { class: 'input', id: 'bc-products', 'aria-label': 'Product ids', placeholder: 'prod_1, prod_2' });
  const collectionSlug = el('input', { class: 'input', id: 'bc-collection', 'aria-label': 'Collection slug', placeholder: '(optional) workwear' });
  const testEmail = el('input', { class: 'input', id: 'bc-test', type: 'email', 'aria-label': 'Test email' });
  const status2 = el('div', { role: 'alert' });
  let createdId = null;

  return el('form', {
    class: 'card stack',
    on: {
      submit: async (e) => {
        e.preventDefault();
        clear(status2);
        if (!subject.value.trim()) { fieldError(subject, 'A subject is required.'); return; }
        const body = {
          subject: subject.value.trim(),
          introHtml: intro.value.trim() || undefined,
          productIds: productIds.value.split(',').map((s) => s.trim()).filter(Boolean),
          collectionSlug: collectionSlug.value.trim() || null,
          audience: 'new_arrivals_optin',
        };
        const btn = e.submitter;
        btn.classList.add('is-loading');
        try {
          if (btn.dataset.act === 'test') {
            if (!createdId) {
              const res = await api.admin.createBroadcast(body);
              createdId = res.id;
            }
            await api.admin.testBroadcast(createdId, testEmail.value.trim());
            status2.append(el('div', { class: 'alert alert--success', text: 'Test sent. Check that inbox, then send for real.' }));
          } else {
            let res;
            if (createdId) res = { id: createdId };
            else res = await api.admin.createBroadcast(body);
            createdId = res.id;
            status2.append(el('div', { class: 'alert alert--success', text: `Broadcast ${res.status || 'queued'} to ${res.recipientCount != null ? res.recipientCount + ' recipients' : 'the opted-in list'}.` }));
            loadBroadcasts();
          }
        } catch (err) {
          status2.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not send that broadcast.' }));
        } finally {
          btn.classList.remove('is-loading');
        }
      },
    },
  }, [
    el('div', { class: 'field' }, [el('label', { for: 'bc-subject', text: 'Subject' }), subject]),
    el('div', { class: 'field' }, [el('label', { for: 'bc-intro', text: 'Intro (HTML)' }), intro]),
    el('div', { class: 'form-row form-row--2' }, [
      el('div', { class: 'field' }, [el('label', { for: 'bc-products', text: 'Product ids' }), productIds]),
      el('div', { class: 'field' }, [el('label', { for: 'bc-collection', text: 'Or collection slug' }), collectionSlug]),
    ]),
    el('div', { class: 'field' }, [el('label', { for: 'bc-test', text: 'Send a test to' }), testEmail]),
    status2,
    el('div', { style: 'display:flex;gap:.5rem' }, [
      el('button', { class: 'btn btn--secondary', type: 'submit', dataset: { act: 'test' }, text: 'Send test' }),
      el('button', { class: 'btn', type: 'submit', dataset: { act: 'send' }, text: 'Send to opted-in subscribers' }),
    ]),
  ]);
}

async function loadBroadcasts() {
  const list = $('#bc-list');
  if (!list) return;
  clear(list).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.admin.getBroadcasts();
    clear(list);
    const items = data.items || data || [];
    list.append(adminTable(['Subject', 'Status', 'Sent', 'Opens', 'Created'], items.map((b) =>
      el('tr', {}, [
        el('td', { text: b.subject }),
        el('td', {}, [el('span', { class: `status-badge status-badge--${b.status === 'sent' ? 'confirmed' : 'pending'}`, text: b.status })]),
        el('td', { text: b.sentCount != null ? String(b.sentCount) : '—' }),
        el('td', { text: b.openCount != null ? String(b.openCount) : '—' }),
        el('td', { text: b.createdAt ? formatDate(b.createdAt) : '—' }),
      ])
    )));
  } catch {
    clear(list).append(el('p', { class: 'text-muted', text: 'Could not load broadcasts.' }));
  }
}
