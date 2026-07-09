// Rendering + HUD, styled as an agent-harness TUI (Claude Code / Hermes):
// character meters, ☐/☒ task todos, ⏺/⎿ transcript bullets, a boxed > prompt
// with blinking cursor, ✻ spinner verbs while the CPU thinks or shots fly.

import { Game, Player, Banner } from './game';
import { contextFrac } from './context';
import { garble } from './context';
import { Rng } from './rng';
import { AgentLoadout } from './session';
import { WEAPONS } from './weapons';
import { progressFrac } from './tasks';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const SPIN_GLYPHS = ['✳', '✻', '✽', '✶'];
const CPU_VERBS = [
  'Scheming', 'Reading the wind', 'Triangulating', 'Prioritizing tasks',
  'Second-guessing', 'Consulting the error log', 'Weighing work vs. violence',
];
const FLIGHT_VERBS = ['Bombarding', 'Delivering payload', 'Propagating errors', 'Awaiting impact'];

function textBar(frac: number, width = 10): string {
  const f = Math.max(0, Math.min(1, frac));
  const fill = Math.round(f * width);
  return '█'.repeat(fill) + '░'.repeat(width - fill);
}

function kebab(name: string): string {
  return name.toLowerCase().replace(/ /g, '-');
}

export class UI {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camX = 0; private camY = 0; private camZoom = 1;
  private trackedGame: Game | null = null;
  private lastDirty = -1;
  private lastBannerCount = -1;
  private lastPrompt = '';
  private garbleRng = new Rng('ui-garble');
  private time = 0;

