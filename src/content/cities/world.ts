import type { CityDef, CityPalette, TimeOfDay } from '../../core/types';
import type { SkylineFn } from './types';
import { mix } from '../../core/Palette';
import { block, towers, mountain, water, dome, spire, bridge, neon, palm, far, mid, near, skyFurniture, isDark, isNight, h01 } from './lib';

// Americas · Middle East · Africa · Oceania

type PalSet = Record<TimeOfDay, CityPalette>;
/** Build a 4-time palette set from a compact spec. */
function pal(spec: { day: [string, string]; dawn: [string, string]; dusk: [string, string]; night: [string, string]; far: string; near: string; glow?: string; ground: string; groundAlt: string; road?: string; stripe?: string; curb?: string; curbAlt?: string; haze?: string; sun?: string; moon?: string }): PalSet {
  const mk = (sky: [string, string], tod: TimeOfDay): CityPalette => ({
    skyTop: sky[0], skyBottom: sky[1],
    farSky: tod === 'night' ? mix(spec.far, '#0b0b12', 0.45) : tod === 'day' ? spec.far : mix(spec.far, sky[1], 0.3),
    nearSky: tod === 'night' ? mix(spec.near, '#0b0b12', 0.3) : spec.near,
    glow: spec.glow ?? '#ffe870',
    ground: tod === 'night' ? mix(spec.ground, '#0b0b12', 0.45) : spec.ground,
    groundAlt: tod === 'night' ? mix(spec.groundAlt, '#0b0b12', 0.45) : spec.groundAlt,
    road: tod === 'night' ? '#2a2a36' : (spec.road ?? '#3a3a48'), roadAlt: tod === 'night' ? '#26262f' : mix(spec.road ?? '#3a3a48', '#000000', 0.08),
    stripe: spec.stripe ?? '#f4f4f0', curb: spec.curb ?? '#e0202a', curbAlt: spec.curbAlt ?? '#f4f4f0',
    haze: spec.haze ?? sky[1], sun: tod === 'night' ? undefined : (spec.sun ?? '#ffe870'), moon: spec.moon ?? '#f4f4f0',
  });
  return { day: mk(spec.day, 'day'), dawn: mk(spec.dawn, 'dawn'), dusk: mk(spec.dusk, 'dusk'), night: mk(spec.night, 'night') };
}

