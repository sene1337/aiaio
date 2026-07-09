// CPU opponent: balances working its task queue against shooting, aims by
// simulating candidate shots, picks weapons by situation, and gambles on
// updates when it's behind. Deliberately imperfect — it adds aim error so a
// human can win, and its choices vary by seeded rng.

import { Game, Player } from './game';
import { simulateShot } from './physics';
import { progressFrac, allDone } from './tasks';
import { contextFrac, overThreshold } from './context';
import { Rng } from './rng';

export type AiAction =
  | { type: 'work' }
  | { type: 'update' }
  | { type: 'fire'; weaponIndex: number; angle: number; power: number };

export function chooseAction(game: Game, p: Player): AiAction {
  const rng = new Rng((game.rng.int(0, 0xffffff) ^ (game.round * 7919 + p.index)) >>> 0);
  const enemy = game.players[1 - p.index];
  const myTasks = progressFrac(p.queue);
  const enemyTasks = progressFrac(enemy.queue);
  const myHp = p.hp / p.maxHp;
  const enemyHp = enemy.hp / enemy.maxHp;

  // --- update gamble: the loser hits the update button ---
  if (p.updateOffer > 0) {
    const behind = (myHp + myTasks) < (enemyHp + enemyTasks) - 0.15;
    const desperation = behind ? 0.65 : 0.12;
    if (rng.chance(desperation)) return { type: 'update' };
  }

  // --- support: shield up after taking a beating ---
  const recent = p.recentDamage.slice(-2).reduce((a, b) => a + b, 0);
  const shieldIdx = p.weapons.findIndex((w) => w.def.id === 'recovery_shield' && w.ammo > 0 && w.cooldownLeft === 0);
  if (shieldIdx !== -1 && recent >= 18 && p.shield < 10 && rng.chance(0.75)) {
    return { type: 'fire', weaponIndex: shieldIdx, angle: p.angle, power: p.power };
  }

  // --- work vs fight ---
  // work more when: my queue is nearly done, I'm healthy, enemy isn't about to kill me.
  // fight more when: enemy is racing ahead on tasks or is nearly dead.
  let workScore = 0.35 + myTasks * 0.5 + (myHp - 0.5) * 0.3;
  if (allDone(p.queue)) workScore = -1; // nothing left to work
  let fightScore = 0.35 + (1 - enemyHp) * 0.5 + enemyTasks * 0.45;
  if (recent > 20) fightScore += 0.2; // they're shooting me — shoot back
  // avoid expensive actions when hovering under the compaction threshold
  const ctxPressure = contextFrac(p.ctx) / p.ctx.threshold;
  if (ctxPressure > 0.85) workScore += 0.15; // work is cheaper than most weapons

  if (workScore + rng.range(-0.15, 0.15) > fightScore) return { type: 'work' };

  // --- weapon choice ---
  const usable = p.weapons
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.ammo > 0 && w.cooldownLeft === 0 && w.def.behavior !== 'support');
  if (usable.length === 0) return allDone(p.queue) ? bestShotFallback(game, p, rng) : { type: 'work' };

  let pickIdx = -1;
  // enemy about to win on tasks -> distraction barrage is the counter
  const distraction = usable.find(({ w }) => w.def.id === 'distraction_barrage');
  if (distraction && enemyTasks > 0.55 && rng.chance(0.8)) pickIdx = distraction.i;
  // enemy nearly dead -> biggest damage available
  if (pickIdx === -1 && enemyHp < 0.3) {
    const sorted = [...usable].sort((a, b) => b.w.def.damage * b.w.statRoll - a.w.def.damage * a.w.statRoll);
    pickIdx = sorted[0].i;
  }
  if (pickIdx === -1) {
    // otherwise: weighted pick, avoiding token-expensive weapons under context pressure
    const scored = usable.map(({ w, i }) => {
      let s = w.def.damage * w.statRoll + w.def.radius * 0.2;
      if (ctxPressure > 0.7 && w.def.tokenCost > 800) s *= 0.3;
      if (w.def.id === 'context_nuke' && ctxPressure > 0.6) s *= 0.15; // don't nuke your own memory
      return { i, s: s * rng.range(0.7, 1.3) };
    });
    scored.sort((a, b) => b.s - a.s);
    pickIdx = scored[0].i;
  }

  // --- aiming: simulate candidate shots, keep the best, then add human error ---
  const aim = solveAim(game, p, enemy.x, enemy.y, rng);
  return { type: 'fire', weaponIndex: pickIdx, angle: aim.angle, power: aim.power };
}

function solveAim(
  game: Game, p: Player, tx: number, ty: number, rng: Rng,
): { angle: number; power: number } {
  const facingRight = tx > p.x;
  let best = { angle: facingRight ? 55 : 125, power: 60, err: Infinity };
  const bodies = game.bodies();
  // coarse grid + a few refined samples — competent, not perfect
  const angles: number[] = [];
  for (let a = 20; a <= 160; a += 10) angles.push(a);
  const powers = [30, 45, 60, 75, 90];
  for (const a of angles) {
    if (facingRight && a > 105) continue;
    if (!facingRight && a < 75) continue;
    for (const pw of powers) {
      const hit = simulateShot(p.x, p.y - 10, a, pw, game.wind, game.terrain, bodies, p.index);
      if (!hit) continue;
      const err = Math.hypot(hit.x - tx, hit.y - ty);
      if (err < best.err) best = { angle: a, power: pw, err };
    }
  }
  // refine around the best coarse solution
  for (let i = 0; i < 10; i++) {
    const a = best.angle + rng.range(-6, 6);
    const pw = Math.max(10, Math.min(100, best.power + rng.range(-8, 8)));
    const hit = simulateShot(p.x, p.y - 10, a, pw, game.wind, game.terrain, bodies, p.index);
    if (!hit) continue;
    const err = Math.hypot(hit.x - tx, hit.y - ty);
    if (err < best.err) best = { angle: a, power: pw, err };
  }
  // deliberate imperfection so the CPU is beatable; tighter when it's losing
  const enemy = game.players[1 - p.index];
  const desperation = 1 - Math.min(1, (p.hp / p.maxHp + progressFrac(p.queue)) / (enemy.hp / enemy.maxHp + progressFrac(enemy.queue) + 0.01));
  const slop = Math.max(1.2, 4.5 - desperation * 3);
  return {
    angle: Math.max(5, Math.min(175, best.angle + rng.range(-slop, slop))),
    power: Math.max(10, Math.min(100, best.power + rng.range(-slop, slop))),
  };
}

function bestShotFallback(game: Game, p: Player, rng: Rng): AiAction {
  // no usable weapon and no tasks left: lob whatever has ammo (even on cooldown next turn)
  const any = p.weapons.findIndex((w) => w.ammo > 0 && w.cooldownLeft === 0);
  if (any === -1) return { type: 'work' }; // will no-op forward; game still ends by HP or opponent tasks
  const enemy = game.players[1 - p.index];
  const aim = solveAim(game, p, enemy.x, enemy.y, rng);
  return { type: 'fire', weaponIndex: any, angle: aim.angle, power: aim.power };
}
