import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { adminShell } from './_shell.js';
import { uuid, titleCase } from '../../util.js';

/*
 * A17 — Product CSV bulk import wizard. Staff-level (require-admin), not owner-only.
 * Three steps on a dedicated route:
 *   1. Upload      — pick a CSV, POST /api/admin/products/import (parses + plans, writes nothing)
 *   2. Review      — render summary + per-row plan from the 200 response
 *   3. Done        — render tallies from POST /api/admin/products/import/commit
 *
 * Downloads (export + template) are plain <a href> to same-origin authenticated GETs
 * that return Content-Disposition: attachment — the session cookie rides along.
 *
 * The commit carries an Idempotency-Key header (a uuid, same helper the checkout uses).
 * The key is generated once per preview and reused for every Apply click on that plan,
 * so a double-tap replays the stored result instead of applying twice.
 */

const state = {
  file: null,
  plan: null, // { token, summary, rows }
  commitKey: null,
  result: null, // commit 200 body
  uploadMessage: null,
};

const STEP_LABELS = ['Upload', 'Review', 'Done'];

const BADGE = {
  create: ['New', 'new'],
  update: ['Update', 'update'],
  skip: ['Skip', 'skip'],
  error: ['Problem', 'problem'],
};

let content;

start();

async function start() {
  const shell = await adminShell('products', 'Bulk import products');
  if (!shell) return;
  content = shell.content;
  renderStep1();
}

/* ---------- step 1: upload ---------- */

function renderStep1() {
  clear(content).append(
    backLink(),
    stepIndicator(1),
    el('div', { class: 'admin-section-card stack import-card' }, [
      el('h2', { text: 'Upload your spreadsheet' }),
      el('p', {
        text: 'Download your current products or the template, fill it in, and upload it as a CSV. You will see exactly what changes before anything is saved.',
      }),
      el('ul', { class: 'import-rules' }, [
        el('li', { text: 'Columns: name, price, description, quantity, category.' }),
        el('li', { text: 'name, price and quantity are required. category is required for new products, optional when updating.' }),
        el('li', { text: 'A name that matches an existing product updates it. A new name comes in as a draft — you add photos and publish it from the Products page.' }),
        el('li', { text: 'Products that have sizes or colours only get their price and description updated here — set their stock on the Inventory page.' }),
        el('li', { text: 'price and quantity are whole numbers (shillings and units).' }),
      ]),
      el('div', { class: 'catalogue-tools__actions' }, [
        el('a', { class: 'btn btn--small btn--ghost', href: api.admin.importTemplateUrl(), download: '', text: 'Download template' }),
        el('a', { class: 'btn btn--small btn--ghost', href: api.admin.productsExportUrl(), download: '', text: 'Download current products (CSV)' }),
      ]),
      uploadControl(),
      el('div', { id: 'import-upload-msg', role: 'alert' }),
    ])
  );
  if (state.uploadMessage) showUploadMessage(state.uploadMessage);
}

function uploadControl() {
  const fileName = el('span', {
    class: 'import-filename',
    id: 'import-filename',
    text: state.file ? state.file.name : 'No file chosen',
  });
  const previewBtn = el('button', {
    class: 'btn',
    id: 'import-preview-btn',
    type: 'button',
    disabled: !state.file,
    text: 'Preview changes',
    on: { click: runPreview },
  });
  const input = el('input', {
    type: 'file',
    accept: '.csv,text/csv',
    class: 'visually-hidden',
    id: 'import-file',
    on: {
      change: (e) => {
        state.file = (e.target.files && e.target.files[0]) || null;
        fileName.textContent = state.file ? state.file.name : 'No file chosen';
        previewBtn.disabled = !state.file;
        clear($('#import-upload-msg'));
      },
    },
  });
  return el('div', { class: 'import-upload stack' }, [
    el('div', { class: 'import-upload__row' }, [
      el('label', { class: 'btn btn--secondary' }, [document.createTextNode('Choose file'), input]),
      fileName,
    ]),
    previewBtn,
  ]);
}

