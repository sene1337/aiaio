# AIAIO design audit and implementation roadmap

Durable handoff for the visual, audio, level-design, and history-progression
work begun on `codex/visual-audio-overhaul`. This document records the research
and decisions that originally lived only in the promo/capture task.

## Executive assessment

AIAIO's premise and terminal-native identity are unusually strong. The central
design problem is not a lack of detail. It is making cause, threat, progression,
and the player's real history readable during action.

Baseline scores before the first implementation milestone:

| Discipline | Score |
|---|---:|
| Concept and personality | 86/100 |
| Visual design | 60/100 |
| Sound and audio | 53/100 |
| Individual level design | 51/100 |
| Lifetime-history campaign | 36/100 |

The desired direction is **terminal-native pixel art**, not conventional
illustrated sprites. Glyphs, terminal windows, transcripts, and personal data
remain the identity, but they need a production system with a stable salience
hierarchy and deterministic level composition.

## Visual design audit

| Best practice | Score | Assessment |
|---|---:|---|
| Mechanics express agent concepts | 4.5/5 | Errors as enemies, context as ammunition, and compaction as a wall are excellent |
| Distinctive art direction | 4/5 | The terminal-native identity is memorable and should be preserved |
| Consistent pixel grid and scaling | 2/5 | DPR rendering and fractional zoom do not create a stable pixel-art grid |
| Immediate gameplay hierarchy | 2.5/5 | HUD, labels, terrain, enemies, tasks, and transcript compete equally |
| Character and enemy silhouettes | 2/5 | Enemies depended too heavily on small glyphs and labels |
| Contrast and color semantics | 4/5 | Base contrast is strong; overlap, translucency, and scale reduce clarity |
| HUD information architecture | 2/5 | Too much information remains visible during combat |
| Feedback and impact | 3.5/5 | Compaction, glitches, projectiles, and explosions have personality |
| Text and accessibility | 2.5/5 | Small fixed text and labels over action are major weaknesses |
| World composition and atmosphere | 3/5 | The latent-space concept sometimes reads like a debug visualization |

### Visual direction

1. Establish a virtual world grid, such as 640x360, scaled by whole-number
   increments with nearest-neighbor filtering. Keep the DOM HUD independently
   sharp and scalable.
2. Enforce this salience ladder: avatar; immediate threat; current task and
   exit; compaction wall; then terrain, particles, and historical telemetry.
3. Give every error a distinct silhouette, movement pattern, and attack
   telegraph. Labels appear only nearby, on first encounter, or when targeted.
4. Visualize causality: token packets flow from weapons, large expenditure
   surges the context meter and wall, subagents keep a visible token tether,
   corruption travels along it, and compaction garbles traversed history.
5. Keep only health, shield, context, wall distance, current weapon, and the
   current objective persistent. Move the full roster, queue, and log into a
   dossier/pause surface. Give Observer captions a dedicated lower third.

## Audio design audit

| Best practice | Score | Assessment |
|---|---:|---|
| Distinctive sonic identity | 4/5 | A terminal having a bad day is cohesive and delightful |
| Recognizable mechanic sounds | 4/5 | Weapons, tasks, compaction, damage, and kills are differentiated |
| Adaptive music | 4/5 | Music already responds to wall and context pressure |
| Observer intelligibility | 2/5 | Speech competed with music, explosions, and repeated events |
| Separate mix controls | 1/5 | Only global mute and voice toggle existed |
| Spatial information | 1/5 | Threat audio did not communicate direction |
| Repetition management | 2.5/5 | Repeated events used nearly identical synthesis |
| Cause-and-effect feedback | 3.5/5 | Most important actions had feedback |
| Captions and redundant cues | 2.5/5 | Transcript existed without a stable caption system |
| Peak control and architecture | 2/5 | Separate AudioContexts had no common limiter |

### Audio direction

1. Use one shared graph with Master, Music, SFX, UI, Ambience, and Observer
   buses.
2. Limit the master bus so stacked explosions remain exciting without turning
   into noise.
