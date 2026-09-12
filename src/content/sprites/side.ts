import type { CharMap, VehicleDef, VehicleDetails } from '../../core/types';
import { Grid, buildSprite, type PixelSprite } from '../../core/Sprite';
import { mix } from '../../core/Palette';

// ─────────────────────────────────────────────────────────────────────────────
// Side-view garage sprites ("夢のガレージ" card style): chunky 1-px black outline, two-tone body with a
// highlight line along the shoulder and every top edge, dark glass with a light reflection streak,
// black tyres with chrome hubs, headlights at the FRONT (left) and red taillights at the BACK (right).
// The car faces LEFT like the cards on the reference sheet. Bottom-center anchor, 1-2 px ground
// clearance under the sill (the tyres touch the last row). Everything is deterministic.
//
// Recolor slots: B body · b shade · H highlight · A accent · G glass · L lamp · W rim · C chrome.
// Extra per-vehicle colours (computed from the palette): z = glass reflection, Z = glass tint.
// Flip FACE_LEFT if the garage ever wants the cars driving to the right.
// ─────────────────────────────────────────────────────────────────────────────

const FACE_LEFT = true;

type Pt = [number, number];
type WheelStyle = 'std' | 'wire' | 'mud' | 'steel' | 'road';

interface Spec {
  w: number; h: number;
  /** body x extent (inclusive) */
  x0: number; x1: number;
  /** top silhouette, monotonic in x (front → rear) */
  top: Pt[];
  /** body bottom: a row or a polyline (jacked stance) */
  sill: number | Pt[];
  /** row of the black line under the windows; the shoulder highlight sits at belt+1 */
  belt: number;
  r: number; wheels: number[]; cy?: number;
  /** glasshouse x range */
  glass?: [number, number];
  /** black pillar segments drawn inside the glass */
  pillars?: [Pt, Pt][];
  /** body rows between the top line and the glass border (default 2) */
  roofT?: number;
  wheelStyle?: WheelStyle;
  /** don't cut wheel arches (skirted / tracked vehicles) */
  noArch?: boolean;
  /** draw the reflection streak (default true) */
  streak?: boolean;
  /** headlight / taillight rows relative to belt (default +1) */
  lampDy?: number;
}

// ── tiny 3×5 font for decals ─────────────────────────────────────────────────
const FONT: Record<string, string> = {
  '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '### ..# ### #.. ###', '3': '### ..# ### ..# ###',
  '4': '#.# #.# ### ..# ..#', '5': '### #.. ### ..# ###', '6': '### #.. ### #.# ###', '7': '### ..# ..# ..# ..#',
  '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ###',
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '### #.. #.. #.. ###', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '### #.. #.# #.# ###', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# ###', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '### #.# #.# #.# ###', P: '### #.# ### #.. #..',
  Q: '### #.# #.# ### ..#', R: '##. #.# ##. #.# #.#', S: '### #.. ### ..# ###', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###', '-': '... ... ### ... ...', '.': '... ... ... ... .#.',
};
/** Stamp a tiny 3×5 text (4 px advance) in colour `c`. Returns the width used. */
function text(g: Grid, s: string, x: number, y: number, c: string): number {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const gl = FONT[ch];
    if (gl) {
      const rows = gl.split(' ');
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (rows[j][i] === '#') g.px(cx + i, y + j, c);
    }
    cx += 4;
  }
  return cx - x - 1;
}

// ── geometry helpers ─────────────────────────────────────────────────────────
function profileY(pts: Pt[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}
const topAt = (s: Spec, x: number) => Math.round(profileY(s.top, x));
const sillAt = (s: Spec, x: number) => (typeof s.sill === 'number' ? s.sill : Math.round(profileY(s.sill, x)));
const wheelY = (s: Spec) => s.cy ?? s.h - 2 - s.r;

/** Paint `c` only over existing body pixels of the given colours. */
function over(g: Grid, x: number, y: number, c: string, on = 'Bb'): void {
  if (on.includes(g.get(x, y))) g.px(x, y, c);
}
function hlineOver(g: Grid, x0: number, x1: number, y: number, c: string, on = 'Bb'): void {
  for (let x = x0; x <= x1; x++) over(g, x, y, c, on);
}
function rectOver(g: Grid, x: number, y: number, w: number, h: number, c: string, on = 'Bb'): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) over(g, x + i, y + j, c, on);
}

/** Wheel: black tyre, rim in the W slot, chrome spokes/hub. */
function wheel(g: Grid, cx: number, cy: number, r: number, style: WheelStyle = 'std'): void {
  g.circle(cx, cy, r, 'K');
  if (style === 'mud') {
    for (let a = 0; a < 20; a++) {
      const t = (a / 20) * Math.PI * 2;
      g.px(cx + Math.round(Math.cos(t) * (r - 0.6)), cy + Math.round(Math.sin(t) * (r - 0.6)), a % 2 ? 'd' : 'K');
    }
  }
  const rr = Math.max(1, r - 2);
  if (style === 'wire') {
    g.circle(cx, cy, rr + 1, 'w'); // whitewall
    g.circle(cx, cy, rr, 'C');
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      g.line(cx, cy, cx + Math.round(Math.cos(t) * (rr - 1)), cy + Math.round(Math.sin(t) * (rr - 1)), 'W');
    }
    g.px(cx, cy, 'C');
    return;
  }
  if (style === 'road') { g.circle(cx, cy, rr, 'd'); g.circle(cx, cy, Math.max(0, rr - 2), 'e'); g.px(cx, cy, 'C'); return; }
  if (style === 'steel') {
    g.circle(cx, cy, rr, 'd');
    for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2; g.px(cx + Math.round(Math.cos(t) * (rr - 1)), cy + Math.round(Math.sin(t) * (rr - 1)), 'e'); }
    g.circle(cx, cy, 1, 'C'); g.px(cx, cy, 'e');
    return;
  }
  // rim: dark dish (W) with a chrome ring and hub → reads as a multi-spoke wheel
  g.circle(cx, cy, rr, 'W');
  if (rr >= 2) {
    const ring = rr - 1;
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.round(Math.sqrt(dx * dx + dy * dy)) === ring) g.px(cx + dx, cy + dy, 'C');
    }
    if (rr >= 4) { g.hline(cx - 1, cx + 1, cy, 'C'); g.vline(cx, cy - 1, cy + 1, 'C'); }
  }
  g.px(cx, cy, rr >= 3 ? 'C' : 'C');
  if (rr >= 3) g.px(cx, cy, 'e');
}

