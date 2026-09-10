// Usage: [DIST=dist-x] [SHOTS=shots-x] node tools/screenshots.mjs [route ...]   (routes are hash strings like "screen=garage" or "level=5&t=6")
// Builds nothing — run `npm run build` first. Serves dist/ and screenshots at iPhone 14 Pro size.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const root = path.resolve(process.env.DIST ?? 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  try {
    const data = await readFile(path.join(root, p));
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const routes = process.argv.slice(2);
if (!routes.length) routes.push('');
const outDir = path.resolve(process.env.SHOTS ?? 'shots');
if (!existsSync(outDir)) mkdirSync(outDir);

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text()); });
let n = 0;
for (const route of routes) {
  const url = `http://localhost:${port}/?r=${n++}#${route}`;
  await page.goto(url);
  const m = /(?:^|&)t=([\d.]+)/.exec(route);
  const wait = m ? parseFloat(m[1]) * 1000 : 1200;
  await page.waitForTimeout(wait);
  const name = (route || 'title').replace(/[^a-z0-9_=-]+/gi, '_').slice(0, 60);
  const file = path.join(outDir, name + '.png');
  await page.screenshot({ path: file });
  console.log('shot', file);
}
await browser.close();
server.close();
