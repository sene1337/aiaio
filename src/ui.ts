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

export interface ForwardRecap {
  rows: { glyph: string; cls: string; text: string }[];
  observerWord: string | null;
  nextTitle: string | null;
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
  /** settings: suppress shake, glitch bands, and full-screen flashes */
  reducedFx = localStorage.getItem('aiaio-reduced-fx') === '1';

  /**
   * XAG-102 double outline: a dark halo plus a faint bright rim makes a glyph
   * readable over any terrain, particle storm, or J-space weather. Use for
   * gameplay-critical glyphs (entities, pickups, projectile heads) — never for
   * atmosphere, which should stay quiet.
   */
  private outlinedGlyph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string): void {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.88)';
    ctx.lineWidth = 3;
    ctx.strokeText(text, x, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.1;
    ctx.strokeText(text, x, y);
    ctx.restore();
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
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
  private hitFlashDir = 0; // -1 hit from the left, 1 from the right, 0 unknown
  private muzzleTtl = 0;
  private whiteFlashTtl = 0;
  private rings: Array<{ x: number; y: number; maxR: number; ttl: number; maxTtl: number; color: string }> = [];
  private tokenBursts: Array<{ x: number; y: number; tokens: number; ttl: number; maxTtl: number; nuke: boolean }> = [];
  private fxRng = new Rng('fx');
  // J-space: the LLM's latent space as layered ASCII weather behind the level
  private flow: Array<{ x: number; y: number; life: number }> = [];
  private sparks: Array<{ x: number; y: number; ttl: number; maxTtl: number; hue: number }> = [];
  private captionSerial = 0;

  constructor() {
    this.canvas = $('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  setCaption(speaker: 'observer' | 'bad news', text: string, active: boolean): void {
    const box = $('observer-caption');
    if (localStorage.getItem('aiaio-captions') === '0') { box.classList.add('hidden'); return; }
    if (!active) {
      if (box.dataset.caption === text) box.classList.add('hidden');
      return;
    }
    box.dataset.serial = String(++this.captionSerial);
    box.dataset.caption = text;
    box.classList.toggle('bad-news', speaker === 'bad news');
    box.querySelector<HTMLElement>('.caption-speaker')!.textContent = speaker.toUpperCase();
    box.querySelector<HTMLElement>('.caption-text')!.textContent = text;
    box.classList.remove('hidden');
  }

  // hash-based value noise: smooth, cheap, never repeats visibly
  private static hash2(ix: number, iy: number): number {
    let h = (ix * 374761393 + iy * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  private noise(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = UI.hash2(ix, iy), b = UI.hash2(ix + 1, iy);
    const c = UI.hash2(ix, iy + 1), d = UI.hash2(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  /**
   * J-SPACE — the cognition weather. Three parallax ASCII layers, all
   * noise-driven and non-repeating: a deep latent nebula (purple/blue glyph
   * clouds), attention streams (particles riding a flow field), and sampling
   * sparks (characters cycling candidates before collapsing). As context
   * pressure rises toward compaction, the whole space gets agitated: denser,
   * faster, redder. The mind you're inside gets visibly anxious.
   */
  private drawJSpace(ctx: CanvasRenderingContext2D, run: Run, W: number, H: number, dt: number): void {
    const t = this.time;
    const agitation = Math.min(1.4, run.ctx.used / (run.ctx.budget * run.ctx.threshold));
    const redShift = Math.min(1, Math.max(0, agitation - 0.6) * 2.2);

    // L1 — latent nebula (deep, parallax 0.18): thought-clouds breathing
    const px = this.camX * 0.18, py = this.camY * 0.12;
    ctx.font = '11px monospace';
    for (let y = 10; y < H * 0.96; y += 26) {
      for (let x = 6; x < W; x += 22) {
        const n = this.noise((x + px) * 0.011, (y + py) * 0.015 + t * 0.045);
        if (n < 0.53) continue;
        const m = this.noise((x + px) * 0.005 + 41.7, (y + py) * 0.006 - t * 0.028);
        const alpha = Math.min(0.42, (n - 0.53) * (0.85 + agitation * 0.55));
        const r = Math.round(108 + m * 69 + redShift * 110);
        const g = Math.round(138 + m * 44 - redShift * 60);
        const b = Math.round(255 - redShift * 110);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        const wob = (this.noise(x * 0.09 + 7, t * 0.3) - 0.5) * 9;
        ctx.fillText(n > 0.74 ? '∙' : n > 0.63 ? ':' : '·', x + wob, y);
      }
    }

    // L2 — attention streams (mid, parallax 0.45): activations in transit
    const want = Math.round(20 + agitation * 16);
    while (this.flow.length < want) {
      this.flow.push({ x: Math.random() * W, y: Math.random() * H * 0.85, life: 2 + Math.random() * 4 });
    }
    ctx.font = '10px monospace';
    for (const p of this.flow) {
      const ang = this.noise((p.x + this.camX * 0.45) * 0.006, p.y * 0.008 + t * 0.055) * Math.PI * 4;
      const sp = 13 + agitation * 30;
      p.x += Math.cos(ang) * sp * dt;
      p.y += Math.sin(ang) * sp * dt * 0.55;
      p.life -= dt;
      if (p.life <= 0 || p.x < -12 || p.x > W + 12 || p.y < -12 || p.y > H + 12) {
        p.x = Math.random() * W; p.y = Math.random() * H * 0.85; p.life = 2 + Math.random() * 4;
        continue;
      }
      const a = Math.min(0.28, p.life * 0.11);
      ctx.fillStyle = redShift > 0.5 ? `rgba(255,148,64,${a})` : `rgba(108,182,255,${a})`;
      ctx.fillText('∼', p.x, p.y);
    }

    // L3 — sampling sparks (near): a token being chosen, then committed
    if (Math.random() < (0.028 + agitation * 0.05)) {
      this.sparks.push({ x: Math.random() * W, y: Math.random() * H * 0.8, ttl: 0.9, maxTtl: 0.9, hue: Math.random() });
    }
    ctx.font = 'bold 11px monospace';
    for (const s of this.sparks) {
      s.ttl -= dt;
      const a = Math.max(0, s.ttl / s.maxTtl) * 0.5;
      const g = CORRUPT_GLYPHS[Math.floor(t * 22 + s.hue * 10) % CORRUPT_GLYPHS.length];
      ctx.fillStyle = s.hue < 0.5 ? `rgba(255,148,64,${a})` : `rgba(177,138,255,${a})`;
      ctx.fillText(g, s.x, s.y);
    }
    this.sparks = this.sparks.filter((s) => s.ttl > 0);
  }

  /** visual reactions to game events (wired from main alongside audio + telemetry) */
  fx(type: string, data: Record<string, unknown> = {}): void {
    switch (type) {
      case 'explosion': this.shakeMag = Math.min(14, this.shakeMag + (Number(data.radius) || 20) / 6); break;
      case 'fire': {
        this.muzzleTtl = 0.09;
        this.shakeMag = Math.min(14, this.shakeMag + 1.2);
        const tokens = Number(data.tokens) || 0;
        if (tokens >= 70) {
          this.tokenBursts.push({
            x: Number(data.x) || 0, y: Number(data.y) || 0, tokens,
            ttl: 0.9, maxTtl: 0.9, nuke: data.weapon === 'context_nuke',
          });
        }
        break;
      }
      case 'damage': this.hitFlashTtl = 0.3; this.hitFlashDir = Number(data.dir) || 0; this.shakeMag = Math.min(14, this.shakeMag + 3); break;
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
    ctx.imageSmoothingEnabled = false;
    this.dpr = dpr;
    const W = cw, H = ch;

    // camera: follow the agent with lookahead toward facing
    // Compact and square windows previously zoomed so far out that actors read
    // as telemetry. Use stable steps so the important silhouettes stay legible.
    const targetZoom = H < 390 ? 0.82 : H < 540 ? 0.92 : 1;
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

    // J-space: the latent-space weather lives behind everything
    this.drawJSpace(ctx, run, W, H, dt);

    // decay effects
    this.shakeMag = Math.max(0, this.shakeMag - 26 * dt);
    this.glitchTtl = Math.max(0, this.glitchTtl - dt);
    this.hitFlashTtl = Math.max(0, this.hitFlashTtl - dt);
    this.muzzleTtl = Math.max(0, this.muzzleTtl - dt);

    ctx.save();
    if (this.reducedFx) { this.shakeMag = 0; this.glitchTtl = 0; this.whiteFlashTtl = 0; }
    if (this.shakeMag > 0.2) {
      // whole-pixel shake: same violence, no anti-aliased smear
      ctx.translate(Math.round(this.fxRng.range(-this.shakeMag, this.shakeMag)), Math.round(this.fxRng.range(-this.shakeMag, this.shakeMag)));
    }
    // snap the world-to-screen offset to the device-pixel grid so terrain and
    // glyphs stop swimming between anti-aliased positions while the camera pans
    {
      const z = this.camZoom;
      const snap = (v: number) => Math.round(v * this.dpr) / this.dpr;
      ctx.translate(snap(W / 2 - this.camX * z), snap(H / 2 - this.camY * z));
      ctx.scale(z, z);
    }
    const viewL = this.camX - viewW / 2, viewR = this.camX + viewW / 2;


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
      ctx.fillText(run.nearPermTerminal ? '[U: grant permission]' : '✳ subagent permission', pt.x, y - 36);
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
      const relevant = Math.abs(e.x - run.avatar.x) < 230 || e.telegraphing || e.stunnedUntil > run.time;
      this.drawEnemy(ctx, e, e.stunnedUntil > run.time, relevant);
    }

    // the agent + its subagents
    this.drawAvatar(ctx, run);
    this.drawSubagents(ctx, run);

    // Token spend is the causal link between firing and the pursuing wall.
    // Show the cost moving left, toward the forgetting, instead of hiding it
    // exclusively in the HUD meter.
    for (const burst of this.tokenBursts) {
      burst.ttl -= dt;
      const age = 1 - burst.ttl / burst.maxTtl;
      ctx.globalAlpha = Math.max(0, burst.ttl / burst.maxTtl);
      ctx.fillStyle = burst.nuke ? '#f47067' : '#6cb6ff';
      ctx.font = `bold ${burst.nuke ? 12 : 10}px ui-monospace, monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`-${burst.tokens}tk`, burst.x - 20 - age * 52, burst.y - 34 - age * 12);
      ctx.font = '9px monospace';
      for (let i = 0; i < 4; i++) {
        ctx.fillText(i % 2 ? '1' : '0', burst.x - age * (20 + i * 18), burst.y - 18 - i * 3);
      }
    }
    this.tokenBursts = this.tokenBursts.filter((burst) => burst.ttl > 0);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

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
          this.outlinedGlyph(ctx, head, proj.x, proj.y, color);
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
    // attack telegraphs: snipers show their aim; everyone else shows a charge
    for (const e of run.enemies) {
      if (e.dead || !e.telegraphing) continue;
      if (e.def.kind === 'false_positive_sniper') {
        ctx.strokeStyle = `rgba(244,112,103,${0.15 + 0.35 * Math.abs(Math.sin(this.time * 10))})`;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1 / this.camZoom;
        ctx.beginPath(); ctx.moveTo(e.x, e.y - 8); ctx.lineTo(e.aimX, e.aimY); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // charge-up: a tightening amber ring and a blinking ! — you always
        // get a beat to react before anything fires (XAG redundant cues)
        const pulse = 0.35 + 0.6 * Math.abs(Math.sin(this.time * 12));
        ctx.strokeStyle = `rgba(227,179,65,${pulse})`;
        ctx.lineWidth = 1.5 / this.camZoom;
        const r = 20 - 9 * Math.min(1, e.stateTimer / 0.55);
        ctx.beginPath(); ctx.arc(e.x, e.y - 8, r, 0, Math.PI * 2); ctx.stroke();
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        this.outlinedGlyph(ctx, '!', e.x, e.y - 30, '#e3b341');
        ctx.textAlign = 'left';
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
    // the forgetting never leaves: when the wall itself is offscreen left, a
    // faint red rune-lap breathes at the screen edge. you are never safe,
    // only ahead.
    {
      const wallScreenX = W / 2 + (run.wallX - this.camX) * this.camZoom;
      if (wallScreenX < 0 && !run.over) {
        const gap = run.avatar.x - run.wallX;
        // closer wall = hungrier edge (still subtle until it's actually near)
        const urgency = Math.max(0.10, Math.min(0.42, 1 - gap / 900));
        ctx.save();
        ctx.font = '12px ui-monospace, monospace';
        const rows = Math.ceil(H / 16);
        for (let r = 0; r < rows; r++) {
          const lap = Math.sin(this.time * 1.6 + r * 0.7);
          const reach = Math.max(0, 4 + lap * 4 + Math.sin(this.time * 0.5 + r * 1.9) * 2);
          const chars = '░▒▓'[Math.floor(Math.abs(Math.sin(r * 7.3 + Math.floor(this.time * 2))) * 3) % 3];
          ctx.globalAlpha = urgency * (0.5 + 0.5 * Math.abs(lap));
          ctx.fillStyle = '#f47067';
          ctx.fillText(chars, reach - 4, r * 16 + 12);
          if (r % 5 === Math.floor(this.time) % 5) {
            ctx.globalAlpha = urgency * 0.8;
            ctx.fillText('×', reach + 3, r * 16 + 12);
          }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
    // offscreen threat chevrons: a charging enemy you can't see still warns
    // you from the screen edge at its height (XAG offscreen redundant cues)
    for (const e of run.enemies) {
      if (e.dead || !e.telegraphing) continue;
      const sx = W / 2 + (e.x - this.camX) * this.camZoom;
      if (sx >= -12 && sx <= W + 12) continue;
      const sy = Math.max(70, Math.min(H - 96, H / 2 + (e.y - this.camY) * this.camZoom));
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = `rgba(227,179,65,${0.45 + 0.5 * Math.abs(Math.sin(this.time * 8))})`;
      ctx.textAlign = 'center';
      ctx.fillText(sx < 0 ? '‹‹ !' : '! ››', sx < 0 ? 28 : W - 28, sy);
      ctx.textAlign = 'left';
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
      // directional cue: the struck side burns brighter (you know where it
      // came from even mid-chaos — XAG redundant cues)
      if (this.hitFlashDir !== 0) {
        const side = ctx.createLinearGradient(this.hitFlashDir > 0 ? W : 0, 0, W / 2, 0);
        side.addColorStop(0, `rgba(244,112,103,${0.4 * a})`);
        side.addColorStop(1, 'rgba(244,112,103,0)');
        ctx.fillStyle = side;
        ctx.fillRect(0, 0, W, H);
      }
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
    const relevant = active || Math.abs(s.x - run.avatar.x) < 260;
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
    if (relevant) ctx.fillText(label.slice(0, 26), s.x, y - 38);
    if (relevant && !t.done && !t.forgotten) {
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
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    this.outlinedGlyph(ctx, glyph, cr.x, y - 5, color);
    if (!cr.used && cr.kind === 'model') {
      // the good crate advertises itself
      ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(this.time * 3));
      ctx.font = `${10 / this.camZoom}px ui-monospace, monospace`;
      ctx.fillText('new model!', cr.x, y - 40);
      ctx.globalAlpha = cr.used ? 0.3 : 1;
    }
    if (!cr.used && run.nearCrate === cr) {
      ctx.font = `${11 / this.camZoom}px ui-monospace, monospace`;
      ctx.fillText(cr.kind === 'model' ? '[U: upgrade the model]' : '[U to install update]', cr.x, y - 28);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: import('./enemies').Enemy, stunned = false, relevant = false): void {
    ctx.save();
    ctx.translate(e.x, e.y);
    let phase = e.def.kind === 'hallucination_ghost' ? 0.45 + 0.4 * Math.abs(Math.sin(e.stateTimer * 1.8)) : 1;
    if (stunned) phase = Math.min(phase, 0.75);
    ctx.globalAlpha = phase;
    const size = e.mini ? 9 : 14;
    ctx.fillStyle = '#161615';
    ctx.strokeStyle = e.def.color;
    ctx.lineWidth = relevant ? 2 : 1.5;
    ctx.beginPath();
    switch (e.def.kind) {
      case 'timeout_blob':
        ctx.roundRect(-size, -size * 0.72, size * 2, size * 1.44, 6);
        break;
      case 'hallucination_ghost':
        ctx.moveTo(0, -size - 3); ctx.lineTo(size, 0); ctx.lineTo(0, size);
        ctx.lineTo(-size, 0); ctx.closePath();
        break;
      case 'regression_splitter':
        ctx.moveTo(-size, -size * 0.45); ctx.lineTo(-size * 0.45, -size);
        ctx.lineTo(size * 0.45, -size); ctx.lineTo(size, -size * 0.45);
        ctx.lineTo(size, size * 0.45); ctx.lineTo(size * 0.45, size);
        ctx.lineTo(-size * 0.45, size); ctx.lineTo(-size, size * 0.45); ctx.closePath();
        break;
      case 'restart_crawler':
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        break;
      case 'false_positive_sniper':
        ctx.moveTo(0, -size - 4); ctx.lineTo(size * 0.72, size);
        ctx.lineTo(-size * 0.72, size); ctx.closePath();
        break;
      case 'tool_turret':
        ctx.rect(-size, -size * 0.55, size * 2, size * 1.55);
        break;
      case 'overflow_emitter':
        ctx.rect(-size * 0.68, -size - 4, size * 1.36, size * 2 + 4);
        break;
      case 'recovery_sprite':
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        break;
    }
    ctx.fill();
    ctx.stroke();
    if (e.def.kind === 'regression_splitter') {
      ctx.beginPath(); ctx.moveTo(0, -size + 3); ctx.lineTo(0, size - 3); ctx.stroke();
    } else if (e.def.kind === 'tool_turret') {
      ctx.beginPath(); ctx.moveTo(0, -size * 0.55); ctx.lineTo(size + 7, -size); ctx.stroke();
    } else if (e.def.kind === 'overflow_emitter') {
      ctx.globalAlpha = phase * (0.5 + 0.35 * Math.abs(Math.sin(this.time * 5)));
      ctx.strokeRect(-size * 0.35, -size + 1, size * 0.7, size * 1.65);
      ctx.globalAlpha = phase;
    }
    ctx.font = `${e.mini ? 10 : 14}px monospace`;
    ctx.textAlign = 'center';
    this.outlinedGlyph(ctx, e.def.glyph, 0, 4, e.def.color);
    // hp pips + name
    if (!e.def.friendly) {
      const frac = Math.max(0, e.hp / (e.mini ? e.def.hp / 2 : e.def.hp));
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-size, -size - 6, size * 2, 3);
      ctx.fillStyle = e.def.color;
      ctx.fillRect(-size, -size - 6, size * 2 * frac, 3);
    }
    if (relevant) {
      ctx.font = `${10 / this.camZoom}px ui-monospace, monospace`;
      ctx.globalAlpha = phase * 0.82;
      ctx.fillText(e.def.name + (e.mini ? '·mini' : ''), 0, -size - 12);
    }
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
      ctx.beginPath(); ctx.arc(0, -15, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const color = dead ? '#555' : '#7ee787';
    const moving = Math.abs(a.vx) > 5 && a.onGround;

    // glyph legs, scuttling when moving
    if (!dead) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      const phase = moving ? Math.sin(a.x * 0.25) * 3 : 0;
      ctx.beginPath();
      ctx.moveTo(-8, -4); ctx.lineTo(-9 - phase, 0);
      ctx.moveTo(8, -4); ctx.lineTo(9 + phase, 0);
      ctx.stroke();
    }

    // terminal window body
    ctx.fillStyle = dead ? '#222' : '#0c120e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-17, -28, 34, 24, 2); ctx.fill(); ctx.stroke();
    // title bar
    ctx.fillStyle = a.headsDown && !dead ? 'rgba(244,112,103,0.35)' : dead ? '#333' : 'rgba(126,231,135,0.22)';
    ctx.fillRect(-16, -27, 32, 6);
    // traffic-light dots + model tag in the title bar
    ctx.fillStyle = dead ? '#555' : '#f47067'; ctx.fillRect(-15, -25.5, 2, 2);
    ctx.fillStyle = dead ? '#555' : '#e3b341'; ctx.fillRect(-12, -25.5, 2, 2);
    ctx.font = '6px monospace';
    ctx.fillStyle = dead ? '#666' : color;
    ctx.textAlign = 'right';
    ctx.fillText(`v${a.model}`, 15, -22);
    ctx.textAlign = 'left';
    // the face: a prompt
    ctx.font = '11px monospace';
    ctx.fillStyle = dead ? '#777' : color;
    if (dead) {
      ctx.fillText('x_x', -9, -10);
    } else if (run.working) {
      // typing furiously
      const dots = '▖▘▝▗'[Math.floor(this.time * 8) % 4];
      ctx.fillText(`>${dots}`, a.facing === 1 ? -8 : -5, -10);
    } else {
      const cursor = Math.sin(this.time * 4) > 0 ? '_' : ' ';
      ctx.fillText(a.facing === 1 ? `>${cursor}` : `${cursor}<`, a.facing === 1 ? -8 : -5, -10);
    }
    // antenna off the window corner
    if (!dead) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(12, -28); ctx.lineTo(16, -35); ctx.stroke();
      ctx.beginPath(); ctx.arc(16, -36, 2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      if (this.muzzleTtl > 0) {
        ctx.fillStyle = `rgba(255,243,214,${this.muzzleTtl / 0.09})`;
        ctx.font = '12px monospace';
        ctx.fillText(a.facing === 1 ? '»' : '«', a.facing * 21 - 4, -13);
      }
    }
    // heads-down indicator
    if (a.headsDown && !dead) {
      ctx.fillStyle = '#f47067';
      ctx.font = `${10 / this.camZoom}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('⌨ heads-down', 0, -45);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  private drawSubagents(ctx: CanvasRenderingContext2D, run: Run): void {
    for (const sa of run.subagents) {
      ctx.save();
      ctx.globalAlpha = sa.corrupted ? 0.5 : 0.28;
      ctx.strokeStyle = sa.corrupted ? '#f47067' : '#7ee787';
      ctx.lineWidth = 1 / this.camZoom;
      ctx.setLineDash(sa.corrupted ? [2, 5] : [4, 5]);
      ctx.beginPath();
      ctx.moveTo(run.avatar.x, run.avatar.y - 12);
      ctx.lineTo(sa.x, sa.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
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
    const pending = run.queue.tasks.map((t, i) => ({ t, i })).filter(({ t }) => !t.done && !t.forgotten);
    const nextAhead = run.stations.find((s) => s.x >= a.x - 40 && !run.queue.tasks[s.taskIndex].done && !run.queue.tasks[s.taskIndex].forgotten);
    const focusIndex = run.nearStation?.taskIndex ?? nextAhead?.taskIndex ?? pending[0]?.i;
    const visible = [focusIndex, ...pending.map(({ i }) => i).filter((i) => i !== focusIndex)]
      .filter((i): i is number => i !== undefined).slice(0, 2);
    const taskRows = visible.map((i) => {
      const t = run.queue.tasks[i];
      const cls = ['task-row'];
      const isCurrent = i === focusIndex;
      if (t.done) cls.push('done');
      else if (isCurrent) cls.push('current');
      if (t.forgotten && !t.done) cls.push('forgotten');
      const glyph = t.done ? '☒' : t.forgotten ? '▓' : isCurrent ? '▸' : '☐';
      const blocks = !t.done && !t.forgotten && t.progress > 0
        ? ` <span class="task-blocks">[${'▰'.repeat(t.progress)}${'▱'.repeat(Math.max(0, t.workUnits - t.progress))}]</span>` : '';
      const name = t.forgotten && !t.done ? garble(t.name, this.garbleRng, 0.35) : t.name;
      return `<div class="${cls.join(' ')}"><span class="glyph">${glyph}</span><span>${escapeHtml(name)}${blocks}</span></div>`;
    }).join('') + (pending.length > visible.length
      ? `<div class="task-row dim"><span class="glyph">·</span><span>${pending.length - visible.length} more queued</span></div>` : '');
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
    const kinds = [...byKind.entries()];
    const roster = kinds.slice(0, 3)
      .map(([name, n]) => `<div class="task-row"><span class="glyph">·</span><span>${escapeHtml(name)} ×${n}</span></div>`)
      .join('') + (kinds.length > 3
        ? `<div class="task-row dim"><span class="glyph">·</span><span>${kinds.length - 3} more error classes</span></div>` : '') ||
      '<div class="task-row dim"><span class="glyph">·</span><span>all errors resolved</span></div>';
    const crates = run.crates.filter((c) => !c.used).length;
    panel.innerHTML = `
      <div class="pp-name" style="color:#ff9440">session: ${escapeHtml(s.sessionId)}
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
    const lines = run.log.slice(-3);
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
      html = `<span class="spin">✻</span> <span class="spin-verb">${run.over.won ? 'session complete' : 'process terminated'}</span> <span class="spin-hint">(recap incoming)</span>`;
    } else if (run.crateMenu) {
      menuMode = true;
      html = `<div class="menu-title">⬆ crate: choose one</div>` + run.crateMenu.options.map((o, i) =>
        `<div class="menu-opt"><span class="sb-key">${i + 1}</span> ${escapeHtml(o.label)} <span class="dim">· ${escapeHtml(o.desc)}</span></div>`
      ).join('');
    } else if (run.summarizing > 0) {
      const g = ['✂', '✻', '✂', '✽'][Math.floor(this.time * 8) % 4];
      html = `<span class="spin">${g}</span> <span class="spin-verb">Summarizing conversation…</span> <span class="spin-hint">(heads-down, /compact in progress)</span>`;
    } else {
      const slot = run.weapons[run.selected];
      const ammo = slot.ammo === Infinity ? '∞' : `×${slot.ammo}`;
      const bits: string[] = [];
      if (slot.def.id === 'debug_zap' && run.zapThink > 0) bits.push('<span style="color:var(--yellow)">✳ thinking…</span>');
      if (run.working && run.nearStation) {
        bits.push(`<span style="color:var(--yellow)">⌨ working "${escapeHtml(run.queue.tasks[run.nearStation.taskIndex].name)}"…</span>`);
      } else if (run.nearStation) {
        bits.push(`<span style="color:#7ee787">hold W: "${escapeHtml(run.queue.tasks[run.nearStation.taskIndex].name)}"</span>`);
      }
      if (run.nearPermTerminal) bits.push('<span style="color:#7ee787">✳ U grants the Task tool (unlocks subagents)</span>');
      if (run.nearCrate) bits.push(`<span style="color:${run.nearCrate.kind === 'model' ? 'var(--blue)' : 'var(--yellow)'}">${run.nearCrate.kind === 'model' ? '◈' : '⬆'} U to install</span>`);
      if (slot.def.id === 'context_nuke') bits.push('<span style="color:var(--red)">⚠ floods 25% of YOUR context</span>');
      if (run.insideWall) bits.push('<span style="color:var(--red)">▓ INSIDE THE FORGETTING: bleeding, weapons spraying</span>');
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
    campaign?: { diff: number; tierName: string; prevRank: string | null; mode: import('./session').SessionMode },
  ): void {
    const cols = $('briefing-cols');
    cols.innerHTML = '';
    const s = loadout.cardSummary;
    const campaignLine = campaign?.mode === 'real'
      ? `<div class="stat-line" style="color:var(--yellow)">difficulty ${campaign.diff}/100 · ${escapeHtml(campaign.tierName)}${campaign.prevRank ? ` · your record: ${escapeHtml(campaign.prevRank)}` : ' · unplayed'}</div>`
      : campaign
        ? `<div class="stat-line dim">${campaign.mode === 'demo' ? 'fictional demo' : 'random session'} · no campaign progress is recorded</div>`
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
      ${loadout.stability < 45 ? '<div class="handicap-note">⚑ HANDICAP: low stability grants a starting shield + damage bonus. struggling agents get armor.</div>' : ''}
      <h4>TASK QUEUE (stations along the timeline. work them before the wall does)</h4><ul>${tasks}</ul>
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
      return `<li>${def.glyph} ${def.name} ×${spawnN}<span class="wsrc">⎿ ${escapeHtml(err.category || err.type || '')} ×${count}${err.sample ? `: "${escapeHtml(err.sample.slice(0, 60))}"` : ''}</span><span class="wsrc dim">${escapeHtml(def.flavor)}</span></li>`;
    }).join('') || '<li class="dim">no errors on record. a quiet session (three regressions will attend anyway)</li>';
    levelCol.innerHTML = `
      <h3>the level: session ${escapeHtml(s.sessionId)}${s.fromCard ? '' : ' <span class="dim">(generated)</span>'}</h3>
      ${card.goal ? `<div class="stat-line" style="color:var(--yellow)">the mission, in your own words: "${escapeHtml(String(card.goal).slice(0, 120))}"</div>` : ''}
      ${(card.moments?.length ?? 0) > 0 ? `<div class="stat-line dim">◇ ${card.moments!.length} real moments from the session stand along the timeline</div>` : ''}
      <div class="stat-line dim">${s.fromCard ? `history: ${escapeHtml(s.topErrorCategory)} ×${s.topErrorCount}, ${s.compactionEvents} compactions, ${s.restarts} restarts, token peak ${s.tokenPeak}` : 'random session. drop a SessionCard to run your real one'}</div>
      <div class="stat-line">timeline length scales with message_count · your errors spawn as creatures at points along it · behind you: the wall of forgetting</div>
      <h4>ENEMY ROSTER (from the real error log)</h4><ul>${roster}</ul>
    `;
    cols.appendChild(levelCol);

    // the Observer's memory-lane roast slot (filled by main; LLM version swaps in)
    document.querySelectorAll('#briefing-roast').forEach((el) => el.remove());
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
    rankInfo?: {
      rank: 'S' | 'A' | 'B' | 'C' | 'D'; newBest: boolean; rankUp: boolean; prevBest: number | null;
      outcome: { survived: boolean; recovered: boolean; perfect: boolean };
      campaignRecorded: boolean;
    },
    forward?: ForwardRecap,
  ): void {
    const over = run.over!;
    const s = run.loadout.cardSummary;
    const done = run.queue.tasks.filter((t) => t.done);
    const eaten = run.queue.tasks.filter((t) => t.forgotten && !t.done);

    // 1) celebrate: outcome + rank dominate — losses get an equally proud screen
    const head = $('recap-headline');
    head.textContent = over.won
      ? (rankInfo?.outcome.perfect ? 'PERFECT RECALL' : rankInfo?.outcome.recovered ? 'SESSION RECOVERED' : 'SESSION SURVIVED')
      : (over.reason === 'wall' ? 'EATEN BY THE FORGETTING' : 'SESSION LOST');
    head.className = over.won ? 'won' : 'lost';
    const RANK_COLORS: Record<string, string> = { S: '#7ee787', A: '#6cb6ff', B: '#dedad2', C: '#e3b341', D: '#f47067' };
    const rankBig = $('recap-rank-big');
    if (rankInfo) {
      rankBig.textContent = `★${rankInfo.rank}`;
      rankBig.style.color = RANK_COLORS[rankInfo.rank];
      rankBig.style.textShadow = `0 0 26px ${RANK_COLORS[rankInfo.rank]}66`;
      rankBig.classList.remove('hidden');
    } else rankBig.classList.add('hidden');
    $('recap-score-line').innerHTML = `SCORE <b>${over.score.toLocaleString()}</b>` +
      `${rankInfo?.newBest && (rankInfo.prevBest ?? 0) > 0 ? ` · <span style="color:var(--green)">new best (+${(over.score - (rankInfo.prevBest ?? 0)).toLocaleString()})</span>`
        : rankInfo?.prevBest ? ` · <span class="dim">best ${rankInfo.prevBest.toLocaleString()}</span>` : ''}`;
    $('recap-facts').textContent = [
      `${Math.floor(run.time)}s`, `${run.kills} errors resolved`,
      `${done.length}/${run.queue.tasks.length} tasks recovered`, `${run.ctx.compactions} compactions`,
    ].join(' · ');

    // 2) what moved forward — rows arrive precomputed, every one stat-bound
    const fwd = $('recap-forward');
    const rowsBox = $('recap-forward-rows');
    if (forward && forward.rows.length > 0) {
      rowsBox.innerHTML = forward.rows.map((r) =>
        `<div class="row ${r.cls}"><div class="g">${escapeHtml(r.glyph)}</div><div>${escapeHtml(r.text)}</div></div>`).join('');
      fwd.classList.remove('hidden');
    } else fwd.classList.add('hidden');

    // 3) the Observer's last word
    const obs = $('recap-observer');
    if (forward?.observerWord) {
      $('recap-observer-line').textContent = `"${forward.observerWord}"`;
      obs.classList.remove('hidden');
    } else obs.classList.add('hidden');

    // 4) the fine print (kept compact under the celebration)
    const cardBits = s.mode === 'real'
      ? `<p class="dim">real session ${escapeHtml(s.sessionId)} · top error ${escapeHtml(s.topErrorCategory)} ×${s.topErrorCount} · ${s.compactionEvents} recorded compaction${s.compactionEvents === 1 ? '' : 's'}${s.tasksTotal > 0 ? ` · the real agent finished ${s.tasksCompleted}/${s.tasksTotal}` : ''}</p>`
      : s.mode === 'demo' || s.mode === 'fictional'
        ? '<p class="dim">authored fictional session · it never touches your real-history ranks.</p>'
        : '<p class="dim">randomly generated session · pick a real one from the timeline for a personalized level.</p>';
    $('recap-body').innerHTML = `
      ${eaten.length ? `<p style="color:var(--red);font-size:12px">eaten by the wall: ${eaten.map((t) => escapeHtml(t.name)).join(', ')}</p>` : ''}
      ${cardBits}
    `;
  }
}
