// Struggle handicap — legible + fair. The lower-stability agent starts with
// compensating buffs (with a "why" line quoting real numbers), and whoever is
// behind during the match gets a live comeback buff.

import { Rng } from './rng';
import { AgentLoadout } from './session';
import { WeaponId } from './weapons';

export interface StartingBuff {
  kind: 'tokens' | 'damage' | 'chaos_weapon';
  why: string;
  extraTokens: number;
  damageMult: number;
  weapon: WeaponId | null;
}

/**
 * Compare the two loadouts' stability and grant the weaker side starting buffs.
 * Returns [buffForPlayer0, buffForPlayer1] (null = no buff).
 */
export function startingBuffs(a: AgentLoadout, b: AgentLoadout, rng: Rng): [StartingBuff | null, StartingBuff | null] {
  const gap = Math.abs(a.stability - b.stability);
  if (gap < 8) return [null, null]; // close enough to be a fair fight
  const weak = a.stability < b.stability ? 0 : 1;
  const weakLoad = weak === 0 ? a : b;
  const strongLoad = weak === 0 ? b : a;
  const scale = Math.min(1, gap / 60);

  const kinds: StartingBuff['kind'][] = ['tokens', 'damage', 'chaos_weapon'];
  const kind = kinds[rng.int(0, gap > 30 ? 2 : 1)];
  const whyBase = `system health ${weakLoad.stability} vs ${strongLoad.stability}` +
    (weakLoad.cardSummary.fromCard
      ? ` (${weakLoad.cardSummary.topErrorCategory} ×${weakLoad.cardSummary.topErrorCount}, ${weakLoad.cardSummary.compactionEvents} compactions on record)`
      : '');

  const buff: StartingBuff = {
    kind,
    why: '',
    extraTokens: 0,
    damageMult: 1,
    weapon: null,
  };
  if (kind === 'tokens') {
    buff.extraTokens = Math.round(2000 + 4000 * scale);
    buff.why = `+${buff.extraTokens} context tokens — ${whyBase}. struggling agents get headroom.`;
  } else if (kind === 'damage') {
    buff.damageMult = 1 + 0.1 + 0.15 * scale;
    buff.why = `underdog ×${buff.damageMult.toFixed(2)} damage — ${whyBase}. pain is ammunition.`;
  } else {
    buff.weapon = rng.pick<WeaponId>(['context_nuke', 'unknown_error', 'false_positive_laser']);
    buff.why = `free chaos weapon — ${whyBase}. broken systems get interesting toys.`;
  }
  const result: [StartingBuff | null, StartingBuff | null] = [null, null];
  result[weak] = buff;
  return result;
}

export interface ComebackState {
  /** which player currently has the comeback buff (-1 = none) */
  holder: number;
  damageMult: number;
  tokenDiscount: number;
}

/**
 * Live comeback buff: composite of HP and task progress; whoever is clearly
 * behind gets +damage and cheaper actions. Recomputed at each round start.
 */
export function computeComeback(
  hpFrac: [number, number], taskFrac: [number, number],
): ComebackState {
  const score0 = hpFrac[0] * 0.5 + taskFrac[0] * 0.5;
  const score1 = hpFrac[1] * 0.5 + taskFrac[1] * 0.5;
  const gap = Math.abs(score0 - score1);
  if (gap < 0.12) return { holder: -1, damageMult: 1, tokenDiscount: 0 };
  const behind = score0 < score1 ? 0 : 1;
  const strength = Math.min(1, gap / 0.5);
  return {
    holder: behind,
    damageMult: 1 + 0.08 + 0.12 * strength,
    tokenDiscount: 0.1 + 0.15 * strength,
  };
}
