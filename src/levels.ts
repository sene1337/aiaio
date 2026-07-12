// The campaign layer: computable difficulty (we wrote the generation formula,
// so we don't estimate — we calculate), arcade-legible ranks, and persistent
// progression keyed by session stem (stable across rescans).

export interface LevelEntry {
  file: string;
  session_id: string;
  /** first real ask or first extracted task, stamped by the local scanner */
  goal?: string;
  harness?: string;
  when?: string;
  errors: number;
  enemies?: number;
  tasks: number;
  stability: number | null;
  messages: number;
  mtime?: number;
  token_peak?: number | null;
  compactions?: number;
  work?: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0–100, mirroring the actual level-generation math */
export function difficulty(e: LevelEntry): number {
  const enemies = typeof e.enemies === 'number'
    ? e.enemies
    : e.errors > 0 ? Math.max(4, Math.min(30, Math.round(4 + 4.5 * Math.log2(1 + e.errors / 6)))) : 0;
  const width = Math.max(2400, Math.min(6000, 2400 + (e.messages ?? 120) * 7));
  const density = enemies / (width / 1000); // hostiles per 1000px of timeline
  const budget = Math.max(6000, Math.min(20000, e.token_peak ? Math.round(e.token_peak / 12) : 10000));
  const threshold = Math.max(0.6, Math.min(0.85, 0.85 - (e.compactions ?? 0) * 0.03));
  const runway = budget * threshold; // tokens until the first involuntary surge
  const work = typeof e.work === 'number' && e.work > 0 ? e.work : e.tasks * 2.5;

  const dEnemies = clamp01(enemies / 30);
  const dDensity = clamp01(density / 9);
  const dContext = clamp01((10000 - runway) / (10000 - 3600));
  const dWork = clamp01(work / 18);
  const dLength = clamp01((width - 2400) / 3600);

  return Math.round(100 * (
    0.32 * dEnemies + 0.22 * dDensity + 0.22 * dContext + 0.14 * dWork + 0.10 * dLength
  ));
}

export interface Tier { index: number; name: string; min: number }

export const TIERS: Tier[] = [
  { index: 0, name: 'tier-1: onboarding', min: 0 },
  { index: 1, name: 'tier-2: daily-driver', min: 25 },
  { index: 2, name: 'tier-3: incident-response', min: 42 },
  { index: 3, name: 'tier-4: production-outage', min: 58 },
  { index: 4, name: 'tier-5: the-forgetting', min: 74 },
];

export function tierOf(diff: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (diff >= tier.min) t = tier;
  return t;
}

// ---------------------------------------------------------------------------
// ranks — milestone-legible, arcade tradition: S is reserved for perfection
// ---------------------------------------------------------------------------

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

/**
 * Campaign outcomes are intentionally separate. Reaching the exit is a
 * survival; recovering the historical session requires completed real work;
 * perfect is the full recovery. Demo/random runs never provide real units.
 */
export interface CampaignOutcome {
  survived: boolean;
  recovered: boolean;
  perfect: boolean;
}

export function campaignOutcome(
  survived: boolean, realTaskUnits: number, recoveredUnits: number, completedTasks: number,
): CampaignOutcome {
  const hasRealTasks = realTaskUnits > 0;
  const recovered = survived && hasRealTasks && completedTasks > 0 &&
    recoveredUnits >= Math.ceil(realTaskUnits / 2);
  return {
    survived,
    recovered,
    perfect: survived && hasRealTasks && recoveredUnits >= realTaskUnits,
  };
}

export function computeRank(outcome: CampaignOutcome, workFrac: number): Rank {
  if (outcome.perfect) return 'S';
  if (outcome.recovered) return 'A';
  if (outcome.survived) return 'B';
  if (workFrac >= 0.5) return 'C';
  return 'D';
}

export const RANK_COLORS: Record<Rank, string> = {
  S: '#7ee787', A: '#6cb6ff', B: '#dedad2', C: '#e3b341', D: '#f47067',
};

// ---------------------------------------------------------------------------
// persistent progress — keyed by session STEM so rescans (which change the
// content-hash suffix) don't orphan your clears
// ---------------------------------------------------------------------------

const LS_PROGRESS = 'aiaio-progress';

export interface LevelProgress {
  rank: Rank;
  bestScore: number;
  plays: number;
  lastPlayed: string; // ISO date
  survived: boolean;
  recovered: boolean;
  perfect: boolean;
}

export function stemOf(sessionId: string): string {
  return sessionId.replace(/-[0-9a-f]{8}(-2)*$/, '');
}

// memoized: the vault calls getProgress thousands of times per render (M-2);
// invalidated on writes here and on cross-tab storage events (M-6)
let progressCache: Record<string, LevelProgress> | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LS_PROGRESS) progressCache = null;
  });
}

