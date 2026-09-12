import type { CityDef, CityPalette, TimeOfDay } from '../../core/types';
import type { Renderer } from '../../core/Renderer';
import { makeCanvas, spriteFromCanvas, type PixelSprite } from '../../core/Sprite';
import { P, mix } from '../../core/Palette';
import { kanjiSprite } from '../../core/Kanji';
import type { SkylineFn } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// ASIA catalog: tokyo, osaka, kyoto, nagoya, fukuoka, seoul, shanghai, hongkong, bangkok, mumbai.
// Skylines are drawn in "horizon space": x = screen x (0..240 visible, layers cover -48..288),
// yy = pixels ABOVE the horizon (negative = up). Static layers are painted once per
// (city, layer, time of day, fog bucket) into an offscreen canvas and blitted with parallax;
// sun/moon/stars/clouds, neon signs, beacons and moving parts are drawn live every frame.
// ─────────────────────────────────────────────────────────────────────────────

// ── palettes ────────────────────────────────────────────────────────────────
interface RoadKit { road: string; roadAlt: string; stripe: string; curb: string; curbAlt: string }
const ROAD_JP: RoadKit = { road: '#3a3a48', roadAlt: '#36364a', stripe: P.white, curb: P.red, curbAlt: P.white };
const ROAD_KR: RoadKit = { road: '#3c3c4a', roadAlt: '#38384a', stripe: '#ffe870', curb: P.red, curbAlt: P.white };
const ROAD_CN: RoadKit = { road: '#404050', roadAlt: '#3a3a4c', stripe: P.white, curb: P.yellow, curbAlt: P.ink };
const ROAD_HK: RoadKit = { road: '#3a3e48', roadAlt: '#343a46', stripe: P.white, curb: P.red, curbAlt: P.white };
const ROAD_TH: RoadKit = { road: '#4a4650', roadAlt: '#44404a', stripe: P.yellow, curb: P.red, curbAlt: P.white };
const ROAD_IN: RoadKit = { road: '#5a5048', roadAlt: '#524840', stripe: P.yellow, curb: P.yellow, curbAlt: P.ink };

const dk = (c: string, a: number) => (a > 0 ? mix(c, '#000000', a) : c);
/** Build one palette: sky [top,bottom], far/near silhouettes, glow, ground [a,b], haze, road kit, night dim 0..1, sun/moon. */
function mkPal(sky: [string, string], far: string, near: string, glow: string, ground: [string, string], haze: string, kit: RoadKit, dim: number, sun?: string, moon?: string): CityPalette {
  return {
    skyTop: sky[0], skyBottom: sky[1], farSky: far, nearSky: near, glow,
    ground: dk(ground[0], dim), groundAlt: dk(ground[1], dim),
    road: dk(kit.road, dim * 0.6), roadAlt: dk(kit.roadAlt, dim * 0.6), stripe: dk(kit.stripe, dim * 0.4),
    curb: dk(kit.curb, dim * 0.5), curbAlt: dk(kit.curbAlt, dim * 0.5), haze, sun, moon,
  };
}
type Quad = Record<TimeOfDay, CityPalette>;
const GRASS: [string, string] = ['#20b040', '#1a9a36'];
const GRASS_DUSK: [string, string] = ['#1e8a3a', '#187a30'];
const GRASS_DAWN: [string, string] = ['#2a9a48', '#22883c'];

const PAL_TOKYO: Quad = {
  dawn: mkPal(['#3a2a86', '#ff9a66'], '#6a4a9a', '#2a2244', '#ffe870', GRASS_DAWN, '#ff9e86', ROAD_JP, 0.1, '#ffd060'),
  day: mkPal(['#2040e0', '#60a0ff'], '#5878d0', '#2c3050', '#ffe870', GRASS, '#8ab8ff', ROAD_JP, 0, '#ffe870'),
  dusk: mkPal(['#3a1a6a', '#ff6a3a'], '#6a3a7a', '#26183a', '#ffe870', GRASS_DUSK, '#ff8060', ROAD_JP, 0.25, '#ffb030'),
  night: mkPal(['#08082a', '#1c1c5e'], '#1c1c4a', '#0e0e22', '#ffe870', ['#12401e', '#0e3418'], '#2a2a6a', ROAD_JP, 0.5, undefined, '#f4f4f0'),
};
const PAL_OSAKA: Quad = {
  dawn: mkPal(['#4a2a80', '#ffb070'], '#7a5a9a', '#2c2240', '#ffd040', GRASS_DAWN, '#ffb090', ROAD_JP, 0.1, '#ffd060'),
  day: mkPal(['#2a60e0', '#70b0ff'], '#5a80d0', '#2e3052', '#ffe870', GRASS, '#90c0ff', ROAD_JP, 0, '#ffe870'),
  dusk: mkPal(['#5a1a5a', '#ff7a40'], '#7a3a6a', '#28183a', '#ffd040', GRASS_DUSK, '#ff9060', ROAD_JP, 0.25, '#ffa030'),
  night: mkPal(['#0a0a24', '#2a1850'], '#22184a', '#0f0c22', '#ffd040', ['#12401e', '#0e3418'], '#3a2a6a', ROAD_JP, 0.5, undefined, '#f4f4f0'),
};
const PAL_KYOTO: Quad = {
  dawn: mkPal(['#7a5aa0', '#ffc0d0'], '#9a7aa8', '#3a2c48', '#ffe0a0', GRASS_DAWN, '#ffc8d8', ROAD_JP, 0.1, '#ffd890'),
  day: mkPal(['#4a90e0', '#b0d8ff'], '#7aa0c8', '#34405a', '#ffe870', GRASS, '#c0d8f0', ROAD_JP, 0, '#ffe870'),
  dusk: mkPal(['#8a3a70', '#ffa0a0'], '#a05a80', '#302040', '#ffd090', GRASS_DUSK, '#ffb0b0', ROAD_JP, 0.25, '#ffb060'),
  night: mkPal(['#101030', '#2c2058'], '#2a1e4a', '#100e22', '#ffd090', ['#12401e', '#0e3418'], '#3a2a5a', ROAD_JP, 0.5, undefined, '#f4f4f0'),
};
const PAL_NAGOYA: Quad = {
  dawn: mkPal(['#3a3a90', '#ffb080'], '#6a5a9a', '#2a2644', '#ffe870', GRASS_DAWN, '#ffb890', ROAD_JP, 0.1, '#ffd060'),
  day: mkPal(['#2850d8', '#78b0f8'], '#5a7ec8', '#2c3252', '#ffe870', GRASS, '#98c0f8', ROAD_JP, 0, '#ffe870'),
  dusk: mkPal(['#402060', '#f08040'], '#6a4070', '#26183a', '#ffd040', GRASS_DUSK, '#ff9860', ROAD_JP, 0.25, '#ffb030'),
  night: mkPal(['#0a0c28', '#1c2058'], '#1c1e4a', '#0e0e22', '#ffd040', ['#12401e', '#0e3418'], '#2a2a6a', ROAD_JP, 0.5, undefined, '#f4f4f0'),
};
const PAL_FUKUOKA: Quad = {
  dawn: mkPal(['#5a4a90', '#ffc080'], '#7a6aa0', '#2c2a48', '#ffe870', GRASS_DAWN, '#ffc898', ROAD_JP, 0.1, '#ffd060'),
  day: mkPal(['#2070e0', '#80d0ff'], '#5a90d0', '#2c3856', '#ffe870', GRASS, '#a0d8ff', ROAD_JP, 0, '#ffe870'),
  dusk: mkPal(['#4a2a70', '#ff9060'], '#7a4a80', '#28203c', '#ffe870', GRASS_DUSK, '#ffa070', ROAD_JP, 0.25, '#ffb040'),
  night: mkPal(['#0a1030', '#18305a'], '#1a2a50', '#0c1024', '#ffe870', ['#12401e', '#0e3418'], '#2a3a6a', ROAD_JP, 0.5, undefined, '#f4f4f0'),
};
const PAL_SEOUL: Quad = {
  dawn: mkPal(['#604a90', '#ffb080'], '#8a6aa0', '#2c2846', '#ffe870', GRASS_DAWN, '#ffbc98', ROAD_KR, 0.1, '#ffd060'),
  day: mkPal(['#3060e0', '#90c0ff'], '#6088d0', '#2e3454', '#ffe870', GRASS, '#a8c8ff', ROAD_KR, 0, '#ffe870'),
  dusk: mkPal(['#3a2870', '#ff7060'], '#6a4880', '#26203c', '#ffe870', GRASS_DUSK, '#ff8878', ROAD_KR, 0.25, '#ffb040'),
  night: mkPal(['#0a0a28', '#1c1c58'], '#1a1c4a', '#0c0e22', '#ffe870', ['#12401e', '#0e3418'], '#2c2c68', ROAD_KR, 0.5, undefined, '#f4f4f0'),
};
const PAL_SHANGHAI: Quad = {
  dawn: mkPal(['#5a4a90', '#ffb890'], '#8a7aa0', '#2c2c48', '#ffd040', GRASS_DAWN, '#ffc4a8', ROAD_CN, 0.1, '#ffd060'),
  day: mkPal(['#3a70d0', '#a8c8e8'], '#7898c0', '#303a58', '#ffe870', GRASS, '#c0d0e8', ROAD_CN, 0, '#ffe870'),
  dusk: mkPal(['#5a2a60', '#ff8050'], '#8a4a70', '#2a1c3c', '#ffd040', GRASS_DUSK, '#ff9a70', ROAD_CN, 0.25, '#ffb040'),
  night: mkPal(['#08102a', '#1a2a60'], '#1a2450', '#0c1024', '#ffd040', ['#12401e', '#0e3418'], '#2a3a70', ROAD_CN, 0.5, undefined, '#f4f4f0'),
};
const PAL_HONGKONG: Quad = {
  dawn: mkPal(['#4a4a90', '#ffb888'], '#7a7aa0', '#2c3048', '#ffe870', ['#20a080', '#1a8a6a'], '#ffc0a0', ROAD_HK, 0.1, '#ffd060'),
  day: mkPal(['#1a80c0', '#60d0d0'], '#4a98b8', '#2a3a56', '#ffe870', ['#20a080', '#1a8a6a'], '#90d8d8', ROAD_HK, 0, '#ffe870'),
  dusk: mkPal(['#3a2a70', '#ff8a60'], '#7a5080', '#26203c', '#ffe870', ['#1a8a70', '#167860'], '#ffa080', ROAD_HK, 0.25, '#ffb040'),
  night: mkPal(['#06102a', '#0e3a4a'], '#142c48', '#0a1224', '#ffe870', ['#0e4a3a', '#0c3e30'], '#1a4a5a', ROAD_HK, 0.5, undefined, '#f4f4f0'),
};
const PAL_BANGKOK: Quad = {
  dawn: mkPal(['#7a4a80', '#ffd080'], '#a08090', '#3a2c48', '#ffe870', ['#3a9a40', '#308a38'], '#ffd8a0', ROAD_TH, 0.1, '#ffe060'),
  day: mkPal(['#3a90e0', '#b0dcff'], '#7aa8c8', '#343a58', '#ffe870', ['#3aa848', '#309a40'], '#d0e0f0', ROAD_TH, 0, '#ffe870'),
  dusk: mkPal(['#6a2a50', '#ffb040'], '#9a5a70', '#2c1c3c', '#ffe870', ['#2a8a3a', '#247a32'], '#ffc060', ROAD_TH, 0.25, '#ffc030'),
  night: mkPal(['#0c0c2a', '#3a2a48'], '#2c2048', '#100c22', '#ffe870', ['#12401e', '#0e3418'], '#4a3a58', ROAD_TH, 0.5, undefined, '#f4f4f0'),
};
const PAL_MUMBAI: Quad = {
  dawn: mkPal(['#8a5a80', '#ffc890'], '#a88a98', '#3c3048', '#ffe0a0', ['#6a8a30', '#5e7c2a'], '#ffd0a8', ROAD_IN, 0.1, '#ffd870'),
  day: mkPal(['#4a90d8', '#e8c898'], '#9aa8b0', '#3c4258', '#ffe870', ['#7a9a38', '#6c8a30'], '#f0d8b0', ROAD_IN, 0, '#ffe870'),
  dusk: mkPal(['#7a3a50', '#ff9a50'], '#a86a70', '#2c1e3a', '#ffd070', ['#5a7a2a', '#4e6c24'], '#ffb078', ROAD_IN, 0.25, '#ffb040'),
  night: mkPal(['#101028', '#3a2a3a'], '#2c2240', '#120e22', '#ffd070', ['#2a3a14', '#243210'], '#4a3a4a', ROAD_IN, 0.5, undefined, '#f4f4f0'),
};

