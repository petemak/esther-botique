import { el } from './dom.js';

let region;

function getRegion() {
  if (!region) {
    region = el('div', {
      class: 'toast-region',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'false',
    });
    document.body.appendChild(region);
  }
  return region;
}

export function toast(message, kind = 'info', ttl = 4500) {
  const node = el('div', { class: `toast toast--${kind}`, text: message });
  getRegion().appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s';
    setTimeout(() => node.remove(), 300);
  }, ttl);
  return node;
}
