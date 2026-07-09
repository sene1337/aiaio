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

