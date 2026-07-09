// Bootstrap for SESSION RUN: menu (card drop + scanned-session gallery),
// briefing, the run loop, keyboard input, recap.

import { Run, RunInput } from './run';
import { UI } from './ui';
import {
  SessionCard, parseSessionCard, loadoutFromCard, randomCard,
  EXAMPLE_CLEAN, EXAMPLE_CHAOTIC, SESSION_CARD_SCHEMA,
} from './session';
import { qa } from './telemetry';
import { audio } from './audio';

type ScreenId = 'menu' | 'briefing' | 'match' | 'recap';

const $ = (id: string) => document.getElementById(id)!;

let run: Run | null = null;
let ui: UI;
let loadedCard: SessionCard | null = null;
let runCounter = 0;
let recapShown = false;

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
  status.textContent = `✔ ${sourceName} — "${card.session_id ?? '?'}", ${errs} errors, ` +
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

/** Gallery of cards produced by `npm run scan` (public/cards/index.json). */
async function loadGallery(): Promise<void> {
  const box = $('gallery');
  try {
    const res = await fetch('./cards/index.json');
    if (!res.ok) throw new Error('none');
    const index: Array<{ file: string; session_id: string; errors: number; tasks: number; stability: number | null }> = await res.json();
    if (!Array.isArray(index) || index.length === 0) throw new Error('empty');
    box.innerHTML = '<div class="hint" style="text-align:left">scanned sessions (npm run scan):</div>';
    for (const entry of index.slice(0, 12)) {
      const btn = document.createElement('button');
      btn.className = 'cmd';
      const shortId = entry.session_id.length > 26 ? entry.session_id.slice(0, 24) + '…' : entry.session_id;
      btn.innerHTML = `<span class="caret">❯</span><span class="cmd-name">${shortId}</span>` +
        `<span class="cmd-desc">${entry.errors} errors · stability ${entry.stability ?? '?'}</span>`;
      btn.addEventListener('click', async () => {
        try {
          const cardRes = await fetch(`./cards/${entry.file}`);
          setCard(parseSessionCard(await cardRes.text()), entry.file);
        } catch {
          $('card-status-0').textContent = `✕ could not load ${entry.file}`;
        }
      });
      box.appendChild(btn);
    }
  } catch {
    box.innerHTML = '<div class="hint" style="text-align:left">no scanned sessions — run <b>npm run scan</b> to auto-build cards from your OpenClaw / Claude Code / Hermes sessions, or drop a card above.</div>';
  }
}

// ---------------------------------------------------------------------------
// run setup
// ---------------------------------------------------------------------------

function prepareRun(card: SessionCard): void {
  runCounter++;
  const name = card.session_id ? `agent:${String(card.session_id).slice(0, 14)}` : 'AGENT-01';
  const loadout = loadoutFromCard(card, name);
  loadout.cardSummary.fromCard = loadedCard !== null || card === EXAMPLE_CLEAN || card === EXAMPLE_CHAOTIC;
  run = new Run({ loadout, card, name });
  (window as any).__aiaio = run; // debug/testing handle
  recapShown = false;
  qa.startRun(String(card.session_id ?? 'unknown'), loadout.cardSummary.fromCard);
  run.emit = (type, data = {}) => {
    qa.event(type, data);
    ui.fx(type, data);
    routeAudio(type, data);
  };
  ui.buildBriefing(loadout, card, name);
  showScreen('briefing');
}

function routeAudio(type: string, data: Record<string, unknown>): void {
  switch (type) {
    case 'fire': {
      const w = String(data.weapon ?? '');
      if (w === 'debug_zap') audio.zap();
      else if (w === 'false_positive_laser') audio.laser();
      else audio.fire(w === 'context_nuke' || w === 'timeout_mortar' || w === 'regression_cluster');
      break;
    }
    case 'explosion': audio.explode(Number(data.radius) || 20); break;
    case 'damage': audio.hurt(); break;
    case 'compaction': audio.compaction(); break;
    case 'work_tick': audio.taskTick(); break;
    case 'task_done': audio.taskDone(); break;
    case 'task_eaten': audio.taskEaten(); break;
    case 'update_install': audio.update(data.netBuff === true); break;
    case 'model_upgrade': audio.win(false); break;
    case 'subagent_spawn': audio.pickup(); break;
    case 'subagent_corrupted': audio.taskEaten(); break;
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
  };
}

const FEATURE_KEYS: Record<string, string> = {
  ' ': 'fire', 'ArrowUp': 'jump', 'ArrowLeft': 'move', 'ArrowRight': 'move',
  'a': 'move', 'd': 'move', 'w': 'work', 'u': 'update', '[': 'weapon_cycle', ']': 'weapon_cycle',
};

function wireKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    held.add(e.key);
    audio.ensure(); // first gesture unlocks the AudioContext
    if (e.key === 'm' || e.key === 'M') {
      const muted = audio.toggleMute();
      qa.event('mute_toggle', { muted });
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
      case '[': run.cycleWeapon(-1); break;
      case ']': run.cycleWeapon(1); break;
      default:
        if (/^[1-9]$/.test(k)) run.selectWeapon(parseInt(k, 10) - 1);
    }
  });
  window.addEventListener('click', () => audio.ensure());
  window.addEventListener('keyup', (e) => held.delete(e.key));
  window.addEventListener('blur', () => held.clear());
}

// ---------------------------------------------------------------------------
// frame loop
// ---------------------------------------------------------------------------

let lastT = 0;
let snapshotAccum = 0;

function frame(t: number): void {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (run && !$('screen-match').classList.contains('hidden')) {
    run.step(dt, currentInput());
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
    if (run.over && !recapShown && !run.bannerActive) {
      recapShown = true;
      const r = run;
      window.setTimeout(() => {
        if (run === r && r.over) {
          ui.buildRecap(r);
          showScreen('recap');
        }
      }, 1500);
    }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// wire it up
// ---------------------------------------------------------------------------

function main(): void {
  ui = new UI();
  (window as any).__ui = ui; // debug/testing handle
  wireCardSlot();
  wireKeyboard();
  loadGallery();

  $('btn-run').addEventListener('click', () => {
    prepareRun(loadedCard ?? randomCard(`random-session-${runCounter + 1}`));
  });
  $('btn-example-clean').addEventListener('click', () => prepareRun(EXAMPLE_CLEAN));
  $('btn-example-chaos').addEventListener('click', () => prepareRun(EXAMPLE_CHAOTIC));

  $('btn-start-match').addEventListener('click', () => {
    if (!run) return;
    showScreen('match');
  });
  $('btn-back-menu').addEventListener('click', () => { run = null; showScreen('menu'); });
  $('btn-again').addEventListener('click', () => { run = null; showScreen('menu'); });

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
}

main();
