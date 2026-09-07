import { el, clear } from './dom.js';

/**
 * Open a <dialog> modal with a title and body node(s). Returns the dialog element.
 * Uses the native dialog so focus-trap + Esc + backdrop come for free.
 */
export function openModal({ title, body, className = 'modal', labelledById }) {
  const titleId = labelledById || `modal-title-${Math.random().toString(36).slice(2)}`;
  const dialog = el('dialog', { class: className, 'aria-labelledby': titleId });

  const head = el('div', { class: 'modal__head' }, [
    el('h2', { id: titleId, text: title || '', style: 'font-size:var(--step-1)' }),
    el('button', {
      class: 'modal__close',
      'aria-label': 'Close',
      text: '×',
      on: { click: () => close() },
    }),
  ]);
  const bodyWrap = el('div', { class: 'modal__body' });
  if (typeof body === 'string') bodyWrap.innerHTML = body;
  else if (body) bodyWrap.append(...(Array.isArray(body) ? body : [body]));

  dialog.append(head, bodyWrap);
  document.body.appendChild(dialog);

  function close() {
    dialog.close();
  }
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    const rect = dialog.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    if (!inside) close();
  });

  dialog.showModal();
  return { dialog, close, setBody: (node) => clear(bodyWrap).append(node) };
}

/** Image lightbox — the only place the full-resolution asset loads (design-spec §6 PDP). */
export function openLightbox(images, startIndex = 0) {
  let index = startIndex;
  const dialog = el('dialog', { class: 'lightbox', 'aria-label': 'Image viewer' });
  const img = el('img', { class: 'lightbox__img', alt: '' });
  const counter = el('span', { style: 'color:var(--color-surface)' });

  function show() {
    const current = images[index];
    img.src = current.fullUrl || current.thumbUrl;
    img.alt = current.alt || '';
    counter.textContent = `${index + 1} / ${images.length}`;
  }
  function step(delta) {
    index = (index + delta + images.length) % images.length;
    show();
  }

  const bar = el('div', { class: 'lightbox__bar' }, [
    counter,
    el('div', { style: 'display:flex;gap:.5rem' }, [
      images.length > 1 ? el('button', { text: 'Prev', 'aria-label': 'Previous image', on: { click: () => step(-1) } }) : null,
      images.length > 1 ? el('button', { text: 'Next', 'aria-label': 'Next image', on: { click: () => step(1) } }) : null,
      el('button', { text: 'Close', on: { click: () => dialog.close() } }),
    ]),
  ]);

  dialog.append(bar, img);
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  show();
  dialog.showModal();
}
