import { initChrome } from '../chrome.js';
import { $, mount, clear } from '../dom.js';
import { errorState } from '../components.js';
import { setPageMeta, ensureAbsoluteCanonical } from '../util.js';

export function view() {
  return $('#view');
}

export function setBusy(busy) {
  const v = view();
  if (v) v.setAttribute('aria-busy', busy ? 'true' : 'false');
}

export function render(nodeOrNodes) {
  const v = view();
  if (!v) return;
  mount(v, nodeOrNodes);
  setBusy(false);
}

export function renderError(err, retry) {
  render(errorState(err, retry));
}

export function showSpinner() {
  const v = view();
  if (!v) return;
  clear(v);
  const s = document.createElement('div');
  s.className = 'spinner';
  s.setAttribute('role', 'status');
  s.setAttribute('aria-label', 'Loading');
  v.appendChild(s);
  setBusy(true);
}

/** Standard storefront page boot: chrome + optional meta. */
export function bootStorefront({ active, meta } = {}) {
  ensureAbsoluteCanonical();
  initChrome({ active });
  if (meta) setPageMeta(meta);
}
