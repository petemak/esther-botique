import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { adminShell } from './_shell.js';
import { uuid, titleCase, mapWithConcurrency } from '../../util.js';
import { resizeImageForUpload } from '../../imageResize.js';

/*
 * A17 — Product CSV bulk import wizard. Staff-level (require-admin), not owner-only.
 * Three steps on a dedicated route:
 *   1. Upload      — pick a CSV AND the product photo files, POST /api/admin/products/import
 *                    (multipart: CSV `file` + one `filename` text part per photo — names only).
 *                    Parses + plans, writes nothing, uploads nothing.
 *   2. Review      — render summary + per-row plan (incl. photo status) from the 200 response
 *   3. Done        — render tallies from the commit + the client-side photo phase (below)
 *
 * Downloads (export + template) are plain <a href> to same-origin authenticated GETs
 * that return Content-Disposition: attachment — the session cookie rides along.
 *
 * The commit carries an Idempotency-Key header (a uuid, same helper the checkout uses).
 * The key is generated once per preview and reused for every Apply click on that plan,
 * so a double-tap replays the stored result instead of applying twice.
 *
 * PHOTO DELIVERY (why this file looks the way it does):
 * The commit call (`POST /admin/products/import/commit`) used to also carry every
 * selected photo File in one multipart request. Netlify's rewrite-proxy to the Fly
 * backend has a hard body-size ceiling of roughly 8-9 MB on a request shaped like that —
 * above it Netlify itself returns a bare 400 before the request ever reaches our
 * backend. A real bulk-photo import (7+ unprocessed phone photos) is routinely
 * 15-40 MB and hit that wall every time.
 *
 * The fix: the commit is now ALWAYS plain `application/json { token }` — no photos ride
 * along, so the request is tiny regardless of batch size. Once the commit succeeds,
 * `runPhotoPhase()` uploads each matched photo individually via the already-reliable
 * `POST /admin/images` (one small multipart request per photo, resized client-side
 * first — see imageResize.js), then attaches the resulting ids to each row's product
 * with `PATCH /admin/products/{id} { imageIds, primaryImageId }` — appending to any
 * existing gallery for an `update` row, never wiping it.
 *
 * RETRY SAFETY: the CSV commit itself is idempotent (token + Idempotency-Key), but the
 * client-orchestrated photo phase is not something the backend knows how to replay
 * safely, so we never let it restart from scratch. `state.committed` latches true the
 * moment the commit succeeds and the Apply button disappears for good on this plan —
 * there is no code path back to it. Per-row / per-photo progress lives in
 * `state.photoRows`, keyed by row, and persists for the life of the page: a photo
 * already uploaded (`status: 'uploaded'`) is never re-uploaded, a row already fully
 * attached (`attached: true` and no photos still `failed`) is skipped entirely, and an
 * `update` row's pre-existing gallery is fetched at most once and cached
 * (`existingFetched`). The "Retry photos" button on the Done screen re-runs
 * `runPhotoPhase()`, which only touches rows/photos that did not fully succeed.
 */

const state = {
  file: null,
  photoFiles: [], // File[] selected alongside the CSV
  plan: null, // { token, summary, rows }
  commitKey: null,
  committed: false, // true once the JSON commit has succeeded for this plan — never re-sent
  result: null, // commit 200 body: { created, updated, skipped, failed, rows }
  photoRows: null, // built once the commit succeeds — see buildPhotoRows()
  photoProgress: null, // { rowIndex, rowTotal, photoIndex, photoTotal } while the photo phase runs
  uploadMessage: null,
};

const STEP_LABELS = ['Upload', 'Review', 'Done'];
const MAX_PHOTOS = 60; // soft pacing cap, not a hard technical limit any more — see note in addPhotos()

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
  let skippedForCap = 0;
  files.forEach((f) => {
    if (f.type && !f.type.startsWith('image/')) return;
    const key = `${f.name}:${f.size}`;
    if (seen.has(key)) return;
    if (state.photoFiles.length >= MAX_PHOTOS) { skippedForCap += 1; return; }
    seen.add(key);
    state.photoFiles.push(f);
  });
  refreshUploadUi();
  // Each photo now uploads in its own small request, so this is a pacing choice (a very
  // long sequential upload with no feedback would feel broken), not a hard technical
  // limit — the old ~8-9 MB proxy ceiling this used to guard against no longer applies
  // per-import now that no photos ride along with the commit.
  if (skippedForCap > 0) {
    showUploadMessage(
      `Only kept the first ${MAX_PHOTOS} photos for this import — that's the most we take in one batch. Split the rest into another import.`,
      'warning'
    );
  }
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
    state.committed = false;
    state.result = null;
    state.photoRows = null;
    state.photoProgress = null;
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

