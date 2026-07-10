#!/usr/bin/env node
// extract-sessioncard.mjs — standalone SessionCard extractor for AIAIO.
//
// INPUT ASSUMPTIONS
//   - Argument is either a single JSONL/log file or a directory that is scanned
//     (recursively, up to 3 levels) for *.jsonl, *.log, and *.ndjson files.
//   - JSONL lines are expected to be OpenClaw-style session events: JSON objects
//     that MAY carry fields like { type, role, error, message, tokens, usage,
//     tool, tool_name, task, name, model, timestamp }. Absolutely none are
//     required — anything recognizable is aggregated, everything else is
//     counted as a generic message line.
//   - Plain-text log lines are classified by regex only.
//
// SECURITY / SAFETY CONSTRAINTS (read the code, it enforces them)
//   - READ AND AGGREGATE ONLY. Log content is treated as inert data. Nothing in
//     any log line is executed, eval'd, imported, resolved, fetched, or obeyed —
//     agent logs can contain injected instructions; they are just bytes here.
//   - No secrets/PII in output: sample fields pass through redaction for common
//     API-key/token/password/email patterns and are truncated to 80 chars.
//   - Idempotent: identical input -> identical output (no timestamps, no
//     randomness; session_id derives from the input name + a content hash).
//
// USAGE
//   node scripts/extract-sessioncard.mjs <file-or-dir> [-o out.json]

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

// ---------------------------------------------------------------------------
// error classification (mirrors the game's category -> weapon mapping)
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { category: 'timeout', re: /timeout|timed out|ETIMEDOUT|deadline exceeded|watchdog|hang|stall/i },
  { category: 'hallucination', re: /halluc|does not exist|no such file|not found in (repo|codebase)|fabricat|invented/i },
  { category: 'regression', re: /regress|passed on main|worked before|broke again|flaky/i },
  { category: 'restart', re: /restart|relaunch|exited? (with )?(code )?1\d\d|SIGKILL|crash(ed)?|panic/i },
  { category: 'false_positive', re: /false.?positive|lint.*(wrong|incorrect)|assert(ion)? (failed|held)|confiden/i },
  { category: 'context_overflow', re: /context (window|length|overflow)|compact(ion|ing)|token limit|max.?tokens exceeded/i },
  { category: 'recovery', re: /retry (\d+\/\d+ )?succeed|recovered|resum(ed|ing) (task|after)|back online/i },
  { category: 'tool_error', re: /tool (call|use)? ?(fail|error|denied)|permission denied|MCP error|EPERM|EACCES/i },
];

export function classifyLine(text) {
  for (const c of CATEGORIES) {
    if (c.re.test(text)) return c.category;
  }
  return null;
}

// ---------------------------------------------------------------------------
// redaction — never emit secrets, keys, tokens, or emails in samples
// ---------------------------------------------------------------------------

