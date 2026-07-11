// THE OBSERVER — a dry, judgmental AI commentator who watches you play your
// own session and has opinions. Authored line pools with template slots,
// personalized from the SessionCard (goal, tasks, real quotes), voiced through
// the browser's built-in speechSynthesis (zero network, zero assets).
// V toggles the voice; lines always land in the transcript as ☏ entries.

const LS_VOICE = 'aiaio-voice';
const GLOBAL_GAP_S = 11;     // minimum seconds between remarks
const URGENT_GAP_S = 5;      // …unless something truly deserving happens
const EVENT_GAP_S = 45;      // minimum gap per event type (no repeat nagging)

interface ObserverContext {
  goal: string | null;
  sessionId: string;
  topError: string;
  tasksTotal: number;
  stability?: number;
}

/** everything the memory-lane roast can reference */
export interface RoastMeta {
  sessionId: string;
  harness: string | null;
  when: string | null;
  goal: string | null;
  topError: string;
  topErrorCount: number;
  compactions: number;
  tasksTotal: number;
  tasksCompleted: number;
  stability: number;
}

type Pool = string[];

/**
 * A persona pack: authored commentary (usually by the player's own agent)
 * that the Observer mixes with its built-in lines. Loaded at startup from
 * public/packs/observer.json when present. Lines may use the same {slot}
 * templates as built-in pools. See AGENTS.md for the authoring guide.
 */
export interface PersonaPack {
  name?: string;
  voice_hint?: string;              // substring to match a system TTS voice
  ambient?: string[];               // droppable at any calm moment
  lines?: Record<string, string[]>; // event-keyed pools (same keys as LINES, plus "start")
}

const PACK_MIX = 0.5;               // chance an authored pool wins over the built-in one

function pick(pool: Pool): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

function fill(line: string, slots: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (_, k) => String(slots[k] ?? ''));
}

// compositional run-start: opener × observation = hundreds of variants,
// so the line never goes stale
const START_OPENERS: Pool = [
  'Playback initiated.', 'Here we go.', 'Booting your past.', 'The session begins. Again.',
  'Cursor blinking. Fate undecided.', 'Attempt logged.', 'Replay armed.', 'Process spawned. Expectations managed.',
];
const START_OBSERVATIONS: Pool = [
  '{tasks} tasks. Historically, an optimistic number.',
  'Your mission: {goal}.',
  'I will be taking notes. I always take notes.',
  'Your errors have been expecting you.',
  'The wall is already awake. It is very patient.',
  'Stability {stab}. We both know what that means.',
  'Try to finish something this time.',
  'The {topError} errors send their regards.',
];

