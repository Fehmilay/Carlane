import { buildSprite, type PixelSprite } from '../core/Sprite';

const SRC: Record<string, string[]> = {
  tree: ['...gg...', '..gggg..', '.gggggg.', 'gggggggg', '.gvgggg.', '..gvgg..', '...nn...', '...nn...'],
  lamp: ['..yy', '..kk', '..k.', '..k.', '..k.', '..k.', '..k.', '.kkk'],
};

/** Returns a roadside prop sprite by id (null if unknown). */
export function propSprite(id: string): PixelSprite | null {
  const rows = SRC[id];
  if (!rows) return null;
  return buildSprite({ id: 'prop_' + id, rows });
}
export const PROP_IDS = Object.keys(SRC);
