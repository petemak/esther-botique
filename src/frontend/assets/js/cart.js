/**
 * Cart state + cart drawer. Single source of truth is the server (GET /api/cart);
 * this module caches the last response and notifies subscribers so the header
 * count and the drawer stay in sync across pages.
 */
import { api, ApiError } from './api.js';
import { el, clear, imageEl, escapeHtml } from './dom.js';
import { formatMoney } from './money.js';
import { toast } from './toast.js';

let cart = null;
let loaded = false;
const subscribers = new Set();

export function subscribeCart(fn) {
  subscribers.add(fn);
  if (loaded) fn(cart);
  return () => subscribers.delete(fn);
}

function emit() {
  subscribers.forEach((fn) => {
    try {
      fn(cart);
    } catch (err) {
      console.error('cart subscriber failed', err);
    }
  });
}

export function getCart() {
  return cart;
}

export function cartCount(c = cart) {
  if (!c || !c.items) return 0;
  return c.items.reduce((n, item) => n + (item.quantity || 0), 0);
}

export async function loadCart(force) {
  if (loaded && !force) return cart;
  try {
    cart = await api.getCart();
  } catch (err) {
    console.error('cart load failed', err);
    cart = cart || { items: [] };
  }
  loaded = true;
  emit();
  return cart;
}

async function withCart(promise, { successMsg } = {}) {
  try {
    cart = await promise;
    loaded = true;
    emit();
    if (successMsg) toast(successMsg, 'success');
    return cart;
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    toast(msg, 'error');
    throw err;
  }
}

export function addToCart(variantId, quantity = 1, opts = {}) {
  return withCart(api.addCartItem(variantId, quantity), {
    successMsg: opts.silent ? null : 'Added to your cart.',
  });
}

export function updateCartItem(itemId, quantity) {
  return withCart(api.updateCartItem(itemId, quantity));
}

export function removeCartItem(itemId) {
  return withCart(api.removeCartItem(itemId), { successMsg: 'Removed from your cart.' });
}

export function applyDiscount(code) {
  return withCart(api.applyDiscount(code), { successMsg: 'Discount applied.' });
}

export function removeDiscount() {
  return withCart(api.removeDiscount());
}

/* ---------------- Cart drawer ---------------- */

let drawer;
let overlay;
let lastFocus;

export function mountCartDrawer() {
  if (drawer) return;
  overlay = el('div', { class: 'drawer__overlay', 'data-cart-overlay': '', on: { click: closeCartDrawer } });
  drawer = el('aside', {
    class: 'drawer',
    id: 'cart-drawer',
    'aria-label': 'Your cart',
    'aria-hidden': 'true',
  });
  document.body.append(overlay, drawer);
  subscribeCart(renderDrawer);
}

export function openCartDrawer() {
  if (!drawer) mountCartDrawer();
  lastFocus = document.activeElement;
  drawer.classList.add('is-open');
  overlay.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  loadCart(true);
  const closeBtn = drawer.querySelector('[data-drawer-close]');
  if (closeBtn) closeBtn.focus();
  document.addEventListener('keydown', onKeydown);
}

export function closeCartDrawer() {
  if (!drawer) return;
  drawer.classList.remove('is-open');
  overlay.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKeydown);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

function onKeydown(e) {
  if (e.key === 'Escape') closeCartDrawer();
}

function renderDrawer(c) {
  if (!drawer) return;
  clear(drawer);
  const count = cartCount(c);

  drawer.append(
    el('div', { class: 'drawer__head' }, [
      el('h2', { text: `Your cart (${count})`, style: 'font-size:var(--step-1)' }),
      el('button', {
        class: 'modal__close',
        'data-drawer-close': '',
        'aria-label': 'Close cart',
        text: '×',
        on: { click: closeCartDrawer },
      }),
    ])
  );

  const itemsWrap = el('div', { class: 'drawer__items' });
  if (!c || !c.items || c.items.length === 0) {
    itemsWrap.append(
      el('div', { class: 'empty-state' }, [
        el('p', { text: 'Your cart is empty for now.' }),
        el('a', { class: 'btn btn--secondary', href: '/new-in.html', text: 'Shop New In' }),
      ])
    );
  } else {
    c.items.forEach((item) => itemsWrap.append(drawerLine(item)));
  }
  drawer.append(itemsWrap);

  const foot = el('div', { class: 'drawer__foot' });
  if (c && c.items && c.items.length) {
    foot.append(
      el('div', { class: 'summary-line' }, [
        el('span', { text: 'Subtotal' }),
        el('strong', { text: formatMoney(c.subtotal) }),
      ]),
      el('p', { class: 'hint', text: 'Delivery calculated at checkout.' }),
      el('a', { class: 'btn btn--block', href: '/checkout.html', text: 'Checkout' }),
      el('a', { class: 'btn btn--secondary btn--block', href: '/cart.html', text: 'View cart' })
    );
  } else {
    foot.append(el('a', { class: 'btn btn--secondary btn--block', href: '/', text: 'Continue shopping' }));
  }
  drawer.append(foot);
}

function drawerLine(item) {
  const opts = Object.entries(item.options || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
  return el('div', { class: 'line-item' }, [
    el('div', { class: 'line-item__media' }, [
      imageEl(item.image, { altFallback: item.name }),
    ]),
    el('div', {}, [
      el('a', {
        href: `/product.html?slug=${encodeURIComponent(item.slug)}`,
        text: item.name,
        style: 'font-weight:600;text-decoration:none',
      }),
      opts ? el('p', { class: 'line-item__opts', text: opts }) : null,
      el('p', { html: `${item.quantity} &times; ${escapeHtml(formatMoney(item.unitPrice))}` }),
      el('div', { style: 'display:flex;gap:.5rem;align-items:center;margin-top:.25rem' }, [
        el('strong', { text: formatMoney(item.lineTotal) }),
        el('button', {
          class: 'btn--ghost',
          style: 'background:none;border:0;cursor:pointer;text-decoration:underline;font-size:var(--step--1)',
          text: 'Remove',
          on: { click: () => removeCartItem(item.id) },
        }),
      ]),
    ]),
  ]);
}