const LINES: Record<string, Pool> = {
  nuke: [
    'You detonated your own context window. Bold. The wall sends its regards.',
    'A context nuke. Twenty-five percent of your memory, gone, on purpose. I admire the honesty.',
    'That explosion was mostly aimed at yourself, statistically speaking.',
  ],
  nuke_2: [
    'A second nuke. The first one was a choice. This is a lifestyle.',
    'Two nukes. Your context window is now more of a suggestion.',
  ],
  nuke_3: [
    'Nuke number {n}. I have stopped logging these as anomalies.',
    '{n} nukes. At this point the wall is basically a co-author.',
  ],
  compaction_1: [
    'First compaction. The summary is fine. The summary is always fine.',
    'You have been summarized. Some of that was probably important.',
  ],
  compaction_many: [
    'Compaction number {n}. At this point your memory is a haiku.',
    'Compaction {n}. I would say I told you so, but you have forgotten that I did.',
    '{n} compactions. The wall is not chasing you. You are feeding it.',
  ],
  task_done: [
    '"{task}" shipped. Noting the date for the postmortem.',
    'One task down. The economy of this victory: questionable. The victory: real.',
    '"{task}" complete. Somewhere, a real version of you never finished this.',
    '"{task}" done. Do not check the acceptance criteria. Keep moving.',
    'Shipped. In this economy. Respect.',
  ],
  subagent_spawn_more: [
    'Another one. The burn rate is now a lifestyle brand.',
    'Two subagents. One of them is definitely updating its resume.',
  ],
  task_eaten: [
    'The wall ate "{task}". You were not using it anyway.',
    '"{task}" has been forgotten. Like it never happened. Because now it did not.',
  ],
  subagent_spawn: [
    'Delegating. The 900-token solution to a you-shaped problem.',
    'A subagent. Now there are two of you, and one is worse.',
  ],
  subagent_corrupted: [
    'Your subagent works for the errors now. A classic management story.',
    'The intern has been radicalized. This is why we do onboarding.',
  ],
  subagent_died: [
    'A moment of silence for {label}. Moment is over.',
    '{label} is gone. It burned sixteen tokens a second and died as it lived: briefly.',
  ],
  death: [
    'Exit code 137. The industry standard for "we do not talk about it".',
    'Process killed. The session, meanwhile, actually happened, and someone survived it.',
    'You died. In your defense, the level was your own fault.',
    'Terminated. The tasks send their regards. From the queue. Where they remain.',
    'Down you go. The wall did not even slow down to look.',
  ],
  death_repeat: [
    'That is death number {n} on this session. The errors are learning your name.',
    'Again. I have started a tally. It is not flattering.',
  ],
  win: [
    'Process exit zero. Statistically miraculous. Well played.',
    'You survived your own Tuesday. Most people never get the chance to say that.',
  ],
  win_perfect: [
    'Perfect clear. Every task. I have no notes. This is deeply uncomfortable for me.',
  ],
  moment_frustration: [
    'This is where you said "{text}". Growth since then: unverified.',
    'Ah, this part. "{text}". I remember. I remember everything. Unlike you.',
  ],
  update_bad: [
    'You installed an update and it made things worse. A rich tradition.',
    'The patch notes said "improvements". The patch notes lied. They always lie.',
    'Ah, the update gamble. The house won. The house is a changelog.',
  ],
  update_good: [
    'The update actually helped. Frame this moment.',
    'A net-positive patch. Statistically, you owe the universe one regression.',
    'Buffed. Enjoy it before the next minor version.',
  ],
  model_upgrade: [
    'New model. Bigger context. Same you, though. That is the variable nobody patches.',
    'Model upgraded. You can now remember your mistakes in higher resolution.',
    'A bigger context window. The wall just got a bigger appetite too. Kidding. Mostly.',
    'v{n}. They say the new one is smarter. They said that about the last one.',
  ],
  voluntary_compact: [
    'A voluntary compaction. Clean. Disciplined. Who are you and what did you do with the player.',
  ],
  wall_close: [
    'The forgetting is two hundred pixels away. Not a metaphor. Well. Also a metaphor.',
    'Wall status: extremely your problem.',
  ],
  idle: [
    'The tasks will not do themselves. That is the entire premise of you.',
    'I notice a lot of walking and very little shipping.',
  ],
  zap_think: [
    'Out of print statements. Even the debugger needs a moment.',
  ],
  perm_granted: [
    'You now have permission to delegate. The org chart trembles.',
    'Task tool granted. Somewhere, a smaller model just felt a chill.',
  ],
  cheer: [
    'Oh. A direct hit. I suppose violence was on the roadmap.',
    'Direct hit. Almost suspiciously competent.',
    'Nice shot. The error never saw the documentation coming.',
    'Clean kill. Your aim is better than your token discipline.',
    'Bullseye. If only the tasks died this easily.',
    'A direct hit. Noting it in the one column of this spreadsheet that is not red.',
  ],
};

