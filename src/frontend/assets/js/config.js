/**
 * Runtime configuration.
 * API base defaults to a same-origin "/api" (engineering-standards.md: the frontend
 * talks only to our backend, never a third party). Deploy can override by setting
 * window.__HOE_CONFIG__ before this module loads.
 */
const overrides = (typeof window !== 'undefined' && window.__HOE_CONFIG__) || {};

export const CONFIG = {
  apiBase: overrides.apiBase || '/api',
  brand: 'House of Esther',
  whatsappNumber: overrides.whatsappNumber || '+254700000000',
  supportEmail: overrides.supportEmail || 'hello@houseofesther.co.ke',
  paymentPollIntervalMs: 3000,
  paymentPollTimeoutMs: 90000,
};

export const CATEGORIES = [
  { slug: 'women', label: 'Women' },
  { slug: 'men', label: 'Men' },
  { slug: 'accessories', label: 'Accessories' },
  { slug: 'watches', label: 'Watches' },
  { slug: 'fragrance', label: 'Fragrance' },
  { slug: 'sneakers', label: 'Sneakers' },
  { slug: 'wigs', label: 'Wigs' },
];