async function runPreview() {
  if (!state.file) return;
  const btn = $('#import-preview-btn');
  clear($('#import-upload-msg'));
  btn.disabled = true;
  btn.textContent = 'Checking your file…';
  try {
    const plan = await api.admin.importProducts(state.file);
    state.plan = plan;
    state.commitKey = uuid();
    state.result = null;
    state.uploadMessage = null;
    renderStep2();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Preview changes';
    if (err instanceof ApiError && err.status === 422) {
      showUploadMessage(
        "That file couldn't be read — check it's a CSV with name, price and quantity columns."
          + (err.message ? ` (${err.message})` : '')
      );
    } else {
      showUploadMessage((err && err.message) || 'Something went wrong reading that file. Try again in a moment.');
    }
  }
}

function showUploadMessage(text) {
  const box = $('#import-upload-msg');
  if (box) clear(box).append(el('p', { class: 'alert alert--error', text }));
}

/* ---------- step 2: review the plan ---------- */

function renderStep2() {
  const { summary, rows } = state.plan;
  const applyCount = (summary.toCreate || 0) + (summary.toUpdate || 0);
  clear(content).append(
    backLink(),
    stepIndicator(2),
    el('div', { class: 'admin-section-card stack import-card' }, [
      el('h2', { text: 'Review the plan' }),
      el('p', { text: 'Nothing has been saved yet. Check the changes below, then apply them.' }),
      countStrip(summary),
      planTable(rows),
      el('div', { class: 'import-confirm stack' }, [
        el('p', { class: 'hint', text: "Problem rows won't be applied — fix them in your spreadsheet and import again." }),
        el('div', { class: 'import-confirm__actions' }, [
          el('button', {
            class: 'btn',
            id: 'import-confirm-btn',
            type: 'button',
            disabled: applyCount === 0,
            text: `Apply ${applyCount} ${applyCount === 1 ? 'change' : 'changes'}`,
            on: { click: runCommit },
          }),
          el('button', {
            class: 'btn btn--secondary',
            type: 'button',
            text: 'Cancel / choose another file',
            on: { click: resetToUpload },
          }),
        ]),
        el('div', { id: 'import-commit-msg', role: 'alert' }),
      ]),
    ])
  );
}

function countStrip(s) {
  return el('div', { class: 'import-countstrip' }, [
    el('span', { class: 'import-count import-count--new', text: `${s.toCreate || 0} new` }),
    el('span', { class: 'import-count import-count--update', text: `${s.toUpdate || 0} to update` }),
    el('span', { class: 'import-count import-count--skip', text: `${s.toSkip || 0} skipped` }),
    el('span', { class: 'import-count import-count--problem', text: `${s.errors || 0} with a problem` }),
  ]);
}

function planTable(rows) {
  const body = (rows || []).map((r) => {
    const muted = r.action === 'skip' || r.action === 'error';
    return el('tr', { class: muted ? 'import-row--muted' : null }, [
      el('td', { text: String(r.row) }),
      el('td', { text: r.name || '—' }),
      el('td', {}, [actionBadge(r.action)]),
      el('td', {}, [changeList(r)]),
      el('td', {}, [notesCell(r)]),
    ]);
  });
  return el('div', { class: 'admin-table-wrap' }, [
    el('table', { class: 'admin-table import-table' }, [
      el('thead', {}, [
        el('tr', {}, ['Row', 'Product', 'Action', 'Changes', 'Notes'].map((h) => el('th', { scope: 'col', text: h }))),
      ]),
      el('tbody', {}, body.length ? body : [el('tr', {}, [el('td', { colspan: 5, text: 'No data rows found.' })])]),
    ]),
  ]);
}

function actionBadge(action) {
  const [label, mod] = BADGE[action] || [action, 'skip'];
  return el('span', { class: `import-badge import-badge--${mod}`, text: label });
}

function money(n) {
  return `KES ${Number(n).toLocaleString('en-KE')}`;
}

function changeList(r) {
  const c = r.changes || {};
  const items = [];
  if (c.price) {
    items.push(c.price.from == null ? `Price ${money(c.price.to)}` : `Price ${money(c.price.from)} → ${money(c.price.to)}`);
  }
  if (c.quantity) {
    items.push(c.quantity.from == null ? `Stock ${c.quantity.to}` : `Stock ${c.quantity.from} → ${c.quantity.to}`);
  }
  if (c.description && c.description.changed) {
    items.push('Description updated');
  }
  if (c.category) {
    if (c.category.from == null) items.push(`Category → ${titleCase(c.category.to)}`);
    else if (c.category.from === c.category.to) items.push(`Stays in ${titleCase(c.category.to)}`);
    else items.push(`Category ${titleCase(c.category.from)} → ${titleCase(c.category.to)}`);
  }
  if (!items.length) {
    return el('span', { class: 'hint', text: r.action === 'update' ? 'No changes' : '—' });
  }
  return el('ul', { class: 'import-changes' }, items.map((t) => el('li', { text: t })));
}

