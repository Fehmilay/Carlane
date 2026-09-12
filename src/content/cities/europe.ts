import type { CityDef, CityPalette, TimeOfDay } from '../../core/types';
import type { Renderer } from '../../core/Renderer';
import type { PixelSprite } from '../../core/Sprite';
import type { SkylineFn } from './types';
import { P, mix } from '../../core/Palette';
import { kanjiSprite } from '../../core/Kanji';
import { block, mountain, water, dome, spire, bridge, neon, palm, far, mid, near, skyFurniture, clouds, isDark, isNight, h01 } from './lib';

// ─────────────────────────────────────────────────────────────────────────────
// EUROPE catalog: duesseldorf, berlin, munich, istanbul, paris, london, rome,
// amsterdam, barcelona, moscow, reykjavik.
// Skylines draw in three parallax layers (far px*0.3, mid px*0.6, near px*1.0) and
// cover x = -64..304 so no gap appears when the layer is shifted (|px| ≤ 40 in game).
// Everything is drawn ABOVE the horizon `y` — the road renderer owns everything below.
// ─────────────────────────────────────────────────────────────────────────────

// ── palettes ────────────────────────────────────────────────────────────────
type PalSet = Record<TimeOfDay, CityPalette>;
interface PalSpec {
  day: [string, string]; dawn: [string, string]; dusk: [string, string]; night: [string, string];
  far: string; near: string; glow?: string; ground: string; groundAlt: string;
  /** keeps snow bright at night (Moscow / Reykjavík) */
  nightGround?: [string, string];
  road?: string; stripe?: string; curb?: string; curbAlt?: string; haze?: string; sun?: string; moon?: string;
}
/** Build a 4-time palette set from a compact spec (same pattern as world.ts). */
function pal(spec: PalSpec): PalSet {
  const mk = (sky: [string, string], tod: TimeOfDay): CityPalette => ({
    skyTop: sky[0], skyBottom: sky[1],
    farSky: tod === 'night' ? mix(spec.far, '#0b0b12', 0.45) : tod === 'day' ? spec.far : mix(spec.far, sky[1], 0.3),
    nearSky: tod === 'night' ? mix(spec.near, '#0b0b12', 0.3) : spec.near,
    glow: spec.glow ?? '#ffe870',
    ground: tod === 'night' ? (spec.nightGround?.[0] ?? mix(spec.ground, '#0b0b12', 0.45)) : spec.ground,
    groundAlt: tod === 'night' ? (spec.nightGround?.[1] ?? mix(spec.groundAlt, '#0b0b12', 0.45)) : spec.groundAlt,
    road: tod === 'night' ? '#2a2a36' : (spec.road ?? '#3a3a48'), roadAlt: tod === 'night' ? '#26262f' : mix(spec.road ?? '#3a3a48', '#000000', 0.08),
    stripe: spec.stripe ?? '#f4f4f0', curb: spec.curb ?? '#e0202a', curbAlt: spec.curbAlt ?? '#f4f4f0',
    haze: spec.haze ?? sky[1], sun: tod === 'night' ? undefined : (spec.sun ?? '#ffe870'), moon: spec.moon ?? '#f4f4f0',
  });
  return { day: mk(spec.day, 'day'), dawn: mk(spec.dawn, 'dawn'), dusk: mk(spec.dusk, 'dusk'), night: mk(spec.night, 'night') };
}

// Düsseldorf — cool Rhine grey-blue day, Altbier amber dusk, deep blue night.
const DUS = pal({ day: ['#2f68c8', '#a6c6de'], dawn: ['#4a4a86', '#f2b48c'], dusk: ['#5c2452', '#f0a032'], night: ['#070a26', '#141c56'], far: '#6a7a96', near: '#2a3040', glow: '#ffd060', ground: '#2f8a3c', groundAlt: '#288034', road: '#3a3a46', sun: '#ffd35a' });
// Berlin — grey brick day, magenta techno night.
const BER = pal({ day: ['#3170d2', '#b4cae2'], dawn: ['#5c3a7a', '#ffb890'], dusk: ['#4a1758', '#f06a50'], night: ['#11041f', '#48104e'], far: '#66667e', near: '#2a2a38', glow: '#ffe060', ground: '#33883c', groundAlt: '#2c7c34', road: '#3c3c46', sun: '#ffd85a' });
// Munich — alpine blue.
const MUC = pal({ day: ['#1a68e0', '#9ed2f8'], dawn: ['#6a5a9c', '#ffc8a2'], dusk: ['#3a2470', '#ff9a4e'], night: ['#050c2c', '#132256'], far: '#7a90b4', near: '#2c3444', glow: '#ffe0a0', ground: '#2f9040', groundAlt: '#288438', road: '#3a3a48', sun: '#ffe070' });
// Istanbul — turquoise Bosphorus day, warm orange dusk.
const IST = pal({ day: ['#1478c8', '#76dcd4'], dawn: ['#7a4a74', '#ffc490'], dusk: ['#7e1c3a', '#ff8420'], night: ['#0a0926', '#2c1a4c'], far: '#9a8a94', near: '#3a2c38', glow: '#ffd070', ground: '#86a040', groundAlt: '#789236', road: '#46424c', sun: '#ffb432' });
// Paris — pearl day, lavender dusk.
const PAR = pal({ day: ['#3778d6', '#bed6ee'], dawn: ['#6a5a94', '#ffc2b2'], dusk: ['#5a3890', '#eaa2c6'], night: ['#0a0a2a', '#261a54'], far: '#9090a8', near: '#3a3446', glow: '#ffe0a0', ground: '#3a8a44', groundAlt: '#33803c', road: '#3e3e4a', sun: '#ffd8a0' });
// London — moody grey-blue, warm sodium night.
const LON = pal({ day: ['#5a7a9c', '#bac6ce'], dawn: ['#6a6a8c', '#eab2a2'], dusk: ['#3a3a60', '#d07452'], night: ['#0a0e22', '#1e2848'], far: '#66747e', near: '#2a303c', glow: '#ffb040', ground: '#2f8a44', groundAlt: '#28803c', road: '#3a3a44', stripe: '#f4f4f0', sun: '#ffd8a8' });
// Rome — golden hour.
const ROM = pal({ day: ['#2678d8', '#a6d8f0'], dawn: ['#8a6a84', '#ffd2a2'], dusk: ['#7c3640', '#ffb040'], night: ['#0e0a24', '#2c204c'], far: '#a89076', near: '#4a3a30', glow: '#ffd070', ground: '#8a9a3c', groundAlt: '#7c8c34', road: '#48443e', sun: '#ffc850' });
// Amsterdam — canal greens.
const AMS = pal({ day: ['#3078d0', '#b6d8d2'], dawn: ['#5a5a8c', '#f2c2a2'], dusk: ['#3a2860', '#e07250'], night: ['#05101e', '#123244'], far: '#5e7c74', near: '#26322e', glow: '#ffd870', ground: '#2a8a5a', groundAlt: '#237c50', road: '#3a3e44', sun: '#ffd070' });
// Barcelona — Mediterranean bright.
const BCN = pal({ day: ['#1668e0', '#88e0f0'], dawn: ['#7a4a84', '#ffc890'], dusk: ['#8c2a60', '#ff9040'], night: ['#08102c', '#1c2c5c'], far: '#c0a878', near: '#4a4038', glow: '#ffe090', ground: '#7a9a38', groundAlt: '#6c8c30', road: '#46464e', stripe: '#f4f4f0', sun: '#ffd84a' });
// Moscow — icy blue, snow-white ground that stays bright at night.
const MOW = pal({ day: ['#2a68c8', '#c8dcf0'], dawn: ['#5a5a94', '#e8c8d4'], dusk: ['#39286c', '#e08c94'], night: ['#050a20', '#12224c'], far: '#7c8cac', near: '#39414f', glow: '#ffe0a0', ground: '#e6eef6', groundAlt: '#d4dded', nightGround: ['#8d98b2', '#7e89a4'], road: '#41414e', stripe: '#f0c020', sun: '#ffe0b0' });
// Reykjavík — pale arctic day, aurora green/purple night.
const REY = pal({ day: ['#2a70c8', '#b8dae8'], dawn: ['#5a5a8e', '#f2c8b4'], dusk: ['#3a2864', '#e08060'], night: ['#04091a', '#0e2c38'], far: '#6e7e94', near: '#2c3a42', glow: '#ffd8a0', ground: '#dde8ee', groundAlt: '#cbd8e2', nightGround: ['#8593a0', '#76848f'], road: '#3c4048', stripe: '#f0c020', sun: '#ffd090' });

