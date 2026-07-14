// SessionCard: the documented interchange format between real agent sessions and the game.
// All fields optional; everything degrades gracefully. Deterministic mapping:
// same card in -> same match out (seeded from session_id).

import { Rng, hashString } from './rng';
import { WeaponId } from './weapons';

export interface SessionCardTask {
  name?: string;
  work_units?: number;
  completed?: boolean;
  /** 0..1 position in the session timeline where this ask actually happened */
  at?: number;
}

export interface SessionCardError {
  type?: string;      // raw error type string from logs
  category?: string;  // normalized category, e.g. "timeout" | "hallucination" | ...
  count?: number;
  sample?: string;    // redacted, truncated sample line
  /** 0..1 timeline positions where occurrences actually happened */
  at?: number[];
}

/** a notable real line from the session, positioned on the timeline */
export interface SessionCardMoment {
  at?: number;
  kind?: string; // "win" | "frustration" | ...
  text?: string;
}

export interface SessionCard {
  session_id?: string;
  duration_ms?: number;
  message_count?: number;
  token_peak?: number;
  compaction_events?: number;
  tool_calls?: number;
  tasks?: SessionCardTask[];
  errors?: SessionCardError[];
  /** first substantive user ask — what the session was FOR */
  goal?: string;
  moments?: SessionCardMoment[];
  /** provenance (stamped by the scanner): which agent harness + date */
  harness?: string;
  when?: string;
  regressions?: number;
  restarts?: number;
  recoveries?: number;
  model_switches?: number;
  stability_score?: number; // 0..100, higher = more stable
}

/** The human-readable schema, shown in the in-game copyable panel. */
export const SESSION_CARD_SCHEMA = `{
  "session_id": "string        -> seeds the whole match (terrain, rolls)",
  "duration_ms": 0,          // session length -> arena width
  "message_count": 0,        // -> terrain jaggedness + arena size
  "token_peak": 0,           // -> context budget
  "compaction_events": 0,    // -> compaction threshold (more -> earlier amnesia)
  "tool_calls": 0,           // -> extra task work units / Distraction ammo
  "goal": "",                // first real user ask, shown as the mission
  "tasks": [{ "name": "", "work_units": 1, "completed": false, "at": 0.2 }],
                             //   ↳ "at" = real 0..1 timeline position (station placement)
  "errors": [{ "type": "", "category": "timeout", "count": 1, "sample": "", "at": [0.4] }],
                             //   ↳ "at" = where occurrences happened (enemy spawns)
  "moments": [{ "at": 0.5, "kind": "win", "text": "" }],
                             //   ↳ real session lines standing in the world (◇ markers)
  "regressions": 0,          // -> Regression Cluster ammo bonus
  "restarts": 0,             // -> update frequency
  "recoveries": 0,           // -> Recovery Shield ammo
  "model_switches": 0,       // -> update risk/reward skew
  "stability_score": 50      // 0-100 -> handicap buffs
}
// every field is optional — missing data degrades gracefully`;

/** One weapon slot generated from the card. */
export interface GeneratedWeapon {
  id: WeaponId;
  ammo: number;
  /** multiplicative damage stat roll from error counts, ~0.85..1.3 */
  statRoll: number;
  /** the real log line / signal this weapon came from */
  sourceLine: string;
}

export interface GeneratedTask {
  name: string;
  workUnits: number;
  /** real timeline position (0..1) if the card knows it */
  at?: number;
}

/** Whether a run is the player's history or an explicitly labeled fictional mode. */
export type SessionMode = 'real' | 'demo' | 'random' | 'fictional' | 'remix';

export interface LoadoutOptions {
  mode?: SessionMode;
}

/** Everything the match needs for one player, derived from one card. */
export interface AgentLoadout {
  label: string;
  seed: number;
  weapons: GeneratedWeapon[];
  tasks: GeneratedTask[];
  tokenBudget: number;
  compactionThreshold: number; // fraction of budget, e.g. 0.8
  stability: number;           // 0..100
  hardening: number;           // 0..1, prompt-injection resistance stat
  updateChance: number;        // per-round chance an update offer appears
  updateRiskSkew: number;      // -1..1, negative = riskier update table
  cardSummary: CardSummary;
}

