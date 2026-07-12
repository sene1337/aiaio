// Bootstrap for SESSION RUN: menu (card drop + scanned-session gallery),
// briefing, the run loop, keyboard input, recap.

import { Run, RunInput } from './run';
import { UI, escapeHtml } from './ui';
import {
  SessionCard, parseSessionCard, loadoutFromCard, randomCard,
  EXAMPLE_CLEAN, EXAMPLE_CHAOTIC, SESSION_CARD_SCHEMA, SessionMode,
} from './session';
import { qa } from './telemetry';
import { audio } from './audio';
import { music } from './music';
import { observer } from './observer';
import { startLogoLoop } from './logo';
import {
  LevelEntry, difficulty, tierOf, TIERS, unlockedTiers, getProgress, isCleared,
  isPerfect, isSurvived, campaignOutcome, computeRank, recordResult, RANK_COLORS, CampaignOutcome,
} from './levels';
import { doneUnits, progressFrac, totalUnits } from './tasks';

type ScreenId = 'menu' | 'briefing' | 'match' | 'recap';

const $ = (id: string) => document.getElementById(id)!;

let run: Run | null = null;
let ui: UI;
let loadedCard: SessionCard | null = null;
let runCounter = 0;
let recapShown = false;
let progressRecorded = false;
type RankInfo = {
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  newBest: boolean;
  rankUp: boolean;
  prevBest: number | null;
  outcome: CampaignOutcome;
  campaignRecorded: boolean;
};
let lastRankInfo: RankInfo | null = null;
/** re-render THE VAULT (set by loadGallery) — call when returning to the menu */
let refreshVault: (() => void) | null = null;
type QAAutoplayController = import('../qa/autoplay').AutoplayController;
let qaAutoplay: QAAutoplayController | null = null;
let qaAutoplayCard: SessionCard | null = null;
let qaAutoplayMode: SessionMode = 'demo';

function showScreen(id: ScreenId): void {
  for (const s of ['menu', 'briefing', 'match', 'recap']) {
    $(`screen-${s}`).classList.toggle('hidden', s !== id);
  }
}

// ---------------------------------------------------------------------------
// card loading: drag-drop, file picker, and the scanned-session gallery
// ---------------------------------------------------------------------------

function setCard(card: SessionCard, sourceName: string): void {
  loadedCard = card;
  const status = $('card-status-0');
  status.classList.add('loaded');
  const errs = (card.errors ?? []).reduce((s, e) => s + (e.count ?? 1), 0);
  status.textContent = `✔ ${sourceName}: "${card.session_id ?? '?'}", ${errs} errors, ` +
    `${card.tasks?.length ?? 0} tasks, stability ${card.stability_score ?? 'n/a'}`;
}

function wireCardSlot(): void {
  const drop = $('drop-0');
  const fileInput = $('file-0') as HTMLInputElement;
  const readFile = (file: File) => {
    file.text()
      .then((text) => setCard(parseSessionCard(text), file.name))
      .catch((err) => {
        const status = $('card-status-0');
        status.classList.remove('loaded');
        status.textContent = `✕ could not read card: ${err instanceof Error ? err.message : String(err)}`;
      });
  };
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  });
  drop.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== 'pick-0') fileInput.click();
  });
  $('pick-0').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) readFile(file);
    fileInput.value = '';
  });
}

/**
 * Persona pack: authored Observer commentary at public/packs/observer.json,
 * usually written by the player's own agent (see AGENTS.md). Optional; a 404
 * means the built-in personality flies solo.
 */
async function loadPersonaPack(): Promise<void> {
  try {
    const res = await fetch('./packs/observer.json');
    if (!res.ok) return;
    if (observer.loadPack(await res.json())) {
      console.info(`[aiaio] observer persona pack loaded: ${observer.packName}`);
    }
  } catch { /* no pack, no problem */ }
}

