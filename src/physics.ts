// Projectile physics: gravity + per-round wind, fixed-timestep integration,
// terrain and tank collision. Also a headless shot simulator used by the CPU AI.

import { Terrain } from './terrain';

export const GRAVITY = 240;        // px/s^2
export const WIND_ACCEL_SCALE = 9; // wind value (-10..10) -> px/s^2
export const PHYS_DT = 1 / 120;    // fixed physics step

export interface Projectile {
  x: number; y: number;
  vx: number; vy: number;
  /** owner player index */
  owner: number;
  /** weapon this projectile belongs to */
  weaponId: string;
  /** drift accel applied mid-flight (hallucination missile) */
  driftAx: number;
  /** fuse: seconds to sit armed after landing before detonating (-1 = none) */
  fuseTime: number;
  /** where it landed while fused */
  landed: boolean;
  /** is this a cluster bomblet (prevents re-splitting) */
  bomblet: boolean;
  /** trail points for rendering */
  trail: Array<{ x: number; y: number }>;
  /** seconds alive, for trail thinning + failsafes */
  age: number;
}

export function makeProjectile(
  x: number, y: number, angleDeg: number, power: number, owner: number, weaponId: string,
): Projectile {
  const rad = (angleDeg * Math.PI) / 180;
  const speed = 90 + power * 6.4; // power 0..100
  return {
    x, y,
    vx: Math.cos(rad) * speed,
    vy: -Math.sin(rad) * speed,
    owner, weaponId,
    driftAx: 0, fuseTime: -1, landed: false, bomblet: false,
    trail: [], age: 0,
  };
}

export interface TankBody { x: number; y: number; radius: number; index: number; alive: boolean }

export type StepResult =
  | { kind: 'flying' }
  | { kind: 'impact'; x: number; y: number; hitTank: number | null }
  | { kind: 'lost' }; // left the arena sideways/top-forever

/** Advance one projectile by dt. Mutates p. */
export function stepProjectile(
  p: Projectile, dt: number, wind: number, terrain: Terrain, tanks: TankBody[],
): StepResult {
  p.age += dt;
  if (p.age > 30) return { kind: 'lost' }; // failsafe

  if (p.landed) return { kind: 'flying' }; // fused rounds are advanced by game timer, not physics

  const ax = wind * WIND_ACCEL_SCALE + p.driftAx;
  p.vx += ax * dt;
  p.vy += GRAVITY * dt;

  // substep so fast rounds can't tunnel through thin terrain
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 2));
  for (let i = 0; i < steps; i++) {
    p.x += (p.vx * dt) / steps;
    p.y += (p.vy * dt) / steps;

    for (const t of tanks) {
      if (!t.alive || t.index === p.owner && p.age < 0.25) continue;
      const dx = p.x - t.x, dy = p.y - t.y;
      if (dx * dx + dy * dy < t.radius * t.radius) {
        return { kind: 'impact', x: p.x, y: p.y, hitTank: t.index };
      }
    }
    if (terrain.solidAt(p.x, p.y)) {
      return { kind: 'impact', x: p.x, y: p.y, hitTank: null };
    }
    if (p.x < -200 || p.x > terrain.width + 200 || p.y > terrain.height + 50) {
      return { kind: 'lost' };
    }
  }
  if (p.trail.length === 0 || Math.hypot(p.x - p.trail[p.trail.length - 1].x, p.y - p.trail[p.trail.length - 1].y) > 6) {
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 80) p.trail.shift();
  }
  return { kind: 'flying' };
}

/**
 * Headless simulation of a plain ballistic shot — used by the CPU to aim.
 * Returns the landing point, or null if the shot leaves the arena.
 */
export function simulateShot(
  fromX: number, fromY: number, angleDeg: number, power: number,
  wind: number, terrain: Terrain, tanks: TankBody[], ownerIndex: number,
): { x: number; y: number; hitTank: number | null } | null {
  const p = makeProjectile(fromX, fromY, angleDeg, power, ownerIndex, 'sim');
  for (let i = 0; i < 30 / PHYS_DT; i++) {
    const r = stepProjectile(p, PHYS_DT, wind, terrain, tanks);
    if (r.kind === 'impact') return { x: r.x, y: r.y, hitTank: r.hitTank };
    if (r.kind === 'lost') return null;
  }
  return null;
}

/** Ray-march a hitscan laser until it hits terrain, a tank, or leaves the arena. */
export function traceLaser(
  fromX: number, fromY: number, angleDeg: number,
  terrain: Terrain, tanks: TankBody[], ownerIndex: number,
): { x: number; y: number; hitTank: number | null } {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad), dy = -Math.sin(rad);
  let x = fromX, y = fromY;
  for (let i = 0; i < 4000; i++) {
    x += dx; y += dy;
    for (const t of tanks) {
      if (!t.alive || t.index === ownerIndex) continue;
      const ddx = x - t.x, ddy = y - t.y;
      if (ddx * ddx + ddy * ddy < t.radius * t.radius) return { x, y, hitTank: t.index };
    }
    if (terrain.solidAt(x, y)) return { x, y, hitTank: null };
    if (x < -100 || x > terrain.width + 100 || y < -800 || y > terrain.height + 50) break;
  }
  return { x, y, hitTank: null };
}