/** Real numbers pulled from the card, quoted in briefing / handicap / recap text. */
export interface CardSummary {
  sessionId: string;
  topErrorCategory: string;
  topErrorCount: number;
  compactionEvents: number;
  tokenPeak: number;
  tasksCompleted: number;
  tasksTotal: number;
  restarts: number;
  modelSwitches: number;
  fromCard: boolean; // false when randomly generated
  mode: SessionMode;
}

// ---------------------------------------------------------------------------
// error category -> weapon archetype mapping (documented in README)
// ---------------------------------------------------------------------------

const CATEGORY_TO_WEAPON: Array<{ match: RegExp; id: WeaponId }> = [
  { match: /timeout|slow|latency|hang|stall/i, id: 'timeout_mortar' },
  { match: /halluc|wrong|fabricat|inject|misroute|routing/i, id: 'hallucination_missile' },
  { match: /regress|repeat|recurr|flaky/i, id: 'regression_cluster' },
  { match: /restart|crash|thrash|loop|oom_kill|panic/i, id: 'restart_thrash' },
  { match: /false.?positive|assert|confiden|lint/i, id: 'false_positive_laser' },
  { match: /context|token|compact|memory|oom/i, id: 'context_nuke' },
  { match: /recover|retry.?ok|heal|resume/i, id: 'recovery_shield' },
  { match: /tool|distract|interrupt|permission|denied/i, id: 'distraction_barrage' },
];

export function categoryToWeapon(category: string): WeaponId {
  for (const m of CATEGORY_TO_WEAPON) {
    if (m.match.test(category)) return m.id;
  }
  return 'unknown_error';
}

