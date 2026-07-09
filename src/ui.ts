// Rendering + HUD. Canvas draws the arena (terrain, tanks, projectiles,
// particles, lasers); the DOM shows player panels, weapon bar, banners, log.

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

export class UI {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camX = 0; private camY = 0; private camZoom = 1;
  private lastDirty = -1;
  private lastBannerCount = -1;
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
    grad.addColorStop(0, '#04070d');
    grad.addColorStop(0.7, '#071510');
    grad.addColorStop(1, '#060a08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    // faint memory-grid in the sky
    ctx.strokeStyle = 'rgba(84,255,159,0.05)';
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
      ctx.strokeStyle = 'rgba(255,176,46,0.35)';
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
        ctx.fillStyle = blink ? '#ff2e63' : '#ffb02e';
        ctx.beginPath(); ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb02e';
        ctx.font = '9px monospace';
        ctx.fillText('waiting…', proj.x + 7, proj.y - 4);
      } else {
        ctx.fillStyle = '#fff3d6';
        ctx.beginPath(); ctx.arc(proj.x, proj.y, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,176,46,0.8)';
        ctx.beginPath(); ctx.arc(proj.x, proj.y, 5.5, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // lasers
    for (const l of game.lasers) {
      ctx.strokeStyle = `rgba(255,46,99,${Math.min(1, l.ttl * 3)})`;
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
  }

  private drawTank(ctx: CanvasRenderingContext2D, p: Player, game: Game): void {
    const dead = p.hp <= 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    // shield bubble
    if (p.shield > 0) {
      ctx.strokeStyle = 'rgba(80,180,255,0.7)';
      ctx.fillStyle = 'rgba(80,180,255,0.10)';
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
    ctx.fillStyle = dead ? '#333' : '#12241a';
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
    // active-turn marker
    if (game.current.index === p.index && game.phase === 'aim' && !dead) {
      const bob = Math.sin(this.time * 4) * 2;
      ctx.fillStyle = p.color;
      ctx.font = '10px monospace';
      ctx.fillText('▼', -3, -30 + bob);
    }
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

    const cur = game.current;
    $('turn-hint').textContent = game.gameOver
      ? 'session terminated'
      : cur.isCpu
        ? `${cur.name} (CPU) is thinking…`
        : `${cur.name}: ←→ angle ${Math.round(cur.angle)}° · ↑↓ power ${Math.round(cur.power)} · SPACE fire · W work · A/D move (${cur.movesLeft})${cur.updateOffer > 0 ? ' · U INSTALL UPDATE ⬆' : ''}`;

    const feed = $('log-feed');
    feed.innerHTML = '';
    for (const line of game.log.slice(-5)) {
      const div = document.createElement('div');
      div.textContent = line;
      feed.appendChild(div);
    }
    if (feed.lastElementChild) feed.lastElementChild.classList.add('fresh');
  }

  private renderPanel(game: Game, p: Player): void {
    const panel = $(`panel-${p.index}`);
    panel.className = `player-panel p${p.index}` + (game.current.index === p.index && !game.gameOver ? ' active' : '');
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    const ctxF = contextFrac(p.ctx);
    const overThresh = ctxF >= p.ctx.threshold;
    const taskRows = p.queue.tasks.map((t, i) => {
      const cls = ['task-row'];
      if (t.done) cls.push('done');
      else if (i === p.queue.current) cls.push('current');
      if (t.forgotten && !t.done) cls.push('forgotten');
      const blocks = '▰'.repeat(t.progress) + '▱'.repeat(Math.max(0, t.workUnits - t.progress));
      const name = t.forgotten && !t.done ? garble(t.name, this.garbleRng, 0.35) : t.name;
      const marker = t.done ? '✔' : (i === p.queue.current ? '▶' : '·');
      return `<div class="${cls.join(' ')}"><span>${marker}</span><span class="task-blocks">${blocks}</span><span>${escapeHtml(name)}</span></div>`;
    }).join('');
    panel.innerHTML = `
      <div class="pp-name" style="color:${p.color}">${escapeHtml(p.name)}
        ${p.isCpu ? '<span class="badge">CPU</span>' : ''}
        <span class="badge">stability ${p.stability}</span>
        ${p.shield > 0 ? `<span class="badge" style="color:#50b4ff">🛡 ${p.shield}</span>` : ''}
        ${p.headsDown ? '<span class="badge" style="color:var(--red)">⌨ heads-down</span>' : ''}
        ${p.updateOffer > 0 ? '<span class="badge" style="color:var(--amber)">⬆ update!</span>' : ''}
      </div>
      <div class="bar"><div class="fill" style="width:${hpFrac * 100}%;background:${hpFrac > 0.35 ? p.color : 'var(--red)'}"></div></div>
      <div class="bar-label"><span>HP ${Math.max(0, Math.round(p.hp))}/${p.maxHp}</span><span>hardening ${(p.hardening * 100).toFixed(0)}%</span></div>
      <div class="bar">
        <div class="fill" style="width:${ctxF * 100}%;background:${overThresh ? 'var(--red)' : '#3a7dc9'}"></div>
        <div class="thresh" style="left:${p.ctx.threshold * 100}%"></div>
      </div>
      <div class="bar-label"><span>context ${p.ctx.used}/${p.ctx.budget}</span><span>${p.ctx.compactions}⚡ compactions</span></div>
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
      div.innerHTML = `
        <span class="wname">${i + 1} ${slot.def.glyph} ${escapeHtml(slot.def.name)}</span>
        <span class="wmeta">×${slot.ammo} · ${slot.def.tokenCost}tk${cd}</span>
        <div class="tooltip">${escapeHtml(slot.def.flavor)}<span class="tsrc">from log: ${escapeHtml(slot.sourceLine)}</span></div>
      `;
      div.addEventListener('click', () => game.selectWeapon(i));
      bar.appendChild(div);
    });
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
        return `<li>${def.glyph} ${escapeHtml(def.name)} ×${w.ammo}<span class="wsrc">↳ ${escapeHtml(w.sourceLine)}</span></li>`;
      }).join('');
      const tasks = l.tasks.map((t) => `<li>▱ ${escapeHtml(t.name)} (${t.workUnits} work)</li>`).join('');
      col.innerHTML = `
        <h3>${escapeHtml(names[i])}</h3>
        <div class="stat-line">session: ${escapeHtml(s.sessionId)}${s.fromCard ? '' : ' <span class="dim">(generated)</span>'}</div>
        <div class="stat-line">stability ${l.stability}/100 · hardening ${(l.hardening * 100).toFixed(0)}% · context budget ${l.tokenBudget} (compaction at ${(l.compactionThreshold * 100).toFixed(0)}%)</div>
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