  constructor() {
    this.canvas = $('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  // -------------------------------------------------------------------------
  // per-frame canvas rendering
  // -------------------------------------------------------------------------

  render(game: Game, dt: number): void {
    this.time += dt;
    const c = this.canvas;
    const wrap = c.parentElement!;
    if (c.width !== wrap.clientWidth || c.height !== wrap.clientHeight) {
      c.width = wrap.clientWidth || 800;
      c.height = wrap.clientHeight || 450;
    }
    const ctx = this.ctx;
    const W = c.width, H = c.height;

    // --- camera: fit arena; follow live projectiles zoomed in ---
    const fitZoom = Math.min(W / game.terrain.width, H / game.terrain.height);
    let targetZoom = fitZoom;
    let targetX = game.terrain.width / 2;
    let targetY = game.terrain.height / 2;
    if (game.phase === 'projectile' && game.projectiles.length > 0) {
      const p = game.projectiles[0];
      targetZoom = Math.max(fitZoom * 1.5, Math.min(1.1, fitZoom * 2));
      targetX = p.x; targetY = Math.min(p.y, game.terrain.height * 0.75);
    }
    // new match: snap the camera instead of lerping in from a stale state
    if (this.trackedGame !== game) {
      this.trackedGame = game;
      this.camZoom = targetZoom; this.camX = targetX; this.camY = targetY;
    }
    const lerp = 1 - Math.pow(0.001, dt);
    this.camZoom += (targetZoom - this.camZoom) * lerp;
    this.camX += (targetX - this.camX) * lerp;
    this.camY += (targetY - this.camY) * lerp;
    // clamp camera to arena
    const viewW = W / this.camZoom, viewH = H / this.camZoom;
    this.camX = Math.max(Math.min(this.camX, game.terrain.width - viewW / 2), viewW / 2);
    if (viewW >= game.terrain.width) this.camX = game.terrain.width / 2;
    this.camY = Math.max(Math.min(this.camY, game.terrain.height - viewH / 2), viewH / 2);
    if (viewH >= game.terrain.height) this.camY = game.terrain.height / 2;

    // --- sky ---
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a0b0d');
    grad.addColorStop(0.7, '#101310');
    grad.addColorStop(1, '#0f0f0e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    // faint memory-grid in the sky
    ctx.strokeStyle = 'rgba(126,231,135,0.05)';
    ctx.lineWidth = 1 / this.camZoom;
    ctx.beginPath();
    for (let x = 0; x < game.terrain.width; x += 120) { ctx.moveTo(x, 0); ctx.lineTo(x, game.terrain.height); }
    for (let y = 0; y < game.terrain.height; y += 120) { ctx.moveTo(0, y); ctx.lineTo(game.terrain.width, y); }
    ctx.stroke();

    // terrain
    ctx.drawImage(game.terrain.canvas as CanvasImageSource, 0, 0);

    // tanks
    for (const p of game.players) this.drawTank(ctx, p, game);

    // projectiles + trails
    for (const proj of game.projectiles) {
      ctx.strokeStyle = 'rgba(217,119,87,0.35)';
      ctx.lineWidth = 1.5 / this.camZoom;
      ctx.beginPath();
      for (let i = 0; i < proj.trail.length; i++) {
        const t = proj.trail[i];
        if (i === 0) ctx.moveTo(t.x, t.y); else ctx.lineTo(t.x, t.y);
      }
      ctx.stroke();
      if (proj.landed) {
        // fused round blinking on the ground
        const blink = Math.sin(this.time * 20) > 0;
        ctx.fillStyle = blink ? '#f47067' : '#e3b341';
        ctx.beginPath(); ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e3b341';
        ctx.font = '9px monospace';
        ctx.fillText('waiting…', proj.x + 7, proj.y - 4);
      } else {
        ctx.fillStyle = '#fff3d6';
        ctx.beginPath(); ctx.arc(proj.x, proj.y, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(217,119,87,0.8)';
        ctx.beginPath(); ctx.arc(proj.x, proj.y, 5.5, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // lasers
    for (const l of game.lasers) {
      ctx.strokeStyle = `rgba(244,112,103,${Math.min(1, l.ttl * 3)})`;
      ctx.lineWidth = 3 / this.camZoom;
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, l.ttl * 2)})`;
      ctx.lineWidth = 1 / this.camZoom;
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    }

    // glyph particles — damage looks like corrupted buffer spray
    for (const pt of game.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.font = `${pt.size}px monospace`;
      ctx.fillText(pt.char, pt.x, pt.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // DOM HUD refresh only when game state changed
    if (game.dirty !== this.lastDirty) {
      this.lastDirty = game.dirty;
      this.renderHud(game);
    }
    if (game.banners.length !== this.lastBannerCount) {
      this.lastBannerCount = game.banners.length;
      this.renderBanners(game);
    }
    // prompt line updates every frame (spinner animation), writes only on change
    this.renderPrompt(game);
  }

  private drawTank(ctx: CanvasRenderingContext2D, p: Player, game: Game): void {
    const dead = p.hp <= 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    // shield bubble
    if (p.shield > 0) {
      ctx.strokeStyle = 'rgba(108,182,255,0.7)';
      ctx.fillStyle = 'rgba(108,182,255,0.10)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -4, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // barrel
    if (!dead) {
      const rad = (p.angle * Math.PI) / 180;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(Math.cos(rad) * 17, -6 - Math.sin(rad) * 17);
      ctx.stroke();
    }
    // treads + body
    ctx.fillStyle = dead ? '#333' : '#1c1f1c';
    ctx.strokeStyle = dead ? '#555' : p.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-11, -8, 22, 8, 2); ctx.fill(); ctx.stroke();
    // dome head with a little face
    ctx.beginPath(); ctx.arc(0, -9, 6, Math.PI, 0); ctx.fill(); ctx.stroke();
    if (!dead) {
      ctx.fillStyle = p.color;
      ctx.fillRect(-3.5, -11, 2, 2);
      ctx.fillRect(1.5, -11, 2, 2);
    } else {
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(-1, -9); ctx.moveTo(-1, -12); ctx.lineTo(-4, -9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -12); ctx.lineTo(4, -9); ctx.moveTo(4, -12); ctx.lineTo(1, -9); ctx.stroke();
    }
    // antenna
    ctx.strokeStyle = dead ? '#555' : p.color;
    ctx.beginPath(); ctx.moveTo(6, -14); ctx.lineTo(9, -20); ctx.stroke();
    ctx.beginPath(); ctx.arc(9, -21, 1.5, 0, Math.PI * 2); ctx.fillStyle = dead ? '#555' : p.color; ctx.fill();
    // name label (constant screen size so tanks are findable at any zoom)
    const isCurrent = game.current.index === p.index && game.phase === 'aim' && !dead;
    const labelPx = 11 / this.camZoom;
    ctx.font = `${labelPx}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = isCurrent ? 0.95 : 0.55;
    ctx.fillStyle = dead ? '#666' : p.color;
    ctx.fillText(p.name.slice(0, 16), 0, -26 - labelPx);
    // active-turn marker
    if (isCurrent) {
      const bob = Math.sin(this.time * 4) * 2;
      ctx.fillText('▼', 0, -24 + bob);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // DOM HUD
  // -------------------------------------------------------------------------

  renderHud(game: Game): void {
    $('round-label').textContent = `ROUND ${game.round}`;
    const w = game.wind;
    const arrows = w === 0 ? '·' : (w > 0 ? '→'.repeat(Math.min(4, Math.ceil(Math.abs(w) / 3))) : '←'.repeat(Math.min(4, Math.ceil(Math.abs(w) / 3))));
    $('wind-label').textContent = `wind ${arrows} ${Math.abs(w).toFixed(1)}`;
    const cb = game.comeback;
    $('comeback-label').textContent = cb.holder >= 0
      ? `⚑ comeback: ${game.players[cb.holder].name} +${Math.round((cb.damageMult - 1) * 100)}% dmg, −${Math.round(cb.tokenDiscount * 100)}% costs`
      : '';

    for (const p of game.players) this.renderPanel(game, p);
    this.renderWeaponBar(game);
    this.renderTranscript(game);

    $('status-bar').innerHTML =
      `<span><span class="sb-key">space</span> fire</span>` +
      `<span><span class="sb-key">w</span> work</span>` +
      `<span><span class="sb-key">u</span> update</span>` +
      `<span><span class="sb-key">[ ]</span>/<span class="sb-key">1-9</span> weapons</span>` +
      `<span><span class="sb-key">a/d</span> move (${game.gameOver ? 0 : game.current.movesLeft})</span>` +
      `<span class="sb-right">aiaio · round ${game.round} · ${game.players[0].stats.compactions + game.players[1].stats.compactions}⚡ total compactions</span>`;
  }

  private renderPanel(game: Game, p: Player): void {
    const panel = $(`panel-${p.index}`);
    panel.className = `player-panel p${p.index}` + (game.current.index === p.index && !game.gameOver ? ' active' : '');
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    const ctxF = contextFrac(p.ctx);
    const overThresh = ctxF >= p.ctx.threshold;

    const taskRows = p.queue.tasks.map((t, i) => {
      const cls = ['task-row'];
      const isCurrent = !t.done && i === p.queue.current;
      if (t.done) cls.push('done');
      else if (isCurrent) cls.push('current');
      if (t.forgotten && !t.done) cls.push('forgotten');
      const glyph = t.done ? '☒' : isCurrent ? '▸' : '☐';
      const blocks = isCurrent || (!t.done && t.progress > 0)
        ? ` <span class="task-blocks">[${'▰'.repeat(t.progress)}${'▱'.repeat(Math.max(0, t.workUnits - t.progress))}]</span>` : '';
      const name = t.forgotten && !t.done ? garble(t.name, this.garbleRng, 0.35) : t.name;
      return `<div class="${cls.join(' ')}"><span class="glyph">${glyph}</span><span>${escapeHtml(name)}${blocks}</span></div>`;
    }).join('');

    const hpColor = hpFrac > 0.35 ? p.color : 'var(--red)';
    const ctxColor = overThresh ? 'var(--red)' : 'var(--blue)';
    panel.innerHTML = `
      <div class="pp-name" style="color:${p.color}">${escapeHtml(p.name)}
        ${p.isCpu ? '<span class="badge">cpu</span>' : ''}
        <span class="badge">stability ${p.stability}</span>
        <span class="badge">hardening ${(p.hardening * 100).toFixed(0)}%</span>
        ${p.shield > 0 ? `<span class="badge" style="color:var(--blue)">🛡 ${p.shield}</span>` : ''}
        ${p.headsDown ? '<span class="badge" style="color:var(--red)">⌨ heads-down</span>' : ''}
        ${p.updateOffer > 0 ? '<span class="badge" style="color:var(--yellow)">⬆ update!</span>' : ''}
      </div>
      <div class="meter">proc <span class="tbar" style="color:${hpColor}">${textBar(hpFrac)}</span> <span class="val">${Math.max(0, Math.round(p.hp))}/${p.maxHp}</span></div>
      <div class="meter">ctx  <span class="tbar" style="color:${ctxColor}">${textBar(ctxF)}</span> <span class="val">${p.ctx.used}/${p.ctx.budget}</span> · auto-compact @${Math.round(p.ctx.threshold * 100)}% · ${p.ctx.compactions}⚡</div>
      <div class="tasks-list">${taskRows}</div>
    `;
  }

  private renderWeaponBar(game: Game): void {
    const bar = $('weapon-bar');
    bar.innerHTML = '';
    const p = game.current;
    p.weapons.forEach((slot, i) => {
      const div = document.createElement('div');
      div.className = 'weapon-slot' + (i === p.selected ? ' selected' : '') + (p.index === 1 ? ' p1sel' : '') +
        (slot.ammo <= 0 || slot.cooldownLeft > 0 ? ' empty' : '');
      const cd = slot.cooldownLeft > 0 ? ` ❄${slot.cooldownLeft}` : '';
      const sel = i === p.selected ? '❯' : ' ';
      div.innerHTML = `
        <span class="dim">${sel} ${i + 1}</span>
        <span class="wname">${slot.def.glyph} ${kebab(slot.def.name)}</span>
        <span class="wmeta">×${slot.ammo} · ${slot.def.tokenCost}tk${cd}</span>
        <div class="tooltip">${escapeHtml(slot.def.flavor)}<span class="tsrc">from log: ${escapeHtml(slot.sourceLine)}</span></div>
      `;
      div.addEventListener('click', () => game.selectWeapon(i));
      bar.appendChild(div);
    });
  }

  /** transcript: classify each log line into ⏺ action / ⎿ result / system */
  private renderTranscript(game: Game): void {
    const feed = $('log-feed');
    feed.innerHTML = '';
    const lines = game.log.slice(-4);
    lines.forEach((line, idx) => {
      const div = document.createElement('div');
      div.className = 'tr-line' + (idx === lines.length - 1 ? ' fresh' : '');
      const first = [...line][0]; // first grapheme-ish char
      let bullet = '⏺', bclass = 'b-action';
      if ('💢⚡'.includes(first)) { bullet = '⏺'; bclass = 'b-bad'; }
      else if ('🛡⏱☢⬇·✔'.includes(first)) { bullet = '⎿'; bclass = 'b-result'; }
      else if ('⚑📣💥⬆▶'.includes(first)) { bullet = '⏺'; bclass = 'b-system'; }
      else if (first === '✦' || first === '⌨') {
        bullet = '⏺';
        bclass = line.includes(game.players[1].name) && !line.includes(game.players[0].name) ? 'b-p1' : 'b-action';
      }
      const body = line.replace(/^[✦⌨▶·]\s*/u, '');
      div.innerHTML = `<span class="tr-bullet ${bclass}">${bullet}</span>${escapeHtml(body)}`;
      feed.appendChild(div);
    });
  }

  /** the boxed prompt: > aim readout for humans, ✻ spinner while CPU/shots act */
  private renderPrompt(game: Game): void {
    let html: string;
    if (game.gameOver) {
      html = `<span class="spin">✻</span> <span class="spin-verb">session terminated</span> <span class="spin-hint">— recap incoming</span>`;
    } else if (game.phase === 'projectile') {
      const g = SPIN_GLYPHS[Math.floor(this.time * 9) % SPIN_GLYPHS.length];
      const verb = FLIGHT_VERBS[Math.floor(this.time / 1.6) % FLIGHT_VERBS.length];
      html = `<span class="spin">${g}</span> <span class="spin-verb">${verb}…</span> <span class="spin-hint">(ordnance in flight)</span>`;
    } else if (game.current.isCpu) {
      const g = SPIN_GLYPHS[Math.floor(this.time * 9) % SPIN_GLYPHS.length];
      const verb = CPU_VERBS[Math.floor(this.time / 1.6) % CPU_VERBS.length];
      html = `<span class="spin">${g}</span> <span class="spin-verb">${verb}…</span> <span class="spin-hint">(${escapeHtml(game.current.name)} is taking its turn)</span>`;
    } else {
      const p = game.current;
      const slot = p.weapons[p.selected];
      const upd = p.updateOffer > 0 ? ` · <span style="color:var(--yellow)">⬆ u to install update</span>` : '';
      html = `<span class="pcaret">&gt;</span> <span style="color:${p.color}">${escapeHtml(p.name)}</span>` +
        ` · angle ${Math.round(p.angle)}° · power ${Math.round(p.power)}` +
        ` · ${slot.def.glyph} ${kebab(slot.def.name)} ×${slot.ammo}${upd} <span class="cursor"></span>`;
    }
    if (html !== this.lastPrompt) {
      this.lastPrompt = html;
      $('turn-hint').innerHTML = `<div class="prompt-box">${html}</div>`;
    }
  }

  private renderBanners(game: Game): void {
    const layer = $('banner-layer');
    layer.innerHTML = '';
    const b: Banner | undefined = game.banners[0];
    if (!b) return;
    const div = document.createElement('div');
    div.className = `banner ${b.kind}`;
    div.innerHTML = `<h3>${escapeHtml(b.title)}</h3>` + b.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
    layer.appendChild(div);
  }

  // -------------------------------------------------------------------------
  // briefing + recap builders
  // -------------------------------------------------------------------------

  buildBriefing(loadouts: [AgentLoadout, AgentLoadout], names: [string, string]): void {
    const cols = $('briefing-cols');
    cols.innerHTML = '';
    loadouts.forEach((l, i) => {
      const col = document.createElement('div');
      col.className = `briefing-col p${i}`;
      const s = l.cardSummary;
      const weapons = l.weapons.map((w) => {
        const def = WEAPONS[w.id];
        return `<li>${def.glyph} ${kebab(def.name)} ×${w.ammo}<span class="wsrc">⎿ ${escapeHtml(w.sourceLine)}</span></li>`;
      }).join('');
      const tasks = l.tasks.map((t) => `<li>☐ ${escapeHtml(t.name)} <span class="dim">(${t.workUnits} work)</span></li>`).join('');
      col.innerHTML = `
        <h3>${escapeHtml(names[i])}</h3>
        <div class="stat-line">session: ${escapeHtml(s.sessionId)}${s.fromCard ? '' : ' <span class="dim">(generated)</span>'}</div>
        <div class="stat-line">stability ${l.stability}/100 · hardening ${(l.hardening * 100).toFixed(0)}% · context budget ${l.tokenBudget} (auto-compact @${(l.compactionThreshold * 100).toFixed(0)}%)</div>
        ${s.fromCard ? `<div class="stat-line dim">history: ${escapeHtml(s.topErrorCategory)} ×${s.topErrorCount}, ${s.compactionEvents} compactions, ${s.restarts} restarts, token peak ${s.tokenPeak}</div>` : ''}
        <h4>TASK QUEUE (finish these to win)</h4><ul>${tasks}</ul>
        <h4>GENERATED LOADOUT</h4><ul>${weapons}</ul>
      `;
      cols.appendChild(col);
    });
  }

  /** Add handicap notes to the briefing after buffs are computed (game exists). */
  addBriefingHandicaps(game: Game): void {
    game.players.forEach((p, i) => {
      if (!p.startBuff) return;
      const col = $('briefing-cols').children[i] as HTMLElement;
      const div = document.createElement('div');
      div.className = 'handicap-note';
      div.textContent = `⚑ HANDICAP: ${p.startBuff.why}`;
      col.appendChild(div);
    });
  }

  buildRecap(game: Game): void {
    const over = game.gameOver!;
    $('recap-headline').textContent = over.headline;
    const body = $('recap-body');
    const cols = game.players.map((p) => {
      const s = p.loadout.cardSummary;
      const doneTasks = p.queue.tasks.filter((t) => t.done);
      const forgotten = p.queue.tasks.filter((t) => !t.done);
      const cardBits = s.fromCard
        ? `<p class="dim">real session ${escapeHtml(s.sessionId)}: top error was ${escapeHtml(s.topErrorCategory)} ×${s.topErrorCount};
           ${s.compactionEvents} real compaction${s.compactionEvents === 1 ? '' : 's'} on record —
           in-game it compacted ${p.stats.compactions}×.
           ${s.tasksTotal > 0 ? `the real agent finished ${s.tasksCompleted}/${s.tasksTotal} of these tasks.` : ''}</p>`
        : '<p class="dim">randomly generated agent — load a SessionCard for a personalized recap.</p>';
      return `<div class="recap-col">
        <h3 style="color:${p.color}">${escapeHtml(p.name)}${game.gameOver!.winner === p.index ? ' — WINNER' : ''}</h3>
        <p>hp ${Math.max(0, Math.round(p.hp))}/${p.maxHp} · dealt ${p.stats.damageDealt} dmg · ${p.stats.shotsFired} shots · ${p.stats.workActions} work actions</p>
        <p>tasks finished: ${doneTasks.length ? doneTasks.map((t) => escapeHtml(t.name)).join(', ') : 'none'}</p>
        <p>tasks ${over.winner === p.index && over.reason === 'tasks' ? 'cleared' : 'left behind'}: ${forgotten.length ? forgotten.map((t) => escapeHtml(t.name)).join(', ') : 'none'}</p>
        <p>compactions suffered: ${p.stats.compactions}${p.stats.compactions > 1 ? ' (memory was… negotiable)' : ''}</p>
        ${p.updatesInstalled.length ? `<p>updates installed: ${p.updatesInstalled.map((u) => escapeHtml(u.version)).join(', ')}</p>` : ''}
        ${cardBits}
      </div>`;
    }).join('');
    body.innerHTML = `<p class="recap-summary">${game.round} rounds · wind never once helped anybody</p><div class="recap-cols">${cols}</div>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