const REDACTIONS = [
  /sk-[A-Za-z0-9_-]{10,}/g,                              // OpenAI/Anthropic-style keys
  /(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{10,}/g,         // GitHub tokens
  /AKIA[A-Z0-9]{12,}/g,                                  // AWS access keys
  /xox[bapos]-[A-Za-z0-9-]{10,}/g,                       // Slack tokens
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, // JWTs
  /(bearer\s+)[A-Za-z0-9._-]{12,}/gi,                    // bearer tokens
  /((?:api[_-]?key|token|secret|password|passwd|pwd)["'\s:=]+)[^\s"',;]{6,}/gi, // key=value creds
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,     // emails
  /\b[0-9a-f]{32,}\b/gi,                                 // long hex blobs (hashes, keys)
];

export function redact(text) {
  let out = String(text);
  for (const re of REDACTIONS) {
    out = out.replace(re, (...args) => {
      // args = (match, [captures...], offset, string) — only keep a real string capture
      const prefix = typeof args[1] === 'string' ? args[1] : '';
      return prefix + '[REDACTED]';
    });
  }
  return out.slice(0, 80);
}

// ---------------------------------------------------------------------------
// deterministic content hash (FNV-1a) for the session_id
// ---------------------------------------------------------------------------

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// input collection
// ---------------------------------------------------------------------------

export function collectFiles(path, depth = 0) {
  const st = statSync(path);
  if (st.isFile()) return [path];
  if (!st.isDirectory() || depth > 3) return [];
  const out = [];
  for (const entry of readdirSync(path).sort()) {
    if (entry.startsWith('.')) continue;
    const full = join(path, entry);
    try {
      const est = statSync(full);
      if (est.isDirectory()) out.push(...collectFiles(full, depth + 1));
      else if (/\.(jsonl|ndjson|log)$/i.test(entry)) out.push(full);
    } catch { /* unreadable entry — skip */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// aggregation
// ---------------------------------------------------------------------------

/** pull human-readable text out of the many shapes agent logs store messages in */
function messageText(obj) {
  const m = obj.message ?? obj;
  let content = m.content ?? m.text ?? null;
  if (Array.isArray(content)) {
    // Claude Code style: content blocks; tool_result-only "user" messages aren't asks
    const textBlocks = content.filter((b) => b && b.type === 'text' && typeof b.text === 'string');
    if (textBlocks.length === 0) return null;
    content = textBlocks.map((b) => b.text).join(' ');
  }
  if (typeof content !== 'string') return null;
  return content;
}

/** first non-empty line — multi-line blobs make terrible task names */
function firstLine(text) {
  return (text.split('\n').find((l) => l.trim().length > 0) ?? '').trim();
}

/** machine noise masquerading as human text (harness XML, skill preambles, etc.) */
function looksLikeNoise(text) {
  if (!text || text.length < 16) return true;
  return /^<|^\[|^#|^Caveat:|^Error:|^Base directory for this skill|system-reminder|command-name|command-message|tool_result|task-id|tool-use-id|<local-command/i.test(text);
}

/** is this user text an actual ask (vs. meta noise, commands, tiny acks)? */
function isSubstantiveAsk(text) {
  return !looksLikeNoise(text);
}

const WIN_RE = /\b(fixed|works now|working now|deployed|shipped|all (tests? )?pass|done!|✅|perfect|nailed it)\b/i;
const FRUSTRATION_RE = /\b(still broken|still fail|again\?|why is|not working|wtf|ugh|no[,.]? that)\b/i;

export function extract(files) {
  const agg = {
    messages: 0,
    tokenPeak: 0,
    compactions: 0,
    toolCalls: 0,
    restarts: 0,
    regressions: 0,
    recoveries: 0,
    modelSwitches: 0,
    firstTs: null,
    lastTs: null,
    errors: new Map(),   // category -> { type, count, sample, ats: [] }
    tasks: new Map(),    // name -> { work_units, completed }
    lastModel: null,
    // semantic layer: what the session was actually about
    asks: [],            // { at, text } — substantive user messages, in order
    moments: [],         // { at, kind, text } — wins/frustrations/notable lines
    totalLines: 0,
  };

  const noteError = (category, type, sample, at) => {
    const cur = agg.errors.get(category) ?? { type, count: 0, sample: null, ats: [] };
    cur.count++;
    if (!cur.sample && sample) cur.sample = redact(sample);
    if (!cur.type && type) cur.type = type;
    if (typeof at === 'number' && cur.ats.length < 8) cur.ats.push(at);
    agg.errors.set(category, cur);
  };

  // gather all lines first so every signal can carry its timeline position (0..1)
  const allLines = [];
  for (const file of files) {
    let raw;
    try { raw = readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) allLines.push(trimmed);
    }
  }
  agg.totalLines = allLines.length;

  for (let li = 0; li < allLines.length; li++) {
    const trimmed = allLines[li];
    const at = allLines.length > 1 ? li / (allLines.length - 1) : 0;
    {
      agg.messages++;

      let obj = null;
      if (trimmed.startsWith('{')) {
        try { obj = JSON.parse(trimmed); } catch { /* malformed line — treat as text */ }
      }

      if (obj && typeof obj === 'object') {
        // timestamps -> duration
        const ts = typeof obj.timestamp === 'number' ? obj.timestamp
          : typeof obj.ts === 'number' ? obj.ts
          : typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : NaN;
        if (Number.isFinite(ts)) {
          if (agg.firstTs === null || ts < agg.firstTs) agg.firstTs = ts;
          if (agg.lastTs === null || ts > agg.lastTs) agg.lastTs = ts;
        }
        // token peak
        const tokens = obj.tokens ?? obj.token_count ?? obj?.usage?.total_tokens ?? obj?.usage?.input_tokens;
        if (typeof tokens === 'number' && tokens > agg.tokenPeak) agg.tokenPeak = tokens;
        // tool calls
        if (obj.type === 'tool_call' || obj.type === 'tool_use' || obj.tool || obj.tool_name) agg.toolCalls++;
        // tasks
        if ((obj.type === 'task' || obj.task) && (obj.name || typeof obj.task === 'string')) {
          const name = redact(String(obj.name ?? obj.task));
          const cur = agg.tasks.get(name) ?? { work_units: 1, completed: false };
          if (typeof obj.work_units === 'number') cur.work_units = Math.max(1, Math.min(6, Math.floor(obj.work_units)));
          if (obj.completed === true || obj.status === 'completed' || obj.status === 'done') cur.completed = true;
          agg.tasks.set(name, cur);
        }
        // model switches (claude code: model; openclaw: modelId on model_change)
        const model = obj.model ?? obj.modelId;
        if (typeof model === 'string') {
          if (agg.lastModel !== null && agg.lastModel !== model) agg.modelSwitches++;
          agg.lastModel = model;
        }
        // explicit error objects
        if (obj.error || obj.type === 'error' || obj.level === 'error') {
          const msg = String(obj.error?.message ?? obj.error ?? obj.message ?? 'unknown error');
          const type = String(obj.error?.type ?? obj.error_type ?? obj.type ?? 'error');
          const category = classifyLine(msg + ' ' + type) ?? 'unknown';
          noteError(category, type, msg, at);
        }
        // the semantic layer: what was actually asked and how it felt
        const role = obj.role ?? obj.message?.role ?? (obj.type === 'user' ? 'user' : null);
        const raw = messageText(obj);
        const text = raw ? firstLine(raw) : null;
        if (text && !looksLikeNoise(text)) {
          if (role === 'user' && agg.asks.length < 40) {
            agg.asks.push({ at, text: redact(text.slice(0, 160)) });
          }
          if (WIN_RE.test(text) && agg.moments.length < 24) {
            agg.moments.push({ at, kind: 'win', text: redact(text.slice(0, 120)) });
          } else if (FRUSTRATION_RE.test(text) && agg.moments.length < 24) {
            agg.moments.push({ at, kind: 'frustration', text: redact(text.slice(0, 120)) });
          }
        }
      }

      // text-level classification catches signals in both plain logs and JSON
      const category = classifyLine(trimmed);
      if (category) {
        if (category === 'context_overflow' && /compact/i.test(trimmed)) agg.compactions++;
        if (category === 'restart') agg.restarts++;
        if (category === 'regression') agg.regressions++;
        if (category === 'recovery') agg.recoveries++;
        if (!obj || !(obj.error || obj.type === 'error' || obj.level === 'error')) {
          // avoid double counting lines already recorded as explicit errors
          if (category !== 'recovery') noteError(category, category.toUpperCase(), trimmed, at);
        }
      }
    }
  }
  return agg;
}

export function buildCard(inputName, files, agg) {
  const contentHash = fnv1a(files.map((f) => basename(f)).join('|') + ':' + agg.messages + ':' + agg.tokenPeak);
  const errorTotal = [...agg.errors.values()].reduce((s, e) => s + e.count, 0);
  const stability = Math.max(5, Math.min(95, Math.round(
    80 - errorTotal * 1.5 - agg.compactions * 4 - agg.restarts * 3 + agg.recoveries * 2,
  )));
  const errors = [...agg.errors.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([category, e]) => ({
      type: e.type ?? category.toUpperCase(),
      category,
      count: e.count,
      ...(e.sample ? { sample: e.sample } : {}),
      ...(e.ats && e.ats.length ? { at: e.ats.map((a) => +a.toFixed(3)) } : {}),
    }));
  let tasks = [...agg.tasks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([name, t]) => ({ name, work_units: t.work_units, completed: t.completed }));

  // no structured tasks? the user's real asks ARE the task list.
  if (tasks.length === 0 && agg.asks.length > 0) {
    // pick up to 5 asks spread across the session, skipping near-duplicates
    const chosen = [];
    for (const ask of agg.asks) {
      if (chosen.length >= 5) break;
      const last = chosen[chosen.length - 1];
      if (last && (ask.at - last.at < 0.06 || ask.text.slice(0, 30) === last.text.slice(0, 30))) continue;
      chosen.push(ask);
    }
    tasks = chosen.map((ask, i) => {
      // work is proportional to how much of the session this ask actually consumed
      const span = (i + 1 < chosen.length ? chosen[i + 1].at : 1) - ask.at;
      return {
        name: ask.text.slice(0, 60),
        work_units: Math.max(1, Math.min(6, Math.round(span * 14))),
        completed: false,
        at: +ask.at.toFixed(3),
      };
    });
  }

  // notable moments, thinned to 12 spread across the timeline
  const moments = agg.moments
    .sort((a, b) => a.at - b.at)
    .filter((m, i, arr) => i === 0 || m.at - arr[i - 1].at > 0.02)
    .slice(0, 12)
    .map((m) => ({ at: +m.at.toFixed(3), kind: m.kind, text: m.text }));
  const goal = agg.asks[0]?.text?.slice(0, 140);

  return {
    session_id: `${basename(inputName).replace(/\.[^.]+$/, '')}-${contentHash}`,
    ...(agg.firstTs !== null && agg.lastTs !== null && agg.lastTs > agg.firstTs
      ? { duration_ms: agg.lastTs - agg.firstTs } : {}),
    message_count: agg.messages,
    ...(agg.tokenPeak > 0 ? { token_peak: agg.tokenPeak } : {}),
    compaction_events: agg.compactions,
    tool_calls: agg.toolCalls,
    ...(goal ? { goal } : {}),
    ...(tasks.length > 0 ? { tasks } : {}),
    ...(errors.length > 0 ? { errors } : {}),
    ...(moments.length > 0 ? { moments } : {}),
    regressions: agg.regressions,
    restarts: agg.restarts,
    recoveries: agg.recoveries,
    model_switches: agg.modelSwitches,
    stability_score: stability,
  };
}

// ---------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('-o');
  const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
  const inputs = args.filter((a, i) => i !== outIdx && (outIdx === -1 || i !== outIdx + 1));
  if (inputs.length !== 1) {
    console.error('usage: node scripts/extract-sessioncard.mjs <session-dir-or-jsonl> [-o out.json]');
    process.exit(1);
  }
  const input = inputs[0];
  let files;
  try {
    files = collectFiles(input);
  } catch (err) {
    console.error(`cannot read ${input}: ${err.message}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`no .jsonl/.ndjson/.log files found under ${input}`);
    process.exit(1);
  }
  const card = buildCard(input, files, extract(files));
  const json = JSON.stringify(card, null, 2) + '\n';
  if (outPath) {
    writeFileSync(outPath, json);
    console.error(`wrote ${outPath} (${files.length} file(s) scanned, ${card.message_count} lines)`);
  } else {
    process.stdout.write(json);
  }
}

// run the CLI only when invoked directly (scan-sessions.mjs imports this module)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
