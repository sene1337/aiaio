// Synthesized chip/glitch audio — pure WebAudio oscillators + noise, zero
// assets, zero network. The soundtrack of a terminal having a bad day.
// M toggles mute (persisted). AudioContext resumes on first user gesture.

const LS_MUTE = 'aiaio-muted';

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = localStorage.getItem(LS_MUTE) === '1';
  private lastHeartbeat = 0;

  /** call on any user gesture; safe to call repeatedly */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { /* not yet allowed */ });
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(this.ctx.destination);
      // 1s of white noise, reused by every noise-based sound
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch { /* audio unavailable — play silent */ }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(LS_MUTE, this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.22;
    return this.muted;
  }

  private tone(
    freq0: number, freq1: number, dur: number,
    type: OscillatorType = 'square', vol = 1, delay = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, filterFreq: number, vol = 1, delay = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(80, t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  // --- game sounds ---

  zap(): void { this.tone(900, 240, 0.08, 'square', 0.5); }

  fire(heavy: boolean): void {
    if (heavy) { this.noise(0.18, 1600, 0.7); this.tone(160, 60, 0.22, 'sine', 0.9); }
    else { this.tone(500, 140, 0.12, 'sawtooth', 0.6); this.noise(0.08, 2400, 0.35); }
  }

  explode(size: number): void {
    const s = Math.min(1.6, 0.5 + size / 70);
    this.noise(0.28 * s, 900, 1);
    this.tone(95, 30, 0.3 * s, 'sine', 1);
  }

  laser(): void { this.tone(1800, 1200, 0.16, 'sawtooth', 0.55); this.tone(2400, 300, 0.2, 'square', 0.25, 0.02); }

  hurt(): void { this.tone(220, 70, 0.14, 'sawtooth', 0.8); this.noise(0.07, 1200, 0.5); }

  /** a subagent's kill: polite little chirp — the intern closed a ticket */
  subKill(): void {
    this.tone(740, 740, 0.05, 'triangle', 0.35);
    this.tone(988, 988, 0.06, 'triangle', 0.3, 0.06);
  }

  /** a kill deserves punctuation; a DIRECT-HIT kill deserves an exclamation */
  kill(direct: boolean): void {
    this.tone(130, 42, 0.22, 'sine', 1);          // thump
    this.noise(0.12, 1400, 0.6);
    this.tone(660, 1320, 0.11, 'square', 0.4, 0.03); // resolve-zing
    if (direct) {
      this.tone(58, 26, 0.4, 'sine', 1.1, 0.02);   // sub-drop
      [880, 1175, 1568].forEach((f, i) => this.tone(f, f, 0.07, 'triangle', 0.45, 0.08 + i * 0.055));
    }
  }

  compaction(): void {
    // the signature: a stuttering descent into static
    for (let i = 0; i < 6; i++) {
      this.tone(420 - i * 55, 380 - i * 58, 0.07, 'sawtooth', 0.8, i * 0.09);
      this.noise(0.05, 3000, 0.5, i * 0.09 + 0.04);
    }
    this.tone(90, 32, 0.5, 'sawtooth', 0.9, 0.55);
    this.noise(0.6, 500, 0.8, 0.55);
  }

  taskTick(): void { this.tone(660, 660, 0.05, 'square', 0.3); }

  taskDone(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, f, 0.1, 'square', 0.5, i * 0.09));
  }

  taskEaten(): void {
    this.tone(392, 370, 0.18, 'square', 0.6);
    this.tone(311, 260, 0.3, 'square', 0.6, 0.18);
    this.noise(0.25, 700, 0.4, 0.3);
  }

  wallHeartbeat(): void {
    // rate-limited low pulse for wall proximity
    const now = performance.now();
    if (now - this.lastHeartbeat < 700) return;
    this.lastHeartbeat = now;
    this.tone(55, 40, 0.16, 'sine', 1);
  }

  update(good: boolean): void {
    if (good) [440, 554, 659, 880].forEach((f, i) => this.tone(f, f, 0.09, 'triangle', 0.5, i * 0.08));
    else { this.tone(440, 430, 0.12, 'triangle', 0.5); this.tone(415, 340, 0.28, 'triangle', 0.6, 0.13); }
  }

  pickup(): void { this.tone(880, 1320, 0.1, 'triangle', 0.5); }

  death(): void {
    this.tone(300, 40, 1.1, 'sawtooth', 0.9);
    this.noise(1.0, 600, 0.7, 0.1);
    [200, 150, 100].forEach((f, i) => this.tone(f, f * 0.8, 0.15, 'square', 0.6, 0.2 + i * 0.16));
  }

  win(perfect: boolean): void {
    const base = [523, 659, 784, 1047, 1319];
    base.forEach((f, i) => this.tone(f, f, 0.14, 'square', 0.5, i * 0.11));
    if (perfect) base.forEach((f, i) => this.tone(f * 1.5, f * 1.5, 0.12, 'triangle', 0.4, 0.6 + i * 0.09));
  }

  select(): void { this.tone(1600, 1600, 0.03, 'square', 0.25); }
}

export const audio = new Audio();
