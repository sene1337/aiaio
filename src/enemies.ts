// Enemies ARE your errors. Each error category from the SessionCard spawns a
// distinct creature at points along the session timeline — the level is
// populated by what actually went wrong.

export type EnemyKind =
  | 'timeout_blob'        // timeout      — tanky lobber, shots land late
  | 'hallucination_ghost' // hallucination — phases, teleports, touch damage
  | 'regression_splitter' // regression   — splits into two minis on death
  | 'restart_crawler'     // restart      — comes back once after you kill it
  | 'false_positive_sniper' // false_positive — telegraphed laser, confidently misses sometimes
  | 'tool_turret'         // tool_error   — interrupt bolts knock you off your task
  | 'overflow_emitter'    // context_overflow — accelerates the wall of forgetting while alive
  | 'recovery_sprite';    // recovery     — FRIENDLY: heals/shields you on touch

export interface EnemyDef {
  kind: EnemyKind;
  name: string;       // kebab name shown as its label
  glyph: string;
  hp: number;
  touchDamage: number;
  color: string;
  friendly: boolean;
  flavor: string;     // briefing roster line
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  timeout_blob: {
    kind: 'timeout_blob', name: 'timeout-blob', glyph: '⏱', hp: 34, touchDamage: 8,
    color: '#e3b341', friendly: false,
    flavor: 'tanky, slow, lobs shots that detonate late — exactly when you stopped worrying',
  },
  hallucination_ghost: {
    kind: 'hallucination_ghost', name: 'hallucination-ghost', glyph: '👻', hp: 16, touchDamage: 12,
    color: '#c792ea', friendly: false,
    flavor: 'phases in and out, teleports, is absolutely sure it exists',
  },
  regression_splitter: {
    kind: 'regression_splitter', name: 'regression-splitter', glyph: '☢', hp: 22, touchDamage: 9,
    color: '#f47067', friendly: false,
    flavor: 'kill it and two smaller ones appear. passed on main, though',
  },
  restart_crawler: {
    kind: 'restart_crawler', name: 'restart-crawler', glyph: '🔁', hp: 18, touchDamage: 8,
    color: '#6cb6ff', friendly: false,
    flavor: 'exit 137 → relaunch. dies once for free',
  },
  false_positive_sniper: {
    kind: 'false_positive_sniper', name: 'false-positive-sniper', glyph: '⚡', hp: 14, touchDamage: 6,
    color: '#f47067', friendly: false,
    flavor: 'telegraphs a laser with 100% confidence and ~70% accuracy',
  },
  tool_turret: {
    kind: 'tool_turret', name: 'tool-turret', glyph: '🔧', hp: 26, touchDamage: 6,
    color: '#ff9440', friendly: false,
    flavor: 'fires interrupt bolts — get hit while working and you lose task progress',
  },
  overflow_emitter: {
    kind: 'overflow_emitter', name: 'overflow-emitter', glyph: '📈', hp: 30, touchDamage: 10,
    color: '#f47067', friendly: false,
    flavor: 'PRIORITY TARGET: while alive nearby, the wall of forgetting advances 60% faster',
  },
  recovery_sprite: {
    kind: 'recovery_sprite', name: 'recovery-sprite', glyph: '➕', hp: 1, touchDamage: 0,
    color: '#7ee787', friendly: true,
    flavor: 'friendly. retry 2/3 succeeded — touch it for hp/shield',
  },
};

/** error category (same regexes as weapons) -> enemy kind */
const CATEGORY_TO_ENEMY: Array<{ match: RegExp; kind: EnemyKind }> = [
  { match: /timeout|slow|latency|hang|stall/i, kind: 'timeout_blob' },
  { match: /halluc|wrong|fabricat|inject|misroute|routing/i, kind: 'hallucination_ghost' },
  { match: /regress|repeat|recurr|flaky/i, kind: 'regression_splitter' },
  { match: /restart|crash|thrash|loop|oom_kill|panic/i, kind: 'restart_crawler' },
  { match: /false.?positive|assert|confiden|lint/i, kind: 'false_positive_sniper' },
  { match: /context|token|compact|memory|oom/i, kind: 'overflow_emitter' },
  { match: /recover|retry.?ok|heal|resume/i, kind: 'recovery_sprite' },
  { match: /tool|distract|interrupt|permission|denied/i, kind: 'tool_turret' },
];