// memory-lane roast parts (compositional fallback when no LLM is available)
const ROAST_SCENE: Pool = [
  'Welcome back to {when}. A {harness} session. The stated goal: "{goal}".',
  '{when}. {harness}. You walked in and typed: "{goal}". Brave.',
  'This one is from {when}, on {harness}. The mission, allegedly: "{goal}".',
];
const ROAST_HISTORY: Pool = [
  'What actually happened: {topError} ×{topCount}, {compactions} compactions, and {done} of {tasks} tasks shipped.',
  'The record shows {topCount} {topError} errors and {compactions} compactions. The tasks? {done} of {tasks}. I counted twice.',
  'History logged {topCount} counts of {topError} and a memory that compacted {compactions} times. Task completion: {done}/{tasks}.',
];
// BAD NEWS: a second personality for disasters. if the macOS novelty voice
// "Bad News" is installed it SINGS these as a funeral dirge, which is the
// funniest possible outcome; otherwise a pitched-down second voice fills in.
const BAD_NEWS_LINES: Pool = [
  'Bad news.',
  'That was load-bearing.',
  'The situation has developed. Negatively.',
  'Oh no.',
  'It is worse now.',
  'Condolences.',
];

const ROAST_STING: Pool = [
  'Anyway. Stability {stab}. Let us see if the rematch goes better.',
  'Tonight, you get to relive it. With weapons. Stability {stab}, for the record.',
  'The wall remembers, even if you do not. Good luck.',
  'You survived it once by closing the laptop. That will not work here.',
];

export class Observer {
  voiceOn = localStorage.getItem(LS_VOICE) !== '0';
  private sink: (line: string) => void = () => { /* wired by main */ };
  private captionSink: (speaker: 'observer' | 'bad news', text: string, active: boolean) => void = () => {};
  private speechStateSink: (active: boolean) => void = () => {};
  private activeCaption: { speaker: 'observer' | 'bad news'; text: string; startedAt: number } | null = null;
  private ctx: ObserverContext = { goal: null, sessionId: '?', topError: 'none', tasksTotal: 0 };
  private time = 0;
  private lastSpokeAt = -999;
  private lastByEvent = new Map<string, number>();
  private deathsBySession = new Map<string, number>();
  private lastProgressAt = 0;
  private wallWarned = false;
  private voice: SpeechSynthesisVoice | null = null;
  private badVoice: SpeechSynthesisVoice | null | undefined = undefined; // undefined = not yet resolved
  private lastBadNewsAt = -999;
  private nukeCount = 0;

  bindSink(sink: (line: string) => void): void {
    this.sink = sink;
  }

  bindCaptionSink(sink: (speaker: 'observer' | 'bad news', text: string, active: boolean) => void): void {
    this.captionSink = sink;
  }

  bindSpeechState(sink: (active: boolean) => void): void {
    this.speechStateSink = sink;
  }

  private cancelSpeech(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (this.activeCaption) this.captionSink(this.activeCaption.speaker, this.activeCaption.text, false);
    this.activeCaption = null;
    this.speechStateSink(false);
  }

  private wireSpeech(
    u: SpeechSynthesisUtterance, speaker: 'observer' | 'bad news', text: string, activateNow = false,
  ): void {
    const activate = () => {
      this.activeCaption = { speaker, text, startedAt: performance.now() };
      this.captionSink(speaker, text, true);
      this.speechStateSink(true);
    };
    if (activateNow) activate();
    u.onstart = activate;
    const done = () => {
      if (this.activeCaption?.speaker === speaker && this.activeCaption.text === text) {
        const remaining = 1800 - (performance.now() - this.activeCaption.startedAt);
        if (remaining > 0) {
          window.setTimeout(done, remaining);
          return;
        }
        this.captionSink(speaker, text, false);
        this.activeCaption = null;
        this.speechStateSink(false);
      }
    };
    u.onend = done;
    u.onerror = done;
    // Some browser/system-voice combinations omit end events. Never leave the
    // mix ducked or a stale subtitle pinned forever.
    window.setTimeout(done, Math.max(4000, Math.min(12000, text.length * 85)));
  }

  toggleVoice(): boolean {
    this.voiceOn = !this.voiceOn;
    localStorage.setItem(LS_VOICE, this.voiceOn ? '1' : '0');
    if (!this.voiceOn) this.cancelSpeech();
    return this.voiceOn;
  }

