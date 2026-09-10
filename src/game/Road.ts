import type { Renderer } from '../core/Renderer';
import type { CityPalette } from '../core/types';
import { mix } from '../core/Palette';

/**
 * Pseudo-3D road projection. World depth z is in meters ahead of the camera.
 * Screen scale s(z) = Z0 / (z + Z0). Player sits at z = PLAYER_Z and is drawn at scale 1.
 */
export const Z0 = 20;
export const PLAYER_Z = 2.0;
export const LANE_W3 = 80; // lane width (px at player depth) for 3 lanes
export const LANE_W5 = 64; // for 5 lanes
export const SPAWN_Z = 150; // meters ahead where traffic appears

export interface Projection { x: number; y: number; s: number; }

export class Road {
  horizonY = 200;
  roadH = 320;
  lanes = 3;
  laneW = LANE_W3;
  /** current curve amount (-1..1): shifts the far road horizontally */
  curve = 0;
  /** hill amount (-1..1): shifts the horizon */
  hill = 0;
  /** scroll offset in meters for stripes */
  scroll = 0;
  private sPlayer = 1;
  /** player camera x offset in lane units (camera follows the player slightly) */
  camLaneX = 0;

  constructor(private r: Renderer) { this.layout(); }

  layout(): void {
    this.horizonY = Math.round(this.r.h * 0.5);
    this.roadH = this.r.h - this.horizonY;
    this.sPlayer = Z0 / (PLAYER_Z + Z0);
  }
  setLanes(n: number): void { this.lanes = n; this.laneW = n >= 5 ? LANE_W5 : LANE_W3; }

  /** Screen scale of an object at depth z, normalized so the player (z=PLAYER_Z) is 1. */
  scaleAt(z: number): number { return Z0 / (Math.max(-Z0 + 0.5, z) + Z0) / this.sPlayer; }
  /** raw perspective factor 0..1 (1 = screen bottom) */
  sAt(z: number): number { return Z0 / (Math.max(-Z0 + 0.5, z) + Z0); }
  /** road center x for a raw factor s (includes curve). */
  centerX(s: number): number {
    const far = 1 - s;
    const curveOff = this.curve * far * far * 110;
    return this.r.w / 2 + curveOff - this.camLaneX * this.laneW * s * 0.5 / this.sPlayer;
  }
  /** horizon y including hill offset */
  get hy(): number { return this.horizonY + Math.round(this.hill * 24); }
  yAt(s: number): number { return this.hy + this.roadH * s; }
  /** lane offset in px at raw factor s; laneX is fractional lane index (0 = leftmost) */
  laneOffset(laneX: number, s: number): number { return (laneX - (this.lanes - 1) / 2) * this.laneW * s / this.sPlayer; }
  /** Project (laneX, z) → screen. */
  project(laneX: number, z: number): Projection {
    const s = this.sAt(z);
    return { x: this.centerX(s) + this.laneOffset(laneX, s), y: this.yAt(s), s: s / this.sPlayer };
  }
  /** half road width in px at raw factor s */
  halfW(s: number): number { return (this.lanes * this.laneW * s) / this.sPlayer / 2 + 6 * s; }

  /** Draw ground, road, curbs and lane markings. */
  render(pal: CityPalette, fog = 0): void {
    const r = this.r, c = r.ctx;
    const hy = this.hy;
    const bottom = r.h;
    // ground
    c.fillStyle = pal.ground;
    c.fillRect(0, hy, r.w, bottom - hy);
    for (let y = hy; y < bottom; y++) {
      const s = (y - hy) / this.roadH;
      if (s <= 0.002) continue;
      const z = Z0 / s - Z0;
      const zz = z + this.scroll;
      const cx = this.centerX(s);
      const hw = this.halfW(s);
      const band = Math.floor(zz / 6) % 2 === 0;
      const fogT = fog > 0 ? Math.min(1, fog * (1 - s) * 1.4) : 0;
      const roadCol = band ? pal.road : pal.roadAlt;
      const groundCol = band ? pal.ground : pal.groundAlt;
      const F = (col: string) => (fogT > 0 ? mix(col, pal.haze, fogT) : col);
      // ground alt band (grass stripes)
      if (!band) { c.fillStyle = F(groundCol); c.fillRect(0, y, r.w, 1); }
      // curbs
      const cw = Math.max(1, Math.round(4 * s + 1));
      const curbBand = Math.floor(zz / 3) % 2 === 0;
      c.fillStyle = F(curbBand ? pal.curb : pal.curbAlt);
      c.fillRect(Math.round(cx - hw - cw), y, cw, 1);
      c.fillRect(Math.round(cx + hw), y, cw, 1);
      // road
      c.fillStyle = F(roadCol);
      c.fillRect(Math.round(cx - hw), y, Math.round(hw * 2), 1);
      // asphalt speckle texture (deterministic per row/scroll) — reads like the reference's grainy tarmac
      if (s > 0.25) {
        const k = (y * 7 + Math.floor(zz * 2)) % 5;
        if (k < 2) {
          const off = ((y * 37 + Math.floor(zz * 11)) % Math.max(1, Math.round(hw * 2))) - hw;
          c.fillStyle = F(k === 0 ? pal.roadAlt : pal.road);
          c.fillRect(Math.round(cx + off), y, Math.max(1, Math.round(2 * s)), 1);
        }
      }
      // lane markings
      const dash = Math.floor(zz / 4) % 2 === 0;
      if (dash) {
        c.fillStyle = F(pal.stripe);
        const lw = Math.max(1, Math.round(2 * s));
        for (let i = 1; i < this.lanes; i++) {
          const lx = cx + this.laneOffset(i - 0.5, s);
          c.fillRect(Math.round(lx - lw / 2), y, lw, 1);
        }
      }
      // edge lines
      c.fillStyle = F(pal.stripe);
      c.fillRect(Math.round(cx - hw), y, Math.max(1, Math.round(1.5 * s)), 1);
      c.fillRect(Math.round(cx + hw - Math.max(1, Math.round(1.5 * s))), y, Math.max(1, Math.round(1.5 * s)), 1);
    }
  }
}
