// Match state + turn orchestration. Two agents, one arena, two ways to win:
// clear your task queue, or crash the other agent's process.

import { Rng } from './rng';
import { Terrain } from './terrain';
import {
  Projectile, makeProjectile, stepProjectile, traceLaser, TankBody, PHYS_DT,
} from './physics';
import { WEAPONS, WeaponDef, WeaponId } from './weapons';
import {
  TaskQueue, makeTaskQueue, work as workTask, amnesia, distract, allDone, progressFrac,
} from './tasks';
import {
  ContextMeter, makeContextMeter, spend, drainAfterCompaction, overThreshold,
  compactionSummary, contextFrac,
} from './context';
import { rollUpdate, UpdateResult, UpdateTarget } from './updates';
import { startingBuffs, computeComeback, ComebackState, StartingBuff } from './handicap';
import { AgentLoadout, terrainParamsFromCard, SessionCard } from './session';

export const TOKEN_COST = {
  moveStep: 14,   // per movement step
  work: 220,      // one work action
  update: 200,    // installing an update
};

export interface WeaponSlot {
  def: WeaponDef;
  ammo: number;
  statRoll: number;
  sourceLine: string;
  cooldownLeft: number;
}

export interface Player {
  index: number;
  name: string;
  color: string;
  isCpu: boolean;
  // body
  x: number; y: number; radius: number;
  // aim
  angle: number; power: number;
  // vitals
  hp: number; maxHp: number; shield: number;
  ctx: ContextMeter;
  queue: TaskQueue;
  weapons: WeaponSlot[];
  selected: number;
  // build knobs (updates + handicap mutate these)
  aimJitter: number;
  damageMult: number;
  tokenCostMult: number;
  hardening: number;
  stability: number;
  // per-turn
  recentDamage: number[]; // damage taken, one bucket per own turn (newest last)
  movesLeft: number;
  updateOffer: number;    // turns the current offer stays valid (0 = none)
  /** true while heads-down in work: shots that land before your next turn hit +25% harder */
  headsDown: boolean;
  // provenance
  loadout: AgentLoadout;
  startBuff: StartingBuff | null;
  updatesInstalled: UpdateResult[];
  stats: { shotsFired: number; damageDealt: number; workActions: number; compactions: number };
}

export interface Banner {
  kind: 'compaction' | 'update' | 'info' | 'turn';
  title: string;
  lines: string[];
  ttl: number;      // seconds remaining
  player: number;   // whose banner (-1 = global)
}

export interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
  char: string; color: string; size: number;
}

export interface LaserBeam { x1: number; y1: number; x2: number; y2: number; ttl: number }

export type Phase = 'aim' | 'projectile' | 'gameover';

export interface GameOver {
  winner: number; // -1 = mutual crash
  reason: 'tasks' | 'crash' | 'mutual';
  headline: string;
}

export interface MatchSetup {
  loadouts: [AgentLoadout, AgentLoadout];
  cards: [SessionCard | null, SessionCard | null];
  cpu: [boolean, boolean];
  names: [string, string];
}

export class Game {
  terrain: Terrain;
  players: [Player, Player];
  rng: Rng;
  wind = 0;
  round = 1;
  turn = 0; // whose turn
  phase: Phase = 'aim';
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  lasers: LaserBeam[] = [];
  banners: Banner[] = [];
  log: string[] = [];
  comeback: ComebackState = { holder: -1, damageMult: 1, tokenDiscount: 0 };
  gameOver: GameOver | null = null;
  /** timestamps the HUD watches to re-render only when something changed */
  dirty = 0;
  /** seconds the current turn has been idle (for CPU pacing) */
  turnClock = 0;
  private pendingCompactions: number[] = [];

  constructor(setup: MatchSetup) {
    const [la, lb] = setup.loadouts;
    this.rng = new Rng((la.seed ^ (lb.seed << 1)) >>> 0 || 1);
    this.terrain = new Terrain(terrainParamsFromCard(setup.cards[0] ?? setup.cards[1]));

    const buffs = startingBuffs(la, lb, this.rng.fork('handicap'));
    this.players = [
      this.makePlayer(0, setup.names[0], '#7ee787', setup.cpu[0], la, buffs[0]),
      this.makePlayer(1, setup.names[1], '#d97757', setup.cpu[1], lb, buffs[1]),
    ];
    for (const p of this.players) {
      if (p.startBuff) this.pushLog(`⚑ handicap [${p.name}]: ${p.startBuff.why}`);
    }
    this.rerollWind();
    this.startTurn(true);
  }

