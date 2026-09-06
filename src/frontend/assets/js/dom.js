/** DOM helpers. Keep markup construction here so pages stay readable. */

export function $(sel, root) {
  return (root || document).querySelector(sel);
}

export function $$(sel, root) {
  return Array.from((root || document).querySelectorAll(sel));
}

export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(str) {
  return escapeHtml(str);
}

/**
 * Create an element. attrs: { class, text, html, dataset, aria..., on:{click} , ...props }
 * children: array of nodes/strings.
 */
export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  const a = attrs || {};
  Object.keys(a).forEach((key) => {
    const val = a[key];
    if (val == null || val === false) return;
    if (key === 'class' || key === 'className') node.className = val;
    else if (key === 'text') node.textContent = val;
    else if (key === 'html') node.innerHTML = val;
    else if (key === 'dataset') Object.assign(node.dataset, val);
    else if (key === 'on') {
      Object.keys(val).forEach((ev) => node.addEventListener(ev, val[ev]));
    } else if (key in node && key !== 'list') {
      node[key] = val;
    } else {
      node.setAttribute(key, val === true ? '' : val);
    }
  });
  appendChildren(node, children);
  return node;
}

export function appendChildren(node, children) {
  if (children == null) return;
  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child == null || child === false) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(root, node) {
  clear(root);
  appendChildren(root, node);
  return root;
}

/**
 * Neutral SVG placeholder in the brand palette — obviously a placeholder,
 * never a random-photo service (agent rule).
 */
export function placeholderSvg(label) {
  const text = escapeHtml(label || 'House of Esther');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" role="img" aria-label="${escapeAttr(
    label || 'Image coming soon'
  )}">
    <rect width="400" height="500" fill="#F4EEE4"/>
    <rect x="16" y="16" width="368" height="468" fill="none" stroke="#B08A46" stroke-width="2" stroke-dasharray="6 8"/>
    <g fill="none" stroke="#B08A46" stroke-width="2">
      <circle cx="200" cy="215" r="46"/>
      <path d="M120 330 L175 250 L215 300 L250 260 L300 330 Z"/>
    </g>
    <text x="200" y="410" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#1B2A4A">${text}</text>
    <text x="200" y="436" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" letter-spacing="2" fill="#8A6A32">IMAGE COMING SOON</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * <img> for an ImageRef-like object (or null). Uses thumbUrl for grids;
 * falls back to a brand placeholder. alt is required by the contract's ImageRef.
 */
export function imageEl(image, { full, altFallback, eager, className } = {}) {
  const src = image && (full ? image.fullUrl || image.thumbUrl : image.thumbUrl || image.fullUrl);
  const img = el('img', {
    src: src || placeholderSvg(altFallback),
    alt: (image && image.alt) || altFallback || '',
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    className,
  });
  if (image && image.width) img.width = image.width;
  if (image && image.height) img.height = image.height;
  img.addEventListener('error', () => {
    img.src = placeholderSvg(altFallback);
  });
  return img;
}

const ICONS = {
  search:
    '<path d="M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>',
  bag: '<path d="M7 8V7a5 5 0 0 1 10 0v1h3l1 13H3L4 8h3Zm2 0h6V7a3 3 0 0 0-6 0v1Z"/>',
  heart:
    '<path d="M12 21s-7.5-4.6-9.6-9.2C1 8.5 2.5 5 6 5c2 0 3.4 1.2 4 2 .6-.8 2-2 4-2 3.5 0 5 3.5 3.6 6.8C19.5 16.4 12 21 12 21Z"/>',
  user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z"/>',
  menu: '<path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"/>',
  truck:
    '<path d="M3 5h11v9H3V5Zm12 3h4l2 3v3h-6V8ZM6 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"/>',
  shield:
    '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1 13-3-3 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z"/>',
  camera:
    '<path d="M9 4h6l1 2h4v13H4V6h4l1-2Zm3 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/>',
  chat: '<path d="M4 4h16v12H7l-3 3V4Z"/>',
  check: '<path d="m9 16.2-3.5-3.5L4 14.2 9 19l11-11-1.4-1.4L9 16.2Z"/>',
};

export function icon(name, { size = 24, title } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', title ? 'false' : 'true');
  if (title) {
    svg.setAttribute('role', 'img');
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = title;
    svg.appendChild(t);
  }
  svg.insertAdjacentHTML('beforeend', ICONS[name] || ICONS.bag);
  return svg;
}
