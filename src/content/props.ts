import { Grid, buildSprite, type PixelSprite } from '../core/Sprite';

// Roadside props: procedural pixel art, bottom-center anchored, built lazily and cached.
// Char colours: see DEFAULT_MAP in core/Sprite.ts (k black, D dark, d gray3, e gray2, f gray1, w white, r red, R dark red,
// o orange, y yellow, Y light yellow, g green, v dark green, t teal, c cyan, u blue, U dark blue, i light blue, p purple,
// P dark purple, m pink, M light pink, s sakura, n brown, T tan, x gold, S skin, q paper).

type Maker = () => Grid;
const cache = new Map<string, PixelSprite>();

/** Round canopy tree. */
function roundTree(w: number, h: number, leaf: string, shade: string, trunk = 'n', dots?: string): Grid {
  const g = new Grid(w, h);
  const cx = Math.floor(w / 2);
  const th = Math.round(h * 0.3);
  g.rect(cx - 1, h - th, 3, th, trunk);
  g.px(cx - 2, h - 1, trunk); g.px(cx + 2, h - 1, trunk);
  const ry = Math.round((h - th) / 2) + 1, rx = Math.floor(w / 2) - 1;
  g.ellipse(cx, ry, rx, ry - 1, leaf);
  g.ellipse(cx + 1, ry + 2, rx - 2, ry - 3, shade);
  g.ellipse(cx - 2, ry - 2, Math.max(2, rx - 3), Math.max(2, ry - 4), leaf);
  if (dots) for (let i = 0; i < 9; i++) g.px(cx - rx + 2 + ((i * 7) % (rx * 2 - 3)), ry - ry + 3 + ((i * 5) % (ry * 2 - 5)), dots);
  g.outline('k');
  return g;
}
/** Cone (pine) tree. */
function coneTree(w: number, h: number, leaf: string, shade: string, snow?: string): Grid {
  const g = new Grid(w, h);
  const cx = Math.floor(w / 2);
  g.rect(cx - 1, h - 5, 3, 5, 'n');
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const y0 = 1 + i * Math.round((h - 6) / tiers), y1 = y0 + Math.round((h - 6) / tiers) + 2;
    const hw = 2 + i * Math.round((w / 2 - 2) / (tiers - 1));
    g.trap(cx, cx, y0, cx - hw, cx + hw, y1, leaf);
    g.trap(cx, cx, y0 + 1, cx + 1, cx + hw - 1, y1, shade);
    if (snow) g.hline(cx - Math.max(1, hw - 2), cx + Math.max(1, hw - 2), y1, snow);
  }
  g.outline('k');
  return g;
}
function palmTree(h = 40): Grid {
  const g = new Grid(30, h);
  const cx = 15;
  for (let y = h - 1; y > 10; y--) g.rect(cx - 1 + Math.round((h - y) * 0.08), y, 3, 1, (y % 4 < 2) ? 'n' : 'T');
  const top = 11;
  const fronds: [number, number][] = [[-12, -2], [12, -2], [-9, -7], [9, -7], [-4, -9], [4, -9], [-13, 3], [13, 3]];
  for (const [dx, dy] of fronds) { g.line(cx + 1, top, cx + 1 + dx, top + dy, 'g'); g.line(cx + 1, top + 1, cx + 1 + dx, top + dy + 2, 'v'); }
  g.ellipse(cx + 1, top + 1, 2, 2, 'n');
  g.px(cx, top + 2, 'o'); g.px(cx + 2, top + 2, 'o');
  g.outline('k');
  return g;
}
function post(h: number, fn: (g: Grid, cx: number) => void, w = 14): Grid {
  const g = new Grid(w, h);
  const cx = Math.floor(w / 2);
  g.rect(cx - 1, 3, 2, h - 3, 'd');
  g.vline(cx - 1, 3, h - 1, 'e');
  g.rect(cx - 3, h - 2, 6, 2, 'D');
  fn(g, cx);
  g.outline('k');
  return g;
}
function board(w: number, h: number, bg: string, border: string, poleH = 12, deco?: (g: Grid) => void): Grid {
  const g = new Grid(w, h + poleH);
  const cx = Math.floor(w / 2);
  g.rect(cx - 2, h, 4, poleH, 'd');
  g.vline(cx - 2, h, h + poleH - 1, 'e');
  g.box(0, 0, w, h, border, bg);
  deco?.(g);
  g.outline('k');
  return g;
}
/** Fake text lines (abstract) for signs. */
function textBars(g: Grid, x: number, y: number, w: number, rows: number, col: string): void {
  for (let r = 0; r < rows; r++) {
    let cx = x;
    while (cx < x + w - 2) { const len = 2 + ((cx * 7 + r * 3) % 4); g.hline(cx, Math.min(x + w - 1, cx + len - 1), y + r * 3, col); cx += len + 1; }
  }
}
function stamp(rows: string[]): Grid {
  const w = Math.max(...rows.map((r) => r.length));
  const g = new Grid(w, rows.length);
  g.stamp(rows, 0, 0);
  return g;
}

