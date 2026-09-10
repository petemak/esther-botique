import { api, ApiError } from '../../api.js';
import { el, clear, $, imageEl } from '../../dom.js';
import { errorState, fieldError, applyValidationErrors } from '../../components.js';
import { getParam } from '../../util.js';
import { CATEGORIES } from '../../config.js';
import { adminShell } from './_shell.js';
import { toast } from '../../toast.js';

let content;
let productId = getParam('id') || null;
let model = blankModel();
let images = []; // { id, alt, thumbUrl, fullUrl, thumbBytes, fullBytes, isPrimary }

function blankModel() {
  return {
    name: '', slug: '', category: 'women', subcategory: '', shortDescription: '',
    story: '', care: '', specs: [],
    basePrice: { amount: 0, currency: 'KES' }, compareAtPrice: null, vatInclusive: true,
    optionAxes: [{ name: 'Size', values: ['One size'] }],
    variants: [], status: 'draft', seo: { title: '', description: '' },
  };
}

start();

async function start() {
  const shell = await adminShell('products', productId ? 'Edit product' : 'New product');
  if (!shell) return;
  content = shell.content;
  if (productId) {
    content.append(el('div', { class: 'spinner' }));
    try {
      const p = await api.admin.getProduct(productId);
      model = { ...blankModel(), ...p, basePrice: p.basePrice || p.price || { amount: 0, currency: 'KES' } };
      images = (p.images || []).map((i) => ({ ...i, isPrimary: i.isPrimary || i.id === p.primaryImageId }));
    } catch (err) {
      clear(content).append(errorState(err, start));
      return;
    }
  }
  render();
}

function render() {
  clear(content);
  const form = el('form', { id: 'prod-form', class: 'admin-form-grid', novalidate: true, on: { submit: (e) => e.preventDefault() } });

  const mainCol = el('div', {}, [
    basicsCard(),
    mediaCard(),
    variantsCard(),
    seoCard(),
  ]);

  const sideCol = el('div', {}, [
    el('div', { class: 'admin-section-card' }, [
      el('h2', { text: 'Publishing' }),
      el('div', { class: 'field' }, [
        el('label', { for: 'p-status', text: 'Status' }),
        el('select', { class: 'select', id: 'p-status' }, ['draft', 'published', 'archived'].map((s) => el('option', { value: s, text: s, selected: model.status === s }))),
      ]),
      el('button', {
        class: 'btn btn--secondary btn--block',
        type: 'button',
        id: 'preview-btn',
        text: 'Preview',
        on: { click: openPreview },
      }),
      el('p', { class: 'hint', text: 'Preview opens the storefront PDP in a new tab exactly as customers will see it — for a draft, published or archived product. Preview and every admin view read live, uncached data.' }),
      el('p', { class: 'hint', text: 'Published catalogue pages are served from the CDN edge with a ~2 minute max-age, so a brand-new publish (or a change to a live one) can take a couple of minutes to appear for everyone. Use Preview to check it immediately.' }),
    ]),
    el('div', { class: 'admin-section-card' }, [
      el('div', { role: 'alert', id: 'p-alert' }),
      el('div', { class: 'sticky-savebar' }, [
        el('span', { class: 'hint', id: 'p-savehint', text: productId ? `Editing ${model.name}` : 'New product' }),
        el('div', { style: 'display:flex;gap:.5rem' }, [
          el('button', { class: 'btn btn--secondary', type: 'button', text: 'Save as draft', on: { click: () => save('draft') } }),
          el('button', { class: 'btn', type: 'button', text: model.status === 'published' ? 'Save & keep live' : 'Publish', on: { click: () => save('published') } }),
        ]),
      ]),
    ]),
  ]);

  form.append(mainCol, sideCol);
  content.append(form);
}

function openPreview() {
  if (!productId) {
    toast('Save the product first, then Preview shows the live PDP.', 'info');
    return;
  }
  window.open(`/product.html?preview=${encodeURIComponent(productId)}`, '_blank', 'noopener');
}

