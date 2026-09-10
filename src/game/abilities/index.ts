import type { AbilityId } from '../../core/types';
import type { World } from '../World';
import type { Ability } from '../Ability';
import { SET1 } from './set1';
import { SET2 } from './set2';
import { SET3 } from './set3';

const ALL: Partial<Record<AbilityId, (w: World) => Ability>> = { ...SET1, ...SET2, ...SET3 };

/** Factory: returns the runtime implementation of an ability (falls back to nitro). */
export function createAbility(id: AbilityId, w: World): Ability {
  const f = ALL[id] ?? ALL.nitro!;
  return f(w);
}
export function hasAbilityImpl(id: AbilityId): boolean { return !!ALL[id]; }
