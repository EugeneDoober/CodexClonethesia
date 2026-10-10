export type Hand = 'left' | 'right';
export type Note = { id: string; midi: number; time: number; duration: number; velocity: number; hand: Hand };
export type Song = { id: string; title: string; artist: string; bpm: number; duration: number; notes: Note[]; source: 'demo' | 'midi'; description: string };
export type PracticeHand = 'both' | Hand;
export type PlayMode = 'learn' | 'perform' | 'listen';
export type KeyLayout = 'guided' | 'fixed';
