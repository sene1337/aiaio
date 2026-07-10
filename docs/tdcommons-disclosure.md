# Deterministically Generating Playable Game Content from AI-Agent / LLM Session Logs

**Technical Disclosure — Defensive Publication**

- **Author / Inventor:** Brad Mills
- **Publication date:** 2026-07-10
- **Keywords:** procedural content generation, personalized games, AI agents,
  large language models, session logs, context window, compaction, deterministic
  generation, data-driven level generation

> This document is written to be uploaded, substantially verbatim, to a
> defensive-publication venue (e.g., Technical Disclosure Commons,
> tdcommons.org). It is intended as enabling, dated, public prior art. Paste
> the body below into the disclosure form; keep the author and date fields.

---

## Abstract

A method and system for automatically generating a playable video game — its
levels, hazards, enemies, weapons, objectives, resource economy, difficulty, and
narrative — **deterministically from the log of an AI-agent or large-language-
model (LLM) session**. Signals extracted from a real agent session (errors and
their categories and timing, the user's tasks and requests, tool-call activity,
token consumption, context-window compaction events, restarts, model changes,
and recoveries) are mapped, via a reproducible seeded transformation, onto game
parameters. The mapping is distinguished by translating **operational concepts
specific to AI agents** — the context window as a consumable resource that every
action spends; compaction/summarization as an in-game memory-loss event; the
error taxonomy as an inventory of enemies and weapons; sub-agent delegation as a
permission-gated, resource-costed in-game ability; and model upgrades as
character progression — into game mechanics. The same session log reproducibly
yields the same game; a user's library of sessions becomes a personalized
campaign whose difficulty is *computed from the generation parameters* rather
than estimated.

## Technical field

Procedural content generation (PCG) for video games; data-driven and
personalized game generation; developer/AI-agent tooling and observability;
human-computer interaction.

## Background and problem

Procedural generation from a user's own data has prior instances: rhythm/level
games generated from music files (e.g., Vib-Ribbon, 1999; Audiosurf, 2008), a
game generated from a source-code repository seeded by commit hash (e.g., GitHub
`gh-dungeons`, 2025), and the academic field of experience-driven PCG. None of
these use, as their data source, the **operational log of an AI-agent or LLM
session**, and none map the **agent-native operational concepts** enumerated
below onto game mechanics.

AI-agent sessions produce a rich, structured, temporally ordered record —
errors, tool calls, user requests, token pressure, context-window compaction,
restarts, model changes — that is (a) unique to each user and session, (b)
emotionally resonant to the operator who lived through it, and (c) naturally
adversarial in shape (things that went wrong become obstacles). No prior system
converts this record into a playable, personalized game. This disclosure
describes such a system so that the technique remains in the public domain.

## Detailed description of the method

The method comprises the following stages. Any subset, reordering, or
substitution of equivalent components is contemplated as an embodiment.

### 1. Ingestion of an AI-agent / LLM session log

Accept as input one or more session logs from any agent harness or LLM
interface, in any format, including but not limited to: JSON Lines transcripts,
event/trace logs, SQLite message databases, plain-text logs, or API request
dumps. Harnesses include, without limitation, coding agents, autonomous agents,
and conversational assistants. Parsing is defensive (malformed records skipped)
and format-agnostic (multiple schemas recognized).

### 2. Signal extraction

From the log, extract some or all of the following signals, each optionally with
its **position in the session timeline** (normalized 0–1) and count:

- **Error events**, classified into a taxonomy of categories (e.g., timeout,
  hallucination/incorrect-output, regression, restart/crash,
  false-positive/assertion, tool/permission error, context-overflow, recovery),
  with counts and representative (redacted) samples.
- **User tasks and requests** — the human's substantive messages, treated as the
  session's goals/objectives, with their timeline positions and an estimate of
  how much of the session each consumed.
- **Tool-call activity** — count, kind, and timing.
- **Token usage** — peak and/or trajectory.
- **Context-window compaction / summarization events** — count and timing.
- **Restarts, model changes/upgrades, recoveries**, and a derived **stability
  score**.
- **Notable moments** — real lines of the session identified as successes or
  frustrations, with timeline positions.

### 3. Redaction and normalization

