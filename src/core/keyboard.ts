export const FIXED_CODES = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon'];
export const GUIDED_CODES = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
export const keyLabel = (code: string) => code === 'Semicolon' ? ';' : code.replace('Key', '');
export const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);
export function pianoGeometry(min: number, max: number) {
  const pitches = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const whiteCount = pitches.filter(n => !isBlack(n)).length;
  let white = 0;
  return pitches.map(midi => {
    const black = isBlack(midi);
    const left = (black ? white - 0.32 : white) / whiteCount * 100;
    if (!black) white++;
    return { midi, black, left, width: (black ? 0.64 : 1) / whiteCount * 100 };
  });
}
export const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
