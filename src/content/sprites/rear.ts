import type { CharMap, VehicleDef, VehicleDetails } from '../../core/types';
import { Grid, buildSprite, makeCanvas, type PixelSprite } from '../../core/Sprite';
import { hexToRgb, mix } from '../../core/Palette';

// ─────────────────────────────────────────────────────────────────────────────
// Rear-view gameplay sprites — the OutRun follow-cam look of the reference shot:
// a huge, richly detailed car seen from behind and slightly above. The player is
// drawn at scale 1 (≈ 40 % of the 240-px screen), traffic reuses the same sprites
// scaled down by depth, so every silhouette has to survive being shrunk to ~10 %:
// dark glasshouse, saturated body, glowing lamp rings, black 1-px outline.
//
// Layout of a car, top → bottom (we look slightly DOWN on it):
//   wing blade · roof · rear window (dark, headrests) · beltline (black) + shoulder
//   highlight · boot lid (foreshortened top surface) · vertical rear face with the
//   taillights + badge · licence plate · bumper split · bumper with diffuser and
//   exhaust tips · tyres touching the last row.
//
// Recolor slots: B body · b shade · H highlight · A accent · G glass · L lamp ·
// W wheel · C chrome. Extra per-vehicle colours (see `extraMap`):
//   z window sheen · Z dark glass · j lamp glow · J lamp shadow · N deep shade · h bright highlight.
// Everything is deterministic — no Math.random anywhere.
// ─────────────────────────────────────────────────────────────────────────────

type Pt = [number, number];

// ── tiny 3×5 font (plates, badges, decals) ───────────────────────────────────
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
function text(g: Grid, s: string, x: number, y: number, c: string): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const gl = FONT[ch];
    if (gl) {
      const rows = gl.split(' ');
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (rows[j][i] === '#') g.px(cx + i, y + j, c);
    }
    cx += 4;
  }
}
const textW = (s: string): number => Math.max(0, s.length * 4 - 1);

