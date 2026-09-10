import type { CityDef, CityPalette } from '../../core/types';
import type { SkylineFn } from './types';

// STUB — replaced by the Asia catalog: tokyo, osaka, kyoto, nagoya, fukuoka, seoul, shanghai, hongkong, bangkok, mumbai.
const TOKYO_DAY: CityPalette = {
  skyTop: '#2040e0', skyBottom: '#60a0ff', farSky: '#4060c0', nearSky: '#23232f', glow: '#ffe870',
  ground: '#20b040', groundAlt: '#1a9a36', road: '#3a3a48', roadAlt: '#36364a', stripe: '#f4f4f0', curb: '#e0202a', curbAlt: '#f4f4f0', haze: '#60a0ff', sun: '#ffe870',
};

export const CITIES_ASIA: CityDef[] = [
  { id: 'tokyo', name: { de: 'Tokio', en: 'Tokyo' }, country: { de: 'Japan', en: 'Japan' }, countryCode: 'JP', glyph: '東京', palettes: { day: TOKYO_DAY }, props: ['tree', 'lamp'], traffic: [], music: 'jdm' },
];

export const SKYLINES_ASIA: Record<string, SkylineFn> = {
  tokyo: (r, pal, _tod, px, y) => {
    for (let i = -1; i < 6; i++) { const cx = i * 70 + Math.round(px * 0.3) % 70; for (let j = 0; j < 30; j++) r.fillRect(cx - 30 + j, y - 30 + j, 60 - j * 2, 1, pal.farSky); }
    for (let i = -1; i < 14; i++) {
      const bx = i * 20 + Math.round(px * 0.6) % 20; const h = 14 + ((i * 7) % 5) * 6;
      r.fillRect(bx, y - h, 16, h, pal.nearSky);
      for (let wy = y - h + 3; wy < y - 2; wy += 4) for (let wx = bx + 2; wx < bx + 14; wx += 4) if ((wx + wy) % 3) r.fillRect(wx, wy, 2, 2, pal.glow);
    }
  },
};