/** Body fill + shading + glass + wheels for a car-like spec. Details are applied afterwards. */
function paintCar(g: Grid, s: Spec): void {
  const roofT = s.roofT ?? 2;
  // body
  for (let x = s.x0; x <= s.x1; x++) g.vline(x, topAt(s, x), sillAt(s, x), 'B');
  // rocker / lower shade (bottom third of the flank)
  for (let x = s.x0; x <= s.x1; x++) { const sy = sillAt(s, x); const n = Math.max(3, Math.floor((sy - s.belt) / 3)); for (let y = sy - n + 1; y <= sy; y++) over(g, x, y, 'b', 'B'); }
  // bumper faces
  for (const bx of [s.x0, s.x0 + 1, s.x1 - 1, s.x1]) for (let y = s.belt + 3; y <= sillAt(s, bx); y++) over(g, bx, y, 'b', 'B');
  // top edge highlight + shoulder
  for (let x = s.x0 + 1; x < s.x1; x++) {
    over(g, x, topAt(s, x), 'H', 'B');
    if (topAt(s, x) < s.belt) over(g, x, s.belt + 1, 'H', 'B');
  }
  // glass
  if (s.glass) {
    const [gx0, gx1] = s.glass;
    for (let x = gx0 - 1; x <= gx1 + 1; x++) { const yt = topAt(s, x) + roofT; if (yt <= s.belt) for (let y = yt; y <= s.belt; y++) over(g, x, y, 'k', 'BH'); }
    for (let x = gx0; x <= gx1; x++) { const yt = topAt(s, x) + roofT + 1; if (yt <= s.belt - 1) { for (let y = yt; y <= s.belt - 1; y++) g.px(x, y, 'G'); g.px(x, s.belt - 1, 'Z'); } }
    for (const [a, b] of s.pillars ?? []) g.line(a[0], a[1], b[0], b[1], 'k');
    if (s.streak !== false) {
      let roof = 999;
      for (let x = gx0; x <= gx1; x++) roof = Math.min(roof, topAt(s, x));
      const sy = roof + roofT + 2;
      for (let x = gx0; x <= gx1; x++) if (g.get(x, sy) === 'G' && g.get(x - 1, sy) !== 'k' && g.get(x + 1, sy) !== 'k' && g.get(x, sy - 1) !== 'k') g.px(x, sy, 'z');
    }
  }
  // wheels
  const cy = wheelY(s);
  for (const wx of s.wheels) {
    if (!s.noArch) for (let y = cy - s.r - 1; y <= cy + s.r + 1; y++) for (let x = wx - s.r - 1; x <= wx + s.r + 1; x++) {
      const dx = x - wx, dy = y - cy;
      if (dx * dx + dy * dy <= (s.r + 1) * (s.r + 1) + 1) g.px(x, y, '.');
    }
    wheel(g, wx, cy, s.r, s.wheelStyle);
  }
}

// ── detail passes ─────────────────────────────────────────────────────────────
function headlight(g: Grid, s: Spec, d: VehicleDetails): void {
  const y = s.belt + (s.lampDy ?? 1);
  const x = s.x0 + 1;
  switch (d.lights) {
    case 'popup': {
      const hx = s.x0 + 4, hy = topAt(s, s.x0 + 6);
      g.rect(hx, hy - 3, 5, 3, 'B'); g.hline(hx, hx + 4, hy - 3, 'H'); g.rect(hx, hy - 2, 1, 2, 'Y'); g.px(hx, hy - 2, 'w');
      g.rect(x, y, 2, 2, 'b');
      break;
    }
    case 'strip': g.rect(x, y, 5, 1, 'Y'); g.px(x, y, 'w'); g.px(x + 1, y, 'w'); g.rect(x, y + 1, 3, 1, 'Y'); break;
    case 'square': g.rect(x, y, 3, 2, 'Y'); g.px(x, y, 'w'); g.px(x + 1, y, 'w'); break;
    case 'afterburner': g.rect(x, y, 3, 2, 'Y'); g.px(x + 1, y, 'w'); g.px(x, y + 1, 'w'); break;
    case 'quad': g.rect(x, y, 2, 2, 'Y'); g.px(x, y, 'w'); g.rect(x + 3, y, 2, 2, 'Y'); g.px(x + 3, y, 'w'); break;
    default: g.rect(x, y, 3, 2, 'Y'); g.px(x, y, 'w'); g.px(x + 1, y + 1, 'w'); // round
  }
}
function taillight(g: Grid, s: Spec, d: VehicleDetails): void {
  const y = s.belt + (s.lampDy ?? 1);
  const x = s.x1 - 1;
  switch (d.lights) {
    case 'quad': g.rect(x, y, 2, 4, 'r'); g.px(x + 1, y + 1, 'R'); g.px(x + 1, y + 3, 'R'); break;
    case 'afterburner': g.rect(x, y, 2, 3, 'r'); g.px(x, y + 1, 'w'); break;
    case 'strip': g.rect(x - 1, y, 3, 1, 'r'); g.rect(x, y + 1, 2, 2, 'r'); g.px(x + 1, y + 2, 'R'); break;
    default: g.rect(x, y, 2, 3, 'r'); g.px(x + 1, y + 1, 'R');
  }
}
function spoiler(g: Grid, s: Spec, kind: VehicleDetails['spoiler']): void {
  if (!kind || kind === 'none') return;
  const x1 = s.x1;
  const deck = topAt(s, x1 - 4);
  switch (kind) {
    case 'lip': g.hline(x1 - 8, x1 - 1, deck - 1, 'b'); g.hline(x1 - 7, x1 - 2, deck - 2, 'H'); break;
    case 'ducktail': g.rect(x1 - 8, deck - 2, 8, 2, 'B'); g.hline(x1 - 8, x1 - 1, deck - 3, 'H'); g.px(x1 - 1, deck - 2, 'b'); break;
    case 'wing':
      g.rect(x1 - 12, deck - 4, 11, 2, 'B'); g.hline(x1 - 12, x1 - 2, deck - 5, 'H'); g.hline(x1 - 12, x1 - 2, deck - 3, 'b');
      g.rect(x1 - 4, deck - 2, 2, 2, 'b'); g.rect(x1 - 10, deck - 2, 2, 2, 'b');
      break;
    case 'bigwing':
      g.rect(x1 - 14, deck - 6, 13, 2, 'B'); g.hline(x1 - 14, x1 - 2, deck - 7, 'H'); g.hline(x1 - 14, x1 - 2, deck - 5, 'b');
      g.rect(x1 - 4, deck - 4, 2, 4, 'b'); g.rect(x1 - 12, deck - 4, 2, 4, 'b');
      g.vline(x1 - 1, deck - 8, deck - 4, 'A'); g.vline(x1 - 2, deck - 8, deck - 4, 'A');
      break;
  }
}
function stripes(g: Grid, s: Spec, d: VehicleDetails, extra: string): void {
  const y = s.belt;
  switch (d.stripe) {
    case 'side':
      if (extra === 'panda') { hlineOver(g, s.x0 + 4, s.x1 - 4, y + 2, 'B', 'A'); break; }
      hlineOver(g, s.x0 + 5, s.x1 - 5, y + 3, 'A'); hlineOver(g, s.x0 + 5, s.x1 - 5, y + 4, 'A');
      break;
    case 'double':
      hlineOver(g, s.x0 + 4, s.x1 - 4, y + 3, 'A'); hlineOver(g, s.x0 + 4, s.x1 - 4, y + 6, 'A');
      break;
    case 'center':
      for (let x = s.x0 + 3; x <= s.x1 - 3; x++) { const t = topAt(s, x); over(g, x, t, 'A', 'BH'); over(g, x, t + 1, 'A', 'Bb'); }
      break;
    case 'checker':
      for (let x = s.x0 + 8; x <= s.x1 - 8; x++) for (let j = 0; j < 4; j++) over(g, x, y + 2 + j, ((x >> 1) + (j >> 1)) & 1 ? 'w' : 'A');
      break;
    case 'flames': {
      const fl = ['ooyy....o.......', 'oooyyy.ooy.o....', 'oooooyyyoyyoy...', 'ooooooooyoooyyoy'];
      const fx = s.x0 + 4, fy = y + 2;
      for (let j = 0; j < fl.length; j++) for (let i = 0; i < fl[j].length; i++) {
        const c = fl[j][i];
        if (c !== '.') over(g, fx + i, fy + j, c === 'o' ? 'A' : 'y');
      }
      break;
    }
  }
}
function numberDecal(g: Grid, s: Spec, n: number, cx: number): void {
  const str = String(n);
  const w = str.length * 4 + 1, h = 7;
  const x = cx - (w >> 1), y = s.belt + 2;
  g.rect(x, y, w, h, 'w'); g.box(x - 1, y - 1, w + 2, h + 2, 'k');
  text(g, str, x + 1, y + 1, 'k');
}
function roofRack(g: Grid, s: Spec): void {
  if (!s.glass) return;
  const [gx0, gx1] = s.glass;
  let roof = 999;
  for (let x = gx0; x <= gx1; x++) roof = Math.min(roof, topAt(s, x));
  const a = gx0 + 6, b = gx1 - 4;
  g.hline(a, b, roof - 2, 'd'); g.hline(a, b, roof - 3, 'e');
  for (let x = a + 1; x < b; x += 6) g.px(x, roof - 1, 'd');
}
function lightbar(g: Grid, s: Spec, cx: number, roof: number): void {
  const x = cx - 6;
  g.rect(x, roof - 3, 12, 2, 'u'); g.rect(x + 5, roof - 3, 2, 2, 'w'); g.rect(x, roof - 3, 2, 2, 'r'); g.rect(x + 10, roof - 3, 2, 2, 'r');
  g.hline(x + 1, x + 10, roof - 1, 'd');
}
function exhaust(g: Grid, s: Spec, n: number | undefined): void {
  const y = sillAt(s, s.x1) - 1;
  g.rect(s.x1, y, 2, 1, 'C'); g.px(s.x1 + 1, y, 'e');
  if ((n ?? 1) >= 2) { g.rect(s.x1, y - 2, 2, 1, 'C'); g.px(s.x1 + 1, y - 2, 'e'); }
}
function fenderFlares(g: Grid, s: Spec): void {
  const cy = wheelY(s);
  for (const wx of s.wheels) for (let a = 0; a <= 16; a++) {
    const t = Math.PI + (a / 16) * Math.PI;
    over(g, wx + Math.round(Math.cos(t) * (s.r + 2.4)), cy + Math.round(Math.sin(t) * (s.r + 2.4)), 'H', 'B');
  }
}
function sakura(g: Grid, x: number, y: number, small = false): void {
  if (small) { g.px(x, y - 1, 's'); g.px(x - 1, y, 's'); g.px(x + 1, y, 's'); g.px(x, y + 1, 's'); g.px(x, y, 'm'); return; }
  const f = ['.ss.ss.', 'sssssss', '.ssmss.', 'sssssss', '.ss.ss.'];
  for (let j = 0; j < f.length; j++) for (let i = 0; i < f[j].length; i++) if (f[j][i] !== '.') g.px(x + i - 3, y + j - 2, f[j][i]);
}