// ---------------------------------------------------------------------------
// deterministic card -> loadout mapping
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function loadoutFromCard(card: SessionCard, label: string, options: LoadoutOptions = {}): AgentLoadout {
  const mode = options.mode ?? 'real';
  // Remix remains grounded in its source card. Only explicitly fictional/demo
  // modes may use synthetic fallback content when a card is sparse.
  const allowsFallbackContent = mode === 'demo' || mode === 'random' || mode === 'fictional';
  const sessionId = card.session_id ?? 'anonymous-session';
  const seed = hashString(sessionId);
  const rng = new Rng(seed ^ 0xa1a10);

  // --- weapons from errors ---
  const weapons: GeneratedWeapon[] = [];
  const seen = new Map<WeaponId, GeneratedWeapon>();
  const errors = (card.errors ?? []).filter((e) => e && (e.category || e.type));
  for (const err of errors) {
    const cat = err.category || err.type || 'unknown';
    const id = categoryToWeapon(cat);
    const count = Math.max(1, Math.floor(err.count ?? 1));
    // ammo scales sub-linearly with error count so a 400-error session isn't 400 shots
    const ammo = clamp(1 + Math.floor(Math.sqrt(count)), 1, 12);
    const statRoll = clamp(0.85 + rng.next() * 0.25 + Math.min(count, 50) * 0.004, 0.85, 1.35);
    const source = err.sample
      ? `${cat} ×${count}: "${err.sample.slice(0, 80)}"`
      : `${cat} ×${count} (${err.type ?? 'no sample captured'})`;
    const existing = seen.get(id);
    if (existing) {
      existing.ammo = clamp(existing.ammo + ammo, 1, 15);
      existing.statRoll = Math.max(existing.statRoll, statRoll);
    } else {
      const w: GeneratedWeapon = { id, ammo, statRoll, sourceLine: source };
      seen.set(id, w);
      weapons.push(w);
    }
  }

  // regressions / recoveries / tool_calls sweeten specific weapons
  const regressions = Math.floor(card.regressions ?? 0);
  if (regressions > 0) {
    const w = seen.get('regression_cluster');
    if (w) w.ammo = clamp(w.ammo + Math.floor(Math.sqrt(regressions)), 1, 15);
    else {
      const g: GeneratedWeapon = {
        id: 'regression_cluster', ammo: clamp(Math.ceil(Math.sqrt(regressions)), 1, 8),
        statRoll: 1, sourceLine: `regressions: ${regressions} logged this session`,
      };
      seen.set('regression_cluster', g); weapons.push(g);
    }
  }
  const recoveries = Math.floor(card.recoveries ?? 0);
  if (recoveries > 0 && !seen.has('recovery_shield')) {
    const g: GeneratedWeapon = {
      id: 'recovery_shield', ammo: clamp(Math.ceil(recoveries / 2), 1, 6),
      statRoll: 1, sourceLine: `recoveries: bounced back ${recoveries}× after failures`,
    };
    seen.set('recovery_shield', g); weapons.push(g);
  }
  const toolCalls = Math.floor(card.tool_calls ?? 0);
  if (toolCalls >= 10 && !seen.has('distraction_barrage')) {
    const g: GeneratedWeapon = {
      id: 'distraction_barrage', ammo: clamp(Math.floor(toolCalls / 25) + 1, 1, 6),
      statRoll: 1, sourceLine: `tool_calls: ${toolCalls}. knows exactly how to interrupt an agent`,
    };
    seen.set('distraction_barrage', g); weapons.push(g);
  }

  // Demo/random modes need an authored baseline. Real sessions stay truthful:
  // a quiet error log receives only the standard-issue debug zapper in Run.
  if (allowsFallbackContent && !seen.has('timeout_mortar')) {
    weapons.unshift({
      id: 'timeout_mortar', ammo: 10, statRoll: 1,
      sourceLine: 'baseline issue. every agent has waited on something',
    });
  }
  // The same exception applies to the fictional flavor weapon.
  if (allowsFallbackContent && weapons.length < 2) {
    weapons.push({
      id: 'unknown_error', ammo: 4, statRoll: 1,
      sourceLine: 'uncategorized log noise. nobody knows what this does',
    });
  }

  // --- task queue from real tasks (fallback: synthesize from tool_calls) ---
  const tasks: GeneratedTask[] = [];
  const cardTasks = (card.tasks ?? []).filter((t) => t && t.name);
  for (const t of cardTasks.slice(0, 5)) {
    tasks.push({
      name: String(t.name).slice(0, 60),
      workUnits: clamp(Math.floor(t.work_units ?? 2), 1, 6),
      ...(typeof t.at === 'number' ? { at: clamp(t.at, 0, 1) } : {}),
    });
  }
  if (allowsFallbackContent && tasks.length === 0) {
    const n = clamp(3 + Math.floor(toolCalls / 40), 3, 5);
    const verbs = ['index', 'summarize', 'refactor', 'triage', 'deploy', 'lint', 'migrate', 'backfill'];
    const nouns = ['the inbox', 'session logs', 'the wiki', 'flaky tests', 'the pipeline', 'old branches', 'the changelog'];
    for (let i = 0; i < n; i++) {
      tasks.push({ name: `${rng.pick(verbs)} ${rng.pick(nouns)}`, workUnits: rng.int(2, 4) });
    }
  }

  // --- context budget + compaction threshold ---
  const tokenPeak = Math.floor(card.token_peak ?? 0);
  const tokenBudget = clamp(tokenPeak > 0 ? Math.round(tokenPeak / 12) : 10000, 6000, 20000);
  const compactions = Math.floor(card.compaction_events ?? 0);
  // real compaction history -> in-game amnesia fires earlier (lower threshold)
  const compactionThreshold = clamp(0.85 - compactions * 0.03, 0.6, 0.85);

  // --- updates from restarts + model_switches ---
  const restarts = Math.floor(card.restarts ?? 0);
  const modelSwitches = Math.floor(card.model_switches ?? 0);
  const updateChance = clamp(0.15 + restarts * 0.03, 0.15, 0.45);
  // many model switches = this agent is used to change = updates skew friendlier
  const updateRiskSkew = clamp(modelSwitches * 0.12 - restarts * 0.06, -0.8, 0.8);

  // --- stability + hardening ---
  const errorTotal = errors.reduce((s, e) => s + Math.max(1, Math.floor(e.count ?? 1)), 0);
  const stability = clamp(
    Math.round(card.stability_score ?? (80 - errorTotal * 1.5 - compactions * 4 - restarts * 3 + recoveries * 2)),
    5, 95,
  );
  const hardening = clamp(stability / 100 * 0.7 + (recoveries > 0 ? 0.15 : 0), 0.05, 0.85);

  const sortedErrs = [...errors].sort((a, b) => (b.count ?? 1) - (a.count ?? 1));
  const top = sortedErrs[0];

  return {
    label, seed, weapons, tasks, tokenBudget, compactionThreshold, stability, hardening,
    updateChance, updateRiskSkew,
    cardSummary: {
      sessionId,
      topErrorCategory: top ? (top.category || top.type || 'unknown') : 'none',
      topErrorCount: top ? Math.max(1, Math.floor(top.count ?? 1)) : 0,
      compactionEvents: compactions,
      tokenPeak,
      tasksCompleted: cardTasks.filter((t) => t.completed).length,
      tasksTotal: cardTasks.length,
      restarts,
      modelSwitches,
      fromCard: mode !== 'random',
      mode,
    },
  };
}

