import type { Game } from '../core/Game';
import type { ProductId, VehicleDef } from '../core/types';
import { VEHICLES } from '../content/vehicles';

/** Economy helpers shared by Shop, Garage and Results screens. */
export const COIN_PACKS: Partial<Record<ProductId, number>> = { coins_s: 2500, coins_m: 8000, coins_l: 20000, coins_xl: 50000 };
export const REVIVE_PACKS: Partial<Record<ProductId, number>> = { revive_3: 3, revive_10: 10 };

/** Apply the effect of a purchased product to the save. */
export function grantProduct(g: Game, id: ProductId): void {
  const s = g.save;
  if (COIN_PACKS[id]) s.addCoins(COIN_PACKS[id]!);
  else if (REVIVE_PACKS[id]) { s.data.revives += REVIVE_PACKS[id]!; s.save(); }
  else {
    s.grantProduct(id);
    if (id === 'tank_pack') for (const v of VEHICLES) if (v.cls === 'tank' || (v.unlock.type === 'iap' && v.unlock.product === 'tank_pack')) s.unlock(v.id);
    if (id === 'legend_pass') for (const v of VEHICLES) if (v.unlock.type === 'iap' && v.unlock.product === 'legend_pass') s.unlock(v.id);
    if (id === 'unlock_all') for (const v of VEHICLES) s.unlock(v.id);
  }
}

/** Run the purchase flow for a product. Returns true on success (already granted). */
export async function buy(g: Game, id: ProductId): Promise<boolean> {
  const res = await g.iap.purchase(id);
  if (res.ok) { grantProduct(g, id); g.audio.sfx('buy'); g.haptics.success(); return true; }
  if (res.reason !== 'cancelled') { g.audio.sfx('error'); }
  return false;
}

/** Restore non-consumables. Returns number of restored products. */
export async function restore(g: Game): Promise<number> {
  const ids = await g.iap.restore();
  for (const id of ids) grantProduct(g, id);
  return ids.length;
}

export type UnlockCheck = { ok: true; cost: number } | { ok: false; reason: 'coins' | 'level' | 'stars' | 'iap'; cost: number; need: number; product?: ProductId };

/** Can the player unlock this vehicle right now? */
export function canUnlock(g: Game, v: VehicleDef): UnlockCheck {
  const s = g.save;
  const u = v.unlock;
  switch (u.type) {
    case 'start': return { ok: true, cost: 0 };
    case 'coins': return s.coins >= u.cost ? { ok: true, cost: u.cost } : { ok: false, reason: 'coins', cost: u.cost, need: u.cost - s.coins };
    case 'level': {
      if (s.maxLevel < u.level && !s.levelResult(u.level - 1).done) return { ok: false, reason: 'level', cost: u.cost, need: u.level };
      return s.coins >= u.cost ? { ok: true, cost: u.cost } : { ok: false, reason: 'coins', cost: u.cost, need: u.cost - s.coins };
    }
    case 'stars': {
      if (s.totalStars < u.stars) return { ok: false, reason: 'stars', cost: u.cost, need: u.stars };
      return s.coins >= u.cost ? { ok: true, cost: u.cost } : { ok: false, reason: 'coins', cost: u.cost, need: u.cost - s.coins };
    }
    case 'iap': return { ok: false, reason: 'iap', cost: 0, need: 0, product: u.product };
  }
}

/** Spend coins and unlock. Returns false if not allowed. */
export function unlockVehicle(g: Game, v: VehicleDef): boolean {
  const c = canUnlock(g, v);
  if (!c.ok) return false;
  if (c.cost > 0 && !g.save.spendCoins(c.cost)) return false;
  g.save.unlock(v.id);
  g.audio.sfx('unlock');
  g.haptics.success();
  return true;
}

/** Use a revive if available. */
export function useRevive(g: Game): boolean {
  if (g.save.data.revives <= 0) return false;
  g.save.data.revives--;
  g.save.save();
  return true;
}
