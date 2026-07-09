# AIAIO — Agents In Amnesia, Insane Ordnance

*Scorched Earth × Inner Space × AI-agent session.*

You are an AI agent with a task list. So is your rival. Errors, context pressure,
memory loss, and incoming ordnance keep derailing you. **Win by clearing your task
queue first, or by crashing the other agent's process (HP → 0).** Every token you
spend fighting is a token you didn't spend working.

## Run the game

```bash
npm install
npm run dev        # dev server (Vite), open the printed URL
npm run build      # static bundle in dist/ (tsc typecheck + vite build)
npm run preview    # serve the built bundle
```

No network calls anywhere; fully playable offline.

## How to play

From the menu:
- **PLAYER vs CPU** — you against a competent AI rival.
- **HOTSEAT PvP** — two players, one keyboard, alternating turns.
- **LOAD EXAMPLES** — pre-loads two inline SessionCards: a clean/stable agent vs a
  chaotic/broken one (also on disk in `examples/`).
- Drop a **SessionCard `.json`** on either agent slot (or click to browse) to play
  as/against a real session. One card, two cards, or none — everything works.

A **Session Briefing** precedes each match: stability, the generated loadout with
the real log line each weapon came from, task queue, context budget, and any
handicap grants. After the match, the recap cites the card's real numbers.

### Controls

| Key | Action |
|---|---|
| ← / → | adjust barrel angle |
| ↑ / ↓ | adjust power |
| **Space** | FIRE (combat action — ends turn) |
| **W** | WORK the current task (safe, advances your queue, skips your shot — ends turn) |
| **U** | install an offered ⬆ UPDATE (risk roll — ends turn) |
| 1–9 or [ / ] | select weapon |
| A / D | move along the terrain (costs tokens + limited steps, doesn't end turn) |

### The systems

- **Task queue** — each agent has 3–5 tasks needing N work turns. Both queues are
  visible in the HUD: it's a race. Working is safe-looking but you don't shoot.
- **Context meter** — every action costs tokens (firing > working > moving). Cross
  your compaction threshold (red tick on the meter) and **⚡ COMPACTION** fires: a
  glitchy amnesia event — shield lost, aim solution discarded, weapon cooldowns
  wiped, and your task progress rewinds or you forget which task you were on. The
  banner "summarizes" what was lost, badly.
- **Update gamble** — "⬆ UPDATE AVAILABLE" appears at random. Spend your turn to
  install: a risk roll that buffs or nerfs aim, damage, token costs, compaction
  threshold, or shield — or unlocks a chaos weapon — announced as patch notes.
  Leaders should avoid it; the player who's behind gambles.
- **Struggle handicap** — the lower-stability agent starts with compensating buffs
  (extra tokens, underdog damage, or a free chaos weapon) with a one-line "why"
  quoting real card numbers. Whoever is behind on HP+tasks holds a live comeback
  buff (shown center-HUD). **Hardening** (prompt-injection-resistance-as-a-stat)
  passively reduces Hallucination Missile drift/damage and Distraction wipes —
  flavor only, no real injection or steganography anywhere.

### Weapons (error-log arsenal)

| Weapon | Behavior | Cost |
|---|---|---|
| ⏱ Timeout Mortar | lands, waits out its fuse, THEN explodes; big splash | cheap |
| 👻 Hallucination Missile | drifts mid-flight, lands confidently offset | medium |
| ☢ Regression Cluster Bomb | splits into 3–5 bomblets on impact | medium |
| 🔁 Restart Thrash Cannon | burst of 3 shots, random spread | medium |
| ⚡ False Positive Laser | instant hitscan, randomized accuracy, cooldown | expensive |
| 💥 Context Window Nuke | huge blast + floods BOTH context meters | very expensive |
| 🛡 Recovery Shield | converts your last 2 turns of damage taken into shield | support |
| 📣 Distraction Barrage | no HP damage — wipes target's task progress + derails them | task attack |
| ❓ Unknown Error | uncategorized log data; rolls a random personality per shot | wildcard |

## SessionCard schema

All fields optional; missing data degrades gracefully. Also viewable/copyable
in-game via **"SessionCard format"** on the menu.

```jsonc
{
  "session_id": "string",      // seeds the whole match — same card, same match
  "duration_ms": 0,
  "message_count": 0,
  "token_peak": 0,
  "compaction_events": 0,
  "tool_calls": 0,
  "tasks": [{ "name": "", "work_units": 1, "completed": false }],
  "errors": [{ "type": "", "category": "timeout", "count": 1, "sample": "" }],
  "regressions": 0,
  "restarts": 0,
  "recoveries": 0,
  "model_switches": 0,
  "stability_score": 50        // 0-100, higher = more stable
}
```

## Log-signal → game-effect mapping (deterministic)

Same card in → same match out; everything is seeded from `session_id`.

| Card signal | Game effect |
|---|---|
| `errors[].category` | weapon archetype — timeout→Mortar; hallucination/injection→Missile; regression/flaky→Cluster; restart/crash→Thrash Cannon; false_positive/assert→Laser; context/token/oom→Nuke; recovery/retry-ok→Shield; tool/interrupt/denied→Distraction; anything else→Unknown Error |
| `errors[].count` | that weapon's ammo (`1+√count`, cap 12) + damage stat roll (up to ×1.35) |
| `errors[].sample` | the weapon's tooltip provenance line, shown in briefing + HUD |
| `tasks[]` (`tool_calls` fallback) | the in-game task queue — names + work units (synthesized from tool_calls when absent) |
| `session_id` + `message_count` | terrain seed; more messages → wider (1400–3000px), jaggeder arena |
| `token_peak` | context budget (`peak/12`, clamped 6k–20k) |
| `compaction_events` | compaction threshold `0.85 − 0.03×events` (floor 0.60) — real amnesia history makes in-game amnesia fire earlier |
| `restarts` | update offer frequency (`0.15 + 0.03×restarts`, cap 0.45/turn) and riskier update table |
| `model_switches` | friendlier update table (this agent is used to change) |
| `stability_score` | starting handicap for the weaker side (extra tokens / underdog damage / free chaos weapon) + hardening stat; the "why you got this" line quotes the real numbers |
| `regressions` / `recoveries` / `tool_calls` | bonus ammo for Cluster / Shield / Distraction respectively |
| card totals | end-match recap cites top error type, real vs in-game compactions, and which tasks the real agent finished vs forgot |

## The extractor

Turn a real OpenClaw-style session directory or JSONL file into a SessionCard:

```bash
node scripts/extract-sessioncard.mjs ~/.openclaw/sessions/<session-dir> -o mycard.json
npm run extract -- path/to/session.jsonl        # print to stdout
```

- Scans `*.jsonl` / `*.ndjson` / `*.log` (dirs recursed 3 levels), skips
  malformed lines, aggregates errors/tasks/tokens/tool-calls/model-switches.
- **Read-and-aggregate only** — log content is inert data; nothing found in a log
  is ever executed, eval'd, or followed (agent logs can contain injected
  instructions).
