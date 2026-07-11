// Synthesized chip/glitch audio. SFX and music share one AudioContext and a
// bus-based mix so peaks, speech ducking, and spatial cues behave coherently.

const LS_MUTE = 'aiaio-muted';

export type AudioBusName = 'music' | 'sfx' | 'ui';

class AudioMixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<AudioBusName, GainNode>> = {};
  private readonly levels: Record<AudioBusName, number> = { music: 0.11, sfx: 0.22, ui: 0.18 };
  muted = localStorage.getItem(LS_MUTE) === '1';
  private speechActive = false;

  ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { /* not yet allowed */ });
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
      const mix = this.ctx.createGain();
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      mix.connect(limiter).connect(this.master).connect(this.ctx.destination);
      for (const name of ['music', 'sfx', 'ui'] as AudioBusName[]) {
        const bus = this.ctx.createGain();
        bus.gain.value = this.levels[name];
        bus.connect(mix);
        this.buses[name] = bus;
      }
      return this.ctx;
    } catch {
      this.ctx = null;
      return null;
    }
  }

  context(): AudioContext | null { return this.ctx; }
  bus(name: AudioBusName): GainNode | null { return this.buses[name] ?? null; }

  connect(source: AudioNode, busName: AudioBusName, pan = 0): void {
    const bus = this.bus(busName);
    if (!bus || !this.ctx) return;
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(panner).connect(bus);
    } else {
      source.connect(bus);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem(LS_MUTE, muted ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.015);
  }

  setSpeechActive(active: boolean): void {
    if (this.speechActive === active) return;
    this.speechActive = active;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const music = this.bus('music');
    const sfx = this.bus('sfx');
    if (music) music.gain.setTargetAtTime(this.levels.music * (active ? 0.35 : 1), now, active ? 0.06 : 0.22);
    if (sfx) sfx.gain.setTargetAtTime(this.levels.sfx * (active ? 0.58 : 1), now, active ? 0.04 : 0.16);
  }
}

export const audioMixer = new AudioMixer();

class Audio {
  private noiseBuf: AudioBuffer | null = null;
  private lastHeartbeat = 0;

  private vary(freq: number, amount = 0.025): number {
    return freq * (1 + (Math.random() * 2 - 1) * amount);
  }

