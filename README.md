# AIAIO — Agents In Amnesia, Insane Ordnance

*Operation: Inner Space × your agent's actual session log.*

**Your real session is the level.** Its timeline is the terrain you traverse. Your
real errors spawn as monsters at the points where they actually happened. Your real
tasks sit in the world as work stations. And behind you, always, the **WALL OF
FORGETTING** — context pressure made spatial — advances, eating terrain, tasks, and
eventually you.

Reach `process exit 0` alive. Clear your task queue on the way for a perfect run.
Every token you spend fighting is distance the wall gains.

## Run it

```bash
npm install
npm run scan     # optional: auto-build levels from YOUR sessions (see below)
npm run dev      # open the printed URL
npm run build    # static bundle in dist/
```

No network calls; fully playable offline with zero setup (two inline example
sessions + random generation).

## Play

- **←/→** move · **↑** jump · **space** fire (toward facing)
- **W (hold)** work the task at a station — you're rooted and **heads-down**
  (+25% damage taken) while working. Working is how you win; working is when
  you're weakest.
- **U** install an update at a ⬆ crate (risk roll: patch-note buffs OR nerfs)
- **[ ] / 1-9** switch weapons — slot 1 is the **∞ print-debug zapper**
  (you can never run out of print statements; you can never win with them alone)
- **M** mute — all audio is synthesized WebAudio (chip/glitch, zero assets):
  compaction is a stuttering descent into static, the wall has a heartbeat when
  it's close, tasks chime when they ship.

### The systems

- **The wall of forgetting** — creeps rightward always; speeds up with your
  context pressure, near living `overflow-emitter`s, and rubber-bands if you
  sprint too far ahead. Tasks it passes are *forgotten* (garbled, unrecoverable
  this run). Standing inside it drains you. **Compaction** (crossing your context
  threshold) makes it *leap* — plus the usual amnesia: shield gone, task progress
  rewound, and from your 3rd compaction even *completed* tasks can un-ship.
- **Context economy** — firing and working cost tokens. The meter is literally
  distance: pressure = wall speed. The context-window-nuke erases half a screen
  of errors and floods a quarter of your own meter. Choose violence carefully.
- **Handicap** — low-stability sessions (yours was rough) grant starting shield
  and a damage bonus, with the "why" quoting your real numbers.

### The bestiary (spawned from your error log)

| Your error category | Becomes | Behavior |
|---|---|---|
| timeout | ⏱ timeout-blob | tanky lobber; shots detonate late |
| hallucination | 👻 hallucination-ghost | phases, teleports, is sure it exists; your `hardening` resists its touch |
| regression | ☢ regression-splitter | splits into two minis on death |
| restart / crash | 🔁 restart-crawler | relaunches itself once after dying |
| false_positive | ⚡ false-positive-sniper | telegraphed laser, 100% confidence, ~70% accuracy |
| tool_error | 🔧 tool-turret | interrupt bolts; hit while working = lose task progress |
| context_overflow | 📈 overflow-emitter | **priority target**: accelerates the wall while alive |
| recovery | ➕ recovery-sprite | *friendly* — touch for hp/shield |

Enemy count per category scales `√count` (max 5). Weapon ammo scales the same way
from the same log — your worst error category is both your biggest threat and your
deepest magazine.

## `npm run scan` — your sessions become levels

Auto-discovers agent session logs (`~/.claude/projects`, `~/.openclaw`,
`~/.hermes`, or any root you pass), builds a SessionCard per recent session, and
writes them to `public/cards/` — they appear as a pickable **gallery in the game
menu**. No JSON hunting.

- Read-and-aggregate only; log content is inert data, never executed or followed.
- Samples are redacted (API keys, tokens, JWTs, credentials, emails, hex blobs)
  and truncated to 80 chars — but **skim `public/cards/*.json` before sharing**.
- `public/cards/` is gitignored: your session data never lands in the repo.

You can also drop any SessionCard `.json` on the menu, or build one by hand:
`node scripts/extract-sessioncard.mjs <dir-or-jsonl> -o card.json`.

## QA telemetry (dev mode)