// ── city defs ────────────────────────────────────────────────────────────────
export const CITIES_EUROPE: CityDef[] = [
  {
    id: 'duesseldorf', name: { de: 'Düsseldorf', en: 'Düsseldorf' }, country: { de: 'Deutschland', en: 'Germany' }, countryCode: 'DE', glyph: 'ALTSTADT', palettes: DUS,
    props: ['altbier_sign', 'tram_pole', 'tree', 'lamp', 'sign_city', 'billboard', 'cone', 'barrier'],
    traffic: ['taxi_de', 'police_de', 'tram_de', 'sedan_white', 'van_white', 'truck_semi'], music: 'eurobeat',
    slogans: ['FAHR', 'WEITER'], captions: ['KEEP\nDRIVING\nNORTH', 'LONGEST\nBAR IN\nTHE WORLD'],
    billboards: ['ALTSTADT', 'RHEINTURM', 'KÖNIGSALLEE', 'ALTBIER'], signs: ['KÖLN', 'ESSEN', 'DUISBURG'],
  },
  {
    id: 'berlin', name: { de: 'Berlin', en: 'Berlin' }, country: { de: 'Deutschland', en: 'Germany' }, countryCode: 'DE', glyph: 'BERLIN', palettes: BER,
    props: ['lamp_neon', 'billboard', 'neon_arrow', 'tree', 'bus_stop', 'barrier', 'sign_city', 'kiosk'], lampProp: 'lamp_neon',
    traffic: ['trabant', 'taxi_de', 'police_de', 'bus_city', 'van_white', 'truck_semi'], music: 'techno',
    slogans: ['NACHT', 'FAHRT'], captions: ['NIGHT\nRUN\nBERLIN', 'TECHNO\nNEVER\nSTOPS'],
    billboards: ['BERLIN', 'TECHNO', 'CURRYWURST'], signs: ['POTSDAM', 'LEIPZIG', 'HAMBURG'],
  },
  {
    id: 'munich', name: { de: 'München', en: 'Munich' }, country: { de: 'Deutschland', en: 'Germany' }, countryCode: 'DE', glyph: 'MÜNCHEN', palettes: MUC,
    props: ['pretzel_sign', 'pine', 'tree', 'lamp', 'flag_pole', 'billboard', 'bus_stop', 'bike_rack'],
    traffic: ['beer_truck', 'taxi_de', 'police_de', 'suv_gray', 'sedan_blue', 'bus_city'], music: 'eurobeat',
    slogans: ['GAS', 'GEBEN'], captions: ['FULL\nTHROTTLE\nSOUTH', 'ALPS\nAHEAD\nPROST'],
    billboards: ['MÜNCHEN', 'BREZN', 'ALPEN', 'WIESN'], signs: ['SALZBURG', 'GARMISCH', 'AUGSBURG'],
  },
  {
    id: 'istanbul', name: { de: 'Istanbul', en: 'Istanbul' }, country: { de: 'Türkei', en: 'Türkiye' }, countryCode: 'TR', glyph: 'İSTANBUL', palettes: IST,
    props: ['minaret_small', 'cypress', 'lantern', 'kiosk', 'palm', 'lamp', 'billboard', 'flag_pole'],
    traffic: ['dolmus', 'taxi_istanbul', 'bus_city', 'van_white', 'sedan_white', 'truck_semi'], music: 'anatolian',
    slogans: ['SÜR', 'DEVAM'], captions: ['KEEP\nGOING\nEAST', 'TWO\nSHORES\nONE ROAD'],
    billboards: ['İSTANBUL', 'BOĞAZ', 'KEBAP', 'ÇAY'], signs: ['ANKARA', 'IZMIR', 'BURSA'],
  },
  {
    id: 'paris', name: { de: 'Paris', en: 'Paris' }, country: { de: 'Frankreich', en: 'France' }, countryCode: 'FR', glyph: 'PARIS', palettes: PAR,
    props: ['lamp', 'tree', 'kiosk', 'fountain', 'obelisk_small', 'billboard', 'statue', 'bike_rack'],
    traffic: ['citroen_2cv', 'hatch_green', 'bus_city', 'van_white', 'sedan_gray'], music: 'chanson',
    slogans: ['ROULE', 'LIBRE'], captions: ['DRIVE\nFREE', 'CITY\nOF\nLIGHTS'],
    billboards: ['PARIS', 'CAFÉ', 'MÉTRO', 'BOULANGERIE'], signs: ['VERSAILLES', 'LYON', 'ORLY'],
  },
  {
    id: 'london', name: { de: 'London', en: 'London' }, country: { de: 'Großbritannien', en: 'United Kingdom' }, countryCode: 'GB', glyph: 'LONDON', palettes: LON,
    props: ['phonebox', 'lamp', 'tree', 'bus_stop', 'sign_city', 'billboard', 'barrier', 'bike_rack'],
    traffic: ['taxi_black', 'bus_double', 'police_uk', 'sedan_white', 'van_white'], music: 'britpop',
    slogans: ['DRIVE', 'ON'], captions: ['MIND\nTHE\nGAP', 'KEEP\nLEFT\nAND GO'],
    billboards: ['LONDON', 'TUBE', 'TEA', 'PUB'], signs: ['OXFORD', 'BRIGHTON', 'M25'],
  },
  {
    id: 'rome', name: { de: 'Rom', en: 'Rome' }, country: { de: 'Italien', en: 'Italy' }, countryCode: 'IT', glyph: 'ROMA', palettes: ROM,
    props: ['pine', 'olive', 'statue', 'fountain', 'obelisk_small', 'lamp', 'kiosk', 'lion_statue'],
    traffic: ['scooter_pack', 'hatch_yellow', 'bus_city', 'van_white', 'sedan_red'], music: 'italo',
    slogans: ['VAI', 'AVANTI'], captions: ['GO\nAHEAD', 'ALL ROADS\nLEAD\nHERE'],
    billboards: ['ROMA', 'PIZZA', 'VESPA', 'GELATO'], signs: ['NAPOLI', 'FIRENZE', 'OSTIA'],
  },
  {
    id: 'amsterdam', name: { de: 'Amsterdam', en: 'Amsterdam' }, country: { de: 'Niederlande', en: 'Netherlands' }, countryCode: 'NL', glyph: 'AMSTERDAM', palettes: AMS,
    props: ['bike_rack', 'windmill', 'tree', 'lamp', 'gondola_pole', 'kiosk', 'sign_city', 'bus_stop'],
    traffic: ['hatch_green', 'van_white', 'bus_city', 'sedan_white', 'truck_semi'], music: 'techno',
    slogans: ['RIJ', 'DOOR'], captions: ['RIDE\nON', 'CANALS\nBIKES\nSPEED'],
    billboards: ['AMSTERDAM', 'GRACHT', 'FIETS', 'STROOPWAFEL'], signs: ['UTRECHT', 'HAARLEM', 'SCHIPHOL'],
  },
  {
    id: 'barcelona', name: { de: 'Barcelona', en: 'Barcelona' }, country: { de: 'Spanien', en: 'Spain' }, countryCode: 'ES', glyph: 'BARCELONA', palettes: BCN,
    props: ['palm', 'olive', 'lamp_neon', 'kiosk', 'fountain', 'billboard', 'bush', 'beach_umbrella'], lampProp: 'lamp_neon',
    traffic: ['seat_yellow', 'scooter_pack', 'bus_city', 'hatch_yellow', 'van_white'], music: 'latin',
    slogans: ['VIVE', 'RAPIDO'], captions: ['LIVE\nFAST', 'SUN\nSEA\nTAPAS'],
    billboards: ['BARCELONA', 'TAPAS', 'GAUDÍ', 'PLAYA'], signs: ['GIRONA', 'SITGES', 'TARRAGONA'],
  },
  {
    id: 'moscow', name: { de: 'Moskau', en: 'Moscow' }, country: { de: 'Russland', en: 'Russia' }, countryCode: 'RU', glyph: 'МОСКВА', palettes: MOW,
    props: ['snowtree', 'ice_rock', 'lamp', 'statue', 'flag_pole', 'billboard', 'barrier', 'sign_city'],
    traffic: ['lada', 'bus_city', 'truck_semi', 'sedan_gray', 'van_white'], music: 'nordic',
    slogans: ['ЕДЬ', 'ДАЛЬШЕ'], captions: ['DRIVE\nON', 'ICE\nAND\nRED STARS'],
    billboards: ['МОСКВА', 'КРЕМЛЬ', 'МКАД'], signs: ['TVER', 'KHIMKI', 'MKAD'],
  },
  {
    id: 'reykjavik', name: { de: 'Reykjavík', en: 'Reykjavik' }, country: { de: 'Island', en: 'Iceland' }, countryCode: 'IS', glyph: 'REYKJAVÍK', palettes: REY,
    props: ['snowtree', 'ice_rock', 'rock', 'lamp', 'sign_city', 'wind_turbine', 'bush', 'billboard'],
    traffic: ['superjeep', 'suv_gray', 'pickup_red', 'van_white', 'bus_city'], music: 'nordic',
    slogans: ['KEYRÐU', 'ÁFRAM'], captions: ['DRIVE\nON', 'FIRE\nICE\nAURORA'],
    billboards: ['REYKJAVÍK', 'AURORA', 'ÍSLAND'], signs: ['KEFLAVIK', 'AKUREYRI', 'SELFOSS'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// drawing helpers
// ─────────────────────────────────────────────────────────────────────────────
const DIMS: Record<TimeOfDay, number> = { dawn: 0.24, day: 0, dusk: 0.4, night: 0.66 };
/** Landmark accent: darkened by time of day, hazed by depth (0 = near … 1 = far). */
function ac(c: string, tod: TimeOfDay, p: CityPalette, fog: number, depth = 0): string {
  return mix(mix(c, '#0b0b12', DIMS[tod]), p.haze, Math.min(0.85, depth + fog * 0.55));
}
/** Bresenham line (the Renderer has no line primitive). */
function line(r: Renderer, x0: number, y0: number, x1: number, y1: number, col: string): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 600; i++) {
    r.px(x0, y0, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
/** Twinkling stars (night only). */
function stars(r: Renderer, tod: TimeOfDay, y: number, t: number, n = 44): void {
  if (!isNight(tod)) return;
  for (let i = 0; i < n; i++) {
    const x = Math.round(h01(i, 3) * 240);
    const sy = y - 134 + Math.round(h01(i, 5) * 118);
    if (sy < 1) continue;
    r.fillRect(x, sy, 1, 1, P.white, 0.3 + 0.65 * Math.abs(Math.sin(t * 1.7 + i * 1.9)));
  }
}
/** Blinking red aircraft-warning light. */
function beacon(r: Renderer, x: number, yy: number, t: number, tod: TimeOfDay, phase = 0): void {
  if (tod === 'day') return;
  if (Math.sin(t * 4 + phase) > 0) { r.disc(x, yy, 2, P.red, 0.32); r.fillRect(x - 1, yy - 1, 3, 3, P.red); r.px(x, yy, '#ff9a9a'); }
  else r.px(x, yy, P.redDark);
}
/** A row of generic towers spanning -64..304 (seamless under parallax). */
function skyrow(r: Renderer, y: number, ox: number, col: string, glow: string, tod: TimeOfDay, seed: number, n: number, wMin: number, wMax: number, hMin: number, hMax: number, dens = 0.5): void {
  const step = 368 / n;
  for (let i = 0; i < n; i++) {
    const bx = Math.round(-64 + i * step + h01(i, seed) * step * 0.5) + ox;
    const w = wMin + Math.round(h01(i + 17, seed) * (wMax - wMin));
    const h = hMin + Math.round(h01(i + 41, seed) * (hMax - hMin));
    block(r, bx, y, w, h, col, glow, tod, seed * 13 + i, dens);
    const rr = h01(i + 61, seed);
    if (rr < 0.2) r.fillRect(bx + (w >> 1), y - h - 5, 1, 5, col);
    else if (rr < 0.4) r.fillRect(bx + 2, y - h - 2, Math.max(1, w - 4), 2, col);
    else if (rr < 0.5) spire(r, bx + (w >> 1), y - h, Math.max(3, w - 4), 5, col);
  }
}
/** Old-town row: narrow houses with pitched roofs and lit windows. */
function houseRow(r: Renderer, y: number, ox: number, x0: number, x1: number, col: string, roofCol: string, glow: string, tod: TimeOfDay, seed: number, hMin: number, hMax: number): void {
  let x = x0 + ox, i = 0;
  const end = x1 + ox;
  const litc = isDark(tod);
  while (x < end) {
    const w = 9 + Math.round(h01(i, seed) * 8);
    const h = hMin + Math.round(h01(i + 9, seed) * (hMax - hMin));
    r.fillRect(x, y - h, w, h, col);
    const rh = 3 + Math.round(h01(i + 3, seed) * 3);
    for (let j = 0; j < rh; j++) {
      const ins = Math.round(((rh - 1 - j) * (w / 2 - 1)) / rh);
      r.fillRect(x + ins, y - h - rh + j, Math.max(1, w - ins * 2), 1, roofCol);
    }
    for (let wy = y - h + 3; wy < y - 3; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 4) {
      if (h01(wx * 3 + wy, seed) < (litc ? 0.55 : 0.3)) r.fillRect(wx, wy, 2, 2, litc ? glow : mix(col, '#000000', 0.32));
    }
    x += w + 1; i++;
  }
}
/** Onion dome (Russian / Bavarian): bulging bulb with a finial. */
function onion(r: Renderer, cx: number, yBase: number, rx: number, h: number, col: string, hi?: string): void {
  for (let j = 0; j <= h; j++) {
    const hw = Math.max(0, Math.round(rx * Math.sin(Math.PI * (0.26 + 0.74 * (j / h)))));
    r.fillRect(cx - hw, yBase - j, hw * 2 + 1, 1, hi && j % 5 === 2 ? hi : col);
  }
  r.fillRect(cx, yBase - h - 3, 1, 3, col);
  r.fillRect(cx - 1, yBase - h - 2, 3, 1, col);
}
/** Minaret: shaft, lit balcony, conical cap. */
function minaret(r: Renderer, x: number, y: number, h: number, col: string, cap: string, litc: boolean, glow: string): void {
  r.fillRect(x - 1, y - h, 3, h, col);
  const by = y - Math.round(h * 0.64);
  r.fillRect(x - 2, by, 5, 2, mix(col, '#ffffff', 0.2));
  if (litc) { r.fillRect(x - 2, by - 1, 5, 1, glow); r.fillRect(x - 3, by, 1, 1, glow); r.fillRect(x + 3, by, 1, 1, glow); }
  spire(r, x, y - h, 5, 6, cap);
  r.px(x, y - h - 7, cap);
}
/** Arcade wall with round arch openings (Colosseum, aqueduct, gate). */
function archRow(r: Renderer, x: number, y: number, w: number, h: number, n: number, col: string, shadow: string): void {
  r.fillRect(x, y - h, w, h, col);
  const cw = w / n;
  for (let i = 0; i < n; i++) {
    const cx = Math.round(x + cw * (i + 0.5));
    const aw = Math.max(1, Math.round(cw / 2) - 1);
    const ah = Math.max(2, Math.round(h * 0.66));
    for (let j = 0; j < ah; j++) {
      const dy = aw - j;
      const hw = j < aw ? Math.round(Math.sqrt(Math.max(0, aw * aw - dy * dy))) : aw;
      if (hw > 0) r.fillRect(cx - hw, y - ah + j, hw * 2 + 1, 1, shadow);
    }
  }
}
/** Ferris wheel rotating with t (London Eye, Prater-style). */
function wheel(r: Renderer, cx: number, cy: number, rad: number, col: string, cab: string, t: number, litc: boolean, glow: string): void {
  line(r, cx - 7, cy + rad, cx, cy, col); line(r, cx + 7, cy + rad, cx, cy, col);
  r.ring(cx, cy, rad, col, 1);
  r.ring(cx, cy, rad - 2, mix(col, '#000000', 0.25), 1);
  for (let i = 0; i < 12; i++) {
    const a = t * 0.2 + (i / 12) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rad), yy = Math.round(cy + Math.sin(a) * rad);
    line(r, cx, cy, x, yy, mix(col, '#000000', 0.2));
    r.fillRect(x - 1, yy - 1, 3, 3, litc && i % 2 === 0 ? glow : cab);
  }
  r.fillRect(cx - 1, cy - 1, 3, 3, col);
}
/** Aurora curtains (Reykjavík night). */
function aurora(r: Renderer, y: number, t: number, tod: TimeOfDay): void {
  if (tod === 'day' || tod === 'dawn') return;
  const a = isNight(tod) ? 1 : 0.35;
  for (let x = 0; x < 240; x += 2) {
    const w1 = Math.sin(x * 0.045 + t * 0.7), w2 = Math.sin(x * 0.021 - t * 0.42);
    const top = y - 100 + Math.round(w1 * 10 + w2 * 7);
    const hgt = 44 + Math.round(w2 * 12 + Math.sin(x * 0.08 + t) * 7);
    for (let j = 0; j < hgt; j += 3) {
      if (top + j < 0) continue;
      if (j < 3) { r.fillRect(x, top, 2, 2, '#c8ffe8', a * 0.5); }
      const f = j / hgt;
      r.fillRect(x, top + j, 2, 3, mix('#48ffb0', '#b45cff', Math.min(1, f * 1.05)), a * (0.5 * (1 - f) + 0.07));
    }
  }
}
/** Drifting snow in the sky band. */
function snowfall(r: Renderer, y: number, t: number, n = 46, col = '#f4f4f0'): void {
  for (let i = 0; i < n; i++) {
    const sp = 9 + h01(i, 2) * 16;
    const x = Math.round(((h01(i, 1) * 320 + Math.sin(t * 0.6 + i) * 9) % 264) - 12);
    const yy = y - 124 + Math.round((h01(i, 4) * 124 + t * sp) % 124);
    if (yy < 0) continue;
    r.fillRect(x, yy, 1, 1, col, 0.45 + h01(i, 7) * 0.5);
  }
}
/** Ferry with a dark hull, white deckhouse, funnel and wake. */
function boat(r: Renderer, x: number, y: number, col: string, accent: string, litc: boolean, glow: string, big = true): void {
  const w = big ? 22 : 14, hull = mix(col, '#000000', 0.55);
  r.fillRect(x, y - 4, w, 4, hull);
  r.fillRect(x - 1, y - 4, w + 2, 1, mix(col, '#ffffff', 0.1));
  r.fillRect(x + 2, y - 8, w - 6, 4, col);
  r.fillRect(x + 2, y - 9, w - 6, 1, mix(col, '#ffffff', 0.3));
  r.fillRect(x + Math.round(w / 2) - 1, y - 13, 3, 5, accent);
  r.fillRect(x + Math.round(w / 2) - 1, y - 13, 3, 1, mix(accent, '#000000', 0.4));
  if (litc) for (let i = 3; i < w - 5; i += 4) r.fillRect(x + i, y - 7, 2, 2, glow);
  for (let k = 1; k < 4; k++) r.fillRect(x - k * 5, y - 1, 4, 1, mix(hull, '#ffffff', 0.45), 0.7 - k * 0.15);
}
/** Seagull, wings flapping with t. */
function gull(r: Renderer, x: number, y: number, t: number, col: string, i: number): void {
  const up = Math.sin(t * 5 + i * 1.3) > 0 ? 1 : 0;
  r.px(x, y, col);
  r.px(x - 1, y - up, col); r.px(x + 1, y - up, col);
  r.px(x - 2, y - up * 2, col); r.px(x + 2, y - up * 2, col);
}
/** Rheinbahn-style tram silhouette. */
function tram(r: Renderer, x: number, y: number, body: string, band: string, litc: boolean, glow: string): void {
  r.fillRect(x, y - 8, 26, 8, mix(body, '#000000', 0.15));
  r.fillRect(x, y - 8, 26, 1, band);
  r.fillRect(x + 2, y - 6, 22, 3, litc ? glow : mix(body, '#40e0f0', 0.35));
  r.fillRect(x + 12, y - 13, 1, 5, mix(body, '#000000', 0.45));
  r.fillRect(x + 7, y - 13, 11, 1, mix(body, '#000000', 0.45));
  r.fillRect(x + 3, y, 4, 1, '#0b0b12'); r.fillRect(x + 19, y, 4, 1, '#0b0b12');
}
/** Suspension bridge with chunky twin-leg towers, main cables and hangers. */
function suspension(r: Renderer, x0: number, x1: number, y: number, th: number, col: string, cable: string, litc: boolean, glow: string): void {
  const span = x1 - x0, t0 = Math.round(x0 + span * 0.25), t1 = Math.round(x0 + span * 0.75);
  r.fillRect(x0, y, span, 3, mix(col, '#000000', 0.25));
  r.fillRect(x0, y - 1, span, 1, mix(col, '#ffffff', 0.3));
  const cy = (x: number): number => {
    if (x < t0) return y - Math.round(th * ((x - x0) / (t0 - x0)) * 0.92) - 2;
    if (x > t1) return y - Math.round(th * ((x1 - x) / (x1 - t1)) * 0.92) - 2;
    const u = Math.abs(x - (t0 + t1) / 2) / ((t1 - t0) / 2);
    return y - Math.round(th * (0.16 + 0.76 * u * u)) - 2;
  };
  for (let x = x0; x <= x1; x++) { const c = cy(x); r.fillRect(x, c, 1, 2, cable); }
  for (let x = x0 + 5; x <= x1; x += 10) { const c = cy(x) + 2; if (y - c > 1) r.fillRect(x, c, 1, y - c, mix(cable, '#000000', 0.25)); }
  for (const tx of [t0, t1]) {
    r.fillRect(tx - 7, y - th, 5, th + 3, col);
    r.fillRect(tx + 3, y - th, 5, th + 3, col);
    r.fillRect(tx - 7, y - th, 15, 3, col);
    r.fillRect(tx - 7, y - Math.round(th * 0.55), 15, 2, col);
    r.fillRect(tx - 7, y - th - 2, 15, 2, mix(col, '#ffffff', 0.2));
    if (litc) { r.fillRect(tx - 6, y - th + 4, 3, 2, glow); r.fillRect(tx + 4, y - th + 4, 3, 2, glow); }
  }
}

// neon sign sprites cached in a module-level Map (dimensions for the halo).
const SIGNS = new Map<string, PixelSprite>();
function signSprite(text: string, color: string, size: number, vertical: boolean): PixelSprite {
  const key = `${text}|${color}|${size}|${vertical ? 'v' : 'h'}`;
  let s = SIGNS.get(key);
  if (!s) { s = kanjiSprite(text, { size, vertical, color, bold: true, gap: 1 }); SIGNS.set(key, s); }
  return s;
}
/** Neon sign with halo + flicker (uses the shared `neon` panel helper). */
function sign(r: Renderer, text: string, x: number, yy: number, color: string, size: number, tod: TimeOfDay, t: number, seed = 0, vertical = false): void {
  const s = signSprite(text, color, size, vertical);
  const litc = isDark(tod);
  const fl = litc && h01(Math.floor(t * 7) + seed * 13, seed) < 0.07 ? 0.45 : 1;
  if (litc) { r.fillRect(x - 5, yy - 5, s.w + 9, s.h + 9, color, 0.12 * fl); r.fillRect(x - 3, yy - 3, s.w + 5, s.h + 5, color, 0.14 * fl); }
  neon(r, text, x, yy, color, size, vertical, '#16161f', litc ? fl : 0.85);
}

/** Haze band just above the horizon — separates the parallax layers. */
function hazeBand(r: Renderer, p: CityPalette, y: number, h: number, a: number, fog: number): void {
  for (let i = 0; i < 3; i++) r.fillRect(0, y - h + Math.round((h * i) / 3), 240, Math.ceil(h / 3), p.haze, (a + fog * 0.2) * ((i + 1) / 3));
}

// ═════════════════════════════════════════════════════════════════════════════
// DÜSSELDORF — Rheinturm (hero), Gehry's Neuer Zollhof, the Rheinkniebrücke,
// Altstadt with St. Lambertus' twisted spire, the Landtag dome, a tram.
// ═════════════════════════════════════════════════════════════════════════════
const duesseldorf: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 98, y - 56, 12);
  clouds(r, y - 56, px * 0.3 + t * 2, mix(p.haze, tod === 'day' ? '#ffffff' : (p.sun ?? '#ffd060'), 0.5), 9, 4, 18);

  // ── far: Ruhr industry across the river plain
  skyrow(r, y - 16, o0, F, gl, tod, 3, 9, 9, 19, 12, 26, 0.35);
  for (const cx of [16, 222]) {
    const x = cx + o0;
    r.fillRect(x - 2, y - 44, 5, 28, F); r.fillRect(x - 3, y - 45, 7, 2, F);
    beacon(r, x, y - 47, t, tod, cx * 0.3);
  }
  r.fillRect(190 + o0, y - 32, 26, 16, F); dome(r, 203 + o0, y - 32, 13, 9, F); // gasometer
  hazeBand(r, p, y, 22, 0.13, fog);

  // ── the Rhine
  water(r, y - 4, 12, A('#26486e', 0.2), litc ? gl : '#cfe6f6', t, px);

  const B = y - 15; // far bank
  // ── mid: Altstadt, St. Lambertus, Landtag, Rheinturm, Neuer Zollhof
  houseRow(r, B, o1, -64, 112, M, A('#8a3626', 0.3), gl, tod, 5, 12, 22);
  houseRow(r, B, o1, 236, 304, M, A('#8a3626', 0.3), gl, tod, 6, 12, 20);
  // St. Lambertus — nave, tower, famous twisted spire
  {
    const lx = 62 + o1;
    r.fillRect(lx - 16, B - 18, 33, 18, M);
    r.fillRect(lx - 6, B - 34, 13, 34, mix(M, '#ffffff', 0.08));
    if (litc) { r.fillRect(lx - 2, B - 29, 3, 5, gl); r.fillRect(lx - 12, B - 14, 2, 5, gl); r.fillRect(lx + 10, B - 14, 2, 5, gl); }
    else r.fillRect(lx - 2, B - 29, 3, 5, mix(M, '#000000', 0.35));
    const sc = A('#4c5c5a', 0.2), hi = A('#90a6a2', 0.2), h = 24, top = B - 34;
    for (let j = 0; j < h; j++) {
      const f = j / h;
      const hw = Math.max(0, Math.round(5.5 * f));
      const bend = Math.round(Math.sin((1 - f) * 2.5) * 3.6);
      r.fillRect(lx + bend - hw, top - h + j, hw * 2 + 1, 1, j % 5 === 1 ? hi : sc);
    }
    r.fillRect(lx + 3, top - h - 3, 1, 3, sc); r.px(lx + 3, top - h - 4, A(P.gold, 0.1));
  }
  // Landtag NRW — the round parliament
  {
    const gx = 116 + o1;
    r.fillRect(gx - 16, B - 10, 33, 10, M);
    dome(r, gx, B - 10, 16, 8, mix(M, '#ffffff', 0.14));
    for (let i = -13; i <= 13; i += 4) r.fillRect(gx + i, B - 7, 2, 4, litc ? gl : mix(M, '#000000', 0.3));
  }
  // Rheinturm — concrete needle, Lichtzeitpegel dot column, pod, antenna
  {
    const x = 156 + o1, con = A('#bcbcb2', 0.1);
    r.fillRect(x - 8, B - 8, 17, 8, con);
    for (let j = 8; j < 45; j++) {
      const hw = Math.max(2, Math.round(5 - ((j - 8) / 37) * 2.2));
      r.fillRect(x - hw, B - j, hw * 2 + 1, 1, j % 8 === 0 ? mix(con, '#ffffff', 0.18) : con);
    }
    for (let k = 0; k < 9; k++) {
      const yy = B - 12 - k * 4;
      const on = litc && (k < 3 || (k < 6 ? Math.floor(t) % 2 === 0 : Math.sin(t * 1.6 + k) > -0.1));
      r.fillRect(x - 1, yy, 3, 2, on ? P.gold : mix(con, '#000000', 0.38));
    }
    r.fillRect(x - 9, B - 50, 19, 5, con);
    if (litc) r.fillRect(x - 9, B - 49, 19, 1, gl);
    r.fillRect(x - 7, B - 53, 15, 3, mix(con, '#000000', 0.22));
    r.fillRect(x - 1, B - 60, 3, 7, con);
    r.fillRect(x, B - 66, 1, 6, con);
    beacon(r, x, B - 67, t, tod, 1.1);
  }
  // Neuer Zollhof — Gehry's three leaning blocks (white / red brick / silver)
  {
    const cols: [string, number][] = [[A('#eceae4', 0.08), -1], [A('#ac4e38', 0.1), 0.4], [A('#b8bec8', 0.08), 1]];
    cols.forEach(([col, lean], k) => {
      const x = 188 + k * 17 + o1, w = 14, h = 30 + k * 5;
      for (let j = 0; j < h; j++) {
        const f = j / h;
        const dx = Math.round(Math.sin(f * 3.1) * 2.6 + lean * f * 3.4);
        const ww = w - Math.round(Math.abs(Math.sin(f * 2.3)) * 2);
        r.fillRect(x + dx, B - 1 - j, ww, 1, col);
        if (j === h - 1) r.fillRect(x + dx, B - 2 - j, ww, 1, mix(col, '#ffffff', 0.25));
      }
      for (let j = 3; j < h - 2; j += 4) for (let i = 1; i < w - 3; i += 3) {
        if (h01(i * 7 + j, k + 3) > (litc ? 0.45 : 0.6)) continue;
        const f = j / h, dx = Math.round(Math.sin(f * 3.1) * 2.6 + lean * f * 3.4);
        r.fillRect(x + dx + i, B - 2 - j, 2, 2, litc ? gl : mix(col, '#000000', 0.42));
      }
    });
  }

  // ── near: the Rheinkniebrücke, promenade, plane trees, a Rheinbahn tram
  {
    const col = A('#d6d6d0', 0), cab = A('#a8adb8', 0), dy = y - 9;
    r.fillRect(-64 + o2, dy, 372, 3, mix(col, '#000000', 0.3));
    r.fillRect(-64 + o2, dy - 1, 372, 1, col);
    for (let x = -60 + o2; x < 300 + o2; x += 30) r.fillRect(x, dy + 3, 3, 6, mix(col, '#000000', 0.38));
    const pxl = 28 + o2;
    r.fillRect(pxl - 2, dy - 42, 5, 42, col);
    r.fillRect(pxl - 3, dy - 44, 7, 2, mix(col, '#ffffff', 0.2));
    for (let k = 1; k <= 7; k++) {
      const ty = dy - 40 + k * 2;
      line(r, pxl, ty, pxl - k * 9, dy, cab);
      line(r, pxl + 2, ty, pxl + k * 9, dy, cab);
    }
    if (litc) for (let x = -60 + o2; x < 300 + o2; x += 14) r.fillRect(x, dy - 3, 1, 2, gl);
    beacon(r, pxl, dy - 45, t, tod, 2.2);
  }
  r.fillRect(0, y - 5, 240, 5, N);
  r.fillRect(0, y - 6, 240, 1, mix(N, '#ffffff', 0.18));
  for (let i = -1; i < 8; i++) {
    const x = i * 34 + 14 + o2;
    r.fillRect(x, y - 13, 2, 8, mix(N, '#000000', 0.25));
    r.disc(x + 1, y - 15, 4, A('#1e6a2c', 0.12)); r.disc(x - 1, y - 14, 3, A('#2a8038', 0.12));
  }
  tram(r, 74 + o2, y - 5, A(P.red, 0.05), A('#f0f0ea', 0.05), litc, gl);

  sign(r, 'ALTBIER', 4 + o2, y - 75, P.gold, 10, tod, t, 1);
  sign(r, 'RHEIN', 176 + o2, y - 75, P.cyan, 10, tod, t, 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// BERLIN — Fernsehturm, Brandenburger Tor, Reichstag dome, Oberbaumbrücke.
// ═════════════════════════════════════════════════════════════════════════════
const berlin: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), night = isNight(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 96, y - 62, 12);

  // ── far: Plattenbau rows + Funkturm
  skyrow(r, y - 14, o0, F, gl, tod, 7, 10, 12, 22, 14, 24, 0.4);
  {
    const x = 30 + o0;
    for (let j = 0; j < 40; j++) {
      const hw = Math.max(1, Math.round(6 - (j / 40) * 5));
      r.fillRect(x - hw, y - 14 - j, hw * 2 + 1, 1, j % 5 === 0 ? mix(F, '#ffffff', 0.12) : F);
    }
    r.fillRect(x - 5, y - 38, 11, 3, F);
    beacon(r, x, y - 56, t, tod, 0.4);
  }
  hazeBand(r, p, y, 20, 0.12, fog);

  // ── the Spree
  water(r, y - 3, 11, A('#20405e', 0.2), litc ? gl : '#c6dcee', t, px);
  const B = y - 13;

  // ── mid: dense Mitte blocks, the Reichstag, the Fernsehturm, the Tor
  skyrow(r, B, o1, M, gl, tod, 21, 11, 13, 26, 16, 30, 0.55);
  {
    const x = 56 + o1;
    r.fillRect(x - 22, B - 16, 45, 16, M);
    r.fillRect(x - 24, B - 19, 49, 3, mix(M, '#ffffff', 0.14));
    for (let i = -8; i <= 8; i += 4) r.fillRect(x + i, B - 15, 2, 12, mix(M, '#ffffff', 0.2));
    spire(r, x, B - 19, 24, 5, mix(M, '#ffffff', 0.1));
    r.fillRect(x - 9, B - 25, 19, 4, M);
    dome(r, x, B - 25, 9, 10, litc ? mix(A('#9ad8f0', 0.1), gl, 0.4) : A('#c4e8f6', 0.1));
    for (let k = -2; k <= 2; k++) line(r, x + k * 4, B - 26, x + k * 2, B - 34, mix(M, '#ffffff', 0.25));
    r.fillRect(x, B - 38, 1, 4, M);
    for (const dx of [-17, 17]) r.fillRect(x + dx - 3, B - 22, 7, 6, M);
  }
  {
    // Fernsehturm — sphere on a needle
    const x = 152 + o1, con = A('#cacac4', 0.06);
    r.fillRect(x - 6, B - 7, 13, 7, con);
    for (let j = 7; j < 40; j++) { const hw = Math.max(2, Math.round(4 - ((j - 7) / 33) * 1.6)); r.fillRect(x - hw, B - j, hw * 2 + 1, 1, con); }
    const cy = B - 48;
    r.disc(x, cy, 8, A('#d6dae0', 0.05));
    r.disc(x - 3, cy - 3, 3, mix(A('#d6dae0', 0.05), '#ffffff', 0.4));
    r.fillRect(x - 8, cy, 17, 1, mix(con, '#000000', 0.3));
    if (litc) { r.fillRect(x - 7, cy - 3, 15, 1, gl); r.fillRect(x - 6, cy + 3, 13, 1, mix(gl, P.pink, night ? 0.65 : 0.25)); }
    for (let j = 56; j < 68; j++) r.fillRect(x - 1, B - j, 3, 1, con);
    r.fillRect(x, B - 74, 1, 6, con);
    beacon(r, x, B - 75, t, tod, 0.8);
  }
  {
    // Brandenburger Tor with the quadriga
    const x = 204 + o1, col = A('#d2cec0', 0.12);
    r.fillRect(x - 18, B - 18, 37, 18, col);
    for (let i = 0; i < 5; i++) r.fillRect(x - 16 + i * 8, B - 16, 4, 16, mix(col, '#000000', 0.3));
    r.fillRect(x - 20, B - 22, 41, 4, col);
    r.fillRect(x - 6, B - 26, 13, 4, mix(col, '#000000', 0.12));
    r.fillRect(x - 5, B - 29, 2, 3, A(P.gold, 0.08)); r.fillRect(x - 1, B - 29, 2, 3, A(P.gold, 0.08)); r.fillRect(x + 3, B - 29, 2, 3, A(P.gold, 0.08));
    r.fillRect(x - 7, B - 30, 4, 1, A(P.gold, 0.08));
    if (litc) r.fillRect(x - 20, B - 21, 41, 1, mix(gl, P.orange, 0.3));
  }

  // ── near: Oberbaumbrücke
  {
    const brick = A('#8e3c32', 0.02), dy = y - 6;
    r.fillRect(-64 + o2, dy, 372, 4, brick);
    r.fillRect(-64 + o2, dy - 9, 372, 3, mix(brick, '#000000', 0.22));
    for (let x = -60 + o2; x < 300 + o2; x += 26) { r.fillRect(x, dy + 4, 4, 6, brick); archRow(r, x - 9, dy, 20, 4, 1, brick, mix(brick, '#000000', 0.5)); }
    for (const tx of [26, 96]) {
      const x = tx + o2;
      r.fillRect(x - 7, dy - 28, 15, 28, brick);
      r.fillRect(x - 8, dy - 30, 17, 3, mix(brick, '#ffffff', 0.16));
      if (litc) { r.fillRect(x - 5, dy - 25, 3, 4, gl); r.fillRect(x + 2, dy - 25, 3, 4, gl); r.fillRect(x - 5, dy - 17, 3, 4, gl); }
      spire(r, x, dy - 30, 15, 11, mix(brick, '#000000', 0.22));
      r.fillRect(x, dy - 44, 1, 3, brick);
    }
  }
  r.fillRect(0, y - 3, 240, 3, N);

  sign(r, 'BERLIN', 4 + o2, y - 75, P.pink, 10, tod, t, 1);
  sign(r, 'TECHNO', 168 + o2, y - 75, P.cyan, 10, tod, t, 2);
  if (night) for (let i = 0; i < 4; i++) {
    const bx = 20 + i * 58 + o2;
    r.fillRect(bx, y - 78, 10, 74, i % 2 ? P.pink : P.purple, 0.09 + 0.07 * Math.sin(t * 3 + i));
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// MUNICH — Frauenkirche onion domes, Olympiaturm + tent roof, BMW tower, Alps.
// ═════════════════════════════════════════════════════════════════════════════
const munich: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 112, y - 60, 13);

  // ── far: the Alps
  const snow = tod === 'night' ? '#aeb8d2' : tod === 'dusk' ? '#ffdce4' : '#f4f4f0';
  for (const [cx, w, h] of [[-20, 120, 44], [40, 110, 52], [110, 130, 62], [186, 120, 50], [250, 110, 42]] as const) {
    mountain(r, cx + o0, y - 13, w, h, F, mix(snow, p.haze, 0.22 + fog * 0.3), 0.34);
  }
  for (const [cx, w, h] of [[6, 80, 30], [76, 90, 34], [160, 84, 28], [224, 80, 30]] as const) {
    mountain(r, cx + o0, y - 9, w, h, mix(F, p.nearSky, 0.42));
  }
  hazeBand(r, p, y, 24, 0.14, fog);

  const B = y - 9;
  // ── mid: city roofs, Olympiapark, Frauenkirche, Rathaus, BMW
  houseRow(r, B, o1, -64, 304, M, A('#9a4a2e', 0.25), gl, tod, 9, 10, 18);
  {
    // Olympic tent roof — sagging cable canopies between masts
    const cab = mix(M, '#ffffff', 0.3), base = B - 4;
    for (let k = 0; k < 4; k++) {
      const x0 = 4 + k * 18 + o1, x1 = x0 + 18, mh = 15 + (k % 2) * 4;
      r.fillRect(x0, base - mh, 2, mh, cab);
      for (let x = x0; x <= x1; x++) {
        const u = (x - x0) / (x1 - x0);
        const ty = base - mh + Math.round(Math.sin(u * Math.PI) * 10);
        r.fillRect(x, ty, 1, base - ty, mix(M, '#ffffff', 0.12), 0.75);
        r.fillRect(x, ty, 1, 1, cab);
      }
    }
    r.fillRect(4 + o1, base - 15, 2, 15, cab);
  }
  {
    // Olympiaturm
    const x = 38 + o1, con = A('#c6c6c0', 0.1);
    r.fillRect(x - 4, B - 6, 9, 6, con);
    for (let j = 6; j < 42; j++) { const hw = Math.max(1, Math.round(3 - ((j - 6) / 36) * 1.2)); r.fillRect(x - hw, B - j, hw * 2 + 1, 1, con); }
    r.fillRect(x - 8, B - 48, 17, 5, con);
    if (litc) r.fillRect(x - 7, B - 47, 15, 1, gl);
    r.fillRect(x - 5, B - 51, 11, 3, mix(con, '#000000', 0.2));
    r.fillRect(x - 1, B - 59, 3, 8, con); r.fillRect(x, B - 66, 1, 7, con);
    beacon(r, x, B - 67, t, tod, 0.5);
  }
  {
    // Frauenkirche — brick nave + twin towers with copper onion domes
    const x = 116 + o1, brick = A('#9a4636', 0.1), cop = A('#3aa88a', 0.1);
    r.fillRect(x - 20, B - 23, 41, 23, brick);
    for (let i = -16; i <= 16; i += 5) r.fillRect(x + i, B - 19, 3, 13, litc ? gl : mix(brick, '#000000', 0.32));
    for (const dx of [-15, 15]) {
      r.fillRect(x + dx - 7, B - 40, 15, 40, brick);
      r.fillRect(x + dx - 8, B - 42, 17, 2, mix(brick, '#ffffff', 0.16));
      if (litc) r.fillRect(x + dx - 2, B - 36, 4, 5, gl);
      onion(r, x + dx, B - 42, 8, 12, cop, mix(cop, '#ffffff', 0.32));
    }
  }
  {
    // Neues Rathaus — gothic spire
    const x = 172 + o1, col = A('#8a8a7a', 0.14);
    r.fillRect(x - 13, B - 20, 27, 20, col);
    r.fillRect(x - 4, B - 40, 9, 20, col);
    if (litc) { r.fillRect(x - 2, B - 34, 4, 4, gl); r.fillRect(x - 10, B - 16, 3, 5, gl); r.fillRect(x + 8, B - 16, 3, 5, gl); }
    spire(r, x, B - 40, 9, 15, mix(col, '#000000', 0.22));
    r.px(x, B - 56, A(P.gold, 0.08));
  }
  {
    // BMW four-cylinder tower + the bowl
    const x = 220 + o1, sil = A('#b4bac4', 0.08);
    for (let k = 0; k < 4; k++) r.fillRect(x - 10 + k * 6, B - 36, 5, 36, k % 2 ? mix(sil, '#000000', 0.2) : sil);
    r.fillRect(x - 11, B - 40, 24, 4, sil);
    if (litc) for (let j = B - 33; j < B - 4; j += 5) r.fillRect(x - 10, j, 22, 1, gl);
    dome(r, x - 24, B, 12, 9, sil); r.fillRect(x - 36, B - 4, 25, 4, mix(sil, '#000000', 0.22));
  }

  // ── near: pines and beer-garden chestnuts
  r.fillRect(0, y - 9, 240, 9, N);
  r.fillRect(0, y - 10, 240, 1, mix(N, '#ffffff', 0.15));
  for (let i = -1; i < 9; i++) {
    const x = i * 30 + 8 + o2, h = 16 + (i % 3) * 5;
    if (i % 2) { spire(r, x, y - 7, 14, h, A('#1c5a34', 0.08)); r.fillRect(x - 1, y - 8, 3, 5, A('#3a2a1a', 0.08)); }
    else { r.disc(x, y - 15 - (i % 3), 7, A('#2a7a38', 0.1)); r.fillRect(x - 1, y - 14, 3, 8, A('#3a2a1a', 0.08)); }
  }
  sign(r, 'BREZN', 4 + o2, y - 75, P.gold, 10, tod, t, 1);
  sign(r, 'ALPEN', 178 + o2, y - 75, P.cyan, 10, tod, t, 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// ISTANBUL — Hagia Sophia, the Blue Mosque, Galata Tower, the Bosphorus Bridge
// over the strait with ferries, seagulls and cypresses.
// ═════════════════════════════════════════════════════════════════════════════
const istanbul: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 150, y - 56, 15);
  clouds(r, y - 48, px * 0.3 + t * 2, mix(p.haze, tod === 'day' ? '#ffffff' : (p.sun ?? '#ffb432'), 0.55), 4, 4, 14);

  // ── far: the Asian shore
  for (const [cx, w, h] of [[-10, 120, 26], [70, 130, 32], [170, 140, 30], [260, 120, 26]] as const) mountain(r, cx + o0, y - 17, w, h, F);
  skyrow(r, y - 17, o0, F, gl, tod, 13, 8, 14, 10, 20, 0.35);
  for (const mx of [24, 92, 150, 208, 262]) {
    const x = mx + o0;
    dome(r, x, y - 17, 7, 5, F);
    r.fillRect(x + 9, y - 37, 2, 20, F); r.px(x + 9, y - 39, F);
  }
  hazeBand(r, p, y, 22, 0.14, fog);

  // ── the Bosphorus
  water(r, y - 2, 16, A('#1a4a6e', 0.18), litc ? gl : '#b8ecec', t, px);
  const B = y - 18; // the historic peninsula

  // ── mid: the old city
  houseRow(r, B, o1, -64, 304, M, A('#8a4a36', 0.3), gl, tod, 15, 8, 16);
  {
    // Galata Tower
    const x = 30 + o1, stone = A('#c8b48e', 0.1);
    r.fillRect(x - 7, B - 32, 15, 32, stone);
    r.fillRect(x - 8, B - 35, 17, 3, mix(stone, '#ffffff', 0.22));
    if (litc) { r.fillRect(x - 7, B - 34, 15, 1, gl); for (let i = -4; i <= 4; i += 4) r.fillRect(x + i, B - 28, 2, 3, gl); }
    r.fillRect(x - 6, B - 38, 13, 3, stone);
    spire(r, x, B - 38, 13, 14, A('#a03a2a', 0.08));
    r.px(x, B - 53, A(P.gold, 0.08));
  }
  {
    // Hagia Sophia
    const x = 106 + o1, body = A('#c06a46', 0.1), lead = A('#98a0a8', 0.1);
    r.fillRect(x - 26, B - 17, 53, 17, body);
    dome(r, x - 19, B - 17, 11, 8, lead); dome(r, x + 19, B - 17, 11, 8, lead);
    r.fillRect(x - 14, B - 25, 29, 8, body);
    if (litc) for (let i = -12; i <= 12; i += 5) r.fillRect(x + i, B - 23, 2, 4, gl);
    dome(r, x, B - 25, 15, 12, lead);
    r.fillRect(x - 10, B - 26, 21, 1, mix(lead, '#000000', 0.25));
    r.fillRect(x, B - 40, 1, 3, A(P.gold, 0.08));
    for (const [dx, mh] of [[-32, 44], [32, 44], [-22, 37], [22, 37]] as const) minaret(r, x + dx, B, mh, A('#cfc0a2', 0.1), A('#8a8a80', 0.1), litc, gl);
  }
  {
    // the Blue Mosque
    const x = 190 + o1, body = A('#93a2b8', 0.1), dm = A('#6e8098', 0.1);
    r.fillRect(x - 22, B - 13, 45, 13, body);
    dome(r, x - 16, B - 13, 8, 6, dm); dome(r, x + 16, B - 13, 8, 6, dm);
    dome(r, x - 9, B - 17, 8, 7, dm); dome(r, x + 9, B - 17, 8, 7, dm);
    r.fillRect(x - 11, B - 19, 23, 6, body);
    if (litc) for (let i = -9; i <= 9; i += 5) r.fillRect(x + i, B - 18, 2, 3, gl);
    dome(r, x, B - 19, 12, 10, dm);
    r.fillRect(x, B - 32, 1, 3, A(P.gold, 0.08));
    for (const [dx, mh] of [[-28, 42], [28, 42], [-18, 34], [18, 34], [-34, 30], [34, 30]] as const) minaret(r, x + dx, B, mh, A('#c0c4c0', 0.1), A('#7a7a78', 0.1), litc, gl);
  }

  // ── near: the Bosphorus Bridge, ferries, gulls, cypresses
  {
    const col = A('#5c606c', 0), cab = A('#a6acb8', 0);
    suspension(r, -68 + o2, 308 + o2, y - 10, 32, col, cab, litc, gl);
    if (litc) for (let x = -60 + o2; x < 300 + o2; x += 10) r.fillRect(x, y - 12, 2, 1, mix(gl, P.cyan, isNight(tod) ? 0.45 : 0.1));
    beacon(r, 26 + o2, y - 45, t, tod, 0.3); beacon(r, 216 + o2, y - 45, t, tod, 1.7);
  }
  for (let i = 0; i < 2; i++) {
    const bx = Math.round(((t * (7 + i * 4) + i * 150) % 320) - 40) + o2;
    boat(r, bx, y - 4, A('#e6e6de', 0), A(P.red, 0), litc, gl, i === 0);
    for (let k = 1; k < 4; k++) r.fillRect(bx - k * 4, y - 3, 3, 1, mix(A('#1a4a6e', 0.18), '#ffffff', 0.4));
  }
  r.fillRect(0, y - 2, 240, 2, N);
  for (const x0 of [-10, 6, 18, 216, 230, 244]) {
    const x = x0 + o2, h = 14 + ((x0 + 40) % 3) * 4;
    spire(r, x, y - 1, 9, h, A('#1c4a30', 0.08));
    r.fillRect(x - 1, y - 2, 3, 2, A('#3a2a1a', 0.08));
  }
  for (let i = 0; i < 5; i++) {
    const gx = Math.round(((t * 11 + i * 63) % 300) - 30);
    gull(r, gx, y - 50 - Math.round(Math.sin(t * 0.8 + i) * 10), t, litc ? '#e8e8f0' : '#f8f8f4', i);
  }
  sign(r, 'BOĞAZ', 4 + o2, y - 75, P.cyan, 10, tod, t, 1);
  sign(r, 'ÇAY', 202 + o2, y - 75, P.gold, 10, tod, t, 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// PARIS — Eiffel Tower, Arc de Triomphe, Sacré-Cœur, Montparnasse, Haussmann.
// ═════════════════════════════════════════════════════════════════════════════
const paris: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), night = isNight(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 60, y - 58, 13);
  clouds(r, y - 50, px * 0.3 + t * 2, mix(p.haze, tod === 'day' ? '#ffffff' : '#ffb0c8', 0.5), 6, 4, 14);

  // ── far: Montmartre with Sacré-Cœur, the Montparnasse slab
  mountain(r, 196 + o0, y - 13, 150, 48, F);
  {
    const x = 194 + o0, hb = y - 50, st = mix(A('#efece0', 0.18), F, 0.12), sh = mix(st, '#000000', 0.22);
    r.fillRect(x - 13, hb - 8, 27, 14, st);
    r.fillRect(x - 13, hb + 5, 27, 1, sh);
    for (let i = -10; i <= 10; i += 4) r.fillRect(x + i, hb - 5, 2, 9, sh);
    dome(r, x - 10, hb - 8, 4, 7, st); dome(r, x + 10, hb - 8, 4, 7, st);
    r.fillRect(x - 10, hb - 17, 1, 2, st); r.fillRect(x + 10, hb - 17, 1, 2, st);
    r.fillRect(x - 5, hb - 14, 11, 6, st);
    for (let i = -4; i <= 4; i += 3) r.fillRect(x + i, hb - 13, 1, 4, sh);
    dome(r, x, hb - 14, 7, 13, st);
    r.fillRect(x - 7, hb - 14, 15, 1, sh);
    r.fillRect(x, hb - 30, 1, 4, st);
    r.fillRect(x + 15, hb - 12, 5, 18, st); spire(r, x + 17, hb - 12, 5, 6, sh);
  }
  {
    const x = 18 + o0;
    block(r, x - 9, y - 13, 19, 44, F, gl, tod, 7, 0.5);
    r.fillRect(x - 9, y - 58, 19, 2, mix(F, '#000000', 0.25));
  }
  skyrow(r, y - 13, o0, F, gl, tod, 5, 10, 16, 10, 18, 0.4);
  hazeBand(r, p, y, 20, 0.12, fog);

  // ── the Seine
  water(r, y - 4, 10, A('#2a4a66', 0.2), litc ? gl : '#cfe0ee', t, px);
  const B = y - 13;

  // ── mid: Haussmann rooftops, the Arc, the Eiffel Tower
  {
    let x = -64 + o1, i = 0;
    while (x < 304 + o1) {
      const w = 16 + Math.round(h01(i, 4) * 10), h = 16 + Math.round(h01(i + 5, 4) * 6);
      r.fillRect(x, B - h, w, h, M);
      for (let j = 0; j < 5; j++) r.fillRect(x + j, B - h - 5 + j, Math.max(1, w - j * 2), 1, A('#5a6068', 0.3));
      for (let wy = B - h + 3; wy < B - 3; wy += 5) for (let wx = x + 2; wx < x + w - 3; wx += 5) {
        r.fillRect(wx, wy, 3, 3, litc && h01(wx + wy, 4) < 0.6 ? gl : mix(M, '#000000', 0.32));
      }
      for (let c = 0; c < 3; c++) if (h01(i * 3 + c, 6) < 0.6) r.fillRect(x + 3 + c * 6, B - h - 8, 2, 4, A('#8a5a4a', 0.25));
      x += w + 1; i++;
    }
  }
  {
    // Arc de Triomphe
    const x = 56 + o1, st = A('#e2dccc', 0.1);
    r.fillRect(x - 15, B - 24, 31, 24, st);
    archRow(r, x - 15, B, 31, 24, 1, st, mix(st, '#000000', 0.62));
    r.fillRect(x - 17, B - 28, 35, 4, st);
    r.fillRect(x - 15, B - 30, 31, 2, mix(st, '#ffffff', 0.18));
    if (litc) { r.fillRect(x - 17, B - 24, 35, 1, gl); r.fillRect(x - 13, B - 1, 27, 1, mix(gl, P.orange, 0.4)); }
  }
  {
    // Eiffel Tower
    const x = 138 + o1, ir = A('#8a6a4a', 0.06), h = 54;
    for (let j = 0; j < h; j++) {
      const f = j / h;
      const hw = Math.max(1, Math.round(2 + 15 * Math.pow(1 - f, 2.6)));
      if (hw >= 4) {
        r.fillRect(x - hw, B - j, 2, 1, ir); r.fillRect(x + hw - 1, B - j, 2, 1, ir);
        if (j % 6 === 0) r.fillRect(x - hw, B - j, hw * 2, 1, mix(ir, '#000000', 0.18));
        if (j > 3 && j < 20 && j % 3 === 0) { const k = Math.round(hw * 0.45); r.fillRect(x - k, B - j, 2, 1, mix(ir, '#000000', 0.2)); r.fillRect(x + k - 1, B - j, 2, 1, mix(ir, '#000000', 0.2)); }
      } else r.fillRect(x - hw, B - j, hw * 2 + 1, 1, ir);
    }
    for (let k = -8; k <= 8; k++) r.px(x + k, B - 17 + Math.round((k * k) / 12), ir);
    r.fillRect(x - 16, B - 22, 33, 3, ir); r.fillRect(x - 9, B - 42, 19, 3, ir);
    r.fillRect(x - 1, B - h - 6, 3, 6, ir); r.fillRect(x, B - h - 10, 1, 4, ir);
    if (litc) {
      r.fillRect(x - 15, B - 21, 31, 1, gl); r.fillRect(x - 8, B - 41, 17, 1, gl);
      for (let j = 4; j < h; j += 7) r.fillRect(x - 1, B - j, 3, 1, mix(gl, P.orange, 0.35));
      if (night) for (let k = 0; k < 16; k++) {
        const j = Math.floor(h01(k + Math.floor(t * 8), 9) * h);
        const hw = Math.max(1, Math.round(2 + 15 * Math.pow(1 - j / h, 2.6)));
        r.px(x - hw + Math.round(h01(k, 11) * hw * 2), B - j, P.white);
      }
    }
    beacon(r, x, B - h - 11, t, tod, 1.4);
  }

  // ── near: the quay, a bateau-mouche, plane trees
  r.fillRect(0, y - 5, 240, 5, N);
  r.fillRect(0, y - 6, 240, 1, mix(N, '#ffffff', 0.2));
  {
    const bx = Math.round(((t * 9) % 320) - 40) + o2;
    boat(r, bx, y - 6, A('#e8e4d8', 0), A('#2a4a66', 0), litc, gl, true);
  }
  for (let i = -1; i < 8; i++) {
    const x = i * 34 + 12 + o2, h = 12 + (i % 3) * 4;
    r.fillRect(x - 1, y - 5 - h, 3, h, A('#4a3a28', 0.08));
    r.disc(x, y - 7 - h, 6, A('#2a6a34', 0.1)); r.disc(x - 3, y - 5 - h, 4, A('#347a3c', 0.1));
  }
  sign(r, 'CAFÉ', 4 + o2, y - 75, P.red, 10, tod, t, 1);
  sign(r, 'MÉTRO', 178 + o2, y - 75, P.gold, 10, tod, t, 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// LONDON — Elizabeth Tower, the London Eye, Tower Bridge, the Shard, the Gherkin.
// ═════════════════════════════════════════════════════════════════════════════
const london: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 112, y - 66, 11);
  clouds(r, y - 56, px * 0.3 + t * 2.5, mix(p.haze, '#ffffff', tod === 'day' ? 0.55 : 0.25), 11, 6, 22);

  // ── far: chimneys, St Paul's, blocks
  skyrow(r, y - 14, o0, F, gl, tod, 23, 9, 15, 12, 22, 0.4);
  {
    const x = 66 + o0, st = mix(A('#d8d4c8', 0.3), F, 0.3);
    r.fillRect(x - 16, y - 26, 33, 12, st);
    r.fillRect(x - 7, y - 33, 15, 7, st);
    dome(r, x, y - 33, 9, 11, st);
    r.fillRect(x - 2, y - 47, 5, 3, st); r.fillRect(x, y - 50, 1, 3, st);
    for (const dx of [-14, 14]) { r.fillRect(x + dx - 3, y - 35, 6, 9, st); spire(r, x + dx, y - 35, 6, 5, st); }
  }
  for (const cx of [206, 228]) { const x = cx + o0; r.fillRect(x - 2, y - 42, 5, 28, F); beacon(r, x, y - 44, t, tod, cx * 0.2); }
  hazeBand(r, p, y, 22, 0.14, fog);

  // ── the Thames
  water(r, y - 3, 12, A('#2a4454', 0.2), litc ? gl : '#c8d8e0', t, px);
  const B = y - 14;

  // ── mid: the Shard, the Gherkin, the Elizabeth Tower, the Eye
  skyrow(r, B, o1, M, gl, tod, 29, 10, 14, 20, 14, 26, 0.5);
  {
    const x = 34 + o1, gls = A('#9fb4c4', 0.06);
    for (let j = 0; j < 62; j++) {
      const hw = Math.max(1, Math.round(8 * (1 - j / 62) + 0.5));
      r.fillRect(x - hw, B - j, hw * 2 + 1, 1, j % 6 === 0 ? mix(gls, '#ffffff', 0.2) : gls);
      if (litc && j % 5 === 2) r.fillRect(x - hw + 1, B - j, Math.max(1, hw * 2 - 1), 1, mix(gl, gls, 0.5));
    }
    for (let k = 0; k < 5; k++) r.fillRect(x - 2 + k, B - 62 - k, 2, 4, gls);
    beacon(r, x, B - 68, t, tod, 0.9);
  }
  {
    const x = 74 + o1, gls = A('#5a8a70', 0.06), h = 40;
    for (let j = 0; j <= h; j++) {
      const f = j / h;
      const hw = Math.max(1, Math.round(8 * Math.sin(Math.PI * (0.16 + 0.78 * f))));
      r.fillRect(x - hw, B - j, hw * 2 + 1, 1, (j + Math.round(f * 4)) % 5 === 0 ? mix(gls, '#ffffff', 0.24) : gls);
      if (litc && j % 4 === 1) r.fillRect(x - hw, B - j, hw * 2 + 1, 1, mix(gl, gls, 0.55));
    }
    r.fillRect(x, B - h - 3, 1, 3, gls);
  }
  {
    // Elizabeth Tower (Big Ben) + Parliament
    const x = 150 + o1, st = A('#c8b078', 0.08);
    r.fillRect(x - 26, B - 17, 24, 17, st);
    for (let i = 0; i < 5; i++) r.fillRect(x - 24 + i * 5, B - 14, 3, 11, litc ? gl : mix(st, '#000000', 0.3));
    for (let i = 0; i < 6; i++) r.fillRect(x - 25 + i * 4, B - 20, 2, 3, st);
    r.fillRect(x - 7, B - 42, 15, 42, st);
    r.fillRect(x - 8, B - 44, 17, 2, mix(st, '#ffffff', 0.22));
    r.disc(x, B - 36, 4, litc ? mix(gl, '#ffffff', 0.55) : '#efe8d0');
    r.px(x, B - 38, '#0b0b12'); r.px(x + 2, B - 36, '#0b0b12'); r.px(x, B - 36, '#0b0b12');
    r.fillRect(x - 6, B - 48, 13, 4, st);
    spire(r, x, B - 48, 13, 13, A('#4a6a58', 0.08));
    r.px(x, B - 62, A(P.gold, 0.06));
  }
  wheel(r, 208 + o1, B - 26, 21, A('#8fa4b4', 0.04), A('#cfd8e0', 0.04), t, litc, mix(gl, P.cyan, 0.35));

  // ── near: Tower Bridge
  {
    const dy = y - 7, st = A('#b4ae9a', 0), blue = A('#2a6a8a', 0);
    r.fillRect(-64 + o2, dy, 372, 3, mix(st, '#000000', 0.28));
    // suspended side spans (catenary)
    for (let k = 0; k <= 24; k++) { const u = k / 24; r.px(-64 + o2 + k * 3, dy - 2 - Math.round(u * u * 24), mix(st, '#000000', 0.15)); }
    for (let k = 0; k <= 40; k++) { const u = k / 40; r.px(120 + o2 + k * 4.6, dy - 2 - Math.round((1 - u) * (1 - u) * 24), mix(st, '#000000', 0.15)); }
    for (const tx of [8, 116]) {
      const x = tx + o2;
      r.fillRect(x - 8, dy - 36, 17, 36, st);
      archRow(r, x - 8, dy, 17, 17, 1, st, mix(st, '#000000', 0.45));
      if (litc) { r.fillRect(x - 5, dy - 32, 3, 4, gl); r.fillRect(x + 2, dy - 32, 3, 4, gl); }
      r.fillRect(x - 9, dy - 40, 19, 4, mix(st, '#ffffff', 0.14));
      spire(r, x, dy - 40, 17, 12, blue);
      for (const dx2 of [-7, 7]) { r.fillRect(x + dx2 - 1, dy - 42, 3, 3, st); spire(r, x + dx2, dy - 42, 3, 4, blue); }
      r.px(x, dy - 53, A(P.gold, 0.04));
    }
    r.fillRect(8 + o2, dy - 34, 109, 3, blue); r.fillRect(8 + o2, dy - 28, 109, 2, blue);
    for (let k = 0; k < 7; k++) r.fillRect(18 + o2 + k * 15, dy - 26, 1, 26, mix(st, '#000000', 0.32));
  }
  r.fillRect(0, y - 4, 240, 4, N);
  sign(r, 'TUBE', 4 + o2, y - 75, P.red, 10, tod, t, 1);
  sign(r, 'TEA', 202 + o2, y - 75, P.gold, 10, tod, t, 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// ROME — the Colosseum, St Peter's dome, the Vittoriano, umbrella pines.
// ═════════════════════════════════════════════════════════════════════════════
const rome: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 86, y - 60, 15);
  clouds(r, y - 52, px * 0.3 + t * 2, mix(p.haze, tod === 'day' ? '#ffffff' : '#ffc070', 0.5), 8, 4, 16);

  // ── far: the Alban hills and an aqueduct
  for (const [cx, w, h] of [[20, 140, 26], [130, 150, 32], [250, 130, 24]] as const) mountain(r, cx + o0, y - 12, w, h, F);
  houseRow(r, y - 12, o0, -64, 304, F, mix(F, '#000000', 0.2), gl, tod, 33, 8, 16);
  hazeBand(r, p, y, 20, 0.12, fog);
  const B = y - 12;

  // ── mid: the Colosseum, the Vittoriano, St Peter's
  houseRow(r, B, o1, -64, 304, M, A('#b0562e', 0.22), gl, tod, 35, 10, 20);
  {
    const x = 52 + o1, st = A('#d2a86e', 0.08);
    archRow(r, x - 30, B - 20, 61, 12, 8, st, mix(st, '#000000', 0.5));
    archRow(r, x - 28, B - 10, 57, 10, 7, st, mix(st, '#000000', 0.45));
    archRow(r, x - 26, B, 53, 10, 7, st, mix(st, '#000000', 0.4));
    r.fillRect(x - 32, B - 32, 40, 12, st);
    archRow(r, x - 32, B - 20, 40, 12, 5, st, mix(st, '#000000', 0.5));
    r.fillRect(x - 33, B - 34, 42, 2, mix(st, '#ffffff', 0.16));
    if (litc) for (let i = 0; i < 7; i++) r.fillRect(x - 27 + i * 8, B - 6, 3, 4, mix(gl, P.orange, 0.4));
  }
  {
    // the Vittoriano
    const x = 138 + o1, st = A('#f0ece0', 0.08);
    r.fillRect(x - 24, B - 10, 49, 10, st);
    r.fillRect(x - 19, B - 16, 39, 6, st);
    for (let i = -17; i <= 17; i += 4) r.fillRect(x + i, B - 24, 3, 8, st);
    r.fillRect(x - 20, B - 27, 41, 3, st);
    r.fillRect(x - 22, B - 25, 45, 1, mix(st, '#000000', 0.15));
    for (const dx of [-18, 18]) { r.fillRect(x + dx - 3, B - 31, 7, 4, st); r.fillRect(x + dx - 1, B - 34, 3, 3, A(P.gold, 0.06)); }
    if (litc) r.fillRect(x - 24, B - 9, 49, 1, gl);
  }
  {
    // St Peter's basilica
    const x = 210 + o1, st = A('#e0d6bc', 0.1);
    r.fillRect(x - 26, B - 15, 53, 15, st);
    for (let i = -22; i <= 22; i += 5) r.fillRect(x + i, B - 12, 3, 9, litc ? gl : mix(st, '#000000', 0.28));
    r.fillRect(x - 12, B - 23, 25, 8, st);
    dome(r, x, B - 23, 13, 15, mix(st, '#8a9a8a', 0.35));
    for (let k = -2; k <= 2; k++) line(r, x + k * 5, B - 24, x + k * 2, B - 36, mix(st, '#000000', 0.2));
    r.fillRect(x - 3, B - 40, 7, 4, st); r.fillRect(x, B - 45, 1, 5, st); r.px(x, B - 46, A(P.gold, 0.06));
    dome(r, x - 19, B - 15, 6, 5, mix(st, '#8a9a8a', 0.3)); dome(r, x + 19, B - 15, 6, 5, mix(st, '#8a9a8a', 0.3));
  }

  // ── near: umbrella pines
  r.fillRect(0, y - 8, 240, 8, N);
  r.fillRect(0, y - 9, 240, 1, mix(N, '#ffffff', 0.14));
  for (let i = -1; i < 6; i++) {
    const x = i * 46 + 20 + o2, h = 20 + (i % 3) * 5;
    const trunk = A('#4a3420', 0.06), crown = A('#1e5a2c', 0.08), top = A('#2a7434', 0.08);
    for (let j = 0; j < h; j++) r.fillRect(x - 1 + Math.round(Math.sin(j * 0.2) * 1.2), y - 6 - j, 2, 1, trunk);
    r.fillRect(x - 11, y - 8 - h, 23, 2, crown);
    r.fillRect(x - 8, y - 10 - h, 17, 2, crown);
    r.fillRect(x - 5, y - 12 - h, 11, 2, top);
    r.fillRect(x - 9, y - 6 - h, 19, 2, crown);
  }
  sign(r, 'ROMA', 4 + o2, y - 75, P.red, 10, tod, t, 1);
  sign(r, 'PIZZA', 178 + o2, y - 75, P.gold, 10, tod, t, 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// AMSTERDAM — stepped-gable canal houses mirrored in the water, the Westerkerk,
// a windmill and a white drawbridge.
// ═════════════════════════════════════════════════════════════════════════════
/** Canal house row with gables, lit windows and a wobbling water reflection. */
function gableRow(r: Renderer, base: number, ox: number, x0: number, x1: number, cols: string[], glow: string, tod: TimeOfDay, seed: number, hMin: number, hMax: number, reflect: number): void {
  let x = x0 + ox, i = 0;
  const litc = isDark(tod);
  while (x < x1 + ox) {
    const w = 8 + Math.round(h01(i, seed) * 5);
    const h = hMin + Math.round(h01(i + 11, seed) * (hMax - hMin));
    const col = cols[i % cols.length];
    r.fillRect(x, base - h, w, h, col);
    const top = base - h;
    const style = Math.floor(h01(i + 21, seed) * 3);
    if (style === 0) { for (let s = 0; s < 4; s++) r.fillRect(x + s, top - 2 - s * 2, Math.max(1, w - s * 2), 2, col); }
    else if (style === 1) { dome(r, x + (w >> 1), top, Math.max(2, (w >> 1) - 1), 4, col); r.fillRect(x + 2, top - 6, Math.max(1, w - 4), 2, col); }
    else spire(r, x + (w >> 1), top, w, 5, col);
    r.fillRect(x, top - 1, w, 1, mix(col, '#ffffff', 0.22));
    for (let wy = base - h + 3; wy < base - 2; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) {
      if (h01(wx * 5 + wy, seed) < (litc ? 0.6 : 0.3)) r.fillRect(wx, wy, 2, 2, litc ? glow : mix(col, '#000000', 0.42));
    }
    if (reflect > 0) {
      for (let j = 0; j < reflect; j++) {
        const wob = Math.round(Math.sin((j + i) * 1.1) * 1.3);
        r.fillRect(x + wob, base + j, w, 1, col, Math.max(0, 0.55 - j / (reflect * 1.8)));
        if (litc && j % 3 === 1) r.fillRect(x + wob + 2, base + j, 2, 1, glow, Math.max(0, 0.5 - j / (reflect * 1.7)));
      }
    }
    x += w + 1; i++;
  }
}
const amsterdam: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 40, y - 62, 12);
  clouds(r, y - 58, px * 0.3 + t * 3, mix(p.haze, tod === 'day' ? '#ffffff' : '#ffc0a0', 0.45), 12, 6, 24);

  // ── far: polder, a windmill, low warehouses
  r.fillRect(0, y - 26, 240, 5, F);
  skyrow(r, y - 25, o0, F, gl, tod, 41, 8, 14, 8, 14, 0.35);
  {
    const x = 208 + o0, mw = mix(F, '#000000', 0.12);
    for (let j = 0; j < 24; j++) { const hw = Math.round(3 + (j / 24) * 5); r.fillRect(x - hw, y - 25 - j, hw * 2 + 1, 1, mw); }
    r.fillRect(x - 5, y - 53, 11, 5, mix(F, '#000000', 0.3));
    const a = t * 0.55;
    for (let k = 0; k < 4; k++) {
      const ang = a + (k / 4) * Math.PI * 2, cxs = Math.cos(ang), sns = Math.sin(ang);
      line(r, x, y - 51, x + cxs * 16, y - 51 + sns * 16, mix(F, '#ffffff', 0.3));
      line(r, x + cxs * 4 - sns * 2, y - 51 + sns * 4 + cxs * 2, x + cxs * 15 - sns * 2, y - 51 + sns * 15 + cxs * 2, mix(F, '#ffffff', 0.15));
    }
    r.fillRect(x - 1, y - 52, 3, 3, mix(F, '#000000', 0.45));
  }
  hazeBand(r, p, y, 18, 0.12, fog);

  // ── the canal
  water(r, y - 3, 22, A('#1e4238', 0.2), litc ? gl : '#b8d8cc', t, px);
  const B = y - 24;

  // ── mid: canal houses mirrored in the water, the Westerkerk
  {
    const cols = [A('#6a3a2a', 0.06), A('#4a3a30', 0.06), A('#7a4a34', 0.06), A('#3a3a42', 0.06), A('#5a4636', 0.06)];
    gableRow(r, B, o1, -64, 304, cols, gl, tod, 51, 13, 24, 17);
  }
  {
    const x = 72 + o1, st = A('#8a7a68', 0.06), crown = A('#2a5a9a', 0.06);
    r.fillRect(x - 16, B - 14, 33, 14, st);
    r.fillRect(x - 7, B - 38, 15, 38, st);
    r.fillRect(x - 8, B - 40, 17, 2, mix(st, '#ffffff', 0.22));
    if (litc) { r.fillRect(x - 2, B - 33, 4, 5, gl); r.fillRect(x - 12, B - 10, 3, 5, gl); r.fillRect(x + 10, B - 10, 3, 5, gl); }
    r.fillRect(x - 5, B - 45, 11, 5, st);
    spire(r, x, B - 45, 11, 10, mix(st, '#000000', 0.2));
    r.fillRect(x - 3, B - 58, 7, 4, crown);
    r.fillRect(x - 1, B - 62, 3, 4, crown);
    r.px(x, B - 63, A(P.gold, 0.05));
    for (let j = 0; j < 17; j++) r.fillRect(x - 7, B + j, 15, 1, st, Math.max(0, 0.5 - j / 34));
  }

  // ── near: the Magere Brug drawbridge over the canal
  {
    const wht = A('#f0ece0', 0), dy = y - 6;
    const open = 0.22 + 0.26 * (0.5 + 0.5 * Math.sin(t * 0.45));
    r.fillRect(22 + o2, dy, 32, 3, wht); r.fillRect(118 + o2, dy, 32, 3, wht);
    r.fillRect(22 + o2, dy - 4, 32, 1, mix(wht, '#000000', 0.3)); r.fillRect(118 + o2, dy - 4, 32, 1, mix(wht, '#000000', 0.3));
    r.fillRect(26 + o2, dy + 3, 4, 6, mix(wht, '#000000', 0.4)); r.fillRect(142 + o2, dy + 3, 4, 6, mix(wht, '#000000', 0.4));
    for (let k = 0; k < 32; k++) {
      const lx = 52 + o2 + k, rx = 120 + o2 - k, dyy = Math.round(k * open);
      r.fillRect(lx, dy - dyy, 1, 2, wht); r.fillRect(rx, dy - dyy, 1, 2, wht);
    }
    for (const bx of [50, 122]) {
      const x = bx + o2;
      r.fillRect(x - 4, dy - 26, 2, 26, wht); r.fillRect(x + 3, dy - 26, 2, 26, wht);
      r.fillRect(x - 5, dy - 28, 11, 2, wht);
      line(r, x + (bx === 50 ? 4 : -3), dy - 24, x + (bx === 50 ? 20 : -19), dy - 2 - Math.round(17 * open), mix(wht, '#000000', 0.32));
      if (litc) r.fillRect(x - 1, dy - 31, 3, 3, gl);
    }
  }
  r.fillRect(0, y - 3, 240, 3, N);
  r.fillRect(0, y - 4, 240, 1, mix(N, '#ffffff', 0.18));
  for (const x0 of [-6, 12, 206, 226, 246]) {
    const x = x0 + o2;
    r.fillRect(x - 1, y - 15, 3, 12, A('#3a2c1e', 0.06));
    r.disc(x, y - 18, 6, A('#2a6a3c', 0.08)); r.disc(x + 3, y - 16, 4, A('#337a44', 0.08));
  }
  sign(r, 'GRACHT', 4 + o2, y - 75, P.cyan, 10, tod, t, 1);
  sign(r, 'FIETS', 178 + o2, y - 75, P.gold, 10, tod, t, 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// BARCELONA — the Sagrada Família, Torre Glòries, Montjuïc, Tibidabo, the sea.
// ═════════════════════════════════════════════════════════════════════════════
const barcelona: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 204, y - 58, 14);

  // ── far: Tibidabo, the Collserola mast, Montjuïc with its castle
  mountain(r, 52 + o0, y - 14, 150, 46, F);
  {
    const x = 44 + o0, st = mix(A('#e0dcc8', 0.35), F, 0.3);
    r.fillRect(x - 7, y - 54, 15, 10, st); spire(r, x, y - 54, 15, 8, st);
    r.fillRect(x, y - 66, 1, 4, st);
    const cx = 88 + o0;
    for (let j = 0; j < 32; j++) { const hw = Math.max(1, Math.round(3 - (j / 32) * 2)); r.fillRect(cx - hw, y - 46 - j, hw * 2 + 1, 1, F); }
    r.fillRect(cx - 5, y - 62, 11, 6, F);
    beacon(r, cx, y - 79, t, tod, 0.6);
  }
  mountain(r, 220 + o0, y - 14, 130, 34, F);
  { const x = 220 + o0, st = mix(A('#d8cfae', 0.35), F, 0.3); r.fillRect(x - 12, y - 46, 25, 8, st); for (let i = -10; i <= 10; i += 5) r.fillRect(x + i, y - 49, 3, 3, st); }
  hazeBand(r, p, y, 20, 0.12, fog);

  const B = y - 13;
  // ── mid: Eixample blocks, the Sagrada Família, Torre Glòries
  houseRow(r, B, o1, -64, 304, M, A('#9a5a36', 0.22), gl, tod, 61, 14, 24);
  {
    const x = 112 + o1, st = A('#d8c49a', 0.06);
    r.fillRect(x - 24, B - 20, 49, 20, st);
    archRow(r, x - 24, B, 49, 20, 3, st, mix(st, '#000000', 0.4));
    const tips = [P.red, P.gold, P.green, P.cyan, P.orange, P.purple];
    const hs: [number, number][] = [[-20, 40], [-13, 50], [-6, 58], [2, 62], [9, 54], [16, 44], [22, 36]];
    hs.forEach(([dx, hh], k) => {
      const sx2 = x + dx;
      for (let j = 0; j < hh; j++) {
        const f = j / hh;
        const hw = Math.max(0, Math.round(3.4 * (1 - f * 0.92)));
        r.fillRect(sx2 - hw, B - 18 - j, hw * 2 + 1, 1, j % 6 === 0 ? mix(st, '#000000', 0.2) : st);
        if (litc && j % 7 === 3) r.fillRect(sx2 - hw, B - 18 - j, hw * 2 + 1, 1, mix(gl, st, 0.45));
      }
      r.fillRect(sx2 - 2, B - 21 - hh, 5, 4, A(tips[k % tips.length], 0.03));
      r.px(sx2, B - 25 - hh, A(P.gold, 0.03));
    });
    r.fillRect(x + 31, B - 50, 2, 50, A('#e0a020', 0.08));
    r.fillRect(x + 24, B - 52, 17, 2, A('#e0a020', 0.08));
    beacon(r, x + 32, B - 54, t, tod, 1.2);
  }
  {
    const x = 194 + o1, h = 48, col = A('#3a6ab0', 0.04);
    for (let j = 0; j <= h; j++) {
      const f = j / h;
      const hw = Math.max(1, Math.round(7 * Math.sin(Math.PI * (0.2 + 0.72 * f))));
      const band = litc ? mix(col, [P.red, P.pink, P.cyan, P.blue][Math.floor((j * 0.4 + t * 2) % 4)], 0.55) : col;
      r.fillRect(x - hw, B - j, hw * 2 + 1, 1, j % 3 === 0 ? band : col);
    }
    beacon(r, x, B - h - 2, t, tod, 2.1);
  }

  // ── near: the Mediterranean, the beach, palms
  water(r, y - 6, 9, A('#1a6a9a', 0.1), litc ? gl : '#9fe8f0', t, px);
  r.fillRect(0, y - 6, 240, 6, tod === 'night' ? mix(N, '#d8c090', 0.22) : A('#e6cf96', 0.03));
  r.fillRect(0, y - 7, 240, 1, tod === 'night' ? mix(N, '#e8d8a8', 0.3) : '#f2e0b0');
  for (let i = -1; i < 6; i++) palm(r, i * 44 + 16 + o2, y - 4, 13 + (i % 3) * 4, A('#1e5a34', 0.06));
  sign(r, 'TAPAS', 4 + o2, y - 75, P.red, 10, tod, t, 1);
  sign(r, 'GAUDÍ', 178 + o2, y - 75, P.gold, 10, tod, t, 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// MOSCOW — St Basil's onion domes, Kremlin towers with red stars, a Stalinist
// Seven Sister, the Ostankino tower, snow.
// ═════════════════════════════════════════════════════════════════════════════
const moscow: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  skyFurniture(r, p, tod, px, y, t, 212, y - 64, 11);

  // ── far: the Ostankino tower + blocks
  skyrow(r, y - 12, o0, F, gl, tod, 71, 9, 15, 12, 24, 0.4);
  {
    const x = 40 + o0;
    for (let j = 0; j < 56; j++) {
      const f = j / 56;
      const hw = Math.max(1, Math.round(5 * Math.pow(1 - f, 1.6) + 1));
      r.fillRect(x - hw, y - 12 - j, hw * 2 + 1, 1, j % 7 === 0 ? mix(F, '#ffffff', 0.14) : F);
    }
    r.fillRect(x - 5, y - 48, 11, 5, F);
    r.fillRect(x - 1, y - 74, 3, 6, F); r.fillRect(x, y - 80, 1, 6, F);
    beacon(r, x, y - 81, t, tod, 0.7); beacon(r, x, y - 49, t, tod, 2.4);
  }
  hazeBand(r, p, y, 18, 0.1, fog);

  const B = y - 9;
  // ── mid: the Kremlin wall, St Basil's, a Seven Sister
  skyrow(r, B, o1, M, gl, tod, 73, 10, 16, 14, 26, 0.45);
  {
    const wx = -34 + o1, st = A('#9a3a32', 0.08);
    r.fillRect(wx, B - 14, 132, 14, st);
    for (let x = wx; x < wx + 132; x += 6) { r.fillRect(x, B - 17, 4, 3, st); r.px(x + 1, B - 18, st); r.px(x + 3, B - 18, st); }
    for (const tx of [16, 66, 118]) {
      const x = wx + tx;
      r.fillRect(x - 7, B - 32, 15, 32, st);
      r.fillRect(x - 8, B - 35, 17, 3, mix(st, '#ffffff', 0.14));
      if (litc) r.fillRect(x - 2, B - 28, 4, 4, gl);
      spire(r, x, B - 35, 15, 17, A('#5a6a58', 0.08));
      r.fillRect(x - 1, B - 54, 3, 3, litc ? P.red : A(P.red, 0.03));
      if (litc) r.disc(x, B - 53, 3, P.red, 0.3);
    }
  }
  {
    // St Basil's Cathedral
    const x = 152 + o1, body = A('#c8b48a', 0.06);
    r.fillRect(x - 22, B - 19, 45, 19, body);
    const dm: [number, number, number, string, string][] = [
      [-18, 24, 5, '#2a7ab0', '#9fd8f0'], [-10, 30, 6, '#20a058', '#8ae0a8'], [0, 40, 8, '#d04a30', '#ffb070'],
      [10, 30, 6, '#8040b0', '#d0a0f0'], [18, 24, 5, '#e0a020', '#ffe080'],
    ];
    for (const [dx, hh, rx, c1, c2] of dm) {
      const cxx = x + dx;
      r.fillRect(cxx - rx + 1, B - hh, rx * 2 - 1, hh - 17, body);
      onion(r, cxx, B - hh, rx, Math.round(rx * 1.7), A(c1, 0.03), A(c2, 0.03));
    }
    if (litc) for (let i = -18; i <= 18; i += 6) r.fillRect(x + i, B - 15, 2, 4, gl);
    r.fillRect(x - 24, B - 21, 49, 2, mix(body, '#ffffff', 0.2));
  }
  {
    const x = 220 + o1, st = A('#8a8a94', 0.06);
    block(r, x - 16, B, 33, 28, st, gl, tod, 77, 0.55);
    block(r, x - 11, B - 28, 23, 18, st, gl, tod, 78, 0.55);
    block(r, x - 6, B - 46, 13, 12, st, gl, tod, 79, 0.55);
    spire(r, x, B - 58, 11, 10, st);
    r.fillRect(x, B - 74, 1, 6, st);
    r.fillRect(x - 1, B - 76, 3, 3, litc ? P.red : A(P.red, 0.03));
    if (litc) r.disc(x, B - 75, 3, P.red, 0.3);
  }

  // ── near: the frozen bank, snowy firs, snowfall
  r.fillRect(0, y - 9, 240, 9, tod === 'night' ? '#9aa4bc' : A('#e8eef8', 0.03));
  r.fillRect(0, y - 10, 240, 1, tod === 'night' ? '#b4bed4' : '#f6faff');
  for (let i = -1; i < 7; i++) {
    const x = i * 38 + 14 + o2, h = 16 + (i % 3) * 5;
    spire(r, x, y - 7, 13, h, A('#1a4a34', 0.06));
    r.fillRect(x - 5, y - 7 - Math.round(h * 0.45), 11, 1, tod === 'night' ? '#c8d2e4' : '#f4f8ff');
    r.fillRect(x - 3, y - 7 - Math.round(h * 0.72), 7, 1, tod === 'night' ? '#c8d2e4' : '#f4f8ff');
  }
  snowfall(r, y, t, 54, tod === 'night' ? '#dfe6f4' : '#ffffff');
  sign(r, 'КРЕМЛЬ', 4 + o2, y - 75, P.red, 10, tod, t, 1);
  sign(r, 'МОСКВА', 160 + o2, y - 75, P.cyan, 10, tod, t, 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// REYKJAVÍK — Hallgrímskirkja, Harpa, corrugated houses, Esja, aurora curtains.
// ═════════════════════════════════════════════════════════════════════════════
const reykjavik: SkylineFn = (r, p, tod, px, y, t, fog) => {
  const F = far(p, fog), M = mid(p, fog), N = near(p, fog);
  const o0 = Math.round(px * 0.3), o1 = Math.round(px * 0.6), o2 = Math.round(px);
  const litc = isDark(tod), gl = p.glow;
  const A = (c: string, d = 0): string => ac(c, tod, p, fog, d);
  stars(r, tod, y, t);
  aurora(r, y, t, tod);
  skyFurniture(r, p, tod, px, y, t, 206, y - 58, 11);

  // ── far: Esja, flat-topped and snow-streaked
  const snow = isNight(tod) ? '#b4c0d4' : tod === 'dusk' ? '#ffd8d0' : '#f4f4f0';
  {
    const cx = 46 + o0, base = y - 14, h = 32, rock = mix(F, '#0b0b12', 0.2), sn = mix(snow, p.haze, 0.2 + fog * 0.3);
    for (let j = 0; j <= h; j++) {
      const w = 40 + Math.round((j / h) * 82);
      const jag = j === 0 ? 0 : 0;
      r.fillRect(cx - w + jag, base - h + j, w * 2, 1, j < 7 ? sn : rock);
    }
    for (let k = 0; k < 12; k++) { const dx = -38 + k * 7; r.fillRect(cx + dx, base - h - 1 - Math.round(h01(k, 4) * 3), 5, 4, sn); }
    for (let k = 0; k < 5; k++) { const dx = -30 + k * 15; r.fillRect(cx + dx, base - h + 7, 2, 8 + (k % 3) * 4, mix(rock, '#000000', 0.25)); }
    for (let k = 0; k < 6; k++) r.fillRect(cx - 34 + k * 13, base - h + 6, 4, 3 + (k % 2) * 3, mix(sn, rock, 0.45));
    mountain(r, cx - 96 + o0 * 0, base, 90, 22, rock, sn, 0.2);
  }
  mountain(r, 198 + o0, y - 14, 120, 38, F, mix(snow, p.haze, 0.3), 0.3);
  mountain(r, 268 + o0, y - 14, 100, 28, F, mix(snow, p.haze, 0.3), 0.28);
  hazeBand(r, p, y, 18, 0.12, fog);

  // ── the North Atlantic
  water(r, y - 4, 12, A('#12384a', 0.2), litc ? mix(gl, P.cyan, 0.4) : '#b0dce8', t, px);
  const B = y - 15;

  // ── mid: Hallgrímskirkja, Harpa, corrugated houses
  {
    const x = 138 + o1, st = A('#e2ded2', 0.06);
    const steps: [number, number][] = [[20, 10], [15, 18], [11, 26], [7, 34]];
    for (const [dx, hh] of steps) { r.fillRect(x - dx - 4, B - hh, 5, hh, st); r.fillRect(x + dx, B - hh, 5, hh, st); }
    r.fillRect(x - 7, B - 54, 15, 54, st);
    r.fillRect(x - 8, B - 56, 17, 2, mix(st, '#ffffff', 0.22));
    for (let j = 0; j < 48; j++) if (j % 5 === 0) r.fillRect(x - 7, B - 8 - j, 15, 1, mix(st, '#000000', 0.14));
    if (litc) { r.fillRect(x - 2, B - 48, 4, 5, gl); r.fillRect(x - 2, B - 10, 4, 6, gl); }
    r.fillRect(x - 4, B - 59, 9, 3, st);
    spire(r, x, B - 59, 9, 11, A('#8a9098', 0.06));
    r.px(x, B - 72, A(P.gold, 0.03));
    beacon(r, x, B - 71, t, tod, 1.9);
  }
  {
    const x = 52 + o1, gls = A('#2a5a72', 0.06);
    r.fillRect(x - 20, B - 20, 41, 20, gls);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 10; i++) {
      const on = litc && h01(i * 5 + j, Math.floor(t * 1.2)) < 0.4;
      r.fillRect(x - 19 + i * 4, B - 19 + j * 4, 3, 3, on ? mix(gl, P.cyan, 0.45) : mix(gls, '#ffffff', 0.14));
    }
    r.fillRect(x - 21, B - 22, 43, 2, mix(gls, '#ffffff', 0.22));
  }
  {
    const rooves = [P.red, '#2a6ab0', P.gold, '#20a058', '#d04a30', '#8040b0'];
    let x = -64 + o1, i = 0;
    while (x < 304 + o1) {
      const w = 10 + Math.round(h01(i, 81) * 9), h = 8 + Math.round(h01(i + 5, 81) * 15);
      const wall = [A('#e8e4d8', 0.08), A('#c8ccd0', 0.08), A('#9aa4ac', 0.08), A('#d8cfc0', 0.08)][i % 4];
      r.fillRect(x, B - h, w, h, wall);
      for (let k = 0; k < w; k += 2) r.fillRect(x + k, B - h, 1, h, mix(wall, '#000000', 0.14));
      const rc = A(rooves[(i * 5) % rooves.length], 0.03);
      const rh = 3 + Math.round(h01(i + 2, 81) * 3);
      for (let j = 0; j < rh; j++) { const ins = Math.round(((rh - 1 - j) * (w / 2 - 1)) / rh); r.fillRect(x + ins, B - h - rh + j, Math.max(1, w - ins * 2), 1, rc); }
      r.fillRect(x - 1, B - h, w + 2, 1, mix(rc, '#000000', 0.3));
      if (litc) { r.fillRect(x + 2, B - h + 3, 3, 3, gl); if (h > 14) r.fillRect(x + w - 5, B - h + 9, 3, 3, gl); }
      x += w + 1; i++;
    }
  }

  // ── near: the harbour
  r.fillRect(0, y - 4, 240, 4, N);
  r.fillRect(0, y - 5, 240, 1, mix(N, '#ffffff', 0.2));
  for (let i = 0; i < 3; i++) {
    const bx = Math.round(((t * 5 + i * 90) % 320) - 40) + o2;
    boat(r, bx, y - 5, A(i % 2 ? '#d04a30' : '#e8e6de', 0), A('#2a5a72', 0), litc, gl, false);
  }
  for (let x0 = -10; x0 < 250; x0 += 30) {
    const x = x0 + o2;
    r.fillRect(x, y - 7, 2, 3, mix(N, '#000000', 0.35));
    r.fillRect(x - 1, y - 8, 4, 1, mix(N, '#ffffff', 0.2));
  }
  snowfall(r, y, t, 24, isNight(tod) ? '#cfd8e8' : '#ffffff');
  sign(r, 'AURORA', 4 + o2, y - 75, P.cyan, 10, tod, t, 1);
  sign(r, 'ÍSLAND', 168 + o2, y - 75, P.gold, 10, tod, t, 2);
};

export const SKYLINES_EUROPE: Record<string, SkylineFn> = {
  duesseldorf, berlin, munich, istanbul, paris, london, rome, amsterdam, barcelona, moscow, reykjavik,
};
