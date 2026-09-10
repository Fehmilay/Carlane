import type { AbilityDef, AbilityId } from '../core/types';

/** Catalog of ability definitions (UI metadata). Implementations: game/abilities/. */
export const ABILITIES: Record<AbilityId, AbilityDef> = {
  nitro: { id: 'nitro', name: { de: 'GODZILLA-NITRO', en: 'GODZILLA NITRO' }, desc: { de: 'Blauer Feuerstoß: 3 Sekunden Überschall-Boost.', en: 'Blue flame burst: 3 seconds of supersonic boost.' }, kind: 'duration', cooldown: 9, duration: 3, icon: 'nitro', color: '#40e0f0' },
} as Record<AbilityId, AbilityDef>;

export function getAbilityDef(id: AbilityId): AbilityDef {
  return ABILITIES[id] ?? ABILITIES.nitro;
}
