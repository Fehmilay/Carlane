import type { VehicleDef } from '../core/types';
import type { PixelSprite } from '../core/Sprite';
import { drawRear, damagedSprite as dmg } from './sprites/rear';
import { drawSide } from './sprites/side';
export { trafficTemplates, trafficTemplate } from './sprites/traffic';

// Facade over the sprite template libraries.
const rearCache = new Map<string, PixelSprite>();
const sideCache = new Map<string, PixelSprite>();

/** Rear-view gameplay sprite for a vehicle (cached). */
export function rearSprite(def: VehicleDef): PixelSprite {
  let s = rearCache.get(def.id);
  if (!s) { s = drawRear(def); rearCache.set(def.id, s); }
  return s;
}
/** Side-view garage sprite for a vehicle (cached). */
export function sideSprite(def: VehicleDef): PixelSprite {
  let s = sideCache.get(def.id);
  if (!s) { s = drawSide(def); sideCache.set(def.id, s); }
  return s;
}
/** Damage variant (1..3). */
export function damagedSprite(spr: PixelSprite, level: number): PixelSprite { return dmg(spr, level); }
