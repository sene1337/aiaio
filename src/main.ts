// Bootstrap: screens (menu -> briefing -> match -> recap), SessionCard loading
// (drag-drop + file picker), keyboard input, the frame loop, and CPU turns.

import { Game, MatchSetup } from './game';
import { UI } from './ui';
import { chooseAction } from './ai';
import {
  SessionCard, parseSessionCard, loadoutFromCard, randomCard,
  EXAMPLE_CLEAN, EXAMPLE_CHAOTIC, SESSION_CARD_SCHEMA, AgentLoadout,
} from './session';

type ScreenId = 'menu' | 'briefing' | 'match' | 'recap';

const $ = (id: string) => document.getElementById(id)!;

let game: Game | null = null;
let ui: UI;
let loadedCards: [SessionCard | null, SessionCard | null] = [null, null];
let pendingSetup: MatchSetup | null = null;
let matchCounter = 0;

function showScreen(id: ScreenId): void {
  for (const s of ['menu', 'briefing', 'match', 'recap']) {
    $(`screen-${s}`).classList.toggle('hidden', s !== id);
  }
}

// ---------------------------------------------------------------------------
// card loading
// ---------------------------------------------------------------------------

function setCard(slot: 0 | 1, card: SessionCard, sourceName: string): void {
  loadedCards[slot] = card;
  const status = $(`card-status-${slot}`);
  status.classList.add('loaded');
  const errs = (card.errors ?? []).reduce((s, e) => s + (e.count ?? 1), 0);
  status.textContent = `✔ ${sourceName} — session "${card.session_id ?? '?'}", ${errs} errors, ` +
    `${card.tasks?.length ?? 0} tasks, stability ${card.stability_score ?? 'n/a'}`;
}

function cardLoadError(slot: 0 | 1, err: unknown): void {
  const status = $(`card-status-${slot}`);
  status.classList.remove('loaded');
  status.textContent = `✕ could not read card: ${err instanceof Error ? err.message : String(err)}`;
}

function wireCardSlot(slot: 0 | 1): void {
  const drop = $(`drop-${slot}`);
  const fileInput = $(`file-${slot}`) as HTMLInputElement;
  const readFile = (file: File) => {
    file.text()
      .then((text) => setCard(slot, parseSessionCard(text), file.name))
      .catch((err) => cardLoadError(slot, err));
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
    if ((e.target as HTMLElement).id !== `pick-${slot}`) fileInput.click();
  });
  $(`pick-${slot}`).addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) readFile(file);
    fileInput.value = '';
  });
}

// ---------------------------------------------------------------------------
// match setup flow
// ---------------------------------------------------------------------------

function agentName(card: SessionCard | null, fallback: string): string {
  return card?.session_id ? `agent:${card.session_id.slice(0, 14)}` : fallback;
}

function prepareMatch(cpu1: boolean): void {
  matchCounter++;
  const c0 = loadedCards[0] ?? randomCard(`random-agent-A${matchCounter}`);
  const c1 = loadedCards[1] ?? randomCard(`random-agent-B${matchCounter}`);
  const names: [string, string] = [
    agentName(loadedCards[0], 'AGENT-01'),
    agentName(loadedCards[1], cpu1 ? 'RIVAL-CPU' : 'AGENT-02'),
  ];
  const loadouts: [AgentLoadout, AgentLoadout] = [
    loadoutFromCard(c0, names[0]),
    loadoutFromCard(c1, names[1]),
  ];
  loadouts[0].cardSummary.fromCard = loadedCards[0] !== null;
  loadouts[1].cardSummary.fromCard = loadedCards[1] !== null;

  pendingSetup = {
    loadouts,
    cards: [loadedCards[0] ?? c0, loadedCards[1] ?? c1],
    cpu: [false, cpu1],
    names,
  };
  // pre-build game so briefing can show the actual handicap rolls
  game = new Game(pendingSetup);
  (window as any).__aiaio = game; // debug/testing handle
  ui.buildBriefing(loadouts, names);
  ui.addBriefingHandicaps(game);
  showScreen('briefing');
}

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

const held = new Set<string>();

function wireKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    if (!game || game.gameOver || $(`screen-match`).classList.contains('hidden')) return;
    if (game.current.isCpu) return;
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
    switch (k) {
      case ' ': game.fire(); break;
      case 'w': case 'W': game.workAction(); break;
      case 'u': case 'U': game.installUpdate(); break;
      case '[': game.cycleWeapon(-1); break;
      case ']': game.cycleWeapon(1); break;
      case 'a': case 'A': game.move(-1); break;
      case 'd': case 'D': game.move(1); break;
      default:
        if (/^[1-9]$/.test(k)) game.selectWeapon(parseInt(k, 10) - 1);
        else held.add(k);
        return;
    }
  });
  window.addEventListener('keydown', (e) => held.add(e.key));
  window.addEventListener('keyup', (e) => held.delete(e.key));
  window.addEventListener('blur', () => held.clear());
}