/** Common detail pass for car-like bodies. */
function decorateCar(g: Grid, s: Spec, def: VehicleDef): void {
  const d = def.details ?? {};
  const extra = d.extra ?? '';
  const [gx0, gx1] = s.glass ?? [s.x0 + 20, s.x1 - 20];
  const doorX = Math.round((gx0 + gx1) / 2);
  let roof = 999;
  for (let x = gx0; x <= gx1; x++) roof = Math.min(roof, topAt(s, x));

  if (extra === 'panda') for (let x = s.x0; x <= s.x1; x++) for (let y = s.belt + 3; y <= sillAt(s, x); y++) over(g, x, y, 'A');
  if (extra === 'vip') {
    for (let x = s.x0 + 3; x <= s.x1 - 3; x++) over(g, x, sillAt(s, x) - 2, 'C', 'b');
    hlineOver(g, s.x0 + 6, s.x1 - 6, s.belt + 1, 'C', 'H');
    // curtains in the rear window
    for (let x = gx1 - 6; x <= gx1 - 2; x += 2) for (let y = roof + 4; y <= s.belt - 2; y++) if (g.get(x, y) === 'G') g.px(x, y, 'w');
  }
  if (extra === 'wide') fenderFlares(g, s);
  if (extra === 'vents') { const hy = topAt(s, s.x0 + 10); for (const vx of [s.x0 + 9, s.x0 + 12, s.x0 + 15]) g.rect(vx, hy + 1, 2, 1, 'k'); }
  if (extra === 'hoodscoop') { const hx = gx0 - 9, hy = topAt(s, gx0 - 6); g.rect(hx, hy - 2, 7, 2, 'B'); g.hline(hx, hx + 6, hy - 3, 'H'); g.rect(hx, hy - 2, 1, 2, 'k'); }
  if (extra === 'midengine') { const dy = topAt(s, gx1 + 4); for (let i = 0; i < 4; i++) g.hline(gx1 + 2, s.x1 - 4, dy + 1 + i * 2, 'b'); }
  if (extra === 'classic') {
    g.rect(s.x0, sillAt(s, s.x0) - 4, 3, 2, 'C'); g.rect(s.x1 - 2, sillAt(s, s.x1) - 4, 3, 2, 'C');
    hlineOver(g, s.x0 + 6, s.x1 - 6, s.belt + 5, 'C');
  }
  if (extra === 'blackroof' || d.roof === 'targa') {
    for (let x = gx0 + 7; x <= gx1 - 3; x++) { const t = topAt(s, x); if (t <= roof + 1) { g.px(x, t, 'A'); g.px(x, t + 1, 'A'); } }
  }
  if (extra === 'neon') {
    for (let x = s.x0 + 4; x <= s.x1 - 4; x++) { over(g, x, sillAt(s, x) - 1, 'A', 'b'); if (x % 3 === 0) over(g, x, sillAt(s, x), 'c', 'b'); }
    hlineOver(g, s.x0 + 6, s.x1 - 6, s.belt + 1, 'A', 'H');
  }
  if (extra === 'polizei') {
    for (let x = s.x0 + 3; x <= s.x1 - 3; x++) for (let y = s.belt + 2; y <= s.belt + 7; y++) over(g, x, y, 'A');
    text(g, 'POLIZEI', doorX - 13, s.belt + 3, 'w');
  }
  if (extra === 'sakura') {
    sakura(g, doorX - 8, s.belt + 6); sakura(g, doorX + 8, s.belt + 5); sakura(g, s.x1 - 8, s.belt + 7, true); sakura(g, s.x0 + 9, s.belt + 6, true);
    hlineOver(g, s.x0 + 4, s.x1 - 4, s.belt + 2, 'A');
  }
  if (extra === 'hydraulics') {
    for (let x = s.x0 + 6; x <= s.x1 - 6; x++) { const t = topAt(s, x); if (t + 1 < s.belt) over(g, x, s.belt + 4, 'C'); }
  }

  stripes(g, s, d, extra);
  if (d.number !== undefined) numberDecal(g, s, d.number, doorX);
  headlight(g, s, d);
  taillight(g, s, d);
  spoiler(g, s, d.spoiler);
  exhaust(g, s, d.exhaust);
  if (d.roof === 'rack') roofRack(g, s);
  if (d.roof === 'lightbar') lightbar(g, s, Math.round((gx0 + gx1) / 2), roof);
  if (d.bumper === 'bull') { g.rect(s.x0 - 1, s.belt, 2, sillAt(s, s.x0) - s.belt - 1, 'C'); g.rect(s.x0 - 1, s.belt + 3, 2, 1, 'd'); }
  if (d.bumper === 'ram') { g.rect(s.x0 - 1, s.belt + 2, 2, sillAt(s, s.x0) - s.belt - 3, 'C'); }
  if (d.bumper === 'plow') { for (let i = 0; i < 4; i++) g.rect(s.x0 - 1 + i, sillAt(s, s.x0) - 5 + i, 1, 5 - i, 'd'); }
  // door handle + mirror
  g.px(doorX + 4, s.belt + 3, 'k');
  if (s.glass) { g.rect(gx0 - 2, s.belt - 4, 2, 2, 'b'); g.px(gx0 - 2, s.belt - 4, 'H'); }
}

