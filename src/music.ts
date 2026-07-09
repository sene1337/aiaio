// Generative ambient music — pure WebAudio, no assets, seeded per session.
// A warm detuned pad cycles a gentle progression while sparse pentatonic plucks
// echo through a feedback delay. One continuous `tension` parameter (wall
// proximity, context pressure, being inside the forgetting) morphs everything:
// the filter darkens, plucks turn minor and sparse, detune creeps in, and a low
// dread-drone rises until — inside the wall — it's mostly static and heartbeat.

const LS_MUTE = 'aiaio-muted'; // shared with sfx: M mutes the whole soundscape

// A-minor-ish palette. calm: Am - F - C - G (pop-ambient warmth)
const CHORDS: number[][] = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
// tense: Am - Bdim-ish - E-phrygian shade
const CHORDS_TENSE: number[][] = [
  [57, 60, 64],
  [59, 62, 65],
  [52, 53, 59],
  [57, 58, 64],
];
const PLUCK_SCALE_CALM = [57, 60, 62, 64, 67, 69, 72, 76];  // A minor pentatonic spread
const PLUCK_SCALE_TENSE = [57, 58, 60, 64, 65, 69, 70];     // phrygian shade

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private timer: number | null = null;
  private nextBarTime = 0;
  private nextBeatTime = 0;
  private chordIndex = 0;
  private lastNote = 4;
  private muted = localStorage.getItem(LS_MUTE) === '1';
  /** 0 = safe, 1 = the wall is chewing on you */
  tension = 0;
  inside = false;
  private seedCounter = 1;

  /** call on a user gesture; safe to call repeatedly */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { /* not yet */ });
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.11; // music sits under the sfx
      this.master.connect(this.ctx.destination);

      // shared echo: feedback delay for the plucks
      const delay = this.ctx.createDelay(1.5);
      delay.delayTime.value = 0.42;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.38;
      delay.connect(feedback).connect(delay);
      delay.connect(this.master);
      this.delaySend = this.ctx.createGain();
      this.delaySend.gain.value = 0.5;
      this.delaySend.connect(delay);

      // pad low-pass — tension closes it down
      this.padFilter = this.ctx.createBiquadFilter();
      this.padFilter.type = 'lowpass';
      this.padFilter.frequency.value = 900;
      this.padFilter.connect(this.master);

      // the dread drone — silent until tension rises
      this.droneOsc = this.ctx.createOscillator();
      this.droneOsc.type = 'sawtooth';
      this.droneOsc.frequency.value = midiHz(33); // low A
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0;
      const droneFilter = this.ctx.createBiquadFilter();
      droneFilter.type = 'lowpass';
      droneFilter.frequency.value = 160;
      this.droneOsc.connect(droneFilter).connect(this.droneGain).connect(this.master);
      this.droneOsc.start();

      this.nextBarTime = this.ctx.currentTime + 0.1;
      this.nextBeatTime = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 120);
    } catch { /* no audio — the game stays silent and fine */ }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.11;
  }

  /** cheap deterministic-ish rand for musical choices */
  private rand(): number {
    this.seedCounter = (this.seedCounter * 1103515245 + 12345) & 0x7fffffff;
    return this.seedCounter / 0x7fffffff;
  }

  private schedule(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    const t = this.tension;

    // continuous morphs
    if (this.padFilter) this.padFilter.frequency.setTargetAtTime(900 - t * 620, now, 0.5);
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(t * t * 0.5 + (this.inside ? 0.25 : 0), now, 0.8);
    if (this.droneOsc) this.droneOsc.detune.setTargetAtTime(this.inside ? Math.sin(now * 2) * 40 : 0, now, 0.3);

    // pad: one chord per 4s bar
    while (this.nextBarTime < now + 0.3) {
      const chords = t > 0.55 ? CHORDS_TENSE : CHORDS;
      const chord = chords[this.chordIndex % chords.length];
      this.chordIndex++;
      if (!this.inside) this.playPad(chord, this.nextBarTime, 4.6, t);
      this.nextBarTime += 4;
    }
    // plucks: chances per half-beat; calm = song-like sparse, tense = urgent or absent
    while (this.nextBeatTime < now + 0.3) {
      const density = this.inside ? 0.08 : 0.34 - t * 0.14;
      if (this.rand() < density) {
        const scale = t > 0.5 ? PLUCK_SCALE_TENSE : PLUCK_SCALE_CALM;
        // melodic random walk, ±2 steps, occasionally leaping
        const stepJump = this.rand() < 0.15 ? 4 : 2;
        this.lastNote = Math.max(0, Math.min(scale.length - 1,
          this.lastNote + Math.round((this.rand() - 0.5) * 2 * stepJump)));
        this.playPluck(scale[this.lastNote], this.nextBeatTime, t);
      }
      this.nextBeatTime += t > 0.6 ? 0.375 : 0.5; // pressure quickens the pulse
    }
  }

  private playPad(chord: number[], when: number, dur: number, tension: number): void {
    if (!this.ctx || !this.padFilter) return;
    for (const note of chord) {
      for (const detune of [-4 - tension * 14, 4 + tension * 14]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midiHz(note - 12);
        osc.detune.value = detune;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(0.05, when + 1.4);
        g.gain.setValueAtTime(0.05, when + dur - 1.6);
        g.gain.linearRampToValueAtTime(0, when + dur);
        osc.connect(g).connect(this.padFilter);
        osc.start(when);
        osc.stop(when + dur + 0.1);
      }
    }
  }

  private playPluck(note: number, when: number, tension: number): void {
    if (!this.ctx || !this.delaySend || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = tension > 0.7 ? 'square' : 'triangle';
    osc.frequency.value = midiHz(note);
    osc.detune.value = (this.rand() - 0.5) * tension * 30;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.09, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 1.1);
    osc.connect(g);
    g.connect(this.master);
    g.connect(this.delaySend);
    osc.start(when);
    osc.stop(when + 1.2);
  }

  stop(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
  }
}

export const music = new Music();