/** Terrain parameters derived from a card (or defaults). */
export interface TerrainParams {
  seed: number;
  width: number;
  height: number;
  jaggedness: number; // 0..1
}

export function terrainParamsFromCard(card: SessionCard | null): TerrainParams {
  const sessionId = card?.session_id ?? 'random-arena';
  const messages = Math.floor(card?.message_count ?? 120);
  const seed = hashString(sessionId + ':' + messages);
  // longer sessions -> bigger, jaggeder arenas
  const width = clamp(1400 + Math.floor(messages * 4), 1400, 3000);
  const height = 900;
  const jaggedness = clamp(0.25 + messages / 800, 0.25, 0.95);
  return { seed, width, height, jaggedness };
}

// ---------------------------------------------------------------------------
// validation + random generation
// ---------------------------------------------------------------------------

/** Parse arbitrary JSON text into a SessionCard, tolerating junk. Throws on non-JSON. */
export function parseSessionCard(text: string): SessionCard {
  const raw = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('SessionCard must be a JSON object');
  }
  const card: SessionCard = {};
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : undefined);
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v.slice(0, 200) : undefined);
  card.session_id = str(raw.session_id);
  card.duration_ms = num(raw.duration_ms);
  card.message_count = num(raw.message_count);
  card.token_peak = num(raw.token_peak);
  card.compaction_events = num(raw.compaction_events);
  card.tool_calls = num(raw.tool_calls);
  card.regressions = num(raw.regressions);
  card.restarts = num(raw.restarts);
  card.recoveries = num(raw.recoveries);
  card.model_switches = num(raw.model_switches);
  card.stability_score = num(raw.stability_score);
  card.goal = str(raw.goal);
  card.harness = str(raw.harness);
  card.when = str(raw.when);
  if (Array.isArray(raw.tasks)) {
    card.tasks = raw.tasks.slice(0, 12).map((t: any) => ({
      name: str(t?.name), work_units: num(t?.work_units), completed: t?.completed === true,
      at: typeof t?.at === 'number' && t.at >= 0 && t.at <= 1 ? t.at : undefined,
    }));
  }
  if (Array.isArray(raw.errors)) {
    card.errors = raw.errors.slice(0, 24).map((e: any) => ({
      type: str(e?.type), category: str(e?.category), count: num(e?.count), sample: str(e?.sample),
      at: Array.isArray(e?.at) ? e.at.filter((a: any) => typeof a === 'number' && a >= 0 && a <= 1).slice(0, 8) : undefined,
    }));
  }
  if (Array.isArray(raw.moments)) {
    card.moments = raw.moments.slice(0, 12).map((m: any) => ({
      at: typeof m?.at === 'number' && m.at >= 0 && m.at <= 1 ? m.at : undefined,
      kind: str(m?.kind), text: str(m?.text),
    })).filter((m: SessionCardMoment) => m.text);
  }
  return card;
}