3. Duck music and noncritical effects while the Observer speaks.
4. Keep the Observer centered; pan the wall and world effects by position.
5. Give dangerous actions warning, execution, and confirmation sounds.
6. Add deterministic pitch, envelope, filter, and timing variation.
7. Use stable safe, pressure, compaction, and inside-wall music states.
8. Add independent volume controls, mono output, subtitles, and captions for
   important offscreen sounds.
9. Never communicate danger through sound or color alone. Pair sound, shape,
   motion, and text.

## Level-design audit

### Individual levels

| Best practice | Score |
|---|---:|
| Real data becomes geography and mechanics | 4.5/5 |
| Spatial composition and traversal reliability | 2.5/5 |
| Tension curve and breathing room | 2/5 |
| Encounter composition and enemy combinations | 2/5 |
| Tasks integrated into enjoyable play | 2.5/5 |
| Mechanical and environmental variety | 2.5/5 |
| Progressive onboarding | 2/5 |
| Deterministic procedural robustness | 3.5/5 |
| Replayability and mastery goals | 2.5/5 |
| Automated playability validation | 1.5/5 |

### History campaign

| Best practice | Score |
|---|---:|
| Fidelity to the player's real history | 4/5 |
| Meaningful session discoverability | 1/5 |
| Chronological journey and narrative arc | 1/5 |
| Clear recommended next action | 1.5/5 |
| Depth and duration of progression | 1.5/5 |
| Difficulty progression | 2.5/5 |
| Continuity between run, recap, and next level | 1/5 |
| Replay records and mastery incentives | 2.5/5 |
| Campaign onboarding | 1.5/5 |
| Large-library stability and scalability | 1.5/5 |

### Evidence and risks

- Tasks, errors, and moments retain real timeline positions. This is the
  strongest part of the level system.
- In the audited 884-card archive, spawn counts frequently exceeded recorded
  positions. Position reuse likely made 88 percent of cards stack enemies at
  identical coordinates.
- Terrain uses deterministic midpoint-displacement noise but has no
  reachability, slope, station-pad, or encounter-space validation.
- Every level repeats generic permission-terminal, patch-crate, and model-
  upgrade beats instead of composing them around the session's dramatic arc.
- Empty real error logs fabricate regression enemies, and fallback tasks risk
  the same truth violation for manually loaded real cards.
- Hold-W work ticks remain the least interesting core verb. The parked Task
  Dives design correctly identifies the opportunity but should wait until the
  beat compiler is stable.
- Reaching the exit grants at least rank B; B counts as cleared; two clears
  unlock the next tier. A player can ignore the real tasks and still progress.
- The audited Vault distribution was 60 / 484 / 291 / 38 / 11 across five
  tiers, while only eight minimal clears unlocked the final tier.
- Vault rows emphasize truncated ids, dates, harnesses, difficulty, and rank
  instead of the session goal or why it matters. Only 24 rows render per
  folder, requiring the player to know what to search for.
- A default capped scan can rewrite `index.json` after an `--all` scan, making
  previously discovered campaign sessions disappear from the Vault.

## Completed milestone

Version `2.4.0`, commit `5b4a036`, implemented the first clarity foundation:

- Larger player and threat framing with contextual labels
- Compact HUD, task summary, error roster, and arsenal
- Dedicated Observer captions with minimum readable dwell
- One audio graph with buses, limiting, speech ducking, and spatial sound
- Distinct silhouettes for every error class
- Visible token expenditure and subagent allegiance tethers
- Directional threat warnings and repeated-sound variation
- Stable adaptive-music transitions using hysteresis

Commit `79a98d8` prevents voice QA from leaking a selected novelty voice into
the player's normal profile. Commit `f6f8463` formalizes the dev-only manual
capture entry point. Production builds contain no capture route or private card
ids.

## Integrated roadmap

### P0: Restore campaign truth and incentives

- Record separate outcomes: `survived`, `recovered`, and `perfect`.
- Require exit plus meaningful real-task engagement for campaign credit.
- Remove invented enemies and tasks from real cards. Quiet sessions remain
  truthfully quiet; fallback content exists only in labeled demo/random modes.
- Make rescans additive/stable so a capped scan cannot erase indexed history or
  orphan progress.

### P1: Finish settings and accessibility

