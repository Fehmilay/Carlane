import type { Game } from '../core/Game';
import { getLevel } from '../content/levels';
import { getVehicle } from '../content/vehicles';

/**
 * Navigation helpers (dynamic imports avoid circular module dependencies between screens).
 * All screens navigate through these.
 */
export async function goTitle(g: Game, fade = true): Promise<void> { const m = await import('./TitleScreen'); g.goto(new m.TitleScreen(g), fade); }
export async function goGarage(g: Game, fade = true): Promise<void> { const m = await import('./GarageScreen'); g.goto(new m.GarageScreen(g), fade); }
export async function goMap(g: Game, fade = true): Promise<void> { const m = await import('./MapScreen'); g.goto(new m.MapScreen(g), fade); }
export async function goShop(g: Game, fade = true): Promise<void> { const m = await import('./ShopScreen'); g.goto(new m.ShopScreen(g), fade); }
export async function goSettings(g: Game, fade = true): Promise<void> { const m = await import('./SettingsScreen'); g.goto(new m.SettingsScreen(g), fade); }
/** Start a level with the currently selected vehicle. */
export async function startLevel(g: Game, levelId: number): Promise<void> {
  const m = await import('./PlayScreen');
  const lvl = getLevel(levelId);
  const car = getVehicle(g.save.data.selectedVehicle);
  g.goto(new m.PlayScreen(g, lvl, car), true);
}
/** Push the shop as an overlay-ish screen (e.g. from the revive dialog); returns when it is closed via goBack. */
export async function pushShop(g: Game): Promise<void> { const m = await import('./ShopScreen'); g.push(new m.ShopScreen(g, true)); }
