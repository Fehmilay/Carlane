import type { AbilityId } from '../../core/types';
import type { World } from '../World';
import type { Ability } from '../Ability';
// STUB — set 2. Export SET2 mapping AbilityId → factory.
export const SET2: Partial<Record<AbilityId, (w: World) => Ability>> = {};