// ── car body specs ───────────────────────────────────────────────────────────
function carSpec(def: VehicleDef): Spec {
  const d = def.details ?? {};
  const extra = d.extra ?? '';
  const open = d.roof === 'open';
  switch (def.body) {
    case 'coupe': {
      if (extra === 'classic') return {
        w: 70, h: 30, x0: 2, x1: 67, r: 5, wheels: [14, 55], sill: 26, belt: 14,
        top: [[2, 19], [3, 17], [5, 15], [30, 13], [32, 12], [40, 5], [50, 5], [58, 9], [62, 12], [66, 12], [67, 14]],
        glass: [34, 59], pillars: [[[36, 12], [42, 8]], [[50, 7], [50, 13]]],
      };
      const boxy = d.lights === 'quad' || extra === 'wide' && def.brand === 'nissan';
      return boxy ? {
        w: 68, h: 30, x0: 2, x1: 65, r: 5, wheels: [14, 53], sill: 26, belt: 14,
        top: [[2, 19], [3, 17], [5, 16], [22, 14], [24, 13], [33, 5], [47, 5], [53, 11], [57, 12], [64, 12], [65, 14]],
        glass: [26, 54], pillars: [[[28, 13], [35, 7]], [[46, 7], [46, 13]]],
      } : {
        w: 68, h: 30, x0: 2, x1: 65, r: 5, wheels: [14, 53], sill: 26, belt: 14,
        top: [[2, 19], [3, 17], [5, 16], [22, 14], [24, 13], [34, 5], [45, 5], [54, 9], [58, 12], [64, 12], [65, 14]],
        glass: [26, 56], pillars: [[[28, 13], [35, 7]], [[45, 7], [45, 13]]],
      };
    }
    case 'sedan': return {
      w: 72, h: 30, x0: 2, x1: 69, r: 5, wheels: [15, 57], sill: extra === 'lowered' ? 27 : 26, belt: 14,
      top: [[2, 19], [3, 17], [5, 16], [23, 14], [25, 13], [34, 5], [52, 5], [58, 11], [61, 12], [68, 12], [69, 14]],
      glass: [27, 59], pillars: [[[29, 13], [36, 7]], [[44, 7], [44, 13]], [[53, 7], [58, 12]]],
    };
    case 'hatch': return extra === 'panda' ? {
      w: 64, h: 30, x0: 2, x1: 61, r: 5, wheels: [13, 50], sill: 26, belt: 14,
      top: [[2, 19], [3, 17], [5, 16], [21, 14], [23, 13], [31, 6], [44, 6], [49, 11], [52, 12], [60, 12], [61, 14]],
      glass: [25, 50], pillars: [[[27, 13], [33, 8]], [[41, 8], [41, 13]]],
    } : {
      w: 64, h: 30, x0: 2, x1: 61, r: 5, wheels: [13, 50], sill: 26, belt: 14,
      top: [[2, 19], [3, 17], [5, 16], [21, 14], [23, 13], [32, 6], [42, 6], [56, 12], [60, 12], [61, 14]],
      glass: [25, 55], pillars: [[[27, 13], [34, 8]], [[42, 8], [42, 13]]],
    };
    case 'kei': return open ? {
      w: 48, h: 26, x0: 2, x1: 45, r: 4, wheels: [10, 37], sill: 22, belt: 12,
      top: [[2, 16], [3, 14], [5, 13], [16, 11], [18, 10], [24, 5], [25, 5], [27, 10], [40, 10], [44, 10], [45, 12]],
      glass: [20, 25], pillars: [], streak: false,
    } : {
      w: 48, h: 26, x0: 2, x1: 45, r: 4, wheels: [10, 37], sill: 22, belt: 12,
      top: [[2, 16], [3, 14], [5, 13], [16, 11], [18, 10], [24, 5], [34, 5], [38, 9], [40, 10], [44, 10], [45, 12]],
      glass: [20, 38], pillars: [[[22, 10], [26, 7]]],
    };
    case 'roadster': return open ? {
      w: 64, h: 28, x0: 2, x1: 61, r: 5, wheels: [13, 50], sill: 24, belt: 13,
      top: [[2, 18], [3, 16], [5, 15], [21, 13], [23, 12], [30, 6], [31, 6], [33, 12], [40, 12], [57, 12], [60, 12], [61, 14]],
      glass: [25, 31], pillars: [], streak: false,
    } : {
      w: 64, h: 28, x0: 2, x1: 61, r: 5, wheels: [13, 50], sill: 24, belt: 13,
      top: [[2, 18], [3, 16], [5, 15], [21, 13], [23, 12], [30, 6], [42, 6], [46, 11], [48, 12], [60, 12], [61, 14]],
      glass: [25, 45], pillars: [[[27, 12], [33, 8]]],
    };
    case 'wagon': return {
      w: 74, h: 31, x0: 2, x1: 71, r: 5, wheels: [15, 58], sill: 27, belt: 15,
      top: [[2, 20], [3, 18], [5, 17], [23, 15], [25, 14], [34, 6], [64, 6], [68, 11], [70, 13], [71, 15]],
      glass: [27, 68], pillars: [[[29, 14], [36, 8]], [[44, 8], [44, 14]], [[56, 8], [56, 14]]],
    };
    case 'luxury': return {
      w: 76, h: 30, x0: 2, x1: 73, r: 5, wheels: [16, 60], sill: extra === 'vip' ? 27 : 26, belt: 14,
      top: [[2, 19], [3, 17], [5, 16], [26, 14], [28, 13], [37, 5], [56, 5], [62, 11], [65, 12], [72, 12], [73, 14]],
      glass: [30, 63], pillars: [[[32, 13], [39, 7]], [[48, 7], [48, 13]], [[57, 7], [62, 12]]],
    };
    case 'suv': {
      const lifted = extra === 'lifted';
      return {
        w: 72, h: lifted ? 38 : 34, x0: 2, x1: 69, r: lifted ? 8 : 6, wheels: [14, 56], sill: lifted ? 29 : 29, belt: 17,
        top: [[2, 22], [3, 20], [5, 19], [21, 17], [23, 16], [30, 7], [62, 7], [66, 13], [68, 15], [69, 17]],
        glass: [25, 65], pillars: [[[27, 16], [32, 9]], [[40, 9], [40, 16]], [[53, 9], [53, 16]]], wheelStyle: lifted ? 'mud' : 'std',
      };
    }
    case 'pickup': return {
      w: 72, h: 32, x0: 2, x1: 69, r: 6, wheels: [14, 57], sill: 27, belt: 16,
      top: [[2, 21], [3, 19], [5, 18], [21, 16], [23, 15], [30, 7], [42, 7], [44, 13], [45, 14], [68, 14], [69, 16]],
      glass: [25, 42], pillars: [[[27, 15], [32, 9]]],
    };
    case 'van': return {
      w: 68, h: 34, x0: 2, x1: 65, r: 5, wheels: [13, 52], sill: 29, belt: 18,
      top: [[2, 22], [3, 19], [5, 18], [9, 17], [10, 16], [15, 7], [17, 6], [62, 6], [64, 8], [65, 12]],
      glass: [18, 62], pillars: [[[20, 16], [24, 9]], [[30, 8], [30, 17]], [[46, 8], [46, 17]]],
    };
    case 'hyper': return {
      w: 80, h: 26, x0: 2, x1: 77, r: 5, wheels: [16, 62], sill: 22, belt: 12,
      top: [[2, 17], [3, 15], [6, 14], [28, 12], [30, 11], [40, 5], [54, 5], [66, 9], [72, 10], [76, 10], [77, 12]],
      glass: [32, 68], pillars: [[[34, 11], [41, 7]]],
    };
    case 'limo': return {
      w: 100, h: 30, x0: 2, x1: 97, r: 5, wheels: [16, 85], sill: 26, belt: 14,
      top: [[2, 19], [3, 17], [5, 16], [25, 14], [27, 13], [36, 6], [84, 6], [90, 11], [93, 12], [96, 12], [97, 14]],
      glass: [29, 90], pillars: [[[31, 13], [38, 8]], [[46, 8], [46, 13]], [[58, 8], [58, 13]], [[70, 8], [70, 13]], [[80, 8], [80, 13]], [[85, 8], [89, 12]]],
    };
    case 'police': return {
      w: 70, h: 30, x0: 2, x1: 67, r: 5, wheels: [14, 55], sill: 26, belt: 14,
      top: [[2, 19], [3, 17], [5, 16], [22, 14], [24, 13], [33, 5], [50, 5], [56, 11], [59, 12], [66, 12], [67, 14]],
      glass: [26, 57], pillars: [[[28, 13], [35, 7]], [[43, 7], [43, 13]], [[51, 7], [56, 12]]],
    };
    case 'taxi': return {
      w: 70, h: 30, x0: 2, x1: 67, r: 5, wheels: [14, 55], sill: 26, belt: 14,
      top: [[2, 19], [3, 17], [5, 16], [22, 14], [24, 13], [33, 5], [50, 5], [56, 11], [59, 12], [66, 12], [67, 14]],
      glass: [26, 57], pillars: [[[28, 13], [35, 7]], [[43, 7], [43, 13]], [[51, 7], [56, 12]]],
    };
    case 'lowrider': return {
      w: 76, h: 32, x0: 2, x1: 73, r: 5, wheels: [16, 60], sill: [[2, 19], [30, 23], [73, 28]], belt: 13,
      top: [[2, 13], [3, 11], [5, 10], [26, 9], [28, 8], [37, 3], [54, 4], [60, 10], [63, 12], [72, 13], [73, 15]],
      glass: [30, 61], pillars: [[[32, 9], [39, 5]], [[47, 5], [47, 12]], [[55, 6], [60, 11]]], wheelStyle: 'wire', lampDy: 2,
    };
    default: return {
      w: 68, h: 30, x0: 2, x1: 65, r: 5, wheels: [14, 53], sill: 26, belt: 14,
      top: [[2, 19], [3, 17], [5, 16], [22, 14], [24, 13], [34, 5], [45, 5], [54, 9], [58, 12], [64, 12], [65, 14]],
      glass: [26, 56], pillars: [[[28, 13], [35, 7]], [[45, 7], [45, 13]]],
    };
  }
}

