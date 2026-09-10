import { registerTrack } from '../core/Audio';
// STUB — replaced by the music catalog: one entry per MusicStyle with 2–4 patterns each.
registerTrack('jdm', [{
  bpm: 150,
  bass: [45, 0, 45, 45, 0, 45, 0, 45, 48, 0, 48, 48, 0, 48, 0, 48],
  lead: [69, 0, 72, 0, 76, 0, 72, 0, 69, 0, 72, 0, 77, 0, 76, 0],
  arp: [57, 60, 64, 60, 57, 60, 64, 60, 60, 64, 67, 64, 60, 64, 67, 64],
  drums: 'k.h.s.h.k.h.s.hh',
}]);
export const MUSIC_READY = true;
