// Procedural chiptune audio: WebAudio square/triangle/saw/noise voices. No assets.
// SFX are small descriptors; music is a step sequencer with per-style patterns.
export type SfxName =
  | 'ui' | 'uiBack' | 'select' | 'coin' | 'coinBig' | 'swipe' | 'boostStart' | 'boostLoop' | 'boostEnd'
  | 'hit' | 'explode' | 'explodeBig' | 'crush' | 'shoot' | 'cannon' | 'missile' | 'laser' | 'jump' | 'land'
  | 'shield' | 'emp' | 'powerup' | 'ability' | 'cooldownReady' | 'star' | 'finish' | 'gameover' | 'buy'
  | 'error' | 'countdown' | 'go' | 'horn' | 'siren' | 'freeze' | 'zap' | 'whoosh' | 'levelup' | 'unlock';

export type MusicTrack = string;

interface Voice { osc: OscillatorNode | AudioBufferSourceNode; gain: GainNode; }

export class AudioEngine {
  enabled = true;
  musicEnabled = true;
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private unlocked = false;
  // music sequencer
  private seq: MusicSequencer | null = null;
  private currentTrack: MusicTrack | null = null;

  unlock(): void {
    if (this.unlocked) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9; this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.45; this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      if (this.currentTrack && this.musicEnabled) this.playMusic(this.currentTrack);
    } catch { this.ctx = null; }
  }
  suspend(): void { this.ctx?.suspend().catch(() => {}); }
  resume(): void { this.ctx?.resume().catch(() => {}); }

  update(dt: number): void { this.seq?.update(dt); }

  // ── SFX ─────────────────────────────────────────────────────────────────
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, curve: 'exp' | 'lin' = 'exp'): void {
    if (!this.ctx || !this.sfxGain || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    else o.frequency.linearRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, delay = 0, filterHz = 2000, q = 0.5, type: BiquadFilterType = 'lowpass'): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuf || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterHz; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t); s.stop(t + dur + 0.02);
  }
  private arp(notes: number[], step: number, type: OscillatorType = 'square', vol = 0.15, dur = 0.12): void {
    notes.forEach((n, i) => this.tone(type, n, n, dur, vol, i * step));
  }

  sfx(name: SfxName): void {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'ui': this.tone('square', 880, 1200, 0.06, 0.12); break;
      case 'uiBack': this.tone('square', 600, 300, 0.08, 0.12); break;
      case 'select': this.arp([660, 880, 1320], 0.05, 'square', 0.14, 0.09); break;
      case 'coin': this.tone('square', 1320, 1320, 0.05, 0.14); this.tone('square', 1760, 1760, 0.12, 0.14, 0.05); break;
      case 'coinBig': this.arp([1046, 1318, 1568, 2093], 0.05, 'square', 0.15, 0.14); break;
      case 'swipe': this.noise(0.08, 0.18, 0, 3000, 1, 'bandpass'); this.tone('triangle', 300, 600, 0.08, 0.1); break;
      case 'boostStart': this.tone('sawtooth', 120, 700, 0.35, 0.18); this.noise(0.3, 0.15, 0, 1500); break;
      case 'boostLoop': break;
      case 'boostEnd': this.tone('sawtooth', 500, 150, 0.25, 0.1); break;
      case 'hit': this.noise(0.18, 0.5, 0, 900); this.tone('square', 200, 60, 0.18, 0.3); break;
      case 'explode': this.noise(0.5, 0.7, 0, 700, 0.7); this.tone('sawtooth', 160, 30, 0.45, 0.35); this.noise(0.25, 0.4, 0.02, 3500, 0.5, 'highpass'); break;
      case 'explodeBig': this.noise(1.0, 0.9, 0, 500, 0.7); this.tone('sawtooth', 120, 20, 0.9, 0.5); this.tone('square', 60, 25, 0.8, 0.4, 0.05); this.noise(0.4, 0.5, 0.05, 4000, 0.5, 'highpass'); break;
      case 'crush': this.noise(0.3, 0.6, 0, 400); this.tone('square', 90, 40, 0.3, 0.35); break;
      case 'shoot': this.tone('square', 900, 200, 0.12, 0.2); this.noise(0.08, 0.2, 0, 4000, 0.5, 'highpass'); break;
      case 'cannon': this.noise(0.35, 0.8, 0, 600); this.tone('sawtooth', 200, 40, 0.35, 0.4); break;
      case 'missile': this.tone('sawtooth', 300, 1200, 0.5, 0.18); this.noise(0.5, 0.25, 0, 2500, 0.8, 'bandpass'); break;
      case 'laser': this.tone('sawtooth', 2000, 300, 0.4, 0.2); this.tone('square', 1500, 200, 0.4, 0.12, 0.02); break;
      case 'jump': this.tone('square', 300, 900, 0.22, 0.18); break;
      case 'land': this.noise(0.12, 0.35, 0, 600); this.tone('square', 150, 80, 0.1, 0.2); break;
      case 'shield': this.arp([523, 784, 1046], 0.06, 'triangle', 0.2, 0.25); break;
      case 'emp': this.tone('sawtooth', 100, 2500, 0.5, 0.25, 0, 'lin'); this.noise(0.6, 0.3, 0.1, 5000, 0.5, 'highpass'); break;
      case 'powerup': this.arp([523, 659, 784, 1046, 1318], 0.05, 'square', 0.14, 0.12); break;
      case 'ability': this.arp([440, 880], 0.05, 'square', 0.16, 0.1); this.noise(0.15, 0.2, 0, 3000, 1, 'bandpass'); break;
      case 'cooldownReady': this.arp([1046, 1568], 0.06, 'triangle', 0.14, 0.1); break;
      case 'star': this.arp([1046, 1318, 1568, 2093, 2637], 0.06, 'square', 0.13, 0.2); break;
      case 'finish': this.arp([523, 659, 784, 1046, 784, 1046, 1318, 1568], 0.09, 'square', 0.16, 0.22); break;
      case 'gameover': this.arp([392, 349, 311, 261, 196], 0.18, 'sawtooth', 0.18, 0.4); break;
      case 'buy': this.arp([784, 1046, 1318, 1568], 0.06, 'square', 0.15, 0.15); this.tone('triangle', 1568, 1568, 0.4, 0.1, 0.25); break;
      case 'error': this.tone('square', 220, 180, 0.15, 0.16); this.tone('square', 180, 140, 0.2, 0.16, 0.15); break;
      case 'countdown': this.tone('square', 660, 660, 0.12, 0.18); break;
      case 'go': this.tone('square', 1320, 1320, 0.35, 0.2); break;
      case 'horn': this.tone('sawtooth', 220, 210, 0.5, 0.25); this.tone('sawtooth', 277, 265, 0.5, 0.2); break;
      case 'siren': this.tone('square', 600, 900, 0.3, 0.12, 0, 'lin'); this.tone('square', 900, 600, 0.3, 0.12, 0.3, 'lin'); break;
      case 'freeze': this.arp([1568, 1318, 1046, 880], 0.05, 'triangle', 0.16, 0.2); this.noise(0.3, 0.15, 0, 6000, 0.5, 'highpass'); break;
      case 'zap': this.noise(0.15, 0.4, 0, 3000, 2, 'bandpass'); this.tone('square', 1800, 300, 0.15, 0.2); break;
      case 'whoosh': this.noise(0.25, 0.3, 0, 1200, 1, 'bandpass'); break;
      case 'levelup': this.arp([523, 659, 784, 1046, 1318, 1568, 2093], 0.07, 'square', 0.15, 0.3); break;
      case 'unlock': this.arp([392, 523, 659, 784, 1046, 1318], 0.07, 'triangle', 0.18, 0.3); break;
    }
  }

  /** Continuous engine hum: call every frame with speed 0..1 and boost flag. */
  engine(speed: number, boost: boolean, on: boolean): void {
    if (!this.ctx || !this.sfxGain) return;
    if (!on || !this.enabled) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 400;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter); this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.sfxGain);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    const f = 40 + speed * 90 + (boost ? 60 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineFilter!.frequency.setTargetAtTime(300 + speed * 600 + (boost ? 800 : 0), t, 0.08);
    this.engineGain!.gain.setTargetAtTime(0.05 + speed * 0.05 + (boost ? 0.04 : 0), t, 0.1);
  }

  // ── Music ────────────────────────────────────────────────────────────────
  playMusic(track: MusicTrack): void {
    this.currentTrack = track;
    if (!this.ctx || !this.musicGain || !this.musicEnabled) return;
    if (this.seq && this.seq.track === track) return;
    this.seq?.stop();
    this.seq = new MusicSequencer(this.ctx, this.musicGain, track);
  }
  stopMusic(): void { this.seq?.stop(); this.seq = null; this.currentTrack = null; }
  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    if (!on) { this.seq?.stop(); this.seq = null; }
    else if (this.currentTrack) { const t = this.currentTrack; this.currentTrack = null; this.playMusic(t); }
  }
  /** duck music (e.g. on game over) */
  duck(level: number, time = 0.3): void { if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(0.45 * level, this.ctx.currentTime, time); }
}

