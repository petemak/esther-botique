import { api, ApiError } from '../api.js';
import { el, clear } from '../dom.js';
import { errorState } from '../components.js';
import { getParam, formatDate, setPageMeta } from '../util.js';
import { bootStorefront, view, showSpinner } from './_boot.js';

bootStorefront({ active: '' });

const DOCS = {
  'terms-of-sale': 'Terms of Sale',
  privacy: 'Privacy Policy',
  returns: 'Returns & Refund Policy',
};

const docType = DOCS[getParam('doc')] ? getParam('doc') : 'terms-of-sale';
const version = getParam('v');

load();

async function load() {
  showSpinner();
  try {
    const doc = version ? await api.getLegalVersion(docType, version) : await api.getLegal(docType);
    render(doc);
  } catch (err) {
    clear(view());
    if (err instanceof ApiError && err.status === 404) {
      view().append(errorState({ message: 'That document or version could not be found.' }));
    } else {
      view().append(errorState(err, load));
    }
  }
}

function render(doc) {
  const root = view();
  clear(root);
  setPageMeta({
    title: `${doc.title} — House of Esther`,
    description: `${doc.title}, version ${doc.version}, effective ${formatDate(doc.effectiveDate)}. House of Esther.`,
    canonicalPath: `/legal.html?doc=${docType}`,
  });

  root.append(
    el('nav', { class: 'chips', style: 'margin-bottom:1rem' },
      Object.entries(DOCS).map(([slug, label]) =>
        el('a', { class: 'chip', href: `/legal.html?doc=${slug}`, 'aria-current': slug === docType ? 'page' : null, text: label })
      )
    ),
    el('header', { class: 'stack', style: 'margin-bottom:1rem' }, [
      el('h1', { text: doc.title }),
      el('p', { class: 'text-muted', text: `Version ${doc.version} — effective ${formatDate(doc.effectiveDate)}${version ? ' (historical version)' : ''}` }),
      doc.previousVersions && doc.previousVersions.length
        ? el('details', {}, [
            el('summary', { style: 'cursor:pointer', text: 'Previous versions' }),
            el('ul', {}, doc.previousVersions.map((v) =>
              el('li', {}, [el('a', { href: `/legal.html?doc=${docType}&v=${v.version}`, text: `v${v.version} — effective ${formatDate(v.effectiveDate)}` })])
            )),
          ])
        : null,
    ]),
    el('article', { class: 'prose', html: sanitize(doc.bodyHtml || '') }),
    el('hr'),
    el('p', { class: 'hint' }, [
      document.createTextNode('Questions about this document? '),
      el('a', { href: '/contact.html', text: 'Contact us' }),
      document.createTextNode('.'),
    ])
  );
}

function sanitize(html) {
  return String(html)
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '');
}