/** Generate a random-but-plausible card when no file is loaded. */
export function randomCard(seedText: string): SessionCard {
  const rng = new Rng(seedText);
  const cats = ['timeout', 'hallucination', 'regression', 'restart', 'false_positive', 'tool_error', 'context_overflow', 'recovery'];
  const nErr = rng.int(2, 5);
  const errors: SessionCardError[] = [];
  const used = new Set<string>();
  for (let i = 0; i < nErr; i++) {
    const cat = rng.pick(cats);
    if (used.has(cat)) continue;
    used.add(cat);
    errors.push({ category: cat, type: cat.toUpperCase() + '_ERR', count: rng.int(1, 40) });
  }
  return {
    session_id: seedText,
    duration_ms: rng.int(5, 240) * 60000,
    message_count: rng.int(40, 400),
    token_peak: rng.int(60, 220) * 1000,
    compaction_events: rng.int(0, 5),
    tool_calls: rng.int(10, 200),
    regressions: rng.int(0, 8),
    restarts: rng.int(0, 4),
    recoveries: rng.int(0, 6),
    model_switches: rng.int(0, 3),
    stability_score: rng.int(20, 90),
    errors,
  };
}

// ---------------------------------------------------------------------------
// inline example cards — the game is fully playable with no file loaded
// ---------------------------------------------------------------------------

export const EXAMPLE_CLEAN: SessionCard = {
  session_id: 'clean-agent-7f3a',
  duration_ms: 2700000,
  message_count: 84,
  token_peak: 96000,
  compaction_events: 0,
  tool_calls: 61,
  tasks: [
    { name: 'triage the morning inbox', work_units: 2, completed: true },
    { name: 'compile weekly report', work_units: 3, completed: true },
    { name: 'update the device registry', work_units: 2, completed: true },
    { name: 'archive stale branches', work_units: 2, completed: false },
  ],
  errors: [
    { type: 'ETIMEDOUT', category: 'timeout', count: 3, sample: 'tool call web_fetch timed out after 30000ms' },
    { type: 'RETRY_OK', category: 'recovery', count: 5, sample: 'retry 2/3 succeeded, resuming task' },
    { type: 'LINT_FALSE_POSITIVE', category: 'false_positive', count: 2, sample: 'flagged import as unused; it was used' },
  ],
  regressions: 0,
  restarts: 0,
  recoveries: 5,
  model_switches: 1,
  stability_score: 86,
};

export const EXAMPLE_CHAOTIC: SessionCard = {
  session_id: 'chaotic-agent-b00m',
  duration_ms: 14400000,
  message_count: 412,
  token_peak: 198000,
  compaction_events: 6,
  tool_calls: 187,
  goal: 'the tests are flaky again and the migration is due today. fix both, please',
  tasks: [
    { name: 'fix the flaky test suite', work_units: 4, completed: false, at: 0.12 },
    { name: 'migrate the database', work_units: 5, completed: false, at: 0.34 },
    { name: 'answer the support queue', work_units: 3, completed: false, at: 0.58 },
    { name: 'write the postmortem', work_units: 2, completed: false, at: 0.76 },
    { name: 'remember what the task was', work_units: 2, completed: false, at: 0.9 },
  ],
  moments: [
    { at: 0.2, kind: 'frustration', text: 'why is test_auth failing when I did not touch auth' },
    { at: 0.41, kind: 'win', text: 'migration dry-run passed! running it for real now' },
    { at: 0.47, kind: 'frustration', text: 'the real migration is NOT the dry run apparently' },
    { at: 0.66, kind: 'frustration', text: 'still broken. still. broken.' },
    { at: 0.85, kind: 'win', text: 'ok it works. nobody touch anything.' },
  ],
  errors: [
    { type: 'HALLUCINATED_PATH', category: 'hallucination', count: 14, sample: 'edited src/utils/helpers.ts (file does not exist)' },
    { type: 'ETIMEDOUT', category: 'timeout', count: 22, sample: 'bash command killed by watchdog at 600s' },
    { type: 'REGRESSION', category: 'regression', count: 9, sample: 'test_auth passed on main, fails on branch. again.' },
    { type: 'AGENT_RESTART', category: 'restart', count: 4, sample: 'process exited 137, relaunching agent loop' },
    { type: 'CTX_OVERFLOW', category: 'context_overflow', count: 6, sample: 'context window exceeded; compacting conversation' },
    { type: 'TOOL_DENIED', category: 'tool_error', count: 11, sample: 'permission denied: rm -rf suggestion rejected by user' },
  ],
  regressions: 9,
  restarts: 4,
  recoveries: 2,
  model_switches: 3,
  stability_score: 24,
};