// ── city defs ────────────────────────────────────────────────────────────────
export const CITIES_ASIA: CityDef[] = [
  {
    id: 'tokyo', name: { de: 'Tokio', en: 'Tokyo' }, country: { de: 'Japan', en: 'Japan' }, countryCode: 'JP', glyph: '東京', palettes: PAL_TOKYO,
    props: ['sakura', 'lamp_neon', 'billboard', 'vending', 'sign_city', 'neon_kanji', 'cone', 'torii'],
    traffic: ['taxi_jp', 'police_jp', 'kei_van', 'dekotora_traffic', 'sedan_white', 'coupe_black'], music: 'jdm',
    billboards: ['東京', 'JDM', '伝説', 'ガレージ', 'スピード'], signs: ['TOKYO', 'OSAKA', 'NAGOYA'],
  },
  {
    id: 'osaka', name: { de: 'Osaka', en: 'Osaka' }, country: { de: 'Japan', en: 'Japan' }, countryCode: 'JP', glyph: '大阪', palettes: PAL_OSAKA,
    props: ['sakura', 'lamp_neon', 'neon_kanji', 'lantern_red', 'billboard', 'vending', 'food_cart', 'neon_arrow'],
    traffic: ['taxi_jp', 'kei_van', 'police_jp', 'van_white', 'hatch_yellow', 'dekotora_traffic'], music: 'jdm',
    billboards: ['大阪', 'たこ焼き', '道頓堀', 'JDM', 'グリコ'], signs: ['OSAKA', 'KOBE', 'KYOTO'],
  },
  {
    id: 'kyoto', name: { de: 'Kyoto', en: 'Kyoto' }, country: { de: 'Japan', en: 'Japan' }, countryCode: 'JP', glyph: '京都', palettes: PAL_KYOTO,
    props: ['sakura', 'torii', 'lantern', 'shrine', 'bamboo', 'maple', 'pagoda_small', 'lamp'],
    traffic: ['taxi_jp', 'kei_van', 'bus_city', 'sedan_white', 'police_jp'], music: 'jdm',
    billboards: ['京都', '祇園', '抹茶', '嵐山'], signs: ['KYOTO', 'NARA', 'OSAKA'],
  },
  {
    id: 'nagoya', name: { de: 'Nagoya', en: 'Nagoya' }, country: { de: 'Japan', en: 'Japan' }, countryCode: 'JP', glyph: '名古屋', palettes: PAL_NAGOYA,
    props: ['sakura', 'lamp', 'billboard', 'vending', 'sign_city', 'cone', 'barrier', 'neon_kanji'],
    traffic: ['taxi_jp', 'police_jp', 'kei_van', 'truck_semi', 'sedan_gray', 'dekotora_traffic'], music: 'jdm',
    billboards: ['名古屋', 'みそカツ', 'JDM', '金鯱'], signs: ['NAGOYA', 'TOYOTA', 'TOKYO'],
  },
  {
    id: 'fukuoka', name: { de: 'Fukuoka', en: 'Fukuoka' }, country: { de: 'Japan', en: 'Japan' }, countryCode: 'JP', glyph: '福岡', palettes: PAL_FUKUOKA,
    props: ['sakura', 'palm', 'lamp_neon', 'food_cart', 'billboard', 'vending', 'lantern_red', 'neon_kanji'],
    traffic: ['taxi_jp', 'police_jp', 'kei_van', 'bus_city', 'sedan_red', 'dekotora_traffic'], music: 'jdm',
    billboards: ['福岡', '博多', 'ラーメン', '屋台', 'JDM'], signs: ['FUKUOKA', 'HAKATA', 'KUMAMOTO'],
  },
  {
    id: 'seoul', name: { de: 'Seoul', en: 'Seoul' }, country: { de: 'Südkorea', en: 'South Korea' }, countryCode: 'KR', glyph: '서울', palettes: PAL_SEOUL,
    props: ['lamp_neon', 'billboard', 'sign_city', 'tree', 'bus_stop', 'neon_arrow', 'kiosk', 'cone'],
    traffic: ['bus_blue', 'sedan_white', 'sedan_gray', 'suv_gray', 'van_white', 'truck_semi'], music: 'kpop',
    slogans: ['꿈을 향해', '달려라'], captions: ['TOWARD\nTHE DREAM', 'RUN\nRUN\nRUN'],
    billboards: ['서울', '강남', '치킨', 'K-POP', '한강'], signs: ['SEOUL', 'GANGNAM', 'INCHEON'],
  },
  {
    id: 'shanghai', name: { de: 'Shanghai', en: 'Shanghai' }, country: { de: 'China', en: 'China' }, countryCode: 'CN', glyph: '上海', palettes: PAL_SHANGHAI,
    props: ['lamp_neon', 'billboard', 'lantern_red', 'sign_city', 'tree', 'flag_pole', 'barrier', 'neon_kanji'],
    traffic: ['ev_taxi', 'sedan_white', 'sedan_gray', 'bus_city', 'van_white', 'truck_semi'], music: 'chinese',
    slogans: ['海纳百川', '追风逐日'], captions: ['ALL RIVERS\nRUN TO SEA', 'CHASE\nTHE WIND'],
    billboards: ['上海', '外滩', '浦东', '欢迎', 'JDM'], signs: ['SHANGHAI', 'PUDONG', 'SUZHOU'],
  },
  {
    id: 'hongkong', name: { de: 'Hongkong', en: 'Hong Kong' }, country: { de: 'Hongkong', en: 'Hong Kong' }, countryCode: 'HK', glyph: '香港', palettes: PAL_HONGKONG,
    props: ['lamp_neon', 'neon_kanji', 'billboard', 'lantern_red', 'tram_pole', 'bamboo', 'sign_city', 'neon_arrow'],
    traffic: ['taxi_hk', 'tram_hk', 'bus_double', 'van_white', 'sedan_gray', 'coupe_black'], music: 'chinese',
    slogans: ['東方之珠', '不夜城'], captions: ['PEARL OF\nTHE ORIENT', 'CITY\nOF\nLIGHT'],
    billboards: ['香港', '九龍', '茶餐廳', 'HK', '旺角'], signs: ['HONG KONG', 'KOWLOON', 'SHENZHEN'],
  },
  {
    id: 'bangkok', name: { de: 'Bangkok', en: 'Bangkok' }, country: { de: 'Thailand', en: 'Thailand' }, countryCode: 'TH', glyph: 'กรุงเทพ', palettes: PAL_BANGKOK,
    props: ['palm', 'stupa', 'food_cart', 'lantern', 'billboard', 'lamp_neon', 'shrine', 'fern'],
    traffic: ['tuktuk', 'songthaew', 'taxi_yellow', 'pickup_red', 'bus_city', 'van_white'], music: 'surf',
    slogans: ['สยาม', 'ยิ้ม'], captions: ['SIAM\nSMILE', 'LAND OF\nSMILES'],
    billboards: ['กรุงเทพ', 'BANGKOK', 'สยาม', 'ตลาด', 'THAI'], signs: ['BANGKOK', 'PATTAYA', 'AYUTTHAYA'],
  },
  {
    id: 'mumbai', name: { de: 'Mumbai', en: 'Mumbai' }, country: { de: 'Indien', en: 'India' }, countryCode: 'IN', glyph: 'मुंबई', palettes: PAL_MUMBAI,
    props: ['palm', 'billboard', 'food_cart', 'lamp', 'kiosk', 'statue', 'bus_stop', 'cone'],
    traffic: ['rickshaw_in', 'truck_indian', 'taxi_yellow', 'bus_city', 'sedan_white', 'suv_gray'], music: 'bollywood',
    slogans: ['मुंबई', 'नमस्ते'], captions: ['CITY OF\nDREAMS', 'MAXIMUM\nCITY'],
    billboards: ['मुंबई', 'MUMBAI', 'BOLLYWOOD', 'चाय', 'TAXI'], signs: ['MUMBAI', 'PUNE', 'GOA'],
  },
];

// ── drawing helpers ──────────────────────────────────────────────────────────
/** Deterministic hash 0..1 from integers. */
function H(a: number, b = 0, c = 0): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + 19.19) * 43758.5453;
  return x - Math.floor(x);
}

