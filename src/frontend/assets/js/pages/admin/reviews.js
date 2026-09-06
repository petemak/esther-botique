import { api } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState, stars } from '../../components.js';
import { getParam, formatDate } from '../../util.js';
import { adminShell, pager } from './_shell.js';
import { toast } from '../../toast.js';

let content;
let status = getParam('status') || 'pending';
let page = 1;

start();

async function start() {
  const shell = await adminShell('reviews', 'Reviews');
  if (!shell) return;
  content = shell.content;
  const tabs = el('div', { class: 'tabs', role: 'tablist' },
    ['pending', 'approved', 'rejected'].map((s) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': s === status ? 'true' : 'false', text: s, on: { click: () => { status = s; page = 1; load(); updateTabs(tabs); } } })
    )
  );
  content.append(tabs, el('div', { id: 'r-results' }, [el('div', { class: 'spinner' })]));
  await load();
}

function updateTabs(tabs) {
  Array.from(tabs.children).forEach((b) => b.setAttribute('aria-selected', b.textContent === status ? 'true' : 'false'));
}

async function load() {
  const results = $('#r-results');
  clear(results).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.admin.getReviews({ status, page, pageSize: 15 });
    clear(results);
    if (!data.items || !data.items.length) {
      results.append(el('p', { class: 'text-muted', text: `No ${status} reviews.` }));
      return;
    }
    data.items.forEach((r) => results.append(reviewRow(r)));
    results.append(pager(data.page || 1, data.totalPages || 1, (p) => { page = p; load(); }));
  } catch (err) {
    clear(results).append(errorState(err, load));
  }
}

function reviewRow(r) {
  const card = el('div', { class: 'admin-section-card' }, [
    el('div', { style: 'display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap' }, [
      el('div', {}, [
        el('p', { html: `${stars(r.rating)} <strong>${r.title || ''}</strong>` }),
        el('p', { class: 'hint', text: `${r.productName || ''} · ${r.authorFirstName || ''} (${r.authorEmail || ''}) · ${formatDate(r.createdAt)} ${r.verifiedPurchase ? '· verified' : ''}` }),
      ]),
      el('span', { class: `status-badge status-badge--${r.status === 'approved' ? 'confirmed' : r.status === 'rejected' ? 'cancelled' : 'pending'}`, text: r.status }),
    ]),
    el('p', { text: r.body }),
  ]);
  if (r.status === 'pending') {
    card.append(el('div', { style: 'display:flex;gap:.5rem' }, [
      el('button', { class: 'btn btn--small', text: 'Approve', on: { click: () => moderate(r.id, { status: 'approved' }) } }),
      el('button', { class: 'btn btn--small btn--ghost', text: 'Reject', on: { click: () => rejectWithReason(r.id) } }),
    ]));
  }
  return card;
}

function rejectWithReason(id) {
  const reason = window.prompt('Reason for rejection (optional):', '') || undefined;
  moderate(id, { status: 'rejected', reason });
}

async function moderate(id, body) {
  try {
    await api.admin.moderateReview(id, body);
    toast(`Review ${body.status}.`, 'success');
    load();
  } catch (err) {
    toast((err && err.message) || 'Could not moderate that review.', 'error');
  }
}