function showUploadMessage(text, kind = 'error') {
  const box = $('#import-upload-msg');
  if (box) clear(box).append(el('p', { class: `alert alert--${kind}`, text }));
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
  if (state.committed) return; // belt-and-braces — the Apply button no longer exists past this point
  const btn = $('#import-confirm-btn');
  const box = $('#import-commit-msg');
  const original = btn.textContent;
  clear(box);
  btn.disabled = true;
  btn.textContent = 'Applying…';
  try {
    state.result = await api.admin.commitImport(state.plan.token, state.commitKey);
    state.committed = true;
    state.photoRows = buildPhotoRows(state.plan, state.result);
    await runPhotoPhase();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 410 || err.status === 409)) {
      state.uploadMessage = 'This preview has expired or was already applied — upload the file again.';
      resetToUpload();
      return;
    }
    if (err instanceof ApiError && err.status === 413) {
      // Photos no longer ride along with this request, so this now only fires for a huge
      // CSV itself — kept for that case and because the backend contract still defines it.
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
  state.committed = false;
  state.result = null;
  state.photoRows = null;
  state.photoProgress = null;
  renderStep1();
}

/* ---------- photo phase: upload + attach, after the commit has succeeded ---------- */

/**
 * One entry per committed create/update row that named at least one matched photo.
 * `photos` preserves the CSV's order (first = intended primary) and each entry tracks
 * its own upload status so a retry never re-uploads something that already succeeded.
 */
function buildPhotoRows(plan, result) {
  const planByRow = new Map((plan.rows || []).map((r) => [r.row, r]));
  return (result.rows || [])
    .filter((r) => (r.result === 'created' || r.result === 'updated') && r.productId)
    .map((r) => {
      const planRow = planByRow.get(r.row);
      const matched = (planRow && planRow.photos && planRow.photos.matched) || [];
      if (!matched.length) return null;
      return {
        row: r.row,
        name: r.name,
        productId: r.productId,
        kind: r.result, // 'created' | 'updated'
        photos: matched.map((filename) => ({ filename, status: 'pending', id: null, reason: null })),
        existingFetched: false,
        existingImageIds: [],
        existingPrimaryImageId: null,
        attached: false,
        attachError: null,
      };
    })
    .filter(Boolean);
}

/** A row still has outstanding work if it never fully attached, or a photo needs retrying. */
function rowNeedsWork(pr) {
  return !pr.attached || pr.photos.some((p) => p.status === 'failed');
}

function findPhotoFile(filename) {
  const target = filename.toLowerCase();
  return state.photoFiles.find((f) => f.name.toLowerCase() === target) || null;
}

async function runPhotoPhase() {
  const rows = (state.photoRows || []).filter(rowNeedsWork);
  if (!rows.length) {
    state.photoProgress = null;
    renderStep3();
    return;
  }

  for (let i = 0; i < rows.length; i++) {
    const pr = rows[i];
    const toUpload = pr.photos.filter((p) => p.status !== 'uploaded');
    const photoTotal = pr.photos.length;
    let completed = photoTotal - toUpload.length;

    state.photoProgress = { rowIndex: i + 1, rowTotal: rows.length, photoIndex: Math.min(completed + 1, photoTotal), photoTotal };
    renderPhotoProgress();

    // Light concurrency (2 at a time), not a flood of simultaneous requests.
    // Kept modest because re-encoding is CPU-bound on a small shared-vCPU backend;
    // too much concurrency here risks slow responses that can trip a proxy timeout.
    await mapWithConcurrency(toUpload, 2, async (photoEntry) => {
      const file = findPhotoFile(photoEntry.filename);
      if (!file) {
        photoEntry.status = 'failed';
        photoEntry.reason = 'that file was not selected';
      } else {
        try {
          const toSend = await resizeImageForUpload(file);
          const ref = await api.admin.uploadImage(toSend, '');
          photoEntry.status = 'uploaded';
          photoEntry.id = ref.id;
        } catch (err) {
          photoEntry.status = 'failed';
          photoEntry.reason = (err && err.message) || 'upload failed';
        }
      }
      completed += 1;
      state.photoProgress = { rowIndex: i + 1, rowTotal: rows.length, photoIndex: Math.min(completed, photoTotal), photoTotal };
      renderPhotoProgress();
    });

    await attachRowPhotos(pr);
  }

  state.photoProgress = null;
  renderStep3();
}