/* ---------- Basics ---------- */
function basicsCard() {
  const name = input('name', 'Name', model.name, { required: true });
  const slug = input('slug', 'Slug', model.slug, { hint: 'Auto-fills from the name; edit if you need to.' });
  name.querySelector('input').addEventListener('input', (e) => {
    const s = slug.querySelector('input');
    if (!s.dataset.touched) s.value = slugify(e.target.value);
  });
  slug.querySelector('input').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });

  const category = el('select', { class: 'select', id: 'p-category' }, CATEGORIES.map((c) => el('option', { value: c.slug, text: c.label, selected: model.category === c.slug })));

  return el('div', { class: 'admin-section-card' }, [
    el('h2', { text: 'Basics' }),
    name,
    slug,
    el('div', { class: 'form-row form-row--2' }, [
      el('div', { class: 'field' }, [el('label', { for: 'p-category', text: 'Category' }), category]),
      input('subcategory', 'Subcategory', model.subcategory),
    ]),
    input('shortDescription', 'Short description', model.shortDescription, { textarea: true }),
    el('div', { class: 'field' }, [
      el('label', { for: 'p-story', text: 'Product story' }),
      richText('p-story', model.story),
      el('p', { class: 'hint', text: 'Why this piece was chosen, the materials, how it wears.' }),
    ]),
    input('care', 'Care', model.care, { textarea: true }),
    specsEditor(),
  ]);
}

function specsEditor() {
  const wrap = el('div', { class: 'field' }, [el('label', { text: 'Specification list' })]);
  const rows = el('div', { id: 'spec-rows', class: 'stack' });
  const addRow = (label = '', value = '') => {
    const row = el('div', { style: 'display:flex;gap:.5rem' }, [
      el('input', { class: 'input', 'aria-label': 'Spec label', placeholder: 'Material', value: label, dataset: { specLabel: '' } }),
      el('input', { class: 'input', 'aria-label': 'Spec value', placeholder: 'Vegetable-tanned cowhide', value, dataset: { specValue: '' } }),
      el('button', { type: 'button', class: 'btn btn--small btn--ghost', 'aria-label': 'Remove spec', text: '×', on: { click: () => row.remove() } }),
    ]);
    rows.append(row);
  };
  (model.specs || []).forEach((s) => addRow(s.label, s.value));
  if (!model.specs || !model.specs.length) addRow();
  wrap.append(rows, el('button', { type: 'button', class: 'btn btn--small btn--secondary', style: 'margin-top:.5rem', text: 'Add spec', on: { click: () => addRow() } }));
  return wrap;
}

/* ---------- Media ---------- */
function mediaCard() {
  const drop = el('div', { class: 'uploader-drop' }, [
    el('p', { text: 'Drag photos here, or' }),
    el('label', { class: 'btn btn--secondary btn--small', style: 'display:inline-flex' }, [
      document.createTextNode('Choose files'),
      el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', on: { change: (e) => uploadFiles(e.target.files) } }),
    ]),
    el('p', { class: 'hint', text: 'We re-encode each photo on upload to meet the size budget (full ≤ ~300 KB / 2000px, thumb ≤ ~60 KB / 800px) and strip EXIF data.' }),
  ]);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.background = 'var(--color-bg-sink)'; });
  drop.addEventListener('dragleave', () => { drop.style.background = ''; });
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.style.background = ''; uploadFiles(e.dataTransfer.files); });

  return el('div', { class: 'admin-section-card' }, [
    el('h2', { text: 'Media' }),
    drop,
    el('div', { class: 'uploader-grid', id: 'uploader-grid' }, renderImageTiles()),
  ]);
}

