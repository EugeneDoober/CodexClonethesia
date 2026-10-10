import runawayMidiUrl from '../assets/Runaway_Piano_Transcribed.mid?url&inline';
import { demoSongs } from './demos';
import { parseMidi } from './midi';
import type { Song } from './types';

// Inline the original MIDI so the built-in chart is ready at first render and
// remains available without a separate fetch. Importing a user file follows
// the same decoder, preserving note timing, velocity, duration, and hand names.
const runawayBytes = Uint8Array.from(atob(runawayMidiUrl.split(',')[1]), character => character.charCodeAt(0));

export const runawaySong: Song = {
  ...parseMidi(runawayBytes.buffer, 'Runaway_Piano_Transcribed.mid'),
  title: 'Runaway',
  artist: 'Kanye West',
  source: 'midi',
  description: 'Your piano transcription, ready to practice. The supplied MIDI labels both hands as approximate.',
};

export const builtInSongs: Song[] = [runawaySong, ...demoSongs];
