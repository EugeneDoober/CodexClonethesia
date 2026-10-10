import { describe, expect, it } from 'vitest';
import { HIT_WINDOW_SECONDS, PracticeEngine } from './engine';
import type { Note, Song } from './types';

const note = (id: string, midi: number, time: number, hand: Note['hand'] = 'right', duration = 0.5): Note => ({
  id, midi, time, hand, duration, velocity: 0.8,
});
const song = (notes: Note[], duration = 5): Song => ({
  id: 'test', title: 'Test song', artist: 'Test', bpm: 120, duration, notes,
  source: 'demo', description: 'Engine test fixture',
});

describe('learning transport', () => {
  it('waits at time zero and requires every chord note, accepting sequential input', () => {
    const engine = new PracticeEngine(song([note('c', 60, 0), note('e', 64, 0), note('g', 67, 1)]));
    engine.play();
    engine.advance(2);
    expect(engine.time).toBe(0);
    expect(engine.waitingNotes().map((n) => n.midi)).toEqual([60, 64]);
    expect(engine.press(61).hit).toBe(false);
    expect(engine.press(60).hit).toBe(true);
    expect(engine.press(60).hit).toBe(false);
    engine.advance(1);
    expect(engine.time).toBe(0);
    expect(engine.waitingNotes().map((n) => n.midi)).toEqual([64]);
    engine.press(64);
    engine.advance(10);
    expect(engine.time).toBe(1);
    expect(engine.hitCount).toBe(2);
    expect(engine.waitingNotes()[0].id).toBe('g');
  });

  it('never skips an upcoming chord even when advancing a large interval', () => {
    const engine = new PracticeEngine(song([note('later', 65, 3)]));
    engine.play();
    engine.advance(100);
    expect(engine.time).toBe(3);
    expect(engine.playing).toBe(true);
    engine.press(65);
    expect(engine.advance(100).finished).toBe(true);
    expect(engine.time).toBe(5);
    expect(engine.playing).toBe(false);
  });

  it('does not allow early or paused keyboard input to satisfy future notes', () => {
    const engine = new PracticeEngine(song([note('future', 60, 1)]));
    expect(engine.press(60).hit).toBe(false);
    engine.play();
    expect(engine.press(60).hit).toBe(false);
    engine.advance(1);
    engine.pause();
    expect(engine.press(60).hit).toBe(false);
    engine.play();
    expect(engine.press(60).hit).toBe(true);
  });

  it('satisfies a doubled unison with one press but requires a new press for a repeated note', () => {
    const engine = new PracticeEngine(song([
      note('left-unison', 60, 0, 'left'), note('right-unison', 60, 0), note('repeat', 60, 1),
    ]));
    engine.play();
    expect(engine.press(60).hit).toBe(true);
    expect(engine.hitCount).toBe(2);
    expect(engine.expectedNotes().map(n => n.id)).toEqual(['repeat']);
    engine.advance(2);
    expect(engine.time).toBe(1);
    expect(engine.waitingNotes().map(n => n.id)).toEqual(['repeat']);
    expect(engine.press(60).hit).toBe(true);
  });

  it('accompanies only the unselected hand, once per onset, including time zero', () => {
    const engine = new PracticeEngine(song([
      note('left0', 48, 0, 'left'), note('right0', 60, 0), note('left1', 50, 0.5, 'left'), note('right1', 62, 1),
    ]));
    engine.setHand('right');
    engine.play();
    expect(engine.advance(2).sounding.map((n) => n.id)).toEqual(['left0']);
    expect(engine.advance(1).sounding).toEqual([]);
    engine.press(60);
    expect(engine.advance(2).sounding.map((n) => n.id)).toEqual(['left1']);
    expect(engine.time).toBe(1);
    expect(engine.waitingNotes().map((n) => n.id)).toEqual(['right1']);
  });
});

describe('performance and listening', () => {
  it('scores nearby notes and counts missed notes without stopping transport', () => {
    const engine = new PracticeEngine(song([note('early', 60, 1), note('miss', 64, 2), note('late', 67, 3)]));
    engine.setMode('perform');
    engine.play();
    engine.advance(1 - HIT_WINDOW_SECONDS);
    expect(engine.press(60).hit).toBe(true);
    engine.advance(2 + HIT_WINDOW_SECONDS);
    expect(engine.press(67).hit).toBe(true);
    expect(engine.misses.has('miss')).toBe(true);
    expect(engine.hitCount).toBe(2);
    expect(engine.missCount).toBe(1);
    expect(engine.accuracy).toBe(67);
    expect(engine.playing).toBe(true);
  });

  it('marks all unplayed selected notes missed on a large advance, including the final timing window', () => {
    const engine = new PracticeEngine(song([note('one', 60, 1), note('two', 61, 4.95)], 5));
    engine.setMode('perform');
    engine.play();
    expect(engine.advance(50).finished).toBe(true);
    expect(engine.missCount).toBe(2);
    expect(engine.accuracy).toBe(0);
  });

  it('listens to both hands without adding scores or missing crossed onsets', () => {
    const engine = new PracticeEngine(song([note('one', 40, 0, 'left'), note('two', 60, 1), note('three', 65, 2)]));
    engine.setHand('right');
    engine.setMode('listen');
    engine.play();
    expect(engine.advance(2).sounding.map((n) => n.id)).toEqual(['one', 'two', 'three']);
    expect(engine.advance(0).sounding).toEqual([]);
    expect(engine.press(65).hit).toBe(false);
    expect(engine.expectedNotes()).toEqual([]);
    expect(engine.hitCount + engine.missCount).toBe(0);
    expect(engine.advance(3).finished).toBe(true);
  });
});

