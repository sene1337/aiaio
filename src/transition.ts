// The wall wipe: the forgetting veil on the title screen and the compaction
// wall in the game are the same entity, so entering a session means passing
// THROUGH it. The rune field surges rightward over the screen, the screens
// swap underneath at full cover, then it withdraws left and settles where the
// in-game wall waits. Respects reduced-fx (instant swap).

import { audio } from './audio';

const BODY = '▓▓▒▒░░█▒';
const TEETH = '╬≠☓✕×≢∦';
const SPARSE = ' ░▒';

let running = false;

export function wallWipe(onCovered: () => void): void {
  if (running) { onCovered(); return; }
  if (localStorage.getItem('aiaio-reduced-fx') === '1') { onCovered(); return; }
  running = true;

  const el = document.createElement('pre');
  el.id = 'wall-wipe';
  document.body.appendChild(el);
  audio.ensure();
  audio.wallSweep();

  const rowH = 15;
  const colW = 7.5;
  const rows = Math.ceil(window.innerHeight / rowH) + 1;
  const cols = Math.ceil(window.innerWidth / colW) + 6;

  const COVER_MS = 520;
  const HOLD_MS = 130;
  const REVEAL_MS = 620;
  const t0 = performance.now();
  let swapped = false;
  let done = false;
  // wall-clock guarantees: the swap and cleanup happen even if rAF stalls
  // (hidden tab, main-thread hiccup) — the animation is decoration, the
  // screen change is not
  window.setTimeout(() => { if (!swapped) { swapped = true; onCovered(); } }, COVER_MS + 40);
  window.setTimeout(() => {
    if (!done) { done = true; el.remove(); running = false; }
  }, COVER_MS + HOLD_MS + REVEAL_MS + 150);

  const paint = (frac: number, t: number): void => {
    const out: string[] = [];
    for (let r = 0; r < rows; r++) {
      const wave = 3.5 * Math.sin(t * 0.011 + r * 0.55) + 1.5 * Math.sin(t * 0.004 + r * 1.3);
      const w = Math.max(0, Math.round(cols * frac + wave));
      if (w === 0) { out.push(''); continue; }
      let line = '';
      for (let c = 0; c < w; c++) {
        const deep = 1 - c / Math.max(1, w);
        const set = deep > 0.3 ? BODY : SPARSE;
        line += set[Math.floor(Math.abs(Math.sin(r * 31.7 + c * 17.3 + Math.floor(t * 0.02))) * set.length) % set.length];
      }
      line += TEETH[Math.floor(Math.abs(Math.sin(r * 13.1 + Math.floor(t * 0.03))) * TEETH.length) % TEETH.length];
      out.push(line);
    }
    el.textContent = out.join('\n');
  };

  const step = (now: number): void => {
    const t = now - t0;
    if (t < COVER_MS) {
      paint(easeInOut(t / COVER_MS), now);
    } else if (t < COVER_MS + HOLD_MS) {
      if (!swapped) { swapped = true; onCovered(); }
      paint(1, now);
    } else if (t < COVER_MS + HOLD_MS + REVEAL_MS) {
      paint(1 - easeInOut((t - COVER_MS - HOLD_MS) / REVEAL_MS), now);
    } else {
      if (!done) { done = true; el.remove(); running = false; }
      return;
    }
    if (!done) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function easeInOut(x: number): number {
  const v = Math.max(0, Math.min(1, x));
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
}
