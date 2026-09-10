import type { MechanicId } from '../../core/types';
import type { World } from '../World';
import type { Mechanic } from '../Mechanic';
// STUB — set 1 (weather & atmosphere). Export SET1 mapping MechanicId → factory.
export const SET1: Partial<Record<MechanicId, (w: World) => Mechanic>> = {};
