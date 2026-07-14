#!/usr/bin/env node
// make-demo-cards.mjs — inject the two FICTIONAL example cards into a build's
// cards/ dir so the hosted demo has playable levels. Never touches real
// session data; used by the Pages deploy workflow.
//
// usage: node scripts/make-demo-cards.mjs <dist-dir>

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const outDir = join(dist, 'cards');
// Vite copies public/cards before this runs. Delete it wholesale so a local
// production build cannot accidentally ship private scanned cards.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const campaign = JSON.parse(readFileSync('examples/openclaw-hermes-campaign.json', 'utf8'));
const campaignDir = join(outDir, 'openclaw-hermes');
mkdirSync(campaignDir, { recursive: true });
const entries = [];
let order = 0;
for (const act of campaign.acts) {
  for (const level of act.levels) {
    order++;
    const file = `openclaw-hermes/${String(order).padStart(2, '0')}.json`;
    const card = {
      session_id: `fictional-openclaw-hermes-${String(order).padStart(2, '0')}`,
      harness: 'fictional', when: 'THE LONG NOW', goal: level.goal,
      message_count: level.messages, token_peak: 9000 + order * 550,
      compaction_events: Math.floor(order / 4), restarts: Math.floor(order / 3),
      recoveries: Math.floor(order / 4), model_switches: Math.floor(order / 5),
      stability_score: Math.max(40, 78 - order * 2),
      tasks: [{ name: level.task, work_units: 2 + Math.floor(order / 3), completed: false, at: 0.42 }],
      errors: [{ category: level.error, count: level.count, sample: 'fictional campaign signal', at: [0.3, 0.62, 0.79] }],
      moments: [{ at: 0.18, kind: 'note', text: `${act.name}: ${level.title}` }],
    };
    writeFileSync(join(outDir, file), JSON.stringify(card, null, 2) + '\n');
    entries.push({ file, sourceSessionId: card.session_id, sourceDigest: `fiction-${String(order).padStart(2, '0')}`, order, title: level.title, taskLabel: level.task });
  }
}
const manifest = {
  schemaVersion: 1, id: campaign.id, revision: 1, kind: 'fictional', createdAt: '2026-07-13T00:00:00.000Z',
  sourceCardDigest: 'openclaw-hermes-fiction-v1', selectedSourceIds: entries.map((entry) => entry.sourceSessionId),
  recipe: { selection: 'story', pace: 'intense', observerTone: 'dry mission control', ruleset: 'factual' },
  writerStatus: 'custom', entries,
};
mkdirSync(join(outDir, 'campaigns'), { recursive: true });
writeFileSync(join(outDir, 'campaigns', 'openclaw-hermes.json'), JSON.stringify(manifest, null, 2) + '\n');
// A hosted build is public-fiction-only. The personal History gallery stays
// empty, while the main page offers the campaign CTA directly.
writeFileSync(join(outDir, 'index.json'), '[]\n');
console.error(`wrote ${entries.length} fictional campaign cards to ${outDir}`);
