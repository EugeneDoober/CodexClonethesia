import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, AudioLines, BookOpen, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, ExternalLink, FileMusic, FolderOpen, Github, GraduationCap, Headphones, Keyboard, ListMusic, LoaderCircle, Maximize2, Music2, Pause, Piano, Play, Repeat2, RotateCcw, Sparkles, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { PianoRoll } from './components/PianoRoll';
import { PianoAudio } from './core/audio';
import { demoSongs } from './core/demos';
import { PracticeEngine } from './core/engine';
import { FIXED_CODES, GUIDED_CODES, formatTime, keyLabel, noteName } from './core/keyboard';
import { parseMidiFile } from './core/midi';
import type { KeyLayout, PlayMode, PracticeHand, Song } from './core/types';

type Modal = 'library' | 'help' | 'reference' | null;
const REFERENCE = 'https://www.youtube.com/watch?v=Skzm9zUos00';
const NOTE_GUIDE = 'https://latouchemusicale.com/en/runaway-piano-notes-letters/';

export default function App() {
  const engine = useRef(new PracticeEngine(demoSongs[0])).current;
  const audio = useRef(new PianoAudio()).current;
  const [song, setSong] = useState(demoSongs[0]);
  const [imports, setImports] = useState<Song[]>([]);
  const [, redraw] = useState(0);
  const [mode, setModeState] = useState<PlayMode>('learn');
  const [hand, setHandState] = useState<PracticeHand>('both');
  const [layout, setLayout] = useState<KeyLayout>('guided');
  const [base, setBase] = useState(60);
  const [speed, setSpeed] = useState(0.75);
  const [volume, setVolume] = useState(0.55);
  const [labels, setLabels] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState<Set<number>>(new Set());
  const [automatic, setAutomatic] = useState<Set<number>>(new Set());
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(song.duration);
  const [focusMode, setFocusMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const practiceRef = useRef<HTMLDivElement>(null);
  const pressed = useRef(new Map<string, { midi: number; voice: number }>());
  const automaticUntil = useRef(new Map<number, number>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => redraw(n => n + 1), []);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5000);
  }, []);

  const stopVoices = useCallback(() => {
    audio.stopAll(); pressed.current.clear(); automaticUntil.current.clear();
    setHeld(new Set()); setAutomatic(new Set());
  }, [audio]);
  const enableAudio = useCallback(async () => {
    try { await audio.enable(); return true; }
    catch { notify('Audio could not start. Try again in a browser with Web Audio support.'); return false; }
  }, [audio, notify]);
  const resumeAccompaniment = useCallback(() => {
    const now = performance.now();
    for (const note of engine.activeNotes()) {
      if (note.time >= engine.time - 0.000001) continue;
      if (engine.mode !== 'listen' && (engine.hand === 'both' || note.hand === engine.hand)) continue;
      const remaining = (note.time + note.duration - engine.time) / engine.speed;
      audio.play(note.midi, remaining, note.velocity);
      automaticUntil.current.set(note.midi, now + remaining * 1000);
    }
  }, [audio, engine]);
  const togglePlay = useCallback(async () => {
    if (engine.playing) { engine.pause(); stopVoices(); }
    else {
      if (!(await enableAudio())) return;
      if (engine.time >= song.duration) engine.reset();
      engine.play();
      resumeAccompaniment();
    }
    refresh();
  }, [enableAudio, engine, refresh, resumeAccompaniment, song.duration, stopVoices]);

  useEffect(() => { engine.speed = speed; }, [engine, speed]);
  useEffect(() => { audio.setVolume(volume); }, [audio, volume]);
  useEffect(() => { engine.loop = loopEnabled ? { start: loopStart, end: loopEnd } : null; }, [engine, loopEnabled, loopStart, loopEnd]);
  useEffect(() => {
    let frame: number;
    let last = performance.now();
    let lastRender = 0;
    const animate = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (engine.playing) {
        const before = engine.time;
        const { sounding, finished } = engine.advance(delta);
        if (engine.time < before) stopVoices();
        for (const note of sounding) {
          audio.play(note.midi, note.duration / engine.speed, note.velocity);
          automaticUntil.current.set(note.midi, now + note.duration / engine.speed * 1000);
        }
        if (finished || now - lastRender > 25) {
          setAutomatic(new Set([...automaticUntil.current].filter(([, end]) => end > now).map(([midi]) => midi)));
          for (const [midi, end] of automaticUntil.current) if (end <= now) automaticUntil.current.delete(midi);
          refresh(); lastRender = now;
        }
      }
      if (!engine.playing && automaticUntil.current.size) {
        for (const [midi, end] of automaticUntil.current) if (end <= now) automaticUntil.current.delete(midi);
        setAutomatic(new Set(automaticUntil.current.keys()));
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const blur = () => { engine.pause(); stopVoices(); refresh(); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); };
  }, [audio, engine, refresh, stopVoices]);

  const expected = engine.expectedNotes();
  const waiting = engine.playing && mode === 'learn' ? engine.waitingNotes() : [];
  const phrase = Math.floor((expected[0]?.time ?? engine.time) / 8);
  const expectedPitches = expected.map(n => n.midi).sort((a, b) => a - b).join(',');
  const mapping = useMemo(() => {
    if (layout === 'fixed') return new Map(FIXED_CODES.map((code, index) => [code, base + index]));
    const required = expectedPitches.split(',').filter(Boolean).map(Number);
    const phraseNotes = song.notes.filter(n => n.time >= phrase * 8 && n.time < (phrase + 1) * 8 && (hand === 'both' || n.hand === hand));
    const pitches = [...new Set([...required, ...phraseNotes.map(n => n.midi)])].slice(0, GUIDED_CODES.length).sort((a, b) => a - b);
    return new Map(pitches.map((midi, index) => [GUIDED_CODES[index], midi]));
  }, [layout, base, expectedPitches, song, phrase, hand]);

  const noteDown = useCallback((midi: number, source: string) => {
    if (pressed.current.has(source)) return;
    // Schedule from the gesture; audio.enable() creates the context synchronously.
    void enableAudio();
    const voice = audio.play(midi);
    pressed.current.set(source, { midi, voice });
    setHeld(new Set([...pressed.current.values()].map(v => v.midi)));
    engine.press(midi); refresh();
  }, [audio, enableAudio, engine, refresh]);
  const noteUp = useCallback((source: string) => {
    const entry = pressed.current.get(source);
    if (entry) { audio.release(entry.voice); pressed.current.delete(source); }
    setHeld(new Set([...pressed.current.values()].map(v => v.midi)));
  }, [audio]);
  const seek = useCallback((time: number) => { stopVoices(); engine.seek(time); if (engine.playing) resumeAccompaniment(); refresh(); }, [engine, refresh, resumeAccompaniment, stopVoices]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Escape') { setModal(null); setFocusMode(false); return; }
      if (modal || event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((event.target as HTMLElement)?.tagName)) return;
      if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) void togglePlay(); return; }
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') { event.preventDefault(); seek(engine.time + (event.code === 'ArrowRight' ? 5 : -5)); return; }
      if (layout === 'fixed' && (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
        event.preventDefault(); if (!event.repeat) setBase(b => Math.max(12, Math.min(108, b + (event.code === 'BracketRight' ? 12 : -12)))); return;
      }
      const midi = mapping.get(event.code);
      if (midi !== undefined) { event.preventDefault(); if (!event.repeat) noteDown(midi, event.code); }
    };
    const up = (event: KeyboardEvent) => noteUp(event.code);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [engine, layout, mapping, modal, noteDown, noteUp, seek, togglePlay]);
  useEffect(() => {
    if (modal) { engine.pause(); stopVoices(); refresh(); }
  }, [engine, modal, refresh, stopVoices]);

  const selectSong = (next: Song) => {
    stopVoices(); engine.setSong(next); engine.setMode(mode); engine.setHand(hand);
    setSong(next); setLoopEnabled(false); setLoopStart(0); setLoopEnd(next.duration); setModal(null); refresh();
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const loaded = await parseMidiFile(file);
      setImports(old => [...old.filter(item => item.id !== loaded.id), loaded]); selectSong(loaded);
      notify(`“${loaded.title}” is ready. ${loaded.notes.length.toLocaleString()} notes to explore.`);
    } catch (error) { notify(error instanceof Error ? error.message : 'This MIDI file could not be opened.'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  const changeMode = (next: PlayMode) => { if (next === mode) return; stopVoices(); engine.setMode(next); setModeState(next); if (engine.playing) resumeAccompaniment(); refresh(); };
  const changeHand = (next: PracticeHand) => { if (next === hand) return; stopVoices(); engine.setHand(next); setHandState(next); if (engine.playing) resumeAccompaniment(); refresh(); };
  const setMarker = (marker: 'a' | 'b') => {
    if (marker === 'a') {
      if (engine.time >= song.duration - 0.3) { notify('Move earlier in the song to set the loop start.'); return; }
      setLoopStart(engine.time); if (loopEnd <= engine.time + 0.25) setLoopEnd(song.duration);
    } else {
      if (engine.time <= loopStart + 0.25) { notify('Move past point A before setting point B.'); return; }
      setLoopEnd(engine.time);
    }
  };
  const hint = waiting.length ? `Your turn · ${waiting.map(n => noteName(n.midi)).join(' + ')}` : engine.time >= song.duration ? 'Beautiful work. Ready for another round?' : engine.playing ? mode === 'listen' ? 'Listen closely. Let the melody sink in.' : 'Find your rhythm. You’ve got this.' : 'Take a breath. Press play when you’re ready.';

  return <div className={`app ${focusMode ? 'focus-mode' : ''}`} onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); void importFile(e.dataTransfer.files[0]); }}>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".mid,.midi,audio/midi,audio/x-midi" aria-label="Import MIDI file" onChange={e => void importFile(e.target.files?.[0])} />
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setModal(null); }}><span className="brand-mark"><Piano size={22} /></span>lumina<span className="brand-dot">.</span></a>
      <div className="workspace-label">YOUR MUSIC SPACE</div>
      <nav aria-label="Main navigation">
        <button className={modal !== 'library' ? 'nav-item selected' : 'nav-item'} onClick={() => setModal(null)}><Piano size={19} />Practice<span className="nav-indicator" /></button>
        <button className={modal === 'library' ? 'nav-item selected' : 'nav-item'} onClick={() => setModal('library')}><ListMusic size={19} />Song library<span className="nav-count">{demoSongs.length + imports.length}</span></button>
      </nav>
      <div className="sidebar-reference"><span className="tiny-label">ON YOUR WISHLIST</span><button onClick={() => setModal('reference')}><span className="mini-art"><AudioLines size={19} /></span><span><strong>Runaway</strong><small>Kanye West</small></span><ChevronRight size={15} /></button><span className="reference-status"><span /> Video arrangement</span></div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setModal('help')}><CircleHelp size={19} />How to play<ArrowRight size={15} /></button><div className="open-source"><span className="open-icon"><Github size={18} /></span><div>Music is for everyone.<a href="https://github.com/EugeneDoober/CodexClonethesia" target="_blank" rel="noreferrer">Free & open source <ExternalLink size={10} /></a></div></div><span className="version">LUMINA PIANO <span>v0.1.0</span></span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span className="breadcrumb-muted">Your workspace</span><ChevronRight size={13} /><span>Practice studio</span></div><div className="topbar-right"><span className="keyboard-status"><span />Keyboard ready</span><button className="icon-button help-button" title="How to play" aria-label="How to play" onClick={() => setModal('help')}><CircleHelp size={18} /></button><div className="user-avatar">You</div></div></header>
      <main>
        <section className="page-heading"><div><span className="eyebrow"><span />A LITTLE PRACTICE, EVERY DAY</span><h1>Find your flow<span>.</span></h1><p>Your favorite melodies. At your own pace.</p></div><button className="button secondary" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />}Import MIDI</button></section>
        <section className="song-strip" aria-label="Current song"><button className={`album-art ${song.id === demoSongs[1]?.id ? 'alternate' : ''}`} onClick={() => setModal('library')} aria-label="Choose a song"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sun" /><Music2 size={25} /></button><div className="song-title"><span className="tiny-label">ON THE PIANO</span><h2>{song.title}<span className="song-badge">{song.source === 'demo' ? 'Original study' : 'Your MIDI'}</span></h2><p>{song.artist}<span>•</span>{formatTime(song.duration)}<span>•</span>{Math.round(song.bpm)} BPM</p></div><button className="text-button change-song" onClick={() => setModal('library')}>Change song<ChevronDown size={15} /></button></section>
        <section className="studio" ref={practiceRef} aria-label="Piano practice studio">
          <div className="studio-toolbar"><div className="mode-switch" role="group" aria-label="Practice mode"><button className={mode === 'learn' ? 'active' : ''} onClick={() => changeMode('learn')}><GraduationCap size={16} />Learn</button><button className={mode === 'perform' ? 'active' : ''} onClick={() => changeMode('perform')}><Zap size={15} />Perform</button><button className={mode === 'listen' ? 'active' : ''} onClick={() => changeMode('listen')}><Headphones size={15} />Listen</button></div><div className="studio-toolbar-right"><label className="hand-select"><span>Hands</span><select aria-label="Practice hand" value={hand} onChange={e => changeHand(e.target.value as PracticeHand)}><option value="both">Both hands</option><option value="right">Right hand</option><option value="left">Left hand</option></select></label><span className="toolbar-divider" /><button className={`icon-button ${focusMode ? 'active-icon' : ''}`} title={focusMode ? 'Exit focus view' : 'Focus view'} aria-label={focusMode ? 'Exit focus view' : 'Focus view'} onClick={() => setFocusMode(v => !v)}><Maximize2 size={16} /></button></div></div>
          <PianoRoll song={song} time={engine.time} hand={hand} hits={engine.hits} held={held} automatic={automatic} mapping={mapping} waiting={waiting} onDown={noteDown} onUp={noteUp} labels={labels} />
          <div className={`learning-status ${waiting.length ? 'is-waiting' : ''}`} aria-live="polite"><span className="status-spark">{engine.time >= song.duration ? <CheckCheck size={14} /> : <Sparkles size={14} />}</span>{hint}<span className="status-detail">{mode === 'learn' ? 'The music waits for you' : mode === 'perform' ? 'Keep the rhythm' : 'Sit back & listen'}</span></div>
          <div className="transport"><div className="play-controls"><button className="icon-button restart" aria-label="Restart song" title={loopEnabled ? 'Restart loop section' : 'Restart song'} onClick={() => { stopVoices(); engine.reset(); refresh(); }}><RotateCcw size={18} /></button><button className="play-button" aria-label={engine.playing ? 'Pause' : 'Play'} onClick={() => void togglePlay()}>{engine.playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><span className="space-hint">space</span></div><span className="time-readout">{formatTime(engine.time)}</span><div className="timeline-wrap"><input type="range" aria-label="Song position" min="0" max={song.duration} step="0.01" value={engine.time} onChange={e => seek(Number(e.target.value))} style={{ '--progress': `${engine.time / song.duration * 100}%` } as React.CSSProperties} />{loopEnabled && <div className="loop-range" style={{ left: `${loopStart / song.duration * 100}%`, width: `${(loopEnd - loopStart) / song.duration * 100}%` }} />}</div><span className="time-readout duration">{formatTime(song.duration)}</span><div className="accuracy"><Check size={15} /><strong>{engine.hitCount + engine.missCount ? `${Math.round(engine.accuracy)}%` : '—'}</strong><span>accuracy</span></div></div>
        </section>
        <section className="control-panel" aria-label="Practice settings"><div className="speed-control"><div className="control-label"><Clock3 size={15} />Tempo</div><div className="stepper"><button aria-label="Decrease tempo" disabled={speed <= .25} onClick={() => setSpeed(s => Math.max(.25, Math.round((s - .25) * 100) / 100))}><span>−</span></button><span>{Math.round(speed * 100)}<small>%</small></span><button aria-label="Increase tempo" disabled={speed >= 1.5} onClick={() => setSpeed(s => Math.min(1.5, Math.round((s + .25) * 100) / 100))}>+</button></div></div><div className="control-separator" /><div className="loop-control"><button className={`control-label ${loopEnabled ? 'enabled' : ''}`} aria-pressed={loopEnabled} onClick={() => setLoopEnabled(v => !v)}><Repeat2 size={17} />Loop section<span className={`toggle ${loopEnabled ? 'on' : ''}`} /></button><div className="loop-markers"><button onClick={() => setMarker('a')} title="Set loop start at playhead" aria-label="Set loop start">A <span>{formatTime(loopStart)}</span></button><span>—</span><button onClick={() => setMarker('b')} title="Set loop end at playhead" aria-label="Set loop end">B <span>{formatTime(loopEnd)}</span></button></div></div><div className="control-separator" /><div className="keyboard-control"><div className="control-label"><Keyboard size={16} />Keyboard layout</div><select aria-label="Keyboard layout" value={layout} onChange={e => { stopVoices(); setLayout(e.target.value as KeyLayout); }}><option value="guided">Guided keys</option><option value="fixed">Piano keys</option></select></div><div className="control-separator" /><div className="volume-control"><button className="icon-button" title={volume ? 'Mute' : 'Unmute'} aria-label={volume ? 'Mute' : 'Unmute'} onClick={() => setVolume(v => v ? 0 : .55)}>{volume ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><input type="range" aria-label="Volume" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))} style={{ '--progress': `${volume * 100}%` } as React.CSSProperties} /></div></section>
        <div className="keyboard-footer"><span><Keyboard size={13} />{layout === 'guided' ? 'Follow the letters on the notes. Keys adapt to each phrase.' : 'A–; play the piano. W E T Y U O P are black keys.'}</span><div>{layout === 'fixed' && <div className="octave-control"><button aria-label="Lower octave" disabled={base <= 12} onClick={() => setBase(v => Math.max(12, v - 12))}><ChevronLeft size={13} /></button><span>{noteName(base)}–{noteName(base + 16)}</span><button aria-label="Higher octave" disabled={base >= 108} onClick={() => setBase(v => Math.min(108, v + 12))}><ChevronRight size={13} /></button></div>}<button className="label-toggle" aria-pressed={labels} onClick={() => setLabels(v => !v)}><span className={`checkbox ${labels ? 'checked' : ''}`}>{labels && <Check size={10} />}</span>Key labels</button></div></div>
        <section className="bottom-cards"><article className="tip-card"><span className="tip-icon"><GraduationCap size={22} /></span><div><span className="tiny-label">SMALL STEPS, GREAT MUSIC</span><h3>One note at a time.</h3><p>In Learn mode, the song pauses until you play the right notes.<br className="desktop-break" /> No rush. Just you and the piano.</p></div><button className="round-arrow" aria-label="Learn how to play" onClick={() => setModal('help')}><ArrowRight size={17} /></button></article><button className="import-card" onClick={() => inputRef.current?.click()} disabled={busy}><span className="import-icon"><FileMusic size={24} /></span><span><strong>Make it your playlist.</strong><small>Drop a MIDI file here, or browse files.</small><span className="file-types">.MID <span>·</span> .MIDI</span></span><ArrowRight size={18} /></button></section>
        <footer className="page-footer"><span>Built for the joy of playing.</span><span><span className="dot green" />All music stays in your browser</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Music2 size={17} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>}
    {modal && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}><ModalContent modal={modal} onClose={() => setModal(null)} song={song} songs={[...demoSongs, ...imports]} onSelect={selectSong} onImport={() => inputRef.current?.click()} mapping={mapping} /></div>}
  </div>;
}