function renderImageTiles() {
  return images.map((img, i) =>
    el('div', { class: 'uploader-item' }, [
      imageEl(img, { altFallback: 'Product photo' }),
      el('label', { class: 'field', style: 'margin:.25rem 0' }, [
        el('span', { class: 'hint', text: 'Alt text' }),
        el('input', { class: 'input', value: img.alt || '', 'aria-label': `Alt text for image ${i + 1}`, on: { input: (e) => { images[i].alt = e.target.value; } } }),
      ]),
      el('label', { class: 'radio' }, [
        el('input', { type: 'radio', name: 'primaryImage', checked: !!img.isPrimary, on: { change: () => { images.forEach((x, j) => { x.isPrimary = j === i; }); } } }),
        el('span', { text: 'Primary' }),
      ]),
      img.thumbBytes ? el('p', { class: 'bytes', text: `thumb ${kb(img.thumbBytes)} · full ${kb(img.fullBytes)}` }) : null,
      el('button', { type: 'button', class: 'btn btn--small btn--ghost', text: 'Remove', on: { click: () => removeImage(i) } }),
    ])
  );
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const file of files) {
    if (!file.type.startsWith('image/')) { toast(`${file.name} is not an image.`, 'error'); continue; }
    const placeholder = { id: `pending-${Date.now()}`, alt: '', pending: true };
    images.push(placeholder);
    refreshTiles();
    try {
      const ref = await api.admin.uploadImage(file, '');
      Object.assign(placeholder, ref, { pending: false });
      if (images.length === 1) placeholder.isPrimary = true;
    } catch (err) {
      images = images.filter((x) => x !== placeholder);
      toast((err instanceof ApiError && err.message) || `Could not upload ${file.name}.`, 'error');
    }
    refreshTiles();
  }
}

async function removeImage(i) {
  const img = images[i];
  images.splice(i, 1);
  if (img && img.id && !img.pending && !String(img.id).startsWith('pending')) {
    try { await api.admin.deleteImage(img.id); } catch { /* may still be referenced elsewhere */ }
  }
  if (images.length && !images.some((x) => x.isPrimary)) images[0].isPrimary = true;
  refreshTiles();
}

function refreshTiles() {
  const grid = $('#uploader-grid');
  if (grid) clear(grid).append(...renderImageTiles());
  refreshVariantImageSelects();
}

/* ---------- Variants ---------- */
function variantsCard() {
  return el('div', { class: 'admin-section-card' }, [
    el('h2', { text: 'Variants' }),
    axesEditor(),
    el('div', { style: 'display:flex;gap:.5rem;margin:.5rem 0' }, [
      el('button', { type: 'button', class: 'btn btn--small btn--secondary', text: 'Generate variant rows', on: { click: generateVariants } }),
    ]),
    el('div', { class: 'admin-table-wrap' }, [el('table', { class: 'admin-table variant-table', id: 'variant-table' }, [
      el('thead', {}, [el('tr', {}, ['Options', 'SKU', 'Price', 'Compare-at', 'Stock', 'Low-stock at', 'Image', 'Enabled'].map((h) => el('th', { scope: 'col', text: h })))]),
      el('tbody', { id: 'variant-body' }, renderVariantRows()),
    ])]),
  ]);
}

function axesEditor() {
  const wrap = el('div', { id: 'axes', class: 'stack' });
  const addAxis = (name = '', values = []) => {
    const row = el('div', { style: 'display:flex;gap:.5rem;align-items:center' }, [
      el('input', { class: 'input', style: 'max-width:9rem', 'aria-label': 'Option axis name', placeholder: 'Colour', value: name, dataset: { axisName: '' } }),
      el('input', { class: 'input', 'aria-label': 'Option values, comma separated', placeholder: 'Tan, Black', value: values.join(', '), dataset: { axisValues: '' } }),
      el('button', { type: 'button', class: 'btn btn--small btn--ghost', 'aria-label': 'Remove axis', text: '×', on: { click: () => row.remove() } }),
    ]);
    wrap.append(row);
  };
  (model.optionAxes || []).forEach((a) => addAxis(a.name, a.values));
  wrap.append(el('button', { type: 'button', class: 'btn btn--small btn--secondary', style: 'margin-top:.25rem', text: 'Add option axis', on: { click: () => addAxis() } }));
  return wrap;
}

