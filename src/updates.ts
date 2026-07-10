// The Update Gamble — "⬆ UPDATE AVAILABLE". Spend a turn to install; roll a
// buff OR a nerf, delivered as patch-note comedy. Leaders avoid it; the player
// who is behind gambles.

import { Rng } from './rng';
import { WeaponId } from './weapons';

export interface UpdateEffect {
  /** patch-note line shown to the player */
  note: string;
  /** true if this roll was net-positive */
  buff: boolean;
  apply: (target: UpdateTarget) => void;
}

/** the mutable knobs an update can touch on a player */
export interface UpdateTarget {
  aimJitter: number;          // degrees of random error added to every shot
  damageMult: number;
  tokenCostMult: number;
  compactionThreshold: number;
  shield: number;
  unlockWeapon: WeaponId | null; // set by the update; game grants it
}

interface RollDef {
  buffNote: string;
  nerfNote: string;
  buff: (t: UpdateTarget, rng: Rng) => void;
  nerf: (t: UpdateTarget, rng: Rng) => void;
}

const ROLLS: RollDef[] = [
  {
    buffNote: 'fixed: aim assist no longer off-by-one (accuracy improved)',
    nerfNote: 'known issue: targeting reticle now drifts slightly left. wontfix.',
    buff: (t) => { t.aimJitter = Math.max(0, t.aimJitter - 2.5); },
    nerf: (t, rng) => { t.aimJitter += rng.range(1.5, 3.5); },
  },
  {
    buffNote: 'perf: warheads 20% more enthusiastic',
    nerfNote: 'regression: damage output nerfed by an intern refactor',
    buff: (t) => { t.damageMult *= 1.2; },
    nerf: (t) => { t.damageMult *= 0.85; },
  },
  {
    buffNote: 'optimized token usage: actions cost 20% fewer tokens',
    nerfNote: 'telemetry added to every action (+25% token cost). for your benefit.',
    buff: (t) => { t.tokenCostMult *= 0.8; },
    nerf: (t) => { t.tokenCostMult *= 1.25; },
  },
  {
    buffNote: 'context manager rewritten in Rust: compaction threshold raised',
    nerfNote: 'new summarizer is "more aggressive". compaction threshold lowered.',
    buff: (t) => { t.compactionThreshold = Math.min(0.92, t.compactionThreshold + 0.07); },
    nerf: (t) => { t.compactionThreshold = Math.max(0.5, t.compactionThreshold - 0.08); },
  },
  {
    buffNote: 'bundled free antivirus (+18 shield)',
    nerfNote: 'update wiped your shield. it was "deprecated".',
    buff: (t) => { t.shield += 18; },
    nerf: (t) => { t.shield = 0; },
  },
  {
    buffNote: 'experimental feature flag enabled: chaos weapon unlocked!',
    nerfNote: 'dependency conflict: a random weapon now behaves "differently" (aim -1.5)',
    buff: (t, rng) => {
      t.unlockWeapon = rng.pick<WeaponId>(['context_nuke', 'false_positive_laser', 'unknown_error']);
    },
    nerf: (t) => { t.aimJitter += 1.5; },
  },
];

const VERSION_ADJ = ['hotfix', 'nightly', 'LTS', 'beta', 'rc1', 'yolo'];

export interface UpdateResult {
  version: string;
  notes: string[];
  netBuff: boolean;
}

/**
 * Roll an update. riskSkew (-1..1) shifts buff probability: positive = agent
 * is used to change (model_switches), friendlier updates; negative = riskier.
 */
export function rollUpdate(target: UpdateTarget, rng: Rng, riskSkew: number): UpdateResult {
  const version = `v${rng.int(2, 9)}.${rng.int(0, 20)}.${rng.int(0, 99)}-${rng.pick(VERSION_ADJ)}`;
  const n = rng.chance(0.35) ? 2 : 1; // sometimes an update touches two things
  const notes: string[] = [];
  let buffs = 0;
  const pool = [...ROLLS];
  for (let i = 0; i < n; i++) {
    const idx = rng.int(0, pool.length - 1);
    const roll = pool.splice(idx, 1)[0];
    const pBuff = 0.5 + riskSkew * 0.2;
    if (rng.chance(pBuff)) {
      roll.buff(target, rng);
      notes.push('+ ' + roll.buffNote);
      buffs++;
    } else {
      roll.nerf(target, rng);
      notes.push('- ' + roll.nerfNote);
    }
  }
  return { version, notes, netBuff: buffs * 2 > n };
}
