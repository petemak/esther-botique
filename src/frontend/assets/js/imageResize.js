/**
 * Client-side downsizing for admin bulk-photo uploads (A17 import photo phase).
 *
 * Why: each matched photo is now uploaded individually to `POST /api/admin/images`
 * instead of riding along in the big commit request (see api.js `commitImport` /
 * pages/admin/productImport.js `runPhotoPhase`). Shrinking a phone photo client-side
 * before it leaves the browser keeps each upload small and fast, and adds safety
 * margin under Netlify's rewrite-proxy body-size ceiling even for an unusually large
 * single source file. The server re-encodes to its own budget regardless
 * (`encode-within-budget`, api-contract.md A4) — this is a courtesy pre-shrink, not a
 * replacement for that.
 *
 * Never hard-fails a row over a resize hiccup: any decode/encode problem here just
 * falls back to returning the original File untouched.
 */

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;
const SKIP_RESIZE_BELOW_BYTES = 500 * 1024; // already small — not worth the round-trip

export async function resizeImageForUpload(file, opts = {}) {
  const maxDim = opts.maxDim || MAX_DIMENSION;
  const quality = opts.quality || JPEG_QUALITY;
  const skipBelowBytes = opts.skipBelowBytes != null ? opts.skipBelowBytes : SKIP_RESIZE_BELOW_BYTES;

  if (!file || !file.size || file.size < skipBelowBytes) return file;
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return file;

  let decoded = null;
  try {
    decoded = await loadDecodable(file);
    const { source } = decoded;
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!width || !height) return file;

    const scale = Math.min(1, maxDim / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;

    const baseName = (file.name || 'photo').replace(/\.\w+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    if (decoded) decoded.cleanup();
  }
}

/** Decode `file` into something `CanvasRenderingContext2D.drawImage` accepts, plus a cleanup fn. */
async function loadDecodable(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, cleanup: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode image'));
    image.src = url;
  });
  return { source: img, cleanup: () => URL.revokeObjectURL(url) };
}
