/**
 * Zero-dependency static server for local development and click-testing.
 * The production deploy serves this same directory from the CDN edge
 * (engineering-standards.md: static assets from the CDN, not the app origin).
 *
 * Usage: node tools/serve.js [port]   (default 4321)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Seed photos live in the repo's brand/ dir; the deploy build copies them into dist/seed/.
// Serve them at /seed/ here so `npm run dev` shows real images without a backend.
const SEED = resolve(ROOT, '../../brand/seed-images');
const PORT = Number(process.argv[2]) || 4321;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function tryFile(p) {
  try {
    const s = await stat(p);
    if (s.isFile()) return p;
    if (s.isDirectory()) return tryFile(join(p, 'index.html'));
  } catch {
    /* not found */
  }
  return null;
}

async function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const safe = normalize(clean).replace(/^(\.\.[/\\])+/, '');

  if (safe.startsWith('/seed/') || safe.startsWith('seed/')) {
    const seedFile = join(SEED, safe.replace(/^\/?seed\//, ''));
    return seedFile.startsWith(SEED) ? tryFile(seedFile) : null;
  }

  const abs = join(ROOT, safe);
  if (!abs.startsWith(ROOT)) return null;

  return (
    (await tryFile(abs)) ||
    (extname(abs) ? null : await tryFile(`${abs}.html`)) ||
    null
  );
}

const server = createServer(async (req, res) => {
  const filePath = await resolvePath(req.url || '/');
  const target = filePath || join(ROOT, '404.html');
  try {
    const body = await readFile(target);
    const type = TYPES[extname(target)] || 'application/octet-stream';
    res.writeHead(filePath ? 200 : 404, {
      'Content-Type': type,
      'Cache-Control': extname(target) === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal error');
  }
});

server.listen(PORT, () => {
  console.log(`House of Esther frontend on http://localhost:${PORT}`);
});
