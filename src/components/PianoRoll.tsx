import { useMemo } from 'react';
import type { Note, PracticeHand, Song } from '../core/types';
import { keyLabel, noteName, pianoGeometry } from '../core/keyboard';

type Props = { song: Song; time: number; hand: PracticeHand; hits: Set<string>; held: Set<number>; automatic: Set<number>; mapping: Map<string, number>; waiting: Note[]; onDown: (midi: number, source: string) => void; onUp: (source: string) => void; labels: boolean; };
export function PianoRoll({ song, time, hand, hits, held, automatic, mapping, waiting, onDown, onUp, labels }: Props) {
  const [songMin, songMax] = useMemo(() => [Math.min(...song.notes.map(n => n.midi)), Math.max(...song.notes.map(n => n.midi))], [song]);
  const min = Math.max(0, Math.min(48, Math.floor(Math.min(songMin, ...mapping.values()) / 12) * 12));
  const max = Math.min(127, Math.max(83, Math.floor(Math.max(songMax, ...mapping.values()) / 12) * 12 + 11));
  const keys = useMemo(() => pianoGeometry(min, max), [min, max]);
  const keyByMidi = useMemo(() => new Map(keys.map(k => [k.midi, k])), [keys]);
  const labelByMidi = new Map([...mapping].map(([code, midi]) => [midi, keyLabel(code)]));
  const visible = song.notes.filter(n => n.time >= time - n.duration && n.time < time + 5.6);
  const waitingPitches = new Set(waiting.map(n => n.midi));
  return <div className="piano-surface">
    <div className="roll" aria-label="Falling piano notes">
      <div className="roll-shade" />
      {keys.filter(k => !k.black).map(k => <div key={k.midi} className={`lane ${k.midi % 12 === 0 ? 'octave-lane' : ''}`} style={{ left: `${k.left}%`, width: `${k.width}%` }} />)}
      {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="beat-line" style={{ bottom: `${((i - (time % 1) + 6) % 6) / 5.6 * 100}%` }} />)}
      <div className="roll-legend"><span><i className="dot blue" /> Left hand</span><span><i className="dot green" /> Right hand</span></div>
      {visible.map(note => {
        const key = keyByMidi.get(note.midi)!;
        const muted = hand !== 'both' && note.hand !== hand;
        return <div key={note.id} className={`falling-note ${note.hand} ${muted ? 'muted' : ''} ${hits.has(note.id) ? 'hit' : ''} ${waiting.some(n => n.id === note.id) ? 'expected' : ''}`} style={{ left: `calc(${key.left}% + 2px)`, width: `calc(${key.width}% - 4px)`, bottom: `${(note.time - time) / 5.6 * 100}%`, height: `${Math.max(5.5, note.duration / 5.6 * 100)}%` }}>
          {labels && <span>{labelByMidi.get(note.midi) || noteName(note.midi)}</span>}
        </div>;
      })}
      <div className="strike-line" />
    </div>
    <div className="piano-keys" role="group" aria-label="Playable piano keyboard">
      {keys.map(key => <button key={key.midi} type="button" aria-label={`Play ${noteName(key.midi)}`} className={`piano-key ${key.black ? 'black-key' : 'white-key'} ${held.has(key.midi) ? 'pressed' : ''} ${automatic.has(key.midi) ? 'automatic' : ''} ${waitingPitches.has(key.midi) ? 'waiting' : ''}`} style={{ left: `${key.left}%`, width: `${key.width}%` }}
        onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onDown(key.midi, `pointer-${e.pointerId}`); }} onPointerUp={e => onUp(`pointer-${e.pointerId}`)} onPointerCancel={e => onUp(`pointer-${e.pointerId}`)} onLostPointerCapture={e => onUp(`pointer-${e.pointerId}`)}>
        {labels && labelByMidi.has(key.midi) && <span className="binding">{labelByMidi.get(key.midi)}</span>}
        {!key.black && key.midi % 12 === 0 && <span className="pitch-label">{noteName(key.midi)}</span>}
      </button>)}
    </div>
  </div>;
}