/** Gallery of cards produced by `npm run scan` (public/cards/index.json). */
async function loadGallery(): Promise<void> {
  const box = $('gallery');
  try {
    const res = await fetch('./cards/index.json');
    if (!res.ok) throw new Error('none');
    const index: Array<{ file: string; session_id: string; errors: number; enemies?: number; tasks: number; stability: number | null }> = await res.json();
    if (!Array.isArray(index) || index.length === 0) throw new Error('empty');
    const entries = index as LevelEntry[];
    const PER_FOLDER = 24;
    // folders open state: default-open the lowest unlocked tier with unfinished levels
    const openTiers = new Set<number>();

    const render = (filter: string) => {
      box.innerHTML = '';
      const q = filter.trim().toLowerCase();
      const unlocked = unlockedTiers(entries);

      // bucket levels into tiers
      const buckets: LevelEntry[][] = TIERS.map(() => []);
      for (const e of entries) {
        const enrichedKey = e.file.endsWith('.enriched.json') ? 'enriched curated' : '';
        if (q && !`${e.session_id} ${e.harness ?? ''} ${e.when ?? ''} ${enrichedKey}`.toLowerCase().includes(q)) continue;
        buckets[tierOf(difficulty(e)).index].push(e);
      }
      // trophy shelf on top: cleared levels first (you should SEE what's done),
      // then the frontier, easiest first
      buckets.forEach((b) => b.sort((a, x) => {
        const ca = isCleared(getProgress(a.session_id)) ? 0 : 1;
        const cx = isCleared(getProgress(x.session_id)) ? 0 : 1;
        // nostalgia bias: among equal difficulty, the OLDEST sessions lead
        return ca - cx || difficulty(a) - difficulty(x) || (a.mtime ?? 0) - (x.mtime ?? 0);
      }));

      const recoveredTotal = entries.filter((e) => isCleared(getProgress(e.session_id))).length;
      const head = document.createElement('div');
      head.className = 'hint';
      head.style.textAlign = 'left';
      head.textContent = `THE VAULT · ${entries.length} sessions · ${recoveredTotal} recovered (type to filter):`;
      box.appendChild(head);
      const input = document.createElement('input');
      input.id = 'gallery-filter';
      input.setAttribute('aria-label', 'Filter sessions by name, harness, or date');
      input.placeholder = 'filter by name, harness (openclaw/hermes/claude), date, or "enriched"…';
      input.value = filter;
      input.addEventListener('input', () => render(input.value));
      box.appendChild(input);

      if (openTiers.size === 0) {
        // first render: open the frontier tier
        const frontier = TIERS.findIndex((_, i) =>
          unlocked[i] && buckets[i].some((e) => !isCleared(getProgress(e.session_id))));
        openTiers.add(frontier === -1 ? 0 : frontier);
      }

      for (const tier of TIERS) {
        const bucket = buckets[tier.index];
        if (bucket.length === 0 && !q) continue;
        const isOpen = openTiers.has(tier.index) || !!q;
        const recovered = bucket.filter((e) => isCleared(getProgress(e.session_id))).length;

        const folder = document.createElement('button');
        folder.className = 'cmd folder';
        if (!unlocked[tier.index]) {
          const need = 2 - entries.filter((e) =>
            tierOf(difficulty(e)).index === tier.index - 1 && isCleared(getProgress(e.session_id))).length;
          folder.innerHTML = `<span class="caret">${isOpen ? '▾' : '▸'}</span><span class="cmd-name dim">🔒 ${escapeHtml(tier.name)}/</span>` +
            `<span class="cmd-desc">clear ${Math.max(1, need)} more in ${escapeHtml(TIERS[tier.index - 1].name.split(': ')[0])}</span>`;
          // locked folders can be browsed (window shopping), just not played
          folder.addEventListener('click', () => {
            if (openTiers.has(tier.index)) openTiers.delete(tier.index); else openTiers.add(tier.index);
            render(input.value);
          });
        } else {
          folder.innerHTML = `<span class="caret">${isOpen ? '▾' : '▸'}</span><span class="cmd-name">${escapeHtml(tier.name)}/</span>` +
            `<span class="cmd-desc">${bucket.length} levels · ${recovered} recovered</span>`;
          folder.addEventListener('click', () => {
            if (openTiers.has(tier.index)) openTiers.delete(tier.index); else openTiers.add(tier.index);
            render(input.value);
          });
        }
        box.appendChild(folder);
        if (!isOpen) continue;

        for (const entry of bucket.slice(0, PER_FOLDER)) {
          const p = getProgress(entry.session_id);
          const diff = difficulty(entry);
          const btn = document.createElement('button');
          btn.className = 'cmd level';
          const shortId = entry.session_id.length > 22 ? entry.session_id.slice(0, 20) + '…' : entry.session_id;
          const glyph = isPerfect(p) ? '✦' : isCleared(p) ? '☒' : isSurvived(p) ? '◉' : '☐';
          // agent-curated levels carry their story with them — show it
          const star = entry.file.endsWith('.enriched.json')
            ? '<span style="color:var(--purple)">✦ </span>' : '';
          const rankBit = p
            ? ` <span style="color:${RANK_COLORS[p.rank]}">★${p.rank}</span> <span class="dim">${p.bestScore.toLocaleString()}</span>`
            : '';
          const prov = [entry.when, entry.harness].filter(Boolean).join(' ');
          // session_id derives from filenames — escape it like every other sink (M-3)
          if (!unlocked[tier.index]) {
            btn.classList.add('locked');
            btn.innerHTML = `<span class="caret">&nbsp;</span><span class="cmd-name dim">${glyph} ${star}${escapeHtml(shortId)}</span>` +
              `<span class="cmd-desc">${prov ? escapeHtml(prov) + ' · ' : ''}diff ${diff} · 🔒</span>`;
            btn.disabled = true;
            box.appendChild(btn);
            continue;
          }
          btn.innerHTML = `<span class="caret">&nbsp;</span><span class="cmd-name">${glyph} ${star}${escapeHtml(shortId)}</span>` +
            `<span class="cmd-desc">${prov ? escapeHtml(prov) + ' · ' : ''}diff ${diff}${rankBit}</span>`;
          btn.addEventListener('click', async () => {
            try {
              const cardRes = await fetch(`./cards/${entry.file}`);
              setCard(parseSessionCard(await cardRes.text()), entry.file);
              // dev mode: quietly ask YOUR agent to enrich this level for next time
              if (import.meta.env.DEV) {
                fetch('/__enrich', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ file: entry.file }),
                }).catch(() => { /* enrichment is a bonus, never a blocker */ });
              }
            } catch {
              $('card-status-0').textContent = `✕ could not load ${entry.file}`;
            }
          });
          box.appendChild(btn);
        }
        if (bucket.length > PER_FOLDER) {
          const more = document.createElement('div');
          more.className = 'hint';
          more.style.textAlign = 'left';
          more.textContent = `  …${bucket.length - PER_FOLDER} more in this tier. filter to find them`;
          box.appendChild(more);
        }
      }
      const refocus = document.getElementById('gallery-filter') as HTMLInputElement;
      if (q) { refocus.focus(); refocus.setSelectionRange(filter.length, filter.length); }
    };
    refreshVault = () => render((document.getElementById('gallery-filter') as HTMLInputElement)?.value ?? '');
    render('');
  } catch {
    box.innerHTML = '<div class="hint" style="text-align:left">no scanned sessions. run <b>npm run scan</b> to auto-build cards from your OpenClaw / Claude Code / Hermes sessions, or drop a card above. vault still empty? <b>npm run doctor</b> explains why, or hand the whole thing to your agent (AGENTS.md is the playbook).</div>';
  }
}