const NY = pal({ day: ['#2040e0', '#60a0ff'], dawn: ['#48187a', '#f07020'], dusk: ['#101c80', '#e04080'], night: ['#0b0b12', '#101c80'], far: '#4060c0', near: '#23232f', ground: '#3a3a48', groundAlt: '#36364a', stripe: '#f0c020', haze: '#8090c0' });
const LA = pal({ day: ['#2040e0', '#40e0f0'], dawn: ['#8030c0', '#ff90c0'], dusk: ['#48187a', '#f07020'], night: ['#0b0b12', '#48187a'], far: '#8a1018', near: '#3a2a48', glow: '#ffb7d0', ground: '#d0a060', groundAlt: '#c09050', stripe: '#f0c020', haze: '#f07020', sun: '#ffd040' });
const LV = pal({ day: ['#2040e0', '#60a0ff'], dawn: ['#e04080', '#ffd040'], dusk: ['#48187a', '#e0202a'], night: ['#0b0b12', '#101c80'], far: '#7a4a20', near: '#23232f', glow: '#ff90c0', ground: '#d0a060', groundAlt: '#b8905a', stripe: '#f0c020', haze: '#8030c0' });
const MX = pal({ day: ['#2040e0', '#60a0ff'], dawn: ['#8030c0', '#f0c020'], dusk: ['#48187a', '#f07020'], night: ['#0b0b12', '#48187a'], far: '#6a4a78', near: '#3a3a48', glow: '#ffe870', ground: '#7a9a30', groundAlt: '#6a8a28', stripe: '#f0c020', haze: '#c0a0a0' });
const RIO = pal({ day: ['#2040e0', '#40e0f0'], dawn: ['#8030c0', '#ffb7d0'], dusk: ['#48187a', '#f07020'], night: ['#0b0b12', '#101c80'], far: '#0e6a2a', near: '#2a3a30', glow: '#ffe870', ground: '#20b040', groundAlt: '#1a9a36', stripe: '#f4f4f0', haze: '#60c0e0' });
const DXB = pal({ day: ['#2040e0', '#ffe870'], dawn: ['#e04080', '#ffd040'], dusk: ['#8030c0', '#f07020'], night: ['#0b0b12', '#23232f'], far: '#d0a060', near: '#3a3a48', glow: '#ffe870', ground: '#e0c080', groundAlt: '#d0b070', stripe: '#f4f4f0', haze: '#f0d090', sun: '#ffe870' });
const CAI = pal({ day: ['#2040e0', '#f0c020'], dawn: ['#e04080', '#ffd040'], dusk: ['#8a1018', '#f07020'], night: ['#0b0b12', '#23232f'], far: '#c09050', near: '#7a4a20', glow: '#ffe870', ground: '#d0a060', groundAlt: '#c09050', stripe: '#f4f4f0', curb: '#f07020', haze: '#e0b070', sun: '#ffd040' });
const CPT = pal({ day: ['#2040e0', '#40e0f0'], dawn: ['#8030c0', '#ffb7d0'], dusk: ['#101c80', '#f07020'], night: ['#0b0b12', '#101c80'], far: '#3a3a48', near: '#23232f', glow: '#ffe870', ground: '#7a9a30', groundAlt: '#6a8a28', stripe: '#f0c020', haze: '#a0c0e0' });
const SYD = pal({ day: ['#2040e0', '#40e0f0'], dawn: ['#e04080', '#ffd040'], dusk: ['#48187a', '#f07020'], night: ['#0b0b12', '#101c80'], far: '#4060c0', near: '#23232f', glow: '#ffe870', ground: '#20b040', groundAlt: '#1a9a36', stripe: '#f4f4f0', haze: '#80c0e0' });

