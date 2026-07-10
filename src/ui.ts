// Rendering + HUD for SESSION RUN, styled as an agent-harness TUI (Claude Code /
// Hermes): character meters, ☐/☒ todos, ⏺/⎿ transcript, boxed > prompt, and the
// wall of forgetting rendered as spreading memory corruption.

import { Run, Banner, RUN_COST, ZAP_BURST } from './run';
import { contextFrac } from './context';
import { garble } from './context';
import { Rng } from './rng';
import { AgentLoadout, SessionCard } from './session';
import { WEAPONS } from './weapons';
import { ENEMY_DEFS, categoryToEnemy, EnemyKind, allocateSpawns } from './enemies';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

function textBar(frac: number, width = 10): string {
  const f = Math.max(0, Math.min(1, frac));
  const fill = Math.round(f * width);
  return '█'.repeat(fill) + '░'.repeat(width - fill);
}

function kebab(name: string): string {
  return name.toLowerCase().replace(/ /g, '-');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

const CORRUPT_GLYPHS = ['▓', '░', '▒', '█', '0', '1', '?', 'x'];

export class UI {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camX = 0; private camY = 0; private camZoom = 1;
  private trackedRun: Run | null = null;
  private dpr = 1;
  private lastDirty = -1;
  private lastBannerCount = -1;
  private lastPrompt = '';
  private garbleRng = new Rng('ui-garble');
  private time = 0;
  // effect state
  private shakeMag = 0;
  private glitchTtl = 0;
  private hitFlashTtl = 0;
  private muzzleTtl = 0;
  private whiteFlashTtl = 0;
  private rings: Array<{ x: number; y: number; maxR: number; ttl: number; maxTtl: number; color: string }> = [];
  private fxRng = new Rng('fx');

  constructor() {
    this.canvas = $('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** visual reactions to game events (wired from main alongside audio + telemetry) */
  fx(type: string, data: Record<string, unknown> = {}): void {
    switch (type) {
      case 'explosion': this.shakeMag = Math.min(14, this.shakeMag + (Number(data.radius) || 20) / 6); break;
      case 'fire': this.muzzleTtl = 0.09; this.shakeMag = Math.min(14, this.shakeMag + 1.2); break;
      case 'damage': this.hitFlashTtl = 0.3; this.shakeMag = Math.min(14, this.shakeMag + 3); break;
      case 'compaction': this.glitchTtl = 1.0; this.shakeMag = Math.min(16, this.shakeMag + 9); break;
      case 'task_eaten': this.glitchTtl = Math.max(this.glitchTtl, 0.5); break;
      case 'subagent_corrupted': this.glitchTtl = Math.max(this.glitchTtl, 0.35); break;
      case 'distraction': {
        // the @here ping: a wave that radiates exactly to the stun radius
        const x = Number(data.x) || 0, y = Number(data.y) || 0;
        this.rings.push({ x, y, maxR: 420, ttl: 0.8, maxTtl: 0.8, color: '#e3b341' });
        this.rings.push({ x, y, maxR: 300, ttl: 0.65, maxTtl: 0.8, color: 'rgba(227,179,65,0.5)' });
        break;
      }
      case 'kill': {
        const x = Number(data.x) || 0, y = Number(data.y) || 0;
        const direct = data.direct === true;
        if (data.by === 'sub') {
          // delegated kill: one small soft green ring, no flash, no shake
          this.rings.push({ x, y, maxR: 26, ttl: 0.35, maxTtl: 0.35, color: '#7ee787' });
          break;
        }
        this.rings.push({ x, y, maxR: direct ? 64 : 40, ttl: 0.45, maxTtl: 0.45, color: '#dedad2' });
        if (direct) {
          this.rings.push({ x, y, maxR: 96, ttl: 0.6, maxTtl: 0.6, color: '#e3b341' });
          this.whiteFlashTtl = 0.08;
          this.shakeMag = Math.min(16, this.shakeMag + 7);
        } else {
          this.shakeMag = Math.min(16, this.shakeMag + 2.5);
        }
        break;
      }
      case 'death': this.glitchTtl = 1.4; this.shakeMag = 16; break;
    }
  }

  // -------------------------------------------------------------------------
  // per-frame canvas rendering
  // -------------------------------------------------------------------------

  render(run: Run, dt: number): void {
    this.time += dt;
    const c = this.canvas;
    const wrap = c.parentElement!;
    // HiDPI: back the canvas at devicePixelRatio so the TUI text stays crisp (M-4)
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = wrap.clientWidth || 800, ch = wrap.clientHeight || 450;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // all drawing below is in CSS pixels
    this.dpr = dpr;
    const W = cw, H = ch;

    // camera: follow the agent with lookahead toward facing
    const targetZoom = Math.min(1.05, Math.max(0.68, H / 760));
    const targetX = run.avatar.x + run.avatar.facing * 130;
    const targetY = Math.min(run.avatar.y - 60, run.terrain.height * 0.62);
    if (this.trackedRun !== run) {
      this.trackedRun = run;
      this.camZoom = targetZoom; this.camX = targetX; this.camY = targetY;
    }
    const lerp = 1 - Math.pow(0.002, dt);
    this.camZoom += (targetZoom - this.camZoom) * lerp;
    this.camX += (targetX - this.camX) * lerp;
    this.camY += (targetY - this.camY) * lerp;
    const viewW = W / this.camZoom, viewH = H / this.camZoom;
    this.camX = Math.max(Math.min(this.camX, run.terrain.width - viewW / 2), viewW / 2);
    if (viewW >= run.terrain.width) this.camX = run.terrain.width / 2;
    this.camY = Math.max(Math.min(this.camY, run.terrain.height - viewH / 2), viewH / 2);
    if (viewH >= run.terrain.height) this.camY = run.terrain.height / 2;

    // sky
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a0b0d');
    grad.addColorStop(0.7, '#101310');
    grad.addColorStop(1, '#0f0f0e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // decay effects
    this.shakeMag = Math.max(0, this.shakeMag - 26 * dt);
    this.glitchTtl = Math.max(0, this.glitchTtl - dt);
    this.hitFlashTtl = Math.max(0, this.hitFlashTtl - dt);
    this.muzzleTtl = Math.max(0, this.muzzleTtl - dt);

    ctx.save();
    if (this.shakeMag > 0.2) {
      ctx.translate(this.fxRng.range(-this.shakeMag, this.shakeMag), this.fxRng.range(-this.shakeMag, this.shakeMag));
    }
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);
    const viewL = this.camX - viewW / 2, viewR = this.camX + viewW / 2;

    // ambient memory motes drifting up through the session
    ctx.font = '10px monospace';
    for (let i = 0; i < 26; i++) {
      const seedX = (i * 379 + 131) % 1000 / 1000;
      const mx = viewL + ((seedX * viewW + this.time * (6 + (i % 5) * 3)) % viewW);
      const my = ((i * 613 + 89) % 1000 / 1000) * run.terrain.height - ((this.time * (4 + (i % 3) * 2)) % run.terrain.height);
      const wrapped = ((my % run.terrain.height) + run.terrain.height) % run.terrain.height;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(217,119,87,0.10)' : 'rgba(126,231,135,0.08)';
      ctx.fillText(['0', '1', '·', '▪', ':'][i % 5], mx, wrapped);
    }

    // faint memory grid
    ctx.strokeStyle = 'rgba(126,231,135,0.05)';
    ctx.lineWidth = 1 / this.camZoom;
    ctx.beginPath();
    for (let x = Math.floor(viewL / 120) * 120; x < viewR; x += 120) { ctx.moveTo(x, 0); ctx.lineTo(x, run.terrain.height); }
    for (let y = 0; y < run.terrain.height; y += 120) { ctx.moveTo(viewL, y); ctx.lineTo(viewR, y); }
    ctx.stroke();

    // terrain
    ctx.drawImage(run.terrain.canvas as CanvasImageSource, 0, 0);

    // process exit marker at the right edge
    this.drawExit(ctx, run);

    // task stations + crates + session moments
    for (const s of run.stations) this.drawStation(ctx, run, s);
    for (const cr of run.crates) this.drawCrate(ctx, run, cr);
    // the Task-tool permission terminal: a little [y/n] prompt standing in the world
    if (run.permTerminal && !run.permTerminal.claimed) {
      const pt = run.permTerminal;
      const y = run.terrain.surfaceAt(pt.x);
      const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.time * 2.2));
      ctx.fillStyle = '#161615';
      ctx.strokeStyle = `rgba(126,231,135,${pulse})`;
      ctx.lineWidth = 1.5;
      ctx.fillRect(pt.x - 26, y - 26, 52, 22);
      ctx.strokeRect(pt.x - 26, y - 26, 52, 22);
      ctx.fillStyle = '#dedad2';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Task tool?', pt.x, y - 17);
      ctx.fillStyle = `rgba(126,231,135,${pulse})`;
      ctx.fillText('[y/n]', pt.x, y - 8);
      ctx.font = `${10 / this.camZoom}px ui-monospace, monospace`;
      ctx.fillText(run.nearPermTerminal ? '[U — grant permission]' : '✳ subagent permission', pt.x, y - 36);
      ctx.textAlign = 'left';
    }
    for (const m of run.moments) {
      if (m.x < viewL - 60 || m.x > viewR + 60) continue;
      const y = run.terrain.surfaceAt(m.x);
      const near = Math.abs(m.x - run.avatar.x) < 220;
      const color = m.kind === 'win' ? '#7ee787' : m.kind === 'frustration' ? '#f47067' : '#6cb6ff';
      ctx.globalAlpha = m.seen ? 0.35 : near ? 0.95 : 0.55;
      ctx.fillStyle = color;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('◇', m.x, y - 18 + (m.seen ? 0 : Math.sin(this.time * 2.5 + m.x) * 3));
      if (near && !m.seen) {
        ctx.font = `${10 / this.camZoom}px ui-monospace, monospace`;
        ctx.fillText(`"${m.text.slice(0, 42)}${m.text.length > 42 ? '…' : ''}"`, m.x, y - 32);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    // enemies
    for (const e of run.enemies) {
      if (e.dead || e.x < viewL - 60 || e.x > viewR + 60) continue;
      this.drawEnemy(ctx, e, e.stunnedUntil > run.time);
    }

    // the agent + its subagents
    this.drawAvatar(ctx, run);
    this.drawSubagents(ctx, run);

    // projectiles: the payload IS the projectile — text in flight, with a
    // comet-trail of its own characters
    for (const proj of run.projectiles) {
      const color = proj.owner === 0 ? '#d3f9d8' : '#ffe2a8';
      if (proj.flight) {
        // symbols fly: animated head glyph + a fading stream of trail glyphs
        const fl = proj.flight;
        ctx.font = '10px monospace';
        for (let i = Math.max(0, proj.trail.length - 9); i < proj.trail.length; i++) {
          const t = proj.trail[i];
          const back = proj.trail.length - 1 - i; // 0 = newest
          const fade = 1 - back / 9;
          ctx.globalAlpha = Math.max(0.05, fade * 0.55);
          ctx.fillStyle = proj.owner === 0 ? '#7ee787' : '#e3b341';
          ctx.fillText(fl.trail[Math.min(back, fl.trail.length - 1)], t.x, t.y);
        }
        ctx.globalAlpha = 1;
        const head = fl.head[Math.floor(this.time * 10) % fl.head.length];
        if (proj.landed) {
          const blink = Math.sin(this.time * 20) > 0;
          ctx.fillStyle = blink ? '#f47067' : '#e3b341';
          ctx.font = 'bold 13px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(head, proj.x, proj.y - 4);
          ctx.textAlign = 'left';
        } else {
          ctx.font = `bold ${proj.weaponId === 'context_nuke' ? 15 : 12}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillText(head, proj.x + 1, proj.y + 1);
          ctx.fillStyle = color;
          ctx.fillText(head, proj.x, proj.y);
          ctx.textAlign = 'left';
        }
      } else {
        ctx.strokeStyle = proj.owner === 0 ? 'rgba(126,231,135,0.35)' : 'rgba(227,179,65,0.4)';
        ctx.lineWidth = 1.5 / this.camZoom;
        ctx.beginPath();
        for (let i = 0; i < proj.trail.length; i++) {
          const t = proj.trail[i];
          if (i === 0) ctx.moveTo(t.x, t.y); else ctx.lineTo(t.x, t.y);
        }
        ctx.stroke();
        ctx.fillStyle = proj.landed ? '#f47067' : color;
        ctx.beginPath(); ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // lasers
    for (const l of run.lasers) {
      ctx.strokeStyle = l.hostile ? `rgba(244,112,103,${Math.min(1, l.ttl * 3)})` : `rgba(126,231,135,${Math.min(1, l.ttl * 3)})`;
      ctx.lineWidth = 2.5 / this.camZoom;
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    }
    // sniper telegraphs
    for (const e of run.enemies) {
      if (!e.dead && e.telegraphing) {
        ctx.strokeStyle = `rgba(244,112,103,${0.15 + 0.35 * Math.abs(Math.sin(this.time * 10))})`;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1 / this.camZoom;
        ctx.beginPath(); ctx.moveTo(e.x, e.y - 8); ctx.lineTo(e.aimX, e.aimY); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // glyph particles
    for (const pt of run.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.font = `${pt.size}px monospace`;
      ctx.fillText(pt.char, pt.x, pt.y);
    }
    ctx.globalAlpha = 1;

    // glyph shockwave rings — expanding circles drawn OF characters
    for (const ring of this.rings) {
      ring.ttl -= dt;
      const age = 1 - ring.ttl / ring.maxTtl;
      const r = ring.maxR * (1 - Math.pow(1 - age, 2)); // ease-out expansion
      const n = Math.max(8, Math.round(r * 0.55));
      ctx.globalAlpha = Math.max(0, ring.ttl / ring.maxTtl);
      ctx.fillStyle = ring.color;
      ctx.font = `${10 + age * 4}px monospace`;
      const glyph = ['░', '▒', '▓', '·'][Math.floor(age * 3.9)];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + age * 0.6;
        ctx.fillText(glyph, ring.x + Math.cos(a) * r, ring.y + Math.sin(a) * r);
      }
    }
    this.rings = this.rings.filter((ring) => ring.ttl > 0);
    ctx.globalAlpha = 1;

    // kill-word popups: pop-in overshoot, hold, fade
    for (const p of run.popups) {
      const age = 1 - p.ttl / p.maxTtl;
      const popIn = Math.min(1, age * 6);
      const scale = popIn * (1 + 0.35 * Math.sin(Math.min(popIn, 1) * Math.PI));
      const alpha = p.ttl < 0.25 ? p.ttl / 0.25 : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const px = (p.big ? 17 : 13) * scale / this.camZoom;
      ctx.font = `bold ${px}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      // drop-shadow for punch
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(p.text, p.x + 1.5, p.y - age * 18 + 1.5);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - age * 18);
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;

    // THE WALL OF FORGETTING — everything left of it corrupts
    this.drawWall(ctx, run, viewL);

    ctx.restore();

    // screen-space effects (post-world)
    if (this.glitchTtl > 0) {
      // horizontal band displacement — the canvas tearing itself apart
      const bands = 5 + Math.floor(this.glitchTtl * 6);
      for (let i = 0; i < bands; i++) {
        const by = Math.floor(this.fxRng.range(0, H - 14));
        const bh = Math.floor(this.fxRng.range(3, 14));
        const off = Math.round(this.fxRng.range(-28, 28) * this.glitchTtl);
        // source rect is in DEVICE pixels; destination draws through the dpr transform
        ctx.drawImage(c, 0, by * this.dpr, W * this.dpr, bh * this.dpr, off, by, W, bh);
      }
      if (this.fxRng.chance(0.3)) {
        ctx.fillStyle = `rgba(244,112,103,${0.06 * this.glitchTtl})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    if (this.whiteFlashTtl > 0) {
      this.whiteFlashTtl -= dt;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, this.whiteFlashTtl / 0.08) * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.hitFlashTtl > 0) {
      const a = this.hitFlashTtl / 0.3;
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
      vg.addColorStop(0, 'rgba(244,112,103,0)');
      vg.addColorStop(1, `rgba(244,112,103,${0.28 * a})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    // DOM refresh
    if (run.dirty !== this.lastDirty) {
      this.lastDirty = run.dirty;
      this.renderHud(run);
    }
    if (run.banners.length !== this.lastBannerCount) {
      this.lastBannerCount = run.banners.length;
      this.renderBanners(run);
    }
    this.renderPrompt(run);
  }

  private drawWall(ctx: CanvasRenderingContext2D, run: Run, viewL: number): void {
    if (run.wallX < viewL - 40) return;
    const h = run.terrain.height;
    // corrupted zone
    const gradW = ctx.createLinearGradient(run.wallX - 260, 0, run.wallX, 0);
    gradW.addColorStop(0, 'rgba(15,15,14,0.9)');
    gradW.addColorStop(1, 'rgba(60,10,20,0.75)');
    ctx.fillStyle = gradW;
    ctx.fillRect(viewL - 50, 0, run.wallX - viewL + 50, h);
    // garbled static inside the zone
    const rng = new Rng(Math.floor(this.time * 6)); // reseeds ~6x/s: flickering static
    ctx.font = '11px monospace';
    for (let i = 0; i < 90; i++) {
      const x = run.wallX - rng.range(0, Math.min(500, run.wallX - viewL + 60));
      const y = rng.range(0, h);
      ctx.fillStyle = rng.chance(0.75) ? 'rgba(244,112,103,0.4)' : 'rgba(222,218,210,0.25)';
      ctx.fillText(rng.pick(CORRUPT_GLYPHS), x, y);
    }
    // the edge
    ctx.strokeStyle = `rgba(244,112,103,${0.6 + 0.3 * Math.sin(this.time * 8)})`;
    ctx.lineWidth = 3 / this.camZoom;
    ctx.beginPath();
    for (let y = 0; y < h; y += 14) {
      const wob = Math.sin(y * 0.05 + this.time * 5) * 5;
      if (y === 0) ctx.moveTo(run.wallX + wob, y); else ctx.lineTo(run.wallX + wob, y);
    }
    ctx.stroke();
    // corruption tendrils reaching ahead of the wall
    ctx.font = '11px monospace';
    const trng = new Rng(1 + Math.floor(this.time * 4));
    for (let i = 0; i < 7; i++) {
      const ty = (i + 0.5) * (h / 7) + Math.sin(this.time * 2 + i * 1.7) * 30;
      const reach = 40 + trng.range(0, 90) * Math.abs(Math.sin(this.time * 1.3 + i));
      for (let d = 0; d < reach; d += 12) {
        ctx.fillStyle = `rgba(244,112,103,${Math.max(0, 0.5 - d / reach * 0.5)})`;
        ctx.fillText(trng.pick(CORRUPT_GLYPHS), run.wallX + d, ty + Math.sin(d * 0.12 + this.time * 6) * 6);
      }
    }
    // label riding the wall
    ctx.fillStyle = 'rgba(244,112,103,0.9)';
    ctx.font = `${12 / this.camZoom}px ui-monospace, monospace`;
    ctx.save();
    ctx.translate(run.wallX - 12, Math.max(this.camY - 100, 60));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('▓▓ COMPACTION FRONT ▓▓', 0, 0);
    ctx.restore();
  }

  private drawExit(ctx: CanvasRenderingContext2D, run: Run): void {
    const x = run.terrain.width - 46;
    const y = run.terrain.surfaceAt(x);
    ctx.fillStyle = 'rgba(126,231,135,0.9)';
    ctx.font = `${13 / this.camZoom}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    const bob = Math.sin(this.time * 3) * 3;
    ctx.fillText('→ process exit 0', x, y - 46 + bob);
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(126,231,135,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 14, y - 34, 28, 34);
  }

  private drawStation(ctx: CanvasRenderingContext2D, run: Run, s: { x: number; y: number; taskIndex: number }): void {
    const t = run.queue.tasks[s.taskIndex];
    const y = run.terrain.surfaceAt(s.x);
    const active = run.nearStation && run.nearStation.taskIndex === s.taskIndex;
    const color = t.done ? '#7a766e' : t.forgotten ? '#f47067' : active ? '#7ee787' : '#dedad2';
    // terminal pillar
    ctx.fillStyle = '#161615';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.fillRect(s.x - 10, y - 26, 20, 26);
    ctx.strokeRect(s.x - 10, y - 26, 20, 26);
    ctx.fillStyle = color;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(t.done ? '☒' : t.forgotten ? '▓' : '☐', s.x, y - 10);
    // task label + progress
    ctx.font = `${11 / this.camZoom}px ui-monospace, monospace`;
    const label = t.forgotten && !t.done ? garble(t.name, this.garbleRng, 0.4) : t.name;
    ctx.fillText(label.slice(0, 26), s.x, y - 38);
    if (!t.done && !t.forgotten) {
      ctx.fillText('▰'.repeat(t.progress) + '▱'.repeat(Math.max(0, t.workUnits - t.progress)), s.x, y - 52);
      if (active) {
        ctx.fillStyle = '#7ee787';
        ctx.fillText('[hold W to work]', s.x, y - 66);
      }
    }
    ctx.textAlign = 'left';
  }

  private drawCrate(ctx: CanvasRenderingContext2D, run: Run, cr: { x: number; y: number; used: boolean; kind: 'patch' | 'model' }): void {
    const y = run.terrain.surfaceAt(cr.x);
    const color = cr.kind === 'model' ? '#6cb6ff' : '#e3b341';
    const glyph = cr.kind === 'model' ? '◈' : '⬆';
    ctx.globalAlpha = cr.used ? 0.3 : 1;
    ctx.fillStyle = '#161615';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.fillRect(cr.x - 9, y - 18, 18, 18);
    ctx.strokeRect(cr.x - 9, y - 18, 18, 18);
    ctx.fillStyle = color;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(glyph, cr.x, y - 5);
    if (!cr.used && cr.kind === 'model') {
      // the good crate advertises itself
      ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(this.time * 3));
      ctx.font = `${10 / this.camZoom}px ui-monospace, monospace`;
      ctx.fillText('new model!', cr.x, y - 40);
      ctx.globalAlpha = cr.used ? 0.3 : 1;
    }
    if (!cr.used && run.nearCrate === cr) {
      ctx.font = `${11 / this.camZoom}px ui-monospace, monospace`;
      ctx.fillText(cr.kind === 'model' ? '[U — upgrade the model]' : '[U to install update]', cr.x, y - 28);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: import('./enemies').Enemy, stunned = false): void {
    ctx.save();
    ctx.translate(e.x, e.y);
    let phase = e.def.kind === 'hallucination_ghost' ? 0.45 + 0.4 * Math.abs(Math.sin(e.stateTimer * 1.8)) : 1;
    if (stunned) phase = Math.min(phase, 0.75);
    ctx.globalAlpha = phase;
    const size = e.mini ? 8 : 12;
    ctx.fillStyle = '#161615';
    ctx.strokeStyle = e.def.color;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-size, -size, size * 2, size * 2);
    ctx.strokeRect(-size, -size, size * 2, size * 2);
    ctx.fillStyle = e.def.color;
    ctx.font = `${e.mini ? 9 : 12}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(e.def.glyph, 0, 4);
    // hp pips + name
    if (!e.def.friendly) {
      const frac = Math.max(0, e.hp / (e.mini ? e.def.hp / 2 : e.def.hp));
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-size, -size - 6, size * 2, 3);
      ctx.fillStyle = e.def.color;
      ctx.fillRect(-size, -size - 6, size * 2 * frac, 3);
    }
    ctx.font = `${10 / this.camZoom}px ui-monospace, monospace`;
    ctx.globalAlpha = phase * 0.7;
    ctx.fillText(e.def.name + (e.mini ? '·mini' : ''), 0, -size - 12);
    // stunned: busy reading the ping
    if (stunned) {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#e3b341';
      ctx.font = `${11 / this.camZoom}px ui-monospace, monospace`;
      const bob = Math.sin(this.time * 5) * 2;
      ctx.fillText('…?!', 0, -size - 24 + bob);
    }
    ctx.restore();
  }

  /** the agent: a little walking terminal window with a >_ face */
  private drawAvatar(ctx: CanvasRenderingContext2D, run: Run): void {
    const a = run.avatar;
    const dead = a.hp <= 0;
    ctx.save();
    ctx.translate(a.x, a.y);
    if (a.shield > 0) {
      ctx.strokeStyle = 'rgba(108,182,255,0.7)';
      ctx.fillStyle = 'rgba(108,182,255,0.10)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -12, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const color = dead ? '#555' : '#7ee787';
    const moving = Math.abs(a.vx) > 5 && a.onGround;

    // glyph legs, scuttling when moving
    if (!dead) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      const phase = moving ? Math.sin(a.x * 0.25) * 3 : 0;
      ctx.beginPath();
      ctx.moveTo(-6, -3); ctx.lineTo(-7 - phase, 0);
      ctx.moveTo(6, -3); ctx.lineTo(7 + phase, 0);
      ctx.stroke();
    }

    // terminal window body
    ctx.fillStyle = dead ? '#222' : '#0c120e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-13, -22, 26, 19, 2); ctx.fill(); ctx.stroke();
    // title bar
    ctx.fillStyle = a.headsDown && !dead ? 'rgba(244,112,103,0.35)' : dead ? '#333' : 'rgba(126,231,135,0.22)';
    ctx.fillRect(-12, -21, 24, 5);
    // traffic-light dots + model tag in the title bar
    ctx.fillStyle = dead ? '#555' : '#f47067'; ctx.fillRect(-11, -19.5, 2, 2);
    ctx.fillStyle = dead ? '#555' : '#e3b341'; ctx.fillRect(-8, -19.5, 2, 2);
    ctx.font = '5px monospace';
    ctx.fillStyle = dead ? '#666' : color;
    ctx.textAlign = 'right';
    ctx.fillText(`v${a.model}`, 11, -17);
    ctx.textAlign = 'left';
    // the face: a prompt
    ctx.font = '9px monospace';
    ctx.fillStyle = dead ? '#777' : color;
    if (dead) {
      ctx.fillText('x_x', -7, -7);
    } else if (run.working) {
      // typing furiously
      const dots = '▖▘▝▗'[Math.floor(this.time * 8) % 4];
      ctx.fillText(`>${dots}`, a.facing === 1 ? -6 : -4, -7);
    } else {
      const cursor = Math.sin(this.time * 4) > 0 ? '_' : ' ';
      ctx.fillText(a.facing === 1 ? `>${cursor}` : `${cursor}<`, a.facing === 1 ? -6 : -4, -7);
    }
    // antenna off the window corner
    if (!dead) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(9, -22); ctx.lineTo(12, -28); ctx.stroke();
      ctx.beginPath(); ctx.arc(12, -29, 1.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      if (this.muzzleTtl > 0) {
        ctx.fillStyle = `rgba(255,243,214,${this.muzzleTtl / 0.09})`;
        ctx.font = '12px monospace';
        ctx.fillText(a.facing === 1 ? '»' : '«', a.facing * 16 - 4, -10);
      }
    }
    // heads-down indicator
    if (a.headsDown && !dead) {
      ctx.fillStyle = '#f47067';
      ctx.font = `${10 / this.camZoom}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('⌨ heads-down', 0, -38);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  private drawSubagents(ctx: CanvasRenderingContext2D, run: Run): void {
    for (const sa of run.subagents) {
      ctx.save();
      ctx.translate(sa.x, sa.y);
      const color = sa.corrupted ? '#f47067' : '#7ee787';
      ctx.fillStyle = '#0c120e';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(-7, -7, 14, 12, 1.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      const spin = '✳✻✽✶'[Math.floor(this.time * 6) % 4];
      ctx.fillText(sa.corrupted ? '☓' : spin, 0, 2);
      ctx.font = `${9 / this.camZoom}px ui-monospace, monospace`;
      ctx.globalAlpha = 0.7;
      ctx.fillText(sa.corrupted ? garble(sa.label, this.garbleRng, 0.4) : sa.label, 0, -11);
      ctx.restore();
      ctx.textAlign = 'left';
    }
  }

  // -------------------------------------------------------------------------
  // DOM HUD
  // -------------------------------------------------------------------------

  renderHud(run: Run): void {
    $('round-label').textContent = `T+${Math.floor(run.time)}s`;
    const gap = Math.round(run.avatar.x - run.wallX);
    $('wind-label').textContent = `▓ wall ${gap > 0 ? gap + 'px behind' : 'ON YOU'}`;
    ($('wind-label') as HTMLElement).style.color = gap < 220 ? 'var(--red)' : 'var(--text)';
    const pct = Math.round((run.avatar.x / run.terrain.width) * 100);
    $('comeback-label').textContent = `session ${pct}% traversed`;

    this.renderAgentPanel(run);
    this.renderSessionPanel(run);
    this.renderWeaponBar(run);
    this.renderTranscript(run);

    $('status-bar').innerHTML =
      `<span><span class="sb-key">←→</span> move</span>` +
      `<span><span class="sb-key">↑</span> jump</span>` +
      `<span><span class="sb-key">space</span> fire</span>` +
      `<span><span class="sb-key">w</span> hold to work</span>` +
      `<span><span class="sb-key">u</span> install</span>` +
      `<span><span class="sb-key">s</span> subagent${run.subagentsUnlocked ? ' (900tk)' : ' 🔒'}</span>` +
      `<span><span class="sb-key">c</span> /compact${run.compactCd > 0 ? ` (${Math.ceil(run.compactCd)}s)` : ''}</span>` +
      `<span><span class="sb-key">[ ]</span>/<span class="sb-key">1-9</span> weapons</span>` +
      `<span><span class="sb-key">m</span> mute</span>` +
      `<span><span class="sb-key">v</span> voice · <span class="sb-key">⇧v</span> next voice</span>` +
      `<span class="sb-right">aiaio session-run · ${run.kills} errors resolved · ${run.ctx.compactions}⚡</span>`;
  }

  private renderAgentPanel(run: Run): void {
    const panel = $('panel-0');
    panel.className = 'player-panel p0 active';
    const a = run.avatar;
    const hpFrac = Math.max(0, a.hp / a.maxHp);
    const ctxF = contextFrac(run.ctx);
    const overThresh = ctxF >= run.ctx.threshold;
    const taskRows = run.queue.tasks.map((t, i) => {
      const cls = ['task-row'];
      const isCurrent = !t.done && !t.forgotten && run.nearStation?.taskIndex === i;
      if (t.done) cls.push('done');
      else if (isCurrent) cls.push('current');
      if (t.forgotten && !t.done) cls.push('forgotten');
      const glyph = t.done ? '☒' : t.forgotten ? '▓' : isCurrent ? '▸' : '☐';
      const blocks = !t.done && !t.forgotten && t.progress > 0
        ? ` <span class="task-blocks">[${'▰'.repeat(t.progress)}${'▱'.repeat(Math.max(0, t.workUnits - t.progress))}]</span>` : '';
      const name = t.forgotten && !t.done ? garble(t.name, this.garbleRng, 0.35) : t.name;
      return `<div class="${cls.join(' ')}"><span class="glyph">${glyph}</span><span>${escapeHtml(name)}${blocks}</span></div>`;
    }).join('');
    panel.innerHTML = `
      <div class="pp-name" style="color:#7ee787">${escapeHtml(run.name)} <span class="badge">v${a.model}</span>
        <span class="badge">stability ${run.loadout.stability}</span>
        ${a.shield > 0 ? `<span class="badge" style="color:var(--blue)">🛡 ${Math.round(a.shield)}</span>` : ''}
        ${run.subagents.filter((s) => !s.corrupted).length > 0 ? `<span class="badge" style="color:#7ee787">✳ subs ×${run.subagents.filter((s) => !s.corrupted).length}</span>` : ''}
        ${run.subagents.some((s) => s.corrupted) ? `<span class="badge" style="color:var(--red)">☓ ROGUE ×${run.subagents.filter((s) => s.corrupted).length}</span>` : ''}
        ${a.headsDown ? '<span class="badge" style="color:var(--red)">⌨ heads-down</span>' : ''}
        ${a.aimJitter > 0.5 ? '<span class="badge" style="color:var(--yellow)">〜 aim drift (patch regression)</span>' : ''}
      </div>
      <div class="meter">proc <span class="tbar" style="color:${hpFrac > 0.35 ? '#7ee787' : 'var(--red)'}">${textBar(hpFrac)}</span> <span class="val">${Math.max(0, Math.round(a.hp))}/${a.maxHp}</span></div>
      <div class="meter">ctx  <span class="tbar" style="color:${overThresh ? 'var(--red)' : 'var(--blue)'}">${textBar(ctxF)}</span> <span class="val">${run.ctx.used}/${run.ctx.budget}</span> · compact @${Math.round(run.ctx.threshold * 100)}% · ${run.ctx.compactions}⚡</div>
      <div class="tasks-list">${taskRows}</div>
    `;
  }

  private renderSessionPanel(run: Run): void {
    const panel = $('panel-1');
    panel.className = 'player-panel p1';
    const s = run.loadout.cardSummary;
    const alive = run.enemies.filter((e) => !e.dead && !e.def.friendly);
    const byKind = new Map<string, number>();
    for (const e of alive) byKind.set(e.def.name, (byKind.get(e.def.name) ?? 0) + 1);
    const roster = [...byKind.entries()].slice(0, 5)
      .map(([name, n]) => `<div class="task-row"><span class="glyph">·</span><span>${escapeHtml(name)} ×${n}</span></div>`)
      .join('') || '<div class="task-row dim"><span class="glyph">·</span><span>all errors resolved</span></div>';
    const crates = run.crates.filter((c) => !c.used).length;
    panel.innerHTML = `
      <div class="pp-name" style="color:#d97757">session: ${escapeHtml(s.sessionId)}
        ${s.fromCard ? '' : '<span class="badge">generated</span>'}
      </div>
      <div class="meter">len  <span class="tbar" style="color:var(--dim)">${textBar(run.avatar.x / run.terrain.width)}</span> <span class="val">${Math.round((run.avatar.x / run.terrain.width) * 100)}% traversed</span></div>
      <div class="meter dim">errors live: ${alive.length} · updates unclaimed: ${crates} · resolved: ${run.kills}</div>
      <div class="tasks-list">${roster}</div>
    `;
  }

  private renderWeaponBar(run: Run): void {
    const bar = $('weapon-bar');
    bar.innerHTML = '';
    run.weapons.forEach((slot, i) => {
      const div = document.createElement('div');
      div.className = 'weapon-slot' + (i === run.selected ? ' selected' : '') +
        (slot.ammo <= 0 ? ' empty' : '');
      const heat = slot.def.id === 'debug_zap'
        ? (run.zapThink > 0 ? ' · ✳ thinking' : ` · heat ${run.zapHeat}/${ZAP_BURST}`)
        : '';
      const ammo = (slot.ammo === Infinity ? '∞' : `×${slot.ammo}`) + heat;
      const sel = i === run.selected ? '❯' : ' ';
      const cost = slot.def.id === 'context_nuke'
        ? `${Math.round(slot.def.tokenCost / RUN_COST.fireDivisor)}tk <span style="color:var(--red)">+25% flood</span>`
        : `${Math.round(slot.def.tokenCost / RUN_COST.fireDivisor)}tk`;
      div.innerHTML = `
        <span class="dim">${sel} ${i + 1}</span>
        <span class="wname">${slot.def.glyph} ${kebab(slot.def.name)}</span>
        <span class="wmeta">${ammo} · ${cost}</span>
        <div class="tooltip">${escapeHtml(slot.def.flavor)}<span class="tsrc">from log: ${escapeHtml(slot.sourceLine)}</span></div>
      `;
      div.addEventListener('click', () => run.selectWeapon(i));
      bar.appendChild(div);
    });
  }

  private renderTranscript(run: Run): void {
    const feed = $('log-feed');
    feed.innerHTML = '';
    const lines = run.log.slice(-4);
    lines.forEach((line, idx) => {
      const div = document.createElement('div');
      div.className = 'tr-line' + (idx === lines.length - 1 ? ' fresh' : '');
      const first = [...line][0];
      let bullet = '⏺', bclass = 'b-action';
      if ('💢⚡▓☠⛔'.includes(first)) { bullet = '⏺'; bclass = 'b-bad'; }
      else if ('🛡⏱☢➕·✔🔧'.includes(first)) { bullet = '⎿'; bclass = 'b-result'; }
      else if ('⚑📣💥⬆▶🔁'.includes(first)) { bullet = '⏺'; bclass = 'b-system'; }
      const body = line.replace(/^[✦⌨▶·]\s*/u, '');
      div.innerHTML = `<span class="tr-bullet ${bclass}">${bullet}</span>${escapeHtml(body)}`;
      feed.appendChild(div);
    });
  }

  private renderPrompt(run: Run): void {
    let html: string;
    let menuMode = false;
    if (run.over) {
      html = `<span class="spin">✻</span> <span class="spin-verb">${run.over.won ? 'session complete' : 'process terminated'}</span> <span class="spin-hint">— recap incoming</span>`;
    } else if (run.crateMenu) {
      menuMode = true;
      html = `<div class="menu-title">⬆ crate — choose one:</div>` + run.crateMenu.options.map((o, i) =>
        `<div class="menu-opt"><span class="sb-key">${i + 1}</span> ${escapeHtml(o.label)} <span class="dim">— ${escapeHtml(o.desc)}</span></div>`
      ).join('');
    } else if (run.summarizing > 0) {
      const g = ['✂', '✻', '✂', '✽'][Math.floor(this.time * 8) % 4];
      html = `<span class="spin">${g}</span> <span class="spin-verb">Summarizing conversation…</span> <span class="spin-hint">(heads-down — /compact in progress)</span>`;
    } else {
      const slot = run.weapons[run.selected];
      const ammo = slot.ammo === Infinity ? '∞' : `×${slot.ammo}`;
      const bits: string[] = [];
      if (slot.def.id === 'debug_zap' && run.zapThink > 0) bits.push('<span style="color:var(--yellow)">✳ thinking…</span>');
      if (run.working && run.nearStation) {
        bits.push(`<span style="color:var(--yellow)">⌨ working "${escapeHtml(run.queue.tasks[run.nearStation.taskIndex].name)}"…</span>`);
      } else if (run.nearStation) {
        bits.push(`<span style="color:#7ee787">hold W — "${escapeHtml(run.queue.tasks[run.nearStation.taskIndex].name)}"</span>`);
      }
      if (run.nearPermTerminal) bits.push('<span style="color:#7ee787">✳ U — grant Task tool (unlock subagents)</span>');
      if (run.nearCrate) bits.push(`<span style="color:${run.nearCrate.kind === 'model' ? 'var(--blue)' : 'var(--yellow)'}">${run.nearCrate.kind === 'model' ? '◈' : '⬆'} U to install</span>`);
      if (slot.def.id === 'context_nuke') bits.push('<span style="color:var(--red)">⚠ floods 25% of YOUR context</span>');
      if (run.insideWall) bits.push('<span style="color:var(--red)">▓ INSIDE THE FORGETTING — bleeding, weapons spraying</span>');
      if (run.compactCd <= 0 && run.ctx.used > run.ctx.budget * 0.4) bits.push('<span class="dim">✂ C to /compact</span>');
      html = `<span class="pcaret">&gt;</span> ${slot.def.glyph} ${kebab(slot.def.name)} ${ammo}` +
        (bits.length ? ' · ' + bits.join(' · ') : '') +
        ` <span class="cursor"></span>`;
    }
    if (html !== this.lastPrompt) {
      this.lastPrompt = html;
      $('turn-hint').innerHTML = `<div class="prompt-box${menuMode ? ' menu' : ''}">${html}</div>`;
    }
  }

  private renderBanners(run: Run): void {
    const layer = $('banner-layer');
    layer.innerHTML = '';
    const b: Banner | undefined = run.banners[0];
    if (!b) return;
    const div = document.createElement('div');
    div.className = `banner ${b.kind}`;
    div.innerHTML = `<h3>${escapeHtml(b.title)}</h3>` + b.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
    layer.appendChild(div);
  }

  // -------------------------------------------------------------------------
  // briefing + recap
  // -------------------------------------------------------------------------

  buildBriefing(
    loadout: AgentLoadout, card: SessionCard, name: string,
    campaign?: { diff: number; tierName: string; prevRank: string | null },
  ): void {
    const cols = $('briefing-cols');
    cols.innerHTML = '';
    const s = loadout.cardSummary;
    const campaignLine = campaign
      ? `<div class="stat-line" style="color:var(--yellow)">difficulty ${campaign.diff}/100 · ${escapeHtml(campaign.tierName)}${campaign.prevRank ? ` · your record: ★${escapeHtml(campaign.prevRank)}` : ' · unplayed'}</div>`
      : '';

    const agentCol = document.createElement('div');
    agentCol.className = 'briefing-col p0';
    const weapons = loadout.weapons.map((w) => {
      const def = WEAPONS[w.id];
      return `<li>${def.glyph} ${kebab(def.name)} ×${w.ammo + 3}<span class="wsrc">⎿ ${escapeHtml(w.sourceLine)}</span></li>`;
    }).join('');
    const tasks = loadout.tasks.map((t) => `<li>☐ ${escapeHtml(t.name)} <span class="dim">(${t.workUnits} work)</span></li>`).join('');
    agentCol.innerHTML = `
      <h3>${escapeHtml(name)}</h3>
      ${campaignLine}
      <div class="stat-line">stability ${loadout.stability}/100 · hardening ${(loadout.hardening * 100).toFixed(0)}%</div>
      <div class="stat-line">context budget ${loadout.tokenBudget} · compaction at ${(loadout.compactionThreshold * 100).toFixed(0)}% (each one makes the wall LEAP)</div>
      ${loadout.stability < 45 ? '<div class="handicap-note">⚑ HANDICAP: low stability — starting shield + damage bonus. struggling agents get armor.</div>' : ''}
      <h4>TASK QUEUE (stations along the timeline — work them before the wall does)</h4><ul>${tasks}</ul>
      <h4>LOADOUT (+ ∞ print-debug zapper)</h4><ul>${weapons}</ul>
    `;
    cols.appendChild(agentCol);

    const levelCol = document.createElement('div');
    levelCol.className = 'briefing-col p1';
    const errors = (card.errors ?? []).filter((e) => e && (e.category || e.type));
    const briefAlloc = allocateSpawns(errors.map((e) => ({
      category: e.category || e.type || 'unknown', count: Math.max(1, Math.floor(e.count ?? 1)),
    })));
    const roster = errors.map((err, ei) => {
      const kind = categoryToEnemy((err.category || err.type || 'unknown')) as EnemyKind;
      const def = ENEMY_DEFS[kind];
      const count = Math.max(1, Math.floor(err.count ?? 1));
      const spawnN = briefAlloc[ei];
      return `<li>${def.glyph} ${def.name} ×${spawnN}<span class="wsrc">⎿ ${escapeHtml(err.category || err.type || '')} ×${count}${err.sample ? ` — "${escapeHtml(err.sample.slice(0, 60))}"` : ''}</span><span class="wsrc dim">${escapeHtml(def.flavor)}</span></li>`;
    }).join('') || '<li class="dim">no errors on record — a quiet session (three regressions will attend anyway)</li>';
    levelCol.innerHTML = `
      <h3>the level: session ${escapeHtml(s.sessionId)}${s.fromCard ? '' : ' <span class="dim">(generated)</span>'}</h3>
      ${card.goal ? `<div class="stat-line" style="color:var(--yellow)">the mission, in your own words: "${escapeHtml(String(card.goal).slice(0, 120))}"</div>` : ''}
      ${(card.moments?.length ?? 0) > 0 ? `<div class="stat-line dim">◇ ${card.moments!.length} real moments from the session stand along the timeline</div>` : ''}
      <div class="stat-line dim">${s.fromCard ? `history: ${escapeHtml(s.topErrorCategory)} ×${s.topErrorCount}, ${s.compactionEvents} compactions, ${s.restarts} restarts, token peak ${s.tokenPeak}` : 'random session — drop a SessionCard to run your real one'}</div>
      <div class="stat-line">timeline length scales with message_count · your errors spawn as creatures at points along it · behind you: the wall of forgetting</div>
      <h4>ENEMY ROSTER (from the real error log)</h4><ul>${roster}</ul>
    `;
    cols.appendChild(levelCol);

    // the Observer's memory-lane roast slot (filled by main; LLM version swaps in)
    const roastBox = document.createElement('div');
    roastBox.id = 'briefing-roast';
    roastBox.className = 'briefing-col roast-box';
    roastBox.innerHTML = '<h3>☏ the observer reviews your file…</h3>';
    cols.parentElement?.insertBefore(roastBox, cols.nextSibling);
  }

  setBriefingRoast(lines: string[], source: 'composed' | 'llm'): void {
    const box = document.getElementById('briefing-roast');
    if (!box) return;
    box.innerHTML = `<h3>☏ the observer reviews your file ${source === 'llm' ? '' : '<span class="dim">(from memory)</span>'}</h3>` +
      lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  }

  buildRecap(
    run: Run,
    rankInfo?: { rank: 'S' | 'A' | 'B' | 'C' | 'D'; newBest: boolean; rankUp: boolean; prevBest: number | null },
  ): void {
    const over = run.over!;
    $('recap-headline').textContent = over.headline;
    const body = $('recap-body');
    const s = run.loadout.cardSummary;
    const done = run.queue.tasks.filter((t) => t.done);
    const eaten = run.queue.tasks.filter((t) => t.forgotten && !t.done);
    const undone = run.queue.tasks.filter((t) => !t.done && !t.forgotten);
    const cardBits = s.fromCard
      ? `<p class="dim">real session ${escapeHtml(s.sessionId)}: top error was ${escapeHtml(s.topErrorCategory)} ×${s.topErrorCount};
         ${s.compactionEvents} real compaction${s.compactionEvents === 1 ? '' : 's'} on record — this run compacted ${run.ctx.compactions}×.
         ${s.tasksTotal > 0 ? `the real agent finished ${s.tasksCompleted}/${s.tasksTotal} of these tasks; you finished ${done.length}/${run.queue.tasks.length}.` : ''}</p>`
      : '<p class="dim">randomly generated session — run `npm run scan` and pick a real one for a personalized level.</p>';
    // where in the real session the run ended
    let placeBit = '';
    if (run.moments.length > 0) {
      const nearest = [...run.moments].sort((a, b) =>
        Math.abs(a.x - run.avatar.x) - Math.abs(b.x - run.avatar.x))[0];
      if (Math.abs(nearest.x - run.avatar.x) < run.terrain.width * 0.15) {
        placeBit = `<p class="recap-summary dim">the run ended around the part of the session where: "${escapeHtml(nearest.text.slice(0, 90))}"</p>`;
      }
    }
    const RANK_COLORS: Record<string, string> = { S: '#7ee787', A: '#6cb6ff', B: '#dedad2', C: '#e3b341', D: '#f47067' };
    const rankBit = rankInfo
      ? `<p class="recap-rank"><span style="color:${RANK_COLORS[rankInfo.rank]}">★ RANK ${rankInfo.rank}</span>` +
        `${rankInfo.newBest ? ' <span style="color:var(--yellow)">NEW BEST</span>' : rankInfo.prevBest !== null ? ` <span class="dim">best ${rankInfo.prevBest.toLocaleString()}</span>` : ''}` +
        `${rankInfo.rankUp && rankInfo.prevBest !== null ? ' <span style="color:var(--green)">RANK UP</span>' : ''}</p>`
      : '';
    body.innerHTML = `
      ${rankBit}
      <p class="recap-summary">SCORE ${over.score} — ${Math.floor(run.time)}s · ${run.kills} errors resolved · ${run.ctx.compactions} compactions</p>
      ${placeBit}
      <div class="recap-cols"><div class="recap-col">
        <h3 style="color:#7ee787">${escapeHtml(run.name)}</h3>
        <p>tasks completed: ${done.length ? done.map((t) => escapeHtml(t.name)).join(', ') : 'none'}</p>
        ${eaten.length ? `<p style="color:var(--red)">eaten by the wall: ${eaten.map((t) => escapeHtml(t.name)).join(', ')}</p>` : ''}
        ${undone.length ? `<p class="dim">left undone: ${undone.map((t) => escapeHtml(t.name)).join(', ')}</p>` : ''}
        <p>hp ${Math.max(0, Math.round(run.avatar.hp))}/100 · ${run.ctx.compactions} compactions${run.ctx.compactions > 2 ? ' (memory was… negotiable)' : ''}</p>
        ${run.awards.length ? `<p style="color:var(--yellow)">🏆 ${run.awards.map((a) => `${escapeHtml(a.title)} <span class="dim">— ${escapeHtml(a.desc)}</span>`).join('<br/>🏆 ')}</p>` : ''}
        ${cardBits}
      </div></div>
    `;
  }
}
