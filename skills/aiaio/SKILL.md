---
name: aiaio
description: "Set up and personalize AIAIO — the game that turns your agent sessions into playable levels. Scan session history into levels, curate the best ones, write custom announcer commentary, debug empty vaults."
tags: [gaming, agents, sessions, claude-code, openclaw, hermes, personalization]
platforms: [macos, linux]
---
# AIAIO — your sessions, playable

AIAIO (Agents In Amnesia, Insane Ordnance) turns the user's real agent session
logs into game levels: their prompts become tasks, their errors become
monsters, and context pressure becomes a wall of forgetting that chases them
across their own timeline. Hermes sessions are first-class — the scanner reads
Hermes SQLite history natively. Repo: https://github.com/sene1337/aiaio

## When to use
- "set up aiaio" / "turn my sessions into a game" / "install that session game"
- "aiaio can't find my sessions" / "the vault is empty"
- "find me good levels" / "make levels from my worst week"
- "customize the announcer" / "make the commentator sound like ..."

## Setup

```bash
git clone https://github.com/sene1337/aiaio && cd aiaio
npm install
npm run scan        # discovers ~/.claude/projects, ~/.openclaw, ~/.hermes
npm run dev         # hand the user the URL vite prints
```

Hermes history is dumped from `~/.hermes/state/state.db` (or the newest state
snapshot) via the `sqlite3` CLI, automatically, during scan.

**After setup, read `AGENTS.md` in the repo — it is the full playbook** for
everything below, including exact file formats and the non-negotiable ground
rules. Summary of those rules: you write narrative (goals, task names, moments,
commentary), you NEVER touch stats/counts/ids; never invent events; cards
contain redacted snippets of the user's real prompts, so never share, commit,
or publish one the user hasn't personally read.

## The three things users ask for

**1. Tech support (empty vault).** Run `npm run doctor`. It prints per-root
accounting: what was found, what was rejected and why (stubs, cron runs,
no-extractable-tasks, too-small, trajectory traces). Fix what it points at:
`--all` for the full archive, a custom root path, or missing `sqlite3`. If the
user genuinely has no qualifying sessions, say so — the game refuses to fake
personalization.

**2. Curation ("find me great levels").** `npm run scan -- --all`, then read
`public/cards/index.json` and the cards, and pick 8–12 sessions with YOUR
JUDGMENT (not a formula): error storms, compaction spirals, restarts, late-night
saves, their first session ever. Enrich each pick with
`node scripts/enrich-sessioncard.mjs <card> <source-log>` (source paths are in
`qa-logs/sources.json`; set `AIAIO_LLM_CMD` if `claude -p` isn't available —
any stdin-prompt CLI works, or write the `.enriched.json` yourself per
AGENTS.md). Re-run the scan; the gallery prefers enriched cards.

**3. Customization ("change the feel").**
- Narrative voice: pass `--style "noir detective"` (or `AIAIO_ENRICH_STYLE`) to
  the enrich script. Style changes phrasing only — events stay real.
- The announcer: write `public/packs/observer.json` — a persona pack of short,
  dry lines the in-game Observer mixes with its own (format + event keys in
  AGENTS.md). The best packs reference the user's actual history and running
  jokes; you know those. Ask the user what persona they want, then write lines
  only their history could produce.

Difficulty/stat customization is deliberately not supported. Don't build it.