describe('transport controls', () => {
  it('seeking clears scores and does not wait for notes before the new cursor', () => {
    const engine = new PracticeEngine(song([note('first', 60, 0), note('second', 62, 2)]));
    engine.play();
    engine.press(60);
    engine.seek(1);
    expect(engine.hitCount).toBe(0);
    expect(engine.expectedNotes()[0].id).toBe('second');
    engine.advance(10);
    expect(engine.time).toBe(2);
    engine.seek(0);
    expect(engine.expectedNotes()[0].id).toBe('first');
  });

  it('changing hand or mode removes stale blocking and scoring', () => {
    const engine = new PracticeEngine(song([note('left', 48, 0, 'left'), note('right', 60, 1)]));
    engine.play();
    engine.advance(2);
    engine.setHand('right');
    engine.advance(1);
    expect(engine.time).toBe(1);
    engine.press(60);
    engine.setMode('listen');
    expect(engine.hitCount).toBe(0);
    expect(engine.waitingNotes()).toEqual([]);
    expect(engine.advance(20).finished).toBe(true);
  });

  it('reselecting the current mode or hand preserves chord progress', () => {
    const engine = new PracticeEngine(song([note('c', 60, 0), note('e', 64, 0)]));
    engine.play();
    engine.press(60);
    engine.setMode('learn');
    engine.setHand('both');
    expect(engine.hitCount).toBe(1);
    expect(engine.waitingNotes().map(n => n.id)).toEqual(['e']);
  });

  it('repeats an exclusive loop, resets scores, and requires the first note on every lap', () => {
    const engine = new PracticeEngine(song([note('outside', 40, 0), note('loop', 60, 1), note('end', 64, 3)]));
    engine.loop = { start: 1, end: 3 };
    engine.play();
    expect(engine.time).toBe(1);
    engine.press(60);
    engine.advance(100);
    expect(engine.time).toBe(1);
    expect(engine.hitCount).toBe(0);
    expect(engine.waitingNotes().map((n) => n.id)).toEqual(['loop']);
    expect(engine.playing).toBe(true);
  });

  it('listening traverses multiple loop laps and returns each automatic onset', () => {
    const engine = new PracticeEngine(song([note('start', 60, 1), note('middle', 62, 2), note('excluded', 64, 3)]));
    engine.loop = { start: 1, end: 3 };
    engine.setMode('listen');
    engine.play();
    const result = engine.advance(4.5);
    expect(result.sounding.map((n) => n.id)).toEqual(['start', 'middle', 'start', 'middle', 'start']);
    expect(result.finished).toBe(false);
    expect(engine.time).toBe(1.5);
  });

  it('applies speed and pauses without moving or producing audio', () => {
    const engine = new PracticeEngine(song([note('first', 60, 2)]));
    engine.speed = 0.5;
    engine.play();
    engine.advance(2);
    expect(engine.time).toBe(1);
    engine.pause();
    expect(engine.advance(20)).toEqual({ sounding: [], finished: false });
    expect(engine.time).toBe(1);
  });

  it('reports active note durations and resets when loading a new song', () => {
    const engine = new PracticeEngine(song([note('active', 60, 0, 'right', 2)]));
    engine.seek(1);
    expect(engine.activeNotes().map((n) => n.id)).toEqual(['active']);
    engine.seek(2);
    expect(engine.activeNotes()).toEqual([]);
    engine.loop = { start: 1, end: 2 };
    engine.setSong(song([note('new', 72, 0)]));
    expect(engine.time).toBe(0);
    expect(engine.loop).toBeNull();
    expect(engine.playing).toBe(false);
    expect(engine.expectedNotes()[0].id).toBe('new');
  });

  it('handles invalid loops, negative deltas, and empty songs safely', () => {
    const engine = new PracticeEngine(song([], 0));
    engine.loop = { start: 2, end: 1 };
    engine.play();
    expect(engine.playing).toBe(false);
    expect(engine.advance(-1)).toEqual({ sounding: [], finished: false });
  });
});