function carGrid(def: VehicleDef): Grid {
  const s = carSpec(def);
  const g = new Grid(s.w, s.h);
  paintCar(g, s);
  const d = def.details ?? {};
  // open tops: headrests + roll hoop
  if (d.roof === 'open' && s.glass) {
    const [, gx1] = s.glass;
    const y = s.belt - 4;
    g.rect(gx1 + 6, y, 3, 3, 'b'); g.rect(gx1 + 14, y, 3, 3, 'b'); g.hline(gx1 + 6, gx1 + 8, y, 'C'); g.hline(gx1 + 14, gx1 + 16, y, 'C');
    g.rect(gx1 + 1, s.belt - 1, 3, 1, 'G'); // windscreen top glimpse
  }
  decorateCar(g, s, def);
  if (def.body === 'lowrider') {
    // whitewall wire wheels already; add a hydraulic pump bump + chrome sill trim
    for (let x = s.x0 + 4; x <= s.x1 - 4; x++) over(g, x, sillAt(s, x) - 1, 'C', 'b');
  }
  return g;
}

// ── heavies (hand-built) ─────────────────────────────────────────────────────
function tankGrid(def: VehicleDef): Grid {
  const w = 96, h = 40;
  const g = new Grid(w, h);
  const d = def.details ?? {};
  const leo = def.brand === 'military' && def.id === 'leopard2';
  // tracks
  const ty0 = 25, ty1 = 36;
  g.rect(9, ty0, 78, ty1 - ty0 + 1, 'K');
  g.ellipse(9, (ty0 + ty1) >> 1, 6, 6, 'K'); g.ellipse(87, (ty0 + ty1) >> 1, 6, 6, 'K');
  for (let x = 4; x <= 92; x += 2) g.px(x, ty1, 'D');
  for (let x = 6; x <= 90; x += 2) g.px(x, ty0, 'd');
  for (const rx of [16, 28, 40, 52, 64, 76]) wheel(g, rx, 31, 3, 'road');
  wheel(g, 6, 30, 3, 'road'); wheel(g, 90, 30, 3, 'road');
  // hull
  g.trap(12, 88, 18, 4, 92, 24, 'B');
  g.rect(4, 24, 89, 2, 'B');
  g.hline(13, 87, 18, 'H');
  g.line(4, 24, 12, 18, 'H');
  // side skirts
  g.rect(12, 24, 72, 4, 'b'); g.hline(12, 83, 24, 'H');
  for (let x = 20; x < 84; x += 12) g.vline(x, 25, 27, 'k');
  // turret
  if (leo) { g.trap(40, 66, 10, 34, 70, 17, 'B'); g.rect(66, 12, 8, 6, 'b'); g.rect(70, 11, 6, 2, 'd'); }
  else { g.trap(36, 66, 10, 32, 68, 17, 'B'); g.rect(44, 8, 10, 2, 'b'); g.rect(60, 12, 8, 6, 'B'); }
  g.hline(leo ? 41 : 37, 65, 10, 'H');
  g.rect(52, 7, 6, 3, 'b'); g.hline(52, 57, 7, 'H'); // commander cupola
  g.rect(58, 5, 1, 3, 'd'); g.rect(56, 5, 5, 1, 'd'); // MG
  g.vline(72, 3, 10, 'd'); // antenna
  // barrel
  const bx = d.extra === 'cannonLong' ? 2 : 10;
  g.rect(bx, 12, 34 - bx, 2, 'b'); g.hline(bx, 33, 12, 'B'); g.rect(30, 11, 8, 4, 'B'); g.rect(bx, 11, 3, 4, 'd');
  // camo patches
  const cam = d.extra === 'cannonLong' && !leo ? 'A' : 'b';
  g.ellipse(24, 21, 5, 1, cam); g.ellipse(58, 13, 4, 1, cam); g.ellipse(80, 21, 4, 1, cam); g.ellipse(44, 14, 3, 1, 'A');
  if (d.number !== undefined) text(g, String(d.number), 46, 12, 'w');
  if (d.bumper === 'plow') { for (let i = 0; i < 4; i++) g.rect(2 + i, 22 + i, 1, 6 - i, 'd'); g.vline(3, 21, 27, 'e'); }
  // exhaust + taillight + headlight
  g.rect(93, 19, 2, 2, 'r'); g.px(5, 22, 'Y');
  return g;
}

