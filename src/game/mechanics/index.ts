import type { MechanicId } from '../../core/types';
import type { World } from '../World';
import type { Mechanic } from '../Mechanic';
import { SET1 } from './set1';
import { SET2 } from './set2';

const ALL: Partial<Record<MechanicId, (w: World) => Mechanic>> = { ...SET1, ...SET2 };

/** Factory: returns the runtime implementation of a level mechanic (null if not implemented). */
export function createMechanic(id: MechanicId, w: World): Mechanic | null {
  const f = ALL[id];
  return f ? f(w) : null;
}
export function hasMechanicImpl(id: MechanicId): boolean { return !!ALL[id]; }
