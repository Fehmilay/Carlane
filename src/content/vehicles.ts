import type { VehicleDef } from '../core/types';

// STUB — replaced by the full 48-vehicle roster. Keep exports identical.
export const VEHICLES: VehicleDef[] = [
  {
    id: 'gtr_r34', num: 1, name: 'GT-R R34', brand: 'nissan', cls: 'jdm', body: 'coupe',
    palette: { body: '#2040e0', shade: '#101c80', light: '#60a0ff', accent: '#f4f4f0', glass: '#40e0f0', lamp: '#e0202a' },
    details: { spoiler: 'wing', exhaust: 2, lights: 'round' },
    stats: { speed: 8, boost: 8, handling: 7, durability: 5, weight: 3 },
    ability: 'nitro', unlock: { type: 'start' },
    desc: { de: 'Godzilla. Der König der Wangan.', en: 'Godzilla. King of the Wangan.' }, city: 'tokyo',
  },
];

export function getVehicle(id: string): VehicleDef {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
}