/** Painter in horizon space: (x, yy) → canvas (x + ox, yy + oy). */
class Pt {
  constructor(readonly c: CanvasRenderingContext2D, readonly ox: number, readonly oy: number) {}
  rect(x: number, yy: number, w: number, h: number, col: string): void {
    this.c.fillStyle = col;
    this.c.fillRect(Math.round(x + this.ox), Math.round(yy + this.oy), Math.round(w), Math.round(h));
  }
  px(x: number, yy: number, col: string): void { this.rect(x, yy, 1, 1, col); }
  hline(x0: number, x1: number, yy: number, col: string): void { this.rect(Math.min(x0, x1), yy, Math.abs(x1 - x0) + 1, 1, col); }
  vline(x: number, y0: number, y1: number, col: string): void { this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, col); }
  line(x0: number, y0: number, x1: number, y1: number, col: string): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 400; i++) {
      this.px(x0, y0, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  disc(cx: number, cy: number, r: number, col: string): void {
    for (let y = -r; y <= r; y++) { const hw = Math.floor(Math.sqrt(r * r - y * y)); this.rect(cx - hw, cy + y, hw * 2 + 1, 1, col); }
  }
  /** Filled trapezoid: top edge (tx0..tx1) at ty, bottom edge (bx0..bx1) at by (by > ty). */
  trap(tx0: number, tx1: number, ty: number, bx0: number, bx1: number, by: number, col: string): void {
    const n = Math.max(1, by - ty);
    for (let y = ty; y <= by; y++) { const f = (y - ty) / n; this.hline(tx0 + (bx0 - tx0) * f, tx1 + (bx1 - tx1) * f, y, col); }
  }
  tri(cx: number, ty: number, hb: number, by: number, col: string): void { this.trap(cx, cx, ty, cx - hb, cx + hb, by, col); }
  /** Upper half-ellipse (dome) with base at yy, radius rx, height ry. */
  dome(cx: number, yy: number, rx: number, ry: number, col: string): void {
    for (let j = 0; j <= ry; j++) { const f = 1 - (j * j) / (ry * ry + 0.001); if (f <= 0) continue; const hw = Math.floor(Math.sqrt(f) * rx); this.rect(cx - hw, yy - j, hw * 2 + 1, 1, col); }
  }
  spr(s: PixelSprite, x: number, yy: number, alpha = 1): void {
    if (alpha !== 1) this.c.globalAlpha = alpha;
    this.c.drawImage(s.canvas, Math.round(x + this.ox), Math.round(yy + this.oy));
    if (alpha !== 1) this.c.globalAlpha = 1;
  }
  alpha(a: number): void { this.c.globalAlpha = a; }
}

interface Ctx {
  r: Renderer; pal: CityPalette; tod: TimeOfDay; y: number; t: number; fog: number;
  lit: boolean; litP: number;
  far: string; mid: string; near: string;
  wFar: string; wMid: string; wNear: string;
  /** landmark accent colour adjusted for time of day and fog depth (0 near .. 1 far) */
  D: (c: string, depth?: number) => string;
  o: [number, number, number];
  sky: string;
}
const DIM: Record<TimeOfDay, number> = { dawn: 0.2, day: 0, dusk: 0.35, night: 0.62 };
const LITP: Record<TimeOfDay, number> = { dawn: 0.3, day: 0, dusk: 0.62, night: 0.7 };

function ctx(r: Renderer, pal: CityPalette, tod: TimeOfDay, px: number, y: number, t: number, fog: number): Ctx {
  const fb = Math.min(4, Math.round(Math.max(0, fog) * 4)) / 4;
  const lit = tod !== 'day';
  const F = (c: string, d: number) => (fb > 0 ? mix(c, pal.haze, Math.min(1, fb * d)) : c);
  const far = F(pal.farSky, 1), mid = F(mix(pal.farSky, pal.nearSky, 0.55), 0.6), near = F(pal.nearSky, 0.3);
  const win = (base: string, depth: number) => (lit ? F(mix(pal.glow, base, depth * 0.35), depth) : mix(base, '#ffffff', 0.14));
  const dim = DIM[tod];
  return {
    r, pal, tod, y, t, fog: fb, lit, litP: LITP[tod], far, mid, near,
    wFar: win(pal.farSky, 1), wMid: win(mid, 0.6), wNear: win(pal.nearSky, 0.2),
    D: (c, depth = 0.3) => F(dk(c, dim), depth),
    o: [Math.round(px * 0.3), Math.round(px * 0.6), Math.round(px)],
    sky: pal.skyBottom,
  };
}

// static layer cache
const LX = -48, LY = -136, LW = 336, LH = 144;
const layerCache = new Map<string, HTMLCanvasElement>();
function layer(c: Ctx, id: string, n: 0 | 1 | 2, paint: (p: Pt) => void): void {
  const key = `${id}|${n}|${c.tod}|${c.fog}`;
  let cv = layerCache.get(key);
  if (!cv) {
    if (layerCache.size > 48) layerCache.clear();
    cv = makeCanvas(LW, LH);
    paint(new Pt(cv.getContext('2d')!, -LX, -LY));
    layerCache.set(key, cv);
  }
  c.r.blit(cv, 0, 0, LW, LH, LX + c.o[n], c.y + LY);
}
/** Live painter for layer n (parallax applied). */
const live = (c: Ctx, n: 0 | 1 | 2) => new Pt(c.r.ctx, c.o[n], c.y);

interface BldOpts { ws?: number; sx?: number; sy?: number; roof?: number; win2?: string; alt?: string }
/** One tower at x with base at yy=0. Windows lit by hash; roof 0 flat, 1 antenna, 2 step, 3 spire, 4 crown. */
function bld(p: Pt, c: Ctx, x: number, w: number, h: number, col: string, win: string, seed: number, o: BldOpts = {}): void {
  const ws = o.ws ?? (w >= 12 ? 2 : 1), sx = o.sx ?? ws + 1, sy = o.sy ?? ws + 1;
  p.rect(x, -h, w, h, col);
  if (o.alt) p.rect(x + w - 2, -h, 2, h, o.alt);
  const roof = o.roof ?? Math.floor(H(seed, 9) * 5);
  if (roof === 1) p.vline(x + Math.floor(w / 2), -h - 3 - Math.floor(H(seed, 3) * 4), -h, col);
  else if (roof === 2) p.rect(x + 2, -h - 2, Math.max(1, w - 4), 2, col);
  else if (roof === 3) p.tri(x + Math.floor(w / 2), -h - 4, Math.floor(w / 2) - 1, -h, col);
  else if (roof === 4) { p.rect(x + 1, -h - 2, w - 2, 2, col); p.vline(x + 1, -h - 4, -h, col); p.vline(x + w - 2, -h - 4, -h, col); }
  let j = 0;
  for (let yy = -h + 2; yy <= -ws - 1; yy += sy, j++) {
    let i = 0;
    for (let xx = x + 1; xx + ws <= x + w - 1; xx += sx, i++) {
      const hh = H(seed, i, j);
      if (c.lit) { if (hh < c.litP) p.rect(xx, yy, ws, ws, o.win2 && hh < 0.08 ? o.win2 : win); }
      else if (hh < 0.8) p.rect(xx, yy, ws, ws, win);
    }
  }
}
/** A run of towers from x0 to x1. */
function towers(p: Pt, c: Ctx, x0: number, x1: number, seed: number, wMin: number, wMax: number, hMin: number, hMax: number, col: string, win: string, o: BldOpts = {}): void {
  let x = x0, i = 0;
  while (x < x1) {
    const w = wMin + Math.floor(H(seed, i, 1) * (wMax - wMin + 1));
    const h = hMin + Math.floor(H(seed, i, 2) * (hMax - hMin + 1));
    bld(p, c, x, w, h, col, win, seed * 31 + i, o);
    x += w + 1 + Math.floor(H(seed, i, 3) * 3);
    i++;
  }
}
/** Rounded hills across x0..x1 with peak heights hMin..hMax. */
function hills(p: Pt, x0: number, x1: number, seed: number, hMin: number, hMax: number, col: string, step = 26): void {
  for (let x = x0, i = 0; x < x1 + step; x += step, i++) {
    const h = hMin + Math.floor(H(seed, i) * (hMax - hMin));
    const rx = step * 0.9 + H(seed, i, 2) * step * 0.5;
    p.dome(x, 1, Math.round(rx), h, col);
  }
}
/** Mountain: triangle with optional snow cap (fraction of height). */
function mountain(p: Pt, cx: number, hb: number, h: number, col: string, snow?: string, snowF = 0.32): void {
  for (let j = 0; j < h; j++) {
    const yy = -h + j;
    const hw = Math.round((hb * (j + 1)) / h);
    const isSnow = snow && j < h * snowF;
    p.hline(cx - hw, cx + hw, yy, isSnow ? snow : col);
  }
  if (snow) {
    // jagged snow edge
    const j = Math.floor(h * snowF);
    const hw = Math.round((hb * (j + 1)) / h);
    for (let x = cx - hw; x <= cx + hw; x += 3) { const d = Math.floor(H(x, j) * 3); p.rect(x, -h + j, 2, d, snow); }
  }
}
/** Sakura crown (round, pink) with a dark trunk. */
function sakuraTree(p: Pt, c: Ctx, x: number, r: number, base = 0): void {
  const pk = c.D(P.sakura, 0.2), pk2 = c.D(P.pinkLight, 0.2);
  p.rect(x - 1, base - r - 2, 2, r + 2, c.near);
  p.disc(x, base - r - 3, r, pk);
  p.disc(x - r * 0.5, base - r - 2, Math.round(r * 0.6), pk);
  p.disc(x + r * 0.5, base - r - 2, Math.round(r * 0.6), pk);
  for (let i = 0; i < r * 2; i++) p.px(x - r + Math.floor(H(x, i) * r * 2), base - r - 4 + Math.floor(H(i, x) * r * 1.5), pk2);
}
/** Palm silhouette. */
function palm(p: Pt, x: number, h: number, col: string, lean = 1): void {
  for (let j = 0; j < h; j++) p.px(x + Math.round((j / h) * 3 * lean), -j, col);
  const tx = x + 3 * lean, ty = -h;
  for (const [dx, dy] of [[-6, 1], [-5, -2], [-2, -4], [2, -4], [5, -2], [6, 1]] as const) p.line(tx, ty, tx + dx, ty + dy, col);
  p.line(tx - 6, ty + 1, tx - 7, ty + 4, col); p.line(tx + 6, ty + 1, tx + 7, ty + 4, col);
}
/** Lattice tower (Tokyo Tower style): flared legs, decks, antenna. cols = [main, band]. */
function lattice(p: Pt, x: number, h: number, baseHW: number, topHW: number, cols: [string, string], decks: [number, number][], bands = 6): void {
  for (let j = 0; j < h; j++) {
    const yy = -j;
    const f = j / h;
    const hw = Math.max(1, Math.round(baseHW * (1 - f) * (1 - f) + topHW * (1 - (1 - f) * (1 - f))));
    const band = Math.floor((j / h) * bands) % 2 === 0;
    const col = band ? cols[0] : cols[1];
    if (hw >= 3 && j % 4 !== 0) { p.px(x - hw, yy, col); p.px(x + hw, yy, col); if (j % 4 === 2) p.hline(x - hw, x + hw, yy, col); }
    else p.hline(x - hw, x + hw, yy, col);
  }
  for (const [dy, dw] of decks) p.rect(x - dw, -dy - 4, dw * 2 + 1, 4, cols[0]);
  p.vline(x, -h - 10, -h, cols[0]);
}
/** Japanese castle keep: stone base, white tiers, dark roofs, gold ornaments. */
function castle(p: Pt, c: Ctx, x: number, w: number, tiers: number, roofCol: string, depth = 0.3): void {
  const stone = c.D('#5a5a68', depth), wall = c.D('#e8e8e0', depth), gold = c.D(P.gold, depth);
  p.trap(x - w * 0.42, x + w * 0.42, -12, x - w * 0.55, x + w * 0.55, 0, stone);
  let yy = -12, tw = w * 0.8;
  for (let i = 0; i < tiers; i++) {
    const th = i === tiers - 1 ? 9 : 8;
    p.rect(x - tw / 2, yy - th, tw, th, wall);
    for (let wx = x - tw / 2 + 2; wx < x + tw / 2 - 2; wx += 4) p.rect(wx, yy - th + 3, 2, 2, c.lit ? c.wNear : stone);
    // roof: wider than wall, eaves flick up
    p.trap(x - tw / 2 + 2, x + tw / 2 - 2, yy - th - 4, x - tw / 2 - 4, x + tw / 2 + 4, yy - th, roofCol);
    p.px(x - tw / 2 - 5, yy - th - 1, roofCol); p.px(x + tw / 2 + 5, yy - th - 1, roofCol);
    yy -= th + 4; tw = Math.round(tw * 0.78);
  }
  // top ridge + shachihoko
  p.hline(x - tw / 2 + 1, x + tw / 2 - 1, yy, roofCol);
  p.rect(x - tw / 2, yy - 3, 2, 3, gold); p.rect(x + tw / 2 - 2, yy - 3, 2, 3, gold);
  p.px(x - tw / 2 - 1, yy - 3, gold); p.px(x + tw / 2, yy - 3, gold);
}
/** Pagoda with n tiers. */
function pagoda(p: Pt, c: Ctx, x: number, n: number, w: number, tierH: number, body: string, roof: string, depth = 0.3): void {
  let yy = 0, tw = w;
  for (let i = 0; i < n; i++) {
    p.rect(x - tw / 2 + 2, yy - tierH, tw - 4, tierH, body);
    if (c.lit) p.rect(x - 1, yy - tierH + 2, 2, 2, c.wNear);
    p.trap(x - tw / 2 + 3, x + tw / 2 - 3, yy - tierH - 3, x - tw / 2, x + tw / 2, yy - tierH, roof);
    p.px(x - tw / 2 - 1, yy - tierH - 1, roof); p.px(x + tw / 2, yy - tierH - 1, roof);
    yy -= tierH + 3; tw = Math.max(6, tw - 3);
  }
  p.vline(x, yy - 9, yy, roof);
  for (let k = 0; k < 4; k++) p.hline(x - 1, x + 1, yy - 2 - k * 2, c.D(P.gold, depth));
}
/** Torii gate. */
function torii(p: Pt, x: number, w: number, h: number, col: string, base = 0): void {
  p.rect(x - w / 2, base - h, 2, h, col); p.rect(x + w / 2 - 1, base - h, 2, h, col);
  p.hline(x - w / 2 - 3, x + w / 2 + 2, base - h, col); p.hline(x - w / 2 - 2, x + w / 2 + 1, base - h + 1, col);
  p.px(x - w / 2 - 3, base - h - 1, col); p.px(x + w / 2 + 2, base - h - 1, col);
  p.hline(x - w / 2 - 1, x + w / 2, base - h + 5, col);
}
/** Blinking aircraft-warning light (dusk/night). */
function beacon(p: Pt, c: Ctx, x: number, yy: number, phase: number): void {
  if (!c.lit) return;
  const on = Math.sin(c.t * 5 + phase) > 0.2;
  if (on) { p.alpha(0.35); p.rect(x - 2, yy - 2, 5, 5, P.red); p.alpha(1); p.rect(x - 1, yy - 1, 3, 3, P.red); p.px(x, yy, '#ff9090'); }
  else p.px(x, yy, P.redDark);
}
/** Sun with banded glow (bands drawn as concentric discs). */
function sun(c: Ctx, x: number, yy: number, R: number): void {
  const r = c.r, col = c.pal.sun ?? P.yellowLight, y = c.y + yy;
  r.disc(x, y, R + 9, col, 0.10); r.disc(x, y, R + 6, col, 0.14); r.disc(x, y, R + 3, col, 0.22);
  r.disc(x, y, R, col);
  if (c.tod !== 'day') {
    const low = mix(col, P.orange, 0.55), low2 = mix(col, P.red, 0.45);
    for (let j = 2; j <= R; j++) { const hw = Math.floor(Math.sqrt(R * R - j * j)); r.fillRect(x - hw, y + j, hw * 2 + 1, 1, j > R * 0.62 ? low2 : j > R * 0.3 ? low : col); }
    for (let j = Math.round(R * 0.35); j < R; j += 4) { const hw = Math.floor(Math.sqrt(R * R - j * j)); r.fillRect(x - hw, y + j, hw * 2 + 1, 1, mix(col, c.pal.skyBottom, 0.35)); }
  }
}
function moon(c: Ctx, x: number, yy: number, R: number): void {
  const r = c.r, col = c.pal.moon ?? P.white, y = c.y + yy;
  r.disc(x, y, R + 5, col, 0.08); r.disc(x, y, R + 2, col, 0.14);
  r.disc(x, y, R, col);
  r.px(x - 2, y - 1, mix(col, '#000000', 0.2)); r.fillRect(x + 1, y + 2, 2, 1, mix(col, '#000000', 0.2)); r.px(x, y - 3, mix(col, '#000000', 0.2));
}
function stars(c: Ctx, n = 42): void {
  if (c.tod !== 'night') return;
  const r = c.r;
  for (let i = 0; i < n; i++) {
    const x = Math.floor(H(i, 1) * 240), yy = -136 + Math.floor(H(i, 2) * 110);
    const tw = 0.55 + 0.45 * Math.sin(c.t * 2.2 + i * 1.7);
    r.fillRect(x, c.y + yy, 1, 1, P.white, tw);
    if (H(i, 3) < 0.15) { r.px(x - 1, c.y + yy, mix(P.white, c.pal.skyTop, 0.5)); r.px(x + 1, c.y + yy, mix(P.white, c.pal.skyTop, 0.5)); }
  }
}
/** Pixel clouds drifting with t; colours from tod. */
function clouds(c: Ctx, n: number, seed: number, yMin: number, yMax: number, speed = 3): void {
  const pal = c.pal;
  let col: string, sh: string;
  if (c.tod === 'dusk') { col = mix(pal.haze, P.pinkLight, 0.55); sh = mix(col, pal.skyTop, 0.4); }
  else if (c.tod === 'dawn') { col = mix(pal.skyBottom, P.pinkLight, 0.5); sh = mix(col, pal.skyTop, 0.35); }
  else if (c.tod === 'night') { col = mix(pal.skyTop, '#8080a0', 0.28); sh = mix(pal.skyTop, '#8080a0', 0.14); }
  else { col = mix(P.white, pal.skyBottom, 0.12); sh = mix(pal.skyBottom, P.white, 0.45); }
  const p = new Pt(c.r.ctx, 0, c.y);
  for (let i = 0; i < n; i++) {
    const w = 18 + Math.floor(H(seed, i, 1) * 26), h = 3 + Math.floor(H(seed, i, 2) * 3);
    const x = ((H(seed, i, 3) * 320 + c.t * speed * (0.6 + H(seed, i, 4)) + c.o[0] * 0.5) % 320) - 40;
    const yy = yMin + Math.floor(H(seed, i, 5) * (yMax - yMin));
    p.rect(x, yy, w, h, sh);
    p.rect(x + 2, yy - 1, w - 4, 1, col); p.rect(x, yy, w, h - 1, col);
    p.rect(x + Math.floor(w * 0.2), yy - 3, Math.floor(w * 0.35), 3, col);
    p.rect(x + Math.floor(w * 0.55), yy - 2, Math.floor(w * 0.3), 2, col);
    p.rect(x + Math.floor(w * 0.3), yy - 4, Math.floor(w * 0.15), 1, col);
  }
}
/** Haze band above the horizon for depth. */
function hazeBand(c: Ctx, h: number, a: number): void {
  const r = c.r;
  for (let i = 0; i < 3; i++) r.fillRect(0, c.y - h + Math.round((h * i) / 3), r.w, Math.ceil(h / 3), c.pal.haze, (a + c.fog * 0.25) * ((i + 1) / 3));
}

// neon signs (kanjiSprite + panel), cached per text/colour/lit
const signCache = new Map<string, PixelSprite>();
function neonSprite(text: string, col: string, vertical: boolean, size: number, lit: boolean): PixelSprite {
  const key = `${text}|${col}|${vertical ? 'v' : 'h'}|${size}|${lit ? 1 : 0}`;
  const hit = signCache.get(key);
  if (hit) return hit;
  const ks = kanjiSprite(text, { size, vertical, color: lit ? P.white : mix(col, P.ink, 0.35), bold: true, gap: vertical ? 2 : 1 });
  const w = ks.w + 5, h = ks.h + 5;
  const cv = makeCanvas(w, h);
  const x = cv.getContext('2d')!;
  x.fillStyle = lit ? col : mix(col, P.ink, 0.6); x.fillRect(0, 0, w, h);
  x.fillStyle = P.ink; x.fillRect(1, 1, w - 2, h - 2);
  x.drawImage(ks.canvas, 2, 2);
  const spr = spriteFromCanvas(key, cv, 0, 0);
  signCache.set(key, spr);
  return spr;
}
/** Draw a neon sign (top-left at x,yy in layer n) with halo + flicker at night. */
function neon(c: Ctx, n: 0 | 1 | 2, text: string, x: number, yy: number, col: string, vertical = false, size = 12, seed = 0): void {
  const s = neonSprite(text, col, vertical, size, c.lit);
  const p = live(c, n);
  let a = 1;
  if (c.lit) {
    const fl = H(Math.floor(c.t * 7) + seed * 13);
    a = fl < 0.06 ? 0.45 : 1;
    p.alpha(0.22 * a); p.rect(x - 2, yy - 2, s.w + 4, s.h + 4, col); p.alpha(1);
  }
  p.spr(s, x, yy, a);
}
/** Overpass / elevated expressway silhouette. */
function overpass(p: Pt, c: Ctx, x0: number, x1: number, yy: number, col: string, piers = 26): void {
  p.rect(x0, yy, x1 - x0, 3, col);
  p.hline(x0, x1 - 1, yy - 2, col);
  for (let x = x0 + 1; x < x1; x += 4) p.px(x, yy - 1, col);
  for (let x = x0 + 8; x < x1; x += piers) { p.rect(x, yy + 3, 3, -yy - 3, col); }
  if (c.lit) for (let x = x0 + 6; x < x1; x += 13) { p.px(x, yy - 4, c.pal.glow); p.px(x, yy - 3, col); }
}
/** Junk boat silhouette with batten sails. */
function junk(p: Pt, c: Ctx, x: number, yy: number, sail: string): void {
  p.trap(x - 8, x + 8, yy - 3, x - 6, x + 7, yy, c.near);
  p.rect(x - 1, yy - 16, 1, 13, c.near);
  for (let j = 0; j < 12; j++) p.hline(x, x + 2 + Math.round(j * 0.7), yy - 15 + j, j % 3 === 0 ? c.near : sail);
  p.rect(x - 7, yy - 10, 1, 7, c.near);
  for (let j = 0; j < 6; j++) p.hline(x - 6, x - 5 + Math.round(j * 0.5), yy - 9 + j, j % 3 === 0 ? c.near : sail);
}
/** Ferris wheel, rotating with t. */
function ferris(c: Ctx, n: 0 | 1 | 2, cx: number, cy: number, R: number, col: string, cab: string): void {
  const p = live(c, n);
  p.line(cx - R * 0.6, 0, cx, cy, col); p.line(cx + R * 0.6, 0, cx, cy, col);
  const steps = Math.round(R * 4);
  for (let i = 0; i < steps; i++) { const a = (i / steps) * Math.PI * 2; p.px(cx + Math.cos(a) * R, cy + Math.sin(a) * R, col); }
  for (let i = 0; i < 8; i++) {
    const a = c.t * 0.25 + (i / 8) * Math.PI * 2;
    p.line(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, col);
    p.rect(cx + Math.cos(a) * R - 1, cy + Math.sin(a) * R - 1, 3, 3, c.lit && i % 2 === 0 ? c.pal.glow : cab);
  }
}
/** Cable-stayed bridge deck with A-pylons. */
function cableBridge(p: Pt, c: Ctx, x0: number, x1: number, yy: number, pylons: number[], ph: number, col: string): void {
  p.rect(x0, yy, x1 - x0, 3, col);
  for (let x = x0 + 4; x < x1; x += 30) p.rect(x, yy + 3, 2, -yy - 3, col);
  for (const px of pylons) {
    p.line(px - 4, yy + 3, px, -ph, col); p.line(px + 4, yy + 3, px, -ph, col); p.rect(px - 1, -ph, 3, ph + yy, col);
    for (let k = 1; k <= 5; k++) { p.line(px, -ph + k * 2, px - 5 - k * 5, yy, col); p.line(px, -ph + k * 2, px + 5 + k * 5, yy, col); }
    beacon(p, c, px, -ph - 1, px);
  }
}

// ── generic sky pass (stars, sun/moon, clouds) shared by all cities ──────────
interface SkyOpts { sunDusk?: [number, number, number]; sunDay?: [number, number, number]; sunDawn?: [number, number, number]; moonAt?: [number, number, number]; clouds?: number; cloudY?: [number, number] }
function skyPass(c: Ctx, o: SkyOpts = {}): void {
  stars(c);
  const sx = c.o[0] * 0.3;
  if (c.tod === 'dusk') { const [x, yy, R] = o.sunDusk ?? [96, -58, 20]; sun(c, x + sx, yy, R); }
  else if (c.tod === 'dawn') { const [x, yy, R] = o.sunDawn ?? [60, -46, 14]; sun(c, x + sx, yy, R); }
  else if (c.tod === 'day') { const [x, yy, R] = o.sunDay ?? [196, -122, 9]; sun(c, x + sx, yy, R); }
  else { const [x, yy, R] = o.moonAt ?? [190, -104, 8]; moon(c, x + sx, yy, R); }
  const [y0, y1] = o.cloudY ?? [-124, -70];
  clouds(c, o.clouds ?? 6, 7, y0, y1);
}

// ═════════════════════════════════════════════════════════════════════════════
// TOKYO — Fuji, Skytree, Tokyo Tower, dense neon towers, overpass, sakura.
// ═════════════════════════════════════════════════════════════════════════════
const tokyo: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [92, -60, 21], sunDawn: [70, -50, 15] });
  // far: Mt. Fuji + distant towers
  layer(c, 'tokyo', 0, (p) => {
    const fujiCol = mix(c.far, pal.skyBottom, c.tod === 'night' ? 0.15 : 0.3);
    const snow = c.tod === 'night' ? '#aab4d0' : c.tod === 'dusk' ? '#ffe0e8' : P.white;
    mountain(p, 156, 78, 74, fujiCol, snow, 0.34);
    for (let j = 0; j < 30; j++) p.hline(156 - Math.round(78 * (44 + j) / 74) + Math.floor(H(j) * 6), 156 - Math.round(78 * (44 + j) / 74) + 8, -30 + j, mix(fujiCol, c.far, 0.5));
    towers(p, c, -48, 300, 11, 7, 14, 16, 42, c.far, c.wFar, { ws: 1, sx: 2, sy: 3 });
  });
  hazeBand(c, 44, 0.14);
  // mid: Skytree (left), Tokyo Tower (right), dense towers
  layer(c, 'tokyo', 1, (p) => {
    towers(p, c, -48, 300, 23, 9, 19, 26, 66, c.mid, c.wMid, { ws: 1, sx: 2, sy: 3 });
    // Skytree
    const st = mix(c.mid, P.white, c.tod === 'day' ? 0.35 : 0.15);
    lattice(p, 52, 108, 7, 2, [st, st], [[62, 7], [88, 5]], 1);
    p.rect(50, -128, 5, 20, st); p.vline(52, -136, -128, st);
    if (c.lit) { p.rect(45, -66, 15, 2, mix(P.cyan, c.mid, 0.3)); p.rect(47, -92, 11, 2, mix(P.cyan, c.mid, 0.3)); }
    // Tokyo Tower
    lattice(p, 206, 96, 16, 2, [c.D(P.red, 0.5), c.D(P.white, 0.5)], [[44, 9], [76, 5]], 7);
  });
  hazeBand(c, 22, 0.1);
  // near: big towers with neon, overpass, sakura
  layer(c, 'tokyo', 2, (p) => {
    towers(p, c, -48, 300, 5, 14, 28, 34, 78, c.near, c.wNear, { ws: 2, sx: 4, sy: 4, win2: c.lit ? c.D(P.cyan, 0) : undefined });
    if (c.lit) for (let i = 0; i < 9; i++) { const x = -40 + Math.floor(H(i, 77) * 320); p.rect(x, -30 - Math.floor(H(i, 78) * 30), 1, 20, i % 2 ? c.D(P.pink, 0) : c.D(P.cyan, 0)); }
    overpass(p, c, -48, 300, -12, mix(c.near, P.black, 0.25), 30);
    for (const [x, rr] of [[6, 5], [22, 6], [40, 5], [200, 5], [218, 6], [236, 5], [-20, 5], [262, 6]] as const) sakuraTree(p, c, x, rr);
  });
  neon(c, 2, '東京', 34, -78, P.red, true, 14, 1);
  neon(c, 2, 'JDM', 98, -52, P.cyan, false, 10, 2);
  neon(c, 2, '伝説', 128, -70, P.pink, true, 11, 3);
  neon(c, 2, 'ガレージ', 170, -40, P.yellow, false, 9, 4);
  neon(c, 2, 'スピード', 8, -34, P.cyan, false, 9, 5);
  neon(c, 2, '日本', 224, -62, P.red, true, 12, 6);
  const m = live(c, 1);
  beacon(m, c, 52, -137, 0); beacon(m, c, 206, -107, 1.3); beacon(m, c, 52, -93, 2.6);
  const nn = live(c, 2);
  beacon(nn, c, 74, -84, 0.7); beacon(nn, c, 186, -80, 2.1);
};

