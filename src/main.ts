// Bootstrap for SESSION RUN: menu (card drop + scanned-session gallery),
// briefing, the run loop, keyboard input, recap.

import { Run, RunInput } from './run';
import { UI } from './ui';
import {
  SessionCard, parseSessionCard, loadoutFromCard, randomCard,
  EXAMPLE_CLEAN, EXAMPLE_CHAOTIC, SESSION_CARD_SCHEMA,
} from './session';

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
  ui.buildBriefing(loadout, card, name);
  showScreen('briefing');
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

function wireKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    held.add(e.key);
    if (!run || run.over || $('screen-match').classList.contains('hidden')) return;
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
    switch (k) {
      case ' ': run.fire(); break;
      case 'ArrowUp': run.jump(); break;
      case 'u': case 'U': run.installUpdate(); break;
      case '[': run.cycleWeapon(-1); break;
      case ']': run.cycleWeapon(1); break;
      default:
        if (/^[1-9]$/.test(k)) run.selectWeapon(parseInt(k, 10) - 1);
    }
  });
  window.addEventListener('keyup', (e) => held.delete(e.key));
  window.addEventListener('blur', () => held.clear());
}

// ---------------------------------------------------------------------------
// frame loop
// ---------------------------------------------------------------------------

let lastT = 0;

function frame(t: number): void {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (run && !$('screen-match').classList.contains('hidden')) {
    run.step(dt, currentInput());
    ui.render(run, dt);
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

  showScreen('menu');
  requestAnimationFrame(frame);
}

main();
