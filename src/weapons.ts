// Weapon definitions — every weapon is an error-log archetype with distinct
// behavior, token cost, and a log-flavor tooltip.

export type WeaponId =
  | 'debug_zap'
  | 'timeout_mortar'
  | 'hallucination_missile'
  | 'regression_cluster'
  | 'restart_thrash'
  | 'false_positive_laser'
  | 'context_nuke'
  | 'recovery_shield'
  | 'distraction_barrage'
  | 'unknown_error';

export type WeaponBehavior =
  | 'ballistic'   // normal arc
  | 'fuse'        // lands, then detonates after a delay
  | 'drift'       // mid-air drift force pushes it off course
  | 'cluster'     // splits into bomblets on impact
  | 'burst'       // fires several shots with spread
  | 'hitscan'     // instant laser with accuracy roll
  | 'support'     // no projectile: buffs self (shield)
  | 'task_attack' // hits task progress instead of HP
  | 'chaos';      // seeded random behavior

export interface WeaponDef {
  id: WeaponId;
  name: string;
  glyph: string;          // HUD icon glyph
  behavior: WeaponBehavior;
  tokenCost: number;      // context tokens burned per shot
  damage: number;         // direct-hit damage before rolls/multipliers
  radius: number;         // blast radius in px
  cooldown: number;       // turns between uses (0 = none)
  flavor: string;         // log-flavored tooltip
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  debug_zap: {
    id: 'debug_zap', name: 'Print-Debug Zapper', glyph: '»',
    behavior: 'ballistic', tokenCost: 90, damage: 9, radius: 14, cooldown: 0,
    flavor: "console.log('pew'). infinite ammo, mild insight. you can never run out of print statements.",
  },
  timeout_mortar: {
    id: 'timeout_mortar', name: 'Timeout Mortar', glyph: '⏱',
    behavior: 'fuse', tokenCost: 300, damage: 26, radius: 58, cooldown: 0,
    flavor: 'ETIMEDOUT: lands, waits 30000ms (feels like it), THEN explodes. Big splash, cheap tokens.',
  },
  hallucination_missile: {
    id: 'hallucination_missile', name: 'Hallucination Missile', glyph: '👻',
    behavior: 'drift', tokenCost: 550, damage: 34, radius: 44, cooldown: 0,
    flavor: 'Aims at a file that exists. Lands on one that does not. Confidently.',
  },
  regression_cluster: {
    id: 'regression_cluster', name: 'Regression Cluster Bomb', glyph: '☢',
    behavior: 'cluster', tokenCost: 650, damage: 14, radius: 34, cooldown: 0,
    flavor: 'One fix ships. Three to five new failures deploy on impact. Passed on main, though.',
  },
  restart_thrash: {
    id: 'restart_thrash', name: 'Restart Thrash Cannon', glyph: '🔁',
    behavior: 'burst', tokenCost: 600, damage: 15, radius: 30, cooldown: 0,
    flavor: 'exit 137 → relaunch → exit 137 → relaunch. Three shots, none of them aimed the same.',
  },
  false_positive_laser: {
    id: 'false_positive_laser', name: 'False Positive Laser', glyph: '⚡',
    behavior: 'hitscan', tokenCost: 900, damage: 40, radius: 26, cooldown: 2,
    flavor: '100% confidence, randomized accuracy. The assertion held. The premise did not.',
  },
  context_nuke: {
    id: 'context_nuke', name: 'Context Window Nuke', glyph: '💥',
    behavior: 'ballistic', tokenCost: 2400, damage: 48, radius: 110, cooldown: 3,
    flavor: 'Floods EVERYONE’s context toward compaction, yours included. Situational awareness not found.',
  },
  recovery_shield: {
    id: 'recovery_shield', name: 'Recovery Shield', glyph: '🛡',
    behavior: 'support', tokenCost: 450, damage: 0, radius: 0, cooldown: 2,
    flavor: 'retry 2/3 succeeded. Converts damage taken in your last 2 turns into a temporary shield.',
  },
  distraction_barrage: {
    id: 'distraction_barrage', name: 'Distraction Barrage', glyph: '📣',
    behavior: 'task_attack', tokenCost: 500, damage: 0, radius: 60, cooldown: 1,
    flavor: '"quick question—" Stuns every error within range for ~4s while they stop to read the ping. No damage.',
  },
  unknown_error: {
    id: 'unknown_error', name: 'Unknown Error', glyph: '❓',
    behavior: 'chaos', tokenCost: 400, damage: 24, radius: 48, cooldown: 0,
    flavor: 'undefined is not a function. Nobody categorized this log line. Effects may vary.',
  },
};

export const WEAPON_ORDER: WeaponId[] = [
  'debug_zap', 'timeout_mortar', 'hallucination_missile', 'regression_cluster', 'restart_thrash',
  'false_positive_laser', 'context_nuke', 'recovery_shield', 'distraction_barrage', 'unknown_error',
];