// ═════════════════════════════════════════════════════════════════════════════
// OSAKA — Tsutenkaku, Osaka Castle, Umeda Sky Building, Dotonbori neon, Glico runner.
// ═════════════════════════════════════════════════════════════════════════════
let glicoSpr: PixelSprite | null = null;
function glico(): PixelSprite {
  if (glicoSpr) return glicoSpr;
  const rows = [
    'rrrrrrrrrrrrrrrrrrrrrrrr', 'ruuuuuuuuuuuuuuuuuuuuuur', 'ruuuuuuuuuuwwuuuuuuuuuur', 'ruuuuuuuuuwwwwuuuuuuuuur', 'ruuuuuuuuuuwwuuuuuuuuuur',
    'ruuuuuuuwwwwwwwwwuuuuuur', 'ruuuuuwwuuwwwwuuuwwuuuur', 'ruuuuwuuuuwwwwuuuuuuuuur', 'ruuuuuuuuwwwwwwuuuuuuuur', 'ruuuuuuuwwwuuuwwuuuuuuur',
    'ruuuuuuwwuuuuuuwwuuuuuur', 'ruuuuuwwuuuuuuuuwwuuuuur', 'ruuuuwwuuuuuuuuuuwwuuuur', 'ruyyyyyyyyyyyyyyyyyyyyur', 'ruuuuuuuuuuuuuuuuuuuuuur', 'rrrrrrrrrrrrrrrrrrrrrrrr',
  ];
  const map: Record<string, string> = { r: P.red, u: P.blue, w: P.white, y: P.yellow };
  const cv = makeCanvas(24, 16);
  const x = cv.getContext('2d')!;
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { x.fillStyle = map[row[i]]; x.fillRect(i, j, 1, 1); } });
  glicoSpr = spriteFromCanvas('glico', cv, 0, 0);
  return glicoSpr;
}
const osaka: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [140, -56, 18], sunDawn: [172, -44, 13] });
  layer(c, 'osaka', 0, (p) => {
    hills(p, -48, 300, 4, 14, 26, mix(c.far, pal.skyBottom, 0.2), 34);
    towers(p, c, -48, 300, 13, 7, 14, 14, 36, c.far, c.wFar, { ws: 1, sx: 2, sy: 3 });
  });
  hazeBand(c, 40, 0.14);
  layer(c, 'osaka', 1, (p) => {
    towers(p, c, -48, 300, 29, 9, 18, 22, 56, c.mid, c.wMid, { ws: 1, sx: 2, sy: 3 });
    // Umeda Sky Building: twin towers + floating garden
    const um = mix(c.mid, P.white, c.tod === 'day' ? 0.2 : 0.08);
    bld(p, c, 46, 12, 70, um, c.wMid, 501, { roof: 0, ws: 1, sx: 2, sy: 3 });
    bld(p, c, 68, 12, 70, um, c.wMid, 502, { roof: 0, ws: 1, sx: 2, sy: 3 });
    p.rect(44, -80, 38, 10, um); p.rect(56, -78, 14, 6, c.sky); p.hline(44, 81, -81, mix(um, P.white, 0.2));
    p.line(58, -70, 46, -40, mix(um, P.black, 0.3)); p.line(68, -70, 80, -40, mix(um, P.black, 0.3));
    // Osaka Castle
    castle(p, c, 196, 44, 3, c.D('#2a8a70', 0.5), 0.5);
  });
  hazeBand(c, 22, 0.1);
  layer(c, 'osaka', 2, (p) => {
    towers(p, c, -48, 300, 7, 14, 26, 28, 62, c.near, c.wNear, { ws: 2, sx: 4, sy: 4, win2: c.lit ? c.D(P.pink, 0) : undefined });
    // Tsutenkaku
    const tc = c.D('#c0c0c8', 0.1);
    p.trap(126, 134, -20, 118, 142, 0, c.near);
    p.rect(124, -28, 12, 8, c.sky); p.rect(122, -22, 16, 2, tc);
    p.trap(128, 132, -60, 126, 134, -22, tc);
    p.rect(122, -66, 16, 8, tc); p.rect(123, -70, 14, 4, tc); p.hline(121, 138, -71, tc);
    if (c.lit) { p.rect(124, -64, 12, 4, c.pal.glow); p.rect(129, -58, 2, 34, c.D(P.pink, 0)); }
    p.vline(130, -84, -71, tc); p.rect(129, -78, 3, 3, c.lit ? c.D(P.cyan, 0) : tc);
    // canal (Dotonbori) reflections
    if (c.lit) for (let x = -40; x < 300; x += 7) p.px(x + Math.floor(H(x) * 4), -2 - Math.floor(H(x, 2) * 3), c.D([P.pink, P.cyan, P.yellow][x % 21 === 0 ? 0 : x % 14 === 0 ? 1 : 2], 0));
    for (const [x, rr] of [[10, 5], [232, 5], [-20, 5], [258, 5]] as const) sakuraTree(p, c, x, rr);
  });
  const p2 = live(c, 2);
  p2.rect(30, -58, 28, 20, c.D(P.white, 0.1)); p2.spr(glico(), 32, -56, c.lit ? 1 : 0.8);
  neon(c, 2, '大阪', 190, -78, P.red, true, 14, 1);
  neon(c, 2, 'たこ焼き', 70, -44, P.yellow, false, 9, 2);
  neon(c, 2, '道頓堀', 150, -48, P.cyan, false, 10, 3);
  neon(c, 2, 'グリコ', 8, -34, P.pink, false, 9, 4);
  neon(c, 2, 'かに', 222, -40, P.orange, true, 11, 5);
  const m = live(c, 1); beacon(m, c, 52, -82, 0); beacon(m, c, 74, -82, 1.5);
  beacon(p2, c, 130, -85, 2.4);
};

