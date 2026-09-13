/** Small shared helpers. No DOM here — see dom.js. */

export function readCookie(name) {
  const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return match ? decodeURIComponent(match.pop()) : null;
}

export function uuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getParam(name, url) {
  const params = new URLSearchParams(url ? url.split('?')[1] || '' : window.location.search);
  return params.get(name);
}

export function getAllParams(name) {
  const params = new URLSearchParams(window.location.search);
  return params.getAll(name);
}

export function formatDate(iso, opts) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-KE', opts || { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function titleCase(str) {
  return String(str || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function debounce(fn, wait) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function pluralize(n, singular, plural) {
  return n === 1 ? singular : plural || singular + 's';
}

/**
 * Run `fn` over `items` with at most `limit` in flight at once. Used by the bulk-import
 * photo phase (productImport.js) to upload a few images at a time instead of firing every
 * request for a row simultaneously. Order of `results` matches `items`; order of
 * *completion* is not guaranteed — callers that need CSV order (e.g. which uploaded id is
 * primary) should read it back off the per-item state they passed in, not off `results`.
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}

export function setPageMeta({ title, description, canonicalPath, noindex }) {
  if (title) document.title = title;
  if (description) {
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', description);
  }
  if (canonicalPath) {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.setAttribute('href', new URL(canonicalPath, window.location.origin).href);
  }
  if (noindex) {
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', 'noindex, nofollow');
  }
}

/**
 * Upgrade a baked relative <link rel="canonical"> to an absolute URL against the current
 * site origin — the same base setPageMeta() uses for JS-rendered pages, so canonicals are
 * absolute and consistent across every page and page state.
 */
export function ensureAbsoluteCanonical() {
  const link = document.querySelector('link[rel="canonical"]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href && !/^https?:\/\//i.test(href)) {
    link.setAttribute('href', new URL(href, window.location.origin).href);
  }
}

export function injectJsonLd(obj) {
  const existing = document.getElementById('page-jsonld');
  if (existing) existing.remove();
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'page-jsonld';
  script.textContent = JSON.stringify(obj);
  document.head.appendChild(script);
}
