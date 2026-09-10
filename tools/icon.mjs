// CARLANE app icon + launch splash generator.
//
// Usage:  node tools/icon.mjs            (or: npm run icon)
//         PREVIEW_DIR=shots-icon node tools/icon.mjs   → also writes 60/180 px icon previews + a phone crop of the splash
//
// Renders 8-bit pixel art with an HTML canvas in headless Chromium (playwright): the artwork is drawn on a
// 32×32 "game pixel" grid and scaled up with imageSmoothingEnabled=false, so every pixel stays crisp.
// Output PNGs are written as 8-bit RGB WITHOUT an alpha channel (App Store Connect rejects icons that carry one).
//
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   1024×1024  (single-size universal icon)
//   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png     2732×2732  (3x)
//   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png   2732×2732  (2x)
//   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png   2732×2732  (1x)
//
// Nothing here depends on the game engine — the palette values are copied from src/core/Palette.ts.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const SPLASH_DIR = path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');
const PREVIEW_DIR = process.env.PREVIEW_DIR ? path.resolve(process.env.PREVIEW_DIR) : null;

// ── Palette (src/core/Palette.ts) ───────────────────────────────────────────
const P = {
  black: '#0b0b12', ink: '#16161f', dark: '#23232f', gray3: '#3a3a48', gray2: '#6a6a78', gray1: '#a8a8b4',
  white: '#f4f4f0', red: '#e0202a', redDark: '#8a1018', yellow: '#f0c020', yellowLight: '#ffe870',
  blue: '#2040e0', blueDark: '#101c80', blueLight: '#60a0ff', cyan: '#40e0f0', sakura: '#ffb7d0', pinkLight: '#ff90c0',
  gold: '#ffd040',
};

// ── Artwork (32-px grid) ────────────────────────────────────────────────────
// Side view of a Bayside-blue GT-R style coupe, facing right. 26×12 incl. wheels.
// k outline · B body · b shade · H highlight · G glass · w glint · R tail light · L head light
const CAR = [
  '.........kkkkkkkkk........',
  '.kkkkk..kGGGGkGGGGGk......',
  'kHHHHHkkGwGGGkGGGGGGk.....',
  'kkkbbkkGGGGGGkGGGGGGGkkkk.',
  'kBBBBBBBBBBBBBBBBBBBBBBBBk',
  'kRHHHHHHHHHHHHHHHHHHHHHHLk',
  'kRBBBBBBBBBBBBBBBBBBBBBBLk',
  'kbbbbbbbbbbbbbbbbbbbbbbbbk',
  '.kkkkkkkkkkkkkkkkkkkkkkkk.',
];
const WHEEL = [
  '.kkk.',
  'kTTTk',
  'kTCTk',
  'kTTTk',
  '.kkk.',
];
const CAR_MAP = {
  k: P.black, B: P.blue, b: P.blueDark, H: P.blueLight, G: P.cyan, w: P.white,
  R: P.red, L: P.yellowLight, T: P.dark, C: P.gray1,
};
const CAR_W = 26;
const CAR_H = 12; // body rows 0..8 + wheels reaching row 11

// 車 ("car") — 7×10
const KANJI = [
  '...#...',
  '#######',
  '...#...',
  '.#####.',
  '.#.#.#.',
  '.#####.',
  '.#.#.#.',
  '.#####.',
  '#######',
  '...#...',
];