function notesCell(r) {
  const parts = [];
  (r.notes || []).forEach((n) => parts.push(el('p', { class: 'import-note', text: n })));
  if (r.message) parts.push(el('p', { class: 'import-note import-note--problem', text: r.message }));
  if (!parts.length) return el('span', { class: 'hint', text: '—' });
  return el('div', {}, parts);
}

async function runCommit() {
  const btn = $('#import-confirm-btn');
  const box = $('#import-commit-msg');
  const original = btn.textContent;
  clear(box);
  btn.disabled = true;
  btn.textContent = 'Applying…';
  try {
    state.result = await api.admin.commitImport(state.plan.token, state.commitKey);
    renderStep3();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 410 || err.status === 409)) {
      state.uploadMessage = 'This preview has expired or was already applied — upload the file again.';
      resetToUpload();
      return;
    }
    btn.disabled = false;
    btn.textContent = original;
    clear(box).append(
      el('p', { class: 'alert alert--error', text: (err && err.message) || 'Could not apply those changes. Try again in a moment.' })
    );
  }
}

function resetToUpload() {
  state.plan = null;
  state.commitKey = null;
  state.file = null;
  state.result = null;
  renderStep1();
}

/* ---------- step 3: done ---------- */

function renderStep3() {
  const res = state.result || {};
  const created = res.created || 0;
  const updated = res.updated || 0;
  const skipped = res.skipped || 0;
  const failed = res.failed || 0;

  let summaryText = `${created} ${created === 1 ? 'product' : 'products'} created, ${updated} updated`;
  if (skipped || failed) {
    summaryText += ` — ${skipped} skipped, ${failed} couldn't be applied`;
  }

  const rows = res.rows || [];
  const createdRows = rows.filter((r) => r.result === 'created');
  const failedRows = rows.filter((r) => r.result === 'failed');

  clear(content).append(
    backLink(),
    stepIndicator(3),
    el('div', { class: 'admin-section-card stack import-card' }, [
      el('h2', { text: 'Import complete' }),
      el('p', { class: 'import-result-summary', text: summaryText }),
      created > 0
        ? el('p', { class: 'hint', text: 'New products are drafts — add photos and publish them from the list below.' })
        : null,
      failedRows.length
        ? el('div', { class: 'stack' }, [
            el('h3', { text: "Rows that couldn't be applied" }),
            el('ul', { class: 'import-failed' }, failedRows.map((r) =>
              el('li', { text: `Row ${r.row} — ${r.name}: ${r.message || 'could not be applied'}` })
            )),
          ])
        : null,
      createdRows.length
        ? el('div', { class: 'stack' }, [
            el('h3', { text: 'New drafts' }),
            el('ul', {}, createdRows.map((r) =>
              el('li', {}, [
                r.productId
                  ? el('a', { href: `/admin/product-edit.html?id=${encodeURIComponent(r.productId)}`, text: r.name })
                  : document.createTextNode(r.name),
              ])
            )),
          ])
        : null,
      el('a', { class: 'btn', href: '/admin/products.html', text: 'Back to products' }),
    ])
  );
}

/* ---------- shared bits ---------- */

function backLink() {
  return el('nav', { class: 'import-backlink', 'aria-label': 'Breadcrumb' }, [
    el('a', { href: '/admin/products.html', text: '← Products' }),
  ]);
}

function stepIndicator(current) {
  return el('ol', { class: 'import-steps', 'aria-label': 'Import progress' },
    STEP_LABELS.map((label, i) => el('li', {
      class: `import-steps__item${i + 1 === current ? ' is-current' : ''}${i + 1 < current ? ' is-done' : ''}`,
      'aria-current': i + 1 === current ? 'step' : null,
      text: `${i + 1}. ${label}`,
    }))
  );
}