export const CITIES_WORLD: CityDef[] = [
  { id: 'newyork', name: { de: 'New York', en: 'New York' }, country: { de: 'USA', en: 'USA' }, countryCode: 'US', glyph: 'NYC', palettes: NY, props: ['lamp', 'hydrant', 'sign_city', 'billboard', 'food_cart', 'tree', 'flag_pole'], traffic: ['taxi_yellow', 'police_us', 'bus_city', 'limo_stretch'], music: 'hiphop', slogans: ['BIG', 'APPLE'], captions: ['NEVER\nSLEEPS', 'YELLOW\nCABS\nFOREVER'], billboards: ['NYC', 'BROADWAY', 'TAXI', 'PIZZA'], signs: ['BROOKLYN', 'QUEENS', 'JFK'] },
  { id: 'losangeles', name: { de: 'Los Angeles', en: 'Los Angeles' }, country: { de: 'USA', en: 'USA' }, countryCode: 'US', glyph: 'L.A.', palettes: LA, props: ['palm', 'palm', 'lamp', 'billboard', 'surfboard', 'lifeguard', 'cactus'], traffic: ['lowrider_traffic', 'police_us', 'suv_gray', 'pickup_red'], music: 'surf', slogans: ['WEST', 'COAST'], captions: ['SUNSET\nCRUISE', 'LOW\nAND\nSLOW'], billboards: ['HOLLYWOOD', 'L.A.', 'SURF', 'TACOS'], signs: ['SANTA MONICA', 'MALIBU', 'PCH'] },
  { id: 'lasvegas', name: { de: 'Las Vegas', en: 'Las Vegas' }, country: { de: 'USA', en: 'USA' }, countryCode: 'US', glyph: 'VEGAS', palettes: LV, props: ['lamp_neon', 'neon_arrow', 'billboard', 'palm', 'cactus_tall', 'neon_kanji'], traffic: ['limo_stretch', 'taxi_yellow', 'police_us', 'supercar_gold'], music: 'italo', slogans: ['ALL', 'IN'], captions: ['VIVA\nLAS\nVEGAS', 'NEON\nNEVER\nDIES'], billboards: ['CASINO', 'VEGAS', 'JACKPOT', '$$$'], signs: ['THE STRIP', 'DOWNTOWN', 'RENO'] },
  { id: 'mexicocity', name: { de: 'Mexiko-Stadt', en: 'Mexico City' }, country: { de: 'Mexiko', en: 'Mexico' }, countryCode: 'MX', glyph: 'CDMX', palettes: MX, props: ['cactus', 'cactus_tall', 'taco_stand', 'lamp', 'flag_pole', 'billboard', 'tree'], traffic: ['vocho', 'microbus', 'pickup_red', 'bus_city'], music: 'latin', slogans: ['VIVA', 'MÉXICO'], captions: ['DÍA DE\nMUERTOS', 'VOCHOS\nY\nTACOS'], billboards: ['CDMX', 'TACOS', 'LUCHA', 'FIESTA'], signs: ['PUEBLA', 'TOLUCA', 'CUERNAVACA'] },
  { id: 'rio', name: { de: 'Rio de Janeiro', en: 'Rio de Janeiro' }, country: { de: 'Brasilien', en: 'Brazil' }, countryCode: 'BR', glyph: 'RIO', palettes: RIO, props: ['palm', 'beach_umbrella', 'lifeguard', 'lamp', 'bush', 'kiosk', 'surfboard'], traffic: ['bus_rio', 'taxi_yellow', 'van_white', 'hatch_green'], music: 'latin', slogans: ['VAI', 'RIO'], captions: ['SAMBA\nSPEED', 'SUN\nSEA\nSPEED'], billboards: ['RIO', 'CARNAVAL', 'SAMBA', 'AÇAÍ'], signs: ['COPACABANA', 'IPANEMA', 'NITERÓI'] },
  { id: 'dubai', name: { de: 'Dubai', en: 'Dubai' }, country: { de: 'VAE', en: 'UAE' }, countryCode: 'AE', glyph: 'دبي', palettes: DXB, props: ['palm', 'lamp_neon', 'billboard', 'camel_sign', 'flag_pole', 'fountain', 'rock'], traffic: ['supercar_gold', 'suv_gray', 'limo_stretch', 'taxi_yellow'], music: 'arabic', slogans: ['GOLD', 'RUSH'], captions: ['DESERT\nTO\nSKY', 'SUPER\nCARS\nONLY'], billboards: ['دبي', 'DUBAI', 'GOLD', 'LUXURY'], signs: ['ABU DHABI', 'SHARJAH', 'MARINA'] },
  { id: 'cairo', name: { de: 'Kairo', en: 'Cairo' }, country: { de: 'Ägypten', en: 'Egypt' }, countryCode: 'EG', glyph: 'القاهرة', palettes: CAI, props: ['palm', 'camel_sign', 'pyramid_small', 'obelisk_small', 'lantern', 'rock', 'kiosk'], traffic: ['microbus', 'taxi_yellow', 'pickup_red', 'truck_semi'], music: 'arabic', slogans: ['SAND', 'STORM'], captions: ['4000\nYEARS\nOF ROAD', 'HONK\nTWICE'], billboards: ['القاهرة', 'CAIRO', 'NILE', 'GIZA'], signs: ['GIZA', 'ALEXANDRIA', 'LUXOR'] },
  { id: 'capetown', name: { de: 'Kapstadt', en: 'Cape Town' }, country: { de: 'Südafrika', en: 'South Africa' }, countryCode: 'ZA', glyph: 'CPT', palettes: CPT, props: ['baobab', 'palm', 'rock', 'lamp', 'bush', 'sign_city', 'surfboard'], traffic: ['minibus_taxi', 'pickup_red', 'suv_gray', 'bus_city'], music: 'afro', slogans: ['CAPE', 'WIND'], captions: ['TABLE\nMOUNTAIN', 'TWO\nOCEANS'], billboards: ['CAPE TOWN', 'BRAAI', 'SAFARI'], signs: ['HOUT BAY', 'STELLENBOSCH', 'CAPE POINT'] },
  { id: 'sydney', name: { de: 'Sydney', en: 'Sydney' }, country: { de: 'Australien', en: 'Australia' }, countryCode: 'AU', glyph: 'SYD', palettes: SYD, props: ['palm', 'tree', 'surfboard', 'lifeguard', 'lamp', 'beach_umbrella', 'bush'], traffic: ['ute', 'taxi_yellow', 'suv_gray', 'bus_city'], music: 'surf', slogans: ['DOWN', 'UNDER'], captions: ['HARBOUR\nRUN', 'NO\nWORRIES'], billboards: ['SYDNEY', 'BONDI', 'SURF', 'G\'DAY'], signs: ['BONDI', 'MANLY', 'PARRAMATTA'] },
];

