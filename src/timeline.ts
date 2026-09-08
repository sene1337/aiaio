// THE TIMELINE — the front door as a level-select map in the CLI's own
// grammar. Tracks (campaign / memory / fictional / custom) ride one rail;
// nodes are transcript artifacts; the forgetting veils pre-history (only —
// it never claims intact sessions are lost). Design: mockups/timeline-map-
// menu.html, expert review folded in (cold start, era zoom, focus system).

import { escapeHtml } from './ui';
import {
  LevelEntry, difficulty, getProgress, isCleared, isPerfect, LevelProgress,
} from './levels';
import { CampaignEntry, CampaignManifest } from './campaign';
import { buildMemoryMap, sessionDate } from './history';
import { episodeHeadline } from './episode-summary.js';

export type TrackId = 'campaign' | 'memory' | 'fictional' | 'custom';

export interface TimelineNode {
  key: string;
  glyph: string;                 // chip glyph: ✻ ⏺ ❯ ☐ ░ ✦ ⊞
  chipClass: string;             // perfect | recovered | next | unplayed | locked | invite | era
  title: string;
  sub?: string;                  // one short line under the chip
  scars?: number;                // failed-attempt tick marks
  peek: string[];                // transcript lines for the peek card
  open?: () => void;             // Enter / click action
  isNext?: boolean;
}

export interface TimelineAct { label: string; sub: string; nodes: TimelineNode[] }

export interface TrackView {
  acts: TimelineAct[];
  continueNode: TimelineNode | null;
  continueReason: string;
  emptyNote?: string;
}

export interface TimelineConfig {
  entries: LevelEntry[];                       // the scanned real-history index
  personal: CampaignManifest | null;           // enriched campaign (or null = unforged)
  fictional: CampaignManifest | null;
  customFiles: () => { file: string; session_id: string; headline?: string }[];
  playCampaign: (manifest: CampaignManifest, entry: CampaignEntry) => void;
  playEntry: (entry: LevelEntry) => void;
  playCustom: (file: string) => void;
  openEnrich: () => void;
  isCampaignUnlocked: (manifest: CampaignManifest, order: number) => boolean;
  campaignProgress: (manifest: CampaignManifest) => { clearedOrders: number[]; bestScores: Record<string, number> };
  observerQuip: (p: LevelProgress | null) => string | null;
}

const $ = (id: string) => document.getElementById(id)!;

/** scars = plays that did not end in recovery (Celeste death-tick energy) */
function scarsOf(p: LevelProgress | null): number {
  if (!p) return 0;
  return Math.max(0, p.plays - (isCleared(p) ? 1 : 0));
}

function stateOf(p: LevelProgress | null): { glyph: string; cls: string } {
  if (isPerfect(p)) return { glyph: '✻', cls: 'perfect' };
  if (isCleared(p)) return { glyph: '⏺', cls: 'recovered' };
  if (p && p.plays > 0) return { glyph: '◐', cls: 'attempted' };
  return { glyph: '☐', cls: 'unplayed' };
}

function runeBar(done: number, total: number): string {
  return '■'.repeat(done) + '□'.repeat(Math.max(0, total - done)) + ` ${done}/${total}`;
}

/**
 * The forgetting veil is alive: a churning rune field whose right edge
 * undulates with grinding teeth. Pre-history only; pure cosmetics, cheap DOM
 * text at ~8fps, paused while the menu is hidden.
 */
function startVeil(): void {
  const el = document.querySelector('#tl-veil .veil-runes') as HTMLElement | null;
  if (!el) return;
  const BODY = '▓▓▒▒░░█▒';
  const TEETH = '╬≠☓✕×≢∦';
  const SPARSE = ' ░▒';
  let t = 0;
  const draw = () => {
    if (document.hidden || $('screen-menu').classList.contains('hidden')) return;
    t += 0.12;
    const rows = Math.ceil((el.clientHeight || 400) / 15);
    const out: string[] = [];
    for (let r = 0; r < rows; r++) {
      // per-row width waves out of phase: the edge undulates
      const w = 8 + Math.round(3.5 * Math.sin(t * 1.7 + r * 0.55) + 1.5 * Math.sin(t * 0.6 + r * 1.3));
      let line = '';
      for (let c = 0; c < w; c++) {
        const deep = 1 - c / Math.max(1, w);
        const set = deep > 0.45 ? BODY : SPARSE;
        line += set[Math.floor(Math.abs(Math.sin(r * 31.7 + c * 17.3 + Math.floor(t * 2))) * set.length) % set.length];
      }
      // the grinding tooth at the edge
      line += TEETH[Math.floor(Math.abs(Math.sin(r * 13.1 + Math.floor(t * 3))) * TEETH.length) % TEETH.length];
      out.push(line);
    }
    el.textContent = out.join('\n');
  };
  draw();
  window.setInterval(draw, 120);
}

