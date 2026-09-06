/**
 * API client — calls the backend exactly as api-contract.md defines it.
 * Conventions honoured here:
 *  - base path /api (CONFIG.apiBase)
 *  - JSON in/out, camelCase (passed straight through)
 *  - session + CSRF via cookies: mutating requests send X-CSRF-Token matching he_csrf
 *  - Idempotency-Key on POST /orders and POST /payments/mpesa/stk-push
 *  - error shape { error: { code, message, details? } } surfaced as ApiError
 */
import { CONFIG } from './config.js';
import { readCookie } from './util.js';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export class ApiError extends Error {
  constructor(status, body) {
    const err = (body && body.error) || {};
    super(err.message || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = err.code || (status === 0 ? 'network_error' : 'unknown');
    this.details = err.details || null;
    this.body = body || null;
  }
}

async function request(method, path, { body, query, headers, idempotencyKey, formData, signal } = {}) {
  const url = new URL(CONFIG.apiBase.replace(/\/$/, '') + path, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v == null || v === '') return;
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, v);
    });
  }

  const opts = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(headers || {}) },
    signal,
  };

  if (MUTATING.has(method)) {
    const csrf = readCookie('he_csrf');
    if (csrf) opts.headers['X-CSRF-Token'] = csrf;
    if (idempotencyKey) opts.headers['Idempotency-Key'] = idempotencyKey;
  }

  if (formData) {
    opts.body = formData; // browser sets multipart boundary
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url.toString(), opts);
  } catch (netErr) {
    if (netErr.name === 'AbortError') throw netErr;
    throw new ApiError(0, { error: { code: 'network_error', message: 'We could not reach the server. Check your connection and try again.' } });
  }

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : contentType.includes('text/csv')
      ? await res.text()
      : null;

  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

const get = (path, query, extra) => request('GET', path, { query, ...extra });
const post = (path, body, extra) => request('POST', path, { body, ...extra });
const patch = (path, body, extra) => request('PATCH', path, { body, ...extra });
const put = (path, body, extra) => request('PUT', path, { body, ...extra });
const del = (path, extra) => request('DELETE', path, { ...extra });