const NYC: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  skyFurniture(r, pal, tod, px, y, t, 60, y - 110, 12);
  const F = far(pal, fog), M = mid(pal, fog), N = near(pal, fog);
  towers(r, y - 6, px * 0.3, F, pal.glow, tod, 1, 16, 24, 60, -40, 280, 8, 18);
  // Statue of Liberty (left, far)
  const lx = 24 + Math.round(px * 0.3);
  r.fillRect(lx - 6, y - 14, 12, 8, F); r.fillRect(lx - 2, y - 30, 4, 16, mix(F, '#20b040', 0.3)); r.fillRect(lx - 4, y - 33, 8, 4, mix(F, '#20b040', 0.3));
  for (let i = -3; i <= 3; i++) r.fillRect(lx + i * 2, y - 36 - (i % 2 ? 0 : 2), 1, 3, mix(F, '#20b040', 0.3));
  r.fillRect(lx + 3, y - 40, 2, 10, mix(F, '#20b040', 0.3)); r.fillRect(lx + 2, y - 42, 4, 2, pal.glow);
  // Brooklyn bridge over water
  water(r, y, 6, mix(pal.skyBottom, '#101c80', 0.5), pal.glow, t, px);
  bridge(r, 120 + Math.round(px * 0.5), 300, y - 6, 22, mix(M, '#000000', 0.2), M);
  // mid: Empire State + Chrysler + One WTC
  const ex = 92 + Math.round(px * 0.6);
  block(r, ex - 12, y - 4, 24, 46, M, pal.glow, tod, 4, 0.8); block(r, ex - 8, y - 4, 16, 62, M, pal.glow, tod, 5, 0.8); block(r, ex - 4, y - 4, 8, 76, M, pal.glow, tod, 6, 0.8); spire(r, ex, y - 80, 4, 14, M);
  if (isNight(tod) && Math.floor(t * 2) % 2 === 0) r.px(ex, y - 94, '#e0202a');
  const cx = 150 + Math.round(px * 0.6);
  block(r, cx - 8, y - 4, 16, 54, M, pal.glow, tod, 7, 0.7);
  for (let i = 0; i < 5; i++) { r.fillRect(cx - 6 + i, y - 58 - i * 3, 12 - i * 2, 3, mix(M, '#d8d8e0', 0.5)); }
  spire(r, cx, y - 73, 3, 12, mix(M, '#d8d8e0', 0.5));
  const wx = 196 + Math.round(px * 0.6);
  for (let j = 0; j < 84; j++) { const hw = Math.round(9 - (j / 84) * 4); r.fillRect(wx - hw, y - 4 - j, hw * 2, 1, j % 4 === 0 && isDark(tod) ? mix(M, pal.glow, 0.25) : M); }
  spire(r, wx, y - 88, 2, 20, M);
  // near towers
  towers(r, y, px, N, pal.glow, tod, 9, 12, 14, 40, -40, 280, 10, 20);
  neon(r, 'NYC', 8 + Math.round(px), y - 22, '#ffe870', 8);
};