// ═════════════════════════════════════════════════════════════════════════════
// KYOTO — To-ji pagoda, Kiyomizu stage, Kyoto Tower, torii rows, hills, sakura.
// ═════════════════════════════════════════════════════════════════════════════
const kyoto: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [128, -54, 17], sunDawn: [90, -48, 14], clouds: 5 });
  layer(c, 'kyoto', 0, (p) => {
    hills(p, -48, 300, 8, 40, 66, mix(c.far, pal.skyBottom, 0.25), 44);
    hills(p, -60, 300, 9, 22, 44, c.far, 30);
    // faint far pagoda on the hill
    pagoda(p, c, 214, 3, 12, 4, c.far, mix(c.far, P.black, 0.3), 1);
  });
  hazeBand(c, 40, 0.16);
  layer(c, 'kyoto', 1, (p) => {
    const roof = c.D('#3a3a48', 0.5), wall = c.D('#e0d8c0', 0.5), wood = c.D(P.brown, 0.5);
    // temple roofs row (low)
    for (let x = -40, i = 0; x < 300; x += 36 + Math.floor(H(i, 3) * 20), i++) {
      const w = 22 + Math.floor(H(i, 4) * 12);
      p.rect(x + 3, -12, w - 6, 12, wall);
      p.trap(x + 6, x + w - 6, -20, x - 1, x + w + 1, -13, roof);
      p.px(x - 2, -15, roof); p.px(x + w + 2, -15, roof);
      if (c.lit) for (let wx = x + 5; wx < x + w - 5; wx += 5) p.rect(wx, -8, 2, 3, c.wMid);
    }
    // Kiyomizu-style stage on stilts (left)
    p.rect(20, -34, 44, 12, wall);
    p.trap(26, 58, -46, 14, 70, -35, roof); p.px(12, -37, roof); p.px(72, -37, roof);
    for (let x = 22; x < 64; x += 6) { p.vline(x, -22, 0, wood); }
    p.hline(20, 64, -22, wood); p.hline(20, 64, -12, wood);
    for (let x = 25; x < 64; x += 6) { p.line(x, -22, x + 3, -12, wood); }
    // To-ji five-storey pagoda (centre-right)
    pagoda(p, c, 156, 5, 30, 8, wall, roof, 0.5);
    // Kyoto Tower (white candle, red ring)
    const kt = c.D('#ececf0', 0.5);
    p.trap(94, 106, -40, 86, 114, 0, mix(c.mid, P.white, 0.1));
    p.trap(98, 102, -78, 95, 105, -40, kt);
    p.rect(93, -70, 14, 5, c.D(P.red, 0.5)); p.rect(94, -75, 12, 3, kt);
    p.vline(100, -90, -78, kt); if (c.lit) p.rect(93, -70, 14, 1, c.pal.glow);
  });
  hazeBand(c, 20, 0.1);
  layer(c, 'kyoto', 2, (p) => {
    // machiya row
    const wall = c.D('#5a4a3a', 0.2), roof = mix(c.near, P.black, 0.2);
    for (let x = -48, i = 0; x < 300; x += 18 + Math.floor(H(i, 5) * 10), i++) {
      const w = 14 + Math.floor(H(i, 6) * 10), h = 12 + Math.floor(H(i, 7) * 8);
      p.rect(x, -h, w, h, c.near); p.rect(x + 2, -h + 4, w - 4, h - 4, wall);
      p.trap(x + 2, x + w - 2, -h - 3, x - 1, x + w + 1, -h, roof);
      for (let wx = x + 3; wx < x + w - 3; wx += 3) p.vline(wx, -h + 5, -2, c.near);
      if (c.lit && H(i, 8) < 0.7) { p.rect(x + Math.floor(w / 2) - 1, -h + 1, 2, 3, c.D(P.orange, 0)); }
    }
    // Fushimi torii tunnel (right) receding
    const tr = c.D(P.red, 0.1);
    for (let i = 0; i < 6; i++) torii(p, 196 + i * 9, 18 - i * 2, 26 - i * 3, tr);
    torii(p, 60, 24, 30, tr);
    for (const [x, rr] of [[6, 6], [30, 5], [110, 5], [140, 6], [172, 5], [246, 5], [-24, 5], [270, 5]] as const) sakuraTree(p, c, x, rr);
  });
  neon(c, 2, '京都', 118, -56, P.brown, true, 13, 1);
  neon(c, 2, '祇園', 214, -54, P.red, false, 10, 2);
  neon(c, 2, '抹茶', 22, -46, P.green, false, 9, 3);
  const m = live(c, 1); beacon(m, c, 100, -91, 0.4);
};