- **Redacts** API keys, tokens, JWTs, credentials, emails, and long hex blobs from
  `sample` fields; samples truncated to 80 chars.
- **Idempotent**: identical input → byte-identical output (session_id = input name
  + content hash; no timestamps or randomness).

## Simplifications (vs. the design docs)

- **Prompt injection** is a plain "hardening" stat, per the docs' own safety
  constraint — no real probes, steganography, or hidden instructions.
- **Scouting** isn't a separate action (the arena is fully visible); token economy
  covers move/work/fire/update instead.
- Restart Thrash Cannon fires its 3-shot burst simultaneously with spread rather
  than as sequential turns.
- The Context Window Nuke "dumps" context by **flooding** both meters toward
  compaction (the more dramatic reading).
- Compaction rewinds the player's remembered state (aim, shield, cooldowns, task
  progress/focus), not the terrain or global match state.
- Updates are per-player offers rather than global events; an offer lasts 2 turns.

## Repo layout

```
src/main.ts      screens, input, frame loop, CPU driver
src/game.ts      match state + turn orchestration
src/terrain.ts   per-pixel destructible terrain (mask + canvas)
src/physics.ts   projectile integration, wind, hitscan, AI shot simulation
src/weapons.ts   the 9 error-log weapon archetypes
src/tasks.ts     task queue, work, amnesia, distraction
src/context.ts   token meter, compaction, garbled-text generator
src/updates.ts   update gamble + patch-note table
src/handicap.ts  stability buffs + live comeback
src/session.ts   SessionCard schema, deterministic mapping, examples
src/ai.ts        CPU opponent
src/ui.ts        canvas renderer + DOM HUD/briefing/recap
scripts/extract-sessioncard.mjs   standalone extractor
examples/        droppable example cards (same two as the inline ones)
```
