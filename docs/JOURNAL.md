# JOURNAL — who did what, and why

Append-only working log for cross-agent development. CHANGELOG.md says WHAT
shipped; this file says WHY, what was decided against, what's parked, and
what's in flight. Newest entry LAST (append, don't prepend).

**Protocol:** after a working session, append one entry:

```
## YYYY-MM-DD · <Agent Name> · <one-line summary>
- What: bullets of what changed (reference versions/commits)
- Why: the reasoning, especially for decisions that constrain future work
- Verified: what you actually checked (build/preview/data), not what should work
- Open: anything you left unfinished, discovered, or deliberately didn't touch
```

Read the whole file before your first edit. Do not rewrite old entries; if one
turns out wrong, append a correction.

---

## 2026-07-09 · Claude Fable 5 · v1 built and retired; v2 SESSION RUN pivot

- What: v1 artillery duel (Scorched Earth-like) built from Brad's design docs,
  then retired the same day. v2 pivot: the session IS the level — side-scroll
  the timeline, wall of forgetting pursues, errors spawn as monsters where
  they happened.
- Why: Brad's verdict on v1: "basically just Scorched Earth with a skin on
  it." The bar is Operation: Inner Space — personal data must BE the visible
  world, not a difficulty slider. This is the project's core identity.
- Decisions that bind: action-driven wall economy (every token burned = wall
  distance); "task dives" design approved but PARKED for v2 pass
  (docs/PARKED-task-dives.md) — core first, per Brad.

## 2026-07-09 · Claude Fable 5 · Observer, vault, personalization systems

- What: THE OBSERVER (TTS commentator, BAD NEWS second voice), THE VAULT
  (tiered progression over the full session archive), subagent permission
  gate, quality gate excluding cron/machine sessions, Tier-2 LLM enrichment,
  literal payloads (symbols fly, words splash).
- Why: repeated Brad feedback that the game must feel "procedurally generated
  for them from their sessions, personalized and customized... otherwise it's
  just another AI generated pixel shooter." The quality gate exists because
  faked personalization would kill trust in the real thing.

## 2026-07-10 · Claude Fable 5 · public beta, graphics pass, hygiene

- What: published to github.com/sene1337/aiaio (MIT, darbsllim collaborator,
  Pages demo with fictional cards only) after triaging an Opus 4.8 audit
  (frame guard, CSRF, XSS, DPR). Graphics pass: tri-color animated logo,
  J-space cognition backgrounds. De-slop copy pass. Backfilled CHANGELOG.md +
  semver tags v1.0.0–v2.2.0 (hygiene adopted from here on).
- Why: Twitter beta announcement planned. Card sharing is deliberately
  DOWNPLAYED until a pre-share review UI exists (headline of next beta) —
  cards contain redacted real-prompt snippets.
- Open: pre-share review UI; touch controls (mobile is gated out honestly).

## 2026-07-10 · Claude Fable 5 · agent integration (v2.3.0)

- What: Hermes skill (skills/aiaio/SKILL.md), Observer persona packs,
  enrich --style, npm run doctor, AGENTS.md.
- Why: Brad: Hermes is the biggest agentic-harness community and "this game
  is made for them." Architecture rule: the game reads plain JSON files;
  agents write them; no agent in the loop at runtime (zero prod network).
  Stat/difficulty customization REJECTED by design — narrative only.
- Note: the Hermes skill scanner blocks "read other file and follow it"
  phrasing as CRITICAL persistence — SKILL.md must stay self-contained.

## 2026-07-10 · Claude Fable 5 · watched a Hermes agent build levels (v2.3.1–2.3.3)

- What: monitored Brad's Hermes agent using the skill to curate 10 Feb–Apr
  OpenClaw sessions into levels. It stayed perfectly in-lane (no game-code
  edits; local models only; own validation layer). Watching it surfaced and
  fixed: local-model JSON tolerance + live Hermes db path (v2.3.1);
  example-bleed fabrication — the model copied "fix the OAuth refresh loop"
  from our own prompt example into 4 of 10 cards — plus ollama CLI output
  corruption (v2.3.2); vault discoverability — ✦ badge for enriched levels,
  "enriched" filter keyword, browsable locked tiers (v2.3.3).
- Why the prompt rule: small local models parrot concrete examples; prompts
  must never contain fake example content. Why exhaustive checks: a 4-card
  sample missed 2 fabricated cards; the full-population check caught them.
- Verified: all 10 curated cards grounded (distinctive words traced to source
  logs), mechanics unchanged, no leaks; builds green; v2.3.3 not yet
  browser-verified (Chrome extension was down) — badge/locked-tier rendering
  deserves a look.
- Open / parked: grounding gate in the enrich merge (reject task names whose
  distinctive words never appear in the excerpt) — would make "never invent
  events" enforced, not requested. Curated-levels-bypass-tier-locks question:
  Brad undecided; current sanctioned shortcut is drag-dropping the card file.
- In flight (NOT Claude's work): uncommitted promo/autoplay mode in
  src/main.ts (?promo=1, PROMO_CARD, scripted weapon rotation) — appeared in
  the working tree ~14:30 local, author presumed Hermes agent or Brad.
  Whoever owns it: journal it and commit it with your trailer.
