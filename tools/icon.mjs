// CARLANE app icon + launch splash generator.
//
// Usage:  node tools/icon.mjs                                   (or: npm run icon)
//         PREVIEW_DIR=shots-icon node tools/icon.mjs            → also writes 60/180 px icon previews (home-screen size,
//                                                                 with the iOS corner mask) and a phone-shaped crop of the splash
//
// Renders 8-bit pixel art with an HTML canvas in headless Chromium (playwright): the artwork is drawn on a small
// "game pixel" grid (32×32 for the icon) and scaled up with imageSmoothingEnabled=false, so every pixel stays crisp.
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
  gold: '#ffd040', paper: '#d9d9d2',
};

// ── Artwork ─────────────────────────────────────────────────────────────────
// Side view of a Bayside-blue GT-R R34 style coupe facing right: raked rear glass, roof, 45° windshield, long hood,
// trunk wing, wide sill. 31×9 body; the two 5×5 wheels are stamped at rows 7..11 → 31×12 overall.
// k outline · B body · b sill shade · H roof / side highlight · G glass · w glint · R tail light · L head light
const CAR = [
  '..........kkkkkkkk.............',
  '..kkk...kkHHHHHHHHkk...........',
  '.kHHHk.kkGwGGGkGGGGGkk.........',
  '.kkkkkkGGGGGGGkGGGGGGkk........',
  'kBBBBBBBBBBBBBBBBBBBBBBBBBBBBBk',
  'kRHHHHHHHHHHHHHHHHHHHHHHHHHHHLk',
  'kRBBBBBBBBBBBBBBBBBBBBBBBBBBBLk',
  'kbbbkkkkkbbbbbbbbbbbbbkkkkkbbbk',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
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
const CAR_W = 31;
const CAR_H = 12;
const WHEEL_X = [4, 22]; // wheel left edges inside the car
const WHEEL_Y = 7;

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

// 3×5 caps font (N/M are wider so they keep their diagonals). Enough glyphs for the wordmark and taglines.
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['###', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '.': ['...', '...', '...', '...', '.#.'],
  ' ': ['..', '..', '..', '..', '..'],
};

const ART = { P, CAR, WHEEL, CAR_MAP, CAR_W, CAR_H, WHEEL_X, WHEEL_Y, KANJI, FONT };

// ── Browser-side painter ────────────────────────────────────────────────────
// Runs inside Chromium. Draws `kind` ('icon' | 'splash') into a canvas of `size` px and returns the image
// as a zlib-compressed PNG scanline stream (RGB, filter 0) encoded in base64 — small enough to transfer.
async function paintInBrowser({ art, kind, size, preview }) {
  const { P, CAR, WHEEL, CAR_MAP, CAR_W, WHEEL_X, WHEEL_Y, KANJI, FONT } = art;

  // Low-res grid canvas → scaled up with nearest-neighbour.
  const grid = kind === 'icon' ? 32 : 200;
  const lo = document.createElement('canvas');
  lo.width = grid; lo.height = grid;
  const g = lo.getContext('2d');
  const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const fill = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const stamp = (rows, x, y, map, scale = 1) => {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.' && map[ch]) fill(x + i * scale, y + j * scale, scale, scale, map[ch]); }
    });
  };
  const car = (x, y, scale = 1) => {
    stamp(CAR, x, y, CAR_MAP, scale);
    for (const wx of WHEEL_X) stamp(WHEEL, x + wx * scale, y + WHEEL_Y * scale, CAR_MAP, scale);
  };
  const textW = (s) => { let w = 0; for (const ch of s) w += (FONT[ch] ?? FONT[' '])[0].length + 1; return w - 1; };
  const glyphs = (s, x, y, scale, fn) => {
    let cx = x;
    for (const ch of s) {
      const gl = FONT[ch] ?? FONT[' '];
      gl.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') fn(cx + i * scale, y + j * scale); });
      cx += (gl[0].length + 1) * scale;
    }
  };
  const text = (s, x, y, color, scale = 1, outline = null) => {
    if (outline) glyphs(s, x, y, scale, (gx, gy) => fill(gx - scale, gy - scale, scale * 3, scale * 3, outline));
    glyphs(s, x, y, scale, (gx, gy) => fill(gx, gy, scale, scale, color));
  };
  const textC = (s, cx, y, color, scale = 1, outline = null) => text(s, Math.round(cx - (textW(s) * scale) / 2), y, color, scale, outline);
  // 5-petal sakura: a plus of petals around a bright core (scale 2 on the splash gives a chunkier flower).
  const blossom = (x, y, petal = P.sakura, core = P.white, scale = 1) => {
    fill(x, y - scale, scale, scale, petal); fill(x - scale, y, scale, scale, petal);
    fill(x + scale, y, scale, scale, petal); fill(x, y + scale, scale, scale, petal); fill(x, y, scale, scale, core);
  };
  const kanji = (x, y, color, outline, scale = 1) => {
    const draw = (fn) => KANJI.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') fn(x + i * scale, y + j * scale); });
    if (outline) draw((gx, gy) => fill(gx - scale, gy - scale, scale * 3, scale * 3, outline));
    draw((gx, gy) => fill(gx, gy, scale, scale, color));
  };
  const disc = (cx, cy, r, c) => { for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r) px(x, y, c); } };

  if (kind === 'icon') {
    // Layout (32×32): red sky rows 0..16, dark-blue road rows 17..31. The car body is silhouetted against the red,
    // its wheels stand on the road, the wordmark sits on the asphalt. Rows/cols ≥ 2 px from the edge stay clear of
    // the iOS superellipse mask at the corners.
    const SPLIT = 17;
    fill(0, 0, 32, SPLIT, P.red);
    fill(0, SPLIT, 32, 32 - SPLIT, P.blueDark);
    // Rising sun behind the car (white disc, a soft pink halo ring keeps it from looking pasted on).
    disc(23.5, 6, 6.2, P.sakura);
    disc(23.5, 6, 5.2, P.white);
    // Cherry blossoms drifting in the sky.
    blossom(4, 3); blossom(11, 6, P.pinkLight, P.white); blossom(6, 10); blossom(16, 2, P.sakura, P.white);
    // Hero car: body rows 9..17, wheels 16..20.
    car(0, 9);
    // Dashed lane line under the car, then the wordmark.
    for (let x = 0; x < 32; x++) if (x % 5 < 3) px(x, 22, P.gray1);
    textC('CARLANE', 16, 24, P.white, 1, P.black);
  } else {
    // Splash (200×200 grid): the launch storyboard aspect-fills this square, so on a 19.5:9 phone only the centre
    // ≈46% of the width (x ≈ 54..146) is visible — everything important stays inside x 60..140.
    fill(0, 0, grid, grid, P.black);
    // Big dim sun disc behind the car with a thin red rim — echoes the icon without shouting.
    disc(100, 86, 40, P.redDark);
    disc(100, 86, 38, P.ink);
    // Blossoms around the car.
    blossom(66, 62, P.sakura, P.white, 2); blossom(138, 54, P.pinkLight, P.white, 2);
    blossom(58, 108, P.pinkLight, P.white, 2); blossom(144, 100, P.sakura, P.white, 2); blossom(126, 40, P.sakura, P.white, 1);
    // Kanji 車 badge, red on black, top-right of the car.
    kanji(114, 44, P.red, P.black, 2);
    // Checkered ground strip the tyres stand on.
    for (let x = 0; x < grid; x += 2) fill(x, 108, 2, 2, ((x >> 1) & 1) === 0 ? P.gray3 : P.ink);
    fill(0, 110, grid, 1, P.dark);
    // Car (31×12 at scale 2 → 62×24), centred.
    car(69, 84, 2);
    // Wordmark (scale 2, white, black outline) + red tagline.
    textC('CARLANE', 100, 120, P.white, 2, P.black);
    textC('CARS CHASE DREAMS', 100, 136, P.red, 1);
    // Small "EST. 1990" style stamp below, quiet grey.
    textC('EST. 1990', 100, 150, P.gray2, 1);
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
    const down = (srcCanvas, sx, sy, sw, sh, dw, dh, mask = false) => {
      const c = document.createElement('canvas'); c.width = dw; c.height = dh;
      const cx = c.getContext('2d');
      if (mask) { // iOS home-screen superellipse-ish corner mask (radius ≈ 22.4% of the side)
        const r = dw * 0.224;
        cx.beginPath(); cx.moveTo(r, 0); cx.lineTo(dw - r, 0); cx.quadraticCurveTo(dw, 0, dw, r); cx.lineTo(dw, dh - r);
        cx.quadraticCurveTo(dw, dh, dw - r, dh); cx.lineTo(r, dh); cx.quadraticCurveTo(0, dh, 0, dh - r); cx.lineTo(0, r);
        cx.quadraticCurveTo(0, 0, r, 0); cx.closePath(); cx.clip();
      }
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, dw, dh);
      return c.toDataURL('image/png');
    };
    if (kind === 'icon') {
      previews['icon-60.png'] = down(hi, 0, 0, size, size, 60, 60, true);
      previews['icon-180.png'] = down(hi, 0, 0, size, size, 180, 180, true);
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