// ---------------------------------------------------------------------------
// run setup
// ---------------------------------------------------------------------------

function prepareRun(card: SessionCard, mode: SessionMode): void {
  runCounter++;
  const name = card.session_id ? `agent:${String(card.session_id).slice(0, 14)}` : 'AGENT-01';
  const loadout = loadoutFromCard(card, name, { mode });
  // campaign context for the briefing: computed difficulty + any existing rank
  const entryLike: LevelEntry = {
    file: '', session_id: String(card.session_id ?? 'unknown'),
    errors: (card.errors ?? []).reduce((s, e) => s + (e.count ?? 1), 0),
    tasks: card.tasks?.length ?? 0, stability: card.stability_score ?? null,
    messages: card.message_count ?? 120,
    token_peak: card.token_peak ?? null, compactions: card.compaction_events ?? 0,
    work: (card.tasks ?? []).reduce((s, t) => s + (t.work_units ?? 2), 0),
  };
  const diff = difficulty(entryLike);
  const prevProgress = getProgress(entryLike.session_id);

  run = new Run({ loadout, card, name });
  (window as any).__aiaio = run; // debug/testing handle
  recapShown = false;
  progressRecorded = false;
  lastRankInfo = null;
  qa.startRun(String(card.session_id ?? 'unknown'), loadout.cardSummary.fromCard);
  observer.bindSink((line) => run?.pushLog(line));
  observer.onRunStart({
    goal: run.goal,
    sessionId: String(card.session_id ?? 'unknown'),
    topError: loadout.cardSummary.topErrorCategory,
    tasksTotal: loadout.tasks.length,
    stability: loadout.stability,
  });
  run.emit = (type, data = {}) => {
    qa.event(type, data);
    ui.fx(type, data);
    routeAudio(type, data);
    observer.onEvent(type, data);
    // grade + persist synchronously the moment the run ends — no frame loop,
    // no banner gates, no way to lose it by quitting fast
    if ((type === 'win' || type === 'death') && run && !progressRecorded) {
      progressRecorded = true;
      const isRealRun = mode === 'real';
      const outcome = campaignOutcome(
        type === 'win',
        isRealRun ? totalUnits(run.queue) : 0,
        isRealRun ? doneUnits(run.queue) : 0,
        isRealRun ? run.queue.tasks.filter((task) => task.done).length : 0,
      );
      const rank = computeRank(outcome, progressFrac(run.queue));
      const rec = isRealRun
        ? recordResult(run.loadout.cardSummary.sessionId, rank, Number(data.score) || 0, outcome)
        : { newBest: false, rankUp: false, prev: null };
      lastRankInfo = {
        rank, newBest: rec.newBest, rankUp: rec.rankUp, prevBest: rec.prev?.bestScore ?? null,
        outcome, campaignRecorded: isRealRun,
      };
      qa.event('rank', { rank, score: Number(data.score) || 0, newBest: rec.newBest, ...outcome });
    }
  };
  const prevStatus = !prevProgress ? null
    : isPerfect(prevProgress) ? `perfect recall · best ${prevProgress.bestScore.toLocaleString()}`
      : isCleared(prevProgress) ? `recovered · best ${prevProgress.bestScore.toLocaleString()}`
        : isSurvived(prevProgress) ? `survived · best ${prevProgress.bestScore.toLocaleString()}`
          : `attempted · best ${prevProgress.bestScore.toLocaleString()}`;
  ui.buildBriefing(loadout, card, name, {
    diff, tierName: tierOf(diff).name,
    prevRank: prevStatus,
    mode,
  });
  showScreen('briefing');

  // the memory-lane roast: compositional immediately, LLM version (your own
  // agent, dev-server only) swaps in when it arrives; whichever is current
  // gets spoken once
  const meta = {
    sessionId: String(card.session_id ?? 'unknown'),
    harness: card.harness ?? null,
    when: card.when ?? null,
    goal: card.goal ?? loadout.tasks[0]?.name ?? null,
    topError: loadout.cardSummary.topErrorCategory,
    topErrorCount: loadout.cardSummary.topErrorCount,
    compactions: loadout.cardSummary.compactionEvents,
    tasksTotal: Math.max(loadout.cardSummary.tasksTotal, loadout.tasks.length),
    tasksCompleted: loadout.cardSummary.tasksCompleted,
    stability: loadout.stability,
  };
  const composed = observer.briefingRoast(meta);
  ui.setBriefingRoast(composed, 'composed');
  const thisRun = run;
  let spoken = false;
  const speakIfCurrent = (lines: string[]) => {
    if (spoken || run !== thisRun || $('screen-briefing').classList.contains('hidden')) return;
    spoken = true;
    observer.speakRoast(lines);
  };
  if (import.meta.env.DEV) {
    fetch('/__quip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: meta.sessionId + ':briefing', data: meta }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('no quip'))))
      .then(({ lines }: { lines: string[] }) => {
        if (Array.isArray(lines) && lines.length > 0 && run === thisRun) {
          ui.setBriefingRoast(lines, 'llm');
          speakIfCurrent(lines);
        }
      })
      .catch(() => { /* compositional fallback speaks below */ });
    // bespoke in-game one-liner pack, written by your agent for THIS session
    fetch('/__quip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: meta.sessionId + ':pack', data: meta }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('no pack'))))
      .then(({ lines }: { lines: string[] }) => {
        if (Array.isArray(lines) && run === thisRun) observer.setSessionPack(lines);
      })
      .catch(() => observer.setSessionPack([]));
  } else {
    observer.setSessionPack([]);
  }
  window.setTimeout(() => speakIfCurrent(composed), 6000);
}

function routeAudio(type: string, data: Record<string, unknown>): void {
  const worldX = Number(data.x);
  const pan = run && Number.isFinite(worldX)
    ? Math.max(-0.9, Math.min(0.9, (worldX - run.avatar.x) / 420)) : 0;
  switch (type) {
    case 'fire': {
      const w = String(data.weapon ?? '');
      if (w === 'debug_zap') audio.zap(pan);
      else if (w === 'false_positive_laser') audio.laser(pan);
      else audio.fire(w === 'context_nuke' || w === 'timeout_mortar' || w === 'regression_cluster', pan);
      break;
    }
    case 'explosion': audio.explode(Number(data.radius) || 20, pan); break;
    case 'kill': data.by === 'sub' ? audio.subKill(pan) : audio.kill(data.direct === true, pan); break;
    case 'damage': audio.hurt(); break;
    case 'threat_warning': audio.threatWarning(String(data.kind ?? ''), pan); break;
    case 'compaction': audio.compaction(); break;
    case 'work_tick': audio.taskTick(); break;
    case 'task_done': audio.taskDone(); break;
    case 'task_eaten': audio.taskEaten(); break;
    case 'update_install': audio.update(data.netBuff === true); break;
    case 'model_upgrade': audio.win(false); break;
    case 'subagent_spawn': audio.pickup(); break;
    case 'subagent_corrupted': audio.taskEaten(); break;
    case 'subagent_eaten': audio.taskEaten(); break;
    case 'voluntary_compact': audio.update(true); break;
    case 'crate_choice': audio.select(); break;
    case 'pickup': audio.pickup(); break;
    case 'weapon_select': audio.select(); break;
    case 'death': audio.death(); break;
    case 'win': audio.win(data.perfect === true); break;
  }
}

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

const held = new Set<string>();

function currentInput(): RunInput {
  return {
    left: held.has('ArrowLeft') || held.has('a') || held.has('A'),
    right: held.has('ArrowRight') || held.has('d') || held.has('D'),
    work: held.has('w') || held.has('W'),
    down: held.has('ArrowDown'),
  };
}

async function startDevQA(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('qa');
  if (mode !== 'autoplay' && mode !== 'manual') return;
  try {
    const { loadAutoplay } = await import('../qa/autoplay');
    const loaded = await loadAutoplay(params);
    qaAutoplayCard = loaded.card;
    qaAutoplayMode = params.get('card') ? 'real' : 'demo';
    setCard(loaded.card, loaded.sourceName);
    prepareRun(loaded.card, qaAutoplayMode);
    if (mode === 'autoplay') {
      qaAutoplay = loaded.controller;
      qaAutoplay.reset();
      showScreen('match');
    }
  } catch (err) {
    console.error(`[aiaio] QA ${mode} failed:`, err);
  }
}

const FEATURE_KEYS: Record<string, string> = {
  ' ': 'fire', 'ArrowUp': 'jump', 'ArrowLeft': 'move', 'ArrowRight': 'move',
  'a': 'move', 'd': 'move', 'w': 'work', 'u': 'update', '[': 'weapon_cycle', ']': 'weapon_cycle',
};

function wireKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    // typing in an input (gallery filter) must never trigger game shortcuts
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    held.add(e.key);
    audio.ensure(); // first gesture unlocks the AudioContext
    music.ensure();
    if (e.key === 'm' || e.key === 'M') {
      const muted = audio.toggleMute();
      music.setMuted(muted);
      qa.event('mute_toggle', { muted });
      return;
    }
    if ((e.key === 'v' || e.key === 'V') && e.shiftKey) {
      const name = observer.cycleVoice();
      run?.pushLog(`☏ observer voice → ${name}`);
      qa.event('voice_cycle', { name });
      return;
    }
    if (e.key === 'v' || e.key === 'V') {
      const on = observer.toggleVoice();
      run?.pushLog(`☏ observer voice ${on ? 'on' : 'off. the judgment continues in text'}`);
      qa.event('voice_toggle', { on });
      return;
    }
    if (!run || run.over || $('screen-match').classList.contains('hidden')) return;
    const k = e.key;
    const feature = FEATURE_KEYS[k.toLowerCase()] ?? FEATURE_KEYS[k];
    if (feature) qa.firstUseOf(feature);
    if (/^[1-9]$/.test(k)) qa.firstUseOf('weapon_number');
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
    switch (k) {
      case ' ': run.fire(); break;
      case 'ArrowUp': run.jump(); break;
      case 'u': case 'U': run.installUpdate(); break;
      case 's': case 'S': run.spawnSubagent(); qa.firstUseOf('subagent'); break;
      case 'c': case 'C': run.voluntaryCompact(); qa.firstUseOf('voluntary_compact'); break;
      case '[': run.cycleWeapon(-1); break;
      case ']': run.cycleWeapon(1); break;
      default:
        if (/^[1-9]$/.test(k)) {
          // numbers drive the crate menu when one is open, weapons otherwise
          if (run.crateMenu) run.chooseCrateOption(parseInt(k, 10) - 1);
          else run.selectWeapon(parseInt(k, 10) - 1);
        }
    }
  });
  window.addEventListener('click', () => audio.ensure());
  window.addEventListener('keyup', (e) => held.delete(e.key));
  window.addEventListener('blur', () => held.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') held.clear(); // no stuck keys (L-2)
  });
}