function readAxes() {
  return Array.from($('#axes').querySelectorAll('[data-axis-name]')).map((nameInput) => {
    const valuesInput = nameInput.parentElement.querySelector('[data-axis-values]');
    return {
      name: nameInput.value.trim(),
      values: valuesInput.value.split(',').map((v) => v.trim()).filter(Boolean),
    };
  }).filter((a) => a.name && a.values.length);
}

function generateVariants() {
  const axes = readAxes();
  if (!axes.length) { toast('Add at least one option axis first.', 'error'); return; }
  const combos = axes.reduce((acc, axis) => {
    const next = [];
    acc.forEach((combo) => axis.values.forEach((v) => next.push({ ...combo, [axis.name]: v })));
    return next;
  }, [{}]);
  const existing = new Map((model.variants || []).map((v) => [JSON.stringify(v.options), v]));
  model.variants = combos.map((options) => {
    const prev = existing.get(JSON.stringify(options));
    return prev || {
      options,
      sku: '',
      price: { ...model.basePrice },
      compareAtPrice: model.compareAtPrice ? { ...model.compareAtPrice } : null,
      stock: 0,
      lowStockThreshold: 2,
      imageId: null,
      enabled: true,
    };
  });
  model.optionAxes = axes;
  const body = $('#variant-body');
  clear(body).append(...renderVariantRows());
}

function renderVariantRows() {
  return (model.variants || []).map((v, i) =>
    el('tr', {}, [
      el('td', { text: Object.values(v.options || {}).join(' / ') }),
      el('td', {}, [el('input', { type: 'text', value: v.sku || '', 'aria-label': `SKU for variant ${i + 1}`, on: { input: (e) => { v.sku = e.target.value; } } })]),
      el('td', {}, [numInput(v.price ? v.price.amount : 0, (n) => { v.price = { amount: n, currency: 'KES' }; }, `Price for variant ${i + 1}`)]),
      el('td', {}, [numInput(v.compareAtPrice ? v.compareAtPrice.amount : '', (n) => { v.compareAtPrice = n ? { amount: n, currency: 'KES' } : null; }, `Compare-at for variant ${i + 1}`)]),
      el('td', {}, [stockCell(v, i)]),
      el('td', {}, [numInput(v.lowStockThreshold != null ? v.lowStockThreshold : 2, (n) => { v.lowStockThreshold = n; }, `Low-stock threshold for variant ${i + 1}`)]),
      el('td', {}, [imageSelect(v)]),
      el('td', {}, [el('input', { type: 'checkbox', checked: v.enabled !== false, 'aria-label': `Enable variant ${i + 1}`, on: { change: (e) => { v.enabled = e.target.checked; } } })]),
    ])
  );
}

function stockCell(v, i) {
  if (!productId || v.id == null) {
    return numInput(v.stock != null ? v.stock : 0, (n) => { v.stock = n; }, `Stock for variant ${i + 1}`);
  }
  // Existing variant: stock changes go through an audited adjustment.
  const label = el('span', { text: String(v.quantityAvailable != null ? v.quantityAvailable : v.stock != null ? v.stock : '—') });
  return el('span', { style: 'display:flex;gap:.35rem;align-items:center' }, [
    label,
    el('button', { type: 'button', class: 'btn btn--small btn--ghost', text: 'Adjust', on: { click: () => adjustStock(v, label) } }),
  ]);
}

