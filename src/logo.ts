// The AIAIO logo as a living thing: characters occasionally enter
// SUPERPOSITION (cycling candidate glyphs, brightened) before collapsing back
// into place — tokens being sampled — while an orange→purple→blue gradient
// field drifts across the letterforms. No assets, just spans.

const LOGO_ROWS = [
  ' █████╗ ██╗ █████╗ ██╗ ██████╗ ',
  '██╔══██╗██║██╔══██╗██║██╔═══██╗',
  '███████║██║███████║██║██║   ██║',
  '██╔══██║██║██╔══██║██║██║   ██║',
  '██║  ██║██║██║  ██║██║╚██████╔╝',
  '╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝ ╚═════╝ ',
];

const TRIAD = [
  [255, 148, 64],   // orange
  [177, 138, 255],  // purple
  [108, 182, 255],  // blue
];
const CANDIDATES = ['▓', '▒', '░', '#', '?', '0', '1', '¤', '≈', '╳'];

interface Superposition { row: number; col: number; ttl: number }

function lerp3(t: number): string {
  // t in [0,3) wraps through orange→purple→blue→orange
  const i = Math.floor(t) % 3;
  const j = (i + 1) % 3;
  const f = t - Math.floor(t);
  const c = TRIAD[i].map((v, k) => Math.round(v + (TRIAD[j][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function startLogoLoop(el: HTMLElement): void {
  let t = 0;
  const supers: Superposition[] = [];

  const tick = () => {
    if (el.closest('.hidden')) return; // rAF already sleeps hidden tabs
    t += 0.08;

    // a few characters enter superposition each tick; they collapse on expiry
    if (supers.length < 5 && Math.random() < 0.5) {
      const row = Math.floor(Math.random() * LOGO_ROWS.length);
      const col = Math.floor(Math.random() * LOGO_ROWS[row].length);
      if (LOGO_ROWS[row][col] !== ' ') supers.push({ row, col, ttl: 2 + Math.floor(Math.random() * 4) });
    }
    for (const s of supers) s.ttl--;
    for (let i = supers.length - 1; i >= 0; i--) if (supers[i].ttl <= 0) supers.splice(i, 1);

    let html = '';
    for (let r = 0; r < LOGO_ROWS.length; r++) {
      for (let c = 0; c < LOGO_ROWS[r].length; c++) {
        const ch = LOGO_ROWS[r][c];
        if (ch === ' ') { html += ' '; continue; }
        const sup = supers.find((s) => s.row === r && s.col === c);
        // gradient field: diagonal bands drifting with time, gently warped
        const field = (c * 0.09 + r * 0.22 + t * 0.35 + Math.sin(c * 0.3 + t) * 0.25) % 3;
        if (sup) {
          const g = CANDIDATES[Math.floor(Math.random() * CANDIDATES.length)];
          html += `<span style="color:#fff;text-shadow:0 0 6px ${lerp3(field)}">${g}</span>`;
        } else {
          html += `<span style="color:${lerp3(field < 0 ? field + 3 : field)}">${ch}</span>`;
        }
      }
      html += '\n';
    }
    el.innerHTML = html;
  };

  // rAF-driven (not setInterval): resumes instantly when a backgrounded tab
  // becomes visible, so the logo is never caught frozen
  let lastTick = 0;
  const loop = (ts: number) => {
    requestAnimationFrame(loop);
    if (ts - lastTick < 110) return;
    lastTick = ts;
    tick();
  };
  tick();
  requestAnimationFrame(loop);
}