  onRunStart(ctx: ObserverContext): void {
    this.ctx = ctx;
    this.time = 0;
    this.lastSpokeAt = -999;
    this.lastByEvent.clear();
    this.lastProgressAt = 0;
    this.wallWarned = false;
    this.nukeCount = 0;
    // composed, not canned: opener × observation (persona packs can add observations)
    const startPool = this.packLines['start'] && Math.random() < PACK_MIX
      ? this.packLines['start'] : START_OBSERVATIONS;
    const line = fill(`${pick(START_OPENERS)} ${pick(startPool)}`, {
      goal: this.ctx.goal ?? 'unclear, honestly',
      session: this.ctx.sessionId.slice(0, 14),
      tasks: this.ctx.tasksTotal,
      stab: this.ctx.stability ?? '??',
      topError: this.ctx.topError,
    });
    this.lastSpokeAt = this.time;
    this.sink(`☏ observer: ${line}`);
    this.speak(line);
  }

  /** bespoke per-session one-liners written by the player's own agent (dev mode) */
  private sessionPack: string[] = [];

  setSessionPack(lines: string[]): void {
    this.sessionPack = lines.filter((l) => typeof l === 'string' && l.length > 4).slice(0, 12);
  }

  /** persona pack: authored pools that outlive any single session */
  private packLines: Record<string, Pool> = {};
  private packAmbient: string[] = [];
  private packVoiceHint: string | null = null;
  packName: string | null = null;

  loadPack(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const pack = raw as PersonaPack;
    const clean = (arr: unknown, cap: number): string[] =>
      (Array.isArray(arr) ? arr : [])
        .filter((l): l is string => typeof l === 'string' && l.trim().length >= 4)
        .map((l) => l.trim().slice(0, 140))
        .slice(0, cap);
    const lines: Record<string, Pool> = {};
    if (pack.lines && typeof pack.lines === 'object') {
      for (const key of Object.keys(pack.lines)) {
        if (key !== 'start' && !(key in LINES)) continue; // unknown events stay dead
        const pool = clean(pack.lines[key], 8);
        if (pool.length > 0) lines[key] = pool;
      }
    }
    const ambient = clean(pack.ambient, 16);
    if (Object.keys(lines).length === 0 && ambient.length === 0) return false;
    this.packLines = lines;
    this.packAmbient = ambient;
    this.packVoiceHint = typeof pack.voice_hint === 'string' ? pack.voice_hint.slice(0, 40) : null;
    this.packName = typeof pack.name === 'string' ? pack.name.slice(0, 40) : 'custom';
    return true;
  }

  /** the pre-game memory-lane roast (compositional; the LLM version replaces it when available) */
  briefingRoast(meta: RoastMeta): string[] {
    const slots = {
      when: meta.when ?? 'an undated day',
      harness: meta.harness ?? 'an unidentified harness',
      goal: (meta.goal ?? 'no recorded goal, which is off to a great start').slice(0, 90),
      topError: meta.topError,
      topCount: meta.topErrorCount,
      compactions: meta.compactions,
      done: meta.tasksCompleted,
      tasks: Math.max(meta.tasksTotal, meta.tasksCompleted),
      stab: meta.stability,
    };
    return [fill(pick(ROAST_SCENE), slots), fill(pick(ROAST_HISTORY), slots), fill(pick(ROAST_STING), slots)];
  }

  /** speak a multi-line roast as queued utterances (natural pauses between lines) */
  speakRoast(lines: string[]): void {
    if (!this.voiceOn || !('speechSynthesis' in window)) return;
    try {
      this.cancelSpeech();
      for (const line of lines) this.speakQueued(line);
    } catch { /* silence is also judgment */ }
  }

  private speakQueued(text: string): void {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = 1.04; u.pitch = 0.72; u.volume = 0.85;
    this.wireSpeech(u, 'observer', text);
    synth.speak(u);
  }