// ═════════════════════════════════════════════════════════════════════════════
// NAGOYA — Nagoya Castle (golden shachihoko), TV tower, JR twin towers, Oasis 21.
// ═════════════════════════════════════════════════════════════════════════════
const nagoya: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [60, -58, 19], sunDawn: [130, -46, 13] });
  layer(c, 'nagoya', 0, (p) => {
    hills(p, -48, 300, 14, 12, 24, mix(c.far, pal.skyBottom, 0.25), 40);
    towers(p, c, -48, 300, 17, 7, 14, 14, 40, c.far, c.wFar, { ws: 1, sx: 2, sy: 3 });
  });
  hazeBand(c, 40, 0.14);
  layer(c, 'nagoya', 1, (p) => {
    towers(p, c, -48, 300, 31, 9, 18, 20, 52, c.mid, c.wMid, { ws: 1, sx: 2, sy: 3 });
    // TV tower (silver lattice)
    const sv = c.D('#d0d0dc', 0.5);
    lattice(p, 72, 92, 14, 2, [sv, mix(sv, c.mid, 0.4)], [[40, 8], [70, 4]], 8);
    // Nagoya Castle with golden shachihoko
    castle(p, c, 176, 52, 3, c.D('#2a6a4a', 0.5), 0.5);
    // Oasis 21 spaceship (glass oval on struts)
    const gl = c.D(P.cyan, 0.5);
    p.rect(112, -24, 2, 24, c.mid); p.rect(136, -24, 2, 24, c.mid);
    for (let j = 0; j < 4; j++) { const hw = [6, 14, 19, 22][j]; p.hline(125 - hw, 125 + hw, -30 + j, j === 0 ? mix(gl, P.white, 0.4) : gl); }
    p.hline(103, 147, -26, c.mid);
  });
  hazeBand(c, 22, 0.1);
  layer(c, 'nagoya', 2, (p) => {
    towers(p, c, -48, 300, 9, 14, 26, 26, 60, c.near, c.wNear, { ws: 2, sx: 4, sy: 4 });
    // JR Central Towers: twin cylinders with rounded tops
    const jr = mix(c.near, P.white, 0.05);
    for (const x of [18, 44]) { bld(p, c, x, 18, 78, jr, c.wNear, x, { roof: 0, ws: 2, sx: 4, sy: 4 }); p.dome(x + 9, -78, 9, 6, jr); }
    p.rect(16, -34, 48, 34, jr); if (c.lit) for (let wx = 18; wx < 62; wx += 4) for (let wy = -32; wy < -4; wy += 4) if (H(wx, wy) < 0.6) p.rect(wx, wy, 2, 2, c.wNear);
    // Mode Gakuen Spiral Towers
    const sp = mix(c.near, P.white, 0.08);
    for (let j = 0; j < 80; j++) { const f = j / 80; const hw = Math.round(11 * (1 - f * 0.55)); const sh = Math.round(Math.sin(f * 4.5) * 3); p.hline(214 + sh - hw, 214 + sh + hw, -j, sp); if (c.lit && j % 5 === 2) p.px(214 + sh - hw + 1 + (j % 3), -j, c.wNear); }
    for (let j = 0; j < 80; j += 6) { const f = j / 80; const sh = Math.round(Math.sin(f * 4.5) * 3); p.px(214 + sh, -j, mix(sp, P.black, 0.35)); }
    for (const [x, rr] of [[86, 5], [104, 4], [154, 5], [-16, 5], [260, 5]] as const) sakuraTree(p, c, x, rr);
  });
  neon(c, 2, '名古屋', 90, -46, P.red, false, 10, 1);
  neon(c, 2, 'みそカツ', 154, -40, P.yellow, false, 9, 2);
  neon(c, 2, 'JDM', 240, -58, P.cyan, false, 10, 3);
  neon(c, 2, '金鯱', 118, -78, P.yellow, true, 12, 4);
  const m = live(c, 1); beacon(m, c, 72, -103, 0.2);
  const n2 = live(c, 2); beacon(n2, c, 27, -85, 1.1); beacon(n2, c, 53, -85, 2.2); beacon(n2, c, 212, -81, 3);
};

// ═════════════════════════════════════════════════════════════════════════════
// FUKUOKA — Fukuoka Tower, dome, harbour, ferris wheel, palms.
// ═════════════════════════════════════════════════════════════════════════════
const fukuoka: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [150, -54, 19], sunDawn: [50, -44, 13], clouds: 7 });
  layer(c, 'fukuoka', 0, (p) => {
    hills(p, -48, 300, 21, 18, 34, mix(c.far, pal.skyBottom, 0.25), 38);
    // sea band
    const sea = mix(pal.skyBottom, c.tod === 'night' ? '#102040' : P.teal, c.tod === 'night' ? 0.6 : 0.45);
    p.rect(-48, -8, 336, 9, sea);
    for (let x = -48; x < 300; x += 5) if (H(x) < 0.45) p.px(x, -7 + Math.floor(H(x, 1) * 6), mix(sea, c.lit ? pal.glow : P.white, 0.5));
    towers(p, c, 150, 300, 19, 7, 13, 10, 28, c.far, c.wFar, { ws: 1, sx: 2, sy: 3 });
  });
  hazeBand(c, 36, 0.12);
  layer(c, 'fukuoka', 1, (p) => {
    towers(p, c, 110, 300, 33, 9, 16, 16, 44, c.mid, c.wMid, { ws: 1, sx: 2, sy: 3 });
    // Fukuoka Tower (mirror triangle)
    const mir = mix(c.mid, pal.skyBottom, c.tod === 'day' ? 0.5 : 0.25);
    for (let j = 0; j < 100; j++) { const hw = Math.round(8 - (j / 100) * 5); p.hline(62 - hw, 62 + hw, -j, j % 6 === 0 ? mix(mir, P.black, 0.25) : mir); }
    p.vline(62, -112, -100, c.mid); p.rect(58, -104, 9, 2, c.mid);
    if (c.lit) for (let j = 4; j < 96; j += 6) p.px(62 + ((j / 6) % 2 ? 2 : -2), -j, c.wMid);
    // PayPay Dome
    const dm = c.D('#9a9aa8', 0.5);
    p.dome(182, 0, 34, 26, dm);
    for (let k = -2; k <= 2; k++) p.line(182, -26, 182 + k * 14, 0, mix(dm, P.black, 0.3));
    p.hline(150, 214, -1, mix(dm, P.black, 0.3));
  });
  hazeBand(c, 20, 0.1);
  layer(c, 'fukuoka', 2, (p) => {
    towers(p, c, -48, 44, 9, 14, 24, 22, 50, c.near, c.wNear, { ws: 2, sx: 4, sy: 4 });
    towers(p, c, 226, 300, 10, 14, 24, 22, 50, c.near, c.wNear, { ws: 2, sx: 4, sy: 4 });
    // pier + boats
    p.rect(80, -3, 120, 3, c.near);
    p.rect(90, -8, 14, 5, c.near); p.rect(93, -12, 4, 4, c.near); p.px(102, -9, c.lit ? P.red : c.near);
    p.rect(150, -7, 10, 4, c.near); p.vline(154, -14, -7, c.near); p.tri(156, -13, 2, -8, mix(c.near, P.white, 0.3));
    for (const [x, h] of [[70, 20], [116, 16], [204, 18], [-10, 18], [250, 20]] as const) palm(p, x, h, c.near, x < 120 ? 1 : -1);
  });
  ferris(c, 2, 176, -30, 17, c.near, c.D(P.red, 0));
  neon(c, 2, '福岡', 14, -70, P.red, true, 14, 1);
  neon(c, 2, '博多', 232, -74, P.cyan, true, 12, 2);
  neon(c, 2, 'ラーメン', 100, -30, P.yellow, false, 9, 3);
  neon(c, 2, '屋台', 38, -36, P.orange, false, 9, 4);
  const m = live(c, 1); beacon(m, c, 62, -113, 0.5);
};

