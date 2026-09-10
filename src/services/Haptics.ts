type ImpactStyle = 'Heavy' | 'Medium' | 'Light';

/** Thin wrapper over @capacitor/haptics with a no-op web fallback. */
export class Haptics {
  enabled = true;
  private mod: { impact(o: { style: ImpactStyle }): Promise<void>; notification(o: { type: 'Success' | 'Warning' | 'Error' }): Promise<void>; vibrate(o: { duration: number }): Promise<void>; selectionStart(): Promise<void>; selectionChanged(): Promise<void>; selectionEnd(): Promise<void> } | null = null;
  private loading = false;
  private last = 0;

  private async load() {
    if (this.mod || this.loading) return;
    this.loading = true;
    try {
      const m = await import('@capacitor/haptics');
      this.mod = m.Haptics as unknown as typeof this.mod;
    } catch { this.mod = null; }
  }
  private throttle(ms: number): boolean {
    const now = performance.now();
    if (now - this.last < ms) return false;
    this.last = now;
    return true;
  }
  impact(style: ImpactStyle = 'Medium'): void {
    if (!this.enabled) return;
    if (!this.mod) { void this.load(); if ('vibrate' in navigator && this.throttle(60)) navigator.vibrate?.(style === 'Heavy' ? 40 : style === 'Medium' ? 20 : 8); return; }
    if (!this.throttle(40)) return;
    this.mod.impact({ style }).catch(() => { /* ignore */ });
  }
  success(): void { if (!this.enabled) return; if (!this.mod) { void this.load(); return; } this.mod.notification({ type: 'Success' }).catch(() => {}); }
  error(): void { if (!this.enabled) return; if (!this.mod) { void this.load(); navigator.vibrate?.([30, 30, 60]); return; } this.mod.notification({ type: 'Error' }).catch(() => {}); }
  tick(): void { if (!this.enabled) return; if (!this.mod) { void this.load(); return; } if (!this.throttle(30)) return; this.mod.selectionChanged().catch(() => {}); }
}