- Independent Master, Observer, Music, SFX, UI, and Ambience controls
- Mono output
- UI scale and readable-font mode
- High-contrast mode
- Reduced motion and reduced flashes wired into canvas effects
- Responsive QA across square promo, desktop, and narrow viewports

### P1: Replace the default Vault with the Memory Map

- Lead with one `Continue Journey` session and a factual reason it is next.
- Group sessions into deterministic chronological eras using real timestamps
  and gaps.
- Compose three-to-five-session chapters: introduction, build, escalation, and
  capstone selected from actual metrics.
- Show goal, date, harness, task/error shape, rank, and why the session was
  selected.
- Keep the existing Vault as an unrestricted searchable **Library**. The player
  is never locked out of their own history.

### P1: Add a deterministic level-beat compiler

- Convert the timeline into factual quiet, task, error, recovery, compaction,
  and exit bands while preserving event order and true `at` values.
- Stage clustered errors as telegraphed waves near their real point instead of
  stacking active enemies at one coordinate.
- Add concurrency limits, recovery windows, enemy-combination rules, and
  data-derived climaxes.
- Flatten terrain around stations and validate a traversable spawn-to-exit
  route.

### P2: Complete the agentic grammar

- Finish the fixed virtual pixel grid and integer scaling.
- Make token flow, subagent upkeep/corruption, and compaction erasure visible.
- Complete attack telegraphs and offscreen redundant cues.
- Tune adaptive music layers, bus levels, repetition, and caption timing.

### P2: Continuity, mastery, and Task Dives

- Recap the real historical episode, then offer `/continue journey` directly.
- Track moments witnessed, task recovery, no-compaction clears, weapon mastery,
  and perfect recalls.
- Generate replay objectives only from facts already present in the card and
  run telemetry.
- After the beat compiler is stable, prototype one 30-to-45-second Scrollback
  Task Dive before expanding that system.

## Acceptance criteria

- Identical card and campaign version produce identical level plans and
  chapter ordering.
- No task, error, moment, date, chapter label, or campaign justification is
  invented.
- Clustered errors do not share an active coordinate; original timestamps
  remain inspectable.
- Spawn, stations, required interactions, and exit pass automated reachability
  checks.
- Rescanning cannot remove previously indexed sessions or orphan progress.
- The initial campaign surface renders a bounded set, not hundreds of buttons.
- A returning player can answer where they are, what they completed, and what
  they should play next.
- Campaign advancement requires engagement with session objectives, not only
  reaching the exit.
- Generation and progress remain deterministic, local, private, and network-
  free in production.

Likely implementation surfaces: new `src/history.ts` and `src/level-plan.ts`;
revisions to `src/levels.ts`, `src/main.ts`, `src/run.ts`, `src/terrain.ts`,
`src/session.ts`, `src/ui.ts`, `scripts/extract-sessioncard.mjs`, and
`scripts/scan-sessions.mjs`; deterministic generator and reachability tests.

## Research basis

- [MDA: A Formal Approach to Game Design and Game Research](https://www.cs.northwestern.edu/~hunicke/MDA.pdf)
- [Google PAIR Guidebook: Mental Models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/)
- [Godot multiple-resolution and integer-scaling guidance](https://docs.godotengine.org/en/latest/tutorials/rendering/multiple_resolutions.html)
- [Xbox contrast guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102)
- [Xbox redundant-cue guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103)
- [Xbox subtitle and caption guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/104)
- [Xbox audio guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/105)
- [Xbox objective clarity](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/109)
- [Xbox UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112)
- [Xbox UI context](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/114)
- [GDC pacing workshop](https://media.gdcvault.com/gdcchina14/presentations/833762_JoelBurgess_MattScott_LeePerry_3_Pacing_EN.pdf)
- [Valve Left 4 Dead AI systems](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)
- [Procedural Content Generation in Games](https://www.pcgbook.com/)
- [Experience-Driven Procedural Content Generation](https://yannakakis.net/wp-content/uploads/2019/02/EDPCG.pdf)
- [GDC onboarding guidance](https://www.gdcvault.com/play/1023231/The-Gamer-s-Brain-Part)
- [GDC replayability through mastery](https://www.gdcvault.com/play/1022119/AI-in-Game-Design)
