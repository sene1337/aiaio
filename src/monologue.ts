// Reconstructed reasoning for the J-space thought stream.
//
// Most session logs carry no visible thinking blocks, so this module
// synthesizes what the model was LIKELY thinking at each point of the
// timeline — deterministically, from the card's real recorded material:
// task names (the player's actual asks), error categories and sample lines,
// moments, the goal, and the session's numbers. It is presentation in the
// same sense as Observer lines: generated wording bound to recorded facts,
// never invented events. Verbatim mined thinking (card.thoughts) always
// takes precedence where it exists; synthesis only fills the gaps.

import { SessionCard, SessionCardThought } from './session';
import { Rng } from './rng';

// what a model mutters while circling each failure class. Fixed pools, like
// the Observer's LINES — flavor is authored, placement and topic are factual.
const CATEGORY_MURMUR: Record<string, string[]> = {
  timeout: ['waiting', 'still waiting', 'hung?', 'no response', 'retry', 'poll again'],
  hallucination: ['is that real', 'does this exist', 'which file', 'citation?', 'verify first'],
  regression: ['it worked before', 'what changed', 'diff it', 'revert?', 'bisect'],
  restart: ['from the top', 'again then', 'clean slate', 'once more'],
  false_positive: ['passed?', 'really?', 'green but wrong', 'check again'],
  tool_error: ['exit code', 'stderr says', 'permission?', 'wrong flag'],
  context_overflow: ['too much', 'forgetting', 'what was I doing', 'losing it'],
  recovery: ['there it is', 'back on track', 'ok. ok.', 'found it'],
  unknown: ['hm', 'wait', 'why though', 'check this'],
};

const PROCESS_MURMUR = ['ok so', 'first', 'checking', 'then', 'almost', 'carefully', 'one thing'];

const MONO_STOP = new Set(('the a an and or but of to in on for with that this from is are was were be it its as at by not no if so we i you they will would could should can may just about there what which when how do did done have has had more some any all very really need want going make').split(' '));

/** salient words from a real snippet — same spirit as the extractor's miner */
function mine(text: string, max: number): string[] {
  const out: string[] = [];
  for (const w of String(text).split(/[^A-Za-z0-9'`-]+/)) {
    if (out.length >= max) break;
    const clean = w.replace(/^[`']+|[`']+$/g, '');
    if (clean.length < 4 || clean.length > 24) continue;
    if (MONO_STOP.has(clean.toLowerCase()) || out.includes(clean)) continue;
    // timestamp/id debris and redaction markers read as noise, not thought
    if (/^[0-9:TZ.-]+$/.test(clean) || /^\d{4}-\d{2}/.test(clean) || /REDACTED/i.test(clean)) continue;
    out.push(clean);
  }
  return out;
}

/**
 * Reconstruct a thought stream from the card's recorded anchors. Thoughts
 * seed slightly BEFORE their anchor (the model thinks, then acts — and the
 * J-lens research says J-space holds near-future words), so a reader of the
 * background sees what's coming.
 */
export function synthesizeThoughts(card: SessionCard): SessionCardThought[] {
  const rng = new Rng(String(card.session_id ?? 'anon') + ':monologue');
  const out: SessionCardThought[] = [];
  const put = (at: number, words: string[]) => {
    if (words.length === 0 || out.length >= 40) return;
    out.push({ at: Math.max(0.01, Math.min(0.99, at)), w: words.slice(0, 4) });
  };

  // the mission, turning over at the session's start
  if (card.goal) {
    put(rng.range(0.01, 0.06), [rng.pick(PROCESS_MURMUR), ...mine(card.goal, 3)]);
    put(rng.range(0.06, 0.12), mine(card.goal, 4).reverse());
  }

  // each task: its own words, thought just before the station where it stands
  for (const task of card.tasks ?? []) {
    if (typeof task.at !== 'number') continue;
    const words = mine(task.name ?? '', 3);
    put(task.at - rng.range(0.02, 0.05), [rng.pick(PROCESS_MURMUR), ...words]);
    if (words.length > 1) put(task.at + rng.range(0.01, 0.03), words.slice(1));
  }

  // each error: category murmur + words from the real sample line, thought
  // just before where the failures actually happened
  for (const err of card.errors ?? []) {
    const cat = (err.category ?? err.type ?? 'unknown').toLowerCase();
    const pool = CATEGORY_MURMUR[cat] ?? CATEGORY_MURMUR.unknown;
    const sampleWords = mine(err.sample ?? '', 2);
    for (const at of (err.at ?? []).slice(0, 3)) {
      put(at - rng.range(0.01, 0.04), [rng.pick(pool), ...sampleWords]);
      if ((err.count ?? 1) >= 8) put(at + rng.range(0.005, 0.02), [rng.pick(pool)]);
    }
  }

  // the numbers in flight: real stats as intermediary calculations
  if (card.token_peak) put(rng.range(0.3, 0.8), [String(card.token_peak), 'tokens?']);
  if (card.message_count) put(rng.range(0.2, 0.7), [String(card.message_count)]);

  // recoveries: relief, late in the session where recovery sprites live
  for (let i = 0; i < Math.min(2, card.recoveries ?? 0); i++) {
    put(rng.range(0.55, 0.92), [rng.pick(CATEGORY_MURMUR.recovery)]);
  }

  return out.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

/**
 * The final stream: verbatim mined thinking wherever it exists, synthesis
 * only in the gaps it leaves (no reconstructed thought within 0.08 of a
 * real one). Cards with rich verbatim thinking stay mostly verbatim.
 */
export function thoughtStream(card: SessionCard): { thoughts: SessionCardThought[]; verbatim: number } {
  const real = (card.thoughts ?? []).filter((t) => (t.w?.length ?? 0) > 0);
  const synth = synthesizeThoughts(card).filter(
    (s) => !real.some((r) => Math.abs((r.at ?? 0) - (s.at ?? 0)) < 0.08),
  );
  return { thoughts: [...real, ...synth].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)), verbatim: real.length };
}
