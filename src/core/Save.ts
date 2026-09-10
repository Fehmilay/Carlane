import type { SaveData, Lang, ProductId } from './types';

const KEY = 'carlane.save.v1';
const VERSION = 1;

export function defaultSave(): SaveData {
  return {
    v: VERSION,
    coins: 0,
    revives: 1,
    selectedVehicle: 'gtr_r34',
    unlocked: ['gtr_r34'],
    levels: {},
    purchases: {},
    tutorialsSeen: {},
    settings: { sound: true, music: true, haptics: true, lang: 'auto', lefty: false },
    stats: { runs: 0, kills: 0, distance: 0, coinsEarned: 0, bestScore: 0 },
    createdAt: Date.now(),
  };
}

/** Persistent save. localStorage is the source of truth; Capacitor Preferences mirrors it. */
export class Save {
  data: SaveData = defaultSave();
  private dirty = false;
  private timer: number | null = null;
  private prefs: { set(o: { key: string; value: string }): Promise<void>; get(o: { key: string }): Promise<{ value: string | null }> } | null = null;

  async init(): Promise<void> {
    let raw: string | null = null;
    try { raw = localStorage.getItem(KEY); } catch { /* private mode */ }
    try {
      const mod = await import('@capacitor/preferences');
      this.prefs = mod.Preferences;
      if (!raw) {
        const r = await this.prefs.get({ key: KEY });
        raw = r.value;
      }
    } catch { /* not on capacitor */ }
    if (raw) {
      try { this.data = migrate(JSON.parse(raw)); } catch { this.data = defaultSave(); }
    }
    // make sure the selected vehicle is unlocked
    if (!this.data.unlocked.includes(this.data.selectedVehicle)) this.data.selectedVehicle = this.data.unlocked[0] ?? 'gtr_r34';
  }

  /** Mark dirty; flush is debounced (200ms). */
  save(): void {
    this.dirty = true;
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => { this.timer = null; this.flush(); }, 200);
  }
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const raw = JSON.stringify(this.data);
    try { localStorage.setItem(KEY, raw); } catch { /* ignore */ }
    this.prefs?.set({ key: KEY, value: raw }).catch(() => { /* ignore */ });
  }
  reset(): void { this.data = defaultSave(); this.save(); }

  // convenience
  get coins(): number { return this.data.coins; }
  addCoins(n: number): void { this.data.coins = Math.max(0, Math.round(this.data.coins + n)); if (n > 0) this.data.stats.coinsEarned += n; this.save(); }
  spendCoins(n: number): boolean { if (this.data.coins < n) return false; this.data.coins -= n; this.save(); return true; }
  isUnlocked(id: string): boolean { return this.data.unlocked.includes(id) || !!this.data.purchases.unlock_all; }
  unlock(id: string): void { if (!this.data.unlocked.includes(id)) { this.data.unlocked.push(id); this.save(); } }
  select(id: string): void { this.data.selectedVehicle = id; this.save(); }
  hasProduct(p: ProductId): boolean { return !!this.data.purchases[p]; }
  grantProduct(p: ProductId): void { this.data.purchases[p] = true; this.save(); }
  levelResult(id: number): { stars: number; best: number; done: boolean } { return this.data.levels[String(id)] ?? { stars: 0, best: 0, done: false }; }
  setLevelResult(id: number, stars: number, score: number): void {
    const cur = this.levelResult(id);
    this.data.levels[String(id)] = { stars: Math.max(cur.stars, stars), best: Math.max(cur.best, score), done: true };
    this.save();
  }
  /** highest unlocked level id (1-based) */
  get maxLevel(): number {
    let m = 1;
    for (let i = 1; i <= 30; i++) if (this.levelResult(i).done) m = i + 1;
    return Math.min(30, m);
  }
  get totalStars(): number { return Object.values(this.data.levels).reduce((a, l) => a + l.stars, 0); }
  tutorialSeen(key: string): boolean { return !!this.data.tutorialsSeen[key]; }
  markTutorial(key: string): void { this.data.tutorialsSeen[key] = true; this.save(); }
  get lang(): Lang | 'auto' { return this.data.settings.lang; }
}

function migrate(d: Partial<SaveData>): SaveData {
  const base = defaultSave();
  const out: SaveData = { ...base, ...d, settings: { ...base.settings, ...(d.settings ?? {}) }, stats: { ...base.stats, ...(d.stats ?? {}) }, v: VERSION };
  if (!Array.isArray(out.unlocked) || !out.unlocked.length) out.unlocked = ['gtr_r34'];
  return out;
}