async function adjustStock(variant, labelNode) {
  const delta = window.prompt('Stock change (e.g. 12 to add, -3 to remove):');
  if (delta == null || delta === '') return;
  const n = parseInt(delta, 10);
  if (Number.isNaN(n)) { toast('Enter a whole number.', 'error'); return; }
  const reason = window.prompt('Reason (restock, correction, damage, return_to_stock):', 'restock') || 'correction';
  try {
    const res = await api.admin.createAdjustment({ variantId: variant.id, delta: n, reason, note: 'Adjusted from product editor' });
    labelNode.textContent = String(res.resultingStock);
    toast(`Stock now ${res.resultingStock}.`, 'success');
  } catch (err) {
    toast((err && err.message) || 'Could not adjust stock.', 'error');
  }
}

function imageSelect(v) {
  const sel = el('select', { class: 'select', 'aria-label': 'Variant image', dataset: { variantImage: '' } }, imageOptions(v.imageId));
  sel.addEventListener('change', (e) => { v.imageId = e.target.value || null; });
  return sel;
}
function imageOptions(current) {
  return [el('option', { value: '', text: '—', selected: !current })].concat(
    images.filter((i) => i.id && !i.pending).map((img, idx) => el('option', { value: img.id, text: img.alt || `Image ${idx + 1}`, selected: current === img.id }))
  );
}
function refreshVariantImageSelects() {
  Array.from(document.querySelectorAll('[data-variant-image]')).forEach((sel, i) => {
    const v = model.variants[i];
    clear(sel).append(...imageOptions(v && v.imageId));
  });
}

/* ---------- SEO ---------- */
function seoCard() {
  return el('div', { class: 'admin-section-card' }, [
    el('h2', { text: 'SEO' }),
    input('seoTitle', 'Meta title', model.seo ? model.seo.title : '', { hint: 'Defaults to the product name if left blank.' }),
    input('seoDescription', 'Meta description', model.seo ? model.seo.description : '', { textarea: true, hint: 'Defaults to the short description.' }),
  ]);
}

/* ---------- Save ---------- */
function collect() {
  const form = $('#prod-form');
  const val = (id) => { const n = form.querySelector(`#${id}`); return n ? n.value.trim() : ''; };
  const specs = Array.from(form.querySelectorAll('#spec-rows > div')).map((row) => ({
    label: row.querySelector('[data-spec-label]').value.trim(),
    value: row.querySelector('[data-spec-value]').value.trim(),
  })).filter((s) => s.label && s.value);

  const axes = readAxes();
  const body = {
    name: val('p-name'),
    slug: val('p-slug') || slugify(val('p-name')),
    category: val('p-category'),
    subcategory: val('p-subcategory') || undefined,
    shortDescription: val('p-shortDescription'),
    story: $('#p-story').innerHTML,
    care: val('p-care') || undefined,
    specs,
    basePrice: model.variants[0] && model.variants[0].price ? model.variants[0].price : model.basePrice,
    compareAtPrice: model.compareAtPrice || undefined,
    vatInclusive: model.vatInclusive,
    optionAxes: axes,
    variants: (model.variants || []).map((v) => ({
      id: v.id,
      options: v.options,
      sku: v.sku,
      price: v.price,
      compareAtPrice: v.compareAtPrice || undefined,
      stock: v.id ? undefined : v.stock || 0,
      lowStockThreshold: v.lowStockThreshold != null ? v.lowStockThreshold : 2,
      imageId: v.imageId || undefined,
      enabled: v.enabled !== false,
    })),
    imageIds: images.filter((i) => i.id && !i.pending).map((i) => i.id),
    primaryImageId: (images.find((i) => i.isPrimary) || images[0] || {}).id,
    seo: { title: val('p-seoTitle') || val('p-name'), description: val('p-seoDescription') || val('p-shortDescription') },
  };
  return body;
}