Playing via `npm run dev` records gameplay telemetry to `qa-logs/*.jsonl`
(gitignored): every fire/work/damage/compaction/death event, first-use timing per
control, and a snapshot every 2s (position, vitals, wall gap, selected weapon).
It's for analyzing how the game is actually learned and played — balance from
evidence, not vibes. The events POST to a dev-server-only endpoint on localhost;
**production builds have no endpoint and no network calls** — telemetry falls
back to a localStorage ring buffer (`localStorage.getItem('aiaio-qa')`).

## SessionCard schema

All fields optional; missing data degrades gracefully. Copyable in-game via
**/schema**.

```jsonc
{
  "session_id": "string",      // seeds everything — same card, same level
  "duration_ms": 0,
  "message_count": 0,          // -> level length + jaggedness
  "token_peak": 0,             // -> context budget
  "compaction_events": 0,      // -> compaction threshold (more -> earlier amnesia)
  "tool_calls": 0,             // -> task synthesis fallback + distraction ammo
  "tasks": [{ "name": "", "work_units": 1, "completed": false }],
  "errors": [{ "type": "", "category": "timeout", "count": 1, "sample": "" }],
  "regressions": 0,            // -> cluster-bomb ammo
  "restarts": 0,               // -> update crates + riskier update table
  "recoveries": 0,             // -> friendly recovery sprites + shield ammo
  "model_switches": 0,         // -> update crates + friendlier update table
  "stability_score": 50        // 0-100 -> handicap shield/damage
}
```

## Log-signal → level mapping (deterministic)

| Card signal | Level effect |
|---|---|
| `session_id` | seeds terrain, spawn positions, every roll — same card, same level |
| `message_count` | level length (2400–6000px) + terrain jaggedness |
| `errors[].category` / `count` | which monsters spawn and how many (`√count`, cap 5), placed along the timeline; also weapon archetypes + ammo |
| `errors[].sample` | quoted in the briefing roster and weapon tooltips |
| `tasks[]` | work stations along the timeline (synthesized from `tool_calls` when absent) |
| `token_peak` | context budget (`peak/12`, clamp 6k–20k) |
| `compaction_events` | compaction threshold `0.85 − 0.03×events` — a compaction-heavy history compacts earlier in-game |
| `restarts` + `model_switches` | number of ⬆ update crates + update risk skew |
| `recoveries` | friendly recovery sprites |
| `stability_score` | handicap: below 45 → starting shield + damage multiplier, why-line quotes the number |
| card totals | end-run recap: your top error, real vs in-game compactions, real vs your task completion |

## Repo layout

```
src/main.ts      menu (card drop + scanned gallery), input, frame loop
src/run.ts       the session run: avatar, wall of forgetting, stations, economy
src/enemies.ts   the bestiary — error categories as creatures
src/terrain.ts   per-pixel destructible terrain (seeded from the card)
src/physics.ts   projectile integration
src/weapons.ts   error-log weapon archetypes (+ ∞ debug zapper)
src/tasks.ts     task queue, work, amnesia
src/context.ts   token meter, compaction, garbled-text generator
src/updates.ts   update gamble + patch-note table
src/session.ts   SessionCard schema, deterministic mapping, examples
src/ui.ts        canvas renderer + TUI HUD (Claude Code / Hermes styling)
scripts/scan-sessions.mjs        auto-discover sessions -> menu gallery
scripts/extract-sessioncard.mjs  one dir/file -> one SessionCard (CLI + library)
examples/        two droppable example cards (clean + chaotic)
```

## Design lineage & simplifications

- Core concept: **Operation: Inner Space** (1994) — a game world built from your
  own machine — crossed with agent-session mechanics (context, compaction,
  updates, tasks) from the AIAIO design docs. v1 was a Scorched Earth-style
  artillery duel; it was retired for being derivative — the session data deserved
  to be the visible world, not difficulty sliders.
- Prompt injection appears only as the `hardening` stat (resists ghost touch) —
  no real injection or steganography anywhere, per the design docs' constraint.
- Errors lack timestamps in the card schema, so spawn positions along the
  timeline are seeded-random rather than time-accurate.
- The distraction-barrage is repurposed solo: it stuns your errors ("quick
  question—" works on everyone).
```
