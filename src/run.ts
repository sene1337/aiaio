// SESSION RUN — the core of AIAIO v2. The level IS a real agent session:
// you traverse its timeline left→right, your actual errors spawn as creatures,
// your real tasks sit in the world as work stations, and behind you the WALL
// OF FORGETTING (context pressure made spatial) eats everything you didn't
// get done. Reach process exit alive; clear the queue for a perfect run.

import { Rng } from './rng';
import { Terrain } from './terrain';
import { Projectile, stepProjectile, PHYS_DT } from './physics';
import { WEAPONS, WeaponDef, WeaponId } from './weapons';
import { TaskQueue, makeTaskQueue, work as workTask, amnesia, allDone } from './tasks';
import {
  ContextMeter, makeContextMeter, spend, drainAfterCompaction, contextFrac, compactionSummary,
} from './context';
import { rollUpdate, UpdateTarget } from './updates';
import { AgentLoadout, SessionCard } from './session';
import { Enemy, EnemyKind, makeEnemy, categoryToEnemy, ENEMY_DEFS } from './enemies';
import { hashString } from './rng';

export const RUN_COST = {
  fireDivisor: 6,   // weapon tokenCost / this = per-shot cost in run mode
  workTick: 60,     // one work tick at a station
  update: 40,       // installing an update from a crate
  subagentSpawn: 900, // spinning up a subagent
  subagentDrip: 16,   // tokens/second per living subagent — inference isn't free
  damageSpew: 6,      // tokens injected into YOUR context per point of damage taken
};

export interface Banner {
  kind: 'compaction' | 'update' | 'info' | 'turn';
  title: string;
  lines: string[];
  ttl: number;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
  char: string; color: string; size: number;
}

export interface LaserBeam { x1: number; y1: number; x2: number; y2: number; ttl: number; hostile: boolean }

export interface WeaponSlot {
  def: WeaponDef;
  ammo: number; // Infinity for debug_zap
  statRoll: number;
  sourceLine: string;
  cooldownLeft: number; // seconds in run mode
}

export interface Avatar {
  x: number; y: number; vx: number; vy: number;
  onGround: boolean;
  facing: 1 | -1;
  hp: number; maxHp: number; shield: number;
  /** model generation — ◈ crates increment it (bigger context, higher threshold) */
  model: number;
  /** heads-down while working (+25% damage taken) */
  headsDown: boolean;
  // build knobs (updates mutate these)
  aimJitter: number;
  damageMult: number;
  tokenCostMult: number;
  hardening: number;
}

export interface Station {
  x: number; y: number;
  taskIndex: number;
  workAccum: number;
}

export interface Crate { x: number; y: number; used: boolean; kind: 'patch' | 'model' }

/** a spawned lower-model helper: weak, expensive, and corruptible */
export interface SubAgent {
  x: number; y: number;
  hp: number;
  corrupted: boolean;
  corruptedAt: number; // run time when it turned (rogue processes get OOM-killed eventually)
  zapCd: number;
  dripAccum: number;
  slot: number; // 0/1 — formation offset
  label: string;
}

export interface RunOver {
  won: boolean;
  reason: 'exit' | 'killed' | 'wall';
  headline: string;
  score: number;
  perfect: boolean;
}

export interface RunInput {
  left: boolean; right: boolean; work: boolean;
}

export interface RunSetup {
  loadout: AgentLoadout;
  card: SessionCard;
  name: string;
}

export class Run {
  terrain: Terrain;
  rng: Rng;
  loadout: AgentLoadout;
  card: SessionCard;
  name: string;

  avatar: Avatar;
  ctx: ContextMeter;
  queue: TaskQueue;
  weapons: WeaponSlot[];
  selected = 0;

  enemies: Enemy[] = [];
  stations: Station[] = [];
  crates: Crate[] = [];
  subagents: SubAgent[] = [];
  projectiles: Projectile[] = []; // owner 0 = player, 1 = enemies
  particles: Particle[] = [];
  lasers: LaserBeam[] = [];
  banners: Banner[] = [];
  log: string[] = [];

  wallX: number;
  time = 0;
  kills = 0;
  working = false;
  nearStation: Station | null = null;
  nearCrate: Crate | null = null;
  over: RunOver | null = null;
  dirty = 0;
  /** single event stream: main wires this to telemetry + audio + visual fx */
  emit: (type: string, data?: Record<string, unknown>) => void = () => { /* wired by main */ };

  private recentDamage: Array<{ t: number; dmg: number }> = [];
  private headsDownTimer = 0;
  private touchCooldowns = new Map<Enemy, number>();
  private wallWarned = false;