function apcGrid(def: VehicleDef): Grid {
  const w = 92, h = 38;
  const g = new Grid(w, h);
  const d = def.details ?? {};
  const s: Spec = {
    w, h, x0: 2, x1: 89, r: 6, wheels: [14, 52, 68], sill: 30, belt: 20,
    top: [[2, 25], [3, 22], [12, 12], [60, 12], [70, 16], [86, 16], [88, 19], [89, 25]],
    streak: false,
  };
  paintCar(g, s);
  g.line(3, 22, 12, 12, 'H');
  // vision slits + side hatch
  g.rect(9, 15, 4, 2, 'G'); g.rect(15, 15, 4, 2, 'G'); g.px(9, 15, 'z'); g.px(15, 15, 'z');
  g.box(30, 18, 10, 9, 'k', 'B'); g.hline(31, 38, 19, 'H');
  g.rect(74, 18, 12, 8, 'b'); g.box(74, 18, 12, 8, 'k');
  // accent band
  hlineOver(g, 4, 88, 22, 'A'); hlineOver(g, 4, 88, 23, 'A');
  // turret + gatling
  g.rect(32, 6, 16, 7, 'B'); g.hline(32, 47, 6, 'H'); g.rect(30, 8, 3, 5, 'b');
  g.rect(12, 8, 20, 3, 'd'); g.hline(12, 31, 9, 'e'); g.rect(10, 8, 3, 3, 'D');
  g.vline(46, 2, 6, 'd');
  // spare wheel on the rear deck
  g.circle(80, 13, 3, 'K'); g.circle(80, 13, 1, 'd');
  if (d.bumper === 'bull') { g.rect(1, 20, 2, 9, 'C'); g.rect(1, 23, 2, 1, 'd'); }
  g.rect(3, 21, 2, 2, 'Y'); g.px(3, 21, 'w'); g.rect(88, 21, 2, 2, 'r');
  return g;
}

function monsterGrid(def: VehicleDef): Grid {
  const w = 88, h = 48;
  const g = new Grid(w, h);
  const d = def.details ?? {};
  const s: Spec = {
    w, h, x0: 6, x1: 82, r: 11, wheels: [20, 66], cy: 35, sill: 22, belt: 12, noArch: true,
    top: [[6, 16], [7, 13], [9, 12], [26, 10], [28, 9], [36, 2], [48, 2], [50, 8], [52, 9], [80, 9], [82, 11]],
    glass: [30, 49], pillars: [[[32, 9], [37, 4]]], wheelStyle: 'mud',
  };
  // axles + shocks first so the wheels overlap them
  g.rect(12, 28, 64, 3, 'D'); g.hline(12, 75, 28, 'd');
  for (const x of [15, 25, 61, 71]) { g.vline(x, 22, 28, 'd'); g.px(x, 24, 'e'); g.px(x, 26, 'e'); }
  paintCar(g, s);
  // bed rails + roll bar
  g.rect(52, 6, 28, 3, 'b'); g.hline(53, 79, 6, 'H'); g.rect(54, 3, 2, 6, 'C'); g.rect(62, 3, 2, 6, 'C'); g.hline(54, 63, 3, 'C');
  // exhaust stacks behind the cab
  g.rect(50, 1, 2, 8, 'C'); g.px(50, 1, 'e');
  decorateCar(g, s, def);
  if (d.stripe === 'flames') { const fl = ['..oy....', '.ooyy.o.', 'oooyyyoy']; for (let j = 0; j < 3; j++) for (let i = 0; i < 8; i++) if (fl[j][i] !== '.') over(g, 10 + i, 10 + j, fl[j][i] === 'o' ? 'A' : 'y'); }
  return g;
}

function truckGrid(def: VehicleDef): Grid {
  const d = def.details ?? {};
  const w = 100, h = 44;
  const g = new Grid(w, h);
  const neon = d.extra === 'neon';
  if (neon) {
    // Japanese cab-over decorated truck (Dekotora): chrome, neon tubes, lit sign board, box body
    const s: Spec = {
      w, h, x0: 2, x1: 27, r: 6, wheels: [14, 70, 84], cy: 36, sill: 33, belt: 19, streak: true,
      top: [[2, 10], [3, 8], [5, 7], [27, 7]], glass: [4, 24], pillars: [[[7, 9], [7, 18]]],
    };
    g.rect(2, 30, 96, 4, 'D'); g.hline(2, 97, 30, 'd'); // frame
    paintCar(g, s);
    // box body
    g.rect(29, 4, 68, 28, 'B'); g.hline(29, 96, 4, 'H'); g.hline(29, 96, 5, 'H'); g.rect(29, 26, 68, 6, 'b');
    for (let y = 8; y <= 24; y += 8) { g.hline(31, 94, y, 'A'); for (let x = 31; x <= 94; x += 2) g.px(x, y + 1, 'c'); }
    g.rect(96, 4, 1, 28, 'k'); for (let y = 8; y < 30; y += 6) g.px(95, y, 'k');
    // chrome side skirts + tank
    g.rect(28, 31, 40, 3, 'C'); g.rect(30, 27, 14, 4, 'C'); g.hline(31, 43, 28, 'w');
    // cab chrome: bumper, grille, visor, mirrors
    g.rect(2, 26, 26, 5, 'C'); g.hline(3, 27, 26, 'w'); g.rect(2, 20, 4, 5, 'C'); g.hline(2, 12, 6, 'C');
    g.rect(1, 12, 2, 10, 'b'); g.hline(4, 24, 8, 'C');
    // lit roof sign + marker lamps
    g.rect(6, 1, 20, 4, 'A'); g.hline(6, 25, 1, 'H'); g.rect(8, 2, 3, 2, 'w'); g.rect(13, 2, 6, 2, 'y'); g.rect(21, 2, 3, 2, 'w');
    for (let x = 30; x <= 94; x += 4) g.px(x, 3, x % 8 ? 'y' : 'o');
    for (let x = 4; x <= 24; x += 4) g.px(x, 6, 'o');
    g.rect(3, 20, 3, 2, 'Y'); g.px(3, 20, 'w'); g.rect(96, 26, 2, 3, 'r');
    g.rect(27, 2, 2, 28, 'C'); g.px(27, 2, 'e'); // exhaust stack
    g.px(12, 22, 'k'); g.rect(24, 10, 3, 1, 'b');
    return g;
  }
  // conventional semi (sleeper cab) + trailer
  const s: Spec = {
    w, h, x0: 2, x1: 39, r: 6, wheels: [12, 34, 46, 78, 90], cy: 36, sill: 32, belt: 19,
    top: [[2, 25], [3, 22], [5, 21], [17, 21], [18, 20], [20, 19], [26, 8], [28, 7], [39, 7]],
    glass: [22, 37], pillars: [[[24, 18], [28, 11]], [[33, 9], [33, 18]]],
  };
  g.rect(2, 30, 96, 4, 'D'); g.hline(2, 97, 30, 'd'); // frame
  paintCar(g, s);
  // trailer
  const tc = def.palette.accent === def.palette.body ? 'C' : 'B';
  g.rect(41, 3, 56, 27, tc); g.hline(41, 96, 3, 'H'); g.hline(41, 96, 4, 'H'); g.rect(41, 24, 56, 6, 'b');
  for (let x = 45; x <= 94; x += 6) g.vline(x, 6, 23, 'b');
  g.vline(96, 3, 29, 'k'); for (let y = 8; y < 28; y += 6) g.px(95, y, 'k');
  g.rect(58, 30, 2, 5, 'd'); g.rect(60, 30, 2, 5, 'd'); // landing legs
  g.rect(41, 28, 6, 3, 'C'); // fifth wheel plate
  // cab extras: stack, tank, mirror, marker lights, sun visor
  g.rect(40, 2, 2, 28, 'C'); g.px(40, 2, 'e');
  g.rect(24, 26, 12, 4, 'C'); g.hline(25, 35, 27, 'w');
  g.rect(20, 11, 2, 4, 'b'); g.px(20, 11, 'H');
  for (let x = 28; x <= 38; x += 3) g.px(x, 6, 'o');
  g.rect(3, 21, 3, 2, 'Y'); g.px(3, 21, 'w');
  g.rect(3, 25, 6, 4, 'C'); g.rect(2, 26, 2, 3, 'C');
  if (d.bumper === 'bull') { g.rect(1, 20, 2, 10, 'C'); g.rect(1, 24, 2, 1, 'd'); }
  if (d.stripe === 'side' || d.stripe === 'double') { hlineOver(g, 4, 18, 24, 'A'); hlineOver(g, 4, 18, 25, 'A'); hlineOver(g, 43, 94, 12, 'A'); hlineOver(g, 43, 94, 13, 'A'); }
  g.rect(96, 25, 2, 3, 'r');
  return g;
}