/** Attach whatever uploaded successfully so far for this row. Append-only for updates. */
async function attachRowPhotos(pr) {
  const uploadedIds = pr.photos.filter((p) => p.status === 'uploaded').map((p) => p.id);
  if (!uploadedIds.length) {
    pr.attached = false;
    return;
  }
  try {
    if (pr.kind === 'updated' && !pr.existingFetched) {
      const existing = await api.admin.getProduct(pr.productId);
      pr.existingImageIds = (existing.images || []).map((im) => im.id);
      pr.existingPrimaryImageId = existing.primaryImageId
        || ((existing.images || []).find((im) => im.isPrimary) || {}).id
        || null;
      pr.existingFetched = true;
    }
    const combinedIds = pr.kind === 'updated' ? [...pr.existingImageIds, ...uploadedIds] : uploadedIds;
    const primaryImageId = pr.kind === 'updated' ? (pr.existingPrimaryImageId || combinedIds[0]) : combinedIds[0];
    await api.admin.updateProduct(pr.productId, { imageIds: combinedIds, primaryImageId });
    pr.attached = true;
    pr.attachError = null;
  } catch (err) {
    pr.attached = false;
    pr.attachError = (err && err.message) || 'could not save photos to this product';
  }
}

/** Per-row tallies for the Done screen, derived fresh from photo-entry state each render. */
function rowPhotoSummary(pr) {
  const uploadedCount = pr.photos.filter((p) => p.status === 'uploaded').length;
  const failedEntries = pr.photos.filter((p) => p.status === 'failed');
  const photosAttached = pr.attached ? uploadedCount : 0;
  const attachBlockedCount = !pr.attached && uploadedCount ? uploadedCount : 0;
  const photosFailed = failedEntries.length + attachBlockedCount;
  const photoMessages = [
    ...failedEntries.map((p) => `${p.filename} — ${p.reason}`),
    ...(attachBlockedCount
      ? [pr.attachError ? `Could not save the uploaded photos to this product — ${pr.attachError}` : 'Could not save the uploaded photos to this product']
      : []),
  ];
  return { photosAttached, photosFailed, photoMessages, pending: rowNeedsWork(pr) };
}

async function retryPhotos() {
  await runPhotoPhase();
}

function renderPhotoProgress() {
  const p = state.photoProgress;
  const message = p
    ? `Adding photos: product ${p.rowIndex} of ${p.rowTotal} (photo ${p.photoIndex} of ${p.photoTotal})…`
    : 'Saving your photos…';
  clear(content).append(
    backLink(),
    stepIndicator(3),
    el('div', { class: 'admin-section-card stack import-card' }, [
      el('h2', { text: 'Adding photos' }),
      el('p', { class: 'import-progress', role: 'status', 'aria-live': 'polite', text: message }),
    ])
  );
}

/* ---------- step 3: done ---------- */

function renderStep3() {
  const res = state.result || {};
  const created = res.created || 0;
  const updated = res.updated || 0;
  const skipped = res.skipped || 0;
  const failed = res.failed || 0;

  const photoSummaries = (state.photoRows || []).map((pr) => ({ pr, ...rowPhotoSummary(pr) }));
  const imagesAttached = photoSummaries.reduce((sum, x) => sum + x.photosAttached, 0);
  const imagesFailed = photoSummaries.reduce((sum, x) => sum + x.photosFailed, 0);
  const hasPending = photoSummaries.some((x) => x.pending);

  let summaryText = `${created} ${created === 1 ? 'product' : 'products'} created, ${updated} updated`;
  if (imagesAttached || imagesFailed) {
    const photoParts = [];
    if (imagesAttached) photoParts.push(`${imagesAttached} photo${imagesAttached === 1 ? '' : 's'} added`);
    if (imagesFailed) photoParts.push(`${imagesFailed} photo${imagesFailed === 1 ? '' : 's'} couldn't be added`);
    summaryText += ` · ${photoParts.join(', ')}`;
  }
  if (skipped || failed) {
    summaryText += ` — ${skipped} skipped, ${failed} couldn't be applied`;
  }

  const rows = res.rows || [];
  const createdRows = rows.filter((r) => r.result === 'created');
  const failedRows = rows.filter((r) => r.result === 'failed');
  const photoFailSummaries = photoSummaries.filter((x) => x.photosFailed > 0);

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
      photoFailSummaries.length
        ? el('div', { class: 'stack' }, [
            el('h3', { text: 'Photos that could not be added' }),
            el('ul', { class: 'import-photo-fails' }, photoFailSummaries.flatMap((x) =>
              x.photoMessages.map((m) => el('li', { text: `${x.pr.name}: ${m}` }))
            )),
            hasPending
              ? el('button', { class: 'btn btn--secondary', type: 'button', text: 'Retry photos', on: { click: onRetryPhotosClick } })
              : null,
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

async function onRetryPhotosClick() {
  await retryPhotos();
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
