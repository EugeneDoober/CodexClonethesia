import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { parseMidi, parseMidiFile } from './midi';
import { demoSongs } from './demos';

function bytes(midi: Midi): ArrayBuffer {
  return Uint8Array.from(midi.toArray()).buffer;
}

describe('MIDI import', () => {
  it('uses the tempo map for note starts and durations across a tempo change', () => {
    const midi = new Midi();
    const ppq = midi.header.ppq;
    midi.header.tempos = [{ ticks: 0, bpm: 120 }, { ticks: ppq * 2, bpm: 60 }];
    midi.header.update();
    midi.addTrack().addNote({ midi: 64, ticks: ppq, durationTicks: ppq * 2, velocity: 0.8 });
    midi.tracks[0].addNote({ midi: 67, ticks: ppq * 3, durationTicks: ppq, velocity: 0.6 });
    const song = parseMidi(bytes(midi), 'tempo-study.mid');
    expect(song.notes[0].time).toBeCloseTo(0.5);
    expect(song.notes[0].duration).toBeCloseTo(1.5);
    expect(song.notes[1].time).toBeCloseTo(2);
    expect(song.duration).toBeCloseTo(3);
    expect(song.bpm).toBe(120);
  });

  it('preserves chords, full MIDI range and explicit hand labels across middle C', () => {
    const midi = new Midi();
    midi.name = 'A named piece';
    const left = midi.addTrack();
    left.name = 'Left hand';
    left.addNote({ midi: 0, time: 0, duration: 1 });
    left.addNote({ midi: 67, time: 0, duration: 1 });
    const right = midi.addTrack();
    right.name = 'Right hand';
    right.addNote({ midi: 127, time: 0, duration: 1 });
    right.addNote({ midi: 55, time: 0, duration: 1 });
    const song = parseMidi(bytes(midi), 'fallback.mid');
    expect(song.title).toBe('A named piece');
    expect(song.notes.map(note => note.midi)).toEqual([0, 55, 67, 127]);
    expect(song.notes.map(note => note.hand)).toEqual(['left', 'right', 'left', 'right']);
    expect(new Set(song.notes.map(note => note.id)).size).toBe(4);
  });

  it('infers hands from distinct piano tracks, preserving crossing notes', () => {
    const midi = new Midi();
    const low = midi.addTrack();
    [48, 50, 52, 67].forEach((pitch, index) => low.addNote({ midi: pitch, time: index, duration: 0.5 }));
    const high = midi.addTrack();
    [55, 72, 74, 76].forEach((pitch, index) => high.addNote({ midi: pitch, time: index, duration: 0.5 }));
    const song = parseMidi(bytes(midi), 'hands.midi');
    expect(song.notes.find(note => note.midi === 67)?.hand).toBe('left');
    expect(song.notes.find(note => note.midi === 55)?.hand).toBe('right');
    expect(song.title).toBe('hands');
    expect(song.source).toBe('midi');
  });

  it('uses pitch for a single mixed track and excludes percussion', () => {
    const midi = new Midi();
    const piano = midi.addTrack();
    piano.addNote({ midi: 48, time: 0, duration: 1 });
    piano.addNote({ midi: 64, time: 0, duration: 1 });
    const drums = midi.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, time: 0, duration: 1 });
    const song = parseMidi(bytes(midi), 'piano-and-drums.mid');
    expect(song.notes.map(note => [note.midi, note.hand])).toEqual([[48, 'left'], [64, 'right']]);
  });

  it('reports empty and percussion-only files', () => {
    expect(() => parseMidi(bytes(new Midi()), 'empty.mid')).toThrow(/no playable notes/i);
    const percussion = new Midi();
    const drums = percussion.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, time: 0, duration: 1 });
    expect(() => parseMidi(bytes(percussion), 'drums.mid')).toThrow(/only contains percussion/i);
  });

  it('rejects invalid, truncated and oversized files with useful errors', async () => {
    expect(() => parseMidi(new TextEncoder().encode('not a midi file at all').buffer, 'song.mp3')).toThrow(/standard .mid/i);
    const midi = new Midi();
    midi.addTrack().addNote({ midi: 64, time: 0, duration: 1 });
    expect(() => parseMidi(bytes(midi).slice(0, -2), 'truncated.mid')).toThrow(/could not be read/i);
    expect(() => parseMidi(new ArrayBuffer(10 * 1024 * 1024 + 1), 'large.mid')).toThrow(/10 MB/);
    const largeFile = { size: 10 * 1024 * 1024 + 1 } as File;
    await expect(parseMidiFile(largeFile)).rejects.toThrow(/10 MB/);
  });

  it('imports browser files and provides stable content identifiers', async () => {
    const midi = new Midi();
    midi.addTrack().addNote({ midi: 64, time: 0, duration: 1 });
    const data = bytes(midi);
    const file = { name: 'Study.MID', size: data.byteLength, arrayBuffer: async () => data } as File;
    const song = await parseMidiFile(file);
    expect(song.title).toBe('Study');
    expect(song.id).toBe(parseMidi(data, 'Renamed.mid').id);
    expect(song.bpm).toBe(120);
  });
});

describe('original practice pieces', () => {
  it.each(demoSongs)('$title has a gentle opening and complete, valid parts', song => {
    expect(song.duration).toBeGreaterThanOrEqual(40);
    expect(song.source).toBe('demo');
    expect(song.notes.filter(note => note.time === 0).map(note => note.midi)).toEqual([64]);
    expect(new Set(song.notes.map(note => note.hand)).size).toBe(2);
    for (const note of song.notes) {
      expect(note.time).toBeGreaterThanOrEqual(0);
      expect(note.duration).toBeGreaterThan(0);
      expect(note.time + note.duration).toBeLessThanOrEqual(song.duration);
    }
  });
});