// ---------------------------------------------------------------------------
// frame loop
// ---------------------------------------------------------------------------

let lastT = 0;
let snapshotAccum = 0;

let crashShown = false;

function frame(t: number): void {
  try {
    frameBody(t);
  } catch (err) {
    // one bad frame must never kill the game forever (H-1)
    console.error('[aiaio] frame error:', err);
    if (!crashShown && run) {
      crashShown = true;
      try {
        run.pushBanner({
          kind: 'compaction', ttl: 6,
          title: '☠ SEGFAULT (recovered)',
          lines: ['a frame crashed and was skipped. if this repeats, reload', String(err).slice(0, 90)],
        });
      } catch { /* even the banner failed; the loop survives anyway */ }
    }
  } finally {
    requestAnimationFrame(frame);
  }
}

function frameBody(t: number): void {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (run && !$('screen-match').classList.contains('hidden')) {
    run.step(dt, import.meta.env.DEV && qaAutoplay ? qaAutoplay.input(run, dt) : currentInput());
    ui.render(run, dt);
    // QA snapshot every 2s: position, vitals, wall gap — the learning-curve data
    snapshotAccum += dt;
    if (snapshotAccum >= 2 && !run.over) {
      snapshotAccum = 0;
      qa.event('snapshot', {
        x: Math.round(run.avatar.x), pct: Math.round((run.avatar.x / run.terrain.width) * 100),
        hp: Math.round(run.avatar.hp), shield: Math.round(run.avatar.shield),
        ctx: run.ctx.used, wallGap: Math.round(run.avatar.x - run.wallX),
        working: run.working, weapon: run.weapons[run.selected].def.id,
      });
    }
    // wall proximity heartbeat (self rate-limited)
    if (!run.over && run.avatar.x - run.wallX < 240) audio.wallHeartbeat();
    // observer's ambient judgment
    observer.tick(dt, run.over ? null : {
      wallGap: run.avatar.x - run.wallX,
      tasksRemain: run.queue.tasks.some((t) => !t.done && !t.forgotten),
      zapThink: run.zapThink,
    });
    // music tension: wall gap + context pressure + inside-the-forgetting
    const gap = run.avatar.x - run.wallX;
    const gapT = Math.max(0, Math.min(1, 1 - gap / 800));
    const ctxT = Math.min(1, run.ctx.used / (run.ctx.budget * run.ctx.threshold));
    music.tension = run.over ? 0.15 : Math.min(1, gapT * 0.75 + ctxT * 0.35);
    music.inside = !run.over && run.insideWall;
    if (run.over && !recapShown && !run.bannerActive) {
      recapShown = true;
      const r = run;
      window.setTimeout(() => {
        if (run === r && r.over) {
          ui.buildRecap(r, lastRankInfo ?? undefined);
          showScreen('recap');
        }
      }, 1500);
    }
  }
  if (import.meta.env.DEV && qaAutoplay && run && qaAutoplayCard && qaAutoplay.shouldRestart(run, dt)) {
    qaAutoplay.reset();
    prepareRun(qaAutoplayCard, qaAutoplayMode);
    showScreen('match');
  }
  // (re-scheduling happens in frame()'s finally — guaranteed even on throw)
}

