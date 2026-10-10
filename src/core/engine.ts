import type { Note, PlayMode, PracticeHand, Song } from './types';

const EPSILON = 0.000001;
export const HIT_WINDOW_SECONDS = 0.22;

/**
 * A deterministic transport: callers supply elapsed wall-clock seconds to advance.
 * Manual notes score only while playing. Learning accepts each note of a chord
 * separately; releasing or holding a key never satisfies a later repeated note.
 * Seeking and changing mode/hand start a fresh attempt at the current cursor.
 * A loop starts a fresh attempt each lap, and its end is exclusive.
 */
export class PracticeEngine {
  public song: Song;
  public time = 0;
  public playing = false;
  public mode: PlayMode = 'learn';
  public hand: PracticeHand = 'both';
  public speed = 1;
  public loop: { start: number; end: number } | null = null;
  public hits = new Set<string>();
  public misses = new Set<string>();

  private notes: Note[];
  private attemptStart = 0;
  private sounded = new Set<string>();

  constructor(song: Song) {
    this.song = song;
    this.notes = [...song.notes].sort((a, b) => a.time - b.time || a.midi - b.midi);
  }

  get hitCount(): number { return this.hits.size; }
  get missCount(): number { return this.misses.size; }
  get accuracy(): number {
    const total = this.hitCount + this.missCount;
    return total === 0 ? 100 : Math.round(100 * this.hitCount / total);
  }

  public selectedNotes(): Note[] {
    return this.notes.filter((note) => this.hand === 'both' || note.hand === this.hand);
  }

  /** All sounding-duration notes, regardless of the selected practice hand. */
  public activeNotes(): Note[] {
    return this.notes.filter((note) => note.time <= this.time + EPSILON
      && note.time + note.duration > this.time + EPSILON);
  }

  /** The next unresolved chord, also suitable for assigning guided keyboard keys. */
  public expectedNotes(): Note[] {
    if (this.mode === 'listen') return [];
    const pending = this.pendingNotes();
    const first = pending[0];
    return first ? pending.filter((note) => Math.abs(note.time - first.time) <= EPSILON) : [];
  }

  public waitingNotes(): Note[] {
    if (this.mode !== 'learn') return [];
    return this.expectedNotes().filter((note) => note.time <= this.time + EPSILON);
  }

  public play(): void {
    const loop = this.validLoop();
    if (loop && (this.time < loop.start || this.time >= loop.end)) {
      this.seek(loop.start);
    } else if (this.time >= this.song.duration) {
      this.seek(0);
    }
    this.playing = this.song.duration > 0;
  }

  public pause(): void { this.playing = false; }

  public seek(time: number): void {
    this.time = Math.min(this.song.duration, Math.max(0, Number.isFinite(time) ? time : 0));
    this.beginAttempt(this.time);
    if (this.time >= this.song.duration) this.playing = false;
  }

  public reset(): void {
    this.pause();
    this.seek(this.validLoop()?.start ?? 0);
  }

  public setSong(song: Song): void {
    this.song = song;
    this.notes = [...song.notes].sort((a, b) => a.time - b.time || a.midi - b.midi);
    this.loop = null;
    this.reset();
  }

  public setMode(mode: PlayMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.beginAttempt(this.time);
  }

  public setHand(hand: PracticeHand): void {
    if (this.hand === hand) return;
    this.hand = hand;
    this.beginAttempt(this.time);
  }

  public press(midi: number): { hit: boolean; note?: Note } {
    if (!this.playing || this.mode === 'listen') return { hit: false };
    const candidates = this.mode === 'learn'
      ? this.waitingNotes()
      : this.pendingNotes().filter((note) => Math.abs(note.time - this.time) <= HIT_WINDOW_SECONDS + EPSILON);
    const note = candidates.filter((candidate) => candidate.midi === midi)
      .sort((a, b) => Math.abs(a.time - this.time) - Math.abs(b.time - this.time))[0];
    if (!note) return { hit: false };
    // A single piano key plays a unison shared by multiple MIDI tracks. Keep
    // later repeated pitches pending, even if their timing windows overlap.
    for (const candidate of candidates) {
      if (candidate.midi === midi && Math.abs(candidate.time - note.time) <= EPSILON) {
        this.hits.add(candidate.id);
      }
    }
    return { hit: true, note };
  }

  /**
   * Returns every crossed automatic onset, even for a large elapsed interval.
   * Learn/perform accompany the unselected hand; listen plays both hands.
   * The renderer/audio layer owns playback of notes returned by manual press().
   */
  public advance(deltaSeconds: number): { sounding: Note[]; finished: boolean } {
    const sounding: Note[] = [];
    if (!this.playing) return { sounding, finished: false };
    const speed = Number.isFinite(this.speed) && this.speed > 0 ? this.speed : 1;
    let remaining = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0) * speed;
    const loop = this.validLoop();
    if (loop && (this.time < loop.start || this.time >= loop.end)) {
      this.time = loop.start;
      this.beginAttempt(this.time);
    }

    while (this.playing) {
      const end = loop?.end ?? this.song.duration;
      const from = this.time;
      let target = Math.min(from + remaining, end);
      const next = this.mode === 'learn' ? this.pendingNotes()[0] : undefined;
      const blocked = !!next && next.time <= target + EPSILON;
      if (blocked) target = Math.max(from, next.time);

      for (const note of this.notes) {
        if (note.time < from - EPSILON || note.time > target + EPSILON) continue;
        if (loop && note.time >= loop.end - EPSILON) continue;
        if (this.sounded.has(note.id)) continue;
        if (this.mode === 'listen' || (this.hand !== 'both' && note.hand !== this.hand)) {
          sounding.push(note);
          this.sounded.add(note.id);
        }
      }
      this.time = target;
      if (this.mode === 'perform') {
        for (const note of this.pendingNotes()) {
          if (note.time + HIT_WINDOW_SECONDS < this.time - EPSILON) this.misses.add(note.id);
        }
      }
      if (blocked) return { sounding, finished: false };

      remaining -= target - from;
      if (this.time >= end - EPSILON) {
        if (loop) {
          this.time = loop.start;
          this.beginAttempt(this.time);
          if (remaining > EPSILON) continue;
          return { sounding, finished: false };
        }
        // A short final note can end before its entire timing window elapses.
        if (this.mode === 'perform') {
          for (const note of this.pendingNotes()) this.misses.add(note.id);
        }
        this.time = this.song.duration;
        this.playing = false;
        return { sounding, finished: true };
      }
      return { sounding, finished: false };
    }
    return { sounding, finished: false };
  }

  private pendingNotes(): Note[] {
    const loop = this.validLoop();
    return this.selectedNotes().filter((note) => note.time >= this.attemptStart - EPSILON
      && (!loop || (note.time >= loop.start - EPSILON && note.time < loop.end - EPSILON))
      && !this.hits.has(note.id) && !this.misses.has(note.id));
  }

  private beginAttempt(time: number): void {
    this.attemptStart = time;
    this.hits.clear();
    this.misses.clear();
    this.sounded.clear();
  }

  private validLoop(): { start: number; end: number } | null {
    if (!this.loop || !Number.isFinite(this.loop.start) || !Number.isFinite(this.loop.end)) return null;
    const start = Math.max(0, this.loop.start);
    const end = Math.min(this.song.duration, this.loop.end);
    return end - start > EPSILON ? { start, end } : null;
  }
}