// 3×5 caps font, N is 4 wide so it keeps its diagonal.
const FONT = {
  C: ['###', '#..', '#..', '#..', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  E: ['###', '#..', '##.', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  ' ': ['..', '..', '..', '..', '..'],
};

const ART = { P, CAR, WHEEL, CAR_MAP, CAR_W, CAR_H, KANJI, FONT };

// ── Browser-side painter ────────────────────────────────────────────────────
// Runs inside Chromium. Draws `kind` ('icon' | 'splash') into a canvas of `size` px and returns the image
// as a zlib-compressed PNG scanline stream (RGB, filter 0) encoded in base64 — small enough to transfer.
async function paintInBrowser({ art, kind, size, preview }) {
  const { P, CAR, WHEEL, CAR_MAP, CAR_W, CAR_H, KANJI, FONT } = art;

  // Low-res grid canvas → scaled up with nearest-neighbour.
  const grid = kind === 'icon' ? 32 : 128;
  const lo = document.createElement('canvas');
  lo.width = grid; lo.height = grid;
  const g = lo.getContext('2d');
  const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const fill = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const stamp = (rows, x, y, map) => {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.' && map[ch]) px(x + i, y + j, map[ch]); } });
  };
  const car = (x, y, scale = 1) => {
    if (scale === 1) {
      stamp(CAR, x, y, CAR_MAP);
      stamp(WHEEL, x + 3, y + 7, CAR_MAP);
      stamp(WHEEL, x + 18, y + 7, CAR_MAP);
      return;
    }
    const big = (rows, ox, oy) => rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.' && CAR_MAP[ch]) fill(ox + i * scale, oy + j * scale, scale, scale, CAR_MAP[ch]); } });
    big(CAR, x, y);
    big(WHEEL, x + 3 * scale, y + 7 * scale);
    big(WHEEL, x + 18 * scale, y + 7 * scale);
  };
  const textW = (s) => { let w = 0; for (const ch of s) w += (FONT[ch] ?? FONT[' '])[0].length + 1; return w - 1; };
  const text = (s, x, y, color, scale = 1, outline = null) => {
    let cx = x;
    for (const ch of s) {
      const gl = FONT[ch] ?? FONT[' '];
      if (outline) gl.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) fill(cx + (i + dx) * scale, y + (j + dy) * scale, scale, scale, outline); });
      cx += (gl[0].length + 1) * scale;
    }
    cx = x;
    for (const ch of s) {
      const gl = FONT[ch] ?? FONT[' '];
      gl.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') fill(cx + i * scale, y + j * scale, scale, scale, color); });
      cx += (gl[0].length + 1) * scale;
    }
  };
  const blossom = (x, y, petal = P.sakura, core = P.white) => {
    px(x, y - 1, petal); px(x - 1, y, petal); px(x + 1, y, petal); px(x, y + 1, petal); px(x, y, core);
  };
  const kanji = (x, y, color, outline) => {
    if (outline) KANJI.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) px(x + i + dx, y + j + dy, outline); });
    KANJI.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') px(x + i, y + j, color); });
  };

  if (kind === 'icon') {
    // Background: red sky above a diagonal horizon, dark-blue road below.
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) px(x, y, y < 17 - Math.floor((x * 5) / 32) ? P.red : P.blueDark);
    // Sun disc behind the car (rising sun), dark-red rays band.
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x - 23.5, dy = y - 8.5;
      if (dx * dx + dy * dy < 4.2 * 4.2 && y < 17 - Math.floor((x * 5) / 32)) px(x, y, P.white);
    }
    // Cherry blossoms drifting in the sky.
    blossom(4, 3); blossom(10, 7); blossom(15, 2); blossom(2, 11); blossom(29, 3, P.pinkLight, P.white);
    // Kanji 車 top-left, white with black outline.
    kanji(4, 1, P.white, P.black);
    // Road shade: a lighter band just under the horizon reads as asphalt depth.
    for (let x = 0; x < 32; x++) { const hy = 17 - Math.floor((x * 5) / 32); px(x, hy, P.blue); }
    // The hero car.
    car(3, 11);
    // Checker finish line.
    for (let x = 0; x < 32; x++) px(x, 23, (Math.floor(x / 2) & 1) === 0 ? P.white : P.black);
    // Black label band with CARLANE.
    fill(0, 24, 32, 8, P.black);
    text('CARLANE', 2, 25, P.white);
  } else {
    // Splash: dark ground, car + wordmark centred (the launch storyboard aspect-fills this square image,
    // so on a 19.5:9 phone only the central ≈46% of the width is visible → keep everything inside x 40..88).
    fill(0, 0, grid, grid, P.black);
    // faint checker floor line + horizon glow
    for (let x = 0; x < grid; x++) px(x, 72, (Math.floor(x / 2) & 1) === 0 ? P.gray3 : P.ink);
    fill(0, 73, grid, 1, P.dark);
    // blossoms
    blossom(48, 40, P.sakura, P.white); blossom(84, 36, P.pinkLight, P.white); blossom(56, 30, P.sakura, P.white); blossom(78, 48, P.sakura, P.white);
    // kanji badge
    kanji(88, 30, P.red, P.black);
    // car (26 wide × 12) at scale 2 → 52×24, centred at x=64
    car(38, 48, 2);
    // wordmark, scale 2 → 56 px wide
    const w = textW('CARLANE') * 2;
    text('CARLANE', Math.round((grid - w) / 2), 79, P.white, 2, P.black);
    // red tagline line + tiny subtitle
    const w2 = textW('LANE DODGE ARCADE');
    text('LANE DODGE ARCADE', Math.round((grid - w2) / 2), 93, P.red, 1);
  }

  // Scale up (nearest neighbour).
  const hi = document.createElement('canvas');
  hi.width = size; hi.height = size;
  const h = hi.getContext('2d');
  h.imageSmoothingEnabled = false;
  h.drawImage(lo, 0, 0, size, size);

  // Encode RGB scanlines (filter type 0) and deflate them in the browser so the transfer stays small.
  const img = h.getImageData(0, 0, size, size).data;
  const raw = new Uint8Array((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    let i = y * size * 4;
    for (let x = 0; x < size; x++, i += 4) { raw[o++] = img[i]; raw[o++] = img[i + 1]; raw[o++] = img[i + 2]; }
  }
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(raw); writer.close();
  const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  let b64 = '';
  for (let i = 0; i < buf.length; i += 0x8000) b64 += btoa(String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)));

  // Optional previews (smoothed down-scale, like the home screen does) as ordinary data-URL PNGs.
  const previews = {};
  if (preview) {
    const down = (srcCanvas, sx, sy, sw, sh, dw, dh) => {
      const c = document.createElement('canvas'); c.width = dw; c.height = dh;
      const cx = c.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, dw, dh);
      return c.toDataURL('image/png');
    };
    if (kind === 'icon') {
      previews['icon-60.png'] = down(hi, 0, 0, size, size, 60, 60);
      previews['icon-180.png'] = down(hi, 0, 0, size, size, 180, 180);
    } else {
      const vis = Math.round(size * (9 / 19.5));
      previews['splash-phone.png'] = down(hi, Math.round((size - vis) / 2), 0, vis, size, 393, 852);
    }
  }
  return { b64, previews };
}