  private makePlayer(
    index: number, name: string, color: string, isCpu: boolean,
    loadout: AgentLoadout, startBuff: StartingBuff | null,
  ): Player {
    const margin = this.terrain.width * 0.12;
    const x = index === 0
      ? margin + this.rng.range(0, this.terrain.width * 0.08)
      : this.terrain.width - margin - this.rng.range(0, this.terrain.width * 0.08);
    const y = this.terrain.surfaceAt(x) - 8;

    const weapons: WeaponSlot[] = loadout.weapons.map((w) => ({
      def: WEAPONS[w.id], ammo: w.ammo, statRoll: w.statRoll, sourceLine: w.sourceLine, cooldownLeft: 0,
    }));
    let budget = loadout.tokenBudget;
    let damageMult = 1;
    if (startBuff) {
      budget += startBuff.extraTokens;
      damageMult *= startBuff.damageMult;
      if (startBuff.weapon && !weapons.some((w) => w.def.id === startBuff.weapon)) {
        weapons.push({
          def: WEAPONS[startBuff.weapon], ammo: 2, statRoll: 1,
          sourceLine: 'handicap grant — struggle pays out', cooldownLeft: 0,
        });
      }
    }
    return {
      index, name, color, isCpu,
      x, y, radius: 11,
      angle: index === 0 ? 60 : 120, power: 55,
      hp: 100, maxHp: 100, shield: 0,
      ctx: makeContextMeter(budget, loadout.compactionThreshold),
      queue: makeTaskQueue(loadout.tasks),
      weapons, selected: 0,
      aimJitter: 0, damageMult, tokenCostMult: 1,
      hardening: loadout.hardening, stability: loadout.stability,
      recentDamage: [0], movesLeft: 0, updateOffer: 0, headsDown: false,
      loadout, startBuff, updatesInstalled: [],
      stats: { shotsFired: 0, damageDealt: 0, workActions: 0, compactions: 0 },
    };
  }

  get current(): Player { return this.players[this.turn]; }
  get other(): Player { return this.players[1 - this.turn]; }
  bodies(): TankBody[] {
    return this.players.map((p) => ({ x: p.x, y: p.y, radius: p.radius + 4, index: p.index, alive: p.hp > 0 }));
  }
  taskFracs(): [number, number] {
    return [progressFrac(this.players[0].queue), progressFrac(this.players[1].queue)];
  }
  pushLog(line: string): void {
    this.log.push(line);
    if (this.log.length > 60) this.log.shift();
    this.dirty++;
  }
  pushBanner(b: Banner): void { this.banners.push(b); this.dirty++; }
  get bannerActive(): boolean { return this.banners.length > 0; }

  private rerollWind(): void {
    this.wind = Math.round(this.rng.range(-10, 10) * 10) / 10;
  }

  // -------------------------------------------------------------------------
  // turn lifecycle
  // -------------------------------------------------------------------------

  private startTurn(first = false): void {
    if (this.gameOver) return;
    const p = this.current;
    this.turnClock = 0;
    p.movesLeft = 24;
    p.headsDown = false; // survived the opponent's turn — head back up
    p.recentDamage.push(0);
    if (p.recentDamage.length > 4) p.recentDamage.shift();
    for (const w of p.weapons) if (w.cooldownLeft > 0) w.cooldownLeft--;

    // live comeback buff recompute
    this.comeback = computeComeback(
      [this.players[0].hp / this.players[0].maxHp, this.players[1].hp / this.players[1].maxHp],
      this.taskFracs(),
    );
    // update offer: roll, or age an existing one
    if (p.updateOffer > 0) {
      p.updateOffer--;
      if (p.updateOffer === 0) this.pushLog(`update offer expired for ${p.name}`);
    } else if (this.rng.chance(p.loadout.updateChance)) {
      p.updateOffer = 2;
      this.pushBanner({
        kind: 'update', player: p.index, ttl: 2.2,
        title: '⬆ UPDATE AVAILABLE',
        lines: [`${p.name}: press U to spend this turn installing.`, 'may buff. may nerf. definitely has patch notes.'],
      });
    }
    if (!first) {
      this.pushBanner({
        kind: 'turn', player: p.index, ttl: 1.1,
        title: `▶ ${p.name}'s turn`, lines: [`round ${this.round} · wind ${this.wind > 0 ? '→' : this.wind < 0 ? '←' : '·'} ${Math.abs(this.wind).toFixed(1)}`],
      });
    }
    this.dirty++;
  }