function loadProgress(fresh = false): Record<string, LevelProgress> {
  if (progressCache && !fresh) return progressCache;
  try { progressCache = JSON.parse(localStorage.getItem(LS_PROGRESS) ?? '{}'); } catch { progressCache = {}; }
  return progressCache!;
}

export function getProgress(sessionId: string): LevelProgress | null {
  return loadProgress()[stemOf(sessionId)] ?? null;
}

const RANK_ORDER: Rank[] = ['D', 'C', 'B', 'A', 'S'];

/** v2.4 stored only ranks. A/S prove meaningful work; B was exit-only. */
function hadLegacyRecovery(p: LevelProgress): boolean {
  return p.recovered ?? (p.rank === 'S' || p.rank === 'A');
}

function hadLegacySurvival(p: LevelProgress): boolean {
  return p.survived ?? (p.rank === 'S' || p.rank === 'A' || p.rank === 'B');
}

function hadLegacyPerfect(p: LevelProgress): boolean {
  return p.perfect ?? p.rank === 'S';
}

/** record a finished run; returns flags for the recap ("NEW BEST", rank-up) */
export function recordResult(
  sessionId: string, rank: Rank, score: number, outcome: CampaignOutcome,
): { newBest: boolean; rankUp: boolean; prev: LevelProgress | null } {
  const all = loadProgress(true); // fresh read: merge with any other tab's writes
  const key = stemOf(sessionId);
  const prev = all[key] ?? null;
  const rankUp = !prev || RANK_ORDER.indexOf(rank) > RANK_ORDER.indexOf(prev.rank);
  const newBest = !prev || score > prev.bestScore;
  all[key] = {
    rank: rankUp || !prev ? rank : prev.rank,
    bestScore: Math.max(score, prev?.bestScore ?? 0),
    plays: (prev?.plays ?? 0) + 1,
    lastPlayed: new Date().toISOString().slice(0, 10),
    survived: outcome.survived || (prev ? hadLegacySurvival(prev) : false),
    recovered: outcome.recovered || (prev ? hadLegacyRecovery(prev) : false),
    perfect: outcome.perfect || (prev ? hadLegacyPerfect(prev) : false),
  };
  try { localStorage.setItem(LS_PROGRESS, JSON.stringify(all)); } catch { /* storage full */ }
  progressCache = all;
  return { newBest, rankUp, prev };
}

/** Campaign credit requires exit plus meaningful real-task recovery. */
export function isCleared(p: LevelProgress | null): boolean {
  return p !== null && hadLegacyRecovery(p);
}

export function isSurvived(p: LevelProgress | null): boolean {
  return p !== null && hadLegacySurvival(p);
}

export function isPerfect(p: LevelProgress | null): boolean {
  return p !== null && hadLegacyPerfect(p);
}

/** tier N+1 unlocks when 2 levels of tier N are cleared (tier 1 always open) */
export function unlockedTiers(entries: LevelEntry[]): boolean[] {
  const clearedByTier = TIERS.map(() => 0);
  for (const e of entries) {
    const t = tierOf(difficulty(e));
    if (isCleared(getProgress(e.session_id))) clearedByTier[t.index]++;
  }
  const unlocked = TIERS.map(() => false);
  unlocked[0] = true;
  for (let i = 1; i < TIERS.length; i++) {
    unlocked[i] = unlocked[i - 1] && clearedByTier[i - 1] >= 2;
  }
  return unlocked;
}
