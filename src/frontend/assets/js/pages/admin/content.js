import { api } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState } from '../../components.js';
import { adminShell } from './_shell.js';
import { toast } from '../../toast.js';

let content;
let data;

start();

async function start() {
  const shell = await adminShell('content', 'Homepage content');
  if (!shell) return;
  content = shell.content;
  clear(content).append(el('div', { class: 'spinner' }));
  try {
    data = await api.admin.getHomeContent();
    render();
  } catch (err) {
    clear(content).append(errorState(err, start));
  }
}

function render() {
  clear(content);
  const a = data.announcement || {};
  const h = data.hero || {};

  const form = el('form', {
    class: 'stack',
    on: { submit: save },
  }, [
    section('Announcement bar', [
      checkbox('an-enabled', 'Show the announcement bar', a.enabled),
      text('an-text', 'Text', a.text),
      text('an-href', 'Link (optional)', a.href),
    ]),
    section('Hero', [
      text('h-headline', 'Headline', h.headline),
      text('h-subcopy', 'Sub-copy', h.subcopy, true),
      text('h-ctaLabel', 'CTA label', h.ctaLabel),
      text('h-ctaHref', 'CTA link', h.ctaHref),
      text('h-imageId', 'Hero image id', h.imageId || (h.image && h.image.id)),
    ]),
    section('Featured collection', [
      text('featured', 'Featured collection slug', data.featuredCollectionSlug),
    ]),
    section('Editorial blocks', [
      el('p', { class: 'hint', text: 'One block per line: caption | imageId | href' }),
      textarea('editorial', (data.editorialBlocks || []).map((b) => `${b.caption || ''} | ${b.imageId || (b.image && b.image.id) || ''} | ${b.href || ''}`).join('\n')),
    ]),
    section('Category tiles', [
      el('p', { class: 'hint', text: 'One per line: label | href | imageId' }),
      textarea('tiles', (data.categoryTiles || []).map((t) => `${t.label || ''} | ${t.href || ''} | ${t.imageId || (t.image && t.image.id) || ''}`).join('\n')),
    ]),
    section('Social links', [
      el('p', { class: 'hint', text: 'One per line: platform | url' }),
      textarea('social', (data.socialLinks || []).map((s) => `${s.platform} | ${s.url}`).join('\n')),
    ]),
    el('div', { role: 'alert', id: 'content-alert' }),
    el('div', { class: 'sticky-savebar' }, [
      el('span', { class: 'hint', text: 'Publishing is immediate; the CDN cache for the homepage is purged.' }),
      el('button', { class: 'btn', type: 'submit', text: 'Save & publish' }),
    ]),
  ]);
  content.append(form);
}

function section(title, children) {
  return el('div', { class: 'admin-section-card' }, [el('h2', { text: title }), ...children]);
}
function text(id, label, value, area) {
  const node = area ? el('textarea', { class: 'textarea', id }) : el('input', { class: 'input', id });
  if (value != null) node.value = value;
  return el('div', { class: 'field' }, [el('label', { for: id, text: label }), node]);
}
function textarea(id, value) {
  const node = el('textarea', { class: 'textarea', id, rows: 5 });
  node.value = value || '';
  return el('div', { class: 'field' }, [el('label', { for: id, class: 'visually-hidden', text: id }), node]);
}
function checkbox(id, label, checked) {
  return el('label', { class: 'checkbox' }, [el('input', { type: 'checkbox', id, checked: !!checked }), el('span', { text: label })]);
}

async function save(e) {
  e.preventDefault();
  const alert = $('#content-alert');
  clear(alert);
  const v = (id) => { const n = $(`#${id}`); return n ? n.value.trim() : ''; };
  const parseLines = (id, fn) => v(id).split('\n').map((l) => l.trim()).filter(Boolean).map(fn);

  const body = {
    announcement: { enabled: $('#an-enabled').checked, text: v('an-text'), href: v('an-href') || null },
    hero: {
      headline: v('h-headline'),
      subcopy: v('h-subcopy'),
      ctaLabel: v('h-ctaLabel'),
      ctaHref: v('h-ctaHref'),
      imageId: v('h-imageId') || null,
    },
    featuredCollectionSlug: v('featured') || null,
    editorialBlocks: parseLines('editorial', (l) => {
      const [caption, imageId, href] = l.split('|').map((s) => s.trim());
      return { caption, imageId: imageId || null, href: href || null };
    }),
    categoryTiles: parseLines('tiles', (l) => {
      const [label, href, imageId] = l.split('|').map((s) => s.trim());
      return { label, href, imageId: imageId || null };
    }),
    socialLinks: parseLines('social', (l) => {
      const [platform, url] = l.split('|').map((s) => s.trim());
      return { platform, url };
    }),
  };

  const btn = e.target.querySelector('button[type="submit"]');
  btn.classList.add('is-loading');
  try {
    data = await api.admin.updateHomeContent(body);
    toast('Homepage content published.', 'success');
    alert.append(el('div', { class: 'alert alert--success', text: 'Saved. The homepage CDN cache has been purged.' }));
  } catch (err) {
    alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not save the homepage content.' }));
  } finally {
    btn.classList.remove('is-loading');
  }
}