// ═════════════════════════════════════════════════════════════════════════════
// SEOUL — N Seoul Tower on Namsan, Lotte World Tower, 63 Building, Namdaemun, hangul neon.
// ═════════════════════════════════════════════════════════════════════════════
const seoul: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [110, -60, 18], sunDawn: [180, -46, 13] });
  layer(c, 'seoul', 0, (p) => {
    // Bukhansan jagged granite ridge
    const rid = mix(c.far, pal.skyBottom, 0.25);
    for (let x = -48, i = 0; x < 300; x += 14, i++) { const h = 28 + Math.floor(H(i, 41) * 34); p.tri(x, -h, 14 + Math.floor(H(i, 42) * 8), 1, rid); }
    // Namsan hill with N Seoul Tower
    p.dome(150, 1, 70, 40, c.far);
    const tw = mix(c.far, P.white, 0.2);
    p.rect(144, -50, 12, 10, c.far);
    p.trap(148, 152, -96, 147, 153, -50, tw);
    p.rect(143, -100, 14, 6, tw); p.rect(144, -104, 12, 4, tw); p.hline(142, 158, -101, tw);
    p.vline(150, -124, -104, tw); p.rect(149, -110, 3, 4, tw);
    if (c.lit) p.rect(144, -99, 12, 2, c.pal.glow);
  });
  hazeBand(c, 40, 0.14);
  layer(c, 'seoul', 1, (p) => {
    towers(p, c, -48, 300, 37, 9, 18, 18, 54, c.mid, c.wMid, { ws: 1, sx: 2, sy: 3 });
    // Lotte World Tower: tall tapering, pointed sloped top
    const lt = mix(c.mid, pal.skyBottom, 0.2), lt2 = mix(c.mid, P.white, 0.05);
    for (let j = 0; j < 130; j++) { const f = j / 130; const hw = Math.round(9 - f * 5); const cut = j > 118 ? Math.round((j - 118) * 0.6) : 0; p.hline(48 - hw + cut, 48 + hw, -j, j % 2 ? lt : lt2); if (c.lit && j % 4 === 1) for (let k = -hw + 1; k < hw; k += 3) if (H(j, k) < 0.5) p.px(48 + k, -j, c.wMid); }
    // 63 Building: golden glass
    const g = c.D('#d0a040', 0.5);
    bld(p, c, 196, 16, 76, g, mix(g, P.white, 0.3), 630, { roof: 0, ws: 1, sx: 2, sy: 3 });
    p.trap(198, 210, -80, 196, 212, -76, g);
  });
  hazeBand(c, 22, 0.1);
  layer(c, 'seoul', 2, (p) => {
    // apartment slabs (apateu)
    const ap = mix(c.near, P.white, 0.04);
    for (let x = -48, i = 0; x < 300; x += 24 + Math.floor(H(i, 51) * 8), i++) {
      const h = 30 + Math.floor(H(i, 52) * 24);
      if (x > 84 && x < 150) continue;
      bld(p, c, x, 20, h, ap, c.wNear, 900 + i, { roof: 0, ws: 2, sx: 4, sy: 4 });
      p.rect(x + 2, -h - 2, 16, 2, ap);
    }
    // Namdaemun gate
    const stone = c.D('#8a8a90', 0.1), roof = c.D('#3a3a44', 0.1), wood = c.D('#b04030', 0.1);
    p.rect(92, -12, 56, 12, stone); p.dome(120, 0, 7, 9, c.sky); p.rect(113, 0, 15, 1, c.sky);
    p.rect(98, -20, 44, 8, wood); for (let x = 100; x < 140; x += 5) p.vline(x, -19, -13, roof);
    p.trap(104, 136, -25, 92, 148, -20, roof); p.px(90, -22, roof); p.px(149, -22, roof);
    p.rect(102, -30, 36, 5, wood); p.trap(108, 132, -35, 96, 144, -30, roof); p.px(94, -32, roof); p.px(145, -32, roof);
    p.hline(112, 128, -36, roof);
  });
  neon(c, 2, '서울', 14, -74, P.red, true, 14, 1);
  neon(c, 2, '강남', 156, -44, P.cyan, false, 11, 2);
  neon(c, 2, '치킨', 60, -46, P.yellow, false, 10, 3);
  neon(c, 2, 'K-POP', 208, -56, P.pink, false, 10, 4);
  neon(c, 2, '한강', 226, -80, P.cyan, true, 12, 5);
  const f = live(c, 0); beacon(f, c, 150, -125, 0.3);
  const m = live(c, 1); beacon(m, c, 48, -131, 1.2); beacon(m, c, 204, -81, 2.5);
};

// ═════════════════════════════════════════════════════════════════════════════
// SHANGHAI — Oriental Pearl, Shanghai Tower, Jin Mao, SWFC, the Bund, Huangpu river.
// ═════════════════════════════════════════════════════════════════════════════
const shanghai: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [40, -56, 18], sunDawn: [200, -46, 13], clouds: 5 });
  layer(c, 'shanghai', 0, (p) => {
    towers(p, c, -48, 300, 41, 7, 14, 16, 46, c.far, c.wFar, { ws: 1, sx: 2, sy: 3 });
  });
  hazeBand(c, 48, 0.18);
  layer(c, 'shanghai', 1, (p) => {
    towers(p, c, -48, 300, 43, 9, 18, 22, 60, c.mid, c.wMid, { ws: 1, sx: 2, sy: 3 });
    const glass = mix(c.mid, pal.skyBottom, 0.25), st = mix(c.mid, P.white, 0.06);
    // Shanghai Tower (twist)
    for (let j = 0; j < 130; j++) { const f = j / 130; const hw = Math.round(10 - f * 5); const sh = Math.round(Math.sin(f * 3.2 + 1) * 3); p.hline(72 + sh - hw, 72 + sh + hw, -j, glass); p.px(72 + sh + hw - 1 - Math.round(f * 2), -j, st); if (c.lit && j % 4 === 0) p.px(72 + sh - hw + 2 + (j % 3) * 2, -j, c.wMid); }
    p.dome(70, -130, 5, 3, glass);
    // Jin Mao (stepped setbacks + spire)
    let jw = 20; for (let s = 0; s < 6; s++) { const h0 = s * 15; p.rect(102 - jw / 2, -h0 - 16, jw, 16, st); if (c.lit) for (let k = 0; k < jw; k += 3) for (let yy = -h0 - 14; yy < -h0 - 2; yy += 3) if (H(s, k, yy) < 0.55) p.px(102 - jw / 2 + k + 1, yy, c.wMid); jw -= 3; }
    p.tri(102, -108, 3, -96, st); p.vline(102, -116, -108, st);
    // SWFC (bottle opener)
    for (let j = 0; j < 112; j++) { const f = j / 112; const hw = Math.round(9 - f * 4); p.hline(130 - hw, 130 + hw, -j, j % 2 ? glass : mix(glass, P.white, 0.05)); }
    p.trap(127, 133, -112, 124, 136, -96, c.sky);
    // Oriental Pearl Tower
    const pk = c.D(P.pink, 0.5), pk2 = c.D(P.red, 0.5), col = mix(c.mid, P.gray1, 0.4);
    p.line(150, -30, 140, 0, col); p.line(150, -30, 160, 0, col); p.line(148, -30, 146, 0, col); p.line(152, -30, 154, 0, col);
    p.rect(148, -70, 5, 40, col);
    p.disc(150, -20, 4, pk2); p.disc(150, -42, 9, pk); p.disc(150, -42, 4, mix(pk, P.white, 0.3));
    p.rect(149, -110, 3, 40, col); p.disc(150, -84, 5, pk); p.disc(150, -110, 3, pk2); p.vline(150, -132, -112, col);
    if (c.lit) { p.disc(150, -42, 2, P.white); p.px(150, -84, P.white); }
  });
  hazeBand(c, 24, 0.12);
  layer(c, 'shanghai', 2, (p) => {
    // Huangpu river
    const riv = mix(c.near, pal.skyBottom, 0.3);
    p.rect(-48, -6, 336, 7, riv);
    if (c.lit) for (let x = -48; x < 300; x += 4) if (H(x, 9) < 0.5) p.px(x, -5 + Math.floor(H(x, 10) * 5), mix(riv, c.pal.glow, 0.6));
    // the Bund: stone buildings, Customs House clock tower, HSBC dome
    const stone = c.D('#a09070', 0.2), dark = mix(c.near, P.black, 0.2);
    let x = -48, i = 0;
    while (x < 300) {
      const w = 18 + Math.floor(H(i, 61) * 14), h = 24 + Math.floor(H(i, 62) * 12);
      p.rect(x, -h - 6, w, h, stone);
      for (let k = x + 2; k < x + w - 2; k += 4) { p.vline(k, -h - 4, -8, dark); if (c.lit && H(k, i) < 0.6) p.rect(k + 1, -h + 2 + (i % 3) * 6, 2, 2, c.wNear); }
      p.rect(x + 1, -h - 8, w - 2, 2, stone);
      if (i === 5) { p.rect(x + 4, -h - 34, w - 8, 28, stone); p.rect(x + 6, -h - 30, w - 12, 8, dark); p.disc(x + w / 2, -h - 26, 3, P.white); p.px(x + w / 2, -h - 27, dark); p.tri(x + w / 2, -h - 44, Math.floor(w / 2) - 4, -h - 34, dark); }
      if (i === 7) { p.dome(x + w / 2, -h - 6, Math.floor(w / 2) - 1, 10, dark); p.rect(x + w / 2 - 1, -h - 20, 3, 4, dark); }
      x += w + 2; i++;
    }
  });
  neon(c, 2, '上海', 12, -80, P.red, true, 14, 1);
  neon(c, 2, '外滩', 170, -60, P.yellow, false, 11, 2);
  neon(c, 2, '欢迎', 210, -76, P.cyan, false, 10, 3);
  neon(c, 2, '浦东', 60, -58, P.pink, false, 10, 4);
  const m = live(c, 1); beacon(m, c, 70, -134, 0.1); beacon(m, c, 130, -113, 1.4); beacon(m, c, 150, -133, 2.2); beacon(m, c, 102, -117, 3.1);
};

// ═════════════════════════════════════════════════════════════════════════════
// HONG KONG — Peak, IFC, ICC, Bank of China, harbour with junk, Kowloon neon.
// ═════════════════════════════════════════════════════════════════════════════
const hongkong: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [170, -58, 18], sunDawn: [56, -46, 13] });
  layer(c, 'hongkong', 0, (p) => {
    const pk = mix(c.far, pal.skyBottom, 0.2);
    p.dome(60, 1, 120, 78, pk); p.dome(190, 1, 110, 60, pk); p.dome(270, 1, 90, 50, pk);
    towers(p, c, -48, 300, 47, 6, 12, 14, 40, c.far, c.wFar, { ws: 1, sx: 2, sy: 3 });
  });
  hazeBand(c, 44, 0.14);
  layer(c, 'hongkong', 1, (p) => {
    towers(p, c, -48, 300, 53, 8, 16, 26, 70, c.mid, c.wMid, { ws: 1, sx: 2, sy: 3, win2: c.lit ? c.D(P.pink, 0.4) : undefined });
    const glass = mix(c.mid, pal.skyBottom, 0.22), st = mix(c.mid, P.white, 0.08);
    // IFC 2 (tapering with crown)
    for (let j = 0; j < 112; j++) { const hw = Math.round(11 - (j / 112) * 4); p.hline(62 - hw, 62 + hw, -j, j % 3 === 0 ? st : glass); if (c.lit && j % 4 === 2) for (let k = -hw + 2; k < hw - 1; k += 3) if (H(j, k, 3) < 0.55) p.px(62 + k, -j, c.wMid); }
    for (let k = -6; k <= 6; k += 3) p.vline(62 + k, -118 - (k === 0 ? 4 : 0), -112, st);
    // Bank of China: zigzag facets
    const bc = mix(c.mid, pal.skyBottom, 0.3), bl = mix(bc, P.white, 0.35);
    p.rect(110, -70, 22, 70, bc); p.trap(110, 132, -84, 110, 132, -70, bc); p.trap(116, 132, -96, 110, 132, -84, bc); p.trap(122, 132, -108, 116, 132, -96, bc);
    p.line(110, -70, 132, -48, bl); p.line(110, -48, 132, -26, bl); p.line(110, -26, 132, -4, bl); p.line(132, -70, 110, -48, bl); p.line(132, -48, 110, -26, bl); p.line(132, -26, 110, -4, bl);
    p.line(110, -70, 132, -96, bl); p.line(116, -96, 132, -84, bl); p.vline(121, -70, -4, bl);
    p.vline(126, -118, -108, bl); p.vline(130, -122, -108, bl);
    // ICC (right, tallest)
    for (let j = 0; j < 122; j++) { const hw = Math.round(12 - (j / 122) * 4); p.hline(214 - hw, 214 + hw, -j, j % 3 === 1 ? st : glass); if (c.lit && j % 4 === 0) for (let k = -hw + 2; k < hw - 1; k += 3) if (H(j, k, 5) < 0.55) p.px(214 + k, -j, c.wMid); }
    p.rect(206, -126, 16, 4, st);
  });
  hazeBand(c, 22, 0.1);
  layer(c, 'hongkong', 2, (p) => {
    // harbour
    const sea = mix(c.near, c.tod === 'night' ? '#0e3a4a' : P.teal, c.tod === 'night' ? 0.4 : 0.35);
    p.rect(-48, -10, 336, 11, sea);
    for (let x = -48; x < 300; x += 3) if (H(x, 21) < 0.4) p.px(x, -9 + Math.floor(H(x, 22) * 8), mix(sea, c.lit ? pal.glow : P.white, 0.55));
    junk(p, c, 150, -2, c.D(P.red, 0.1));
    // Star Ferry
    p.rect(92, -7, 18, 4, c.near); p.rect(95, -10, 12, 3, c.D('#2a8a5a', 0.1)); p.rect(98, -12, 2, 2, c.near);
    // Kowloon near towers (sides)
    towers(p, c, -48, 50, 57, 14, 26, 30, 64, c.near, c.wNear, { ws: 2, sx: 4, sy: 4, win2: c.lit ? c.D(P.cyan, 0) : undefined });
    towers(p, c, 200, 300, 58, 14, 26, 30, 64, c.near, c.wNear, { ws: 2, sx: 4, sy: 4, win2: c.lit ? c.D(P.pink, 0) : undefined });
  });
  // overhanging neon signs (Kowloon)
  neon(c, 2, '香港', 26, -80, P.red, true, 14, 1);
  neon(c, 2, '九龍', 214, -84, P.cyan, true, 12, 2);
  neon(c, 2, '茶餐廳', 4, -38, P.yellow, false, 9, 3);
  neon(c, 2, '旺角', 200, -40, P.pink, false, 10, 4);
  neon(c, 2, 'HK', 40, -24, P.orange, false, 9, 5);
  neon(c, 2, '金行', 226, -56, P.yellow, false, 9, 6);
  const m = live(c, 1); beacon(m, c, 62, -123, 0.2); beacon(m, c, 214, -127, 1.6); beacon(m, c, 130, -123, 2.7);
};