const LAX: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  skyFurniture(r, pal, tod, px, y, t, 170, y - 60, 16);
  const F = far(pal, fog), M = mid(pal, fog), N = near(pal, fog);
  // hills with the HOLLYWOOD sign
  for (let i = -1; i < 5; i++) mountain(r, i * 70 + 20 + Math.round(px * 0.3), y - 20, 110, 34 + (i % 2) * 8, F);
  neon(r, 'HOLLYWOOD', 62 + Math.round(px * 0.3), y - 48, '#f4f4f0', 8, false, '#00000000', 1);
  // downtown cluster (US Bank tower round top)
  towers(r, y - 10, px * 0.6, M, pal.glow, tod, 3, 9, 20, 44, 60, 190, 10, 16);
  const ux = 122 + Math.round(px * 0.6);
  block(r, ux - 7, y - 10, 14, 58, M, pal.glow, tod, 8, 0.7); dome(r, ux, y - 68, 7, 4, M);
  if (isDark(tod)) r.fillRect(ux - 7, y - 60, 14, 1, pal.glow);
  // palms + beach vibe near
  for (let i = -1; i < 8; i++) palm(r, i * 34 + 6 + Math.round(px), y - 2, 20 + (i % 3) * 5, N);
  water(r, y, 4, mix(pal.skyBottom, '#2040e0', 0.4), '#f4f4f0', t, px);
};

const VEGAS: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  skyFurniture(r, pal, tod, px, y, t, 40, y - 100, 10);
  const F = far(pal, fog), M = mid(pal, fog), N = near(pal, fog);
  for (let i = -1; i < 5; i++) mountain(r, i * 80 + 30 + Math.round(px * 0.2), y - 24, 120, 30, F);
  // Stratosphere
  const sx = 40 + Math.round(px * 0.5);
  r.fillRect(sx - 2, y - 96, 4, 72, M); dome(r, sx, y - 90, 9, 6, M); r.fillRect(sx - 9, y - 90, 18, 6, M); r.fillRect(sx - 1, y - 110, 2, 14, M);
  if (isNight(tod)) { r.fillRect(sx - 8, y - 88, 16, 1, '#ff90c0'); if (Math.floor(t * 3) % 2 === 0) r.px(sx, y - 111, '#e0202a'); }
  // Luxor pyramid + sphinx
  const lx = 190 + Math.round(px * 0.6);
  mountain(r, lx, y - 8, 64, 40, mix(M, '#23232f', 0.3));
  if (isNight(tod)) r.fillRect(lx, y - 110, 1, 62, '#f4f4f0');
  r.fillRect(lx - 48, y - 12, 18, 6, mix(M, '#d0a060', 0.4)); r.fillRect(lx - 36, y - 20, 8, 8, mix(M, '#d0a060', 0.4));
  // casino towers with neon strips
  const cols = ['#ff90c0', '#40e0f0', '#ffe870', '#20b040', '#e0202a'];
  for (let i = 0; i < 6; i++) {
    const bx = 70 + i * 22 + Math.round(px * 0.6), h = 36 + Math.round(h01(i, 2) * 30);
    block(r, bx, y - 8, 16, h, M, pal.glow, tod, 20 + i, 0.8);
    if (isDark(tod)) { const c = cols[i % cols.length]; r.fillRect(bx, y - 8 - h, 16, 2, c); r.fillRect(bx + 7, y - 8 - h, 2, h, Math.floor(t * 4 + i) % 2 ? c : mix(c, '#000000', 0.5)); }
  }
  // near: neon signs
  towers(r, y, px, N, pal.glow, tod, 12, 10, 12, 30, -40, 280, 12, 22);
  neon(r, 'CASINO', 100 + Math.round(px), y - 26, Math.floor(t * 2) % 2 ? '#ff90c0' : '#ffe870', 10);
  neon(r, 'VEGAS', 14 + Math.round(px), y - 20, '#40e0f0', 9);
};

