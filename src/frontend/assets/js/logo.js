/**
 * Brand mark — inlined so CSS `color` recolours it (design-spec §0):
 * default Aubergine, `color:#F7F1F7` for the reversed mark on an Aubergine field
 * (e.g. the footer and the transparent homepage header over the hero photo).
 * Source: brand/logo-draft.svg (lockup), brand/logo-monogram-bold.svg (header +
 * favicon + app icon), brand/logo-monogram.svg (thin outline, stand-alone >=48px only).
 * All copied to assets/img/ for the deploy bundle; the favicon PNGs are regenerated
 * from the bold monogram by tools/gen-icons.sh.
 */
import { el } from './dom.js';

const ARCH = 'M10 150 V70 A60 60 0 0 1 130 70 V150 Z';
const E = 'M38 42 H96 V55 H60 V73 H84 V85 H60 V105 H98 V118 H38 V108 Q38 100 46 100 V60 Q38 60 38 52 Z M94 39 H99 V58 H94 Z M82 70 H87 V88 H82 Z M96 102 H101 V121 H96 Z';

// Thin outline monogram — stand-alone use at >=48px only (brand brief). viewBox 0 0 140 160.
const MONO_PATHS = `
  <path d="${ARCH}" fill="none" stroke="currentColor" stroke-width="14" stroke-linejoin="round"/>
  <path fill="currentColor" d="${E}"/>
`;

// Bold monogram (brand/logo-monogram-bold.svg) — solid arch silhouette, E knocked out.
// Header + favicon + app icon. Survives 16px. viewBox 0 0 120 132.
const MONO_BOLD_VIEWBOX = '0 0 120 132';
const MONO_PATHS_BOLD = `
  <path fill="currentColor" fill-rule="evenodd" d="M12 124 V56 A48 48 0 0 1 108 56 V124 Z M30 34 H86 V48 H44 V61 H74 V75 H44 V88 H88 V102 H30 Z"/>
`;

/** Thin outline arch + E. For the footer lockup and stand-alone use at >=48px. */
export function logoMonogram(className) {
  const svg = svgEl('0 0 140 160', className);
  svg.insertAdjacentHTML('beforeend', MONO_PATHS);
  return svg;
}

/** Bold monogram for the storefront header (and the favicon / app-icon pipeline). */
export function logoHeaderMark(className) {
  const svg = svgEl(MONO_BOLD_VIEWBOX, className);
  svg.insertAdjacentHTML('beforeend', MONO_PATHS_BOLD);
  return svg;
}

/** Full stacked lockup: monogram + "HOUSE OF / ESTHER". For the footer. */
export function logoLockup(className) {
  const svg = svgEl('0 0 320 264', className);
  svg.insertAdjacentHTML(
    'beforeend',
    `
    <g transform="translate(97 8) scale(0.9)">${MONO_PATHS}</g>
    <text x="160" y="205" text-anchor="middle" fill="currentColor" font-family="Fraunces, Georgia, 'Times New Roman', serif" font-size="16" font-weight="500" letter-spacing="7.5">HOUSE OF</text>
    <text x="160" y="250" text-anchor="middle" fill="currentColor" font-family="Fraunces, Georgia, 'Times New Roman', serif" font-size="44" font-weight="600" letter-spacing="3">ESTHER</text>
  `
  );
  return svg;
}

function svgEl(viewBox, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'House of Esther');
  if (className) svg.setAttribute('class', className);
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = 'House of Esther';
  svg.appendChild(title);
  return svg;
}

/** Header brand link: bold monogram + a compact wordmark that collapses on very narrow screens. */
export function brandLink(href = '/') {
  return el('a', { class: 'brand', href, 'aria-label': 'House of Esther — home' }, [
    logoHeaderMark('brand__mark'),
    el('span', { class: 'brand__word', text: 'House of Esther', 'aria-hidden': 'true' }),
  ]);
}
