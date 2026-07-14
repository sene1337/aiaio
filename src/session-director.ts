// The only compiler that turns a card plus a campaign overlay into a level.
// It is deliberately pure: no DOM, storage, or random global state.

import { CampaignEntry, CampaignRecipe, CombatModifiers, combatModifiers } from './campaign';
import { EnemyKind, ENEMY_DEFS, allocateSpawns, categoryToEnemy } from './enemies';
import { Rng } from './rng';
import { SessionCard } from './session';

export type EncounterOrigin = 'recorded' | 'observer';

export interface PlannedStation { x: number; taskIndex: number; }
export interface PlannedMoment { x: number; kind: string; text: string; }
export interface PlannedEncounter {
  x: number;
  kind: EnemyKind;
  sourceLine: string;
  origin: EncounterOrigin;
  observerLine?: string;
}
export interface PlannedCrate { x: number; kind: 'patch' | 'model'; }
export interface LevelPlan {
  width: number;
  stations: PlannedStation[];
  moments: PlannedMoment[];
  encounters: PlannedEncounter[];
  crates: PlannedCrate[];
  permissionTerminalX: number;
  combat: CombatModifiers;
}

export interface CompileOptions {
  width: number;
  entry?: CampaignEntry;
  recipe?: CampaignRecipe;
}

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const xOf = (width: number, fraction: number) => Math.round(width * clamp(fraction, 0.06, 0.94));

function claim(occupied: number[], candidate: number, width: number, spacing = 110): number {
  let x = clamp(candidate, 60, width - 80);
  for (let i = 0; i < 60 && occupied.some((other) => Math.abs(other - x) < spacing); i++) {
    x = Math.min(width - 80, x + spacing);
  }
  occupied.push(x);
  return x;
}

function observerLine(card: SessionCard, entry: CampaignEntry | undefined, i: number, variant: number, used: Set<string>): string {
  const subject = String(entry?.taskLabel || card.goal || card.tasks?.[0]?.name || 'the work').slice(0, 42);
  const when = String(card.when ?? '').slice(0, 10);
  const harness = String(card.harness ?? 'the harness');
  const templates = [
    `quiet around ${subject}. suspicious. here.`,
    `${subject} got comfortable. i corrected the pacing.`,
    `the transcript paused here. consequences did not.`,
    `a calm gap. i brought a counterargument.`,
    `nothing failed for a while. that felt historically inaccurate.`,
    `the log shows peace here. i show initiative.`,
    `${subject} was going suspiciously well. was.`,
    `this stretch had zero errors${when ? ` on ${when}` : ''}. i am correcting the record's mood, not its facts.`,
    `${harness} went quiet here. i do not trust quiet.`,
    `an uneventful gap. you were saving your mistakes for later. these are on me.`,
    `no recorded incidents here. these two are complimentary.`,
    `the session breathed here. briefly. you may not.`,
  ];
  const authored = entry?.observerLines?.[i]?.trim().slice(0, 120);
  if (authored && !used.has(authored)) { used.add(authored); return authored; }
  // Pick without replacement by taking a deterministic rotation. Campaign-authored
  // lines that repeat fall back to a unique built-in disclosure.
  for (let offset = 0; offset < templates.length; offset++) {
    const line = templates[(variant + i + offset) % templates.length];
    if (!used.has(line)) { used.add(line); return line; }
  }
  return templates[i % templates.length]; // unreachable with the three-injection cap
}

function scaledAllocation(base: number[], kinds: EnemyKind[], combat: CombatModifiers): number[] {
  const out = base.map((n) => Math.max(0, Math.min(combat.hostilePerTypeCap, Math.round(n * combat.hostileBudgetMultiplier))));
  let total = out.reduce((sum, n, index) => sum + (ENEMY_DEFS[kinds[index]].friendly ? 0 : n), 0);
  while (total > combat.hostileBudgetCap) {
    const index = out.findIndex((n, i) => n > 1 && !ENEMY_DEFS[kinds[i]].friendly);
    if (index < 0) break;
    out[index]--; total--;
  }
  return out;
}

