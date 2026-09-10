import type { AbilityId } from '../../core/types';
import type { World } from '../World';
import type { Ability } from '../Ability';
// STUB — set 3. Export SET3 mapping AbilityId → factory.
export const SET3: Partial<Record<AbilityId, (w: World) => Ability>> = {};