const CDMX: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  skyFurniture(r, pal, tod, px, y, t, 200, y - 90, 12);
  const F = far(pal, fog), M = mid(pal, fog), N = near(pal, fog);
  // volcanoes (Popocatépetl with snow) far
  mountain(r, 60 + Math.round(px * 0.2), y - 30, 150, 60, F, mix(F, '#ffffff', 0.7), 0.25);
  mountain(r, 190 + Math.round(px * 0.2), y - 30, 130, 48, F, mix(F, '#ffffff', 0.7), 0.2);
  if (isDark(tod)) r.fillRect(58 + Math.round(px * 0.2), y - 92, 3, 3, '#f07020');
  // Torre Latinoamericana + cathedral + Angel column
  towers(r, y - 6, px * 0.6, M, pal.glow, tod, 5, 12, 16, 34, -40, 280, 10, 18);
  const tx = 60 + Math.round(px * 0.6);
  block(r, tx - 7, y - 6, 14, 64, M, pal.glow, tod, 31, 0.8); r.fillRect(tx - 1, y - 84, 2, 14, M);
  const cx = 130 + Math.round(px * 0.6);
  r.fillRect(cx - 24, y - 30, 48, 24, M); r.fillRect(cx - 24, y - 46, 8, 16, M); r.fillRect(cx + 16, y - 46, 8, 16, M); dome(r, cx, y - 30, 10, 8, mix(M, '#d0a060', 0.3)); spire(r, cx - 20, y - 46, 6, 8, M); spire(r, cx + 20, y - 46, 6, 8, M);
  const ax = 196 + Math.round(px * 0.6);
  r.fillRect(ax - 2, y - 56, 4, 50, mix(M, '#d0a060', 0.3)); r.fillRect(ax - 3, y - 62, 6, 6, '#ffd040'); r.fillRect(ax - 6, y - 60, 12, 2, '#ffd040');
  // near: colourful low houses
  for (let i = -1; i < 12; i++) { const bx = i * 24 + Math.round(px); const c = ['#e04080', '#f0c020', '#40e0f0', '#f07020', '#20b040'][((i % 5) + 5) % 5]; r.fillRect(bx, y - 14, 20, 14, isNight(tod) ? mix(c, '#0b0b12', 0.6) : mix(c, N, 0.35)); r.fillRect(bx + 4, y - 10, 4, 4, isDark(tod) ? pal.glow : mix(c, '#000000', 0.4)); }
};

const RJ: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  skyFurniture(r, pal, tod, px, y, t, 180, y - 80, 14);
  const F = far(pal, fog), M = mid(pal, fog), N = near(pal, fog);
  // Corcovado with Christ + Sugarloaf
  mountain(r, 70 + Math.round(px * 0.3), y - 14, 90, 70, F);
  const cx = 70 + Math.round(px * 0.3);
  r.fillRect(cx - 1, y - 96, 2, 12, '#f4f4f0'); r.fillRect(cx - 6, y - 93, 12, 2, '#f4f4f0'); r.fillRect(cx - 2, y - 98, 4, 2, '#f4f4f0');
  dome(r, 190 + Math.round(px * 0.3), y - 12, 26, 44, F); dome(r, 230 + Math.round(px * 0.3), y - 12, 22, 30, F);
  // favela hills (dense small boxes)
  for (let i = 0; i < 40; i++) { const bx = 110 + ((i * 13) % 90) + Math.round(px * 0.5), by = y - 16 - ((i * 7) % 30); r.fillRect(bx, by, 5, 5, mix(M, ['#f07020', '#e04080', '#f0c020'][i % 3], isNight(tod) ? 0.15 : 0.35)); if (isDark(tod) && i % 3 === 0) r.px(bx + 2, by + 2, pal.glow); }
  // beachfront towers + water
  towers(r, y - 6, px * 0.7, M, pal.glow, tod, 17, 10, 18, 40, -40, 120, 10, 16);
  water(r, y, 6, mix(pal.skyBottom, '#2040e0', 0.5), '#f4f4f0', t, px);
  for (let i = -1; i < 9; i++) palm(r, i * 30 + 10 + Math.round(px), y - 5, 16 + (i % 2) * 6, N);
};