// ---------------------------------------------------------------------------
// wire it up
// ---------------------------------------------------------------------------

function main(): void {
  // honest gate for touch-only devices: the beta needs a keyboard (M-5)
  const touchOnly = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
  if (touchOnly) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;background:#0f0f0e;color:#dedad2;font-family:ui-monospace,Menlo,monospace">
        <div style="color:#d97757;font-size:28px;letter-spacing:0.2em">AIAIO</div>
        <div style="max-width:420px;font-size:14px;line-height:1.7">this beta needs a <b>desktop + keyboard</b>.
        it's a game about replaying your agent sessions, and the controls are all keys.</div>
        <div style="color:#8f8b82;font-size:12px;max-width:420px;line-height:1.7">bookmark it for your laptop:
        clone the repo, <code>npm run scan</code> your own sessions, and play your actual history.</div>
      </div>`;
    return;
  }

  ui = new UI();
  (window as any).__ui = ui; // debug/testing handle
  (window as any).__observer = observer;
  observer.bindCaptionSink((speaker, text, active) => ui.setCaption(speaker, text, active));
  observer.bindSpeechState((active) => audio.setSpeechActive(active));
  const logoEl = document.querySelector('.ascii-logo');
  if (logoEl) startLogoLoop(logoEl as HTMLElement);
  wireCardSlot();
  wireKeyboard();
  loadGallery();
  loadPersonaPack();

  $('btn-run').addEventListener('click', () => {
    prepareRun(loadedCard ?? randomCard(`random-session-${runCounter + 1}`), loadedCard ? 'real' : 'random');
  });
  $('btn-example-clean').addEventListener('click', () => prepareRun(EXAMPLE_CLEAN, 'demo'));
  $('btn-example-chaos').addEventListener('click', () => prepareRun(EXAMPLE_CHAOTIC, 'demo'));

  $('btn-start-match').addEventListener('click', () => {
    if (!run) return;
    showScreen('match');
  });
  $('btn-back-menu').addEventListener('click', () => { run = null; refreshVault?.(); showScreen('menu'); });
  $('btn-again').addEventListener('click', () => { run = null; refreshVault?.(); showScreen('menu'); });

  $('schema-pre').textContent = SESSION_CARD_SCHEMA;
  $('btn-schema').addEventListener('click', () => $('modal-schema').classList.remove('hidden'));
  $('btn-close-schema').addEventListener('click', () => $('modal-schema').classList.add('hidden'));
  $('btn-copy-schema').addEventListener('click', () => {
    navigator.clipboard?.writeText(SESSION_CARD_SCHEMA).catch(() => { /* text is selectable */ });
  });
  $('modal-schema').addEventListener('click', (e) => {
    if (e.target === $('modal-schema')) $('modal-schema').classList.add('hidden');
  });

  // don't lose the tail of a play session when the tab closes
  window.addEventListener('pagehide', () => qa.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') qa.flush();
  });

  showScreen('menu');
  requestAnimationFrame(frame);
  if (import.meta.env.DEV) void startDevQA();
}

main();
