import type { Hand, Note, Song } from './types';

type PhraseNote = readonly [beat: number, midi: number, beats: number];

function makePiece(id: string, title: string, bpm: number, description: string, melody: PhraseNote[], accompaniment: PhraseNote[], totalBeats: number): Song {
  const secondsPerBeat = 60 / bpm;
  const notes: Note[] = [];
  const addPart = (part: PhraseNote[], hand: Hand) => {
    part.forEach(([beat, midi, beats], index) => notes.push({
      id: `${id}-${hand}-${index}`,
      midi,
      time: beat * secondsPerBeat,
      duration: beats * secondsPerBeat,
      velocity: hand === 'right' ? 0.76 : 0.5,
      hand,
    }));
  };
  addPart(melody, 'right');
  addPart(accompaniment, 'left');
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  return { id, title, artist: 'Lumina Originals', bpm, description, duration: totalBeats * secondsPerBeat, notes, source: 'demo' };
}

// Original compositions for this project, released under the repository license.
// A solitary first note gives a new player room to find their keyboard mapping.
const firstLightMelody: PhraseNote[] = [
  [0, 64, 1.5], [2, 67, 0.8], [3, 71, 0.8],
  [4, 69, 1.5], [6, 67, 0.8], [7, 66, 0.8],
  [8, 64, 1.8], [10, 62, 0.8], [11, 64, 0.8],
  [12, 67, 2.8],
  [16, 64, 0.8], [17, 67, 0.8], [18, 71, 1.7],
  [20, 74, 1.5], [22, 71, 0.8], [23, 69, 0.8],
  [24, 67, 1.5], [26, 66, 0.8], [27, 64, 0.8],
  [28, 66, 2.8],
  [32, 67, 1.5], [34, 71, 1.5],
  [36, 69, 0.8], [37, 67, 0.8], [38, 64, 1.6],
  [40, 62, 1.5], [42, 66, 0.8], [43, 69, 0.8],
  [44, 67, 2.8],
  [48, 71, 1.5], [50, 69, 0.8], [51, 67, 0.8],
  [52, 66, 1.5], [54, 62, 1.5],
  [56, 64, 1.5], [58, 67, 1.5],
  [60, 64, 3.8], [60, 71, 3.8],
];

const firstLightLeft: PhraseNote[] = [];
const firstLightChords = [[40, 47, 55], [36, 43, 52], [43, 50, 59], [38, 45, 54]];
for (let bar = 0; bar < 16; bar++) {
  const chord = firstLightChords[bar % firstLightChords.length];
  const start = bar * 4;
  if (bar === 0) {
    firstLightLeft.push([2, chord[0], 1.8]);
  } else if (bar < 8) {
    firstLightLeft.push([start, chord[0], 3.7], [start + 2, chord[1], 1.7]);
  } else if (bar === 15) {
    firstLightLeft.push([start, 40, 3.8], [start, 47, 3.8], [start, 55, 3.8]);
  } else {
    firstLightLeft.push([start, chord[0], 3.7], [start + 2, chord[1], 1.7], [start + 2, chord[2], 1.7]);
  }
}

const paperPlanesMelody: PhraseNote[] = [
  [0, 64, 0.8], [1, 67, 0.8], [2, 69, 1.6],
  [4, 67, 0.8], [5, 64, 0.8], [6, 62, 1.6],
  [8, 60, 0.8], [9, 64, 0.8], [10, 67, 0.8], [11, 72, 0.8],
  [12, 71, 1.6], [14, 67, 1.6],
  [16, 69, 0.8], [17, 72, 0.8], [18, 76, 1.6],
  [20, 74, 0.8], [21, 72, 0.8], [22, 69, 1.6],
  [24, 67, 0.8], [25, 64, 0.8], [26, 62, 0.8], [27, 64, 0.8],
  [28, 67, 2.8],
  [32, 64, 0.8], [33, 67, 0.8], [34, 72, 1.6],
  [36, 71, 0.8], [37, 69, 0.8], [38, 67, 1.6],
  [40, 65, 0.8], [41, 69, 0.8], [42, 72, 0.8], [43, 76, 0.8],
  [44, 74, 1.6], [46, 71, 1.6],
  [48, 72, 0.8], [49, 67, 0.8], [50, 64, 1.6],
  [52, 69, 0.8], [53, 65, 0.8], [54, 62, 1.6],
  [56, 67, 1.6], [58, 71, 1.6],
  [60, 64, 3.8], [60, 67, 3.8], [60, 72, 3.8],
];
const paperPlanesLeft: PhraseNote[] = [];
const paperPlanesChords = [[48, 55], [43, 50], [45, 52], [41, 48]];
for (let bar = 0; bar < 16; bar++) {
  const [root, fifth] = paperPlanesChords[bar % paperPlanesChords.length];
  if (bar === 15) {
    paperPlanesLeft.push([60, 48, 3.8], [60, 55, 3.8]);
  } else {
    if (bar > 0) paperPlanesLeft.push([bar * 4, root, 1.7]);
    paperPlanesLeft.push([bar * 4 + 2, fifth, 1.7]);
  }
}

export const demoSongs: Song[] = [
  makePiece('first-light', 'First Light', 72, 'A gentle original in E minor. Start with a single note, then let the left hand join in.', firstLightMelody, firstLightLeft, 64),
  makePiece('paper-planes', 'Paper Planes', 92, 'An airy original in C major. Follow a rising melody over a simple, alternating bass.', paperPlanesMelody, paperPlanesLeft, 64),
];
