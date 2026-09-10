import type { LevelDef } from '../core/types';

// STUB — replaced by the full 30-level campaign. Keep exports identical.
export const LEVELS: LevelDef[] = [
  {
    id: 1, city: 'tokyo', name: { de: 'Shuto-Schnellstraße', en: 'Shuto Expressway' }, lanes: 3, length: 2000, timeOfDay: 'day',
    density: 0.45, trafficSpeed: 0.55, speedMul: 1, mechanics: [], stars: [1500, 3000, 5000], reward: 200, curves: 0.3, heavy: 0.1,
    desc: { de: 'Willkommen in Tokio.', en: 'Welcome to Tokyo.' },
  },
];

export function getLevel(id: number): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
