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
import { join, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { extract, buildCard } from './extract-sessioncard.mjs';

const DEFAULT_ROOTS = [
  join(homedir(), '.claude', 'projects'),
  join(homedir(), '.openclaw'),
  join(homedir(), '.hermes'),
];
const SKIP_DIRS = new Set(['node_modules', '.git', 'cache', 'caches', 'audio_cache', 'bootstrap-cache', 'backups', 'dist', 'venv', '__pycache__', 'rescue', 'lcm-files', 'qmd']);
const MIN_BYTES = 2048;

/** Session ids gain a content hash as logs grow; campaign identity is the stable stem. */
export function sessionStem(sessionId) {
  return String(sessionId).replace(/-[0-9a-f]{8}(-2)*$/, '');
}

/**
 * Rescans are additive: a default capped scan updates the sessions it sees but
 * preserves the rest of the player's previously indexed history.
 */
export function mergeIndex(existing, updates) {
  const byStem = new Map();
  for (const entry of existing) {
    if (entry && typeof entry.session_id === 'string' && typeof entry.file === 'string') {
      byStem.set(sessionStem(entry.session_id), entry);
    }
  }
  for (const entry of updates) byStem.set(sessionStem(entry.session_id), entry);
  return [...byStem.values()].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function existingIndex(outDir) {
  const value = readJson(join(outDir, 'index.json'), []);
  return Array.isArray(value) ? value : [];
}

function existingSources() {
  const value = readJson(join(process.cwd(), 'qa-logs', 'sources.json'), {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function findJsonl(dir, depth = 0, out = [], tally = null) {
  if (depth > 6) return out;
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry.toLowerCase())) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) findJsonl(full, depth + 1, out, tally);
    else if (/\.jsonl$/i.test(entry)) {
      // trajectory files are runtime traces whose "timedOut":false fields
      // read as thousands of fake timeout errors
      if (/\.trajectory\.jsonl$/i.test(entry)) { if (tally) tally.trajectory++; }
      else if (st.size < MIN_BYTES) { if (tally) tally.tooSmall++; }
      else out.push({ path: full, mtime: st.mtimeMs, size: st.size });
    }
  }
  return out;
}

/**
 * Hermes keeps history in SQLite, not transcripts. Dump each session with
 * >= 10 messages to session-dumps/hermes/<id>.jsonl (idempotent; needs the
 * macOS-bundled sqlite3 CLI). Uses the live state db if present, else the
 * newest state snapshot.
 */
function dumpHermesSessions() {
  const outDir = join(process.cwd(), 'session-dumps', 'hermes');
  // newer Hermes keeps the live db at ~/.hermes/state.db; older at state/state.db
  const candidates = [
    join(homedir(), '.hermes', 'state.db'),
    join(homedir(), '.hermes', 'state', 'state.db'),
  ];
  try {
    const snapRoot = join(homedir(), '.hermes', 'state-snapshots');
    for (const d of readdirSync(snapRoot).sort().reverse().slice(0, 1)) {
      candidates.push(join(snapRoot, d, 'state.db'));
    }
  } catch { /* no snapshots */ }
  const db = candidates.find((p) => existsSync(p));
  if (!db) return null;
  const probe = spawnSync('sqlite3', [db, "SELECT name FROM sqlite_master WHERE name='messages'"], { encoding: 'utf8' });
  if (probe.error || !probe.stdout.includes('messages')) return null;
  mkdirSync(outDir, { recursive: true });
  const list = spawnSync('sqlite3', [db, 'SELECT session_id, COUNT(*) FROM messages GROUP BY session_id HAVING COUNT(*) >= 10'], { encoding: 'utf8' });
  if (list.error) return null;
  const sessions = list.stdout.trim().split('\n').filter(Boolean).map((l) => l.split('|')[0]);
  let dumped = 0;
  for (const sid of sessions) {
    const safe = sid.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
    const dest = join(outDir, `${safe}.jsonl`);
    if (existsSync(dest)) continue; // idempotent — old dumps stay stable
    const rows = spawnSync('sqlite3', ['-json', db,
      `SELECT role, content, tool_name, timestamp FROM messages WHERE session_id='${sid.replace(/'/g, "''")}' ORDER BY timestamp`,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (rows.error || !rows.stdout.trim()) continue;
    try {
      const msgs = JSON.parse(rows.stdout);
      const lines = msgs.map((m) => JSON.stringify({
        role: m.role,
        content: typeof m.content === 'string' ? m.content.slice(0, 4000) : m.content,
        ...(m.tool_name ? { tool_name: m.tool_name } : {}),
        timestamp: new Date(m.timestamp < 1e12 ? m.timestamp * 1000 : m.timestamp).toISOString(),
      }));
      writeFileSync(dest, lines.join('\n') + '\n');
      dumped++;
    } catch { /* malformed rows — skip session */ }
  }
  console.error(`hermes db: ${sessions.length} sessions with >=10 messages (${dumped} newly dumped) -> session-dumps/hermes/`);
  return outDir;
}

function main() {
  const args = process.argv.slice(2);
  // flags: --all (no per-root cap — the full nostalgia archive) · --max N
  //        --doctor (print the filter accounting: what was found, what was
  //        skipped and why — the first thing to run when the vault is empty)
  const all = args.includes('--all');
  const doctor = args.includes('--doctor');
  const maxIdx = args.indexOf('--max');
  const maxPerRoot = all ? Infinity : maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) || 12 : 12;
  const rootArgs = args.filter((a, i) => !a.startsWith('--') && i !== maxIdx + 1);
  const wantedRoots = rootArgs.length > 0 ? rootArgs : DEFAULT_ROOTS;
  const missingRoots = wantedRoots.filter((r) => !existsSync(r));
  const roots = wantedRoots.filter((r) => existsSync(r));
  if (roots.length === 0) {
    console.error('no session roots found. checked:');
    for (const r of wantedRoots) console.error(`  ✗ ${r} (does not exist)`);
    console.error('pass one explicitly: npm run scan -- /path/to/logs');
    process.exit(1);
  }
  const report = []; // per-root accounting for --doctor / empty-vault diagnosis
  // Hermes lives in SQLite — dump to jsonl first, then scan the dumps
  const hermesDump = dumpHermesSessions();
  if (hermesDump && !roots.includes(hermesDump)) roots.push(hermesDump);

  const outDir = join(process.cwd(), 'public', 'cards');
  mkdirSync(outDir, { recursive: true });

  const priorIndex = existingIndex(outDir);
  const freshIndex = [];
  // Preserve old mappings too: a capped rescan must not turn a retained card
  // into an orphaned dev-mode enrichment target.
  const sources = existingSources(); // card file -> absolute source log path (for auto-enrich)
  const usedNames = new Set();
  const seenBasenames = new Set(); // sessions get copied around — scan each once
  for (const root of roots) {
    const harness = /session-dumps\/hermes|\.hermes/.test(root) ? 'hermes'
      : /\.claude/.test(root) ? 'claude code'
      : /\.openclaw/.test(root) ? 'openclaw' : 'unknown harness';
    const tally = { trajectory: 0, tooSmall: 0, dedup: 0, stub: 0, cron: 0, noTasks: 0, failed: 0, kept: 0 };
    const allFiles = findJsonl(root, 0, [], tally)
      .filter((f) => {
        const base = basename(f.path);
        if (seenBasenames.has(base)) { tally.dedup++; return false; }
        seenBasenames.add(base);
        return true;
      })
      .sort((a, b) => b.mtime - a.mtime);
    const files = Number.isFinite(maxPerRoot) ? allFiles.slice(0, maxPerRoot) : allFiles;
    tally.capped = allFiles.length - files.length;
    report.push({ root, harness, tally });
    console.error(`${root}: ${files.length} session file(s)${all ? ' (full archive)' : ' (most recent)'}`);
    let processed = 0;
    for (const f of files) {
      processed++;
      if (all && processed % 100 === 0) console.error(`  …${processed}/${files.length}`);
      try {
        const card = buildCard(f.path, [f.path], extract([f.path]));
        // provenance for the Observer's memory-lane roast
        card.harness = harness;
        card.when = new Date(f.mtime).toISOString().slice(0, 10);
        if ((card.message_count ?? 0) < 10) { tally.stub++; continue; } // trivial stubs
        // QUALITY GATE (Brad's call): only sessions with REAL extractable human
        // work become levels. Cron/heartbeat/machine runs and ask-less sessions
        // are excluded entirely — the game never fakes personalization.
        if (/^(cron_|routine|routing-eval|heartbeat|request_dump|healthcheck)/i.test(basename(f.path))) { tally.cron++; continue; }
        if (!card.tasks || card.tasks.length === 0) { tally.noTasks++; continue; }
        tally.kept++;
        let slug = card.session_id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60);
        while (usedNames.has(slug)) slug += '-2';
        usedNames.add(slug);
        let file = `${slug}.json`;
        writeFileSync(join(outDir, file), JSON.stringify(card, null, 2) + '\n');
        sources[file] = f.path;
        // if this session has been agent-enriched (see docs/ENRICH.md), the gallery
        // gets that version — matched by session stem, since the content hash
        // suffix changes whenever the log grows
        const stem = slug.replace(/-[0-9a-f]{8}(-2)*$/, '');
        const enriched = readdirSync(outDir)
          .filter((f) => f.startsWith(stem) && f.endsWith('.enriched.json'))
          .sort()
          .pop();
        if (enriched) file = enriched;
        // real threat estimate: mirrors the ramped global budget in
        // src/enemies.ts allocateSpawns() — keep the curve in sync
        const errTotal = (card.errors ?? []).reduce((s, e) => s + Math.max(1, e.count ?? 1), 0);
        const enemies = errTotal === 0 ? 0
          : Math.max(4, Math.min(30, Math.round(4 + 4.5 * Math.log2(1 + errTotal / 6))));
        freshIndex.push({
          file,
          session_id: card.session_id,
          harness,
          when: card.when,
          errors: (card.errors ?? []).reduce((s, e) => s + (e.count ?? 1), 0),
          enemies,
          tasks: card.tasks?.length ?? 0,
          stability: card.stability_score ?? null,
          messages: card.message_count ?? 0,
          mtime: Math.round(f.mtime),
          // difficulty inputs (see src/levels.ts) — raw so the formula stays tunable
          token_peak: card.token_peak ?? null,
          compactions: card.compaction_events ?? 0,
          work: (card.tasks ?? []).reduce((s, t) => s + (t.work_units ?? 2), 0),
        });
      } catch (err) {
        tally.failed++;
        console.error(`  skip ${basename(f.path)}: ${err.message}`);
      }
    }
  }
  const index = mergeIndex(priorIndex, freshIndex);
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  // card-file -> source-log mapping for dev-mode auto-enrichment (gitignored;
  // absolute paths never go into shareable cards)
  try {
    mkdirSync(join(process.cwd(), 'qa-logs'), { recursive: true });
    writeFileSync(join(process.cwd(), 'qa-logs', 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
  } catch { /* best effort */ }
  console.error(`\nwrote ${index.length} card(s) + index.json to public/cards/`);
  console.error('NOTE: cards now include short REDACTED snippets of your actual prompts');
  console.error('(tasks/goal/moments) — skim public/cards/*.json before sharing any of them.');
  console.error('start the game (npm run dev) and your sessions appear in the menu gallery.');

  // the accounting: always shown with --doctor, and whenever the scan came up
  // empty (an empty vault should never be a mystery)
  if (doctor || index.length === 0) {
    console.error('\n── scan doctor ─────────────────────────────────────────');
    for (const r of missingRoots) console.error(`✗ ${r}: does not exist (harness not installed, or logs live elsewhere)`);
    if (!hermesDump && existsSync(join(homedir(), '.hermes'))) {
      console.error('✗ hermes SQLite history: no readable state.db (or the sqlite3 CLI is missing)');
    }
    for (const { root, harness, tally } of report) {
      console.error(`✔ ${root} (${harness})`);
      console.error(`    kept ${tally.kept} · stubs(<10 msgs) ${tally.stub} · cron/machine ${tally.cron} · no-extractable-tasks ${tally.noTasks}`);
      console.error(`    dedup ${tally.dedup} · too-small(<${MIN_BYTES}B) ${tally.tooSmall} · trajectory-excluded ${tally.trajectory} · parse-failed ${tally.failed}${tally.capped ? ` · beyond --max cap ${tally.capped}` : ''}`);
    }
    if (index.length === 0) {
      console.error('\nvault is empty. the usual causes, in order:');
      console.error('  1. everything got capped: try  npm run scan -- --all');
      console.error('  2. sessions are stubs/cron/ask-less: only sessions with real extractable');
      console.error('     human work become levels (the game never fakes personalization)');
      console.error('  3. logs live somewhere unusual: npm run scan -- /path/to/logs');
      console.error('  4. hermes: history is in SQLite; the sqlite3 CLI must be on PATH');
      console.error('ask your agent to debug this — AGENTS.md has the playbook.');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