const DUBAI: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  skyFurniture(r, pal, tod, px, y, t, 200, y - 70, 14);
  const F = far(pal, fog), M = mid(pal, fog), N = near(pal, fog);
  // dunes
  for (let i = -1; i < 5; i++) dome(r, i * 70 + 20 + Math.round(px * 0.2), y - 10, 50, 14, F);
  // Burj Khalifa
  const bx = 120 + Math.round(px * 0.5);
  for (let j = 0; j < 118; j++) { const hw = Math.max(1, Math.round(8 - (j / 118) * 7)); r.fillRect(bx - hw, y - 6 - j, hw * 2, 1, j % 9 === 0 ? mix(M, '#d8d8e0', 0.4) : M); }
  r.fillRect(bx, y - 136, 1, 12, M);
  if (isNight(tod)) { for (let j = 10; j < 118; j += 12) r.fillRect(bx - 2, y - 6 - j, 4, 1, pal.glow); if (Math.floor(t * 2) % 2 === 0) r.px(bx, y - 137, '#e0202a'); }
  // Burj Al Arab (sail)
  const sx = 40 + Math.round(px * 0.5);
  for (let j = 0; j < 60; j++) { const w = Math.round(14 * (1 - j / 60)) + 2; r.fillRect(sx - 2, y - 6 - j, w, 1, mix(M, '#f4f4f0', 0.5)); }
  r.fillRect(sx - 4, y - 10, 2, 4, M);
  // skyline cluster
  towers(r, y - 6, px * 0.6, M, pal.glow, tod, 41, 14, 24, 70, 140, 280, 8, 16);
  towers(r, y - 6, px * 0.6, M, pal.glow, tod, 42, 6, 24, 60, -40, 100, 8, 14);
  water(r, y, 5, mix(pal.skyBottom, '#40e0f0', 0.5), '#f4f4f0', t, px);
  for (let i = -1; i < 8; i++) palm(r, i * 36 + 14 + Math.round(px), y - 4, 14 + (i % 2) * 4, N);
  neon(r, 'دبي', 190 + Math.round(px), y - 24, '#ffd040', 12);
};

const CAIRO: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  skyFurniture(r, pal, tod, px, y, t, 60, y - 60, 16);
  const F = far(pal, fog), M = mid(pal, fog), N = near(pal, fog);
  // three pyramids + sphinx
  mountain(r, 150 + Math.round(px * 0.3), y - 8, 110, 56, mix(F, '#d0a060', 0.5));
  mountain(r, 160 + Math.round(px * 0.3), y - 8, 60, 30, mix(F, '#7a4a20', 0.3));
  mountain(r, 215 + Math.round(px * 0.3), y - 8, 80, 42, mix(F, '#d0a060', 0.4));
  mountain(r, 95 + Math.round(px * 0.3), y - 8, 60, 32, mix(F, '#d0a060', 0.45));
  const sx = 60 + Math.round(px * 0.5);
  r.fillRect(sx - 14, y - 16, 28, 10, mix(M, '#d0a060', 0.5)); r.fillRect(sx + 8, y - 26, 8, 12, mix(M, '#d0a060', 0.5)); r.fillRect(sx + 6, y - 28, 12, 4, mix(M, '#d0a060', 0.5));
  // Cairo Tower (lattice) + minarets + Nile
  const tx = 22 + Math.round(px * 0.6);
  for (let j = 0; j < 70; j++) r.fillRect(tx - 3, y - 6 - j, 6, 1, j % 3 === 0 ? mix(M, '#d0a060', 0.3) : M);
  r.fillRect(tx - 6, y - 78, 12, 3, M);
  for (const mx of [110, 130]) { const x = mx + Math.round(px * 0.6); r.fillRect(x - 1, y - 40, 3, 34, M); r.fillRect(x - 2, y - 28, 5, 1, mix(M, '#d0a060', 0.4)); spire(r, x, y - 40, 5, 6, M); }
  dome(r, 120 + Math.round(px * 0.6), y - 8, 12, 8, M);
  towers(r, y - 4, px * 0.7, M, pal.glow, tod, 51, 10, 12, 30, -40, 280, 10, 16);
  water(r, y, 5, mix(pal.skyBottom, '#2040e0', 0.45), '#ffe870', t, px);
  for (let i = -1; i < 9; i++) palm(r, i * 30 + 4 + Math.round(px), y - 4, 12 + (i % 3) * 4, N);
};