export function categoryToEnemy(category: string): EnemyKind {
  for (const m of CATEGORY_TO_ENEMY) {
    if (m.match.test(category)) return m.kind;
  }
  return 'regression_splitter'; // unknown errors regress; it's tradition
}

/**
 * Spawn allocation with a real difficulty RAMP (playtest finding: √count capped
 * at 5/category saturates by ~25 errors, making levels bimodal easy/hard).
 * Hostile enemies come from a global budget on a log curve of total errors,
 * distributed proportionally (per-category cap 8, min 1). Friendly recovery
 * spawns keep the old gentle √ formula.
 * NOTE: scripts/scan-sessions.mjs duplicates the budget curve for the gallery
 * display — keep them in sync.
 */
export function allocateSpawns(
  errors: Array<{ category: string; count: number }>,
): number[] {
  const hostileIdx = errors.map((e, i) => ({ ...e, i, kind: categoryToEnemy(e.category) }))
    .filter((e) => !ENEMY_DEFS[e.kind].friendly);
  const out = errors.map((e) => {
    const kind = categoryToEnemy(e.category);
    return ENEMY_DEFS[kind].friendly ? Math.max(1, Math.min(4, Math.ceil(Math.sqrt(e.count)))) : 0;
  });
  const total = hostileIdx.reduce((s, e) => s + Math.max(1, e.count), 0);
  if (total === 0) return out;
  const budget = Math.max(4, Math.min(30, Math.round(4 + 4.5 * Math.log2(1 + total / 6))));
  // proportional allocation: min 1, cap 8 per category
  let allocated = 0;
  for (const e of hostileIdx) {
    const n = Math.max(1, Math.min(8, Math.round((Math.max(1, e.count) / total) * budget)));
    out[e.i] = n;
    allocated += n;
  }
  // trim overshoot from the biggest allocations; top up undershoot the same way
  const byAlloc = () => hostileIdx.slice().sort((a, b) => out[b.i] - out[a.i]);
  while (allocated > budget) {
    const target = byAlloc().find((e) => out[e.i] > 1);
    if (!target) break;
    out[target.i]--; allocated--;
  }
  while (allocated < budget) {
    const target = byAlloc().reverse().find((e) => out[e.i] < 8);
    if (!target) break;
    out[target.i]++; allocated++;
  }
  return out;
}

/** live enemy instance */
export interface Enemy {
  def: EnemyDef;
  x: number; y: number;
  vx: number; vy: number;
  hp: number;
  /** seconds until next attack/behavior beat */
  cooldown: number;
  /** hallucination phase timer / sniper telegraph timer */
  stateTimer: number;
  /** sniper: locked target position while telegraphing */
  aimX: number; aimY: number;
  telegraphing: boolean;
  /** restart_crawler: has it used its free respawn */
  respawnUsed: boolean;
  spawnX: number;
  /** regression minis don't split again */
  mini: boolean;
  /** the real log line this enemy came from */
  sourceLine: string;
  dead: boolean;
  /** run-time until which this enemy is stunned (distraction barrage) */
  stunnedUntil: number;
}

export function makeEnemy(kind: EnemyKind, x: number, y: number, sourceLine: string, mini = false): Enemy {
  const def = ENEMY_DEFS[kind];
  return {
    def, x, y, vx: 0, vy: 0,
    hp: mini ? Math.ceil(def.hp / 2) : def.hp,
    cooldown: 1.2, stateTimer: 0, aimX: 0, aimY: 0, telegraphing: false,
    respawnUsed: false, spawnX: x, mini, sourceLine, dead: false, stunnedUntil: 0,
  };
}