function busGrid(def: VehicleDef, deck2 = false): Grid {
  const d = def.details ?? {};
  const w = 92, h = deck2 ? 48 : 40;
  const g = new Grid(w, h);
  const s: Spec = {
    w, h, x0: 2, x1: 89, r: 6, wheels: [16, 74], sill: h - 7, belt: h - 20,
    top: [[2, 10], [3, 8], [5, 6], [8, 5], [86, 5], [88, 7], [89, 10]],
    glass: [8, 84], pillars: [[[20, 8], [20, h - 21]], [[32, 8], [32, h - 21]], [[44, 8], [44, h - 21]], [[56, 8], [56, h - 21]], [[68, 8], [68, h - 21]], [[80, 8], [80, h - 21]]],
    roofT: 2,
  };
  if (deck2) {
    s.belt = h - 28; s.pillars = s.pillars!.map(([a, b]) => [a, [b[0], s.belt - 1]] as [Pt, Pt]);
  }
  paintCar(g, s);
  if (deck2) {
    // lower window row
    const b2 = h - 18;
    for (let x = 7; x <= 85; x++) for (let y = s.belt + 3; y <= b2; y++) g.px(x, y, 'k');
    for (let x = 8; x <= 84; x++) for (let y = s.belt + 4; y <= b2 - 1; y++) g.px(x, y, y === b2 - 1 ? 'Z' : 'G');
    for (let x = 20; x <= 80; x += 12) g.vline(x, s.belt + 4, b2 - 1, 'k');
    for (let x = 9; x <= 83; x++) if (g.get(x - 1, s.belt + 5) !== 'k' && g.get(x + 1, s.belt + 5) !== 'k') g.px(x, s.belt + 5, 'z');
    hlineOver(g, 3, 88, b2 + 1, 'H', 'B');
    g.rect(21, s.belt + 3, 10, b2 - s.belt - 2, 'k'); g.rect(22, s.belt + 4, 8, b2 - s.belt - 4, 'G'); g.vline(26, s.belt + 4, b2 - 1, 'k'); // door
    g.hline(2, 89, s.belt + 2, 'b');
  } else {
    g.rect(21, s.belt + 3, 8, s.sill as number - s.belt - 4, 'k'); g.rect(22, s.belt + 4, 6, (s.sill as number) - s.belt - 6, 'G'); g.vline(25, s.belt + 4, (s.sill as number) - 3, 'k'); // door
  }
  // windscreen at the front + destination sign
  g.rect(3, 7, 4, s.belt - 8, 'k'); g.rect(4, 8, 2, s.belt - 10, 'G');
  g.rect(3, 6, 8, 1, 'y'); g.rect(11, 6, 1, 1, 'o');
  g.rect(3, s.belt + 1, 3, 2, 'Y'); g.px(3, s.belt + 1, 'w'); g.rect(87, s.belt + 1, 2, 3, 'r');
  g.rect(88, s.belt - 6, 1, 2, 'o');
  // stripe / neon
  if (d.stripe === 'side') { hlineOver(g, 3, 88, s.belt + 5, 'A'); hlineOver(g, 3, 88, s.belt + 6, 'A'); }
  if (d.stripe === 'double' || d.extra === 'neon') {
    for (let x = 3; x <= 88; x++) { over(g, x, s.belt + 4, 'A'); over(g, x, s.belt + 8, 'A'); if (x % 3 === 0) over(g, x, s.belt + 5, 'c'); }
    for (let x = 4; x <= 88; x += 4) g.px(x, 4, x % 8 ? 'm' : 'c');
  }
  if (d.stripe === 'flames') { const fl = ['..oy....oy..', '.ooyy.o.ooy.', 'oooyyyoyooyy']; for (let j = 0; j < 3; j++) for (let i = 0; i < 12; i++) if (fl[j][i] !== '.') over(g, 32 + i, s.belt + 3 + j, fl[j][i] === 'o' ? 'A' : 'y'); }
  g.hline(2, 89, (s.sill as number) - 2, 'b');
  exhaust(g, s, d.exhaust);
  return g;
}

function firetruckGrid(def: VehicleDef): Grid {
  const w = 96, h = 44;
  const g = new Grid(w, h);
  const s: Spec = {
    w, h, x0: 2, x1: 93, r: 6, wheels: [14, 70, 82], cy: 36, sill: 33, belt: 19,
    top: [[2, 12], [3, 10], [5, 9], [26, 9], [27, 12], [29, 12], [92, 12], [93, 14]],
    glass: [4, 24], pillars: [[[8, 11], [8, 18]], [[18, 11], [18, 18]]],
  };
  g.rect(2, 30, 92, 4, 'D');
  paintCar(g, s);
  // pump-bay roller doors
  for (let x = 32; x <= 88; x += 10) { g.rect(x, 15, 8, 12, 'b'); g.box(x, 15, 8, 12, 'k'); for (let y = 17; y < 26; y += 2) g.hline(x + 1, x + 6, y, 'H'); }
  // white band + lettering
  for (let x = 3; x <= 92; x++) { over(g, x, 20, 'A'); over(g, x, 21, 'A'); over(g, x, 22, 'A'); over(g, x, 23, 'A'); over(g, x, 24, 'A'); over(g, x, 25, 'A'); over(g, x, 26, 'A'); }
  text(g, 'FEUERWEHR', 35, 21, 'B');
  // ladder on the roof
  const ly = 5;
  g.hline(26, 92, ly, 'C'); g.hline(26, 92, ly + 3, 'C'); for (let x = 28; x <= 90; x += 4) g.vline(x, ly + 1, ly + 2, 'd');
  g.rect(72, 9, 14, 3, 'd'); g.rect(76, 8, 6, 1, 'e'); // turntable
  g.rect(24, 6, 3, 3, 'd');
  // blue lights on the cab + rear
  g.rect(6, 6, 3, 3, 'u'); g.px(7, 6, 'w'); g.rect(20, 6, 3, 3, 'u'); g.px(21, 6, 'w'); g.rect(90, 9, 3, 3, 'u');
  // chrome bumper, lights, hose reel
  g.rect(2, 26, 26, 4, 'C'); g.hline(3, 27, 26, 'w');
  g.rect(3, 20, 3, 2, 'Y'); g.px(3, 20, 'w'); g.rect(92, 26, 2, 3, 'r');
  g.circle(90, 20, 2, 'C'); g.px(90, 20, 'd');
  g.rect(28, 2, 2, 28, 'C'); // stack
  return g;
}