const MAKERS: Record<string, Maker> = {
  tree: () => roundTree(22, 30, 'g', 'v'),
  bush: () => { const g = new Grid(16, 9); g.ellipse(8, 5, 7, 4, 'g'); g.ellipse(9, 6, 5, 2, 'v'); g.ellipse(5, 4, 3, 2, 'g'); g.outline('k'); return g; },
  pine: () => coneTree(20, 36, 'v', 'g'),
  snowtree: () => coneTree(20, 36, 'v', 'g', 'w'),
  palm: () => palmTree(42),
  sakura: () => roundTree(26, 32, 's', 'm', 'n', 'M'),
  maple: () => roundTree(22, 30, 'r', 'R', 'n', 'o'),
  olive: () => roundTree(20, 22, 'f', 'e', 'n'),
  cypress: () => { const g = new Grid(10, 36); g.trap(5, 5, 0, 1, 8, 30, 'v'); g.trap(5, 5, 2, 3, 6, 30, 'g'); g.rect(4, 30, 2, 6, 'n'); g.outline('k'); return g; },
  birch: () => { const g = roundTree(18, 30, 'Y', 'g', 'w'); for (let y = 21; y < 29; y += 3) g.px(8, y, 'k'); return g; },
  baobab: () => { const g = new Grid(28, 34); g.trap(9, 19, 12, 7, 21, 34, 'n'); g.trap(11, 17, 12, 9, 19, 34, 'T'); g.ellipse(14, 9, 13, 6, 'v'); g.ellipse(13, 8, 9, 3, 'g'); g.outline('k'); return g; },
  bamboo: () => { const g = new Grid(14, 34); for (const x of [2, 6, 10]) { g.rect(x, 2 + x % 3, 2, 32, 'g'); for (let y = 6; y < 34; y += 7) g.hline(x, x + 1, y + x % 3, 'v'); g.line(x + 1, 6 + x, x + 5, 3 + x, 'g'); } g.outline('k'); return g; },
  fern: () => { const g = new Grid(16, 12); for (let i = 0; i < 5; i++) { g.line(8, 11, 1 + i * 3, 1 + (i % 2) * 3, 'g'); g.line(8, 11, 15 - i * 3, 2 + (i % 2) * 2, 'v'); } g.outline('k'); return g; },
  cactus: () => { const g = new Grid(14, 24); g.rect(5, 2, 4, 22, 'g'); g.rect(1, 8, 3, 8, 'g'); g.hline(1, 5, 8, 'g'); g.rect(10, 5, 3, 7, 'g'); g.hline(9, 12, 5, 'g'); g.vline(6, 3, 22, 'v'); g.outline('k'); return g; },
  cactus_tall: () => { const g = new Grid(16, 40); g.rect(6, 2, 4, 38, 'g'); g.rect(1, 10, 3, 12, 'g'); g.hline(1, 6, 10, 'g'); g.rect(12, 6, 3, 10, 'g'); g.hline(10, 14, 6, 'g'); g.vline(7, 3, 38, 'v'); g.outline('k'); return g; },
  lamp: () => post(40, (g, cx) => { g.rect(cx - 1, 0, 7, 2, 'd'); g.rect(cx + 4, 1, 4, 3, 'Y'); g.px(cx + 5, 2, 'w'); }, 16),
  lamp_neon: () => post(40, (g, cx) => { g.rect(cx - 5, 0, 12, 2, 'd'); g.rect(cx - 5, 2, 3, 3, 'm'); g.rect(cx + 4, 2, 3, 3, 'c'); g.px(cx - 4, 3, 'w'); g.px(cx + 5, 3, 'w'); }, 16),
  tram_pole: () => post(46, (g, cx) => { g.rect(cx - 6, 2, 14, 1, 'e'); g.px(cx - 6, 3, 'e'); g.px(cx + 7, 3, 'e'); g.hline(0, 13, 1, 'f'); }, 14),
  flag_pole: () => post(44, (g, cx) => { g.rect(cx + 1, 1, 9, 6, 'r'); g.rect(cx + 1, 3, 9, 2, 'w'); g.px(cx, 0, 'x'); }, 14),
  radio_tower: () => { const g = new Grid(16, 60); for (let y = 0; y < 60; y += 2) { const hw = 1 + Math.round(y / 9); g.px(8 - hw, y, 'r'); g.px(8 + hw, y, 'r'); if (y % 6 === 0) g.hline(8 - hw, 8 + hw, y, (y / 6) % 2 ? 'w' : 'r'); } g.line(7, 60, 8, 0, 'R'); g.px(8, 0, 'Y'); g.outline('k'); return g; },
  wind_turbine: () => { const g = new Grid(30, 56); g.trap(14, 15, 12, 13, 16, 56, 'w'); g.rect(13, 10, 4, 4, 'f'); for (const [dx, dy] of [[0, -10], [9, 5], [-9, 5]] as [number, number][]) { g.line(15, 12, 15 + dx, 12 + dy, 'w'); g.line(14, 12, 14 + dx, 12 + dy, 'f'); } g.outline('k'); return g; },
  oil_pump: () => { const g = new Grid(28, 26); g.rect(2, 22, 24, 4, 'd'); g.trap(12, 15, 6, 8, 19, 22, 'r'); g.line(3, 4, 25, 10, 'D'); g.rect(1, 2, 6, 5, 'd'); g.rect(22, 8, 5, 5, 'D'); g.rect(24, 12, 2, 10, 'd'); g.outline('k'); return g; },
  satellite: () => { const g = new Grid(20, 24); g.rect(9, 12, 2, 12, 'd'); g.ellipse(9, 8, 7, 6, 'f'); g.ellipse(9, 8, 5, 4, 'w'); g.line(9, 8, 15, 2, 'd'); g.rect(14, 1, 3, 3, 'D'); g.outline('k'); return g; },
  sign_city: () => board(30, 16, 'v', 'w', 14, (g) => { textBars(g, 3, 4, 20, 3, 'w'); g.rect(24, 6, 3, 3, 'Y'); }),
  billboard: () => board(34, 20, 'K', 'x', 16, (g) => { g.rect(2, 2, 30, 16, 'r'); g.rect(4, 4, 26, 12, 'K'); textBars(g, 6, 6, 22, 3, 'w'); g.rect(24, 5, 4, 4, 'c'); }),
  altbier_sign: () => board(24, 18, 'n', 'x', 14, (g) => { g.rect(4, 3, 8, 11, 'T'); g.rect(5, 4, 6, 9, 'o'); g.rect(5, 4, 6, 2, 'w'); textBars(g, 14, 4, 8, 3, 'Y'); }),
  pretzel_sign: () => board(22, 18, 'w', 'u', 14, (g) => { g.ellipse(11, 9, 6, 5, 'n'); g.ellipse(11, 9, 4, 3, 'w'); g.ellipse(8, 10, 2, 2, 'n'); g.ellipse(14, 10, 2, 2, 'n'); g.px(9, 6, 'Y'); g.px(13, 6, 'Y'); }),
  camel_sign: () => board(22, 16, 'y', 'k', 12, (g) => { g.rect(6, 8, 10, 3, 'k'); g.rect(8, 5, 3, 3, 'k'); g.rect(12, 4, 3, 4, 'k'); g.rect(15, 6, 2, 3, 'k'); g.rect(7, 11, 1, 3, 'k'); g.rect(14, 11, 1, 3, 'k'); }),
  neon_kanji: () => board(18, 30, 'K', 'm', 10, (g) => { g.stamp(['.m.m..', 'mmmmmm', '.m.m..', 'mmmmmm', '..m...', 'mmmmmm', '.m.m.m', 'm.m..m', '..m...', 'mmmmmm', '..m...', 'mmmmmm'], 6, 4); g.rect(3, 26, 12, 1, 'c'); }),
  neon_arrow: () => board(26, 14, 'K', 'c', 12, (g) => { g.stamp(['.....c......', 'cccccccc....', '.....ccc....', 'cccccccccc..', '.....ccc....', 'cccccccc....', '.....c......'], 7, 3); }),
  bus_stop: () => { const g = new Grid(26, 30); g.rect(2, 4, 22, 2, 'D'); g.rect(3, 6, 20, 14, 'i'); g.rect(4, 7, 18, 12, 'c'); g.rect(1, 6, 2, 24, 'd'); g.rect(23, 6, 2, 24, 'd'); g.rect(5, 20, 16, 3, 'd'); g.rect(9, 0, 8, 5, 'y'); g.rect(11, 1, 4, 3, 'k'); g.outline('k'); return g; },
  kiosk: () => { const g = new Grid(28, 28); g.rect(2, 8, 24, 20, 'r'); g.rect(4, 12, 20, 10, 'K'); g.rect(6, 14, 16, 6, 'Y'); g.trap(1, 26, 4, 0, 27, 8, 'w'); for (let x = 1; x < 27; x += 6) g.rect(x, 4, 3, 4, 'r'); g.rect(10, 22, 8, 6, 'D'); g.outline('k'); return g; },
  taco_stand: () => { const g = new Grid(30, 28); g.rect(3, 12, 24, 16, 'y'); g.rect(5, 14, 20, 8, 'K'); g.rect(7, 16, 16, 4, 'o'); g.trap(2, 27, 6, 0, 29, 12, 'g'); for (let x = 0; x < 29; x += 5) g.rect(x, 6, 2, 6, 'w'); g.rect(1, 2, 28, 4, 'r'); textBars(g, 3, 3, 24, 1, 'w'); g.outline('k'); return g; },
  food_cart: () => { const g = new Grid(24, 24); g.rect(2, 8, 20, 12, 'e'); g.rect(4, 10, 16, 6, 'D'); g.rect(6, 12, 12, 2, 'o'); g.rect(1, 2, 22, 6, 'r'); g.rect(3, 4, 18, 2, 'w'); g.circle(6, 21, 2, 'k'); g.circle(18, 21, 2, 'k'); g.outline('k'); return g; },
  vending: () => { const g = new Grid(16, 30); g.rect(1, 0, 14, 30, 'u'); g.rect(3, 2, 10, 14, 'w'); for (let y = 4; y < 14; y += 4) for (let x = 4; x < 12; x += 3) g.rect(x, y, 2, 3, ['r', 'o', 'g', 'c'][((x + y) / 3) % 4 | 0]); g.rect(3, 18, 10, 8, 'K'); g.rect(4, 26, 8, 2, 'd'); g.px(11, 20, 'Y'); g.outline('k'); return g; },
  phonebox: () => { const g = new Grid(14, 32); g.rect(1, 3, 12, 29, 'r'); g.rect(3, 6, 8, 18, 'w'); g.hline(3, 10, 12, 'r'); g.hline(3, 10, 18, 'r'); g.vline(7, 6, 23, 'r'); g.rect(2, 0, 10, 3, 'R'); g.rect(4, 1, 6, 1, 'w'); g.outline('k'); return g; },
  hydrant: () => stamp(['..rr..', '.rrrr.', 'rrrrrr', '.rrrr.', 'rrrrrr', '.rrrr.', '.rrrr.', '.rrrr.', 'rrrrrr']).outline('k'),
  cone: () => stamp(['...oo...', '...oo...', '..oooo..', '..wwww..', '..oooo..', '.oooooo.', '.wwwwww.', '.oooooo.', 'kkkkkkkk']).outline('k'),
  barrier: () => { const g = new Grid(30, 14); g.rect(2, 0, 26, 8, 'w'); for (let x = 2; x < 28; x += 8) g.trap(x, x + 3, 0, x - 4, x - 1, 7, 'r'); g.rect(4, 8, 3, 6, 'd'); g.rect(23, 8, 3, 6, 'd'); g.rect(1, 0, 28, 1, 'k'); g.outline('k'); return g; },
  checker_flag: () => post(36, (g, cx) => { for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) g.px(cx + 1 + x, y, ((x >> 1) + (y >> 1)) % 2 ? 'k' : 'w'); }, 24),
  bike_rack: () => { const g = new Grid(30, 16); for (let x = 2; x < 28; x += 8) { g.circle(x + 2, 11, 3, 'd'); g.circle(x + 2, 11, 1, 'e'); g.rect(x - 1, 4, 2, 8, 'e'); g.line(x + 2, 4, x + 6, 8, 'r'); } g.outline('k'); return g; },
  rock: () => { const g = new Grid(20, 12); g.ellipse(10, 8, 9, 4, 'e'); g.ellipse(8, 6, 6, 4, 'f'); g.ellipse(12, 6, 3, 2, 'd'); g.outline('k'); return g; },
  ice_rock: () => { const g = new Grid(20, 14); g.trap(8, 12, 0, 1, 19, 13, 'i'); g.trap(9, 11, 1, 5, 12, 12, 'c'); g.px(9, 3, 'w'); g.px(8, 6, 'w'); g.outline('k'); return g; },
  fuji_stone: () => { const g = new Grid(24, 26); g.trap(11, 13, 0, 1, 23, 26, 'd'); g.trap(11, 13, 0, 7, 17, 8, 'w'); g.trap(9, 15, 8, 6, 18, 12, 'e'); g.outline('k'); return g; },
  lantern: () => { const g = new Grid(14, 26); g.rect(2, 22, 10, 4, 'e'); g.rect(5, 12, 4, 10, 'e'); g.rect(2, 8, 10, 5, 'f'); g.rect(4, 9, 6, 3, 'Y'); g.trap(6, 8, 2, 1, 13, 8, 'e'); g.px(7, 0, 'e'); g.px(7, 1, 'e'); g.outline('k'); return g; },
  lantern_red: () => post(30, (g, cx) => { g.rect(cx - 5, 2, 11, 13, 'r'); g.rect(cx - 4, 3, 9, 11, 'o'); g.rect(cx - 4, 6, 9, 5, 'Y'); g.rect(cx - 3, 0, 7, 2, 'k'); g.rect(cx - 3, 15, 7, 2, 'k'); g.rect(cx - 1, 17, 3, 3, 'y'); g.hline(cx - 5, cx + 5, 8, 'r'); }, 16),
  statue: () => { const g = new Grid(16, 34); g.rect(2, 26, 12, 8, 'f'); g.rect(4, 24, 8, 2, 'e'); g.rect(6, 6, 4, 18, 'e'); g.rect(3, 8, 10, 4, 'e'); g.circle(8, 4, 3, 'e'); g.rect(11, 2, 2, 8, 'e'); g.outline('k'); return g; },
  lion_statue: () => { const g = new Grid(24, 26); g.rect(2, 18, 20, 8, 'f'); g.rect(6, 10, 14, 8, 'T'); g.ellipse(6, 9, 5, 5, 'o'); g.ellipse(5, 9, 3, 3, 'T'); g.rect(18, 8, 4, 10, 'T'); g.px(4, 8, 'k'); g.outline('k'); return g; },
  dragon_statue: () => { const g = new Grid(24, 30); g.rect(4, 24, 16, 6, 'e'); g.line(6, 24, 12, 8, 'g'); g.line(7, 24, 13, 8, 'g'); g.line(12, 8, 20, 4, 'g'); g.rect(17, 2, 6, 5, 'g'); g.px(22, 3, 'r'); g.px(18, 1, 'x'); g.px(21, 1, 'x'); g.line(13, 12, 8, 14, 'x'); g.line(13, 16, 9, 19, 'x'); g.outline('k'); return g; },
  fountain: () => { const g = new Grid(30, 24); g.ellipse(15, 20, 14, 4, 'f'); g.ellipse(15, 19, 12, 2, 'i'); g.rect(13, 8, 4, 12, 'e'); g.ellipse(15, 8, 6, 2, 'f'); g.rect(14, 0, 2, 8, 'c'); for (let i = 0; i < 4; i++) { g.px(11 - i, 2 + i * 2, 'c'); g.px(19 + i, 2 + i * 2, 'c'); } g.outline('k'); return g; },
  obelisk_small: () => { const g = new Grid(12, 40); g.trap(5, 7, 0, 3, 9, 34, 'T'); g.rect(1, 34, 10, 6, 'f'); g.px(6, 0, 'x'); g.vline(5, 4, 32, 'n'); g.outline('k'); return g; },
  pyramid_small: () => { const g = new Grid(40, 24); g.trap(20, 20, 0, 0, 39, 23, 'T'); g.trap(20, 20, 0, 20, 39, 23, 'n'); g.outline('k'); return g; },
  stupa: () => { const g = new Grid(24, 34); g.rect(2, 28, 20, 6, 'f'); g.ellipse(12, 20, 9, 8, 'w'); g.rect(9, 8, 6, 8, 'x'); g.trap(12, 12, 0, 9, 15, 8, 'x'); g.px(12, 0, 'Y'); g.outline('k'); return g; },
  pagoda_small: () => { const g = new Grid(28, 40); for (let i = 0; i < 3; i++) { const y = 8 + i * 10; g.trap(10 + i, 18 - i, y, 1, 27, y + 4, 'R'); g.rect(8, y + 4, 12, 6, 'T'); g.rect(10, y + 5, 8, 4, 'K'); } g.rect(12, 2, 4, 6, 'R'); g.px(14, 0, 'x'); g.px(14, 1, 'x'); g.outline('k'); return g; },
  shrine: () => { const g = new Grid(26, 30); g.trap(9, 17, 2, 0, 25, 9, 'R'); g.rect(4, 9, 18, 14, 'T'); g.rect(6, 11, 14, 10, 'K'); g.rect(11, 15, 4, 8, 'r'); g.rect(2, 23, 22, 7, 'f'); g.px(13, 0, 'x'); g.outline('k'); return g; },
  torii: () => { const g = new Grid(34, 40); g.rect(0, 2, 34, 4, 'r'); g.rect(3, 9, 28, 3, 'r'); g.rect(5, 6, 4, 34, 'r'); g.rect(25, 6, 4, 34, 'r'); g.rect(15, 12, 4, 6, 'k'); g.rect(0, 0, 34, 2, 'K'); g.rect(4, 36, 6, 4, 'd'); g.rect(24, 36, 6, 4, 'd'); g.outline('k'); return g; },
  minaret_small: () => { const g = new Grid(12, 48); g.rect(4, 8, 4, 40, 'q'); g.rect(2, 20, 8, 2, 'e'); g.rect(2, 30, 8, 2, 'e'); g.trap(6, 6, 0, 3, 8, 8, 'e'); g.px(6, 0, 'x'); g.outline('k'); return g; },
  windmill: () => { const g = new Grid(36, 44); g.trap(13, 23, 14, 8, 28, 44, 'n'); g.rect(11, 8, 14, 6, 'v'); g.trap(14, 22, 4, 11, 25, 8, 'D'); for (const [dx, dy] of [[14, -4], [4, 14], [-14, 4], [-4, -14]] as [number, number][]) { g.line(18, 10, 18 + dx, 10 + dy, 'w'); g.line(18, 10, 18 + dx * 0.7 + dy * 0.2, 10 + dy * 0.7 - dx * 0.2, 'f'); } g.rect(14, 34, 6, 10, 'D'); g.outline('k'); return g; },
  gondola_pole: () => { const g = new Grid(10, 34); g.rect(4, 2, 3, 32, 'u'); for (let y = 4; y < 32; y += 6) g.rect(4, y, 3, 3, 'w'); g.px(5, 0, 'x'); g.px(5, 1, 'x'); g.outline('k'); return g; },
  surfboard: () => { const g = new Grid(10, 30); g.ellipse(5, 15, 4, 14, 'c'); g.vline(5, 3, 26, 'w'); g.rect(3, 12, 4, 6, 'o'); g.outline('k'); return g; },
  lifeguard: () => { const g = new Grid(26, 36); g.rect(3, 26, 2, 10, 'T'); g.rect(21, 26, 2, 10, 'T'); g.rect(2, 12, 22, 14, 'y'); g.rect(4, 14, 18, 8, 'w'); g.trap(1, 24, 6, 0, 25, 12, 'r'); g.rect(11, 22, 4, 4, 'K'); g.outline('k'); return g; },
  beach_umbrella: () => { const g = new Grid(28, 30); g.rect(13, 8, 2, 22, 'w'); g.ellipse(14, 8, 13, 6, 'r'); for (let x = 3; x < 26; x += 6) g.trap(x + 3, x + 3, 2, x, x + 5, 12, 'w'); g.ellipse(14, 8, 13, 6, 'r'); for (let x = 2; x < 26; x += 8) g.rect(x, 6, 3, 6, 'w'); g.outline('k'); return g; },
};

/** Returns a roadside prop sprite by id (null if unknown). */
export function propSprite(id: string): PixelSprite | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const m = MAKERS[id];
  if (!m) return null;
  const spr = buildSprite(m().toSource('prop_' + id));
  cache.set(id, spr);
  return spr;
}
export const PROP_IDS = Object.keys(MAKERS);
