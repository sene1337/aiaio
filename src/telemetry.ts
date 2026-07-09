// QA telemetry — records how the game is actually played so balance and
// control decisions can be made from evidence, not vibes.
//
// Dev server: events batch-POST to /__qa (a local vite middleware) and land in
// qa-logs/*.jsonl on disk. Production build: no network calls of any kind —
// events go to a localStorage ring buffer instead (exportable from console via
// localStorage.getItem('aiaio-qa')).

export interface QaEvent {
  t: number;         // ms since run start
  type: string;
  [key: string]: unknown;
}

const FLUSH_MS = 3000;
const LS_KEY = 'aiaio-qa';
const LS_MAX_EVENTS = 4000;

class Telemetry {
  private buffer: QaEvent[] = [];
  private runId = 'no-run';
  private runStartMs = 0;
  private timer: number | null = null;
  private firstUse = new Set<string>();

  startRun(sessionId: string, fromCard: boolean): void {
    this.runId = `${sessionId}-${Math.floor(performance.now())}`;
    this.runStartMs = performance.now();
    this.firstUse.clear();
    this.event('run_start', { session_id: sessionId, from_card: fromCard });
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.flush(), FLUSH_MS);
    }
  }

  event(type: string, data: Record<string, unknown> = {}): void {
    this.buffer.push({ t: Math.round(performance.now() - this.runStartMs), type, ...data });
    if (this.buffer.length > 200) this.flush();
  }

  /** log the FIRST time each control/feature is used — the learning-curve signal */
  firstUseOf(feature: string): void {
    if (this.firstUse.has(feature)) return;
    this.firstUse.add(feature);
    this.event('first_use', { feature });
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    const events = this.buffer;
    this.buffer = [];
    const payload = { run: this.runId, events };
    if (import.meta.env.DEV) {
      fetch('/__qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => this.toLocalStorage(payload));
    } else {
      this.toLocalStorage(payload);
    }
  }

  private toLocalStorage(payload: { run: string; events: QaEvent[] }): void {
    try {
      const existing: unknown[] = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
      existing.push(payload);
      let total = existing.reduce((s: number, p: any) => s + (p.events?.length ?? 0), 0);
      while (total > LS_MAX_EVENTS && existing.length > 1) {
        total -= (existing.shift() as any).events?.length ?? 0;
      }
      localStorage.setItem(LS_KEY, JSON.stringify(existing));
    } catch { /* storage full or unavailable — telemetry is best-effort */ }
  }
}

export const qa = new Telemetry();
