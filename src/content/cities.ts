import type { CityDef, CityId, TimeOfDay } from '../core/types';
import type { Renderer } from '../core/Renderer';
import { CITIES_ASIA, SKYLINES_ASIA } from './cities/asia';
import { CITIES_EUROPE, SKYLINES_EUROPE } from './cities/europe';
import { CITIES_WORLD, SKYLINES_WORLD } from './cities/world';
import type { SkylineFn } from './cities/types';

export const CITIES: CityDef[] = [...CITIES_ASIA, ...CITIES_EUROPE, ...CITIES_WORLD];
const SKYLINES: Record<string, SkylineFn> = { ...SKYLINES_ASIA, ...SKYLINES_EUROPE, ...SKYLINES_WORLD };

export function getCity(id: CityId): CityDef {
  return CITIES.find((c) => c.id === id) ?? CITIES[0];
}

/** Draw the city skyline with its bottom edge at horizon y. */
export function drawSkyline(r: Renderer, city: CityDef, tod: TimeOfDay, px: number, y: number, t: number, fog = 0): void {
  const pal = city.palettes[tod] ?? city.palettes.day;
  const fn = SKYLINES[city.id] ?? SKYLINES.tokyo;
  fn(r, pal, tod, px, y, t, fog);
}
