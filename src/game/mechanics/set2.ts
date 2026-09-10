import type { MechanicId } from '../../core/types';
import type { World } from '../World';
import type { Mechanic } from '../Mechanic';
// STUB — set 2 (hazards, events, bosses). Export SET2 mapping MechanicId → factory.
export const SET2: Partial<Record<MechanicId, (w: World) => Mechanic>> = {};
