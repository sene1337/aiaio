#!/usr/bin/env node
// make-demo-cards.mjs — inject the two FICTIONAL example cards into a build's
// cards/ dir so the hosted demo has playable levels. Never touches real
// session data; used by the Pages deploy workflow.
//
// usage: node scripts/make-demo-cards.mjs <dist-dir>

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const outDir = join(dist, 'cards');
mkdirSync(outDir, { recursive: true });

const index = [];
for (const file of readdirSync('examples').filter((f) => f.endsWith('.json'))) {
  const card = JSON.parse(readFileSync(join('examples', file), 'utf8'));
  card.harness = 'demo';
  card.when = card.when ?? '2026-07-01';
  const out = file.replace('.sessioncard', '');
  writeFileSync(join(outDir, out), JSON.stringify(card, null, 2) + '\n');
  const errTotal = (card.errors ?? []).reduce((s, e) => s + Math.max(1, e.count ?? 1), 0);
  index.push({
    file: out,
    session_id: card.session_id,
    harness: 'demo',
    when: card.when,
    errors: errTotal,
    enemies: errTotal === 0 ? 0 : Math.max(4, Math.min(30, Math.round(4 + 4.5 * Math.log2(1 + errTotal / 6)))),
    tasks: card.tasks?.length ?? 0,
    stability: card.stability_score ?? null,
    messages: card.message_count ?? 0,
    mtime: 0,
    token_peak: card.token_peak ?? null,
    compactions: card.compaction_events ?? 0,
    work: (card.tasks ?? []).reduce((s, t) => s + (t.work_units ?? 2), 0),
  });
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.error(`wrote ${index.length} demo cards to ${outDir}`);