async function save(intendedStatus) {
  const form = $('#prod-form');
  const alert = $('#p-alert');
  clear(alert);
  const nameInput = form.querySelector('#p-name');
  if (!nameInput.value.trim()) { fieldError(nameInput, 'A name is required.'); return; }

  const body = collect();
  body.status = intendedStatus;

  const buttons = form.querySelectorAll('.sticky-savebar button');
  buttons.forEach((b) => { b.disabled = true; });
  try {
    let saved;
    if (productId) {
      saved = await api.admin.updateProduct(productId, body);
      // push variant field changes for existing variants (price/sku/threshold/enabled/image)
      await Promise.all((model.variants || []).filter((v) => v.id).map((v) =>
        api.admin.updateVariant(productId, v.id, {
          price: v.price,
          compareAtPrice: v.compareAtPrice || null,
          sku: v.sku,
          lowStockThreshold: v.lowStockThreshold,
          enabled: v.enabled !== false,
          imageId: v.imageId || null,
        }).catch(() => null)
      ));
      toast(intendedStatus === 'published' ? 'Saved and published.' : 'Saved as draft.', 'success');
    } else {
      saved = await api.admin.createProduct(body);
      productId = saved.id;
      model = { ...model, ...saved };
      window.history.replaceState({}, '', `/admin/product-edit.html?id=${encodeURIComponent(productId)}`);
      const hint = document.getElementById('p-savehint');
      if (hint) hint.textContent = `Editing ${saved.name || body.name}`;
      toast(intendedStatus === 'published' ? 'Product created and published.' : 'Draft saved.', 'success');
    }
    if (saved) {
      alert.append(el('div', { class: 'alert alert--success' }, [
        document.createTextNode(
          intendedStatus === 'published'
            ? 'Live. The CDN-cached storefront can take ~2 minutes to catch up — '
            : 'Saved as a draft (not visible to customers). '
        ),
        el('a', { href: `/product.html?preview=${encodeURIComponent(productId)}`, target: '_blank', rel: 'noopener', text: 'Preview the PDP now ↗' }),
      ]));
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 422) {
      applyValidationErrors(form, err.details);
      alert.append(el('div', { class: 'alert alert--error', text: err.message || 'Please fix the highlighted fields (duplicate slug or SKU?).' }));
    } else {
      alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not save the product.' }));
    }
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

/* ---------- small builders ---------- */
function input(name, label, value, opts = {}) {
  const id = `p-${name}`;
  const node = opts.textarea ? el('textarea', { class: 'textarea', id, name }) : el('input', { class: 'input', id, name });
  if (value != null) node.value = value;
  if (opts.required) node.required = true;
  node.addEventListener('input', () => fieldError(node, null));
  return el('div', { class: 'field' }, [
    el('label', { for: id, html: `${label}${opts.required ? ' <span class="req">*</span>' : ''}` }),
    node,
    opts.hint ? el('p', { class: 'hint', text: opts.hint }) : null,
  ]);
}

function numInput(value, onChange, label) {
  const i = el('input', { type: 'number', inputmode: 'numeric', value: value === '' ? '' : value, 'aria-label': label, min: 0 });
  i.addEventListener('input', () => onChange(i.value === '' ? '' : parseInt(i.value, 10) || 0));
  return i;
}

function richText(id, html) {
  const area = el('div', { class: 'rich-editor__area', id, contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Product story' });
  area.innerHTML = html || '';
  const cmd = (c) => { document.execCommand(c, false); area.focus(); };
  return el('div', { class: 'rich-editor' }, [
    el('div', { class: 'rich-editor__toolbar' }, [
      el('button', { type: 'button', title: 'Bold', text: 'B', on: { click: () => cmd('bold') } }),
      el('button', { type: 'button', title: 'Italic', style: 'font-style:italic', text: 'I', on: { click: () => cmd('italic') } }),
      el('button', { type: 'button', title: 'Bulleted list', text: '•', on: { click: () => cmd('insertUnorderedList') } }),
      el('button', { type: 'button', title: 'Paragraph', text: '¶', on: { click: () => cmd('formatBlock', 'p') } }),
    ]),
    area,
  ]);
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function kb(bytes) {
  return `${Math.round((bytes || 0) / 1024)} KB`;
}
