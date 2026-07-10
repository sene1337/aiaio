// Context window + compaction — the signature drama. Every action costs tokens;
// crossing the compaction threshold triggers a glitchy partial-amnesia event.

import { Rng } from './rng';

export interface ContextMeter {
  used: number;
  budget: number;
  /** fraction of budget at which compaction fires */
  threshold: number;
  /** total compactions suffered this match */
  compactions: number;
}

export function makeContextMeter(budget: number, threshold: number): ContextMeter {
  return { used: 0, budget, threshold, compactions: 0 };
}

export function contextFrac(m: ContextMeter): number {
  return Math.min(1, m.used / m.budget);
}

export function overThreshold(m: ContextMeter): boolean {
  return m.used >= m.budget * m.threshold;
}

/** Spend tokens. Returns true if this spend crossed the compaction threshold. */
export function spend(m: ContextMeter, tokens: number): boolean {
  const wasOver = overThreshold(m);
  m.used = Math.min(m.budget, m.used + Math.max(0, Math.round(tokens)));
  return !wasOver && overThreshold(m);
}

/** Drain after compaction: meter drops back to ~30-40% of budget. */
export function drainAfterCompaction(m: ContextMeter, rng: Rng): void {
  m.used = Math.round(m.budget * rng.range(0.28, 0.4));
  m.compactions += 1;
}

// ---------------------------------------------------------------------------
// garbled, memory-corrupted text for the compaction banner
// ---------------------------------------------------------------------------

const CORRUPT_CHARS = ['▓', '░', '█', '▒', '#', '?', '¿', '¤', '~', '0x', '�'];

/** Corrupt roughly `intensity` (0..1) of the characters in a string. */
export function garble(text: string, rng: Rng, intensity: number): string {
  let out = '';
  for (const ch of text) {
    if (ch !== ' ' && rng.chance(intensity)) out += rng.pick(CORRUPT_CHARS);
    else out += ch;
  }
  return out;
}

/**
 * Build the compaction banner body: a badly-summarized, partially-corrupted
 * account of what was just forgotten.
 */
export function compactionSummary(lostLines: string[], rng: Rng): string[] {
  const openers = [
    'CONVERSATION SUMMARIZED. SOME DETAILS WERE LOST:',
    'CONTEXT COMPACTED. RECONSTRUCTING FROM SUMMARY…',
    'MEMORY PRESSURE CRITICAL. FORGETTING RESPONSIBLY:',
    'AUTO-SUMMARY (CONFIDENCE: LOW):',
  ];
  const fillers = [
    'the user asked about… something?',
    'there was definitely a plan here',
    'previous 47 messages: [summarized as "stuff happened"]',
    'aim solution found earlier. solution not retained',
    'important warning from turn 12: █████ ██ ███',
  ];
  const lines: string[] = [rng.pick(openers)];
  for (const l of lostLines) lines.push('· ' + garble(l, rng, 0.18));
  lines.push('· ' + garble(rng.pick(fillers), rng, 0.28));
  return lines;
}
