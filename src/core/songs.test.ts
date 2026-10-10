import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import runawayMidiUrl from '../assets/Runaway_Piano_Transcribed.mid?url&inline';
import { builtInSongs, runawaySong } from './songs';
import { demoSongs } from './demos';
import { PracticeEngine } from './engine';

const sourceBytes = Uint8Array.from(atob(runawayMidiUrl.split(',')[1]), character => character.charCodeAt(0));
const sourceMidi = new Midi(sourceBytes);

describe('built-in Runaway transcription', () => {
  it('ships the original uploaded MIDI byte-for-byte and keeps it first in the library', async () => {
    expect(sourceBytes.byteLength).toBe(12_456);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', sourceBytes.buffer));
    const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    expect(hash).toBe('cbc9daf8fe94ae57865816864ce4c385a2905109fd34862753c0e851a91514d3');
    expect(builtInSongs).toEqual([runawaySong, ...demoSongs]);
    expect(runawaySong.title).toBe('Runaway');
    expect(runawaySong.artist).toBe('Kanye West');
    expect(runawaySong.source).toBe('midi');
    expect(runawaySong.description).toMatch(/approximate/i);
  });

  it('preserves all source note events, timing, dynamics, track hands, and tempo', () => {
    const sourceNotes = sourceMidi.tracks.flatMap(track => track.notes.map(note => ({
      midi: note.midi,
      time: note.time,
      duration: note.duration,
      velocity: note.velocity,
      hand: track.name.startsWith('Left') ? 'left' : 'right',
    }))).sort((a, b) => a.time - b.time || a.midi - b.midi);
    expect(runawaySong.notes.map(({ midi, time, duration, velocity, hand }) => ({ midi, time, duration, velocity, hand }))).toEqual(sourceNotes);
    expect(runawaySong.notes).toHaveLength(1_934);
    expect(runawaySong.notes.filter(note => note.hand === 'left')).toHaveLength(904);
    expect(runawaySong.notes.filter(note => note.hand === 'right')).toHaveLength(1_030);
    expect(Math.min(...runawaySong.notes.map(note => note.midi))).toBe(37);
    expect(Math.max(...runawaySong.notes.map(note => note.midi))).toBe(97);
    expect(runawaySong.bpm).toBe(120);
    expect(runawaySong.bpm).toBe(sourceMidi.header.tempos[0].bpm);
    expect(runawaySong.duration).toBeCloseTo(338.3636363636364);
    expect(runawaySong.duration).toBeCloseTo(sourceMidi.duration);
  });

  it('waits for both opening E notes and requires fresh input for the repeated chord', () => {
    const engine = new PracticeEngine(runawaySong);
    engine.play();
    engine.advance(20);
    expect(engine.time).toBeCloseTo(1.7636363636363637);
    expect(engine.waitingNotes().map(note => note.midi)).toEqual([76, 88]);
    expect(engine.press(64).hit).toBe(false);
    expect(engine.press(76).hit).toBe(true);
    engine.advance(20);
    expect(engine.time).toBeCloseTo(1.7636363636363637);
    expect(engine.waitingNotes().map(note => note.midi)).toEqual([88]);
    expect(engine.press(88).hit).toBe(true);
    engine.advance(20);
    expect(engine.time).toBeCloseTo(3.2045454545454546);
    expect(engine.waitingNotes().map(note => note.midi)).toEqual([76, 88]);
    expect(engine.hitCount).toBe(2);
  });

  it('can complete the entire transcription in Learn mode without skipping notes or getting stuck', () => {
    const engine = new PracticeEngine(runawaySong);
    engine.play();
    // A large step must stop at each unresolved onset, even for close notes in
    // the transcription. Each keyboard pitch satisfies simultaneous unisons.
    for (let step = 0; step <= runawaySong.notes.length && engine.playing; step++) {
      engine.advance(runawaySong.duration);
      const pitches = new Set(engine.waitingNotes().map(note => note.midi));
      for (const pitch of pitches) expect(engine.press(pitch).hit).toBe(true);
    }
    expect(engine.playing).toBe(false);
    expect(engine.time).toBe(runawaySong.duration);
    expect(engine.hitCount).toBe(runawaySong.notes.length);
    expect(engine.missCount).toBe(0);
  });
});
