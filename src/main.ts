import { Game } from './core/Game';
import { createIAP } from './services/IAP';
import { BootScreen } from './ui/BootScreen';
import './content/music';

declare global { interface Window { game: Game } }

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  window.game = game;
  game.push(new BootScreen(game));
  game.start();
  const iap = await createIAP();
  await game.init(iap);
  try {
    const cap = await import('@capacitor/core');
    if (cap.Capacitor.isNativePlatform()) {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.hide().catch(() => {});
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide().catch(() => {});
      const { App } = await import('@capacitor/app');
      App.addListener('backButton', () => { game.top?.onBack?.(); });
    }
  } catch { /* web */ }
  const { openRoute } = await import('./ui/routes');
  if (location.hash && (await openRoute(game, location.hash))) return;
  const { TitleScreen } = await import('./ui/TitleScreen');
  game.goto(new TitleScreen(game), false);
}

boot().catch((e) => { console.error(e); });