Redact secrets, credentials, tokens, keys, and personally identifying
information deterministically before any sample text is retained; truncate
samples. Emit a normalized, documented interchange record (herein a "session
card") in which every field is optional and the system degrades gracefully when
signals are absent.

### 4. Deterministic, seeded mapping to game parameters

Using a pseudo-random generator **seeded from a session identifier** (so output
is reproducible: same card → same game), map the extracted signals onto game
parameters. Representative mappings — any of which may be used independently or
in combination — include:

- **Error category → enemy and/or weapon archetype**; **error count → quantity
  and/or ammunition and stat rolls**, optionally with sub-linear or budgeted
  scaling and a global difficulty budget so a difficulty *ramp* results across
  sessions of increasing error volume.
- **Error timeline position → spawn position** along a traversable representation
  of the session timeline.
- **User tasks/requests → in-game objectives** ("work stations," quest markers,
  etc.) placed at their **real timeline positions**, named using the user's
  actual request text, with required effort proportional to the share of the
  session each consumed.
- **Token budget/peak → a consumable resource economy** in which every player
  action (moving, firing, working, delegating) spends the resource.
- **Context-window compaction events → the threshold and behavior of an in-game
  memory-loss event** ("amnesia"/state-rewind): crossing the resource threshold
  triggers loss or corruption of game state (objective progress, buffs, aim,
  cooldowns), optionally garbling the display using the user's own session text.
- **Session identifier + message count → procedural terrain / level geometry
  seed and size** (longer sessions → larger, more complex levels).
- **Restarts and/or model changes → the frequency and risk/reward table of an
  in-game upgrade mechanic.**
- **Stability score → a handicap / difficulty-compensation** granted to the
  player, with an explanation quoting the real underlying numbers.
- **Recoveries → beneficial in-game pickups or abilities.**
- **Notable moments → in-world markers** the player encounters, surfacing the
  real session text; and content consumed by the memory-loss event.

### 5. Agent-native mechanic embodiments (the distinguishing subject matter)

The following mechanics translate AI-agent operational concepts directly into
game rules and are specifically disclosed:

- **Context window as a spatial or resource hazard.** A representation of context
  pressure that advances toward, threatens, or constrains the player **in
  proportion to the tokens the player spends** — i.e., the rate of the hazard is
  driven by in-game action cost rather than a fixed timer ("action-driven"
  advance). Getting hit may inject additional resource cost ("error spew").
- **Compaction as a memory-loss event** that rewinds or corrupts player/game
  state and may permanently "forget" un-completed objectives.
- **Error log as weapon/enemy inventory** — the player's arsenal and adversaries
  are generated from, and labeled with, the real error taxonomy and (redacted)
  log lines; projectiles may render as the agent's own output (code fragments,
  log lines).
- **Sub-agent delegation as a gated, resource-costed ability** — spawning a
  helper requires an in-game permission grant (mirroring tool-use authorization)
  and consumes ongoing resource ("upkeep"); helper agents may be turned hostile
  ("corrupted") by in-game conditions.
- **Model upgrade as character progression** — acquiring a "new model" enlarges
  the resource budget / raises thresholds.
- **Personalized commentary** — a synthesized-voice or text commentator whose
  lines are generated from, and reference, the specific session's goal, tasks,
  errors, and real text.

### 6. Computed difficulty and progression

Because the generation parameters are known, a **difficulty score is computed
directly from them** (e.g., from enemy budget, hazard density, resource runway,
objective load, and level length) rather than estimated after the fact. A user's
library of sessions is organized into a **progressive campaign** with tiers,
per-level ranks, best scores, and unlock conditions, persisted per session.

### 7. Optional LLM enrichment

Optionally, a language model — including the user's own agent — is invoked to
rewrite narrative content (objective names, commentary, a session "roast") for a
given session, cached per session; the game prefers enriched content when
present and falls back to templated/compositional content otherwise.

### 8. Rendering and play

The generated parameters are rendered as a playable game in any genre and any
traversal metaphor.

## Embodiments and variations (disclosed to prevent enclosure)

- **Any game genre**: artillery/physics, side-scrolling runner, platformer,
  roguelike, tower defense, top-down, rhythm, etc.
- **Any traversal metaphor** for the session timeline: horizontal traversal,
  descent through a transcript, a metro/graph of turns, an orbit of the context
  window, a tower of call frames, isometric rooms per conversation chapter, etc.
- **Any harness / log format** and any LLM or agent provider.
- **Single input or multiple inputs**: one session, or two sessions played
  asymmetrically against each other.
- **Local or networked**; deterministic offline generation with no server
  required; optional local-model or user-agent enrichment.
- **Any interchange representation** equivalent to the "session card."
- **Any subset** of the signal→parameter mappings in §4–§5, and any additional
  agent-operational signal mapped to any game parameter by the same technique.

## Advantages

Personalized, emotionally resonant, reproducible game content generated at zero
marginal authoring cost from data the user already produces; a difficulty and
progression system grounded in computed generation parameters; and a novel,
previously undisclosed mapping of AI-agent operational concepts onto game
mechanics.

## Statement of intent

This disclosure is published to establish dated, public, enabling prior art for
the method and its variations, so the technique remains available to all and is
not removed from the public domain by subsequent patenting.
