import { api } from '../../api.js';
import { el, clear } from '../../dom.js';
import { errorState } from '../../components.js';
import { getParam, formatDate } from '../../util.js';
import { adminShell } from './_shell.js';
import { toast } from '../../toast.js';

const DOCS = [
  ['terms-of-sale', 'Terms of Sale'],
  ['privacy', 'Privacy Policy'],
  ['returns', 'Returns & Refund Policy'],
];

let content;
let docType = DOCS.some(([s]) => s === getParam('doc')) ? getParam('doc') : 'terms-of-sale';

start();

async function start() {
  const shell = await adminShell('legal', 'Legal documents');
  if (!shell) return;
  content = shell.content;
  await load();
}

async function load() {
  clear(content).append(el('div', { class: 'spinner' }));
  try {
    const [list, doc] = await Promise.all([api.admin.getLegalList().catch(() => null), api.admin.getLegal(docType)]);
    render(list, doc);
  } catch (err) {
    clear(content).append(errorState(err, load));
  }
}

function render(list, doc) {
  clear(content);
  content.append(
    el('nav', { class: 'tabs', role: 'tablist' },
      DOCS.map(([slug, label]) =>
        el('button', { type: 'button', role: 'tab', 'aria-selected': slug === docType ? 'true' : 'false', text: label, on: { click: () => { docType = slug; window.history.replaceState({}, '', `/admin/legal.html?doc=${slug}`); load(); } } })
      )
    ),
    el('div', { class: 'admin-section-card' }, [
      el('h2', { text: `${title()} — current v${doc.version || (doc.currentVersion || '—')}` }),
      doc.effectiveDate ? el('p', { class: 'hint', text: `Effective ${formatDate(doc.effectiveDate)}` }) : null,
      (doc.versions || doc.previousVersions)
        ? el('details', {}, [
            el('summary', { style: 'cursor:pointer', text: 'Version history' }),
            el('ul', {}, (doc.versions || doc.previousVersions || []).map((v) =>
              el('li', {}, [el('a', { href: `/legal.html?doc=${docType}&v=${v.version}`, target: '_blank', rel: 'noopener', text: `v${v.version} — ${formatDate(v.effectiveDate)}` })])
            )),
          ])
        : null,
      el('h3', { text: 'Current body' }),
      el('div', { class: 'prose readonly-panel', style: 'max-height:20rem;overflow:auto', html: sanitize(doc.bodyHtml || doc.draftHtml || '<em>No body yet.</em>') }),
    ]),
    publishForm(doc)
  );
}

function title() {
  return (DOCS.find(([s]) => s === docType) || [])[1] || 'Document';
}

function publishForm(doc) {
  const titleInput = el('input', { class: 'input', id: 'l-title', value: doc.title || title() });
  const effectiveDate = el('input', { class: 'input', id: 'l-date', type: 'date' });
  const bodyArea = el('div', { class: 'rich-editor__area', id: 'l-body', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document body' });
  bodyArea.innerHTML = doc.bodyHtml || doc.draftHtml || '';
  const cmd = (c, v) => { document.execCommand(c, false, v); bodyArea.focus(); };
  const alert = el('div', { role: 'alert' });

  return el('form', {
    class: 'admin-section-card stack',
    on: {
      submit: async (e) => {
        e.preventDefault();
        clear(alert);
        if (!bodyArea.textContent.trim()) { alert.append(el('div', { class: 'alert alert--error', text: 'The document body cannot be empty.' })); return; }
        if (!window.confirm('Publish a new version now? Checkout will immediately require acceptance of the new version numbers. Previous versions stay retrievable.')) return;
        const btn = e.target.querySelector('button');
        btn.classList.add('is-loading');
        try {
          const res = await api.admin.publishLegalVersion(docType, {
            bodyHtml: bodyArea.innerHTML,
            effectiveDate: effectiveDate.value || undefined,
            title: titleInput.value.trim(),
          });
          toast(`Published v${res.version}.`, 'success');
          alert.append(el('div', { class: 'alert alert--success', text: `Published version ${res.version}, effective ${formatDate(res.effectiveDate)}. The CDN cache for legal pages has been purged.` }));
          load();
        } catch (err) {
          alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not publish a new version.' }));
        } finally {
          btn.classList.remove('is-loading');
        }
      },
    },
  }, [
    el('h2', { text: 'Publish a new version' }),
    el('div', { class: 'field' }, [el('label', { for: 'l-title', text: 'Title' }), titleInput]),
    el('div', { class: 'field' }, [el('label', { for: 'l-date', text: 'Effective date' }), effectiveDate]),
    el('div', { class: 'field' }, [
      el('label', { for: 'l-body', text: 'Body' }),
      el('div', { class: 'rich-editor' }, [
        el('div', { class: 'rich-editor__toolbar' }, [
          el('button', { type: 'button', text: 'H2', on: { click: () => cmd('formatBlock', 'h2') } }),
          el('button', { type: 'button', text: 'P', on: { click: () => cmd('formatBlock', 'p') } }),
          el('button', { type: 'button', text: 'B', on: { click: () => cmd('bold') } }),
          el('button', { type: 'button', text: '•', on: { click: () => cmd('insertUnorderedList') } }),
        ]),
        bodyArea,
      ]),
    ]),
    el('p', { class: 'hint', text: 'Publishing a new Terms of Sale or Returns Policy means in-flight carts get an "agreement version stale" prompt at checkout and must re-accept.' }),
    alert,
    el('button', { class: 'btn', type: 'submit', text: 'Publish new version' }),
  ]);
}

function sanitize(html) {
  return String(html).replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
}