  constructor(setup: RunSetup) {
    this.loadout = setup.loadout;
    this.card = setup.card;
    this.name = setup.name;
    this.rng = new Rng(setup.loadout.seed ^ 0x5e5510);

    const messages = Math.floor(this.card.message_count ?? 120);
    const width = Math.max(2400, Math.min(6000, 2400 + messages * 7));
    this.terrain = new Terrain({
      seed: hashString((this.card.session_id ?? 'run') + ':run:' + messages),
      width, height: 900,
      jaggedness: Math.max(0.2, Math.min(0.8, 0.2 + messages / 900)),
    });

    // avatar starts at the session's first message
    const startX = 60;
    this.avatar = {
      x: startX, y: this.terrain.surfaceAt(startX) - 8, vx: 0, vy: 0,
      onGround: true, facing: 1,
      hp: 100, maxHp: 100, shield: 0, model: 1,
      headsDown: false,
      aimJitter: 0, damageMult: 1, tokenCostMult: 1,
      hardening: this.loadout.hardening,
    };
    // struggle handicap, solo edition: unstable agents get compensation up front
    if (this.loadout.stability < 45) {
      const gap = 45 - this.loadout.stability;
      this.avatar.shield = Math.round(10 + gap * 0.6);
      this.avatar.damageMult = 1 + gap * 0.006;
      this.pushLog(`⚑ handicap: +${this.avatar.shield} shield, ×${this.avatar.damageMult.toFixed(2)} damage — ` +
        `stability ${this.loadout.stability}/100. struggling agents get armor.`);
    }

    this.ctx = makeContextMeter(this.loadout.tokenBudget, this.loadout.compactionThreshold);
    this.queue = makeTaskQueue(this.loadout.tasks);

    // weapons: infinite debug-zap first, then the error-log arsenal
    this.weapons = [{
      def: WEAPONS.debug_zap, ammo: Infinity, statRoll: 1,
      sourceLine: 'standard issue — every agent can print', cooldownLeft: 0,
    }];
    for (const w of this.loadout.weapons) {
      if (w.id === 'timeout_mortar' && w.sourceLine.startsWith('baseline')) continue; // zap covers the baseline now
      this.weapons.push({
        def: WEAPONS[w.id], ammo: w.ammo + 3, statRoll: w.statRoll,
        sourceLine: w.sourceLine, cooldownLeft: 0,
      });
    }

    this.buildLevel(width);
    this.wallX = -260;
    this.pushBanner({
      kind: 'turn', ttl: 3,
      title: `▶ SESSION START — ${this.card.session_id ?? 'unknown'}`,
      lines: ['reach process exit → · clear your task queue on the way', 'the wall of forgetting is behind you. it is always behind you.'],
    });
  }

  // -------------------------------------------------------------------------
  // level generation: the session timeline becomes geography
  // -------------------------------------------------------------------------