export const api = {
  raw: request,

  /* ---- D1 home ---- */
  getHomeContent: () => get('/content/home'),

  /* ---- D2 catalog ---- */
  getProducts: (query) => get('/products', query),
  getCategories: () => get('/categories'),
  getCollection: (slug) => get(`/collections/${encodeURIComponent(slug)}`),

  /* ---- D3 search ---- */
  getSearchSuggestions: (q, extra) => get('/search/suggestions', { q }, extra),

  /* ---- D4 product ---- */
  getProduct: (slug) => get(`/products/${encodeURIComponent(slug)}`),
  getProductAvailability: (slug) => get(`/products/${encodeURIComponent(slug)}/availability`),

  /* ---- D5 related ---- */
  getRelated: (slug, limit = 4) => get(`/products/${encodeURIComponent(slug)}/related`, { limit }),

  /* ---- D6/D7 reviews ---- */
  getReviews: (productId, query) => get(`/products/${encodeURIComponent(productId)}/reviews`, query),
  submitReview: (productId, body) => post(`/products/${encodeURIComponent(productId)}/reviews`, body),

  /* ---- D8 cart ---- */
  getCart: () => get('/cart'),
  addCartItem: (variantId, quantity = 1) => post('/cart/items', { variantId, quantity }),
  updateCartItem: (itemId, quantity) => patch(`/cart/items/${encodeURIComponent(itemId)}`, { quantity }),
  removeCartItem: (itemId) => del(`/cart/items/${encodeURIComponent(itemId)}`),
  applyDiscount: (code) => post('/cart/discount', { code }),
  removeDiscount: () => del('/cart/discount'),

  /* ---- D10/D11 delivery ---- */
  getDeliveryZones: () => get('/delivery/zones'),
  quote: (county, town) => post('/checkout/quote', { county, town }),

  /* ---- D27 legal ---- */
  getLegal: (docType) => get(`/legal/${encodeURIComponent(docType)}`),
  getLegalVersion: (docType, version) =>
    get(`/legal/${encodeURIComponent(docType)}/versions/${encodeURIComponent(version)}`),

  /* ---- D12 orders ---- */
  createOrder: (body, idempotencyKey) => post('/orders', body, { idempotencyKey }),
  getOrder: (orderNumber, { trackingToken, email } = {}) =>
    get(`/orders/${encodeURIComponent(orderNumber)}`, { trackingToken, email }),
  lookupOrder: (orderNumber, email) =>
    post(`/orders/${encodeURIComponent(orderNumber)}/lookup`, { email }),
  changePaymentMethod: (orderNumber, paymentMethod) =>
    patch(`/orders/${encodeURIComponent(orderNumber)}/payment-method`, { paymentMethod }),

  /* ---- D13/D14 payments ---- */
  stkPush: (paymentId, phone, idempotencyKey) =>
    post('/payments/mpesa/stk-push', phone ? { paymentId, phone } : { paymentId }, { idempotencyKey }),
  getPayment: (paymentId, extra) => get(`/payments/${encodeURIComponent(paymentId)}`, undefined, extra),

  /* ---- D17/D18 auth ---- */
  register: (body) => post('/auth/register', body),
  login: (email, password) => post('/auth/login', { email, password }),
  logout: () => post('/auth/logout'),
  me: (extra) => get('/auth/me', undefined, extra),
  forgotPassword: (email) => post('/auth/password/forgot', { email }),
  resetPassword: (token, password) => post('/auth/password/reset', { token, password }),

  /* ---- D19 account orders ---- */
  getAccountOrders: (query) => get('/account/orders', query),
  getAccountOrder: (orderNumber) => get(`/account/orders/${encodeURIComponent(orderNumber)}`),
  reorder: (orderNumber) => post(`/account/orders/${encodeURIComponent(orderNumber)}/reorder`),

  /* ---- D20 addresses ---- */
  getAddresses: () => get('/account/addresses'),
  createAddress: (body) => post('/account/addresses', body),
  updateAddress: (id, body) => patch(`/account/addresses/${encodeURIComponent(id)}`, body),
  deleteAddress: (id) => del(`/account/addresses/${encodeURIComponent(id)}`),

  /* ---- D21 profile ---- */
  getProfile: () => get('/account/profile'),
  updateProfile: (body) => patch('/account/profile', body),

  /* ---- D22 notification prefs ---- */
  getNotificationPrefs: () => get('/account/notification-preferences'),
  updateNotificationPrefs: (body) => put('/account/notification-preferences', body),

  /* ---- D23 wishlist ---- */
  getWishlist: () => get('/account/wishlist'),
  addWishlist: (productId) => post('/account/wishlist', { productId }),
  removeWishlist: (productId) => del(`/account/wishlist/${encodeURIComponent(productId)}`),

  /* ---- D24/D25 subscriptions ---- */
  subscribe: (body) => post('/subscriptions', body),
  confirmSubscription: (token) => post('/subscriptions/confirm', { token }),
  unsubscribe: (token) => post('/subscriptions/unsubscribe', { token }),

  /* ---- D26 contact ---- */
  contact: (body) => post('/contact', body),

  /* ---- D28 journal ---- */
  getJournal: (query) => get('/journal', query),
  getJournalArticle: (slug) => get(`/journal/${encodeURIComponent(slug)}`),

  /* ================= ADMIN ================= */
  admin: {
    login: (email, password) => post('/admin/auth/login', { email, password }),
    logout: () => post('/admin/auth/logout'),
    me: (extra) => get('/admin/auth/me', undefined, extra),
    dashboard: () => get('/admin/dashboard'),

    getProducts: (query) => get('/admin/products', query),
    getProduct: (id) => get(`/admin/products/${encodeURIComponent(id)}`),
    createProduct: (body) => post('/admin/products', body),
    updateProduct: (id, body) => patch(`/admin/products/${encodeURIComponent(id)}`, body),
    deleteProduct: (id) => del(`/admin/products/${encodeURIComponent(id)}`),

    uploadImage: (file, alt) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('alt', alt || '');
      return request('POST', '/admin/images', { formData: fd });
    },
    deleteImage: (id) => del(`/admin/images/${encodeURIComponent(id)}`),

    updateVariant: (productId, variantId, body) =>
      patch(
        `/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
        body
      ),
    getInventory: (query) => get('/admin/inventory', query),
    createAdjustment: (body) => post('/admin/inventory/adjustments', body),
    getAdjustments: (query) => get('/admin/inventory/adjustments', query),

    getCategories: () => get('/admin/categories'),
    createCategory: (body) => post('/admin/categories', body),
    updateCategory: (slug, body) => patch(`/admin/categories/${encodeURIComponent(slug)}`, body),
    deleteCategory: (slug) => del(`/admin/categories/${encodeURIComponent(slug)}`),

    getCollections: () => get('/admin/collections'),
    createCollection: (body) => post('/admin/collections', body),
    updateCollection: (slug, body) => patch(`/admin/collections/${encodeURIComponent(slug)}`, body),
    deleteCollection: (slug) => del(`/admin/collections/${encodeURIComponent(slug)}`),

    getOrders: (query) => get('/admin/orders', query),
    getOrder: (orderNumber) => get(`/admin/orders/${encodeURIComponent(orderNumber)}`),
    updateOrderStatus: (orderNumber, body, idempotencyKey) =>
      patch(`/admin/orders/${encodeURIComponent(orderNumber)}/status`, body, { idempotencyKey }),
    updateOrderPayment: (orderNumber, body) =>
      patch(`/admin/orders/${encodeURIComponent(orderNumber)}/payment`, body),
    refundOrder: (orderNumber, body, idempotencyKey) =>
      post(`/admin/orders/${encodeURIComponent(orderNumber)}/refund`, body, { idempotencyKey }),
    addOrderNote: (orderNumber, body) =>
      post(`/admin/orders/${encodeURIComponent(orderNumber)}/notes`, { body }),
    resendNotification: (orderNumber, type) =>
      post(`/admin/orders/${encodeURIComponent(orderNumber)}/resend-notification`, { type }),

    getReviews: (query) => get('/admin/reviews', query),
    moderateReview: (id, body) => patch(`/admin/reviews/${encodeURIComponent(id)}`, body),

    getSubscribers: (query) => get('/admin/subscribers', query),
    subscribersExportUrl: (status) =>
      `${CONFIG.apiBase.replace(/\/$/, '')}/admin/subscribers/export${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    createBroadcast: (body) => post('/admin/broadcasts', body),
    getBroadcasts: () => get('/admin/broadcasts'),
    testBroadcast: (id, email) => post(`/admin/broadcasts/${encodeURIComponent(id)}/test`, { email }),

    getHomeContent: () => get('/admin/content/home'),
    updateHomeContent: (body) => put('/admin/content/home', body),

    getLegalList: () => get('/admin/legal'),
    getLegal: (docType) => get(`/admin/legal/${encodeURIComponent(docType)}`),
    publishLegalVersion: (docType, body) =>
      post(`/admin/legal/${encodeURIComponent(docType)}/versions`, body),

    getDiscounts: () => get('/admin/discounts'),
    createDiscount: (body) => post('/admin/discounts', body),
    updateDiscount: (code, body) => patch(`/admin/discounts/${encodeURIComponent(code)}`, body),
    deleteDiscount: (code) => del(`/admin/discounts/${encodeURIComponent(code)}`),
  },
};