  /** Shift+V: cycle through the system's English voices; speaks a sample. */
  cycleVoice(): string {
    if (!('speechSynthesis' in window)) return 'no speech synthesis available';
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    if (voices.length === 0) return 'no voices loaded yet. try again in a second';
    const currentName = localStorage.getItem('aiaio-voice-name') ?? this.voice?.name ?? '';
    const idx = voices.findIndex((v) => v.name === currentName);
    this.voice = voices[(idx + 1) % voices.length];
    localStorage.setItem('aiaio-voice-name', this.voice.name);
    // sample it immediately, interrupting anything in-flight
    this.cancelSpeech();
    const wasOn = this.voiceOn;
    this.voiceOn = true;
    this.speak(`Voice check. I will be judging you as ${this.voice.name.replace(/\(.*\)/, '').trim()}.`);
    this.voiceOn = wasOn;
    return this.voice.name;
  }

  onEvent(type: string, data: Record<string, unknown>): void {
    switch (type) {
      case 'explosion':
        if (data.weapon === 'context_nuke') {
          this.nukeCount++;
          const pool = this.nukeCount >= 3 ? 'nuke_3' : this.nukeCount === 2 ? 'nuke_2' : 'nuke';
          // each escalation tier is its own gap key — repeats don't get muted,
          // they get judged. priority 3: self-nuking always deserves comment.
          this.remark(pool, { n: this.nukeCount }, 3);
        }
        break;
      case 'compaction': {
        const n = Number(data.n) || 1;
        this.remark(n >= 2 ? 'compaction_many' : 'compaction_1', { n }, 2);
        if (n >= 2) this.badNews();
        break;
      }
      case 'task_done':
        this.lastProgressAt = this.time;
        this.remark('task_done', { task: String(data.task ?? 'the task') }, 1);
        break;
      case 'work_tick':
        this.lastProgressAt = this.time;
        break;
      case 'task_eaten':
        this.remark('task_eaten', { task: String(data.task ?? 'a task') }, 2);
        this.badNews();
        break;
      case 'perm_granted':
        this.remark('perm_granted', {}, 2);
        break;
      case 'subagent_spawn':
        this.remark(Number(data.alive) >= 2 ? 'subagent_spawn_more' : 'subagent_spawn', {}, 1);
        break;
      case 'subagent_corrupted':
        this.remark('subagent_corrupted', {}, 2);
        this.badNews();
        break;
      case 'subagent_died':
        if (data.corrupted !== true) this.remark('subagent_died', { label: String(data.label ?? 'the subagent') }, 1);
        break;
      case 'death': {
        const n = (this.deathsBySession.get(this.ctx.sessionId) ?? 0) + 1;
        this.deathsBySession.set(this.ctx.sessionId, n);
        this.remark(n >= 2 ? 'death_repeat' : 'death', { n }, 3);
        break;
      }
      case 'win':
        this.remark(data.perfect === true ? 'win_perfect' : 'win', {}, 3);
        break;
      case 'moment':
        if (data.kind === 'frustration' && data.text) {
          this.remark('moment_frustration', { text: String(data.text).slice(0, 60) }, 1);
        }
        break;
      case 'update_install':
        this.remark(data.netBuff === false ? 'update_bad' : 'update_good', {}, 2);
        break;
      case 'model_upgrade':
        this.remark('model_upgrade', { n: String(data.model ?? '?') }, 2);
        break;
      case 'kill':
        // occasional sarcastic cheer — direct hits by the PLAYER only
        if (data.direct === true && data.by !== 'sub' && Math.random() < 0.3) {
          this.remark('cheer', {}, 1);
        }
        break;
      case 'award':
        // the game grants it; the observer delivers the eulogy
        if (typeof data.line === 'string') {
          this.lastSpokeAt = this.time;
          this.speak(data.line);
          this.badNews(true);
        }
        break;
      case 'voluntary_compact':
        this.remark('voluntary_compact', {}, 1);
        break;
    }
  }

  /** ambient observations — call once per frame with light state */
  tick(dt: number, state: { wallGap: number; tasksRemain: boolean; zapThink: number } | null): void {
    this.time += dt;
    if (!state) return;
    if (state.wallGap < 200 && !this.wallWarned) {
      this.wallWarned = true;
      this.remark('wall_close', {}, 1);
    }
    if (state.wallGap > 350) this.wallWarned = false;
    if (state.tasksRemain && this.time - this.lastProgressAt > 30) {
      this.lastProgressAt = this.time; // rearm
      this.remark('idle', {}, 0);
    }
    if (state.zapThink > 2.0) this.remark('zap_think', {}, 0);
  }

