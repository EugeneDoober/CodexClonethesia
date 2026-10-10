import { Midi } from '@tonejs/midi';
import type { Track } from '@tonejs/midi';
import type { Hand, Note, Song } from './types';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_NOTES = 50_000;
const INVALID_FILE = 'This file could not be read as MIDI. Choose a standard .mid or .midi file.';

/** Validate chunk boundaries before passing untrusted uploads to the MIDI decoder. */
function validateHeader(data: ArrayBuffer): void {
  if (data.byteLength > MAX_FILE_BYTES) throw new Error('This MIDI is too large. Choose a file smaller than 10 MB.');
  if (data.byteLength < 14) throw new Error(INVALID_FILE);
  const view = new DataView(data);
  if (view.getUint32(0) !== 0x4d546864) throw new Error(INVALID_FILE); // MThd
  const headerSize = view.getUint32(4);
  if (headerSize < 6 || headerSize + 8 > data.byteLength) throw new Error(INVALID_FILE);
  const format = view.getUint16(8);
  if (format > 1) throw new Error('This MIDI uses independent patterns. Export it as a type 0 or type 1 MIDI file.');
  const division = view.getUint16(12);
  if (!division || (division & 0x8000)) {
    throw new Error('This MIDI uses unsupported timing. Export a MIDI file with musical beats (PPQ timing).');
  }
  const trackCount = view.getUint16(10);
  let offset = headerSize + 8;
  for (let index = 0; index < trackCount; index++) {
    if (offset + 8 > data.byteLength || view.getUint32(offset) !== 0x4d54726b) throw new Error(INVALID_FILE); // MTrk
    const length = view.getUint32(offset + 4);
    offset += length + 8;
    if (offset > data.byteLength) throw new Error(INVALID_FILE);
  }
}

function namedHand(name: string): Hand | undefined {
  if (/\b(left|lh|bass|accompaniment)\b/i.test(name)) return 'left';
  if (/\b(right|rh|treble|melody)\b/i.test(name)) return 'right';
  return undefined;
}

function medianPitch(track: Track): number {
  const pitches = track.notes.map(note => note.midi).sort((a, b) => a - b);
  return pitches[Math.floor(pitches.length / 2)];
}

function inferTrackHands(tracks: Track[]): Map<Track, Hand> {
  const hands = new Map<Track, Hand>();
  for (const track of tracks) {
    const hand = namedHand(track.name);
    if (hand) hands.set(track, hand);
  }
  // Most piano exports contain a separate staff per track. Preserve crossing
  // voices when those two tracks have clearly different registers.
  if (tracks.length === 2) {
    const ranked = tracks.map(track => ({ track, pitch: medianPitch(track) })).sort((a, b) => a.pitch - b.pitch);
    const [low, high] = ranked;
    if (high.pitch - low.pitch >= 7 && low.pitch < 64 && high.pitch > 55) {
      if (!hands.has(low.track)) hands.set(low.track, 'left');
      if (!hands.has(high.track)) hands.set(high.track, 'right');
    }
  }
  return hands;
}

function contentId(data: ArrayBuffer): string {
  let hash = 2166136261;
  for (const byte of new Uint8Array(data)) hash = Math.imul(hash ^ byte, 16777619);
  return `midi-${(hash >>> 0).toString(36)}`;
}

export function parseMidi(data: ArrayBuffer, fileName = 'Untitled MIDI.mid'): Song {
  validateHeader(data);
  let midi: Midi;
  try {
    midi = new Midi(data);
  } catch {
    throw new Error(INVALID_FILE);
  }

  const totalNotes = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0);
  if (totalNotes > MAX_NOTES) throw new Error('This MIDI has more than 50,000 notes. Export a shorter section to practice.');
  const tracks = midi.tracks.filter(track => track.notes.length > 0 && !track.instrument.percussion && track.channel !== 9);
  if (!tracks.length) {
    throw new Error(totalNotes ? 'This MIDI only contains percussion. Choose a song with piano or other pitched notes.' : 'This MIDI has no playable notes. Choose a MIDI containing note events.');
  }

  const trackHands = inferTrackHands(tracks);
  const notes: Note[] = [];
  tracks.forEach((track, trackIndex) => {
    track.notes.forEach((note, index) => {
      const { midi: pitch, time, duration, velocity } = note;
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127 || !Number.isFinite(time) || time < 0 || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(velocity) || velocity <= 0) return;
      notes.push({
        id: `track-${trackIndex}-note-${index}`,
        midi: pitch,
        time,
        duration,
        velocity: Math.min(1, velocity),
        hand: trackHands.get(track) ?? (pitch < 60 ? 'left' : 'right'),
      });
    });
  });
  if (!notes.length) throw new Error('This MIDI has no playable notes with valid timing. Try exporting it again.');
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  const fileTitle = fileName.split(/[\\/]/).pop()?.replace(/\.(mid|midi)$/i, '').trim();
  const initialTempo = midi.header.tempos.find(tempo => tempo.ticks === 0)?.bpm ?? 120;
  return {
    id: contentId(data),
    title: midi.name.trim() || fileTitle || 'Untitled MIDI',
    artist: 'Your MIDI library',
    bpm: Number.isFinite(initialTempo) && initialTempo > 0 ? Math.round(initialTempo) : 120,
    duration: notes.reduce((end, note) => Math.max(end, note.time + note.duration), 0),
    notes,
    source: 'midi',
    description: `${notes.length.toLocaleString()} notes · ${tracks.length} musical ${tracks.length === 1 ? 'track' : 'tracks'}. Hands inferred from track names and pitch.`,
  };
}

export async function parseMidiFile(file: File): Promise<Song> {
  if (file.size > MAX_FILE_BYTES) throw new Error('This MIDI is too large. Choose a file smaller than 10 MB.');
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    throw new Error('This file could not be opened. Choose the MIDI file again.');
  }
  return parseMidi(data, file.name);
}