export class SessionDirector {
  static compile(card: SessionCard, options: CompileOptions): LevelPlan {
    const { width, entry, recipe } = options;
    const combat = combatModifiers(recipe);
    const rng = new Rng(`${card.session_id ?? 'anonymous'}:${entry?.sourceDigest ?? 'raw'}:director`);
    const occupied: number[] = [];
    const stations: PlannedStation[] = [];
    const moments: PlannedMoment[] = [];
    const encounters: PlannedEncounter[] = [];
    const crates: PlannedCrate[] = [];
    const tasks = card.tasks ?? [];
    const encounterXs: number[] = [];
    // Preserve the source timeline anchor, but fan a burst into a small
    // traversable wave instead of stacking active bodies on one coordinate.
    const placeEncounter = (candidate: number): number => {
      for (let step = 0; step < 60; step++) {
        const signed = step === 0 ? 0 : Math.ceil(step / 2) * 56 * (step % 2 ? -1 : 1);
        const x = clamp(candidate + signed, width * 0.15, width * 0.95);
        if (!encounterXs.some((other) => Math.abs(other - x) < 48)) { encounterXs.push(x); return x; }
      }
      const fallback = clamp(candidate, width * 0.15, width * 0.95);
      encounterXs.push(fallback);
      return fallback;
    };

    for (let i = 0; i < tasks.length; i++) {
      const at = tasks[i].at;
      const fraction = typeof at === 'number' ? at : 0.14 + (i + 0.3) * (0.72 / Math.max(1, tasks.length));
      stations.push({ x: claim(occupied, xOf(width, fraction), width), taskIndex: i });
    }

    for (let i = 0; i < (card.moments ?? []).length; i++) {
      const moment = card.moments![i];
      if (!moment?.text) continue;
      const at = typeof moment.at === 'number' ? moment.at : rng.range(0.1, 0.9);
      moments.push({
        x: xOf(width, at), kind: String(moment.kind ?? 'note'),
        text: (entry?.momentText?.[i] || String(moment.text)).slice(0, 110),
      });
    }

    const errors = (card.errors ?? []).filter((error) => error && (error.category || error.type));
    const kinds = errors.map((error) => categoryToEnemy(error.category || error.type || 'unknown'));
    const allocation = scaledAllocation(allocateSpawns(errors.map((error) => ({
      category: error.category || error.type || 'unknown', count: Math.max(1, Math.floor(error.count ?? 1)),
    }))), kinds, combat);
    for (let errorIndex = 0; errorIndex < errors.length; errorIndex++) {
      const error = errors[errorIndex];
      const kind = kinds[errorIndex];
      const positions = (error.at ?? []).filter((at) => at > 0.12 && at < 0.96);
      const count = allocation[errorIndex];
      const provenance = error.sample
        ? `${error.category || error.type} ×${Math.max(1, Math.floor(error.count ?? 1))}: "${String(error.sample).slice(0, 70)}"`
        : `${error.category || error.type} ×${Math.max(1, Math.floor(error.count ?? 1))}`;
      for (let i = 0; i < count; i++) {
        const at = positions.length ? positions[i % positions.length] : rng.range(0.18, 0.92);
        encounters.push({ x: placeEncounter(xOf(width, at)), kind, sourceLine: provenance, origin: 'recorded' });
      }
    }

    // Recoveries remain source-derived and friendly. They are never Observer
    // inventions, even in Remix.
    const recoveryCount = Math.min(2, Math.ceil(Math.max(0, Number(card.recoveries ?? 0)) / 3));
    for (let i = 0; i < recoveryCount; i++) {
      encounters.push({ x: placeEncounter(xOf(width, rng.range(0.25, 0.9))), kind: 'recovery_sprite', sourceLine: `recoveries: ${card.recoveries} on record`, origin: 'recorded' });
    }

    const permissionTerminalX = claim(occupied, xOf(width, rng.range(0.09, 0.16)), width);
    const crateCount = Math.max(1, Math.min(4, Math.floor(Number(card.restarts ?? 0) + Number(card.model_switches ?? 0))));
    for (let i = 0; i < crateCount; i++) crates.push({ x: claim(occupied, xOf(width, rng.range(0.2, 0.88)), width), kind: 'patch' });
    crates.push({ x: claim(occupied, xOf(width, rng.range(0.5, 0.78)), width), kind: 'model' });

    // Quiet-gap pacing is the only permitted invented combat in a factual plan.
    // It is planned, capped, not near spawn/station/exit, and each encounter
    // retains origin metadata for diagnostics without a visual in-world badge.
    const anchors = [0.16 * width, permissionTerminalX, ...stations.map((s) => s.x), ...encounters.filter((e) => e.origin === 'recorded').map((e) => e.x), 0.9 * width]
      .sort((a, b) => a - b);
    const candidates: number[] = [];
    for (let i = 1; i < anchors.length; i++) {
      const left = anchors[i - 1]; const right = anchors[i];
      if (right - left >= Math.max(520, width * 0.18)) candidates.push(Math.round((left + right) / 2));
    }
    const injectionCount = entry?.pacing === false ? 0 : Math.min(combat.observerInjectionLimit, candidates.length);
    const observerLines = new Set<string>();
    const observerVariant = rng.int(0, 4);
    for (let i = 0; i < injectionCount; i++) {
      const x = candidates[i];
      if (x < width * 0.2 || x > width * 0.88 || stations.some((s) => Math.abs(s.x - x) < 180)) continue;
      encounters.push({
        x: placeEncounter(x), kind: i % 2 === 0 ? 'regression_splitter' : 'false_positive_sniper',
        sourceLine: 'Observer pacing encounter (not recorded in source)', origin: 'observer',
        observerLine: observerLine(card, entry, i, observerVariant, observerLines),
      });
    }

    return { width, stations, moments, encounters, crates, permissionTerminalX, combat };
  }
}

export function planIsReachable(plan: LevelPlan): boolean {
  const valid = (x: number) => x >= 60 && x <= plan.width - 80;
  return valid(plan.permissionTerminalX) && plan.stations.every((station) => valid(station.x)) &&
    plan.crates.every((crate) => valid(crate.x)) && plan.encounters.every((encounter) => valid(encounter.x)) &&
    plan.encounters.every((encounter, index) => plan.encounters.slice(0, index).every((other) => Math.abs(other.x - encounter.x) >= 48)) &&
    plan.encounters.filter((encounter) => encounter.origin === 'observer').every((encounter) =>
      encounter.x > plan.width * 0.2 && encounter.x < plan.width * 0.88 &&
      plan.stations.every((station) => Math.abs(station.x - encounter.x) >= 180));
}