function ModalContent({ modal, onClose, song, songs, onSelect, onImport, mapping }: { modal: Exclude<Modal, null>; onClose: () => void; song: Song; songs: Song[]; onSelect: (song: Song) => void; onImport: () => void; mapping: Map<string, number> }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    dialog?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex="0"]')].filter(el => !(el as HTMLButtonElement).disabled);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener('keydown', trap);
    return () => { dialog?.removeEventListener('keydown', trap); previous?.focus(); };
  }, []);
  return <div className={`modal ${modal === 'help' ? 'help-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialogRef} tabIndex={-1}><button className="modal-close icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>
    {modal === 'library' ? <><span className="modal-symbol"><ListMusic size={25} /></span><span className="eyebrow">YOUR SOUNDTRACK</span><h2 id="modal-title">A melody for every mood.</h2><p>Start with an original study, or bring a song of your own.</p><div className="library-list">{songs.map((entry, i) => <button key={`${entry.id}-${i}`} onClick={() => onSelect(entry)} className={song.id === entry.id ? 'current' : ''}><span className={`library-art art-${i % 2}`}><Music2 size={23} /></span><span><strong>{entry.title}</strong><small>{entry.artist} · {formatTime(entry.duration)} · {Math.round(entry.bpm)} BPM</small></span><span className="library-type">{entry.source === 'demo' ? 'Original' : 'MIDI'}</span>{entry.id === song.id ? <Check size={18} /> : <Play size={17} />}</button>)}</div><button className="button primary wide" onClick={onImport}><FolderOpen size={17} />Open a MIDI file</button><div className="modal-note">MIDI files contain playable notes. Audio files and video links need a MIDI transcription first. Imported songs stay in this tab.</div></> : modal === 'reference' ? <><span className="modal-symbol reference-symbol"><AudioLines size={27} /></span><span className="eyebrow">YOUR VIDEO REFERENCE</span><h2 id="modal-title">Let’s learn Runaway.</h2><p>Kanye West · Your selected piano arrangement</p><div className="reference-box"><Music2 size={22} /><div><strong>Bring the exact arrangement to your piano.</strong><p>Your video and note-letter guide are saved below. Import a matching MIDI to play the arrangement’s pitches, chords, and timing. The included studies are original practice music.</p></div></div><a className="button secondary wide" href={REFERENCE} target="_blank" rel="noreferrer"><ExternalLink size={16} />Open your YouTube reference</a><a className="button secondary wide" href={NOTE_GUIDE} target="_blank" rel="noreferrer"><BookOpen size={16} />Open the Runaway note guide</a><button className="button primary wide" onClick={onImport}><ArrowDownToLine size={17} />Import the arrangement’s MIDI</button><div className="modal-note">The video’s exact notes have not been transcribed yet. Any standard .mid or .midi arrangement can be opened here.</div></> : <><span className="modal-symbol"><BookOpen size={25} /></span><span className="eyebrow">WELCOME TO YOUR PIANO</span><h2 id="modal-title">You already have the keys.</h2><p>Your computer keyboard is your instrument. Here’s how to begin.</p><div className="help-grid"><div><GraduationCap size={21} /><strong>Learn at your pace</strong><p>Press play. When a note reaches the piano, press its letter. Chords wait for every note; you can enter them one at a time.</p></div><div><Zap size={20} /><strong>Find your rhythm</strong><p>Perform keeps time and scores your timing. Listen plays both hands so you can hear the melody first.</p></div><div><Keyboard size={21} /><strong>Choose your keys</strong><p>Guided keys adapt to each phrase. Piano keys use a fixed chromatic layout; [ and ] change octaves. You can also click or tap the piano.</p></div><div><Repeat2 size={21} /><strong>Make a tricky part easy</strong><p>Slow down the tempo. Move the playhead and set A and B to mark a section, then turn Loop on. Practice one hand at a time.</p></div></div><div className="current-bindings"><span className="tiny-label">YOUR CURRENT KEYS</span><div>{[...mapping].map(([code, midi]) => <span key={code}><kbd>{keyLabel(code)}</kbd><small>{noteName(midi)}</small></span>)}</div></div><div className="shortcut-row"><span><kbd>space</kbd> Play / pause</span><span><kbd>←</kbd><kbd>→</kbd> Seek 5 seconds</span><span><kbd>esc</kbd> Close</span></div><button className="button primary wide" onClick={onClose}>Let’s play<ArrowRight size={17} /></button></>}
  </div>;
}
