# AIAIO: Agents In Amnesia, Insane Ordnance

*Operation: Inner Space, except the world is your agent's actual session log.*

**🎮 [Play the hosted demo](https://sene1337.github.io/aiaio/)** (two fictional
example sessions). The real game is your own history: clone this repo, run
`npm run scan`, and every Claude Code, OpenClaw, or Hermes session on your
machine becomes a playable level. Your prompts are the tasks, your errors are
the monsters, your compactions are the wall chasing you.

> **Beta notes.** Desktop and keyboard required (mobile gets an honest gate).
> SessionCards are generated locally and never leave your machine. Sharing a card
> with someone is possible but experimental: cards contain redacted snippets of
> your real prompts, so read `public/cards/<card>.json` yourself before you send
> it to anyone. A proper pre-share review UI is the headline of the next beta.

**Your real session is the level.** Its timeline is the terrain you cross. Your
real errors spawn as monsters at the points where they actually happened. Your
real tasks sit in the world as work stations. And behind you, always, the **WALL
OF FORGETTING** (context pressure made spatial) advances, eating terrain, tasks,
and eventually you.

Reach `process exit 0` alive. Clear your task queue on the way for a perfect run;
in your real-history campaign, exiting after recovering at least half of the
recorded task work earns progression credit.
Every token you spend fighting is distance the wall gains.

