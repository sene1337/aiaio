#!/usr/bin/env node
// scan-sessions.mjs — "where do I find a JSON?" answered: you don't, this does.
//
// Auto-discovers agent session logs in the usual places, builds a SessionCard
// for each recent session, and writes them into public/cards/ where the game's
// menu lists them as a pickable gallery.
//
// Default roots scanned (only those that exist; add your own as arguments):
//   ~/.claude/projects      (Claude Code transcripts, one .jsonl per session)
//   ~/.openclaw             (OpenClaw workspace/session logs)
//   ~/.hermes               (Hermes agent OS logs)
//
// USAGE
//   npm run scan                 # scan default roots
//   npm run scan -- ~/my/logs    # scan custom root(s) instead
//
// Same safety posture as the extractor (which this imports):
//   - read + aggregate only; log content is inert data, never executed/followed
//   - samples are redacted (keys/tokens/emails/hex) and truncated to 80 chars
//   - deterministic per input file
// Cards contain short redacted sample strings from your logs — skim
// public/cards/*.json before sharing them with anyone.

import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { extract, buildCard } from './extract-sessioncard.mjs';

const DEFAULT_ROOTS = [
  join(homedir(), '.claude', 'projects'),
  join(homedir(), '.openclaw'),
  join(homedir(), '.hermes'),
];
const SKIP_DIRS = new Set(['node_modules', '.git', 'cache', 'caches', 'audio_cache', 'bootstrap-cache', 'backups', 'dist', 'venv', '__pycache__']);
const MAX_PER_ROOT = 12;
const MIN_BYTES = 2048;

function findJsonl(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry.toLowerCase())) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) findJsonl(full, depth + 1, out);
    else if (/\.jsonl$/i.test(entry) && st.size >= MIN_BYTES) out.push({ path: full, mtime: st.mtimeMs, size: st.size });
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const roots = (args.length > 0 ? args : DEFAULT_ROOTS).filter((r) => existsSync(r));
  if (roots.length === 0) {
    console.error('no session roots found. pass one explicitly: npm run scan -- /path/to/logs');
    process.exit(1);
  }
  const outDir = join(process.cwd(), 'public', 'cards');
  mkdirSync(outDir, { recursive: true });

  const index = [];
  const usedNames = new Set();
  for (const root of roots) {
    const files = findJsonl(root).sort((a, b) => b.mtime - a.mtime).slice(0, MAX_PER_ROOT);
    console.error(`${root}: ${files.length} recent session file(s)`);
    for (const f of files) {
      try {
        const card = buildCard(f.path, [f.path], extract([f.path]));
        if ((card.message_count ?? 0) < 10) continue; // skip trivial stubs
        let slug = card.session_id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60);
        while (usedNames.has(slug)) slug += '-2';
        usedNames.add(slug);
        const file = `${slug}.json`;
        writeFileSync(join(outDir, file), JSON.stringify(card, null, 2) + '\n');
        index.push({
          file,
          session_id: card.session_id,
          errors: (card.errors ?? []).reduce((s, e) => s + (e.count ?? 1), 0),
          tasks: card.tasks?.length ?? 0,
          stability: card.stability_score ?? null,
          messages: card.message_count ?? 0,
          mtime: Math.round(f.mtime),
        });
      } catch (err) {
        console.error(`  skip ${basename(f.path)}: ${err.message}`);
      }
    }
  }
  index.sort((a, b) => b.mtime - a.mtime);
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.error(`\nwrote ${index.length} card(s) + index.json to public/cards/`);
  console.error('cards contain short REDACTED log samples — skim them before sharing.');
  console.error('start the game (npm run dev) and your sessions appear in the menu gallery.');
}

main();