function tuktukGrid(def: VehicleDef): Grid {
  const w = 56, h = 32;
  const g = new Grid(w, h);
  const d = def.details ?? {};
  // rear wheel + front wheel (three-wheeler)
  g.rect(4, 12, 44, 15, 'B'); g.hline(5, 47, 12, 'H');
  g.trap(4, 8, 12, 2, 8, 20, 'B'); g.rect(2, 20, 6, 7, 'B'); // nose
  g.rect(4, 25, 44, 2, 'b'); g.rect(2, 22, 6, 5, 'b');
  // open cabin cut-out + posts + canopy
  g.rect(16, 5, 30, 8, 'k'); g.rect(17, 6, 28, 6, '.');
  g.rect(14, 3, 34, 3, 'A'); g.hline(14, 47, 3, 'H');
  g.vline(16, 6, 12, 'k'); g.vline(46, 6, 12, 'k'); g.vline(30, 6, 12, 'k');
  // driver + bench
  g.rect(20, 7, 5, 3, 'k'); g.px(21, 7, 'w'); g.rect(20, 10, 5, 2, 'S'); g.rect(19, 12, 7, 1, 'u');
  g.rect(33, 8, 10, 4, 'b');
  // windscreen at the front of the canopy
  g.rect(10, 6, 5, 7, 'k'); g.rect(11, 7, 3, 5, 'G'); g.px(11, 8, 'z');
  // lights + decoration
  g.rect(3, 16, 2, 2, 'Y'); g.px(3, 16, 'w'); g.rect(46, 15, 2, 3, 'r');
  hlineOver(g, 6, 45, 19, 'A'); hlineOver(g, 6, 45, 20, 'A');
  g.circle(10, 25, 4, 'K'); g.circle(10, 25, 2, 'W'); g.px(10, 25, 'C');
  g.circle(40, 25, 4, 'K'); g.circle(40, 25, 2, 'W'); g.px(40, 25, 'C');
  if (d.number !== undefined) text(g, String(d.number), 30, 14, 'w');
  return g;
}

function tramGrid(def: VehicleDef): Grid {
  const d = def.details ?? {};
  const deck2 = d.extra === 'doubledeck';
  const w = 100, h = deck2 ? 48 : 40;
  const g = new Grid(w, h);
  const belt = deck2 ? 16 : h - 18;
  const s: Spec = {
    w, h, x0: 2, x1: 97, r: 4, wheels: [14, 24, 76, 86], sill: h - 6, belt, noArch: true,
    top: [[2, 14], [3, 10], [5, 8], [8, 6], [92, 6], [95, 8], [97, 10]],
    glass: [8, 92], pillars: [],
  };
  const pil: [Pt, Pt][] = [];
  for (let x = 20; x <= 84; x += 12) pil.push([[x, 9], [x, belt - 1]]);
  s.pillars = pil;
  paintCar(g, s);
  if (deck2) {
    const b2 = h - 16;
    for (let x = 7; x <= 93; x++) for (let y = belt + 3; y <= b2; y++) g.px(x, y, 'k');
    for (let x = 8; x <= 92; x++) for (let y = belt + 4; y <= b2 - 1; y++) g.px(x, y, y === b2 - 1 ? 'Z' : 'G');
    for (let x = 20; x <= 84; x += 12) g.vline(x, belt + 4, b2 - 1, 'k');
    for (let x = 9; x <= 91; x++) if (g.get(x - 1, belt + 5) !== 'k' && g.get(x + 1, belt + 5) !== 'k') g.px(x, belt + 5, 'z');
    hlineOver(g, 3, 96, b2 + 1, 'H', 'B');
  }
  // skirts hide the bogies; the wheels peek out
  g.rect(2, h - 8, 96, 2, 'b');
  // pantograph
  g.line(40, 5, 47, 1, 'd'); g.line(47, 1, 54, 5, 'd'); g.hline(44, 50, 1, 'e'); g.rect(45, 4, 5, 1, 'd');
  // doors
  for (const dx of [30, 62]) { g.rect(dx, belt + 2, 8, h - 8 - belt - 2, 'k'); g.rect(dx + 1, belt + 3, 6, 4, 'G'); g.vline(dx + 4, belt + 3, h - 9, 'k'); }
  // stripe + lights
  if (d.stripe === 'side') { hlineOver(g, 3, 96, belt + 5, 'A'); hlineOver(g, 3, 96, belt + 6, 'A'); }
  g.rect(3, belt + 2, 2, 2, 'Y'); g.px(3, belt + 2, 'w'); g.rect(95, belt + 2, 2, 2, 'r');
  g.rect(3, 7, 3, belt - 8, 'k'); g.rect(4, 8, 1, belt - 10, 'G');
  return g;
}

// ── entry points ─────────────────────────────────────────────────────────────
function bodyGrid(def: VehicleDef): Grid {
  switch (def.body) {
    case 'tank': return tankGrid(def);
    case 'apc': return apcGrid(def);
    case 'monster': return monsterGrid(def);
    case 'truck': return truckGrid(def);
    case 'bus': return busGrid(def, def.details?.extra === 'doubledeck');
    case 'firetruck': return firetruckGrid(def);
    case 'tuktuk': return tuktukGrid(def);
    case 'tram': return tramGrid(def);
    default: return carGrid(def);
  }
}

function extraMap(def: VehicleDef): CharMap {
  const glass = def.palette.glass || '#40e0f0';
  return { z: mix(glass, '#ffffff', 0.55), Z: mix(glass, '#000000', 0.3) };
}

/** Raw rows + colour map of a side view (dev previews / tests). Deterministic. */
export function sideRows(def: VehicleDef): { rows: string[]; map: CharMap } {
  const g = bodyGrid(def);
  g.outline('k');
  let rows = g.rows();
  if (!FACE_LEFT) rows = rows.map((r) => r.split('').reverse().join(''));
  return { rows, map: extraMap(def) };
}

/** Side-view garage sprite, facing left like the reference sheet. Cars 64–76×26–32, kei 48×26, heavies up to 100×48. */
export function drawSide(def: VehicleDef): PixelSprite {
  const { rows, map } = sideRows(def);
  return buildSprite({ id: 'side_' + def.id + '_' + def.body, rows }, def.palette, map);
}
