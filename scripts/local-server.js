// Run the whole app locally with an in-memory Postgres (no accounts needed):
//   npm run local   →  http://localhost:8787   (admin password: "local-admin" unless ADMIN_PASSWORD is set)
// Data is lost when you stop it. Production uses Vercel + Neon.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { useQuery } from '../lib/db.js';
import { handle } from '../lib/router.js';

const PORT = Number(process.env.PORT) || 8787;
const DIST = join(import.meta.dirname, '..', 'dist');
process.env.ADMIN_PASSWORD ||= 'local-admin';
process.env.NODE_ENV = 'development';

const pg = new PGlite();
useQuery(async (text, params = []) => (await pg.query(text, params)).rows);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function rewrite(path) {
  if (/^\/w\/[a-z0-9-]+\/?$/.test(path)) return '/wish.html';
  if (/^\/(vizag|vijayawada)\/?$/.test(path)) return '/clock.html';
  if (path === '/') return '/index.html';
  if (!extname(path)) return path.replace(/\/$/, '') + '.html';
  return path;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname.startsWith('/api/')) {
    req.body = undefined;
    return handle(req, res);
  }
  const file = normalize(join(DIST, rewrite(url.pathname)));
  if (!file.startsWith(DIST)) { res.statusCode = 403; return res.end(); }
  try {
    await stat(file);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`Karshan running at http://localhost:${PORT}  (admin password: ${process.env.ADMIN_PASSWORD === 'local-admin' ? 'local-admin' : 'from ADMIN_PASSWORD'})`));