// ═════════════════════════════════════════════════════════════════════════════
// BANGKOK — Wat Arun prang, golden temple roofs + chedi, Baiyoke, MahaNakhon, Thai neon.
// ═════════════════════════════════════════════════════════════════════════════
const bangkok: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [104, -60, 22], sunDawn: [150, -46, 14], clouds: 5 });
  layer(c, 'bangkok', 0, (p) => {
    towers(p, c, -48, 300, 61, 7, 14, 12, 40, c.far, c.wFar, { ws: 1, sx: 2, sy: 3 });
    // Baiyoke Tower II (round crown)
    bld(p, c, 54, 16, 112, mix(c.far, pal.skyBottom, 0.15), c.wFar, 612, { roof: 0, ws: 1, sx: 2, sy: 3 });
    p.rect(52, -122, 20, 10, mix(c.far, pal.skyBottom, 0.15)); p.dome(62, -122, 10, 5, mix(c.far, pal.skyBottom, 0.15)); p.vline(62, -134, -127, c.far);
  });
  hazeBand(c, 44, 0.18);
  layer(c, 'bangkok', 1, (p) => {
    towers(p, c, -48, 300, 67, 9, 18, 18, 52, c.mid, c.wMid, { ws: 1, sx: 2, sy: 3 });
    // MahaNakhon (pixel notches)
    const mk = mix(c.mid, P.white, 0.06);
    p.rect(18, -100, 20, 100, mk);
    for (let i = 0; i < 14; i++) { const nx = 18 + (i % 2 ? 12 : 0) + Math.floor(H(i, 71) * 6), ny = -96 + i * 7 - Math.floor(H(i, 72) * 4); p.rect(nx, ny, 4 + Math.floor(H(i, 73) * 4), 3, c.sky); }
    if (c.lit) for (let yy = -96; yy < -4; yy += 4) for (let k = 20; k < 36; k += 4) if (H(yy, k) < 0.5) p.rect(k, yy, 2, 2, c.wMid);
    // Wat Arun: central prang + 4 satellites
    const st = c.D('#d8d0c0', 0.5), st2 = mix(c.D('#d8d0c0', 0.5), P.black, 0.25);
    const prang = (x: number, h: number, hb: number) => {
      for (let j = 0; j < h; j++) { const f = j / h; const hw = Math.max(1, Math.round(hb * Math.pow(1 - f, 0.6))); p.hline(x - hw, x + hw, -j, (j % 5 === 0) ? st2 : st); }
      p.vline(x, -h - 6, -h, st2); p.trap(x - hb - 3, x + hb + 3, -6, x - hb - 4, x + hb + 4, 0, st2);
    };
    prang(150, 82, 11); prang(126, 36, 6); prang(174, 36, 6); prang(136, 24, 4); prang(164, 24, 4);
  });
  hazeBand(c, 22, 0.12);
  layer(c, 'bangkok', 2, (p) => {
    towers(p, c, -48, 14, 63, 14, 24, 24, 52, c.near, c.wNear, { ws: 2, sx: 4, sy: 4 });
    towers(p, c, 226, 300, 64, 14, 24, 24, 52, c.near, c.wNear, { ws: 2, sx: 4, sy: 4 });
    // golden temple roofs (Wat Phra Kaew style): steep stacked tiers
    const gold = c.D(P.gold, 0.1), or = c.D(P.orange, 0.1), gr = c.D(P.green, 0.1), wall = c.D('#e8e0c8', 0.1);
    const hall = (x: number, w: number, h: number) => {
      p.rect(x - w / 2 + 2, -h, w - 4, h, wall);
      for (let k = x - w / 2 + 4; k < x + w / 2 - 4; k += 4) p.vline(k, -h + 2, -1, mix(wall, P.black, 0.3));
      p.trap(x - w / 2 + 4, x + w / 2 - 4, -h - 8, x - w / 2 - 2, x + w / 2 + 2, -h, or);
      p.trap(x - w / 2 + 8, x + w / 2 - 8, -h - 16, x - w / 2 + 2, x + w / 2 - 2, -h - 8, or);
      p.trap(x - w / 2 + 12, x + w / 2 - 12, -h - 22, x - w / 2 + 6, x + w / 2 - 6, -h - 16, or);
      p.hline(x - w / 2 - 2, x + w / 2 + 2, -h - 1, gr); p.hline(x - w / 2 + 2, x + w / 2 - 2, -h - 9, gr); p.hline(x - w / 2 + 6, x + w / 2 - 6, -h - 17, gr);
      p.vline(x - w / 2 + 12, -h - 25, -h - 22, gold); p.vline(x + w / 2 - 12, -h - 25, -h - 22, gold); p.vline(x, -h - 26, -h - 22, gold);
      for (let k = x - w / 2 + 12; k <= x + w / 2 - 12; k += 6) p.px(k, -h - 23, gold);
    };
    hall(60, 44, 14); hall(206, 40, 12);
    // golden chedi
    p.trap(94, 110, -8, 90, 114, 0, wall); p.dome(102, -8, 8, 14, gold); p.trap(100, 104, -34, 98, 106, -22, gold); p.vline(102, -44, -34, gold); p.px(102, -45, mix(gold, P.white, 0.4));
    for (const [x, h] of [[26, 18], [130, 14], [180, 16], [238, 18], [-14, 16], [260, 16]] as const) palm(p, x, h, c.near, x < 120 ? 1 : -1);
  });
  neon(c, 2, 'กรุงเทพ', 120, -74, P.pink, false, 12, 1);
  neon(c, 2, 'BANGKOK', 8, -60, P.cyan, false, 9, 2);
  neon(c, 2, 'สยาม', 190, -58, P.yellow, false, 11, 3);
  neon(c, 2, 'ตลาด', 30, -34, P.orange, false, 10, 4);
  const f = live(c, 0); beacon(f, c, 62, -135, 0.3);
  const m = live(c, 1); beacon(m, c, 28, -101, 1.9);
};

// ═════════════════════════════════════════════════════════════════════════════
// MUMBAI — Bandra–Worli Sea Link, Gateway of India, Taj hotel dome, palms, hazy sea.
// ═════════════════════════════════════════════════════════════════════════════
const mumbai: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  const c = ctx(r, pal, tod, px, y, t, fog);
  skyPass(c, { sunDusk: [80, -56, 21], sunDawn: [160, -44, 14], clouds: 5 });
  layer(c, 'mumbai', 0, (p) => {
    const sea = mix(pal.skyBottom, c.tod === 'night' ? '#1a2038' : '#3a7aa0', c.tod === 'night' ? 0.6 : 0.5);
    p.rect(-48, -14, 336, 15, sea);
    for (let x = -48; x < 300; x += 4) if (H(x, 31) < 0.4) p.px(x, -13 + Math.floor(H(x, 32) * 12), mix(sea, c.lit ? pal.glow : P.white, 0.45));
    towers(p, c, 140, 300, 71, 8, 16, 20, 70, c.far, c.wFar, { ws: 1, sx: 2, sy: 3 });
    towers(p, c, -48, 40, 72, 8, 14, 14, 44, c.far, c.wFar, { ws: 1, sx: 2, sy: 3 });
  });
  hazeBand(c, 50, 0.2);
  layer(c, 'mumbai', 1, (p) => {
    // Bandra–Worli Sea Link
    cableBridge(p, c, -48, 300, -18, [70, 160], 64, c.mid);
    towers(p, c, 190, 300, 73, 10, 18, 22, 60, c.mid, c.wMid, { ws: 1, sx: 2, sy: 3 });
  });
  hazeBand(c, 24, 0.12);
  layer(c, 'mumbai', 2, (p) => {
    const bas = c.D('#6a5a48', 0.1), dark = mix(c.near, P.black, 0.2), dome = c.D('#b04040', 0.1), cream = c.D('#e8dcc0', 0.1);
    // Taj Mahal Palace hotel (left) + Taj Tower
    p.rect(14, -60, 18, 60, cream); for (let yy = -56; yy < -4; yy += 4) for (let k = 16; k < 30; k += 4) if (!c.lit || H(k, yy) < 0.6) p.rect(k, yy, 2, 2, c.lit ? c.wNear : mix(cream, P.black, 0.3));
    p.rect(36, -34, 64, 34, cream);
    for (let yy = -30; yy < -4; yy += 5) for (let k = 38; k < 98; k += 4) if (!c.lit || H(k, yy, 2) < 0.6) p.rect(k, yy, 2, 3, c.lit ? c.wNear : mix(cream, P.black, 0.3));
    p.rect(60, -40, 16, 6, cream); p.dome(68, -40, 10, 11, dome); p.vline(68, -53, -51, c.D(P.gold, 0.1));
    for (const x of [38, 98]) { p.rect(x - 2, -38, 5, 4, cream); p.dome(x, -38, 3, 4, dome); }
    // Gateway of India (right)
    p.rect(150, -30, 44, 30, bas); p.rect(146, -32, 52, 3, bas);
    p.rect(166, -22, 12, 22, c.sky); p.dome(172, -22, 6, 6, c.sky);
    for (const x of [153, 191]) { p.rect(x - 2, -36, 5, 6, bas); p.dome(x, -36, 3, 3, dark); }
    for (const x of [162, 182]) { p.rect(x - 1, -35, 3, 4, bas); p.dome(x, -35, 2, 2, dark); }
    p.dome(172, -32, 9, 7, dark); p.rect(171, -40, 3, 2, dark);
    for (let k = 152; k < 194; k += 6) { p.px(k, -27, dark); p.rect(k, -12, 2, 3, c.lit ? c.wNear : dark); }
    towers(p, c, -48, 8, 74, 12, 20, 20, 50, c.near, c.wNear, { ws: 2, sx: 4, sy: 4 });
    towers(p, c, 210, 300, 75, 12, 20, 20, 50, c.near, c.wNear, { ws: 2, sx: 4, sy: 4 });
    for (const [x, h] of [[110, 20], [126, 16], [140, 22], [204, 18], [-20, 18], [250, 20], [272, 16]] as const) palm(p, x, h, c.near, x < 120 ? 1 : -1);
  });
  neon(c, 2, 'मुंबई', 108, -70, P.orange, false, 12, 1);
  neon(c, 2, 'BOLLYWOOD', 6, -82, P.pink, false, 9, 2);
  neon(c, 2, 'MUMBAI', 196, -70, P.cyan, false, 9, 3);
  neon(c, 2, 'चाय', 116, -46, P.yellow, false, 10, 4);
  const m = live(c, 1); beacon(m, c, 200, -60, 0.6);
};

export const SKYLINES_ASIA: Record<string, SkylineFn> = { tokyo, osaka, kyoto, nagoya, fukuoka, seoul, shanghai, hongkong, bangkok, mumbai };
