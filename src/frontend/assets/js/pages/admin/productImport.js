import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { adminShell } from './_shell.js';
import { uuid, titleCase } from '../../util.js';

/*
 * A17 — Product CSV bulk import wizard. Staff-level (require-admin), not owner-only.
 * Three steps on a dedicated route:
 *   1. Upload      — pick a CSV AND the product photo files, POST /api/admin/products/import
 *                    (multipart: CSV `file` + one `filename` text part per photo — names only).
 *                    Parses + plans, writes nothing, uploads nothing.
 *   2. Review      — render summary + per-row plan (incl. photo status) from the 200 response
 *   3. Done        — render tallies from POST /api/admin/products/import/commit
 *
 * Downloads (export + template) are plain <a href> to same-origin authenticated GETs
 * that return Content-Disposition: attachment — the session cookie rides along.
 *
 * The commit carries an Idempotency-Key header (a uuid, same helper the checkout uses).
 * The key is generated once per preview and reused for every Apply click on that plan,
 * so a double-tap replays the stored result instead of applying twice.
 *
 * JSON vs multipart on commit: if the plan has no matched photos anywhere we send the
 * plain JSON `{ token }` (unchanged behaviour). If any row matched a photo we send
 * multipart — a `token` text part plus every selected image File as an `image` part.
 */