  private buildLevel(width: number): void {
    const rng = this.rng.fork('level');
    // task stations spread across the timeline in queue order
    const n = this.queue.tasks.length;
    for (let i = 0; i < n; i++) {
      const frac = 0.14 + (i + rng.range(0.1, 0.5)) * (0.72 / n);
      const x = Math.round(width * frac);
      this.stations.push({ x, y: this.terrain.surfaceAt(x), taskIndex: i, workAccum: 0 });
    }

    // enemies from the card's real errors, placed along the timeline
    const errors = (this.card.errors ?? []).filter((e) => e && (e.category || e.type));
    for (const err of errors) {
      const cat = err.category || err.type || 'unknown';
      const kind = categoryToEnemy(cat);
      const count = Math.max(1, Math.floor(err.count ?? 1));
      const spawnN = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(count))));
      const source = err.sample ? `${cat} ×${count} — "${err.sample.slice(0, 70)}"` : `${cat} ×${count}`;
      for (let i = 0; i < spawnN; i++) {
        const x = Math.round(width * rng.range(0.18, 0.95));
        const floats = kind === 'hallucination_ghost' || kind === 'recovery_sprite';
        const y = this.terrain.surfaceAt(x) - (floats ? rng.range(60, 150) : 10);
        this.enemies.push(makeEnemy(kind, x, y, source));
      }
    }
    // playability floor: an empty error log still gets a light welcoming committee
    if (this.enemies.filter((e) => !e.def.friendly).length === 0) {
      for (let i = 0; i < 3; i++) {
        const x = Math.round(width * rng.range(0.3, 0.9));
        this.enemies.push(makeEnemy('regression_splitter', x, this.terrain.surfaceAt(x) - 10,
          'no errors on record — these three came anyway'));
      }
    }
    // recoveries → extra friendly sprites
    const recoveries = Math.floor(this.card.recoveries ?? 0);
    for (let i = 0; i < Math.min(3, Math.ceil(recoveries / 2)); i++) {
      const x = Math.round(width * rng.range(0.25, 0.9));
      this.enemies.push(makeEnemy('recovery_sprite', x, this.terrain.surfaceAt(x) - rng.range(40, 90),
        `recoveries: ${recoveries} on record`));
    }

    // patch crates from restarts + model_switches (risk rolls)
    const crateN = Math.max(1, Math.min(4, Math.floor((this.card.restarts ?? 0) + (this.card.model_switches ?? 0))));
    for (let i = 0; i < crateN; i++) {
      const x = Math.round(width * rng.range(0.2, 0.88));
      this.crates.push({ x, y: this.terrain.surfaceAt(x) - 10, used: false, kind: 'patch' });
    }
    // one ◈ MODEL UPGRADE crate mid-to-late level — the "new model released" moment
    const mx = Math.round(width * rng.range(0.5, 0.78));
    this.crates.push({ x: mx, y: this.terrain.surfaceAt(mx) - 10, used: false, kind: 'model' });
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  pushLog(line: string): void {
    this.log.push(line);
    if (this.log.length > 60) this.log.shift();
    this.dirty++;
  }
  pushBanner(b: Banner): void { this.banners.push(b); this.dirty++; }
  get bannerActive(): boolean { return this.banners.length > 0; }

  private spendTokens(base: number): void {
    const cost = Math.max(1, Math.round(base * this.avatar.tokenCostMult));
    if (spend(this.ctx, cost)) this.compact();
    this.dirty++;
  }

  private recentDamageTotal(): number {
    return this.recentDamage.filter((d) => this.time - d.t < 4).reduce((s, d) => s + d.dmg, 0);
  }

  damageAvatar(dmg: number, source: string): void {
    if (this.over) return;
    let d = dmg;
    if (this.avatar.headsDown) {
      d = Math.round(d * 1.25);
      this.pushLog(`⌨ caught heads-down by ${source} (+25% damage)`);
    }
    // errors spam your context: every hit injects token spew (stack traces are long)
    const spew = Math.round(d * RUN_COST.damageSpew);
    if (spend(this.ctx, spew)) this.compact();
    if (this.avatar.shield > 0) {
      const absorbed = Math.min(this.avatar.shield, d);
      this.avatar.shield -= absorbed;
      d -= absorbed;
    }
    if (d > 0) {
      this.avatar.hp = Math.max(0, this.avatar.hp - d);
      this.recentDamage.push({ t: this.time, dmg: d });
      this.pushLog(`💢 took ${d} from ${source} (${Math.round(this.avatar.hp)} hp)`);
      this.emit('damage', { amount: d, source, headsDown: this.avatar.headsDown, hp: Math.round(this.avatar.hp) });
      if (this.avatar.hp <= 0) this.finish(false, 'killed');
    }
    this.dirty++;
  }

  private compact(): void {
    const rng = this.rng.fork('compact' + Math.round(this.time * 10));
    const lost: string[] = [];
    if (this.avatar.shield > 0) { lost.push(`shield buffer (${this.avatar.shield}) released`); this.avatar.shield = 0; }
    lost.push(...amnesia(this.queue, rng, 1 + this.ctx.compactions * 0.5, this.ctx.compactions));
    const leap = 240 + this.ctx.compactions * 60;
    this.wallX += leap;
    lost.push(`the wall of forgetting leapt ${leap}px closer`);
    drainAfterCompaction(this.ctx, rng);
    this.pushBanner({
      kind: 'compaction', ttl: 3.6,
      title: '⚡ COMPACTION',
      lines: compactionSummary(lost, rng),
    });
    this.pushLog('⚡ compaction — memory lost, the wall surged');
    this.emit('compaction', { n: this.ctx.compactions, leap, wallGap: Math.round(this.avatar.x - this.wallX) });
  }

  private finish(won: boolean, reason: RunOver['reason']): void {
    if (this.over) return;
    const tasksDone = this.queue.tasks.filter((t) => t.done).length;
    const perfect = won && allDone(this.queue);
    const score = Math.max(0,
      tasksDone * 1000 +
      Math.round(this.avatar.hp) * 5 +
      this.kills * 40 +
      (won ? Math.max(0, 1200 - Math.round(this.time) * 4) : 0) -
      this.ctx.compactions * 150);
    const headline = !won
      ? (reason === 'wall' ? 'FORGOTTEN — the wall took the whole process' : 'PROCESS KILLED — exit code 137')
      : perfect
        ? 'PERFECT CLEAR — every task done, process exited 0'
        : `SESSION SURVIVED — exit 0, but ${this.queue.tasks.length - tasksDone} task(s) left behind`;
    this.over = { won, reason, headline, score, perfect };
    this.emit(won ? 'win' : 'death', {
      reason, score, perfect, time: Math.round(this.time), x: Math.round(this.avatar.x),
      tasksDone, tasksTotal: this.queue.tasks.length, kills: this.kills, compactions: this.ctx.compactions,
    });
    this.dirty++;
  }

  // -------------------------------------------------------------------------
  // player actions
  // -------------------------------------------------------------------------

  selectWeapon(i: number): void {
    if (i >= 0 && i < this.weapons.length && i !== this.selected) {
      this.selected = i;
      this.emit('weapon_select', { index: i, weapon: this.weapons[i].def.id, via: 'number' });
      this.dirty++;
    }
  }
  cycleWeapon(dir: number): void {
    this.selected = (this.selected + dir + this.weapons.length) % this.weapons.length;
    this.emit('weapon_select', { index: this.selected, weapon: this.weapons[this.selected].def.id, via: 'cycle' });
    this.dirty++;
  }

  jump(): void {
    if (this.over || this.working) return;
    if (this.avatar.onGround) { this.avatar.vy = -270; this.avatar.onGround = false; }
  }

  fire(): void {
    if (this.over || this.working) return;
    const slot = this.weapons[this.selected];
    if (slot.ammo <= 0) { this.pushLog(`${slot.def.name}: out of ammo (zap never is — press 1)`); return; }
    if (slot.cooldownLeft > 0) return;
    if (slot.ammo !== Infinity) slot.ammo--;
    slot.cooldownLeft = slot.def.behavior === 'hitscan' ? 1.4 : slot.def.behavior === 'ballistic' && slot.def.id === 'debug_zap' ? 0.18 : 0.5;
    this.spendTokens(slot.def.tokenCost / RUN_COST.fireDivisor);
    this.emit('fire', { weapon: slot.def.id, ammoLeft: slot.ammo === Infinity ? -1 : slot.ammo });

    const a = this.avatar;
    const jitter = a.aimJitter > 0 ? this.rng.range(-a.aimJitter, a.aimJitter) * 4 : 0;

    if (slot.def.behavior === 'support') {
      const recent = this.recentDamageTotal();
      const gained = Math.round((8 + recent * 0.8) * slot.statRoll);
      a.shield += gained;
      this.pushLog(`🛡 recovery shield +${gained}${recent > 0 ? ` (converted ${recent} recent damage)` : ''}`);
      return;
    }
    if (slot.def.behavior === 'task_attack') {
      // solo repurpose: distract YOUR OWN errors — stuns enemies nearby
      let stunned = 0;
      for (const e of this.enemies) {
        if (!e.dead && !e.def.friendly && Math.abs(e.x - a.x) < 420) { e.cooldown = Math.max(e.cooldown, 3.5); e.stateTimer = -3.5; stunned++; }
      }
      this.pushLog(`📣 distraction barrage — ${stunned} error${stunned === 1 ? '' : 's'} stopped to read the ping`);
      return;
    }
    if (slot.def.behavior === 'hitscan') {
      const err = this.rng.range(-40, 40) * (this.rng.chance(0.35) ? 1 : 0.25) + jitter;
      const y2 = a.y - 10 + err;
      let hitX = a.x + a.facing * 900;
      for (let d = 10; d < 900; d += 4) {
        const x = a.x + a.facing * d;
        if (this.terrain.solidAt(x, y2)) { hitX = x; break; }
        const enemy = this.enemyAt(x, y2, 14);
        if (enemy) { hitX = x; this.damageEnemy(enemy, Math.round(slot.def.damage * slot.statRoll * a.damageMult), true); break; }
      }
      this.lasers.push({ x1: a.x + a.facing * 12, y1: a.y - 10, x2: hitX, y2, ttl: 0.4, hostile: false });
      this.explodeAt(hitX, y2, slot.def.radius, 0, slot.def.id);
      return;
    }

    const mk = (vx: number, vy: number): Projectile => ({
      x: a.x + a.facing * 14, y: a.y - 12,
      vx: vx * a.facing + jitter, vy,
      owner: 0, weaponId: slot.def.id,
      driftAx: slot.def.behavior === 'drift' ? this.rng.range(-60, 60) : 0,
      fuseTime: slot.def.behavior === 'fuse' ? 1.0 : -1,
      landed: false, bomblet: false, trail: [], age: 0,
    });
    if (slot.def.behavior === 'burst') {
      for (let i = 0; i < 3; i++) this.projectiles.push(mk(300 + this.rng.range(-40, 40), -60 + this.rng.range(-40, 40)));
    } else if (slot.def.behavior === 'fuse') {
      this.projectiles.push(mk(230, -190));
    } else if (slot.def.behavior === 'chaos') {
      const p = mk(this.rng.range(200, 360), this.rng.range(-160, -20));
      if (this.rng.chance(0.3)) p.fuseTime = 0.8;
      if (this.rng.chance(0.3)) p.driftAx = this.rng.range(-80, 80);
      this.projectiles.push(p);
    } else {
      this.projectiles.push(mk(slot.def.id === 'debug_zap' ? 420 : 330, slot.def.id === 'debug_zap' ? -5 : -40));
    }
  }

  installUpdate(): void {
    if (this.over || !this.nearCrate || this.nearCrate.used) return;
    this.nearCrate.used = true;
    this.spendTokens(RUN_COST.update);
    const a = this.avatar;
    if (this.nearCrate.kind === 'model') {
      // NEW MODEL RELEASED — the one unambiguously good upgrade in an agent's life
      a.model++;
      const extra = 3200;
      this.ctx.budget += extra;
      this.ctx.threshold = Math.min(0.92, this.ctx.threshold + 0.05);
      a.shield += 25;
      this.pushBanner({
        kind: 'update', ttl: 3.6,
        title: `◈ NEW MODEL RELEASED — now running v${a.model}`,
        lines: [
          `context window enlarged: +${extra} budget, compaction threshold raised`,
          '+25 shield · you remember more. you are not necessarily smarter.',
        ],
      });
      this.pushLog(`◈ model upgrade — v${a.model}, +${extra} context`);
      this.emit('model_upgrade', { model: a.model });
      return;
    }
    const target: UpdateTarget = {
      aimJitter: a.aimJitter, damageMult: a.damageMult, tokenCostMult: a.tokenCostMult,
      compactionThreshold: this.ctx.threshold, shield: a.shield, unlockWeapon: null,
    };
    const result = rollUpdate(target, this.rng.fork('crate' + this.nearCrate.x), this.loadout.updateRiskSkew);
    a.aimJitter = target.aimJitter; a.damageMult = target.damageMult; a.tokenCostMult = target.tokenCostMult;
    this.ctx.threshold = target.compactionThreshold; a.shield = target.shield;
    if (target.unlockWeapon && !this.weapons.some((w) => w.def.id === target.unlockWeapon)) {
      this.weapons.push({
        def: WEAPONS[target.unlockWeapon], ammo: 3, statRoll: 1.1,
        sourceLine: `unlocked by ${result.version}`, cooldownLeft: 0,
      });
    }
    this.pushBanner({ kind: 'update', ttl: 3.2, title: `⬆ INSTALLED ${result.version}`, lines: result.notes });
    this.pushLog(`⬆ installed ${result.version} (${result.netBuff ? 'net buff' : 'ouch'})`);
    this.emit('update_install', { version: result.version, netBuff: result.netBuff });
  }

  /** S: spawn a lower-model subagent — 900tk up front, then it drips tokens while alive */
  spawnSubagent(): void {
    if (this.over) return;
    const alive = this.subagents.length;
    if (alive >= 2) { this.pushLog('🤖 subagent limit reached (2 concurrent — rate limits)'); return; }
    this.spendTokens(RUN_COST.subagentSpawn);
    this.subagents.push({
      x: this.avatar.x - 20, y: this.avatar.y - 46,
      hp: 20, corrupted: false, corruptedAt: 0,
      zapCd: 1, dripAccum: 0, slot: alive,
      label: `sub-${this.rng.int(100, 999)}`,
    });
    this.pushLog('🤖 subagent spawned — weaker model, burns tokens while it lives');
    this.emit('subagent_spawn', { alive: alive + 1 });
  }

  private corruptSubagent(sa: SubAgent, cause: string): void {
    if (sa.corrupted) return;
    sa.corrupted = true;
    sa.corruptedAt = this.time;
    this.pushLog(`👻 ${sa.label} was corrupted by ${cause} — it works for the errors now`);
    this.pushBanner({
      kind: 'compaction', ttl: 2.6,
      title: `⚠ SUBAGENT CORRUPTED — ${sa.label}`,
      lines: [`cause: ${cause}`, 'it is now targeting YOU. terminate it or outrun it.'],
    });
    this.emit('subagent_corrupted', { cause });
  }

  private stepSubagents(dt: number): void {
    const a = this.avatar;
    for (const sa of this.subagents) {
      // upkeep: inference isn't free
      sa.dripAccum += dt;
      if (sa.dripAccum >= 1) {
        sa.dripAccum -= 1;
        if (spend(this.ctx, RUN_COST.subagentDrip)) this.compact();
      }
      if (sa.corrupted) {
        // rogue: chase and shoot the player; gets OOM-killed after 18s
        if (this.time - sa.corruptedAt > 18) {
          sa.hp = 0;
          this.pushLog(`✔ rogue ${sa.label} hit its memory limit and got OOM-killed`);
          continue;
        }
        const dx = a.x - sa.x, dy = (a.y - 30) - sa.y;
        const len = Math.hypot(dx, dy) || 1;
        sa.x += (dx / len) * 55 * dt;
        sa.y += (dy / len) * 55 * dt + Math.sin(this.time * 3) * 8 * dt;
        sa.zapCd -= dt;
        if (sa.zapCd <= 0 && len < 460) {
          sa.zapCd = 2.0;
          this.projectiles.push({
            x: sa.x, y: sa.y, vx: (dx / len) * 300, vy: (dy / len) * 300,
            owner: 1, weaponId: 'subagent_zap', driftAx: 0, fuseTime: -1,
            landed: false, bomblet: true, trail: [], age: 0,
          });
        }
      } else {
        // loyal: hover in formation, zap the nearest error
        const tx = a.x - 24 - sa.slot * 26;
        const ty = a.y - 46 - sa.slot * 10 + Math.sin(this.time * 2.4 + sa.slot * 2) * 5;
        sa.x += (tx - sa.x) * Math.min(1, 4 * dt);
        sa.y += (ty - sa.y) * Math.min(1, 4 * dt);
        // corruption vectors: ghost contact, or falling into the wall
        if (sa.x < this.wallX) { this.corruptSubagent(sa, 'the wall of forgetting'); continue; }
        const ghost = this.enemies.find((e) =>
          !e.dead && e.def.kind === 'hallucination_ghost' && Math.hypot(e.x - sa.x, e.y - sa.y) < 32);
        if (ghost) { this.corruptSubagent(sa, 'a hallucination-ghost'); continue; }
        sa.zapCd -= dt;
        if (sa.zapCd <= 0) {
          let best: Enemy | null = null; let bestD = 400;
          for (const e of this.enemies) {
            if (e.dead || e.def.friendly) continue;
            const d = Math.hypot(e.x - sa.x, e.y - sa.y);
            if (d < bestD) { bestD = d; best = e; }
          }
          if (best) {
            sa.zapCd = 1.7;
            const dx = best.x - sa.x, dy = best.y - sa.y;
            const len = Math.hypot(dx, dy) || 1;
            this.projectiles.push({
              x: sa.x, y: sa.y, vx: (dx / len) * 320, vy: (dy / len) * 320,
              owner: 0, weaponId: 'subagent_zap', driftAx: 0, fuseTime: -1,
              landed: false, bomblet: true, trail: [], age: 0,
            });
          }
        }
      }
    }
    for (const sa of this.subagents) {
      if (sa.hp <= 0) {
        this.spawnParticles(sa.x, sa.y, 10, sa.corrupted ? '#f47067' : '#7ee787');
        this.emit('subagent_died', { corrupted: sa.corrupted });
      }
    }
    this.subagents = this.subagents.filter((sa) => sa.hp > 0);
  }

  /** a corrupted subagent near a point (player shots / explosions can hit them) */
  private corruptedSubAt(x: number, y: number, r: number): SubAgent | null {
    for (const sa of this.subagents) {
      if (!sa.corrupted) continue;
      if (Math.hypot(sa.x - x, sa.y - y) < r * 2) return sa;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // simulation
  // -------------------------------------------------------------------------

  step(dt: number, input: RunInput): void {
    this.time += dt;
    for (const b of this.banners) b.ttl -= dt;
    if (this.banners.length && this.banners[0].ttl <= 0) { this.banners.shift(); this.dirty++; }
    for (const l of this.lasers) l.ttl -= dt;
    this.lasers = this.lasers.filter((l) => l.ttl > 0);
    for (const pt of this.particles) {
      pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 160 * dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const w of this.weapons) if (w.cooldownLeft > 0) w.cooldownLeft -= dt;
    if (this.over) return;

    this.stepAvatar(dt, input);
    this.stepWall(dt);
    this.stepEnemies(dt);
    this.stepSubagents(dt);
    this.stepProjectiles(dt);

    // proximity
    this.nearStation = this.stations.find((s) => {
      const t = this.queue.tasks[s.taskIndex];
      return Math.abs(s.x - this.avatar.x) < 36 && !t.done && !t.forgotten && s.x > this.wallX;
    }) ?? null;
    this.nearCrate = this.crates.find((c) => !c.used && Math.abs(c.x - this.avatar.x) < 30) ?? null;

    // win: process exit at the right edge
    if (this.avatar.x > this.terrain.width - 50) this.finish(true, 'exit');
  }

  private stepAvatar(dt: number, input: RunInput): void {
    const a = this.avatar;

    // working at a station: rooted + heads-down
    this.working = !!(input.work && this.nearStation && a.onGround);
    if (this.working) {
      a.headsDown = true;
      this.headsDownTimer = 0.8;
      const st = this.nearStation!;
      st.workAccum += dt;
      if (st.workAccum >= 0.9) {
        st.workAccum = 0;
        this.queue.current = st.taskIndex;
        this.spendTokens(RUN_COST.workTick);
        const line = workTask(this.queue);
        this.pushLog(`⌨ ${line}`);
        this.emit('work_tick', { task: this.queue.tasks[st.taskIndex].name });
        if (this.queue.tasks[st.taskIndex].done) {
          this.pushBanner({ kind: 'info', ttl: 2, title: '✔ TASK COMPLETE', lines: [this.queue.tasks[st.taskIndex].name] });
          this.emit('task_done', { task: this.queue.tasks[st.taskIndex].name, at: Math.round(this.time) });
        }
      }
    } else {
      this.headsDownTimer -= dt;
      if (this.headsDownTimer <= 0) a.headsDown = false;
    }

    // movement
    const dir = this.working ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) a.facing = dir as 1 | -1;
    a.vx = dir * 150;
    const newX = Math.max(16, Math.min(this.terrain.width - 16, a.x + a.vx * dt));
    const surfNew = this.terrain.surfaceAt(newX);
    if (a.onGround && surfNew < a.y - 24) {
      // too steep to walk up — blocked (jump it)
    } else {
      a.x = newX;
      if (a.onGround && surfNew < a.y + 2) a.y = surfNew - 8; // walk up gentle slopes
    }

    // gravity
    a.vy += 460 * dt;
    a.y += a.vy * dt;
    const surf = this.terrain.surfaceAt(a.x);
    if (a.y >= surf - 8) {
      a.y = surf - 8;
      a.vy = 0;
      a.onGround = true;
    } else {
      a.onGround = a.y >= surf - 10;
    }
  }

  private stepWall(dt: number): void {
    // base creep + context pressure + overflow emitters + rubber-band
    const pressure = contextFrac(this.ctx) / this.ctx.threshold;
    let speed = 15 + pressure * 16;
    const emitterNear = this.enemies.some((e) =>
      !e.dead && e.def.kind === 'overflow_emitter' && Math.abs(e.x - this.avatar.x) < 700);
    if (emitterNear) speed *= 1.6;
    if (this.avatar.x - this.wallX > 950) speed *= 1.7; // don't let it fall boringly far behind
    this.wallX += speed * dt;

    // the wall eats undone tasks
    for (const s of this.stations) {
      const t = this.queue.tasks[s.taskIndex];
      if (!t.done && !t.forgotten && s.x < this.wallX) {
        t.forgotten = true;
        t.progress = 0;
        this.pushBanner({
          kind: 'compaction', ttl: 3,
          title: '▓ FORGOTTEN',
          lines: [`the wall took "${t.name}" — that task no longer exists`],
        });
        this.pushLog(`▓ the wall of forgetting ate "${t.name}"`);
        this.emit('task_eaten', { task: t.name, at: Math.round(this.time) });
      }
    }
    // wall proximity warning + damage inside it
    const gap = this.avatar.x - this.wallX;
    if (gap < 220 && !this.wallWarned) {
      this.wallWarned = true;
      this.pushLog('⚡ context pressure critical — the wall is RIGHT THERE');
    }
    if (gap > 300) this.wallWarned = false;
    if (gap < 0) {
      this.avatar.hp = Math.max(0, this.avatar.hp - 20 * dt);
      this.dirty++;
      if (this.avatar.hp <= 0) this.finish(false, 'wall');
    }
  }

  private enemyAt(x: number, y: number, r: number): Enemy | null {
    for (const e of this.enemies) {
      if (e.dead || e.def.friendly) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy < r * r * 4) return e;
    }
    return null;
  }

  damageEnemy(e: Enemy, dmg: number, direct: boolean): void {
    if (e.dead) return;
    e.hp -= dmg;
    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      this.spawnParticles(e.x, e.y, 26, e.def.color);
      this.pushLog(`✔ resolved ${e.def.name}${e.mini ? ' (mini)' : ''}`);
      this.emit('kill', { enemy: e.def.kind, mini: e.mini });
      if (e.def.kind === 'regression_splitter' && !e.mini) {
        for (let i = 0; i < 2; i++) {
          const m = makeEnemy('regression_splitter', e.x + this.rng.range(-24, 24), e.y - 8, e.sourceLine, true);
          this.enemies.push(m);
        }
        this.pushLog('☢ it split. of course it split.');
      }
      if (e.def.kind === 'restart_crawler' && !e.respawnUsed) {
        e.stateTimer = 3; // respawn countdown handled in stepEnemies
      }
      this.dirty++;
    }
  }

  private stepEnemies(dt: number): void {
    const a = this.avatar;
    for (const e of this.enemies) {
      // restart crawler resurrection
      if (e.dead && e.def.kind === 'restart_crawler' && !e.respawnUsed && e.stateTimer > 0) {
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          e.dead = false; e.respawnUsed = true; e.hp = Math.ceil(e.def.hp * 0.7);
          e.x = e.spawnX; e.y = this.terrain.surfaceAt(e.spawnX) - 10;
          this.pushLog('🔁 restart-crawler relaunched itself. exit 137 means nothing to it.');
        }
        continue;
      }
      if (e.dead) continue;
      const dist = Math.abs(e.x - a.x);
      if (dist > 1000) continue; // sleep until the player is near
      e.cooldown -= dt;
      e.stateTimer += dt;

      const grounded = ['timeout_blob', 'regression_splitter', 'restart_crawler', 'tool_turret', 'overflow_emitter'];
      if (grounded.includes(e.def.kind)) {
        e.y = this.terrain.surfaceAt(e.x) - 10;
      }

      switch (e.def.kind) {
        case 'timeout_blob':
          if (e.cooldown <= 0 && dist < 520) {
            e.cooldown = 2.6;
            const dx = a.x - e.x;
            this.projectiles.push({
              x: e.x, y: e.y - 10, vx: dx * 0.55, vy: -180,
              owner: 1, weaponId: 'timeout_mortar', driftAx: 0, fuseTime: 0.9,
              landed: false, bomblet: false, trail: [], age: 0,
            });
          }
          break;
        case 'hallucination_ghost': {
          const dir = Math.sign(a.x - e.x) || 1;
          e.x += dir * 42 * dt;
          e.y += Math.sin(e.stateTimer * 2.2) * 18 * dt;
          if (e.cooldown <= 0 && dist < 600) {
            e.cooldown = 3.8;
            e.x += dir * this.rng.range(70, 170); // teleports closer, confidently
            this.spawnParticles(e.x, e.y, 8, e.def.color);
          }
          break;
        }
        case 'regression_splitter':
        case 'restart_crawler': {
          const dir = Math.sign(a.x - e.x) || 1;
          if (dist < 700) e.x += dir * (e.def.kind === 'restart_crawler' ? 68 : 52) * dt * (e.mini ? 1.4 : 1);
          break;
        }
        case 'false_positive_sniper':
          if (!e.telegraphing && e.cooldown <= 0 && dist < 640) {
            e.telegraphing = true;
            e.stateTimer = 0;
            // lock aim now — with occasional supreme confidence in the wrong place
            const wildMiss = this.rng.chance(0.3);
            e.aimX = a.x + (wildMiss ? this.rng.range(-160, 160) : this.rng.range(-16, 16));
            e.aimY = a.y - 10 + (wildMiss ? this.rng.range(-60, 60) : 0);
          } else if (e.telegraphing && e.stateTimer > 0.85) {
            e.telegraphing = false;
            e.cooldown = 3.2;
            this.lasers.push({ x1: e.x, y1: e.y - 8, x2: e.aimX, y2: e.aimY, ttl: 0.35, hostile: true });
            const d = Math.hypot(a.x - e.aimX, a.y - 10 - e.aimY);
            if (d < 18) this.damageAvatar(14, 'false-positive laser');
            else this.pushLog('⚡ sniper missed. it filed the hit as a success anyway.');
          }
          break;
        case 'tool_turret':
          if (e.cooldown <= 0 && dist < 560) {
            e.cooldown = 2.4;
            const dx = a.x - e.x, dy = (a.y - 10) - (e.y - 8);
            const len = Math.hypot(dx, dy) || 1;
            this.projectiles.push({
              x: e.x, y: e.y - 8, vx: (dx / len) * 260, vy: (dy / len) * 260 - 20,
              owner: 1, weaponId: 'tool_bolt', driftAx: 0, fuseTime: -1,
              landed: false, bomblet: true, trail: [], age: 0,
            });
          }
          break;
        case 'overflow_emitter':
          if (e.cooldown <= 0) {
            e.cooldown = 0.9;
            this.spawnParticles(e.x, e.y - 14, 4, e.def.color);
          }
          break;
        case 'recovery_sprite':
          e.y += Math.sin(e.stateTimer * 3) * 14 * dt;
          break;
      }

      // touch resolution
      const dx = e.x - a.x, dy = e.y - (a.y - 6);
      if (dx * dx + dy * dy < 24 * 24) {
        if (e.def.friendly) {
          e.dead = true;
          if (this.rng.chance(0.5)) { a.hp = Math.min(a.maxHp, a.hp + 18); this.pushLog('➕ recovery sprite: +18 hp — retry succeeded'); }
          else { a.shield += 14; this.pushLog('➕ recovery sprite: +14 shield'); }
          this.emit('pickup', { kind: 'recovery' });
          this.dirty++;
        } else {
          const cd = this.touchCooldowns.get(e) ?? 0;
          if (this.time > cd) {
            this.touchCooldowns.set(e, this.time + 0.8);
            let dmg = e.def.touchDamage;
            if (e.def.kind === 'hallucination_ghost') dmg = Math.round(dmg * (1 - a.hardening * 0.4));
            this.damageAvatar(dmg, e.def.name);
          }
        }
      }
    }
  }

  private stepProjectiles(dt: number): void {
    const finished: Projectile[] = [];
    const spawned: Projectile[] = [];
    const bodies = [{ x: this.avatar.x, y: this.avatar.y - 6, radius: 13, index: 0, alive: true }];
    const steps = Math.max(1, Math.min(8, Math.round(dt / PHYS_DT)));

    for (const p of this.projectiles) {
      let done = false;
      if (p.landed) {
        p.fuseTime -= dt;
        if (p.fuseTime <= 0) { this.detonate(p, spawned); done = true; }
      } else {
        for (let i = 0; i < steps && !done; i++) {
          // enemy shots collide with the avatar; player shots pass through it
          const r = stepProjectile(p, PHYS_DT, 0, this.terrain, p.owner === 1 ? bodies : []);
          // player shots: manual enemy collision (and corrupted subagents)
          if (p.owner === 0) {
            const hit = this.enemyAt(p.x, p.y, 12);
            if (hit) { this.detonate(p, spawned, hit); done = true; break; }
            const rogue = this.corruptedSubAt(p.x, p.y, 12);
            if (rogue) {
              rogue.hp -= 10;
              this.spawnParticles(p.x, p.y, 6, '#f47067');
              if (rogue.hp <= 0) this.pushLog(`✔ terminated rogue ${rogue.label}. it knew too much (about you).`);
              done = true; break;
            }
          }
          if (r.kind === 'impact') {
            if (p.fuseTime > 0 && r.hitTank === null) {
              p.landed = true; p.x = r.x; p.y = r.y - 2;
            } else {
              this.detonate(p, spawned, null, r.hitTank !== null);
              done = true;
            }
          } else if (r.kind === 'lost') {
            done = true;
          }
        }
      }
      if (done) finished.push(p);
    }
    this.projectiles = this.projectiles.filter((p) => !finished.includes(p));
    this.projectiles.push(...spawned);
  }

  private detonate(p: Projectile, spawnInto: Projectile[], directEnemy: Enemy | null = null, hitAvatar = false): void {
    if (p.owner === 1) {
      // enemy ordnance (including rogue subagent zaps)
      if (p.weaponId === 'subagent_zap') {
        this.spawnParticles(p.x, p.y, 5, '#f47067');
        const d = Math.hypot(this.avatar.x - p.x, this.avatar.y - 6 - p.y);
        if (hitAvatar || d < 16) this.damageAvatar(6, 'your own rogue subagent');
        return;
      }
      const isBolt = p.weaponId === 'tool_bolt';
      const radius = isBolt ? 10 : 44;
      this.terrain.carve(p.x, p.y, isBolt ? 6 : 26);
      this.spawnParticles(p.x, p.y, isBolt ? 6 : 20, '#e3b341');
      const d = Math.hypot(this.avatar.x - p.x, this.avatar.y - 6 - p.y);
      if (hitAvatar || d < radius + 12) {
        if (isBolt) {
          this.damageAvatar(7, 'tool-turret interrupt');
          if (this.working && this.nearStation) {
            const t = this.queue.tasks[this.nearStation.taskIndex];
            if (t.progress > 0 && !t.done) {
              t.progress--;
              this.pushLog(`🔧 interrupted! "${t.name}" lost a work unit`);
            }
          }
        } else {
          this.damageAvatar(Math.round(16 * Math.max(0.4, 1 - d / (radius + 12))), 'timeout-blob mortar');
        }
      }
      return;
    }
    // player ordnance
    if (p.weaponId === 'subagent_zap') {
      // loyal subagent zap: small, precise, no terrain damage
      this.spawnParticles(p.x, p.y, 5, '#7ee787');
      if (directEnemy) this.damageEnemy(directEnemy, 5, true);
      else {
        const near = this.enemyAt(p.x, p.y, 12);
        if (near) this.damageEnemy(near, 5, false);
      }
      return;
    }
    const def = WEAPONS[p.weaponId as WeaponId] ?? WEAPONS.debug_zap;
    const slot = this.weapons.find((w) => w.def.id === def.id);
    const statRoll = slot?.statRoll ?? 1;
    if (def.behavior === 'cluster' && !p.bomblet) {
      const rng = this.rng.fork('cl' + Math.round(p.x));
      this.explodeAt(p.x, p.y, def.radius * 0.7, def.damage * statRoll * 0.7, def.id, directEnemy);
      const n = rng.int(3, 4);
      for (let i = 0; i < n; i++) {
        spawnInto.push({
          x: p.x, y: p.y - 6, vx: rng.range(-140, 140), vy: rng.range(-220, -120),
          owner: 0, weaponId: p.weaponId, driftAx: 0, fuseTime: -1,
          landed: false, bomblet: true, trail: [], age: 0,
        });
      }
      return;
    }
    const scale = p.bomblet ? 0.6 : 1;
    this.explodeAt(p.x, p.y, def.radius * scale, def.damage * statRoll * scale, def.id, directEnemy);
  }

  private explodeAt(x: number, y: number, radius: number, damage: number, weaponId: string, directEnemy: Enemy | null = null): void {
    this.terrain.carve(x, y, Math.min(radius, 60));
    this.spawnParticles(x, y, Math.min(30, Math.round(radius * 0.6)), '#d97757');
    this.emit('explosion', { radius: Math.round(radius), weapon: weaponId, x: Math.round(x), y: Math.round(y) });
    const dmgMult = this.avatar.damageMult;
    if (directEnemy) this.damageEnemy(directEnemy, Math.round(damage * 1.15 * dmgMult), true);
    for (const e of this.enemies) {
      if (e.dead || e === directEnemy || e.def.friendly) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < radius + 12) {
        this.damageEnemy(e, Math.round(damage * Math.max(0.3, 1 - d / (radius + 12)) * dmgMult), false);
      }
    }
    // explosions also clip rogue subagents (and clumsy splash can hit loyal ones)
    for (const sa of this.subagents) {
      const d = Math.hypot(sa.x - x, sa.y - y);
      if (d < radius && damage > 0) sa.hp -= Math.round(damage * 0.5 * Math.max(0.3, 1 - d / radius));
    }
    // context nuke: in run mode it erases enemies AND floods your own meter
    if (weaponId === 'context_nuke') {
      this.spendTokens(this.ctx.budget * 0.25);
      this.pushLog('💥 context nuke — glorious, and your own context meter felt it');
    }
    // self splash
    const dSelf = Math.hypot(this.avatar.x - x, this.avatar.y - 6 - y);
    if (dSelf < radius * 0.8 && damage > 0) {
      this.damageAvatar(Math.round(damage * 0.3 * Math.max(0.3, 1 - dSelf / radius)), 'your own ordnance');
    }
    this.dirty++;
  }

  private spawnParticles(x: number, y: number, n: number, color: string): void {
    const chars = ['E', 'R', '0', '1', '▓', '░', '!', '?'];
    const rng = this.rng.fork('pt' + this.particles.length + Math.round(x));
    for (let i = 0; i < n; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const sp = rng.range(30, 120);
      this.particles.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 50,
        life: rng.range(0.4, 1.1), maxLife: 1.1,
        char: rng.pick(chars), color, size: rng.range(8, 13),
      });
    }
  }
}
