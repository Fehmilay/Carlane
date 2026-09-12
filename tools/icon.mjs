// Renders the iOS app icon (1024×1024) and splash (2732×2732) as crisp pixel art.
// Usage: node tools/icon.mjs
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<canvas id="c"></canvas>
<script>
const P = { black:'#0b0b12', ink:'#16161f', dark:'#23232f', gray3:'#3a3a48', gray2:'#6a6a78', gray1:'#a8a8b4', white:'#f4f4f0',
  red:'#e0202a', redDark:'#8a1018', orange:'#f07020', yellow:'#f0c020', yellowLight:'#ffe870', blue:'#2040e0', blueDark:'#101c80',
  blueLight:'#60a0ff', cyan:'#40e0f0', purple:'#8030c0', pink:'#e04080', sakura:'#ffb7d0', green:'#20b040' };

/** Tiny pixel grid painter. */
class G {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); }
  px(x, y, col) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y * this.w + x] = col; }
  rect(x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, col); }
  hline(x0, x1, y, col) { for (let x = x0; x <= x1; x++) this.px(x, y, col); }
  disc(cx, cy, r, col) { for (let y = -r; y <= r; y++) { const hw = Math.floor(Math.sqrt(r * r - y * y)); this.hline(cx - hw, cx + hw, cy + y, col); } }
  ring(cx, cy, r, col) { const n = Math.max(16, r * 8); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, col); } }
  /** black outline around solid pixels */
  outline(col) {
    const src = this.c.slice();
    const solid = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[y * this.w + x] !== null;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x] !== null) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) this.px(x, y, col);
    }
  }
  stamp(rows, x, y, map) { rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.' && map[ch]) this.px(x + i, y + j, map[ch]); } }); }
  blit(ctx, scale) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const col = this.c[y * this.w + x];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

// 5×7 letters for CARLANE
const FONT = {
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
};
function text(g, str, x, y, col) {
  let cx = x;
  for (const ch of str) { const rows = FONT[ch]; if (rows) { g.stamp(rows, cx, y, { '#': col }); cx += 6; } else cx += 4; }
  return cx - x - 1;
}

/** Side-view GT-R-ish car, 34×13, anchored top-left. */
function car(g, x, y) {
  const B = P.blue, b = P.blueDark, H = P.blueLight, GL = P.cyan, W = '#101018';
  // body
  g.rect(x + 2, y + 5, 30, 5, B);
  g.hline(x + 3, x + 30, y + 4, B);
  // cabin
  for (let i = 0; i < 4; i++) g.hline(x + 9 + i, x + 24 - i, y + i, B);
  g.rect(x + 10, y + 1, 12, 3, GL);
  g.rect(x + 11, y + 1, 5, 2, '#8ef0ff');
  // shoulder highlight + lower shade
  g.hline(x + 3, x + 31, y + 5, H);
  g.hline(x + 2, x + 31, y + 9, b);
  // wing
  g.rect(x + 1, y + 2, 7, 1, b); g.rect(x + 2, y + 3, 1, 2, b); g.rect(x + 6, y + 3, 1, 2, b);
  // lights
  g.rect(x + 1, y + 6, 2, 2, P.red);
  g.rect(x + 31, y + 6, 2, 2, P.yellowLight);
  // wheels
  g.disc(x + 8, y + 10, 3, W); g.disc(x + 26, y + 10, 3, W);
  g.disc(x + 8, y + 10, 1, P.gray1); g.disc(x + 26, y + 10, 1, P.gray1);
}

function drawIcon(size) {
  const N = 64, scale = size / N;
  const g = new G(N, N);
  // sky: red top half → deep blue bottom
  for (let y = 0; y < 30; y++) g.hline(0, N - 1, y, y < 10 ? '#c01824' : y < 20 ? P.red : '#e0303a');
  // sun
  g.disc(46, 14, 11, P.white);
  g.ring(46, 14, 12, P.sakura);
  // sakura petals
  for (const [px, py] of [[10, 6], [18, 14], [7, 20], [28, 5], [34, 18], [56, 30]]) { g.rect(px, py, 2, 2, P.sakura); g.px(px, py, P.pink); }
  // road
  for (let y = 34; y < N; y++) g.hline(0, N - 1, y, y < 38 ? P.gray3 : y < 50 ? P.blueDark : '#0c1050');
  for (let x = 2; x < N; x += 8) g.rect(x, 42, 4, 2, P.gray1);
  // car standing on the road edge
  car(g, 15, 21);
  g.outline(P.black);
  // title bar
  g.rect(3, 50, N - 6, 12, P.black);
  const w = text(g, 'CARLANE', 0, 0, null) || 0;
  void w;
  const tw = 7 * 6 - 1;
  text(g, 'CARLANE', Math.round((N - tw) / 2), 52, P.white);
  const cv = document.getElementById('c');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = P.blueDark; ctx.fillRect(0, 0, size, size);
  g.blit(ctx, scale);
  return cv.toDataURL('image/png');
}

function drawSplash(size) {
  const N = 64, scale = size / N;
  const g = new G(N, N);
  for (let y = 0; y < N; y++) g.hline(0, N - 1, y, P.black);
  g.disc(32, 22, 10, '#1a1a3a');
  car(g, 15, 22);
  g.outline(P.black);
  const tw = 7 * 6 - 1;
  text(g, 'CARLANE', Math.round((N - tw) / 2), 42, P.white);
  g.rect(Math.round((N - tw) / 2), 51, tw, 1, P.red);
  g.rect(Math.round((N - tw) / 2), 52, tw, 1, P.white);
  g.rect(Math.round((N - tw) / 2), 53, tw, 1, P.blue);
  const cv = document.getElementById('c');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = P.black; ctx.fillRect(0, 0, size, size);
  g.blit(ctx, scale);
  return cv.toDataURL('image/png');
}
window.drawIcon = drawIcon;
window.drawSplash = drawSplash;
</script></body>`;

const browser = await pw.chromium.launch();
const page = await browser.newPage();
await page.setContent(PAGE);
const iconUrl = await page.evaluate(() => window.drawIcon(1024));
const splashUrl = await page.evaluate(() => window.drawSplash(2732));
await browser.close();

const save = async (file, dataUrl) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', file);
};
await save('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', iconUrl);
for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await save(path.join('ios/App/App/Assets.xcassets/Splash.imageset', n), splashUrl);
}