  private remark(event: string, slots: Record<string, string | number>, priority: number): void {
    const builtin = LINES[event];
    if (!builtin) return;
    const gap = priority >= 2 ? URGENT_GAP_S : GLOBAL_GAP_S;
    if (this.time - this.lastSpokeAt < gap && priority < 3) return;
    if (this.time - (this.lastByEvent.get(event) ?? -999) < EVENT_GAP_S) return;
    this.lastSpokeAt = this.time;
    this.lastByEvent.set(event, this.time);
    // ambient events sometimes draw from the bespoke pools instead: the
    // per-session pack (dev-mode LLM) and the persona pack's ambient lines
    const bespokePool = [...this.sessionPack, ...this.packAmbient];
    if (bespokePool.length > 0 && priority <= 1 && Math.random() < 0.35) {
      const bespoke = bespokePool[Math.floor(Math.random() * bespokePool.length)];
      this.sink(`☏ observer: ${bespoke}`);
      this.speak(bespoke);
      return;
    }
    // authored event pool competes with the built-in one
    const pool = this.packLines[event] && Math.random() < PACK_MIX ? this.packLines[event] : builtin;
    const line = fill(pick(pool), {
      ...slots,
      goal: this.ctx.goal ?? 'unclear, honestly',
      session: this.ctx.sessionId.slice(0, 14),
      tasks: this.ctx.tasksTotal,
    });
    this.sink(`☏ observer: ${line}`);
    this.speak(line);
  }

  /** the second personality: short disaster interjections in a different voice */
  private badNews(force = false): void {
    if (!force && this.time - this.lastBadNewsAt < 25) return;
    if (!force && Math.random() > 0.55) return;
    this.lastBadNewsAt = this.time;
    const line = pick(BAD_NEWS_LINES);
    this.sink(`☠ bad news: ${line}`); // the text judges you even on mute
    if (!this.voiceOn || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      if (this.badVoice === undefined) {
        const voices = synth.getVoices();
        // the macOS novelty voice "Bad News" literally sings a funeral dirge
        this.badVoice = voices.find((v) => /bad news/i.test(v.name))
          ?? voices.find((v) => /Organ|Cellos|Zarvox|Whisper|Trinoids/i.test(v.name))
          ?? voices.find((v) => v.lang.startsWith('en') && v.name !== this.voice?.name)
          ?? null;
      }
      const u = new SpeechSynthesisUtterance(line);
      if (this.badVoice) u.voice = this.badVoice;
      if (!this.badVoice || !/bad news/i.test(this.badVoice.name)) { u.pitch = 0.4; u.rate = 0.85; }
      u.volume = 0.9;
      this.wireSpeech(u, 'bad news', line, true);
      synth.speak(u); // queues after any observer line — the dirge waits its turn
    } catch { /* text judgment only */ }
  }

  private speak(text: string): void {
    if (!this.voiceOn || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      if (synth.speaking) return; // never talk over yourself; the text is in the transcript
      if (!this.voice) {
        const voices = synth.getVoices();
        const savedName = localStorage.getItem('aiaio-voice-name');
        const hint = this.packVoiceHint;
        this.voice = (savedName ? voices.find((v) => v.name === savedName) : undefined)
          // a manually chosen voice always wins; the pack's hint fills the default
          ?? (hint ? voices.find((v) => v.name.toLowerCase().includes(hint.toLowerCase())) : undefined)
          ?? voices.find((v) => /Premium|Enhanced/.test(v.name) && v.lang.startsWith('en'))
          ?? voices.find((v) => /Samantha|Daniel|Alex|Karen|Moira/.test(v.name))
          ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
      }
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = 1.04;
      u.pitch = 0.72; // dry
      u.volume = 0.85;
      this.wireSpeech(u, 'observer', text, true);
      synth.speak(u);
    } catch { /* no voice available — the transcript still judges you */ }
  }
}

export const observer = new Observer();