// ── Sequencer ───────────────────────────────────────────────────────────────
// Note numbers are MIDI; 0 = rest. Patterns are 16-step bars.
export interface Pattern { bpm: number; bass: number[]; lead: number[]; arp?: number[]; drums: string; leadType?: OscillatorType; bassType?: OscillatorType; }

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Music library — filled by content/music.ts via registerTrack(). Fallback: generic. */
const TRACKS: Record<string, Pattern[]> = {};
export function registerTrack(name: string, patterns: Pattern[]): void { TRACKS[name] = patterns; }

const FALLBACK: Pattern[] = [{
  bpm: 140,
  bass: [45, 0, 45, 45, 0, 45, 0, 45, 48, 0, 48, 48, 0, 48, 0, 48],
  lead: [69, 0, 72, 0, 76, 0, 72, 0, 69, 0, 72, 0, 77, 0, 76, 0],
  arp: [57, 60, 64, 60, 57, 60, 64, 60, 60, 64, 67, 64, 60, 64, 67, 64],
  drums: 'k.h.s.h.k.h.s.hh',
}];

class MusicSequencer {
  private step = 0;
  private pat = 0;
  private nextT = 0;
  private stopped = false;
  private timer: number | null = null;
  constructor(private ctx: AudioContext, private out: GainNode, public track: string) {
    this.nextT = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 60);
    this.schedule();
  }
  stop(): void { this.stopped = true; if (this.timer !== null) clearInterval(this.timer); }
  update(_dt: number): void { /* scheduling is interval-driven */ }
  private schedule(): void {
    if (this.stopped) return;
    const pats = TRACKS[this.track] ?? FALLBACK;
    while (this.nextT < this.ctx.currentTime + 0.2) {
      const p = pats[this.pat % pats.length];
      const stepDur = 60 / p.bpm / 4;
      this.playStep(p, this.step, this.nextT, stepDur);
      this.nextT += stepDur;
      this.step++;
      if (this.step >= 16) { this.step = 0; this.pat++; }
    }
  }
  private voice(type: OscillatorType, f: number, t: number, dur: number, vol: number, decay = 0.9): void {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * decay);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur);
  }
  private drum(ch: string, t: number): void {
    if (ch === 'k') { const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.16); }
    else if (ch === 's' || ch === 'h') {
      const len = Math.floor(this.ctx.sampleRate * 0.12);
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = this.ctx.createBufferSource(); s.buffer = b;
      const f = this.ctx.createBiquadFilter(); f.type = ch === 'h' ? 'highpass' : 'bandpass'; f.frequency.value = ch === 'h' ? 7000 : 1800;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(ch === 'h' ? 0.12 : 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + (ch === 'h' ? 0.04 : 0.1));
      s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + 0.12);
    }
  }
  private playStep(p: Pattern, i: number, t: number, dur: number): void {
    const b = p.bass[i % p.bass.length]; if (b) this.voice(p.bassType ?? 'triangle', midi(b), t, dur * 1.8, 0.28);
    const l = p.lead[i % p.lead.length]; if (l) this.voice(p.leadType ?? 'square', midi(l), t, dur * 1.6, 0.13);
    if (p.arp) { const a = p.arp[i % p.arp.length]; if (a) this.voice('square', midi(a), t, dur * 0.9, 0.06); }
    const d = p.drums[i % p.drums.length]; if (d && d !== '.') this.drum(d, t);
  }
}