const state = {
  file: null,
  photoFiles: [], // File[] selected alongside the CSV
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
      el('h2', { text: 'Upload your spreadsheet and photos' }),
      el('p', {
        text: 'Download your current products or the template, fill it in, and upload it as a CSV together with the product photo files. You will see exactly what changes before anything is saved.',
      }),
      el('ul', { class: 'import-rules' }, [
        el('li', { text: 'Columns: name, price, description, quantity, category, photos.' }),
        el('li', { text: 'name, price and quantity are required. category is required for new products, optional when updating.' }),
        el('li', { text: 'A name that matches an existing product updates it. A new name comes in as a draft — you publish it from the Products page.' }),
        el('li', { text: 'Products that have sizes or colours only get their price and description updated here — set their stock on the Inventory page.' }),
        el('li', { text: 'price and quantity are whole numbers (shillings and units).' }),
        el('li', {
          text: 'Photos: name the photo files in your spreadsheet’s photos column (e.g. orin-front.jpg; orin-back.jpg), first one is the main photo, then select those files here.',
        }),
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
  const dropZone = el('div', {
    class: 'import-dropzone stack',
    id: 'import-dropzone',
    on: {
      dragover: (e) => { e.preventDefault(); dropZone.classList.add('is-drag'); },
      dragleave: () => dropZone.classList.remove('is-drag'),
      drop: (e) => {
        e.preventDefault();
        dropZone.classList.remove('is-drag');
        const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
        const csv = files.find((f) => /\.csv$/i.test(f.name) || f.type === 'text/csv');
        if (csv) setCsv(csv);
        addPhotos(files.filter((f) => (f.type || '').startsWith('image/')));
      },
    },
  }, [
    el('p', { class: 'import-dropzone__hint', text: 'Drop the CSV and the photo files here, or choose them below.' }),

    el('div', { class: 'import-upload__row' }, [
      el('label', { class: 'btn btn--secondary' }, [
        document.createTextNode('Choose CSV'),
        el('input', {
          type: 'file',
          accept: '.csv,text/csv',
          class: 'visually-hidden',
          id: 'import-file',
          on: {
            change: (e) => {
              setCsv((e.target.files && e.target.files[0]) || null);
              e.target.value = '';
            },
          },
        }),
      ]),
      el('span', { class: 'import-filename', id: 'import-filename', text: state.file ? state.file.name : 'No file chosen' }),
    ]),

    el('div', { class: 'import-upload__row' }, [
      el('label', { class: 'btn btn--secondary' }, [
        document.createTextNode('Choose photos'),
        el('input', {
          type: 'file',
          accept: 'image/*',
          multiple: true,
          class: 'visually-hidden',
          id: 'import-photos',
          on: {
            change: (e) => {
              addPhotos(Array.from(e.target.files || []));
              e.target.value = '';
            },
          },
        }),
      ]),
      el('span', { class: 'import-filename', id: 'import-photo-count', text: photoCountText() }),
      el('button', {
        class: 'btn btn--small btn--ghost',
        type: 'button',
        id: 'import-photos-clear',
        hidden: state.photoFiles.length === 0,
        text: 'Clear photos',
        on: { click: () => { state.photoFiles = []; refreshUploadUi(); } },
      }),
    ]),

    el('button', {
      class: 'btn',
      id: 'import-preview-btn',
      type: 'button',
      disabled: !state.file,
      text: 'Preview changes',
      on: { click: runPreview },
    }),
  ]);
  return dropZone;
}

function photoCountText() {
  const n = state.photoFiles.length;
  return n === 0 ? 'No photos selected' : `${n} photo${n === 1 ? '' : 's'} selected`;
}

function setCsv(file) {
  state.file = file || null;
  refreshUploadUi();
  clear($('#import-upload-msg'));
}

function addPhotos(files) {
  if (!files || !files.length) return;
  const seen = new Set(state.photoFiles.map((f) => `${f.name}:${f.size}`));
  files.forEach((f) => {
    if (f.type && !f.type.startsWith('image/')) return;
    const key = `${f.name}:${f.size}`;
    if (seen.has(key)) return;
    seen.add(key);
    state.photoFiles.push(f);
  });
  refreshUploadUi();
}

function refreshUploadUi() {
  const name = $('#import-filename');
  if (name) name.textContent = state.file ? state.file.name : 'No file chosen';
  const count = $('#import-photo-count');
  if (count) count.textContent = photoCountText();
  const clearBtn = $('#import-photos-clear');
  if (clearBtn) clearBtn.hidden = state.photoFiles.length === 0;
  const previewBtn = $('#import-preview-btn');
  if (previewBtn) previewBtn.disabled = !state.file;
}

async function runPreview() {
  if (!state.file) return;
  const btn = $('#import-preview-btn');
  clear($('#import-upload-msg'));
  btn.disabled = true;
  btn.textContent = 'Checking your files…';
  try {
    const plan = await api.admin.importProducts(state.file, state.photoFiles);
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

function planHasPhotos() {
  return (state.plan.rows || []).some((r) => r.photos && (r.photos.matched || []).length > 0);
}

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
        el('p', { class: 'hint', text: "Problem rows won't be applied — fix them in your spreadsheet and import again. A missing photo is only a note; the row still applies." }),
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
  const items = [
    el('span', { class: 'import-count import-count--new', text: `${s.toCreate || 0} new` }),
    el('span', { class: 'import-count import-count--update', text: `${s.toUpdate || 0} to update` }),
    el('span', { class: 'import-count import-count--skip', text: `${s.toSkip || 0} skipped` }),
    el('span', { class: 'import-count import-count--problem', text: `${s.errors || 0} with a problem` }),
  ];
  const ph = s.photos;
  if (ph && (ph.selected || ph.matched || ph.missing)) {
    items.push(el('span', { class: 'import-count import-count--photo', text: `${ph.matched || 0} photos matched` }));
    if (ph.missing) items.push(el('span', { class: 'import-count import-count--warn', text: `${ph.missing} not found` }));
  }
  return el('div', { class: 'import-countstrip' }, items);
}

function planTable(rows) {
  const body = (rows || []).map((r) => {
    const muted = r.action === 'skip' || r.action === 'error';
    return el('tr', { class: muted ? 'import-row--muted' : null }, [
      el('td', { text: String(r.row) }),
      el('td', { text: r.name || '—' }),
      el('td', {}, [actionBadge(r.action)]),
      el('td', {}, [changeList(r)]),
      el('td', {}, [photoCell(r)]),
      el('td', {}, [notesCell(r)]),
    ]);
  });
  return el('div', { class: 'admin-table-wrap' }, [
    el('table', { class: 'admin-table import-table' }, [
      el('thead', {}, [
        el('tr', {}, ['Row', 'Product', 'Action', 'Changes', 'Photos', 'Notes'].map((h) => el('th', { scope: 'col', text: h }))),
      ]),
      el('tbody', {}, body.length ? body : [el('tr', {}, [el('td', { colspan: 6, text: 'No data rows found.' })])]),
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

function photoCell(r) {
  const ph = r.photos || { count: 0, matched: [], missing: [] };
  const matched = ph.matched || [];
  const missing = ph.missing || [];
  const parts = [];
  if (matched.length) {
    parts.push(el('p', { class: 'import-photo import-photo--ok', text: `${matched.length} photo${matched.length === 1 ? '' : 's'} ✓` }));
  }
  missing.forEach((nm) => {
    parts.push(el('p', { class: 'import-photo import-photo--warn', text: `⚠ ${nm} not selected — add it later` }));
  });
  if (!parts.length) {
    if (r.action === 'create' && !ph.count) {
      parts.push(el('p', { class: 'import-photo import-photo--muted', text: 'No photos — will be a draft' }));
    } else {
      return el('span', { class: 'hint', text: '—' });
    }
  }
  return el('div', {}, parts);
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
  const withPhotos = planHasPhotos();
  clear(box);
  btn.disabled = true;
  btn.textContent = 'Applying…';
  try {
    state.result = await api.admin.commitImport(
      state.plan.token,
      state.commitKey,
      withPhotos ? state.photoFiles : null
    );
    renderStep3();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 410 || err.status === 409)) {
      state.uploadMessage = 'This preview has expired or was already applied — upload the file again.';
      resetToUpload();
      return;
    }
    if (err instanceof ApiError && err.status === 413) {
      btn.disabled = false;
      btn.textContent = original;
      clear(box).append(
        el('p', {
          class: 'alert alert--error',
          text: "You've selected too many photos for one import — split your spreadsheet into smaller batches (up to ~60 photos / 100 MB at a time).",
        }),
        el('button', {
          class: 'btn btn--secondary',
          type: 'button',
          text: 'Choose fewer photos',
          on: { click: () => { state.uploadMessage = null; renderStep1(); } },
        })
      );
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
  state.photoFiles = [];
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
  const imagesAttached = res.imagesAttached || 0;
  const imagesFailed = res.imagesFailed || 0;

  let summaryText = `${created} ${created === 1 ? 'product' : 'products'} created, ${updated} updated`;
  if (imagesAttached) {
    summaryText += ` · ${imagesAttached} photo${imagesAttached === 1 ? '' : 's'} added`;
  }
  if (skipped || failed) {
    summaryText += ` — ${skipped} skipped, ${failed} couldn't be applied`;
  }

  const rows = res.rows || [];
  const createdRows = rows.filter((r) => r.result === 'created');
  const failedRows = rows.filter((r) => r.result === 'failed');
  const photoFailRows = rows.filter((r) => (r.photosFailed || 0) > 0);

  clear(content).append(
    backLink(),
    stepIndicator(3),
    el('div', { class: 'admin-section-card stack import-card' }, [
      el('h2', { text: 'Import complete' }),
      el('p', { class: 'import-result-summary', text: summaryText }),
      created > 0
        ? el('p', { class: 'hint', text: 'New products are drafts — check them on the list below, then tick them and click "Publish selected".' })
        : null,
      failedRows.length
        ? el('div', { class: 'stack' }, [
            el('h3', { text: "Rows that couldn't be applied" }),
            el('ul', { class: 'import-failed' }, failedRows.map((r) =>
              el('li', { text: `Row ${r.row} — ${r.name}: ${r.message || 'could not be applied'}` })
            )),
          ])
        : null,
      imagesFailed > 0 && photoFailRows.length
        ? el('div', { class: 'stack' }, [
            el('h3', { text: 'Photos that could not be added' }),
            el('ul', { class: 'import-photo-fails' }, photoFailRows.flatMap((r) => {
              const msgs = (r.photoMessages && r.photoMessages.length)
                ? r.photoMessages
                : [`${r.photosFailed} photo${r.photosFailed === 1 ? '' : 's'} skipped`];
              return msgs.map((m) => el('li', { text: `${r.name}: ${m}` }));
            })),
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
