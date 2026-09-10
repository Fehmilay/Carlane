import type { VehicleDef } from '../../core/types';
import type { TrafficTemplate } from '../../game/Traffic';
import { drawRear } from './rear';

// STUB — replaced by the full traffic template catalog (see docs/AGENT_GUIDE.md ids). Keep exports identical.

let CACHE: TrafficTemplate[] | null = null;
/** All traffic templates: generic civilians, city-specific vehicles, heavies and bosses. */
export function trafficTemplates(): TrafficTemplate[] {
  if (CACHE) return CACHE;
  const colors = ['#e0202a', '#f0c020', '#f4f4f0', '#6a6a78', '#20b040', '#8030c0'];
  CACHE = colors.map((c, i) => ({
    id: 'sedan_' + i,
    sprite: drawRear({ id: 'civ' + i, body: 'sedan', palette: { body: c, shade: '#23232f', light: '#ffffff', accent: '#ffffff', glass: '#40e0f0', lamp: '#e0202a' } } as VehicleDef),
    hp: 1, heavy: false, damage: 1, speed: 1, points: 100,
  }));
  return CACHE;
}
export function trafficTemplate(id: string): TrafficTemplate | undefined { return trafficTemplates().find((t) => t.id === id); }
