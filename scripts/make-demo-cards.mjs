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
// Same net for public/packs: an Observer persona pack is written from the
// user's own history, and a hosted build ships no pack at all. Delete whatever
// Vite copied rather than trusting .gitignore alone.
rmSync(join(dist, 'packs'), { recursive: true, force: true });

import('./fictional-campaign.mjs').then(({ buildFictionalAssets }) => {
const { cards, manifest } = buildFictionalAssets();
mkdirSync(join(outDir, 'openclaw-hermes'), { recursive: true });
for (const [file, card] of cards) writeFileSync(join(outDir, file), JSON.stringify(card, null, 2) + '\n');
mkdirSync(join(outDir, 'campaigns'), { recursive: true });
writeFileSync(join(outDir, 'campaigns', 'openclaw-hermes.json'), JSON.stringify(manifest, null, 2) + '\n');
// A hosted build is public-fiction-only. The personal History gallery stays
// empty, while the main page offers the campaign CTA directly.
writeFileSync(join(outDir, 'index.json'), '[]\n');
console.error(`wrote ${manifest.entries.length} fictional campaign cards to ${outDir}`);
});