function applyHeldKeys(dt: number): void {
  if (!game || game.gameOver || game.current.isCpu) return;
  const speed = 40 * dt; // degrees or power-units per second of hold
  if (held.has('ArrowLeft')) game.adjustAngle(speed);
  if (held.has('ArrowRight')) game.adjustAngle(-speed);
  if (held.has('ArrowUp')) game.adjustPower(speed);
  if (held.has('ArrowDown')) game.adjustPower(-speed);
}

// ---------------------------------------------------------------------------
// CPU turn driver
// ---------------------------------------------------------------------------

let cpuActing = false;

function driveCpu(): void {
  if (!game || game.gameOver || cpuActing) return;
  const p = game.current;
  if (!p.isCpu || game.phase !== 'aim') return;
  if (game.bannerActive) return;          // let the player read banners first
  if (game.turnClock < 0.9) return;       // beat of thinking time
  cpuActing = true;
  const g = game;
  const action = chooseAction(g, p);
  if (action.type === 'work') {
    g.workAction();
    cpuActing = false;
    return;
  }
  if (action.type === 'update') {
    g.installUpdate();
    cpuActing = false;
    return;
  }
  // animate the aim toward the chosen solution, then fire
  g.selectWeapon(action.weaponIndex);
  const steps = 22;
  let i = 0;
  const a0 = p.angle, pw0 = p.power;
  const timer = window.setInterval(() => {
    if (game !== g || g.gameOver) { window.clearInterval(timer); cpuActing = false; return; }
    i++;
    const t = i / steps;
    p.angle = a0 + (action.angle - a0) * t;
    p.power = pw0 + (action.power - pw0) * t;
    g.dirty++;
    if (i >= steps) {
      window.clearInterval(timer);
      g.fire();
      cpuActing = false;
    }
  }, 45);
}

// ---------------------------------------------------------------------------
// frame loop
// ---------------------------------------------------------------------------

let lastT = 0;
let recapShown = false;

function frame(t: number): void {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (game && !$(`screen-match`).classList.contains('hidden')) {
    applyHeldKeys(dt);
    game.step(dt);
    ui.render(game, dt);
    driveCpu();
    if (game.gameOver && !recapShown && !game.bannerActive && game.projectiles.length === 0) {
      recapShown = true;
      const g = game;
      window.setTimeout(() => {
        if (game === g && g.gameOver) {
          ui.buildRecap(g);
          showScreen('recap');
        }
      }, 1400);
    }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// wire it all up
// ---------------------------------------------------------------------------

function main(): void {
  ui = new UI();
  wireCardSlot(0);
  wireCardSlot(1);
  wireKeyboard();

  $('btn-vs-cpu').addEventListener('click', () => prepareMatch(true));
  $('btn-hotseat').addEventListener('click', () => prepareMatch(false));
  $('btn-examples').addEventListener('click', () => {
    setCard(0, EXAMPLE_CLEAN, 'example: clean agent');
    setCard(1, EXAMPLE_CHAOTIC, 'example: chaotic agent');
  });

  $('btn-start-match').addEventListener('click', () => {
    if (!game) return;
    recapShown = false;
    showScreen('match');
  });
  $('btn-back-menu').addEventListener('click', () => {
    game = null;
    pendingSetup = null;
    showScreen('menu');
  });
  $('btn-again').addEventListener('click', () => {
    game = null;
    pendingSetup = null;
    recapShown = false;
    showScreen('menu');
  });

  const schemaPre = $('schema-pre');
  schemaPre.textContent = SESSION_CARD_SCHEMA;
  $('btn-schema').addEventListener('click', () => $('modal-schema').classList.remove('hidden'));
  $('btn-close-schema').addEventListener('click', () => $('modal-schema').classList.add('hidden'));
  $('btn-copy-schema').addEventListener('click', () => {
    navigator.clipboard?.writeText(SESSION_CARD_SCHEMA).catch(() => { /* clipboard unavailable — text is selectable */ });
  });
  $('modal-schema').addEventListener('click', (e) => {
    if (e.target === $('modal-schema')) $('modal-schema').classList.add('hidden');
  });

  showScreen('menu');
  requestAnimationFrame(frame);
}

main();