  ensure(): void {
    const ctx = audioMixer.ensure();
    if (!ctx || this.noiseBuf) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  toggleMute(): boolean { return audioMixer.toggleMute(); }
  setSpeechActive(active: boolean): void { audioMixer.setSpeechActive(active); }

  private tone(
    freq0: number, freq1: number, dur: number,
    type: OscillatorType = 'square', vol = 1, delay = 0, pan = 0,
    bus: AudioBusName = 'sfx',
  ): void {
    const ctx = audioMixer.context();
    if (!ctx || !audioMixer.bus(bus)) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    audioMixer.connect(gain, bus, pan);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, filterFreq: number, vol = 1, delay = 0, pan = 0): void {
    const ctx = audioMixer.context();
    if (!ctx || !this.noiseBuf) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(80, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain);
    audioMixer.connect(gain, 'sfx', pan);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  zap(pan = 0): void { this.tone(this.vary(900), this.vary(240), 0.08, 'square', 0.5, 0, pan); }

  fire(heavy: boolean, pan = 0): void {
    if (heavy) { this.noise(0.18, 1600, 0.7, 0, pan); this.tone(160, 60, 0.22, 'sine', 0.9, 0, pan); }
    else { this.tone(this.vary(500), this.vary(140), 0.12, 'sawtooth', 0.6, 0, pan); this.noise(0.08, 2400, 0.35, 0, pan); }
  }

  explode(size: number, pan = 0): void {
    const s = Math.min(1.6, 0.5 + size / 70);
    this.noise(0.28 * s, 900, 1, 0, pan);
    this.tone(95, 30, 0.3 * s, 'sine', 1, 0, pan);
  }

  laser(pan = 0): void {
    this.tone(1800, 1200, 0.16, 'sawtooth', 0.55, 0, pan);
    this.tone(2400, 300, 0.2, 'square', 0.25, 0.02, pan);
  }

  hurt(): void { this.tone(220, 70, 0.14, 'sawtooth', 0.8); this.noise(0.07, 1200, 0.5); }
  subKill(pan = 0): void { this.tone(740, 740, 0.05, 'triangle', 0.35, 0, pan); this.tone(988, 988, 0.06, 'triangle', 0.3, 0.06, pan); }

  kill(direct: boolean, pan = 0): void {
    this.tone(130, 42, 0.22, 'sine', 1, 0, pan);
    this.noise(0.12, 1400, 0.6, 0, pan);
    this.tone(660, 1320, 0.11, 'square', 0.4, 0.03, pan);
    if (direct) {
      this.tone(58, 26, 0.4, 'sine', 1.1, 0.02, pan);
      [880, 1175, 1568].forEach((f, i) => this.tone(f, f, 0.07, 'triangle', 0.45, 0.08 + i * 0.055, pan));
    }
  }

  compaction(): void {
    for (let i = 0; i < 6; i++) {
      this.tone(420 - i * 55, 380 - i * 58, 0.07, 'sawtooth', 0.8, i * 0.09, -0.45);
      this.noise(0.05, 3000, 0.5, i * 0.09 + 0.04, -0.45);
    }
    this.tone(90, 32, 0.5, 'sawtooth', 0.9, 0.55, -0.55);
    this.noise(0.6, 500, 0.8, 0.55, -0.55);
  }

  taskTick(): void { this.tone(660, 660, 0.05, 'square', 0.3, 0, 0, 'ui'); }
  taskDone(): void { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.1, 'square', 0.5, i * 0.09, 0, 'ui')); }
  taskEaten(): void { this.tone(392, 370, 0.18, 'square', 0.6); this.tone(311, 260, 0.3, 'square', 0.6, 0.18); this.noise(0.25, 700, 0.4, 0.3); }

  wallHeartbeat(): void {
    const now = performance.now();
    if (now - this.lastHeartbeat < 700) return;
    this.lastHeartbeat = now;
    this.tone(55, 40, 0.16, 'sine', 1, 0, -0.85);
  }

  threatWarning(kind: string, pan = 0): void {
    if (kind === 'sniper') {
      this.tone(1320, 1320, 0.055, 'square', 0.32, 0, pan, 'ui');
      this.tone(1760, 1760, 0.055, 'square', 0.28, 0.11, pan, 'ui');
    } else if (kind === 'timeout_mortar') {
      this.tone(240, 180, 0.16, 'triangle', 0.35, 0, pan, 'ui');
    } else {
      this.tone(920, 520, 0.08, 'square', 0.28, 0, pan, 'ui');
    }
  }

  update(good: boolean): void {
    if (good) [440, 554, 659, 880].forEach((f, i) => this.tone(f, f, 0.09, 'triangle', 0.5, i * 0.08, 0, 'ui'));
    else { this.tone(440, 430, 0.12, 'triangle', 0.5, 0, 0, 'ui'); this.tone(415, 340, 0.28, 'triangle', 0.6, 0.13, 0, 'ui'); }
  }

  pickup(): void { this.tone(880, 1320, 0.1, 'triangle', 0.5, 0, 0, 'ui'); }
  death(): void { this.tone(300, 40, 1.1, 'sawtooth', 0.9); this.noise(1, 600, 0.7, 0.1); [200, 150, 100].forEach((f, i) => this.tone(f, f * 0.8, 0.15, 'square', 0.6, 0.2 + i * 0.16)); }
  win(perfect: boolean): void {
    const base = [523, 659, 784, 1047, 1319];
    base.forEach((f, i) => this.tone(f, f, 0.14, 'square', 0.5, i * 0.11, 0, 'ui'));
    if (perfect) base.forEach((f, i) => this.tone(f * 1.5, f * 1.5, 0.12, 'triangle', 0.4, 0.6 + i * 0.09, 0, 'ui'));
  }
  select(): void { this.tone(1600, 1600, 0.03, 'square', 0.25, 0, 0, 'ui'); }
}

export const audio = new Audio();