const CPTN: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  skyFurniture(r, pal, tod, px, y, t, 200, y - 100, 12);
  const F = far(pal, fog), M = mid(pal, fog), N = near(pal, fog);
  // Table Mountain: flat top with the "tablecloth" cloud
  const tx = 120 + Math.round(px * 0.25);
  r.fillRect(tx - 70, y - 60, 140, 46, F);
  for (let j = 0; j < 16; j++) { r.fillRect(tx - 70 - j * 2, y - 14 + j, 4, 1, F); r.fillRect(tx + 66 + j * 2, y - 14 + j, 4, 1, F); }
  mountain(r, tx - 100 + Math.round(px * 0.25), y - 14, 60, 34, F); mountain(r, tx + 100 + Math.round(px * 0.25), y - 14, 70, 40, F);
  r.fillRect(tx - 60 + Math.round(t * 2) % 10, y - 64, 110, 4, mix('#f4f4f0', pal.skyBottom, 0.3));
  // waterfront + stadium
  towers(r, y - 6, px * 0.6, M, pal.glow, tod, 61, 10, 14, 34, -40, 280, 10, 16);
  const sx = 60 + Math.round(px * 0.6); dome(r, sx, y - 6, 26, 12, mix(M, '#f4f4f0', 0.4)); r.fillRect(sx - 26, y - 8, 52, 2, M);
  water(r, y, 6, mix(pal.skyBottom, '#2040e0', 0.5), '#f4f4f0', t, px);
  for (let i = -1; i < 7; i++) palm(r, i * 40 + 20 + Math.round(px), y - 5, 14 + (i % 2) * 4, N);
};

const SYDN: SkylineFn = (r, pal, tod, px, y, t, fog) => {
  skyFurniture(r, pal, tod, px, y, t, 50, y - 80, 14);
  const F = far(pal, fog), M = mid(pal, fog), N = near(pal, fog);
  towers(r, y - 10, px * 0.3, F, pal.glow, tod, 71, 14, 20, 60, 120, 280, 8, 16);
  // Sydney Tower
  const stx = 200 + Math.round(px * 0.4); r.fillRect(stx - 1, y - 90, 2, 60, F); dome(r, stx, y - 76, 7, 5, F); r.fillRect(stx - 7, y - 76, 14, 6, F);
  // Harbour Bridge (arch) over water
  water(r, y, 8, mix(pal.skyBottom, '#2040e0', 0.5), '#f4f4f0', t, px);
  bridge(r, -20 + Math.round(px * 0.5), 120 + Math.round(px * 0.5), y - 10, 34, M, mix(M, '#d8d8e0', 0.3), true);
  r.fillRect(-16 + Math.round(px * 0.5), y - 24, 6, 16, M); r.fillRect(110 + Math.round(px * 0.5), y - 24, 6, 16, M);
  // Opera House shells
  const ox = 160 + Math.round(px * 0.7);
  const shell = (cx: number, rx: number, ry: number) => { for (let j = 0; j <= ry; j++) { const hw = Math.round(rx * Math.sqrt(1 - (j / ry) * (j / ry))); r.fillRect(cx - hw, y - 8 - j, hw + 1, 1, '#f4f4f0'); r.fillRect(cx, y - 8 - j, Math.max(1, Math.round(hw * 0.6)), 1, mix('#f4f4f0', N, 0.4)); } };
  r.fillRect(ox - 30, y - 8, 64, 6, mix(M, '#d0a060', 0.3));
  shell(ox - 14, 14, 22); shell(ox, 12, 26); shell(ox + 14, 12, 20); shell(ox + 26, 8, 14);
  for (let i = -1; i < 5; i++) palm(r, i * 50 + 10 + Math.round(px), y - 2, 14 + (i % 2) * 5, N);
};

export const SKYLINES_WORLD: Record<string, SkylineFn> = {
  newyork: NYC, losangeles: LAX, lasvegas: VEGAS, mexicocity: CDMX, rio: RJ, dubai: DUBAI, cairo: CAIRO, capetown: CPTN, sydney: SYDN,
};
