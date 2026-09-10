import type { Game } from '../core/Game';
import { getLevel } from '../content/levels';
import { getVehicle } from '../content/vehicles';

/**
 * Dev deep links via location.hash, e.g. "#level=3&car=supra_mk4", "#screen=garage".
 * Used by tools/screenshots.mjs. Returns true if a route was opened.
 */
export async function openRoute(g: Game, hash: string): Promise<boolean> {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  if (q.has('car')) g.save.data.selectedVehicle = q.get('car')!;
  if (q.has('coins')) g.save.data.coins = parseInt(q.get('coins')!, 10) || 0;
  if (q.has('unlockall')) g.save.data.purchases.unlock_all = true;
  if (q.has('maxlevel')) { const n = parseInt(q.get('maxlevel')!, 10) || 1; for (let i = 1; i < n; i++) g.save.data.levels[String(i)] = { stars: 3, best: 9999, done: true }; }
  if (q.has('notut')) { for (const k of ['play', 'ability_nitro']) g.save.data.tutorialsSeen[k] = true; g.save.data.tutorialsSeen.__all = true; }
  if (q.has('level')) {
    const lvl = getLevel(parseInt(q.get('level')!, 10) || 1);
    const car = getVehicle(q.get('car') ?? g.save.data.selectedVehicle);
    const { PlayScreen } = await import('./PlayScreen');
    const ps = new PlayScreen(g, lvl, car);
    if (q.has('skipcount')) { ps.countdown = 0; }
    if (q.has('god')) ps.world.player.invincible = true;
    if (q.has('auto')) ps.autoAbility = parseFloat(q.get('auto') || '1') || 1;
    if (q.has('boost')) ps.autoBoost = true;
    if (q.has('lane')) ps.world.player.lane = ps.world.player.laneX = parseInt(q.get('lane')!, 10) || 0;
    if (q.has('hp')) ps.world.player.hp = parseInt(q.get('hp')!, 10) || 1;
    g.goto(ps, false);
    return true;
  }
  const screen = q.get('screen');
  if (!screen) return false;
  switch (screen) {
    case 'garage': { const m = await import('./GarageScreen'); g.goto(new m.GarageScreen(g), false); return true; }
    case 'map': { const m = await import('./MapScreen'); g.goto(new m.MapScreen(g), false); return true; }
    case 'shop': { const m = await import('./ShopScreen'); g.goto(new m.ShopScreen(g), false); return true; }
    case 'settings': { const m = await import('./SettingsScreen'); g.goto(new m.SettingsScreen(g), false); return true; }
    case 'spritesheet': { const m = await import('./dev/SpriteSheetScreen'); g.goto(new m.SpriteSheetScreen(g, parseInt(q.get('page') ?? '0', 10) || 0, q.has('traffic'), q.has('all')), false); return true; }
    case 'skyline': { const m = await import('./dev/SkylineScreen'); g.goto(new m.SkylineScreen(g, q.get('city') ?? 'tokyo'), false); return true; }
    case 'props': case 'icons': case 'flags': { const m = await import('./dev/PropsScreen'); g.goto(new m.PropsScreen(g, screen, (q.get('ids') ?? '').split(',').filter(Boolean)), false); return true; }
    case 'title': { const m = await import('./TitleScreen'); g.goto(new m.TitleScreen(g), false); return true; }
    default: return false;
  }
}