If you like this game or have ideas, hit me up on
[Twitter](https://x.com/bradmillscan) or
[Instagram](https://instagram.com/bradmillscan) **@bradmillscan**.

## Run it

```bash
npm install
npm run scan     # optional: auto-build levels from YOUR sessions (see below)
npm run dev      # open the printed URL
npm run build    # static bundle in dist/
```

No network calls. Fully playable offline with zero setup (two inline example
sessions plus random generation).

## Or let your agent do all of it

This game is made for people who run agents, so the agent can be the installer,
the level curator, and the tech support. **Hermes** users:

```bash
hermes skills install https://raw.githubusercontent.com/sene1337/aiaio/main/skills/aiaio/SKILL.md
```

then tell your agent things like *"set up aiaio"*, *"find my 10 most dramatic
sessions and make them levels"*, or *"make the announcer a bitter golf
commentator"*. Any other agent (Claude Code, OpenClaw, Codex): point it at
[AGENTS.md](AGENTS.md) — same playbook, no skill required. If the vault comes up
empty, `npm run doctor` prints exactly what was scanned and why each file was
rejected; your agent can read it and fix the cause.

Customization is narrative-only by design: agents write goals, task names,
moments, and Observer commentary ([persona packs](AGENTS.md#observer-persona-packs-customizing-the-announcer)),
but difficulty always derives from your real session data. That line is what
keeps the levels honest.

## Play

- **←/→** move. **↑** jump. **↓** fast-fall (explore drilled craters). **space**
  fire (toward facing).
- **W (hold)** work the task at a station. You're rooted and **heads-down** while
  working, which means +25% damage taken. Working is how you win, and working is
  when you're weakest.
- **U** open a ⬆ crate's command menu (choose with 1/2/3), or install a ◈ model
  upgrade. **C** runs `/compact`.
- **[ ] / 1-9** switch weapons. Slot 1 is the **∞ print-debug zapper**: you can
  never run out of print statements, and you can never win with them alone.
- **S** spawn a **subagent** (900tk plus ~16tk/s upkeep, because inference isn't
  free and the drip literally speeds up the wall). It's a lower model: weak zaps,
  cap of 2, loyal right up until a hallucination-ghost touches one or it falls
  into the wall. Then it's **corrupted**: red, garbled, and shooting at you.
  Terminate it or outrun it (rogues OOM-kill themselves after about 18s).
- **M** mute. All audio is synthesized WebAudio (chip/glitch, zero assets):
  compaction is a stuttering descent into static, the wall has a heartbeat when
  it's close, tasks chime when they ship.

### The systems

- **The wall of forgetting is action-driven.** It does NOT creep on a timer.
  Every token you burn becomes wall distance (0.16px per token): firing, working,
  subagent upkeep, damage spew, even walking (reading the transcript is inference
  too, at 1tk per 10px). Stand perfectly still and it stands still with you. Your
  token bill is the storm. `overflow-emitter`s spam tokens into your meter while
  you're near, which moves the wall, because everything does. Tasks it passes are
  forgotten (garbled, unrecoverable). It eats subagents whole. You it merely
  ruins: inside the zone you bleed 9hp/s and your weapons spray wildly, though you
  can still dive in, since unclaimed crates in there still work. **Involuntary
  compaction** (crossing your threshold) surges it 240px or more, plus the
  amnesia: shield gone, progress rewound, and from your 3rd compaction even
  completed tasks can un-ship.
- **`/compact` (C).** Voluntary, anywhere, 20s cooldown. It drains your meter
  cleanly, with no surge and nothing forgotten, but the summarization pass costs
  250tk and roots you heads-down for a beat. Run it too close to the threshold and
  the pass itself tips you over. Compact early, compact often.
- **Context economy.** Every token burned is wall distance, and the meter itself
  is your countdown to the next involuntary compaction surge. The
  context-window-nuke erases half a screen of errors and floods a quarter of your
  own meter (about 700px of wall), so choose violence carefully. Getting hit
  injects error-spew into your context (stack traces are long), so damage
  accelerates your own compaction.
- **Upgrades.** ⬆ patch crates open a 3-option command menu: the classic random
  gamble is always option 1, plus two seeded picks from `/restore cached-subagent`
  (no upkeep drip), `/tune context-manager` (+5% threshold), `/patch
  shield-buffer`, and `/restock error-log`. The rare ◈ **MODEL UPGRADE** crate
  stays guaranteed-good: more context budget, a higher threshold, a shield refill,
  and a vN title-bar tick.
- **Music.** A generative ambient score (pure WebAudio): a warm pad and pentatonic
  plucks when you're safe, morphing darker, sparser, and more detuned as the wall
  closes, down to drone and static inside the forgetting.
- **Handicap.** Low-stability sessions (yours was rough) grant a starting shield
  and a damage bonus, with the "why" line quoting your real numbers.

### The bestiary (spawned from your error log)

| Your error category | Becomes | Behavior |
|---|---|---|
| timeout | ⏱ timeout-blob | tanky lobber; shots detonate late |
| hallucination | 👻 hallucination-ghost | phases, teleports, is sure it exists; your `hardening` resists its touch |
| regression | ☢ regression-splitter | splits into two minis on death |
| restart / crash | 🔁 restart-crawler | relaunches itself once after dying |
| false_positive | ⚡ false-positive-sniper | telegraphed laser, 100% confidence, ~70% accuracy |
| tool_error | 🔧 tool-turret | interrupt bolts; hit while working = lose task progress |
| context_overflow | 📈 overflow-emitter | **priority target**: spams tokens into your meter while you're near, which moves the wall |
| recovery | ➕ recovery-sprite | *friendly*, touch for hp/shield |

Enemy count per category scales with the error count, and weapon ammo scales from
the same log, so your worst error category is both your biggest threat and your
deepest magazine.

### The semantic layer: the level tells your session's story

When a card carries them (the extractor mines all of this automatically):

- **`goal`.** Your first real ask, shown as the mission: *"the mission, in your
  own words: …"*
- **Tasks are your actual messages.** When logs have no structured tasks, your
  substantive user asks become the task stations, named in your words, placed at
  their **real timeline positions**, with work-units proportional to how much of
  the session each ask actually consumed.
- **Enemies spawn where the errors really happened** (`errors[].at`).
- **◇ moments.** Real wins ("ok it works. nobody touch anything.") and
  frustrations ("still broken. still. broken.") stand in the world where they
  happened. Walk past one and the transcript quotes it.
- **Compaction garbles your own words.** The banner corrupts real lines from the
  session instead of canned filler, and the recap tells you where in the real
  session your run ended.

All of it is heuristic, deterministic, and on-machine, with no LLM involved.
Redaction applies to every snippet, but a card still contains fragments of your
actual prompts, so **skim before sharing.**

### Tier 2: your agent writes your level

AIAIO's players have agents, so the deep enrichment doesn't ship a model. **Your
own agent novelizes your session** (see [docs/ENRICH.md](docs/ENRICH.md)):

```bash
node scripts/enrich-sessioncard.mjs public/cards/<card>.json <session-dir>
# default is claude -p. override with AIAIO_LLM_CMD="ollama run llama3.2"
```

The model rewrites ONLY goal/tasks/moments (imperative task names, real completion
flags, verbatim moment quotes). Every mechanical field is whitelist-protected, and
every accepted string is re-redacted and capped. `npm run scan` automatically
prefers `<card>.enriched.json` in the gallery when one exists. For private
sessions, point `AIAIO_LLM_CMD` at a local model.

## `npm run scan`: your sessions become levels

Auto-discovers agent session logs (`~/.claude/projects`, `~/.openclaw` including
archived agents, and `~/.hermes`, whose SQLite history is dumped to JSONL
automatically, or any root you pass), builds a SessionCard per session, and writes
them to `public/cards/`, where they appear as **THE VAULT**, the tiered campaign
level-select. `--all` scans the entire archive. The default takes the 12 most
recent per root.

**Quality gate.** Only sessions with real extractable human asks become levels.
Cron jobs, heartbeats, and ask-less machine runs are excluded entirely, because
the game never fakes personalization. In dev mode, selecting a level also quietly
asks your agent (claude -p / AIAIO_LLM_CMD) to enrich it in the background: a
bespoke roast, per-session Observer one-liners, and rewritten tasks land in the
cache for every later play.

- Read-and-aggregate only. Log content is inert data, never executed or followed.
- Samples are redacted (API keys, tokens, JWTs, credentials, emails, hex blobs) and
  truncated to 80 chars, but **skim `public/cards/*.json` before sharing**.
- `public/cards/` is gitignored, so your session data never lands in the repo.

You can also drop any SessionCard `.json` on the menu, or build one by hand:
`node scripts/extract-sessioncard.mjs <dir-or-jsonl> -o card.json`.

## QA telemetry (dev mode)

Playing via `npm run dev` records gameplay telemetry to `qa-logs/*.jsonl`
(gitignored): every fire, work, damage, compaction, and death event, first-use
timing per control, and a snapshot every 2s (position, vitals, wall gap, selected
weapon). It exists to analyze how the game is actually learned and played, so
balance comes from evidence rather than vibes. The events POST to a
dev-server-only endpoint on localhost. **Production builds have no endpoint and
make no network calls**, so telemetry falls back to a localStorage ring buffer
(`localStorage.getItem('aiaio-qa')`).

## SessionCard schema

All fields optional. Missing data degrades gracefully. Copyable in-game via
**/schema**.

```jsonc
{
  "session_id": "string",      // seeds everything: same card, same level
  "duration_ms": 0,
  "message_count": 0,          // -> level length + jaggedness
  "token_peak": 0,             // -> context budget
  "compaction_events": 0,      // -> compaction threshold (more means earlier amnesia)
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

## Log-signal to level mapping (deterministic)

| Card signal | Level effect |
|---|---|
| `session_id` | seeds terrain, spawn positions, every roll. Same card, same level |
| `message_count` | level length (2400 to 6000px) plus terrain jaggedness |
| `errors[].category` / `count` | which monsters spawn and how many, placed along the timeline; also weapon archetypes and ammo |
| `errors[].sample` | quoted in the briefing roster and weapon tooltips |
| `tasks[]` | work stations along the timeline (synthesized from `tool_calls` when absent) |
| `token_peak` | context budget (`peak/12`, clamped 6k to 20k) |
| `compaction_events` | compaction threshold `0.85 − 0.03×events`, so a compaction-heavy history compacts earlier in-game |
| `restarts` + `model_switches` | number of ⬆ update crates plus update risk skew |
| `recoveries` | friendly recovery sprites |
| `stability_score` | handicap: below 45 grants a starting shield and damage multiplier, with the why-line quoting the number |
| card totals | end-run recap: your top error, real vs in-game compactions, real vs your task completion |

## Repo layout

```
src/main.ts      menu (card drop + scanned gallery), input, frame loop
src/run.ts       the session run: avatar, wall of forgetting, stations, economy
src/enemies.ts   the bestiary: error categories as creatures
src/terrain.ts   per-pixel destructible terrain (seeded from the card)
src/physics.ts   projectile integration
src/weapons.ts   error-log weapon archetypes (plus the ∞ debug zapper)
src/tasks.ts     task queue, work, amnesia
src/context.ts   token meter, compaction, garbled-text generator
src/updates.ts   update gamble + patch-note table
src/session.ts   SessionCard schema, deterministic mapping, examples
src/ui.ts        canvas renderer + TUI HUD (Claude Code / Hermes styling)
scripts/scan-sessions.mjs        auto-discover sessions into the menu gallery
scripts/extract-sessioncard.mjs  one dir/file into one SessionCard (CLI + library)
examples/        two droppable example cards (clean + chaotic)
```

## Design lineage and simplifications

- Core concept: **Operation: Inner Space** (1994), a game world built from your own
  machine, crossed with agent-session mechanics (context, compaction, updates,
  tasks) from the AIAIO design docs. v1 was a Scorched Earth-style artillery duel.
  It was retired for being derivative, because the session data deserved to be the
  visible world, not difficulty sliders.
- Prompt injection appears only as the `hardening` stat (resists ghost touch).
  There's no real injection or steganography anywhere, per the design docs'
  constraint.
- Errors lack timestamps in the card schema, so spawn positions along the timeline
  are seeded-random rather than time-accurate.
- The distraction-barrage is repurposed solo: it stuns your errors ("quick
  question…" works on everyone).