// ── colour helpers ───────────────────────────────────────────────────────────
function lum(hex: string): number {
  const [r, gg, b] = hexToRgb(hex);
  return (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
}
function extraMap(def: VehicleDef): CharMap {
  const p = def.palette;
  const glass = p.glass || '#40e0f0';
  const lamp = p.lamp || '#e0202a';
  const body = p.body || '#909098';
  return {
    z: mix(glass, '#ffffff', 0.5),
    Z: mix(glass, '#0b0b12', 0.84),
    j: mix(lamp, '#ffb060', 0.45),
    J: mix(lamp, '#0b0b12', 0.55),
    N: mix(p.shade || body, '#0b0b12', 0.45),
    h: mix(p.light || body, '#ffffff', 0.4),
  };
}
/** Ink colour that reads on the body (plate glyphs, badge text). */
const inkOn = (hex: string): string => (lum(hex) > 0.45 ? 'K' : 'w');

// ── grid helpers ─────────────────────────────────────────────────────────────
function over(g: Grid, x: number, y: number, c: string, on = 'BbhH'): void {
  if (on.includes(g.get(x, y))) g.px(x, y, c);
}
function hlineOver(g: Grid, x0: number, x1: number, y: number, c: string, on = 'BbH'): void {
  for (let x = x0; x <= x1; x++) over(g, x, y, c, on);
}
/** Piecewise-linear silhouette: half width of the body at row y. */
function halfAt(prof: Pt[], y: number): number {
  if (y <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) {
    const [y0, h0] = prof[i - 1];
    const [y1, h1] = prof[i];
    if (y <= y1) return y1 === y0 ? h1 : Math.round(h0 + ((h1 - h0) * (y - y0)) / (y1 - y0));
  }
  return prof[prof.length - 1][1];
}

// ── shared pieces ────────────────────────────────────────────────────────────
/** Round taillight: black bezel, glowing ring, darker recessed centre (like the reference GT-R). */
function roundLamp(g: Grid, cx: number, cy: number, r: number): void {
  g.circle(cx, cy, r, 'k');
  if (r <= 2) { g.circle(cx, cy, r - 1, 'j'); return; }
  g.circle(cx, cy, r - 1, 'j');
  g.circle(cx, cy, r - 2, 'L');
  if (r >= 5) g.rect(cx - 1, cy - 1, 2, 2, 'J');
  g.px(cx - r + 2, cy - r + 2, 'w');
}
/** Rectangular lamp cluster: red main + amber + white reverse segment. */
function boxLamp(g: Grid, x: number, y: number, w: number, h: number, flip: boolean): void {
  g.box(x, y, w, h, 'k', 'L');
  g.hline(x + 1, x + w - 2, y + 1, 'j');
  g.hline(x + 1, x + w - 2, y + h - 2, 'J');
  const seg = Math.max(2, Math.round(w / 4));
  const ax = flip ? x + 1 : x + w - 1 - seg;
  g.rect(ax, y + 1, seg, h - 2, 'o');
  g.vline(flip ? ax + seg : ax - 1, y + 1, y + h - 2, 'k');
  const wx = flip ? x + 1 : x + w - 1 - seg;
  g.rect(wx, y + h - 3, seg, 2, 'w');
}
/** Tyre seen from behind: black block, tread notches, a sliver of rim. */
function tyre(g: Grid, x: number, y0: number, y1: number, w: number, rimSide: number): void {
  g.rect(x, y0, w, y1 - y0 + 1, 'K');
  g.vline(x, y0, y1, 'D');
  g.vline(x + w - 1, y0, y1, 'D');
  for (let yy = y1; yy > y1 - 7 && yy > y0; yy -= 2) for (let xx = x + 1; xx < x + w - 1; xx += 3) g.px(xx, yy, 'd');
  const rx = rimSide > 0 ? x + w - 3 : x + 1;
  const rh = Math.min(6, Math.max(3, Math.round((y1 - y0) * 0.45)));
  g.rect(rx, y1 - rh, 2, rh, 'W');
  g.px(rx, y1 - rh, 'C');
}
/** Exhaust tip: chrome ring with a dark bore. */
function tip(g: Grid, x: number, y: number, big = false): void {
  g.ellipse(x, y, big ? 4 : 3, big ? 3 : 2, 'C');
  g.ellipse(x, y, big ? 3 : 2, big ? 2 : 1, 'k');
  g.px(x - 1, y - (big ? 2 : 1), 'w');
}
/** Cherry blossom decal. */
function sakura(g: Grid, x: number, y: number): void {
  const f = ['.s.s.', 'sssss', '.sms.', 'sssss', '.s.s.'];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (f[j][i] !== '.') g.px(x + i - 2, y + j - 2, f[j][i]);
}

// ── car spec ─────────────────────────────────────────────────────────────────
interface Spec {
  w: number; h: number;
  /** [row, half width] silhouette from the roof down to the bumper */
  prof: Pt[];
  roofTop: number;
  glassY0: number; glassY1: number;
  glassHW: Pt;
  belt: number;
  lampCY: number;
  /** distance from the centre line to the outer edge of the lamp cluster */
  lampOuter: number;
  plateCY: number; plateW: number; plateH: number;
  splitY: number;
  bot: number;
  tyreTop: number; tyreOuter: number; tyreW: number;
  diffHW: number;
  /** row of the door mirrors (0 = none) */
  mirrorY?: number;
  open?: boolean;
}

const gHW = (s: Spec, y: number): number =>
  Math.round(s.glassHW[0] + ((s.glassHW[1] - s.glassHW[0]) * (y - s.glassY0)) / Math.max(1, s.glassY1 - s.glassY0));

function carSpec(def: VehicleDef): Spec {
  const d = def.details ?? {};
  const x = d.extra ?? '';
  const open = d.roof === 'open';
  let s: Spec;
  switch (def.body) {
    case 'coupe':
      if (x === 'classic') {
        s = {
          w: 88, h: 66, roofTop: 6,
          prof: [[6, 22], [7, 24], [8, 25], [12, 26], [13, 27], [22, 31], [30, 35], [34, 38], [40, 41], [48, 42], [53, 41], [57, 39], [61, 33]],
          glassY0: 13, glassY1: 27, glassHW: [20, 25], belt: 28,
          lampCY: 39, lampOuter: 36, plateCY: 52, plateW: 24, plateH: 8,
          splitY: 47, bot: 61, tyreTop: 46, tyreOuter: 42, tyreW: 11, diffHW: 18,
        };
      } else {
        const wide = x === 'wide';
        s = {
          w: 96, h: 70, roofTop: 6,
          prof: [[6, 25], [7, 27], [8, 28], [11, 29], [12, 30], [20, 35], [28, 40], [31, 43], [36, wide ? 46 : 45], [42, wide ? 47 : 46], [50, wide ? 47 : 46], [53, 45], [57, 43], [61, 41], [65, 35]],
          glassY0: 12, glassY1: 28, glassHW: [26, 30], belt: 29,
          lampCY: 41, lampOuter: 37, plateCY: 51, plateW: 24, plateH: 8,
          splitY: 56, bot: 65, tyreTop: 50, tyreOuter: wide ? 46 : 45, tyreW: 12, diffHW: 24,
        };
      }
      break;
    case 'sedan':
    case 'police':
    case 'taxi':
      s = {
        w: 94, h: 68, roofTop: 5,
        prof: [[5, 26], [6, 28], [7, 29], [12, 30], [13, 31], [22, 35], [29, 39], [33, 42], [38, 45], [44, 46], [52, 46], [55, 45], [58, 43], [63, 35]],
        glassY0: 12, glassY1: 28, glassHW: [27, 31], belt: 29,
        lampCY: 38, lampOuter: 40, plateCY: 49, plateW: 24, plateH: 8,
        splitY: 54, bot: 63, tyreTop: 48, tyreOuter: 45, tyreW: 12, diffHW: 22,
      };
      break;
    case 'hatch':
      s = {
        w: 88, h: 64, roofTop: 3,
        prof: [[3, 24], [4, 26], [5, 27], [10, 28], [11, 29], [20, 33], [28, 37], [32, 40], [38, 42], [44, 43], [50, 43], [53, 42], [56, 40], [59, 32]],
        glassY0: 10, glassY1: 29, glassHW: [25, 31], belt: 30,
        lampCY: 38, lampOuter: 38, plateCY: 48, plateW: 22, plateH: 8,
        splitY: 52, bot: 59, tyreTop: 46, tyreOuter: 42, tyreW: 11, diffHW: 18,
      };
      break;
    case 'kei':
      s = {
        w: 64, h: 52, roofTop: 2,
        prof: [[2, 17], [3, 19], [4, 20], [8, 21], [9, 22], [16, 25], [22, 28], [26, 30], [34, 31], [40, 30], [44, 29], [47, 23]],
        glassY0: 9, glassY1: 21, glassHW: [16, 20], belt: 22,
        lampCY: 29, lampOuter: 29, plateCY: 39, plateW: 16, plateH: 7,
        splitY: 43, bot: 47, tyreTop: 36, tyreOuter: 30, tyreW: 9, diffHW: 11,
      };
      break;
    case 'roadster':
      s = open ? {
        w: 88, h: 56, roofTop: 9,
        prof: [[9, 26], [10, 28], [11, 29], [16, 33], [22, 37], [26, 40], [32, 42], [40, 43], [45, 43], [48, 42], [50, 40], [54, 33]],
        glassY0: 1, glassY1: 8, glassHW: [19, 25], belt: 9,
        lampCY: 21, lampOuter: 38, plateCY: 33, plateW: 22, plateH: 8,
        splitY: 39, bot: 50, tyreTop: 36, tyreOuter: 42, tyreW: 12, diffHW: 18, open: true,
      } : {
        w: 88, h: 58, roofTop: 3,
        prof: [[3, 22], [4, 24], [5, 25], [9, 26], [10, 27], [18, 32], [24, 37], [28, 40], [34, 42], [42, 43], [47, 42], [50, 40], [53, 32]],
        glassY0: 10, glassY1: 22, glassHW: [20, 25], belt: 23,
        lampCY: 31, lampOuter: 38, plateCY: 41, plateW: 22, plateH: 8,
        splitY: 45, bot: 53, tyreTop: 40, tyreOuter: 42, tyreW: 12, diffHW: 18,
      };
      break;
    case 'wagon':
      s = {
        w: 92, h: 68, roofTop: 3,
        prof: [[3, 27], [4, 29], [5, 30], [9, 31], [28, 38], [34, 42], [40, 44], [48, 45], [54, 44], [57, 42], [60, 40], [63, 32]],
        glassY0: 8, glassY1: 30, glassHW: [27, 31], belt: 31,
        lampCY: 39, lampOuter: 42, plateCY: 50, plateW: 24, plateH: 8,
        splitY: 55, bot: 63, tyreTop: 48, tyreOuter: 44, tyreW: 12, diffHW: 20,
      };
      break;
    case 'luxury':
      s = {
        w: 96, h: 66, roofTop: 4,
        prof: [[4, 27], [5, 29], [6, 30], [13, 31], [14, 32], [22, 36], [28, 40], [32, 43], [38, 46], [44, 47], [52, 47], [55, 46], [58, 44], [61, 35]],
        glassY0: 14, glassY1: 28, glassHW: [26, 30], belt: 29,
        lampCY: 38, lampOuter: 42, plateCY: 49, plateW: 28, plateH: 9,
        splitY: 54, bot: 61, tyreTop: 48, tyreOuter: 46, tyreW: 12, diffHW: 24,
      };
      break;
    case 'suv':
      s = {
        w: 94, h: 76, roofTop: 2,
        prof: [[2, 29], [3, 31], [4, 32], [8, 33], [30, 40], [36, 43], [42, 45], [50, 46], [56, 45], [60, 43], [64, 41], [67, 33]],
        glassY0: 8, glassY1: 32, glassHW: [29, 33], belt: 33,
        lampCY: 42, lampOuter: 44, plateCY: 54, plateW: 26, plateH: 9,
        splitY: 59, bot: 67, tyreTop: 52, tyreOuter: 45, tyreW: 13, diffHW: 20,
      };
      break;
    case 'pickup':
      s = {
        w: 94, h: 74, roofTop: 2,
        prof: [[2, 20], [3, 22], [4, 23], [16, 26], [17, 42], [19, 44], [26, 45], [52, 46], [58, 45], [62, 43], [65, 36]],
        glassY0: 5, glassY1: 15, glassHW: [17, 21], belt: 16,
        lampCY: 46, lampOuter: 44, plateCY: 58, plateW: 26, plateH: 8,
        splitY: 53, bot: 65, tyreTop: 52, tyreOuter: 45, tyreW: 13, diffHW: 14,
        mirrorY: 12,
      };
      break;
    case 'van':
      s = {
        w: 78, h: 76, roofTop: 2,
        prof: [[2, 27], [3, 29], [4, 30], [8, 31], [40, 33], [56, 33], [60, 32], [64, 30], [67, 24]],
        glassY0: 8, glassY1: 26, glassHW: [26, 29], belt: 27,
        lampCY: 40, lampOuter: 32, plateCY: 53, plateW: 22, plateH: 8,
        splitY: 58, bot: 67, tyreTop: 54, tyreOuter: 33, tyreW: 10, diffHW: 12,
      };
      break;
    case 'hyper':
      s = {
        w: 100, h: 58, roofTop: 4,
        prof: [[4, 22], [5, 24], [6, 26], [10, 29], [16, 34], [22, 40], [28, 45], [34, 48], [42, 49], [46, 49], [49, 47], [52, 41]],
        glassY0: 10, glassY1: 24, glassHW: [24, 32], belt: 25,
        lampCY: 30, lampOuter: 46, plateCY: 39, plateW: 24, plateH: 8,
        splitY: 43, bot: 52, tyreTop: 38, tyreOuter: 48, tyreW: 14, diffHW: 28,
      };
      break;
    case 'limo':
      s = {
        w: 96, h: 70, roofTop: 2,
        prof: [[2, 23], [3, 25], [4, 26], [22, 29], [24, 31], [30, 36], [34, 40], [40, 44], [46, 46], [54, 46], [57, 45], [61, 43], [66, 35]],
        glassY0: 25, glassY1: 36, glassHW: [27, 31], belt: 37,
        lampCY: 45, lampOuter: 43, plateCY: 55, plateW: 26, plateH: 8,
        splitY: 60, bot: 66, tyreTop: 54, tyreOuter: 45, tyreW: 12, diffHW: 22,
      };
      break;
    case 'lowrider':
      s = {
        w: 94, h: 72, roofTop: 4,
        prof: [[4, 26], [5, 28], [6, 29], [12, 30], [13, 31], [22, 36], [30, 41], [34, 44], [40, 46], [46, 46], [50, 45], [53, 43], [56, 40]],
        glassY0: 13, glassY1: 28, glassHW: [25, 29], belt: 29,
        lampCY: 38, lampOuter: 40, plateCY: 48, plateW: 24, plateH: 8,
        splitY: 52, bot: 56, tyreTop: 52, tyreOuter: 44, tyreW: 11, diffHW: 16,
      };
      break;
    default:
      s = {
        w: 92, h: 66, roofTop: 5,
        prof: [[5, 25], [6, 27], [7, 28], [12, 29], [13, 30], [22, 34], [29, 38], [33, 41], [38, 44], [44, 45], [52, 45], [55, 44], [58, 42], [61, 34]],
        glassY0: 13, glassY1: 28, glassHW: [24, 28], belt: 29,
        lampCY: 38, lampOuter: 39, plateCY: 49, plateW: 24, plateH: 8,
        splitY: 54, bot: 61, tyreTop: 48, tyreOuter: 44, tyreW: 12, diffHW: 20,
      };
      break;
  }
  if (x === 'lowered') { s.bot += 2; s.splitY += 1; s.tyreTop += 2; }
  return s;
}

// ── car painter ──────────────────────────────────────────────────────────────
function paintBody(g: Grid, s: Spec): void {
  const cx = s.w >> 1;
  for (let y = s.roofTop; y <= s.bot; y++) {
    const hw = halfAt(s.prof, y);
    g.hline(cx - hw, cx + hw - 1, y, 'B');
  }
  // rounded edges: two darker columns down each flank
  for (let y = s.roofTop; y <= s.bot; y++) {
    const hw = halfAt(s.prof, y);
    g.px(cx - hw, y, 'b'); g.px(cx + hw - 1, y, 'b');
    over(g, cx - hw + 1, y, 'b', 'B'); over(g, cx + hw - 2, y, 'b', 'B');
  }
  // roof crown
  const hr = halfAt(s.prof, s.roofTop);
  g.hline(cx - hr + 1, cx + hr - 2, s.roofTop, 'H');
  // lower body gets darker toward the ground
  for (let y = s.bot - 2; y <= s.bot; y++) hlineOver(g, cx - 64, cx + 64, y, 'b', 'B');
  hlineOver(g, cx - 64, cx + 64, s.bot, 'N', 'Bb');
}

function paintGlass(g: Grid, s: Spec, def: VehicleDef): void {
  const cx = s.w >> 1;
  const d = def.details ?? {};
  if (s.open) { paintCockpit(g, s); return; }
  // black window frame
  for (let y = s.glassY0 - 1; y <= s.glassY1 + 1; y++) {
    const hw = gHW(s, Math.max(s.glassY0, Math.min(s.glassY1, y))) + 1;
    g.hline(cx - hw, cx + hw - 1, y, 'k');
  }
  // glass
  for (let y = s.glassY0; y <= s.glassY1; y++) {
    const hw = gHW(s, y);
    g.hline(cx - hw, cx + hw - 1, y, 'Z');
  }
  // sheen: a lit top edge and one diagonal reflection streak
  const hwTop = gHW(s, s.glassY0);
  g.hline(cx - hwTop + 1, cx + hwTop - 2, s.glassY0, 'z');
  const n = s.glassY1 - s.glassY0;
  for (let i = 1; i < Math.max(2, n - 3); i++) {
    const y = s.glassY0 + i;
    const hw = gHW(s, y);
    over(g, cx - hw + 2 + i, y, 'G', 'Zz');
    if (i < 3) over(g, cx - hw + 3 + i, y, 'z', 'ZzG');
  }
  // interior: parcel shelf + head rests
  const shelf = s.glassY1;
  const hwB = gHW(s, shelf);
  g.hline(cx - hwB + 1, cx + hwB - 2, shelf, 'K');
  if (n >= 8) {
    const hx = Math.round(hwB * 0.46);
    const top = Math.max(s.glassY0 + 3, shelf - Math.round(n * 0.4));
    for (const sx of [cx - hx - 3, cx + hx - 2]) {
      g.rect(sx, top, 5, shelf - top, 'D');
      g.hline(sx + 1, sx + 3, top, 'd');
      g.vline(sx, top + 1, shelf - 1, 'K');
    }
  }
  if (d.extra === 'vip') {
    for (let x = cx - hwB + 5; x <= cx + hwB - 6; x += 4) for (let y = s.glassY0 + 2; y < s.glassY1 - 2; y++) over(g, x, y, 'e', 'ZzG');
  }
}

/** Open roadster: tonneau, roll hoops, head rests and a windscreen frame. */
function paintCockpit(g: Grid, s: Spec): void {
  const cx = s.w >> 1;
  const y0 = s.glassY0, y1 = s.glassY1;
  const hw = s.glassHW[1];
  g.trap(cx - s.glassHW[0], cx + s.glassHW[0] - 1, y0, cx - hw, cx + hw - 1, y1, 'k');
  g.hline(cx - s.glassHW[0], cx + s.glassHW[0] - 1, y0, 'C'); // windscreen header
  for (let y = y0 + 1; y <= y1 - 2; y++) { g.px(cx - 2, y, 'D'); g.px(cx + 1, y, 'D'); }
  const hx = Math.round(hw * 0.45);
  for (const sx of [cx - hx - 3, cx + hx - 3]) {
    g.rect(sx, y1 - 5, 6, 5, 'D');
    g.hline(sx, sx + 5, y1 - 5, 'C');
    g.hline(sx + 1, sx + 4, y1 - 4, 'b');
  }
}

function paintDeck(g: Grid, s: Spec, def: VehicleDef): void {
  const cx = s.w >> 1;
  // beltline + shoulder highlight
  const hwB = halfAt(s.prof, s.belt);
  g.hline(cx - hwB + 1, cx + hwB - 2, s.belt, 'k');
  hlineOver(g, cx - hwB + 4, cx + hwB - 5, s.belt + 1, 'H', 'B');
  // shoulder crease running a little way down the flanks
  for (let y = s.belt + 2; y < Math.min(s.lampCY, s.belt + 7); y++) {
    const hw = halfAt(s.prof, y);
    over(g, cx - hw + 2, y, 'H', 'B'); over(g, cx + hw - 3, y, 'H', 'B');
  }
  // boot-lid shut lines
  const dhw = halfAt(s.prof, s.belt + 3);
  for (let y = s.belt + 2; y < s.lampCY - 2; y++) { over(g, cx - dhw + 5, y, 'b', 'B'); over(g, cx + dhw - 6, y, 'b', 'B'); }
  if ((def.details ?? {}).extra === 'midengine') {
    for (let i = 0; i < 3; i++) g.rect(cx - 12, s.belt + 3 + i * 2, 24, 1, 'k');
  }
}

function taillights(g: Grid, s: Spec, def: VehicleDef): void {
  const d = def.details ?? {};
  const cx = s.w >> 1, y = s.lampCY, o = s.lampOuter;
  const kind = d.lights ?? 'round';
  const big = s.w >= 88;
  switch (kind) {
    case 'quad': {
      const r = big ? 5 : 4;
      const a = o - r - 1, b = o - 3 * r - 3;
      for (const sgn of [-1, 1]) { roundLamp(g, cx + sgn * a, y, r); roundLamp(g, cx + sgn * b, y, r); }
      break;
    }
    case 'square':
    case 'popup': {
      const lw = Math.max(10, Math.round(s.w * 0.21)), lh = Math.max(6, Math.round(s.h * 0.11));
      boxLamp(g, cx - o, y - (lh >> 1), lw, lh, false);
      boxLamp(g, cx + o - lw, y - (lh >> 1), lw, lh, true);
      break;
    }
    case 'strip': {
      const lw = Math.max(12, Math.round(s.w * 0.27)), lh = Math.max(4, Math.round(s.h * 0.075));
      for (const sgn of [-1, 1]) {
        const x = sgn < 0 ? cx - o : cx + o - lw;
        g.box(x, y - (lh >> 1), lw, lh, 'k', 'L');
        g.hline(x + 1, x + lw - 2, y - (lh >> 1) + 1, 'j');
        g.px(sgn < 0 ? x + 1 : x + lw - 2, y - (lh >> 1) + 1, 'w');
      }
      // connecting light bar across the boot
      const inner = o - lw;
      g.hline(cx - inner + 1, cx + inner - 2, y - 1, 'J');
      g.hline(cx - inner + 1, cx + inner - 2, y, 'L');
      break;
    }
    case 'afterburner': {
      const lw = Math.max(12, Math.round(s.w * 0.2)), lh = Math.max(7, Math.round(s.h * 0.12));
      for (const sgn of [-1, 1]) {
        const x = sgn < 0 ? cx - o : cx + o - lw;
        g.box(x, y - (lh >> 1), lw, lh, 'k', 'C');
        g.rect(x + 1, y - (lh >> 1) + 1, lw - 2, lh - 2, 'e');
        for (const bx of [x + 3, x + lw - 4]) {
          g.circle(bx, y, 2, 'J'); g.circle(bx, y, 1, 'L'); g.px(bx, y, 'j'); g.px(bx - 1, y - 1, 'w');
        }
      }
      break;
    }
    default: {
      const r = big ? 5 : 4;
      for (const sgn of [-1, 1]) roundLamp(g, cx + sgn * (o - r - 1), y, r);
      break;
    }
  }
  // reflectors low on the bumper corners
  const rh = halfAt(s.prof, s.splitY + 3);
  g.rect(cx - rh + 3, s.splitY + 2, 3, 2, 'J');
  g.rect(cx + rh - 6, s.splitY + 2, 3, 2, 'J');
}

function plateNum(def: VehicleDef): string {
  const n = typeof def.num === 'number' && def.num > 0 ? def.num : (hashStr(def.id) % 89) + 10;
  return String(n % 100).padStart(2, '0');
}
/** Japanese-style plate: region glyph blocks on top, big digits below. */
function plate(g: Grid, s: Spec, def: VehicleDef): void {
  const cx = s.w >> 1;
  const pw = s.plateW, ph = s.plateH;
  const x = cx - (pw >> 1), y = s.plateCY - (ph >> 1);
  g.box(x - 1, y - 1, pw + 2, ph + 2, 'k');
  g.rect(x, y, pw, ph, 'w');
  g.hline(x, x + pw - 1, y + ph - 1, 'f');
  const marks = pw >= 22 ? 3 : 2;
  const top = ph >= 8 ? 3 : 2;
  for (let i = 0; i < marks; i++) g.rect(x + 3 + i * 4, y + 1, 2, top - 1, 'K');
  g.rect(x + pw - 5, y + 1, 3, top - 1, 'K');
  const num = plateNum(def);
  const tx = x + Math.round((pw - textW(num)) / 2) + 4;
  text(g, num, tx, y + top, 'K');
  g.px(x + 2, y + top + 3, 'K');
  g.px(x + 4, y + top + 3, 'K');
  if (pw >= 22) g.px(x + pw - 3, y + top + 3, 'r');
}

function bumper(g: Grid, s: Spec, def: VehicleDef): void {
  const cx = s.w >> 1;
  const d = def.details ?? {};
  const hw = halfAt(s.prof, s.splitY);
  g.hline(cx - hw + 1, cx + hw - 2, s.splitY, 'k');
  hlineOver(g, cx - hw + 6, cx + hw - 7, s.splitY + 1, 'h', 'B');
  // diffuser insert
  if (s.diffHW > 4) {
    const y0 = Math.min(s.bot - 1, s.splitY + 3), y1 = s.bot;
    g.rect(cx - s.diffHW, y0, s.diffHW * 2, y1 - y0 + 1, 'D');
    g.hline(cx - s.diffHW, cx + s.diffHW - 1, y0, 'd');
    for (let x = cx - s.diffHW + 4; x < cx + s.diffHW - 2; x += 5) g.vline(x, y0 + 1, y1, 'd');
  }
  // exhaust tips
  const n = d.exhaust ?? 1;
  const ey = s.bot - 2;
  const ex = Math.max(8, s.diffHW - 6);
  if (n === 1) tip(g, cx - ex, ey);
  else if (n === 2) { tip(g, cx - ex, ey); tip(g, cx + ex, ey); }
  else { tip(g, cx - ex, ey); tip(g, cx - ex + 8, ey); tip(g, cx + ex, ey); tip(g, cx + ex - 8, ey); }
  // heavy-duty bumpers
  if (d.bumper === 'bull' || d.bumper === 'ram') {
    const y = s.splitY + 2;
    g.rect(cx - hw + 1, y, (hw - 1) * 2, 2, 'C');
    g.hline(cx - hw + 2, cx + hw - 3, y, 'w');
    if (d.bumper === 'bull') for (const sx of [cx - 14, cx + 12]) g.rect(sx, y - 3, 2, 6, 'C');
  }
  if (d.bumper === 'plow') {
    for (let i = 0; i < 5; i++) {
      g.hline(cx - hw - 2 + i, cx - hw + 2 + i, s.bot - i, 'd');
      g.hline(cx + hw - 3 - i, cx + hw + 1 - i, s.bot - i, 'd');
    }
  }
}

function mirrors(g: Grid, s: Spec): void {
  const y = s.mirrorY ?? s.glassY1 - 4;
  if (y <= 0) return;
  const hw = halfAt(s.prof, y);
  const cx = s.w >> 1;
  for (const sx of [cx - hw - 3, cx + hw]) {
    g.rect(sx, y, 3, 3, 'b');
    g.px(sx + (sx < cx ? 0 : 2), y, 'H');
    g.px(sx + (sx < cx ? 0 : 2), y + 2, 'k');
  }
}

function spoiler(g: Grid, s: Spec, def: VehicleDef): void {
  const d = def.details ?? {};
  const kind = d.spoiler ?? 'none';
  const cx = s.w >> 1;
  const lampTop = s.lampCY - Math.round(s.h * 0.08);
  const dhw = halfAt(s.prof, lampTop);
  switch (kind) {
    case 'lip':
      hlineOver(g, cx - dhw + 3, cx + dhw - 4, lampTop - 2, 'h', 'BH');
      hlineOver(g, cx - dhw + 2, cx + dhw - 3, lampTop - 1, 'k', 'BHh');
      break;
    case 'ducktail':
      hlineOver(g, cx - dhw + 3, cx + dhw - 4, lampTop - 4, 'H', 'BH');
      hlineOver(g, cx - dhw + 2, cx + dhw - 3, lampTop - 3, 'B', 'BH');
      hlineOver(g, cx - dhw + 2, cx + dhw - 3, lampTop - 2, 'b', 'BH');
      hlineOver(g, cx - dhw + 2, cx + dhw - 3, lampTop - 1, 'k', 'BHb');
      break;
    case 'wing':
    case 'bigwing': {
      const big = kind === 'bigwing';
      const hw = Math.min(cx - 2, big ? Math.round(s.w * 0.46) : Math.round(s.w * 0.37));
      const y = big ? 0 : 1;
      const th = big ? 4 : 3;
      g.rect(cx - hw, y, hw * 2, th, 'B');
      g.hline(cx - hw, cx + hw - 1, y, 'H');
      g.hline(cx - hw, cx + hw - 1, y + th - 1, 'b');
      const standTop = y + th;
      const standBot = big ? s.belt - 1 : s.glassY0 + 4;
      const sxo = Math.max(6, hw - Math.round(s.w * 0.1));
      for (const sx of [cx - sxo, cx + sxo - 2]) {
        g.rect(sx, standTop, 2, standBot - standTop + 1, 'b');
        g.vline(sx + (sx < cx ? 0 : 1), standTop, standBot, 'k');
        if (big) g.px(sx, standTop, 'H');
      }
      if (big) {
        for (const sx of [cx - hw, cx + hw - 2]) { g.rect(sx, y, 2, th + 4, 'A'); g.px(sx, y, 'w'); }
        g.rect(cx - hw + 2, y + th, hw * 2 - 4, 1, 'b');
      }
      g.rect(cx - 3, y + 1, 6, 1, 'j'); // third brake light
      break;
    }
    default:
      break;
  }
}

function stripes(g: Grid, s: Spec, def: VehicleDef): void {
  const d = def.details ?? {};
  const cx = s.w >> 1;
  switch (d.stripe) {
    case 'center':
      for (let y = s.roofTop; y <= s.bot; y++) {
        for (const x of [cx - 4, cx - 3, cx + 2, cx + 3]) over(g, x, y, 'A', 'BbHh');
      }
      break;
    case 'side':
      for (let y = s.belt + 3; y <= s.belt + 5; y++) {
        const hw = halfAt(s.prof, y);
        hlineOver(g, cx - hw + 1, cx - hw + 9, y, 'A', 'BbHh');
        hlineOver(g, cx + hw - 10, cx + hw - 2, y, 'A', 'BbHh');
      }
      break;
    case 'double': {
      const hw = halfAt(s.prof, s.belt + 3);
      hlineOver(g, cx - hw + 2, cx + hw - 3, s.belt + 3, 'A', 'BbHh');
      hlineOver(g, cx - hw + 2, cx + hw - 3, s.belt + 5, 'A', 'BbHh');
      break;
    }
    case 'checker': {
      const y0 = s.plateCY - 6;
      for (let y = y0; y < y0 + 4; y++) {
        const hw = halfAt(s.prof, y);
        for (let x = cx - hw + 2; x <= cx + hw - 3; x++) over(g, x, y, ((x >> 1) + (y >> 1)) & 1 ? 'w' : 'A', 'BbHh');
      }
      break;
    }
    case 'flames': {
      const fl = ['...o.....o..', '..ooy...ooy.', '.oooyy.ooyy.', 'ooooyyyoyyyo'];
      const y0 = s.splitY - 5;
      for (const sgn of [-1, 1]) {
        const hw = halfAt(s.prof, y0 + 2);
        for (let j = 0; j < fl.length; j++) for (let i = 0; i < fl[j].length; i++) {
          const c = fl[j][i];
          if (c === '.') continue;
          const x = sgn < 0 ? cx - hw + 2 + i : cx + hw - 3 - i;
          over(g, x, y0 + j, c === 'o' ? 'A' : 'y', 'BbHhN');
        }
      }
      break;
    }
    default:
      break;
  }
}

function roofKit(g: Grid, s: Spec, def: VehicleDef): void {
  const d = def.details ?? {};
  const cx = s.w >> 1;
  const hw = halfAt(s.prof, s.roofTop);
  switch (d.roof) {
    case 'lightbar': {
      const bw = Math.round(hw * 1.5);
      const y = s.roofTop - 4;
      g.rect(cx - (bw >> 1), y, bw, 3, 'D');
      g.rect(cx - (bw >> 1), y, Math.round(bw * 0.33), 2, 'u');
      g.rect(cx + (bw >> 1) - Math.round(bw * 0.33), y, Math.round(bw * 0.33), 2, 'u');
      g.rect(cx - 3, y, 6, 2, 'w');
      g.hline(cx - (bw >> 1) + 1, cx + (bw >> 1) - 2, y + 2, 'k');
      break;
    }
    case 'rack': {
      const y = s.roofTop - 2;
      g.hline(cx - hw + 3, cx + hw - 4, y, 'd');
      g.hline(cx - hw + 3, cx + hw - 4, y + 1, 'e');
      for (let x = cx - hw + 5; x < cx + hw - 4; x += 6) g.px(x, y + 2, 'd');
      break;
    }
    case 'targa':
      for (let y = s.roofTop; y < s.glassY0 - 1; y++) {
        const rh = halfAt(s.prof, y);
        hlineOver(g, cx - rh + 2, cx + rh - 3, y, 'A', 'BbHh');
      }
      break;
    default:
      break;
  }
  if (def.body === 'taxi') {
    const y = s.roofTop - 5;
    g.box(cx - 9, y, 18, 5, 'k', 'y');
    text(g, 'TAXI', cx - 8, y + 1, 'K');
  }
}

function badge(g: Grid, s: Spec, def: VehicleDef): void {
  const cx = s.w >> 1, y = s.lampCY;
  const tag = (def.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
  const c = inkOn(def.palette.body);
  if (s.w >= 80 && tag) {
    g.ellipse(cx - 7, y, 3, 2, 'C');
    g.ellipse(cx - 7, y, 2, 1, 'D');
    g.px(cx - 8, y - 1, 'w');
    text(g, tag, cx - 1, y - 2, c === 'K' ? 'K' : 'C');
  } else {
    g.ellipse(cx, y, 3, 2, 'C');
    g.ellipse(cx, y, 2, 1, 'D');
  }
}

function numberDecal(g: Grid, s: Spec, n: number): void {
  const cx = s.w >> 1;
  const str = String(n);
  const w = textW(str) + 4;
  const y = s.open ? s.belt + 3 : s.glassY0 + Math.max(2, Math.round((s.glassY1 - s.glassY0) / 2) - 3);
  g.box(cx - (w >> 1) - 1, y - 1, w + 2, 9, 'k', 'w');
  text(g, str, cx - (w >> 1) + 2, y + 1, 'K');
}

function decorate(g: Grid, s: Spec, def: VehicleDef): void {
  const d: VehicleDetails = def.details ?? {};
  const x = d.extra ?? '';
  const cx = s.w >> 1;
  if (x === 'panda') {
    for (let y = s.belt + 4; y <= s.bot; y++) {
      const hw = halfAt(s.prof, y);
      hlineOver(g, cx - hw, cx + hw - 1, y, 'A', 'BbHhN');
    }
  }
  if (x === 'blackroof') {
    for (let y = s.roofTop; y <= s.glassY0; y++) {
      const hw = halfAt(s.prof, y);
      hlineOver(g, cx - hw, cx + hw - 1, y, 'A', 'BbHh');
    }
  }
  if (x === 'wide') {
    for (let y = s.belt + 2; y <= s.splitY - 1; y++) {
      const hw = halfAt(s.prof, y);
      over(g, cx - hw + 1, y, 'h', 'Bb'); over(g, cx + hw - 2, y, 'h', 'Bb');
    }
  }
  if (x === 'vip' || x === 'classic') {
    const hw = halfAt(s.prof, s.belt);
    hlineOver(g, cx - hw + 2, cx + hw - 3, s.belt - 1, 'C', 'BbHhk');
    const yy = s.splitY + 2;
    const bh = halfAt(s.prof, yy);
    g.rect(cx - bh + 2, yy, (bh - 2) * 2, 2, 'C');
    g.hline(cx - bh + 3, cx + bh - 4, yy + 1, 'e');
  }
  if (x === 'neon') {
    const y = s.bot + 1;
    for (let i = 0; i < 2; i++) {
      const hw = halfAt(s.prof, s.bot) - 4 - i * 3;
      g.hline(cx - hw, cx + hw - 1, y - i, i === 0 ? 'A' : 'c');
    }
    const hb = halfAt(s.prof, s.belt);
    hlineOver(g, cx - hb + 2, cx + hb - 3, s.belt + 1, 'A', 'BbHh');
    for (let px = cx - hb + 4; px < cx + hb - 4; px += 4) over(g, px, s.splitY + 1, 'c', 'BbHhk');
  }
  if (x === 'polizei') {
    const hw = halfAt(s.prof, s.belt + 3);
    for (let y = s.belt + 3; y <= s.belt + 7; y++) hlineOver(g, cx - hw, cx + hw - 1, y, 'A', 'BbHh');
    if (s.w >= 88) text(g, 'POLIZEI', cx - 13, s.glassY0 + 4, 'w');
  }
  if (x === 'sakura') {
    sakura(g, cx - 18, s.belt + 8);
    sakura(g, cx + 16, s.belt + 12);
    sakura(g, cx - 10, s.belt + 16);
  }
  if (x === 'hydraulics') {
    const y = s.bot + 3;
    g.rect(cx - 34, y, 68, 2, 'C');
    g.hline(cx - 33, cx + 32, y, 'w');
    for (const sx of [cx - 30, cx + 28]) { g.rect(sx, s.bot - 1, 2, 6, 'C'); g.px(sx, s.bot + 4, 'e'); }
    g.ellipse(cx, y + 1, 5, 3, 'd'); g.ellipse(cx, y + 1, 3, 2, 'e');
  }
  stripes(g, s, def);
  taillights(g, s, def);
  badge(g, s, def);
  plate(g, s, def);
  bumper(g, s, def);
  spoiler(g, s, def);
  roofKit(g, s, def);
  mirrors(g, s);
  if (d.number !== undefined) numberDecal(g, s, d.number);
}

function carGrid(def: VehicleDef): Grid {
  const s = carSpec(def);
  const g = new Grid(s.w, s.h);
  const cx = s.w >> 1;
  // tyres first — the body is painted over them
  tyre(g, cx - s.tyreOuter, s.tyreTop, s.h - 1, s.tyreW, 1);
  tyre(g, cx + s.tyreOuter - s.tyreW, s.tyreTop, s.h - 1, s.tyreW, -1);
  paintBody(g, s);
  paintGlass(g, s, def);
  paintDeck(g, s, def);
  if (def.body === 'pickup') {
    // tailgate: seam + handle + bed rail
    const hw = halfAt(s.prof, s.belt + 2);
    g.hline(cx - hw + 1, cx + hw - 2, s.belt + 1, 'H');
    g.hline(cx - hw + 2, cx + hw - 3, s.lampCY - 10, 'k');
    g.rect(cx - 6, s.lampCY - 8, 12, 2, 'b');
    g.hline(cx - 6, cx + 5, s.lampCY - 8, 'C');
  }
  if (def.body === 'van') {
    // twin rear doors + handles
    g.vline(cx - 1, s.belt + 2, s.splitY - 1, 'k');
    g.vline(cx, s.belt + 2, s.splitY - 1, 'D');
    g.rect(cx - 5, s.lampCY + 2, 3, 2, 'C');
    g.rect(cx + 2, s.lampCY + 2, 3, 2, 'C');
  }
  if (def.body === 'limo') {
    // long roof: side glass receding toward the horizon
    for (let y = s.roofTop + 3; y < s.glassY0 - 2; y++) {
      const hw = halfAt(s.prof, y);
      g.px(cx - hw + 1, y, 'Z'); g.px(cx - hw + 2, y, 'Z');
      g.px(cx + hw - 2, y, 'Z'); g.px(cx + hw - 3, y, 'Z');
      if (y % 6 === 0) { g.px(cx - hw + 1, y, 'k'); g.px(cx + hw - 2, y, 'k'); }
    }
  }
  if (def.body === 'lowrider') {
    // exposed chrome axle + trailing arms under the raised body
    g.rect(cx - 28, s.bot + 5, 56, 3, 'd');
    g.hline(cx - 28, cx + 27, s.bot + 5, 'e');
    g.ellipse(cx, s.bot + 6, 5, 4, 'C'); g.ellipse(cx, s.bot + 6, 3, 2, 'e');
  }
  decorate(g, s, def);
  return g;
}

// ── heavies ──────────────────────────────────────────────────────────────────
/** Marker lamps along an edge. */
function markers(g: Grid, x0: number, x1: number, y: number, step: number): void {
  for (let x = x0; x <= x1; x += step) g.px(x, y, (x - x0) % (step * 2) ? 'y' : 'o');
}

function truckGrid(def: VehicleDef): Grid {
  const d = def.details ?? {};
  const deko = d.extra === 'neon';
  const w = 120, h = 120, cx = w >> 1;
  const g = new Grid(w, h);
  // dual rear wheels
  for (const sgn of [-1, 1]) {
    const x = sgn < 0 ? cx - 52 : cx + 30;
    tyre(g, x, 92, h - 1, 10, sgn);
    tyre(g, x + 11, 92, h - 1, 10, sgn);
  }
  // chassis + mud flaps
  g.rect(cx - 50, 88, 100, 10, 'D');
  for (const sgn of [-1, 1]) {
    const x = sgn < 0 ? cx - 54 : cx + 46;
    g.rect(x, 96, 8, 18, 'K');
    g.hline(x, x + 7, 96, 'd');
    text(g, deko ? '8' : '4', x + 2, 102, 'e');
  }
  // trailer box
  const bx = cx - 56, bw = 112;
  g.rect(bx, 4, bw, 84, 'B');
  g.hline(bx + 2, bx + bw - 3, 2, 'H');
  g.hline(bx + 1, bx + bw - 2, 3, 'H');
  g.rect(bx, 2, 2, 2, '.'); g.rect(bx + bw - 2, 2, 2, 2, '.');
  for (let y = 4; y <= 87; y++) { g.px(bx, y, 'b'); g.px(bx + 1, y, 'b'); g.px(bx + bw - 1, y, 'b'); g.px(bx + bw - 2, y, 'b'); }
  // roller-door ribs + centre seam
  for (let y = 10; y < 84; y += 6) g.hline(bx + 3, bx + bw - 4, y, 'b');
  g.vline(cx - 1, 5, 86, 'k'); g.vline(cx, 5, 86, 'N');
  for (const sx of [bx + 4, bx + bw - 6]) { g.vline(sx, 8, 84, 'b'); for (let y = 12; y < 84; y += 12) g.rect(sx - 1, y, 3, 3, 'd'); }
  g.rect(cx - 6, 44, 5, 14, 'd'); g.rect(cx + 2, 44, 5, 14, 'd');
  g.hline(cx - 6, cx - 2, 44, 'e'); g.hline(cx + 2, cx + 6, 44, 'e');
  // livery
  if (deko) {
    for (let y = 12; y < 84; y += 10) { g.hline(bx + 3, bx + bw - 4, y, 'A'); for (let x = bx + 4; x < bx + bw - 4; x += 3) g.px(x, y + 1, 'c'); }
    g.box(bx + 2, 6, bw - 4, 80, 'C');
    markers(g, bx + 4, bx + bw - 5, 5, 4);
    text(g, 'DEKO', cx - 24, 60, 'x');
    text(g, 'TORA', cx + 4, 60, 'x');
  } else {
    g.hline(bx + 3, bx + bw - 4, 30, 'A'); g.hline(bx + 3, bx + bw - 4, 31, 'A');
    g.hline(bx + 3, bx + bw - 4, 62, 'A'); g.hline(bx + 3, bx + bw - 4, 63, 'A');
    markers(g, bx + 6, bx + bw - 7, 5, 8);
  }
  // ICC bar, lights, plate
  g.rect(cx - 44, 100, 88, 4, 'C');
  g.hline(cx - 43, cx + 42, 100, 'w');
  for (const sgn of [-1, 1]) {
    const x = sgn < 0 ? cx - 42 : cx + 22;
    boxLamp(g, x, 90, 20, 8, sgn < 0);
  }
  const s: Spec = { ...carSpec(def), w, h, plateCY: 106, plateW: 26, plateH: 8 };
  plate(g, s, def);
  if (d.bumper === 'bull') { g.rect(cx - 48, 96, 96, 3, 'C'); g.hline(cx - 47, cx + 46, 96, 'w'); }
  // stacks peeking over the box
  for (const sx of [bx + 6, bx + bw - 9]) { g.rect(sx, 0, 3, 6, 'C'); g.px(sx, 0, 'e'); }
  return g;
}

function busGrid(def: VehicleDef): Grid {
  const d = def.details ?? {};
  const w = 116, h = 116, cx = w >> 1;
  const g = new Grid(w, h);
  const neon = d.extra === 'neon';
  for (const sgn of [-1, 1]) tyre(g, sgn < 0 ? cx - 50 : cx + 32, 92, h - 1, 18, sgn);
  // body
  const bx = cx - 56, bw = 112;
  g.rect(bx, 4, bw, 94, 'B');
  g.hline(bx + 3, bx + bw - 4, 2, 'H'); g.hline(bx + 1, bx + bw - 2, 3, 'H');
  g.rect(bx, 2, 3, 2, '.'); g.rect(bx + bw - 3, 2, 3, 2, '.');
  for (let y = 4; y <= 97; y++) { g.px(bx, y, 'b'); g.px(bx + 1, y, 'b'); g.px(bx + bw - 1, y, 'b'); g.px(bx + bw - 2, y, 'b'); }
  // rear window band
  g.rect(bx + 6, 12, bw - 12, 34, 'k');
  g.rect(bx + 8, 14, bw - 16, 30, 'Z');
  g.hline(bx + 9, bx + bw - 10, 14, 'G');
  for (let i = 0; i < 10; i++) g.px(bx + 11 + i, 17 + i, 'z');
  for (let x = bx + 26; x < bx + bw - 20; x += 24) g.vline(x, 14, 43, 'k');
  // engine hatch + louvres
  g.rect(bx + 16, 56, bw - 32, 24, 'b');
  g.box(bx + 16, 56, bw - 32, 24, 'k');
  for (let y = 60; y < 78; y += 4) g.hline(bx + 20, bx + bw - 21, y, 'D');
  g.rect(cx - 3, 66, 6, 3, 'C');
  // destination panel
  g.box(bx + 34, 48, 44, 7, 'k', 'D');
  text(g, String((typeof def.num === 'number' ? def.num : 7) % 100).padStart(2, '0'), bx + 48, 49, 'y');
  // lights + bumper
  for (const sgn of [-1, 1]) boxLamp(g, sgn < 0 ? bx + 4 : bx + bw - 26, 82, 22, 9, sgn < 0);
  g.rect(bx, 94, bw, 4, 'D');
  g.hline(bx + 1, bx + bw - 2, 94, 'd');
  const s: Spec = { ...carSpec(def), w, h, plateCY: 90, plateW: 24, plateH: 8 };
  plate(g, s, def);
  if (neon) {
    g.box(bx + 3, 7, bw - 6, 88, 'A');
    for (let x = bx + 5; x < bx + bw - 4; x += 4) { g.px(x, 8, 'c'); g.px(x, 93, 'm'); }
    for (let y = 12; y < 90; y += 6) { g.px(bx + 4, y, 'm'); g.px(bx + bw - 5, y, 'c'); }
    g.hline(bx + 8, bx + bw - 9, 99, 'm'); g.hline(bx + 14, bx + bw - 15, 100, 'c');
  } else if (d.stripe === 'side' || d.stripe === 'double') {
    g.hline(bx + 2, bx + bw - 3, 50, 'A'); g.hline(bx + 2, bx + bw - 3, 51, 'A');
  }
  markers(g, bx + 8, bx + bw - 9, 5, 10);
  return g;
}

function tramGrid(def: VehicleDef): Grid {
  const w = 112, h = 122, cx = w >> 1;
  const g = new Grid(w, h);
  // bogies
  for (const sgn of [-1, 1]) tyre(g, sgn < 0 ? cx - 40 : cx + 26, 104, h - 1, 14, sgn);
  const bx = cx - 52, bw = 104;
  g.rect(bx, 12, bw, 96, 'B');
  g.hline(bx + 3, bx + bw - 4, 10, 'H'); g.hline(bx + 1, bx + bw - 2, 11, 'H');
  g.rect(bx, 10, 3, 2, '.'); g.rect(bx + bw - 3, 10, 3, 2, '.');
  for (let y = 12; y <= 107; y++) { g.px(bx, y, 'b'); g.px(bx + 1, y, 'b'); g.px(bx + bw - 1, y, 'b'); g.px(bx + bw - 2, y, 'b'); }
  // destination sign
  g.box(bx + 26, 14, 52, 8, 'k', 'D');
  text(g, 'TRAM', bx + 34, 15, 'y');
  // big rear window
  g.rect(bx + 6, 26, bw - 12, 40, 'k');
  g.rect(bx + 8, 28, bw - 16, 36, 'Z');
  g.hline(bx + 9, bx + bw - 10, 28, 'G');
  for (let i = 0; i < 12; i++) g.px(bx + 12 + i, 31 + i, 'z');
  g.vline(cx - 1, 28, 63, 'k');
  // livery band + doors
  g.hline(bx + 2, bx + bw - 3, 70, 'A'); g.hline(bx + 2, bx + bw - 3, 71, 'A'); g.hline(bx + 2, bx + bw - 3, 72, 'A');
  for (const sx of [bx + 10, bx + bw - 22]) { g.box(sx, 74, 12, 26, 'k', 'b'); g.rect(sx + 2, 76, 8, 10, 'Z'); }
  // coupler + skirt
  g.rect(bx, 100, bw, 8, 'D');
  g.rect(cx - 7, 106, 14, 8, 'd'); g.rect(cx - 4, 110, 8, 5, 'e');
  for (const sgn of [-1, 1]) boxLamp(g, sgn < 0 ? bx + 6 : bx + bw - 24, 88, 18, 8, sgn < 0);
  // pantograph
  g.line(cx - 18, 10, cx - 2, 2, 'd'); g.line(cx + 17, 10, cx + 1, 2, 'd');
  g.line(cx - 18, 10, cx - 12, 6, 'e'); g.hline(cx - 14, cx + 13, 1, 'e');
  g.hline(cx - 16, cx + 15, 0, 'd');
  g.rect(cx - 20, 9, 6, 3, 'd'); g.rect(cx + 15, 9, 6, 3, 'd');
  const s: Spec = { ...carSpec(def), w, h, plateCY: 96, plateW: 22, plateH: 8 };
  plate(g, s, def);
  return g;
}

function firetruckGrid(def: VehicleDef): Grid {
  const w = 118, h = 124, cx = w >> 1;
  const g = new Grid(w, h);
  for (const sgn of [-1, 1]) {
    const x = sgn < 0 ? cx - 52 : cx + 30;
    tyre(g, x, 98, h - 1, 11, sgn);
    tyre(g, x + 12, 98, h - 1, 10, sgn);
  }
  const bx = cx - 54, bw = 108;
  g.rect(bx, 26, bw, 78, 'B');
  g.hline(bx + 3, bx + bw - 4, 24, 'H'); g.hline(bx + 1, bx + bw - 2, 25, 'H');
  for (let y = 26; y <= 103; y++) { g.px(bx, y, 'b'); g.px(bx + 1, y, 'b'); g.px(bx + bw - 1, y, 'b'); g.px(bx + bw - 2, y, 'b'); }
  // equipment shutters
  for (let i = 0; i < 3; i++) {
    const x = bx + 6 + i * 34;
    g.box(x, 44, 30, 30, 'k', 'b');
    for (let y = 47; y < 72; y += 3) g.hline(x + 2, x + 27, y, 'H');
    g.rect(x + 12, 70, 6, 2, 'C');
  }
  // red / white chevrons on the lower panel
  for (let x = bx + 2; x < bx + bw - 2; x++) {
    for (let y = 78; y < 96; y++) {
      const t = ((x - bx) + (y - 78) * 2) % 16;
      if (t < 8) over(g, x, y, 'A', 'BbHhN');
    }
  }
  // ladder rising toward the horizon (perspective)
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const off = Math.round(22 - t * 12);
    const y = 28 - i;
    g.px(cx - off, y, 'C'); g.px(cx - off + 1, y, 'e');
    g.px(cx + off - 1, y, 'C'); g.px(cx + off - 2, y, 'e');
    if (i % 3 === 0) g.hline(cx - off + 2, cx + off - 3, y, 'd');
  }
  g.rect(cx - 26, 28, 52, 6, 'd'); g.hline(cx - 25, cx + 24, 28, 'e');
  g.ellipse(cx, 31, 8, 3, 'e');
  // blue beacons + lightbar
  for (const sx of [bx + 4, bx + bw - 10]) { g.rect(sx, 20, 6, 5, 'u'); g.rect(sx + 1, 20, 4, 2, 'w'); }
  g.rect(cx - 12, 36, 24, 4, 'D'); g.rect(cx - 10, 37, 6, 2, 'u'); g.rect(cx + 4, 37, 6, 2, 'u');
  // lights, step bumper, plate
  for (const sgn of [-1, 1]) boxLamp(g, sgn < 0 ? bx + 2 : bx + bw - 22, 96, 20, 8, sgn < 0);
  g.rect(bx + 6, 104, bw - 12, 5, 'C');
  g.hline(bx + 7, bx + bw - 8, 104, 'w');
  for (let x = bx + 10; x < bx + bw - 10; x += 6) g.px(x, 107, 'e');
  const s: Spec = { ...carSpec(def), w, h, plateCY: 100, plateW: 24, plateH: 8 };
  plate(g, s, def);
  g.circle(cx, 88, 7, 'd'); g.circle(cx, 88, 5, 'e'); g.circle(cx, 88, 2, 'd');
  return g;
}

function tankGrid(def: VehicleDef): Grid {
  const d = def.details ?? {};
  const w = 120, h = 104, cx = w >> 1;
  const g = new Grid(w, h);
  // tracks
  for (const sgn of [-1, 1]) {
    const x = sgn < 0 ? cx - 58 : cx + 34;
    g.rect(x, 52, 24, h - 52, 'K');
    g.vline(x, 52, h - 1, 'D'); g.vline(x + 23, 52, h - 1, 'D');
    for (let y = 55; y < h; y += 3) { g.hline(x + 1, x + 22, y, 'd'); g.hline(x + 1, x + 22, y + 1, 'D'); }
    // rear sprocket
    g.circle(x + 11, h - 13, 10, 'D'); g.circle(x + 11, h - 13, 7, 'd'); g.circle(x + 11, h - 13, 3, 'e');
    for (let a = 0; a < 10; a++) {
      const t = (a / 10) * Math.PI * 2;
      g.px(x + 11 + Math.round(Math.cos(t) * 9), h - 13 + Math.round(Math.sin(t) * 9), 'e');
    }
  }
  // hull rear + fenders over the tracks
  g.rect(cx - 36, 46, 72, 46, 'B');
  g.rect(cx - 58, 44, 116, 8, 'b');
  g.hline(cx - 58, cx + 57, 44, 'H');
  g.hline(cx - 58, cx + 57, 51, 'k');
  g.hline(cx - 36, cx + 35, 46, 'H');
  for (let y = 46; y <= 92; y++) { g.px(cx - 36, y, 'b'); g.px(cx + 35, y, 'b'); }
  g.rect(cx - 36, 88, 72, 5, 'b');
  // engine deck louvres + exhaust grille
  g.box(cx - 30, 54, 60, 24, 'k');
  for (let y = 57; y < 77; y += 3) { g.hline(cx - 28, cx + 27, y, 'N'); g.hline(cx - 28, cx + 27, y + 1, 'b'); }
  g.box(cx - 12, 80, 24, 9, 'k', 'D');
  for (let x = cx - 9; x < cx + 10; x += 3) g.vline(x, 81, 87, 'd');
  // tow hooks, shackles, lights
  for (const sgn of [-1, 1]) {
    g.rect(cx + sgn * 30 - 3, 84, 6, 5, 'd'); g.rect(cx + sgn * 30 - 2, 85, 4, 3, 'K');
    g.rect(sgn < 0 ? cx - 34 : cx + 28, 48, 6, 5, 'k');
    g.rect(sgn < 0 ? cx - 33 : cx + 29, 49, 4, 3, 'L');
    g.px(sgn < 0 ? cx - 33 : cx + 29, 49, 'j');
  }
  // turret
  g.trap(cx - 22, cx + 21, 16, cx - 30, cx + 29, 46, 'B');
  g.hline(cx - 22, cx + 21, 16, 'H');
  for (let y = 16; y <= 46; y++) { const t = (y - 16) / 30; const hw = Math.round(22 + t * 8); g.px(cx - hw, y, 'b'); g.px(cx + hw - 1, y, 'b'); }
  // stowage basket on the turret bustle
  g.box(cx - 26, 32, 52, 14, 'k', 'd');
  for (let x = cx - 24; x < cx + 24; x += 4) g.vline(x, 33, 44, 'D');
  for (let y = 35; y < 46; y += 4) g.hline(cx - 25, cx + 24, y, 'D');
  // cupola, hatches, MG, antennas
  g.ellipse(cx - 11, 22, 7, 4, 'b'); g.ellipse(cx - 11, 22, 5, 2, 'B'); g.hline(cx - 15, cx - 7, 20, 'H');
  g.ellipse(cx + 12, 23, 6, 3, 'b'); g.ellipse(cx + 12, 23, 4, 1, 'B');
  g.rect(cx - 17, 15, 9, 4, 'd'); g.rect(cx - 16, 12, 4, 4, 'D'); g.rect(cx - 18, 13, 8, 2, 'd');
  for (const sx of [cx - 28, cx + 26]) { g.vline(sx, 2, 18, 'd'); g.px(sx, 2, 'e'); }
  g.rect(cx - 30, 26, 10, 4, 'd'); g.rect(cx + 20, 26, 10, 4, 'd');
  // barrel pointing down the lane (foreshortened) + muzzle brake
  const by = d.extra === 'cannonLong' ? 0 : 8;
  g.trap(cx - 3, cx + 2, by + 3, cx - 5, cx + 4, 22, 'b');
  g.vline(cx - 3, by + 3, 22, 'd'); g.vline(cx + 2, by + 3, 22, 'N');
  g.rect(cx - 5, by, 10, 4, 'd'); g.box(cx - 5, by, 10, 4, 'k');
  g.rect(cx - 3, by + 1, 6, 2, 'K');
  g.rect(cx - 7, 20, 14, 5, 'b'); g.hline(cx - 7, cx + 6, 20, 'H'); g.hline(cx - 7, cx + 6, 24, 'k');
  // camo patches
  g.ellipse(cx - 24, 62, 8, 4, 'A'); g.ellipse(cx + 22, 84, 7, 3, 'A');
  g.ellipse(cx + 16, 28, 6, 3, 'A'); g.ellipse(cx - 16, 40, 5, 2, 'A');
  if (d.number !== undefined) {
    const str = String(d.number).slice(0, 2);
    g.box(cx - 24, 48, textW(str) + 5, 9, 'k', 'w');
    text(g, str, cx - 22, 50, 'K');
  }
  if (d.bumper === 'plow') {
    for (let i = 0; i < 7; i++) {
      g.hline(cx - 58 + i, cx - 48 + i, 96 - i, i % 2 ? 'e' : 'd');
      g.hline(cx + 47 - i, cx + 57 - i, 96 - i, i % 2 ? 'e' : 'd');
    }
  }
  return g;
}

function apcGrid(def: VehicleDef): Grid {
  const d = def.details ?? {};
  const w = 112, h = 96, cx = w >> 1;
  const g = new Grid(w, h);
  // hull: sloped armour, wider at the bottom
  g.trap(cx - 32, cx + 31, 20, cx - 42, cx + 41, 78, 'B');
  g.hline(cx - 32, cx + 31, 20, 'H');
  for (let y = 20; y <= 78; y++) {
    const hw = Math.round(32 + ((y - 20) / 58) * 10);
    g.px(cx - hw, y, 'b'); g.px(cx - hw + 1, y, 'b'); g.px(cx + hw - 1, y, 'b'); g.px(cx + hw - 2, y, 'b');
  }
  g.rect(cx - 42, 74, 84, 5, 'b');
  // rear ramp, vision block, grab handles
  g.box(cx - 22, 28, 44, 46, 'k', 'b');
  g.hline(cx - 21, cx + 20, 29, 'H');
  g.rect(cx - 9, 33, 18, 9, 'k'); g.rect(cx - 8, 34, 16, 7, 'Z'); g.px(cx - 7, 35, 'z'); g.px(cx - 6, 36, 'z');
  g.rect(cx - 3, 58, 7, 3, 'd'); g.px(cx - 3, 58, 'e');
  for (let y = 46; y < 72; y += 6) { g.hline(cx - 18, cx - 12, y, 'd'); g.hline(cx + 11, cx + 17, y, 'd'); }
  // stowage bin + spare wheel + accent band
  g.box(cx - 40, 30, 15, 13, 'k', 'b'); g.hline(cx - 39, cx - 26, 31, 'H');
  g.circle(cx + 32, 37, 8, 'K'); g.circle(cx + 32, 37, 5, 'W'); g.circle(cx + 32, 37, 2, 'C');
  g.hline(cx - 40, cx + 39, 68, 'A'); g.hline(cx - 40, cx + 39, 69, 'A');
  // six wheels — the far axles ride smaller and higher (perspective)
  for (const sgn of [-1, 1]) {
    const out = (o: number, wd: number): number => (sgn < 0 ? cx - o : cx + o - wd);
    tyre(g, out(44, 10), 54, 80, 10, sgn);
    tyre(g, out(47, 12), 58, 86, 12, sgn);
    tyre(g, out(50, 14), 62, h - 1, 14, sgn);
  }
  // turret + gatling pointing down the lane
  g.trap(cx - 14, cx + 13, 6, cx - 18, cx + 17, 24, 'B');
  g.hline(cx - 14, cx + 13, 6, 'H');
  g.vline(cx - 18, 20, 24, 'b'); g.vline(cx + 17, 20, 24, 'b');
  g.rect(cx - 7, 0, 14, 8, 'd'); g.box(cx - 7, 0, 14, 8, 'k');
  for (let i = 0; i < 4; i++) g.vline(cx - 5 + i * 3, 1, 6, i % 2 ? 'D' : 'e');
  g.rect(cx + 9, 10, 9, 7, 'b'); g.box(cx + 9, 10, 9, 7, 'k');
  g.vline(cx + 20, 2, 14, 'd');
  // lights + plate
  for (const sgn of [-1, 1]) boxLamp(g, sgn < 0 ? cx - 40 : cx + 24, 52, 16, 7, sgn < 0);
  const s: Spec = { ...carSpec(def), w, h, plateCY: 66, plateW: 22, plateH: 8 };
  plate(g, s, def);
  if (d.bumper === 'bull') { g.rect(cx - 42, 79, 84, 4, 'C'); g.hline(cx - 41, cx + 40, 79, 'w'); for (const sx of [cx - 14, cx + 12]) g.rect(sx, 75, 2, 9, 'C'); }
  return g;
}

function monsterGrid(def: VehicleDef): Grid {
  const d = def.details ?? {};
  const w = 120, h = 116, cx = w >> 1;
  const g = new Grid(w, h);
  // live axle, differential, shocks — drawn first so the tyres cap its ends
  g.rect(cx - 42, 88, 84, 7, 'd');
  g.hline(cx - 42, cx + 41, 88, 'e');
  g.hline(cx - 42, cx + 41, 94, 'D');
  g.ellipse(cx, 91, 10, 8, 'd'); g.ellipse(cx, 91, 7, 6, 'e'); g.ellipse(cx, 91, 3, 3, 'd');
  for (const sx of [cx - 30, cx + 28]) {
    g.rect(sx, 62, 3, 28, 'e');
    for (let y = 66; y < 88; y += 4) g.rect(sx, y, 3, 2, 'd');
  }
  // body: cab + bed sitting high over the axle
  g.rect(cx - 28, 14, 56, 26, 'B');
  g.hline(cx - 27, cx + 26, 13, 'H');
  g.rect(cx - 23, 17, 46, 15, 'k'); g.rect(cx - 21, 19, 42, 11, 'Z');
  g.hline(cx - 20, cx + 19, 19, 'z');
  for (let i = 0; i < 7; i++) g.px(cx - 17 + i, 21 + i, 'G');
  g.rect(cx - 19, 26, 8, 6, 'D'); g.rect(cx + 12, 26, 8, 6, 'D');
  g.rect(cx - 36, 40, 72, 48, 'B');
  g.hline(cx - 35, cx + 34, 39, 'H'); g.hline(cx - 35, cx + 34, 40, 'h');
  for (let y = 40; y <= 88; y++) { g.px(cx - 36, y, 'b'); g.px(cx - 35, y, 'b'); g.px(cx + 34, y, 'b'); g.px(cx + 35, y, 'b'); }
  g.rect(cx - 36, 83, 72, 5, 'b');
  g.hline(cx - 34, cx + 33, 56, 'k'); // tailgate seam
  g.rect(cx - 7, 58, 14, 3, 'C'); g.hline(cx - 7, cx + 6, 58, 'w');
  // giant tyres
  for (const sgn of [-1, 1]) {
    const wx = cx + sgn * 39;
    g.circle(wx, 96, 19, 'K');
    for (let a = 0; a < 22; a++) {
      const t = (a / 22) * Math.PI * 2;
      const c = a % 2 ? 'D' : 'd';
      g.px(wx + Math.round(Math.cos(t) * 18), 96 + Math.round(Math.sin(t) * 18), c);
      g.px(wx + Math.round(Math.cos(t) * 16), 96 + Math.round(Math.sin(t) * 16), c);
    }
    g.circle(wx, 96, 8, 'W'); g.circle(wx, 96, 5, 'C'); g.circle(wx, 96, 2, 'W');
    for (let a = 0; a < 5; a++) {
      const t = (a / 5) * Math.PI * 2 + 0.4;
      g.px(wx + Math.round(Math.cos(t) * 6), 96 + Math.round(Math.sin(t) * 6), 'e');
    }
  }
  // roll bar + light pods
  g.rect(cx - 24, 6, 4, 10, 'd'); g.rect(cx + 20, 6, 4, 10, 'd');
  g.rect(cx - 24, 4, 48, 3, 'd'); g.hline(cx - 23, cx + 22, 4, 'e');
  for (let i = 0; i < 4; i++) { const x = cx - 18 + i * 12; g.ellipse(x, 1, 4, 2, 'D'); g.ellipse(x, 1, 3, 1, 'Y'); g.px(x - 1, 0, 'w'); }
  // exhaust stacks
  for (const sx of [cx - 33, cx + 30]) { g.rect(sx, 26, 4, 16, 'C'); g.hline(sx, sx + 3, 26, 'e'); }
  // lamps, plate, flames
  for (const sgn of [-1, 1]) boxLamp(g, sgn < 0 ? cx - 34 : cx + 14, 62, 20, 9, sgn < 0);
  const s: Spec = { ...carSpec(def), w, h, plateCY: 67, plateW: 24, plateH: 8 };
  plate(g, s, def);
  if (d.stripe === 'flames') {
    const fl = ['...o.....o...', '..ooy...ooy..', '.oooyy.ooyyo.', 'ooooyyyoyyyoo'];
    for (const sgn of [-1, 1]) for (let j = 0; j < fl.length; j++) for (let i = 0; i < fl[j].length; i++) {
      const c = fl[j][i];
      if (c === '.') continue;
      const x = sgn < 0 ? cx - 34 + i : cx + 33 - i;
      over(g, x, 44 + j, c === 'o' ? 'A' : 'y', 'BbHhN');
    }
  }
  if (d.number !== undefined) {
    const str = String(d.number);
    const bw2 = textW(str) + 4;
    g.box(cx - (bw2 >> 1) - 1, 45, bw2 + 2, 9, 'k', 'w');
    text(g, str, cx - (bw2 >> 1) + 2, 47, 'K');
  }
  if (d.bumper === 'bull') { g.rect(cx - 38, 78, 76, 4, 'C'); g.hline(cx - 37, cx + 36, 78, 'w'); for (const sx of [cx - 16, cx + 14]) g.rect(sx, 74, 2, 9, 'C'); }
  return g;
}

function tuktukGrid(def: VehicleDef): Grid {
  const w = 64, h = 66, cx = w >> 1;
  const g = new Grid(w, h);
  for (const sgn of [-1, 1]) tyre(g, sgn < 0 ? cx - 28 : cx + 18, 44, h - 1, 10, sgn);
  // body tub
  g.trap(cx - 22, cx + 21, 18, cx - 26, cx + 25, 54, 'B');
  g.hline(cx - 22, cx + 21, 18, 'H');
  g.rect(cx - 26, 48, 52, 7, 'b');
  for (let y = 18; y <= 55; y++) { const t = (y - 18) / 36; const hw = Math.round(22 + t * 4); g.px(cx - hw, y, 'b'); g.px(cx + hw - 1, y, 'b'); }
  // canopy + posts
  g.rect(cx - 26, 4, 52, 5, 'A');
  g.hline(cx - 25, cx + 24, 3, 'H');
  g.rect(cx - 24, 9, 3, 14, 'k'); g.rect(cx + 21, 9, 3, 14, 'k');
  // open rear: dark interior, bench, passenger
  g.rect(cx - 20, 9, 40, 22, 'k');
  g.rect(cx - 18, 22, 36, 8, 'b');
  g.hline(cx - 18, cx + 17, 22, 'H');
  g.ellipse(cx - 7, 16, 4, 4, 'S'); g.rect(cx - 11, 11, 9, 4, 'K'); g.rect(cx - 10, 20, 7, 4, 'r');
  g.ellipse(cx + 8, 17, 3, 3, 'S'); g.rect(cx + 5, 13, 7, 4, 'K');
  // rolled curtain
  g.rect(cx - 20, 9, 40, 3, 'A'); g.hline(cx - 19, cx + 18, 9, 'H');
  // decorations, lamp, plate
  g.hline(cx - 24, cx + 23, 34, 'A'); g.hline(cx - 24, cx + 23, 35, 'A');
  roundLamp(g, cx - 18, 41, 4); roundLamp(g, cx + 18, 41, 4);
  const s: Spec = { ...carSpec(def), w, h, plateCY: 44, plateW: 16, plateH: 7 };
  plate(g, s, def);
  g.circle(cx, 30, 6, 'K'); g.circle(cx, 30, 3, 'W'); g.px(cx, 30, 'C');
  tip(g, cx - 22, 52);
  return g;
}

// ── entry points ─────────────────────────────────────────────────────────────
function bodyGrid(def: VehicleDef): Grid {
  switch (def.body) {
    case 'truck': return truckGrid(def);
    case 'bus': return busGrid(def);
    case 'tram': return tramGrid(def);
    case 'firetruck': return firetruckGrid(def);
    case 'tank': return tankGrid(def);
    case 'apc': return apcGrid(def);
    case 'monster': return monsterGrid(def);
    case 'tuktuk': return tuktukGrid(def);
    default: return carGrid(def);
  }
}

/** Drop fully transparent rows at the top so the sprite stays tight (anchor is bottom-centre). */
function trimTop(rows: string[]): string[] {
  let i = 0;
  while (i < rows.length - 1 && rows[i].indexOf('.') === 0 && !/[^.]/.test(rows[i])) i++;
  return rows.slice(i);
}

/** Rear-view gameplay sprite (player at scale 1; traffic scaled by depth). Cars 84–100 px wide, heavies up to 128. */
export function drawRear(def: VehicleDef): PixelSprite {
  const g = bodyGrid(def);
  g.outline('k');
  const rows = trimTop(g.rows());
  return buildSprite({ id: 'rear_' + def.id + '_' + def.body, rows }, def.palette, extraMap(def));
}

// ── damage ───────────────────────────────────────────────────────────────────
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Progressive damage variant (level 1..3), deterministic per sprite id:
 * 1 scratches + paint chips · 2 dents, cracked glass, scorch · 3 holes, broken lamps, bent bumper.
 * Damage is biased toward the top and the flanks so it reads as crash damage.
 */
export function damagedSprite(spr: PixelSprite, level: number): PixelSprite {
  const w = spr.w, h = spr.h;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(spr.canvas, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const lvl = Math.max(1, Math.min(3, Math.round(level)));
  let seed = (hashStr(spr.id) ^ (lvl * 0x9e3779b9)) >>> 0;
  const rnd = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 0x7fffff; };
  const idx = (x: number, y: number): number => (y * w + x) * 4;
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && d[idx(x, y) + 3] > 0;
  const put = (x: number, y: number, r: number, gg: number, b: number, a = 255): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = idx(x, y);
    if (a > 0 && d[i + 3] === 0) return;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a;
  };
  const dark = (x: number, y: number, f: number): void => {
    if (!solid(x, y)) return;
    const i = idx(x, y);
    d[i] = Math.round(d[i] * f); d[i + 1] = Math.round(d[i + 1] * f); d[i + 2] = Math.round(d[i + 2] * f);
  };
  const lumAt = (x: number, y: number): number => { const i = idx(x, y); return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11); };
  /** Solid pixel biased to the top and the flanks. */
  const pick = (): Pt | null => {
    for (let t = 0; t < 40; t++) {
      const y = Math.floor(Math.pow(rnd(), 1.8) * h);
      let x: number;
      if (rnd() < 0.62) { const e = Math.floor(rnd() * Math.max(3, w * 0.3)); x = rnd() < 0.5 ? e : w - 1 - e; }
      else x = Math.floor(rnd() * w);
      if (solid(x, y)) return [x, y];
    }
    return null;
  };

  // 1 ── scratches (bare metal streaks) + paint chips
  for (let i = 0; i < 5 + lvl * 5; i++) {
    const p = pick();
    if (!p) continue;
    const len = 3 + Math.floor(rnd() * (2 + lvl * 2));
    const dx = rnd() < 0.5 ? 1 : -1, dy = rnd() < 0.65 ? 1 : 0;
    for (let k = 0; k < len; k++) {
      const x = p[0] + dx * k, y = p[1] + dy * ((k >> 1) | 0);
      if (!solid(x, y)) break;
      if (k % 3 === 2) continue;
      const t = lumAt(x, y) > 120;
      put(x, y, t ? 58 : 190, t ? 58 : 190, t ? 72 : 200);
    }
  }
  for (let i = 0; i < 4 + lvl * 6; i++) {
    const p = pick();
    if (!p) continue;
    const s = rnd() < 0.5 ? 1 : 2;
    for (let j = 0; j < s; j++) for (let k = 0; k < s; k++) {
      if (!solid(p[0] + k, p[1] + j)) continue;
      put(p[0] + k, p[1] + j, 58, 58, 72);
    }
    put(p[0], p[1] - 1, 168, 168, 180);
  }

  // 2 ── dents, cracked glass, scorch
  if (lvl >= 2) {
    for (let i = 0; i < 4 + lvl * 2; i++) {
      const p = pick();
      if (!p) continue;
      const bw = 2 + Math.floor(rnd() * 2), bh = 2 + Math.floor(rnd() * 2);
      const sx = rnd() < 0.5 ? -1 : 1, sy = rnd() < 0.6 ? 1 : -1;
      const buf: number[] = [];
      for (let j = 0; j < bh; j++) for (let k = 0; k < bw; k++) {
        const i2 = idx(Math.min(w - 1, Math.max(0, p[0] + k)), Math.min(h - 1, Math.max(0, p[1] + j)));
        buf.push(d[i2], d[i2 + 1], d[i2 + 2], d[i2 + 3]);
      }
      let q = 0;
      for (let j = 0; j < bh; j++) for (let k = 0; k < bw; k++) {
        const x = p[0] + k + sx, y = p[1] + j + sy;
        const r = buf[q++], gg = buf[q++], b = buf[q++], a = buf[q++];
        if (a > 0 && solid(x, y)) put(x, y, Math.round(r * 0.6), Math.round(gg * 0.6), Math.round(b * 0.62));
      }
      for (let k = -1; k <= bw; k++) dark(p[0] + k, p[1] - 1, 0.45);
    }
    // cracked glass / shattered dark panels: light zig-zags in the upper half
    for (let i = 0; i < 2 + lvl; i++) {
      let x = 0, y = 0, ok = false;
      for (let t = 0; t < 60 && !ok; t++) {
        x = Math.floor(rnd() * w); y = Math.floor(rnd() * h * 0.5);
        ok = solid(x, y) && lumAt(x, y) < 110;
      }
      if (!ok) continue;
      let dir = rnd() < 0.5 ? 1 : -1;
      for (let k = 0; k < 8 + lvl * 3; k++) {
        if (!solid(x, y)) break;
        if (lumAt(x, y) < 140) put(x, y, 214, 224, 240);
        if (k % 3 === 2) dir = -dir;
        x += dir; y += rnd() < 0.55 ? 1 : 0;
      }
    }
    for (let i = 0; i < 3 + lvl * 3; i++) {
      const p = pick();
      if (!p) continue;
      const r = 1 + Math.floor(rnd() * 2);
      for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        if (j * j + k * k > r * r + 1) continue;
        dark(p[0] + k, p[1] + j, 0.3 + rnd() * 0.2);
      }
    }
  }

  // 3 ── holes, broken lamps, bent bumper
  if (lvl >= 3) {
    for (let i = 0; i < 7; i++) {
      const p = pick();
      if (!p) continue;
      const r = 1 + Math.floor(rnd() * 2);
      for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        if (j * j + k * k > r * r) continue;
        const x = p[0] + k, y = p[1] + j;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const ii = idx(x, y);
        d[ii + 3] = 0;
      }
      for (let j = -r - 1; j <= r + 1; j++) for (let k = -r - 1; k <= r + 1; k++) dark(p[0] + k, p[1] + j, 0.3);
    }
    // smash the lamps on one side (deterministic per sprite)
    const side = (hashStr(spr.id) & 1) === 0 ? 0 : 1;
    for (let y = Math.floor(h * 0.35); y < h; y++) {
      for (let x = side === 0 ? 0 : w >> 1; x < (side === 0 ? w >> 1 : w); x++) {
        if (!solid(x, y)) continue;
        const i = idx(x, y);
        if (d[i] > 140 && d[i] > d[i + 1] * 1.5 && d[i] > d[i + 2] * 1.4) {
          if ((x * 7 + y * 3) % 5 === 0) put(x, y, 236, 236, 240);
          else dark(x, y, 0.3);
        }
      }
    }
    // bent bumper: shove the bottom rows sideways
    for (let y = h - 6; y < h - 1; y++) {
      const off = y % 2 ? 1 : 2;
      const from = side === 0 ? 1 : w - 2;
      const step = side === 0 ? 1 : -1;
      for (let n = 0; n < Math.floor(w * 0.28); n++) {
        const x = from + step * n;
        const sxp = x + step * off;
        if (!solid(sxp, y) || !solid(x, y)) continue;
        const a = idx(sxp, y), b = idx(x, y);
        d[b] = Math.round(d[a] * 0.75); d[b + 1] = Math.round(d[a + 1] * 0.75); d[b + 2] = Math.round(d[a + 2] * 0.78);
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return { id: spr.id + '#dmg' + lvl, w, h, ax: spr.ax, ay: spr.ay, canvas: c };
}