  private endTurn(): void {
    if (this.gameOver) return;
    if (this.checkWin()) return;
    this.turn = 1 - this.turn;
    if (this.turn === 0) {
      this.round++;
      this.rerollWind();
    }
    this.phase = 'aim';
    this.startTurn();
  }

  private checkWin(): boolean {
    const [a, b] = this.players;
    const aDead = a.hp <= 0, bDead = b.hp <= 0;
    const aDone = allDone(a.queue), bDone = b.queue.tasks.length > 0 && allDone(b.queue);
    let over: GameOver | null = null;
    if (aDead && bDead) {
      over = { winner: -1, reason: 'mutual', headline: 'MUTUAL CRASH — both agent processes exited 137' };
    } else if (aDead) {
      over = { winner: 1, reason: 'crash', headline: `${a.name} CRASHED — ${b.name} wins by process kill` };
    } else if (bDead) {
      over = { winner: 0, reason: 'crash', headline: `${b.name} CRASHED — ${a.name} wins by process kill` };
    } else if (aDone) {
      over = { winner: 0, reason: 'tasks', headline: `${a.name} CLEARED THE TASK QUEUE — actual work got done` };
    } else if (bDone) {
      over = { winner: 1, reason: 'tasks', headline: `${b.name} CLEARED THE TASK QUEUE — actual work got done` };
    }
    if (over) {
      this.gameOver = over;
      this.phase = 'gameover';
      this.dirty++;
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // player actions (all assume it's `current`'s turn, phase 'aim', no banner)
  // -------------------------------------------------------------------------

  canAct(): boolean {
    return this.phase === 'aim' && !this.gameOver;
  }

  adjustAngle(delta: number): void {
    if (!this.canAct()) return;
    const p = this.current;
    p.angle = Math.max(2, Math.min(178, p.angle + delta));
    this.dirty++;
  }

  adjustPower(delta: number): void {
    if (!this.canAct()) return;
    const p = this.current;
    p.power = Math.max(5, Math.min(100, p.power + delta));
    this.dirty++;
  }

  selectWeapon(index: number): void {
    if (!this.canAct()) return;
    const p = this.current;
    if (index >= 0 && index < p.weapons.length) { p.selected = index; this.dirty++; }
  }

  cycleWeapon(dir: number): void {
    if (!this.canAct()) return;
    const p = this.current;
    p.selected = (p.selected + dir + p.weapons.length) % p.weapons.length;
    this.dirty++;
  }

  /** Move a step left/right along the terrain surface. Costs tokens, not the turn. */
  move(dir: -1 | 1): void {
    if (!this.canAct()) return;
    const p = this.current;
    if (p.movesLeft <= 0) { this.pushLog(`${p.name}: out of moves this turn`); return; }
    const nx = p.x + dir * 4;
    if (nx < 12 || nx > this.terrain.width - 12) return;
    const ny = this.terrain.surfaceAt(nx) - 8;
    if (p.y - ny < -26) { this.pushLog(`${p.name}: slope too steep`); return; } // can't climb cliffs
    p.x = nx; p.y = ny;
    p.movesLeft--;
    this.spendTokens(p, TOKEN_COST.moveStep);
    this.dirty++;
  }

  /** WORK action: advance current task, skip your shot. */
  workAction(): void {
    if (!this.canAct()) return;
    const p = this.current;
    p.stats.workActions++;
    p.headsDown = true; // heads-down in the task: exposed until your next turn
    this.spendTokens(p, TOKEN_COST.work);
    const line = workTask(p.queue);
    this.pushLog(`⌨ ${p.name}: ${line}`);
    this.resolveCompactionsThen(() => this.endTurn());
  }

  /** Install the offered update: spend the turn on a risk roll. */
  installUpdate(): void {
    if (!this.canAct()) return;
    const p = this.current;
    if (p.updateOffer <= 0) { this.pushLog(`${p.name}: no update available`); return; }
    p.updateOffer = 0;
    this.spendTokens(p, TOKEN_COST.update);
    const target: UpdateTarget = {
      aimJitter: p.aimJitter, damageMult: p.damageMult, tokenCostMult: p.tokenCostMult,
      compactionThreshold: p.ctx.threshold, shield: p.shield, unlockWeapon: null,
    };
    const result = rollUpdate(target, this.rng.fork('update' + this.round + p.index), p.loadout.updateRiskSkew);
    p.aimJitter = target.aimJitter;
    p.damageMult = target.damageMult;
    p.tokenCostMult = target.tokenCostMult;
    p.ctx.threshold = target.compactionThreshold;
    p.shield = target.shield;
    if (target.unlockWeapon && !p.weapons.some((w) => w.def.id === target.unlockWeapon)) {
      p.weapons.push({
        def: WEAPONS[target.unlockWeapon], ammo: 2, statRoll: 1.1,
        sourceLine: `unlocked by ${result.version}`, cooldownLeft: 0,
      });
    }
    p.updatesInstalled.push(result);
    this.pushBanner({
      kind: 'update', player: p.index, ttl: 3.4,
      title: `⬆ ${p.name} INSTALLED ${result.version}`,
      lines: result.notes,
    });
    this.pushLog(`⬆ ${p.name} installed ${result.version} (${result.netBuff ? 'net buff' : 'ouch'})`);
    this.resolveCompactionsThen(() => this.endTurn());
  }

  /** FIRE the selected weapon. */
  fire(): void {
    if (!this.canAct()) return;
    const p = this.current;
    const slot = p.weapons[p.selected];
    if (slot.ammo <= 0) { this.pushLog(`${p.name}: ${slot.def.name} — out of ammo`); return; }
    if (slot.cooldownLeft > 0) { this.pushLog(`${p.name}: ${slot.def.name} cooling down (${slot.cooldownLeft} turns)`); return; }

    slot.ammo--;
    slot.cooldownLeft = slot.def.cooldown;
    p.stats.shotsFired++;
    this.spendTokens(p, slot.def.tokenCost);

    const jitter = p.aimJitter > 0 ? this.rng.range(-p.aimJitter, p.aimJitter) : 0;
    const angle = p.angle + jitter;
    const muzzleX = p.x + Math.cos((angle * Math.PI) / 180) * 16;
    const muzzleY = p.y - 6 - Math.sin((angle * Math.PI) / 180) * 16;

    const behavior = slot.def.behavior;
    this.pushLog(`✦ ${p.name} fires ${slot.def.name}${jitter !== 0 ? ' (aim drifted)' : ''}`);

    if (behavior === 'support') {
      // Recovery Shield: convert last 2 turns of damage taken into shield
      const recent = p.recentDamage.slice(-2).reduce((a, b) => a + b, 0);
      const gained = Math.round((6 + recent * 0.8) * slot.statRoll);
      p.shield += gained;
      this.pushBanner({
        kind: 'info', player: p.index, ttl: 2.2,
        title: `🛡 RECOVERY SHIELD +${gained}`,
        lines: recent > 0 ? [`converted ${recent} recent damage into shield`] : ['no recent damage — minimum shield granted'],
      });
      this.resolveCompactionsThen(() => this.endTurn());
      return;
    }

    if (behavior === 'hitscan') {
      // False Positive Laser: instant, confident, randomly accurate
      const err = this.rng.range(-4.5, 4.5) * (this.rng.chance(0.4) ? 1 : 0.3);
      const hit = traceLaser(muzzleX, muzzleY, angle + err, this.terrain, this.bodies(), p.index);
      this.lasers.push({ x1: muzzleX, y1: muzzleY, x2: hit.x, y2: hit.y, ttl: 0.5 });
      this.explode(hit.x, hit.y, slot.def.radius, slot.def.damage * slot.statRoll, p.index, slot.def.id);
      this.resolveCompactionsThen(() => this.endTurn());
      return;
    }

    const spawn = (angleDeg: number, power: number): Projectile => {
      const proj = makeProjectile(muzzleX, muzzleY, angleDeg, power, p.index, slot.def.id);
      if (behavior === 'fuse') proj.fuseTime = 1.15;
      if (behavior === 'drift') {
        // hallucination drift — opponent hardening dampens it (injection resistance stat)
        const dampen = 1 - this.other.hardening * 0.6;
        proj.driftAx = this.rng.range(-52, 52) * dampen;
      }
      if (behavior === 'chaos') {
        // Unknown Error rolls a personality per shot
        const roll = this.rng.int(0, 3);
        if (roll === 0) proj.fuseTime = 0.8;
        if (roll === 1) proj.driftAx = this.rng.range(-70, 70);
        // roll 2: secretly a cluster — handled at impact via weaponId
        // roll 3: plain, but the damage roll below still varies
        (proj as any).chaosRoll = roll;
      }
      return proj;
    };

    if (behavior === 'burst') {
      for (let i = 0; i < 3; i++) {
        this.projectiles.push(spawn(angle + this.rng.range(-7, 7), p.power + this.rng.range(-9, 9)));
      }
    } else {
      this.projectiles.push(spawn(angle, p.power));
    }
    this.phase = 'projectile';
    this.dirty++;
  }

  // -------------------------------------------------------------------------
  // token economy + compaction
  // -------------------------------------------------------------------------

  private effectiveCost(p: Player, base: number): number {
    let mult = p.tokenCostMult;
    if (this.comeback.holder === p.index) mult *= 1 - this.comeback.tokenDiscount;
    return Math.round(base * mult);
  }

  private spendTokens(p: Player, base: number): void {
    const crossed = spend(p.ctx, this.effectiveCost(p, base));
    if (crossed && !this.pendingCompactions.includes(p.index)) {
      this.pendingCompactions.push(p.index);
    }
    this.dirty++;
  }

  /** Flood both meters (Context Window Nuke). */
  private floodContext(fraction: number): void {
    for (const p of this.players) {
      const crossed = spend(p.ctx, p.ctx.budget * fraction);
      if (crossed && !this.pendingCompactions.includes(p.index)) {
        this.pendingCompactions.push(p.index);
      }
    }
  }

  /** Fire any pending compaction events, then continue. */
  private resolveCompactionsThen(next: () => void): void {
    while (this.pendingCompactions.length > 0) {
      const idx = this.pendingCompactions.shift()!;
      this.compact(this.players[idx]);
    }
    next();
  }

  private compact(p: Player): void {
    const rng = this.rng.fork('compaction' + this.round + p.index);
    const lost: string[] = [];
    if (p.shield > 0) { lost.push(`shield buffer (${p.shield} hp) released`); p.shield = 0; }
    const oldAngle = p.angle;
    p.angle = p.index === 0 ? 60 : 120;
    p.power = 55;
    if (Math.abs(oldAngle - p.angle) > 4) lost.push(`aim solution (angle ${Math.round(oldAngle)}°) discarded`);
    let cooled = 0;
    for (const w of p.weapons) if (w.cooldownLeft > 0) { w.cooldownLeft = 0; cooled++; }
    if (cooled > 0) lost.push(`${cooled} weapon cooldown${cooled > 1 ? 's' : ''} forgotten (silver lining?)`);
    const severity = 1 + p.ctx.compactions * 0.5;
    lost.push(...amnesia(p.queue, rng, severity, p.ctx.compactions));
    drainAfterCompaction(p.ctx, rng);
    p.stats.compactions++;
    this.pushBanner({
      kind: 'compaction', player: p.index, ttl: 4.2,
      title: `⚡ COMPACTION — ${p.name}`,
      lines: compactionSummary(lost, rng),
    });
    this.pushLog(`⚡ ${p.name} hit the compaction threshold — memory lost`);
  }

  // -------------------------------------------------------------------------
  // explosions + damage
  // -------------------------------------------------------------------------

  private explode(x: number, y: number, radius: number, damage: number, owner: number, weaponId: string): void {
    // distraction is noise, not ordnance: tiny scorch so it can't crater someone into fall damage
    this.terrain.carve(x, y, weaponId === 'distraction_barrage' ? Math.min(radius, 8) : radius);
    this.spawnParticles(x, y, radius);

    const shooter = this.players[owner];
    let dmgMult = shooter.damageMult;
    if (this.comeback.holder === owner) dmgMult *= this.comeback.damageMult;

    if (weaponId === 'distraction_barrage') {
      // task attack: no HP damage — derail the victim's task instead
      for (const t of this.players) {
        if (t.index === owner || t.hp <= 0) continue;
        const dist = Math.hypot(t.x - x, t.y - y);
        if (dist < radius + t.radius) {
          const lines = distract(t.queue, this.rng.fork('distract' + this.round), t.hardening);
          this.pushBanner({
            kind: 'info', player: t.index, ttl: 3,
            title: `📣 DISTRACTION — ${t.name}`, lines,
          });
          for (const l of lines) this.pushLog(`📣 ${t.name}: ${l}`);
        } else {
          this.pushLog(`📣 distraction missed — ${t.name} stayed focused`);
        }
      }
    } else {
      for (const t of this.players) {
        if (t.hp <= 0) continue;
        const dist = Math.hypot(t.x - x, t.y - y);
        if (dist < radius + t.radius) {
          const falloff = Math.max(0.25, 1 - dist / (radius + t.radius));
          let dmg = Math.round(damage * falloff * (t.index === owner ? 1 : dmgMult));
          // hardening slightly resists hallucination ordnance (injection-resistance stat)
          if (weaponId === 'hallucination_missile' && t.index !== owner) {
            dmg = Math.round(dmg * (1 - t.hardening * 0.25));
          }
          this.applyDamage(t, dmg, owner);
        }
      }
      if (weaponId === 'context_nuke') {
        this.floodContext(0.32);
        this.pushLog('💥 context nuke flooded BOTH agents\' context windows');
      }
    }
    // settle tanks that lost the ground under them
    for (const t of this.players) this.settle(t);
    this.dirty++;
  }

  private applyDamage(t: Player, dmg: number, owner: number): void {
    if (dmg <= 0) return;
    if (owner !== t.index && t.headsDown) {
      dmg = Math.round(dmg * 1.25);
      this.pushLog(`⌨ ${t.name} was heads-down in a task — caught off guard (+25% damage)`);
    }
    let remaining = dmg;
    if (t.shield > 0) {
      const absorbed = Math.min(t.shield, remaining);
      t.shield -= absorbed;
      remaining -= absorbed;
      this.pushLog(`🛡 ${t.name}'s shield absorbed ${absorbed}`);
    }
    if (remaining > 0) {
      t.hp = Math.max(0, t.hp - remaining);
      t.recentDamage[t.recentDamage.length - 1] += remaining;
      if (owner !== t.index) this.players[owner].stats.damageDealt += remaining;
      this.pushLog(`💢 ${t.name} took ${remaining} damage (${t.hp} hp left)`);
    }
  }

  private settle(t: Player): void {
    const surf = this.terrain.surfaceAt(t.x);
    const targetY = surf - 8;
    if (targetY > t.y + 1) {
      const fall = targetY - t.y;
      t.y = targetY;
      if (fall > 45 && t.hp > 0) {
        const dmg = Math.round((fall - 45) * 0.25);
        if (dmg > 0) {
          this.pushLog(`⬇ ${t.name} fell ${Math.round(fall)}px into a fresh crater`);
          this.applyDamage(t, dmg, t.index);
        }
      }
    }
  }

  private spawnParticles(x: number, y: number, radius: number): void {
    const chars = ['E', 'R', 'R', '0', '1', '▓', '░', '█', '!', '?', 'x'];
    const colors = ['#f47067', '#e3b341', '#7ee787', '#d97757'];
    const n = Math.min(60, Math.round(radius * 0.7));
    const rng = this.rng.fork('particles' + this.particles.length);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = rng.range(30, 90 + radius);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: rng.range(0.5, 1.4), maxLife: 1.4,
        char: rng.pick(chars), color: rng.pick(colors), size: rng.range(8, 14),
      });
    }
  }

  // -------------------------------------------------------------------------
  // frame stepping
  // -------------------------------------------------------------------------

  step(dt: number): void {
    this.turnClock += dt;
    // banners tick down (they overlay but don't block physics)
    for (const b of this.banners) b.ttl -= dt;
    if (this.banners.length && this.banners[0].ttl <= 0) { this.banners.shift(); this.dirty++; }
    // lasers fade
    for (const l of this.lasers) l.ttl -= dt;
    this.lasers = this.lasers.filter((l) => l.ttl > 0);
    // particles
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vy += 160 * dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);

    if (this.phase !== 'projectile') return;

    // fixed-step the live projectiles
    const finished: Projectile[] = [];
    const newOnes: Projectile[] = [];
    let steps = Math.max(1, Math.round(dt / PHYS_DT));
    steps = Math.min(steps, 8);
    for (const proj of this.projectiles) {
      let done = false;
      if (proj.landed) {
        // fused round sitting on the ground
        proj.fuseTime -= dt;
        if (proj.fuseTime <= 0) {
          this.detonate(proj, proj.x, proj.y, null, newOnes);
          done = true;
        }
      } else {
        for (let i = 0; i < steps && !done; i++) {
          const r = stepProjectile(proj, PHYS_DT, this.wind, this.terrain, this.bodies());
          if (r.kind === 'impact') {
            if (proj.fuseTime > 0 && r.hitTank === null) {
              // timeout mortar settles in, blinking, before it goes off
              proj.landed = true;
              proj.x = r.x; proj.y = r.y - 2;
              this.pushLog('⏱ round landed… waiting for the timeout…');
            } else {
              this.detonate(proj, r.x, r.y, r.hitTank, newOnes);
              done = true;
            }
          } else if (r.kind === 'lost') {
            this.pushLog('· shot left the arena (request timed out)');
            done = true;
          }
        }
      }
      if (done) finished.push(proj);
    }
    this.projectiles = this.projectiles.filter((pr) => !finished.includes(pr));
    this.projectiles.push(...newOnes);

    if (this.projectiles.length === 0) {
      this.resolveCompactionsThen(() => this.endTurn());
    }
  }

  private detonate(proj: Projectile, x: number, y: number, hitTank: number | null, spawnInto: Projectile[]): void {
    const slotDef = WEAPONS[proj.weaponId as WeaponId] ?? WEAPONS.unknown_error;
    const shooter = this.players[proj.owner];
    const slot = shooter.weapons.find((w) => w.def.id === slotDef.id);
    const statRoll = slot?.statRoll ?? 1;

    const isChaosCluster = proj.weaponId === 'unknown_error' && (proj as any).chaosRoll === 2 && !proj.bomblet;
    if ((proj.weaponId === 'regression_cluster' || isChaosCluster) && !proj.bomblet) {
      // split into bomblets
      const rng = this.rng.fork('cluster' + this.round + x);
      const n = rng.int(3, 5);
      this.explode(x, y, slotDef.radius * 0.8, slotDef.damage * statRoll * 0.7, proj.owner, proj.weaponId);
      this.pushLog(`☢ regression split into ${n} new failures`);
      for (let i = 0; i < n; i++) {
        const b = makeProjectile(x, y - 6, rng.range(35, 145), rng.range(22, 42), proj.owner, proj.weaponId);
        b.bomblet = true;
        spawnInto.push(b);
      }
      return;
    }
    const dmgScale = proj.bomblet ? 0.75 : 1;
    let dmg = slotDef.damage * statRoll * dmgScale;
    let radius = slotDef.radius * (proj.bomblet ? 0.7 : 1);
    if (proj.weaponId === 'unknown_error') {
      const rng = this.rng.fork('chaosdmg' + x);
      dmg *= rng.range(0.6, 1.7);
      radius *= rng.range(0.8, 1.3);
    }
    if (hitTank !== null) dmg *= 1.15; // direct hit bonus
    this.explode(x, y, radius, Math.round(dmg), proj.owner, proj.weaponId);
  }
}
