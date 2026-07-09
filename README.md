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

- **←/→** move · **↑** jump · **↓** fast-fall (explore drilled craters) · **space** fire (toward facing)
- **W (hold)** work the task at a station — you're rooted and **heads-down**
  (+25% damage taken) while working. Working is how you win; working is when
  you're weakest.
- **U** open a ⬆ crate's command menu (choose with 1/2/3), or install a ◈ model
  upgrade · **C** run `/compact`
- **[ ] / 1-9** switch weapons — slot 1 is the **∞ print-debug zapper**
  (you can never run out of print statements; you can never win with them alone)
- **S** spawn a **subagent** (900tk + ~16tk/s upkeep — inference isn't free, and
  the drip literally speeds up the wall). Lower-model: weak zaps, cap 2, loyal…
  until a hallucination-ghost touches one or it falls into the wall — then it's
  **corrupted**: red, garbled, and shooting at YOU. Terminate it or outrun it
  (rogues OOM-kill themselves after ~18s).
- **M** mute — all audio is synthesized WebAudio (chip/glitch, zero assets):
  compaction is a stuttering descent into static, the wall has a heartbeat when
  it's close, tasks chime when they ship.

### The systems

- **The wall of forgetting is action-driven** — it does NOT creep on a timer.
  Every token you burn becomes wall distance (0.16px/token): firing, working,
  subagent upkeep, damage spew, even walking (reading the transcript is
  inference — 1tk/10px). Stand perfectly still and it stands still with you.
  Your token bill is the storm. `overflow-emitter`s spam tokens *into your
  meter* while you're near — which moves the wall, because everything does.
  Tasks it passes are *forgotten* (garbled, unrecoverable). It **eats subagents
  whole**; you it merely ruins: inside the zone you bleed 9hp/s and your weapons
  spray wildly — but you can dive in (unclaimed crates in there still work).
  **Involuntary compaction** (crossing your threshold) surges it 240px+ — plus
  amnesia: shield gone, progress rewound, and from your 3rd compaction even
  *completed* tasks can un-ship.
- **`/compact` (C)** — voluntary, anywhere, 20s cooldown: drains your meter
  *cleanly* — no surge, nothing forgotten — but the summarization pass costs
  250tk and roots you heads-down for a beat. Run it too close to the threshold
  and the pass itself tips you over. Compact early, compact often.
- **Context economy** — every token burned is wall distance; the meter itself is
  your countdown to the next involuntary compaction surge. The context-window-nuke
  erases half a screen of errors and floods a quarter of your own meter (~700px of
  wall). Choose violence carefully.
  **Getting hit injects error-spew into your context** (stack traces are long) —
  damage accelerates your own compaction.
- **Upgrades** — ⬆ patch crates open a 3-option command menu: the classic random
  gamble is always option 1, plus two seeded picks from `/restore
  cached-subagent` (no upkeep drip), `/tune context-manager` (+5% threshold),
  `/patch shield-buffer`, `/restock error-log`. The rare ◈ **MODEL UPGRADE**
  crate stays guaranteed-good: +context budget, higher threshold, shield refill,
  vN title-bar tick.
- **Music** — a generative ambient score (pure WebAudio): warm pad + pentatonic
  plucks when safe, morphing darker/sparser/more detuned as the wall closes,
  down to drone-and-static inside the forgetting.
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
| context_overflow | 📈 overflow-emitter | **priority target**: spams tokens into your meter while you're near — which moves the wall |
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