// ── PNG writer (Node) ───────────────────────────────────────────────────────
const crc32 = zlib.crc32 ? (b) => zlib.crc32(b) >>> 0 : (() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  return (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function pngRGB(width, height, zlibData) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit, truecolor RGB, no alpha
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibData), chunk('IEND', Buffer.alloc(0))]);
}
function pngSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}

// ── Main ────────────────────────────────────────────────────────────────────
const browser = await pw.chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.setContent('<!doctype html><html><body></body></html>');

  const jobs = [
    { kind: 'icon', size: 1024, files: [path.join(ICON_DIR, 'AppIcon-512@2x.png')] },
    { kind: 'splash', size: 2732, files: ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((f) => path.join(SPLASH_DIR, f)) },
  ];
  if (PREVIEW_DIR && !existsSync(PREVIEW_DIR)) mkdirSync(PREVIEW_DIR, { recursive: true });
  let failed = false;
  for (const job of jobs) {
    const { b64, previews } = await page.evaluate(paintInBrowser, { art: ART, kind: job.kind, size: job.size, preview: !!PREVIEW_DIR });
    const png = pngRGB(job.size, job.size, Buffer.from(b64, 'base64'));
    for (const file of job.files) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, png);
      const s = pngSize(file);
      const ok = s.w === job.size && s.h === job.size && s.colorType === 2;
      if (!ok) failed = true;
      console.log(`${ok ? 'ok ' : 'BAD'} ${path.relative(ROOT, file)}  ${s.w}×${s.h}  rgb${s.colorType === 2 ? '' : '(colorType ' + s.colorType + ')'}  ${(png.length / 1024).toFixed(0)} kB`);
    }
    for (const [name, dataUrl] of Object.entries(previews)) {
      const file = path.join(PREVIEW_DIR, name);
      writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
      console.log(`preview ${path.relative(ROOT, file)}`);
    }
  }
  if (failed) { console.error('icon.mjs: at least one PNG has the wrong size'); process.exitCode = 1; }
} finally {
  await browser.close();
}
