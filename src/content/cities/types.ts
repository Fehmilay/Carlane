import type { Renderer } from '../../core/Renderer';
import type { CityPalette, TimeOfDay } from '../../core/types';

/**
 * Skyline drawer: draws the city silhouette so that its bottom edge is at `y` (the road horizon).
 * `px` is a small parallax offset (±30), `t` is seconds (animate neon/blinking lights), `fog` 0..1.
 * Draw 2–3 layers (far/mid/near) using pal.farSky / pal.nearSky, windows with pal.glow at dusk/night,
 * and the city's landmarks so the city is recognizable at a glance. Must cover x = 0..240 seamlessly.
 */
export type SkylineFn = (r: Renderer, pal: CityPalette, tod: TimeOfDay, px: number, y: number, t: number, fog: number) => void;