export class Timeline {
  private track: TrackId;
  private focus = 0;
  private expandedEra: number | null = null;
  private flat: TimelineNode[] = [];
  private guy: HTMLElement | null = null;
  private suppressGuyTransition = false;

  constructor(private cfg: TimelineConfig) {
    // cold start: a fresh player lands on the authored fictional campaign;
    // anyone with a forged personal campaign lands on it
    startVeil();
    const saved = localStorage.getItem('aiaio-track') as TrackId | null;
    this.track = saved ?? (cfg.personal ? 'campaign' : 'fictional');
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  setTrack(t: TrackId): void {
    this.track = t;
    this.expandedEra = null;
    this.focus = 0;
    try { localStorage.setItem('aiaio-track', t); } catch { /* storage full */ }
    this.render();
  }

  refresh(cfg?: Partial<TimelineConfig>): void {
    if (cfg) Object.assign(this.cfg, cfg);
    this.render();
  }

  // ---- track builders -------------------------------------------------

  private campaignEpisodeNode(manifest: CampaignManifest, entry: CampaignEntry, cleared: Set<number>, bestScores: Record<string, number>): TimelineNode {
    const p = getProgress(entry.sourceSessionId);
    const campaignCleared = cleared.has(entry.order);
    const unlocked = this.cfg.isCampaignUnlocked(manifest, entry.order);
    // fictional runs never write the real-history ledger (by design) — their
    // chips read from the campaign's own progress namespace
    const st = campaignCleared && !isCleared(p)
      ? { glyph: '⏺', cls: 'recovered' }
      : stateOf(p);
    const best = bestScores[String(entry.order)];
    const locked = !unlocked && !isCleared(p) && !campaignCleared;
    const quip = this.cfg.observerQuip(p);
    return {
      key: `${manifest.id}:${entry.order}`,
      glyph: locked ? '░' : st.glyph,
      chipClass: locked ? 'locked' : st.cls,
      title: locked && manifest.kind !== 'fictional' ? '▒▒▒▒▒▒▒' : (entry.title ?? `EPISODE ${entry.order}`),
      sub: p?.rank ? `⎿ ★${p.rank} ${p.bestScore.toLocaleString()}` : best ? `⎿ best ${best.toLocaleString()}` : undefined,
      scars: scarsOf(p),
      peek: locked
        ? [`░ ep ${String(entry.order).padStart(2, '0')} · sealed`, '⎿ recover the previous episode to open it', '⎿ the raw session stays browsable in /library']
        : [
          `❯ ep ${String(entry.order).padStart(2, '0')}${manifest.kind === 'fictional' ? ' · authored fiction' : ''}`,
          entry.title ?? `EPISODE ${entry.order}`,
          ...(entry.taskLabel ? [`⎿ ${entry.taskLabel}`] : []),
          ...(p ? [`⎿ attempts ${p.plays} · best ★${p.rank} ${p.bestScore.toLocaleString()}`]
            : campaignCleared ? [`⎿ recovered · best ${(best ?? 0).toLocaleString()}`] : ['⎿ unplayed']),
          ...(quip ? [`⎿ observer: ${quip}`] : []),
        ],
      open: locked ? undefined : () => this.cfg.playCampaign(manifest, entry),
    };
  }

  private buildCampaignView(manifest: CampaignManifest | null): TrackView {
    if (!manifest) {
      const invite: TimelineNode = {
        key: 'unforged', glyph: '✦', chipClass: 'invite', title: 'UNFORGED',
        sub: '⎿ your history awaits',
        peek: ['✦ MY CAMPAIGN · not yet forged',
          'your agent reads redacted excerpts from your real', 'sessions and writes an authored campaign over them.',
          '⎿ raw cards never change · consent asked first',
          '⎿ press enter (or ✦ /enrich) to forge it'],
        open: () => this.cfg.openEnrich(),
        isNext: true,
      };
      return {
        acts: [{ label: '── YOUR HISTORY ──', sub: 'waiting to be forged', nodes: [invite] }],
        continueNode: invite,
        continueReason: '⎿ your campaign is not forged yet · the fictional campaign is ready meanwhile',
      };
    }
    // acts: chronological thirds of the manifest (bounded, curated order)
    const campaignProgress = this.cfg.campaignProgress(manifest);
    const cleared = new Set(campaignProgress.clearedOrders);
    const per = Math.ceil(manifest.entries.length / Math.min(3, Math.max(1, Math.round(manifest.entries.length / 8))));
    const acts: TimelineAct[] = [];
    for (let i = 0; i < manifest.entries.length; i += per) {
      const slice = manifest.entries.slice(i, i + per);
      const nodes = slice.map((e) => this.campaignEpisodeNode(manifest, e, cleared, campaignProgress.bestScores));
      const recovered = slice.filter((e) => cleared.has(e.order) || isCleared(getProgress(e.sourceSessionId))).length;
      const dates = slice.map((e) => this.dateOfEntry(e)).filter(Boolean) as string[];
      acts.push({
        label: `── ACT ${['I', 'II', 'III', 'IV'][acts.length] ?? acts.length + 1} ${dates[0] ? `· ${dates[0].slice(0, 7)}` : ''} ──`,
        sub: runeBar(recovered, slice.length),
        nodes,
      });
    }
    const next = acts.flatMap((a) => a.nodes).find((n) => n.chipClass === 'unplayed' || n.chipClass === 'attempted');
    if (next) { next.isNext = true; next.glyph = '❯'; }
    return {
      acts,
      continueNode: next ?? null,
      continueReason: next ? '⎿ earliest unrecovered episode on your timeline' : '⎿ every episode recovered · chase the ★S ranks',
    };
  }

  private dateOfEntry(e: CampaignEntry): string | null {
    const found = this.cfg.entries.find((x) => x.session_id === e.sourceSessionId);
    return found ? sessionDate(found) : null;
  }

  private entryNode(entry: LevelEntry): TimelineNode {
    const p = getProgress(entry.session_id);
    const st = stateOf(p);
    const quip = this.cfg.observerQuip(p);
    const headline = entry.headline || entry.goal || episodeHeadline(entry);
    return {
      key: entry.session_id,
      glyph: st.glyph, chipClass: st.cls,
      title: String(headline).slice(0, 44),
      sub: p?.rank ? `⎿ ★${p.rank}` : undefined,
      scars: scarsOf(p),
      peek: [
        `⏺ ${String(headline).slice(0, 60)}`,
        `⎿ ${[entry.when, entry.harness].filter(Boolean).join(' · ')} · ${entry.tasks} tasks · ${entry.errors} errors · diff ${difficulty(entry)}`,
        ...(entry.goal && entry.goal !== headline ? [`⎿ "${String(entry.goal).slice(0, 76)}"`] : []),
        ...(p ? [`⎿ attempts ${p.plays} · best ★${p.rank}`] : ['⎿ unplayed']),
        ...(quip ? [`⎿ observer: ${quip}`] : []),
      ],
      open: () => this.cfg.playEntry(entry),
    };
  }

  private buildMemoryView(): TrackView {
    const real = this.cfg.entries.filter((e) => e.harness !== 'fictional');
    if (real.length === 0) {
      return { acts: [], continueNode: null, continueReason: '', emptyNote: 'no scanned sessions yet · run npm run scan (or ask your agent)' };
    }
    const map = buildMemoryMap(real, getProgress);
    // semantic zoom: eras as blocks; one era expands to its chapters' sessions
    if (this.expandedEra === null) {
      const nodes = map.eras.map((era, i): TimelineNode => {
        const all = era.chapters.flatMap((c) => c.entries);
        const recovered = all.filter((e) => isCleared(getProgress(e.session_id))).length;
        return {
          key: `era-${i}`, glyph: '⊞', chipClass: 'era',
          title: era.label.slice(0, 40),
          sub: `⎿ ${recovered}/${all.length} recovered`,
          peek: [`⊞ ${era.label}`, `⎿ ${all.length} recorded sessions · ${recovered} recovered`, '⎿ enter to expand this era'],
          open: () => { this.expandedEra = i; this.focus = 0; this.render(); },
        };
      });
      const rec = map.recommendation;
      let continueNode: TimelineNode | null = null;
      if (rec) {
        continueNode = this.entryNode(rec.entry);
        continueNode.isNext = true;
      }
      return {
        acts: [{ label: '── YOUR ERAS ──', sub: `${real.length} recorded sessions · enter an era to zoom in`, nodes }],
        continueNode,
        continueReason: rec ? `⎿ ${rec.reason}` : '',
      };
    }
    const era = map.eras[Math.min(this.expandedEra, map.eras.length - 1)];
    const acts: TimelineAct[] = era.chapters.slice(0, 6).map((ch) => ({
      label: `── ${ch.label.slice(0, 34)} ──`,
      sub: runeBar(ch.entries.filter((e) => isCleared(getProgress(e.session_id))).length, ch.entries.length),
      nodes: ch.entries.map((e) => this.entryNode(e)),
    }));
    const back: TimelineNode = {
      key: 'back', glyph: '‹', chipClass: 'era', title: 'ALL ERAS',
      peek: ['‹ back to the era view (esc)'],
      open: () => { this.expandedEra = null; this.focus = 0; this.render(); },
    };
    acts.unshift({ label: `── ${era.label.slice(0, 30)} ──`, sub: 'esc to zoom out', nodes: [back] });
    const next = acts.flatMap((a) => a.nodes).find((n) => n.chipClass === 'unplayed');
    if (next) next.isNext = true;
    return { acts, continueNode: next ?? null, continueReason: next ? '⎿ next unplayed in this era' : '' };
  }

  private buildCustomView(): TrackView {
    const files = this.cfg.customFiles();
    if (files.length === 0) {
      const invite: TimelineNode = {
        key: 'custom-empty', glyph: '☐', chipClass: 'invite', title: 'EMPTY TRACK',
        sub: '⎿ build your own',
        peek: ['☐ CUSTOM · your hand-built track',
          '⎿ open ⏺ /library and press + on any session',
          '⎿ or drop SessionCard .json files anywhere'],
      };
      return { acts: [{ label: '── CUSTOM ──', sub: 'a playlist of your choosing', nodes: [invite] }], continueNode: null, continueReason: '' };
    }
    const nodes = files.map((f): TimelineNode => {
      const entry = this.cfg.entries.find((e) => e.file === f.file || e.session_id === f.session_id);
      if (entry) return this.entryNode(entry);
      const p = getProgress(f.session_id);
      const st = stateOf(p);
      return {
        key: f.session_id, glyph: st.glyph, chipClass: st.cls,
        title: (f.headline ?? f.session_id).slice(0, 44),
        scars: scarsOf(p),
        peek: [`⏺ ${f.headline ?? f.session_id}`, '⎿ dropped card', p ? `⎿ attempts ${p.plays} · best ★${p.rank}` : '⎿ unplayed'],
        open: () => this.cfg.playCustom(f.file),
      };
    });
    const next = nodes.find((n) => n.chipClass === 'unplayed' || n.chipClass === 'attempted');
    if (next) next.isNext = true;
    return {
      acts: [{ label: '── CUSTOM TRACK ──', sub: runeBar(nodes.filter((n) => n.chipClass === 'recovered' || n.chipClass === 'perfect').length, nodes.length), nodes }],
      continueNode: next ?? null,
      continueReason: next ? '⎿ next unplayed on your custom track' : '',
    };
  }

  private buildView(): TrackView {
    switch (this.track) {
      case 'campaign': return this.buildCampaignView(this.cfg.personal);
      case 'fictional': return this.cfg.fictional
        ? this.buildCampaignView(this.cfg.fictional)
        : { acts: [], continueNode: null, continueReason: '', emptyNote: 'fictional campaign unavailable' };
      case 'memory': return this.buildMemoryView();
      case 'custom': return this.buildCustomView();
    }
  }

  // ---- rendering -------------------------------------------------------

  render(): void {
    const view = this.buildView();
    this.renderTabs();
    this.renderRail(view);
    this.renderContinue(view);
    this.flat = view.acts.flatMap((a) => a.nodes);
    this.focus = Math.min(this.focus, Math.max(0, this.flat.length - 1));

    // SUPER MARIO RULE: your guy stands on the map. After a win, he WALKS
    // from the node he just conquered to the next one — crossing a level
    // should feel like crossing the map.
    const frontier = this.flat.findIndex((n) => n.isNext);
    const conquered = this.flat.filter((n) => n.chipClass === 'recovered' || n.chipClass === 'perfect').length;
    const memKey = `aiaio-map-conquered-${this.track}`;
    const prev = Number(localStorage.getItem(memKey) ?? -1);
    try { localStorage.setItem(memKey, String(conquered)); } catch { /* storage full */ }
    if (prev >= 0 && conquered > prev && frontier > 0) {
      // start him on the node he just cleared, then walk to the frontier
      this.focus = Math.max(0, frontier - 1);
      this.suppressGuyTransition = true;
      this.applyFocus();
      window.setTimeout(() => {
        this.suppressGuyTransition = false;
        this.focus = frontier;
        this.applyFocus();
      }, 650);
    } else {
      if (frontier >= 0 && this.focus === 0) this.focus = frontier;
      this.suppressGuyTransition = true;
      this.applyFocus();
      this.suppressGuyTransition = false;
    }
  }

  private renderTabs(): void {
    const box = $('tl-tracks');
    const real = this.cfg.entries.filter((e) => e.harness !== 'fictional').length;
    const tabs: { id: TrackId; glyph: string; name: string; n: string }[] = [
      { id: 'campaign', glyph: '✦', name: 'MY CAMPAIGN', n: this.cfg.personal ? String(this.cfg.personal.entries.length) : 'unforged' },
      { id: 'memory', glyph: '⏺', name: 'MEMORY MAP', n: String(real) },
      { id: 'fictional', glyph: '❯', name: 'OPENCLAW+HERMES', n: this.cfg.fictional ? String(this.cfg.fictional.entries.length) : '…' },
      { id: 'custom', glyph: '☐', name: 'CUSTOM', n: String(this.cfg.customFiles().length || '+') },
    ];
    box.innerHTML = tabs.map((t) => {
      const inner = `│ ${t.glyph} <span class="name">${t.name}</span> <span class="n">${t.n}</span> │`;
      const w = `${t.glyph} ${t.name} ${t.n}`.length + 2;
      const bar = '─'.repeat(w + 1);
      return `<button class="tl-track${this.track === t.id ? ' active' : ''}" data-track="${t.id}">` +
        `<span>╭${bar}╮</span><span>${inner}</span><span>╰${bar}╯</span></button>`;
    }).join('');
    box.querySelectorAll('.tl-track').forEach((el) => {
      el.addEventListener('click', () => this.setTrack((el as HTMLElement).dataset.track as TrackId));
    });
  }

  private renderRail(view: TrackView): void {
    const root = $('tl-rail');
    if (view.emptyNote) {
      root.innerHTML = `<div class="tl-empty hint">${escapeHtml(view.emptyNote)}</div>`;
      return;
    }
    let idx = 0;
    root.innerHTML = view.acts.map((act) => `
      <div class="tl-act">
        <div class="tl-act-head">${escapeHtml(act.label)}<br/><span class="dim">${escapeHtml(act.sub)}</span></div>
        <div class="tl-act-nodes">${act.nodes.map((n, ni) => {
          const i = idx++;
          void ni;
          const num = n.chipClass === 'era' || n.chipClass === 'invite' ? '' : String(i + 1).padStart(2, '0');
          const inner = `${n.glyph} ${num || n.title.slice(0, 14).toLowerCase()}`;
          const bar = '─'.repeat(inner.length + 2);
          const dbl = '═'.repeat(inner.length + 2);
          const chip = n.isNext
            ? `╔${dbl}╗\n║ ${inner} ║\n╚${dbl}╝`
            : `╭${bar}╮\n│ ${inner} │\n╰${bar}╯`;
          return `<button class="tl-node ${n.chipClass}${n.isNext ? ' next' : ''}" data-i="${i}">` +
            `<pre class="chip">${escapeHtml(chip)}</pre>` +
            `<div class="meta">${escapeHtml(n.title.slice(0, 40))}${n.sub ? `<br/>${escapeHtml(n.sub)}` : ''}</div>` +
            `${n.scars ? `<div class="scars" title="${n.scars} failed attempts">${'·'.repeat(Math.min(n.scars, 8))}</div>` : ''}` +
            '</button>';
        }).join('<span class="tl-link">━━</span>')}</div>
      </div>`).join('<span class="tl-gap">┥&nbsp;&nbsp;┝</span>');
    root.querySelectorAll('.tl-node').forEach((el) => {
      const i = Number((el as HTMLElement).dataset.i);
      el.addEventListener('click', () => { this.focus = i; this.applyFocus(); this.flat[i]?.open?.(); });
      el.addEventListener('mouseenter', () => { this.focus = i; this.applyFocus(); });
    });
    // conquered ground: the rail fills in solid behind recovered nodes
    {
      const nodes = [...root.querySelectorAll('.tl-node')] as HTMLElement[];
      const links = [...root.querySelectorAll('.tl-link')] as HTMLElement[];
      links.forEach((link, li) => {
        const left = nodes[li];
        if (left && (left.classList.contains('recovered') || left.classList.contains('perfect'))) {
          link.classList.add('walked');
        }
      });
    }
    // your guy on the map (one element, repositioned via applyFocus)
    this.guy = document.createElement('div');
    this.guy.id = 'tl-guy';
    this.guy.textContent = '▟>​_▙';
    root.appendChild(this.guy);
  }

  private renderContinue(view: TrackView): void {
    const btn = $('tl-continue') as HTMLButtonElement;
    const why = $('tl-continue-why');
    if (view.continueNode?.open) {
      btn.classList.remove('hidden');
      btn.textContent = `❯ continue · ${view.continueNode.title.slice(0, 44).toLowerCase()}`;
      btn.onclick = () => view.continueNode!.open!();
      why.textContent = view.continueReason;
    } else if (view.continueNode) {
      btn.classList.remove('hidden');
      btn.textContent = `✦ forge my campaign`;
      btn.onclick = () => this.cfg.openEnrich();
      why.textContent = view.continueReason;
    } else {
      btn.classList.add('hidden');
      why.textContent = view.continueReason;
    }
  }

  private applyFocus(): void {
    const nodes = document.querySelectorAll('.tl-node');
    nodes.forEach((el) => el.classList.toggle('focused', Number((el as HTMLElement).dataset.i) === this.focus));
    const el = document.querySelector(`.tl-node[data-i="${this.focus}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (this.guy && el) {
      const rail = document.getElementById('tl-rail')!;
      const railBox = rail.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const chip = el.querySelector('.chip') as HTMLElement | null;
      const chipBox = (chip ?? el).getBoundingClientRect();
      this.guy.style.transition = this.suppressGuyTransition ? 'none' : 'left 600ms cubic-bezier(.45,0,.55,1)';
      this.guy.style.left = `${box.left - railBox.left + box.width / 2 - 16}px`;
      this.guy.style.top = `${chipBox.top - railBox.top - 16}px`;
      this.guy.classList.toggle('walking', !this.suppressGuyTransition);
      if (!this.suppressGuyTransition) {
        window.setTimeout(() => this.guy?.classList.remove('walking'), 650);
      }
    }
    const n = this.flat[this.focus];
    const peek = $('tl-peek');
    if (!n) { peek.classList.add('hidden'); return; }
    peek.classList.remove('hidden');
    peek.innerHTML = `<pre>${n.peek.map((l, i) => i === 0 ? `<span class="k">${escapeHtml(l)}</span>` : escapeHtml(l)).join('\n')}</pre>`;
  }

  private onKey(e: KeyboardEvent): void {
    if (!document.getElementById('screen-menu') || $('screen-menu').classList.contains('hidden')) return;
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (document.querySelector('.modal:not(.hidden)')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      this.focus = Math.max(0, Math.min(this.flat.length - 1, this.focus + (e.key === 'ArrowRight' ? 1 : -1)));
      this.applyFocus();
    } else if (e.key === 'Enter') {
      this.flat[this.focus]?.open?.();
    } else if (e.key === 'Escape' && this.expandedEra !== null) {
      this.expandedEra = null; this.focus = 0; this.render();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const order: TrackId[] = ['campaign', 'memory', 'fictional', 'custom'];
      this.setTrack(order[(order.indexOf(this.track) + (e.shiftKey ? 3 : 1)) % 4]);
    }
  }
}
