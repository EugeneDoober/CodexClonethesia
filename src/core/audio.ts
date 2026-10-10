type Voice = { oscillators: OscillatorNode[]; envelope: GainNode; started: number; released: boolean };
/** Self-contained piano-like synthesizer; no remote samples or API keys. */
export class PianoAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private voices = new Map<number, Voice>();
  private sequence = 0;
  private volume = 0.55;
  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * 0.22;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 5;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
    }
    if (this.context.state !== 'running') await this.context.resume();
  }
  setVolume(value: number) {
    this.volume = value;
    if (this.context && this.master) this.master.gain.setTargetAtTime(value * 0.22, this.context.currentTime, 0.02);
  }
  play(midi: number, duration?: number, velocity = 0.75): number {
    if (!this.context || !this.master) return -1;
    if (this.voices.size >= 64) this.release(this.voices.keys().next().value!);
    const ctx = this.context;
    const now = ctx.currentTime;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(velocity, now + 0.007);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, velocity * 0.28), now + 0.55);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 4);
    envelope.connect(this.master);
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const oscillators = [1, 2, 3, 4].map((partial, i) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * partial;
      const partialGain = ctx.createGain();
      partialGain.gain.value = [1, 0.32, 0.12, 0.045][i];
      oscillator.connect(partialGain);
      partialGain.connect(envelope);
      oscillator.start(now);
      return oscillator;
    });
    const id = this.sequence++;
    const voice = { oscillators, envelope, started: now, released: false };
    this.voices.set(id, voice);
    const end = now + Math.min(duration ?? 4, 12) + 0.25;
    if (duration !== undefined) {
      envelope.gain.setTargetAtTime(0.0001, now + Math.max(0.03, duration), 0.06);
    }
    for (const oscillator of oscillators) oscillator.stop(end);
    oscillators[0].onended = () => { this.voices.delete(id); envelope.disconnect(); };
    return id;
  }
  release(id: number) {
    const voice = this.voices.get(id);
    if (!voice || !this.context || voice.released) return;
    voice.released = true;
    const now = this.context.currentTime;
    voice.envelope.gain.cancelAndHoldAtTime(now);
    voice.envelope.gain.setTargetAtTime(0.0001, now, 0.045);
    for (const oscillator of voice.oscillators) { try { oscillator.stop(now + 0.25); } catch { /* already ended */ } }
  }
  stopAll() { for (const id of this.voices.keys()) this.release(id); }
}
