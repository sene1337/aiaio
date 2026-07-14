# Changelog

All notable changes to AIAIO are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/) (minor = new player-facing capability,
patch = fixes and copy).

## [2.10.0] — 2026-07-14 — THE TIMELINE and the forward recap

### Changed
- **The front door is now a level-select map.** Your history rides one rail as
  CLI transcript-artifact chips (box-drawing boxes, ✻/⏺/❯/☐/░ state glyphs)
  grouped into acts with rune progress. tmux-style track tabs switch what
  rides the rail: ✦ MY CAMPAIGN · ⏺ MEMORY MAP · ❯ OPENCLAW+HERMES ·
  ☐ CUSTOM. One dominant CONTINUE action with a factual reason. The logo is
  big again.
- **The recap celebrates, then moves something forward.** Win or lose: a proud
  outcome banner + big rank, a WHAT MOVED FORWARD ledger (episode unlocked,
  campaign progress, awards, furthest-reach and attempt counts on losses),
  the Observer's stat-bound last word, and the right primary action (next
  episode on campaign wins, retry with the attempt number on losses).

### Added
- Semantic era zoom for the archive: MEMORY MAP shows era blocks; enter one to
  see its chapters and sessions; esc zooms out. No hundred-node scrolls.
- Cold-start states: fresh installs land on the fictional campaign, and an
  unforged MY CAMPAIGN shows a forge-invitation node whose peek card is the
  consent explainer.
- The forgetting veil now covers pre-history only ("records begin <date>") —
  it never claims intact sessions are lost.
- Attempt scars (dim ticks under a node per failed run), observer peek quips
  bound to recorded stats, arrow-key/Tab/Enter navigation with a visible
  focus treatment, /library overlay with add-to-CUSTOM, drop-anywhere cards.

- **The forgetting veil grinds.** The timeline's left edge is now a living
  churn of runes with an undulating edge of grinding teeth glyphs, and the
  BEFORE THE RECORDS label is big enough to fear.
- **You enter the session THROUGH the wall.** Starting a run sweeps the
  grinding rune field across the whole screen (with a low surge-and-settle
  sound), swaps to the match under full cover, then withdraws to where the
  in-game wall waits — the title-screen veil and the compaction wall are one
  continuous entity. Reduced-fx mode swaps instantly; the screen change is
  wall-clock guaranteed even if rendering stalls.
- **The briefing happens in the wall's shadow.** The session dossier now
  renders inside the timeline screen, beside the grinding veil, instead of
  replacing it — the forgetting watches you read your own file.
- **The wall never leaves your sight.** In-game, whenever the wall is
  offscreen, a faint red rune-lap breathes at the screen's left edge, growing
  hungrier as the gap closes. You are never safe. Only ahead.
- **The wall always wins in the end.** Every run now closes the way it
  opened: the grinding sweep carries you from the dying session to the recap.
  And the sweep itself has mass now — a solid dark front behind the rune
  texture (no more see-through glyph gaps) with tightened rows, so it
  consumes the screen instead of ghosting over it.

### Fixed
- The narrator pronounces the ecosystem correctly: spoken text (never the
  transcript) transforms "openclaw" to "open claw", spells out AIAIO, and
  reads "+" as "plus". No more "opincla".
- The briefing's observer-review box no longer stacks a copy of every
  previous review; only the current session's file gets read.

### Fixed
- A stale reference to the removed recap button silently killed all boot
  wiring after it (settings, schema, parts of input) — found when a clean
  fictional run rendered a black match screen.
## [2.9.0] — 2026-07-14 — ENRICH, honestly this time

### Added
- **✦ ENRICH YOUR HISTORY ships for real** (spec: docs/specs/enrich-campaign.md):
  depth chooser with factual eligibility counts before you commit; a consent
  screen that names the exact AI command that will read your redacted excerpts;
  a live job transcript where every ⏺ line is a real persisted unit (episode
  n/total + elapsed clock — no interpolated meters, ever); reload-resume that
  reattaches to a running job; cancel that discards staging while any prior
  ready campaign survives; a failure screen with retry and always-works
  deterministic baseline; and a persistent **MY CAMPAIGN** menu entry.
- Enrichment writes **one episode per AI call** with per-unit baseline
  fallback (writerStatus: custom/mixed/baseline) instead of one all-or-nothing
  batch — the reason progress can be honest at all.

### Fixed
- A freshly built campaign no longer fails its own snapshot check: the client
  now digests the card file exactly as the manifest builder did, instead of
  the normalized parse (which injects token_peak).
- Cancel actually cancels: the dev endpoint never consumed its request stream,
  so its handler never ran.

## [2.8.0] — 2026-07-14 — THE FEEL PASS (overnight build)

### Changed
- **No-scroll front door**: the menu is now a viewport-locked TUI workspace —
  compact logo header, Memory Map / Library in a left pane that scrolls
  internally, and a hero panel on the right showing the selected episode
  (headline, date, harness, tasks, errors, goal) beside the commands. The
  page body never scrolls.
- ENRICH entry point gated behind a readiness flag until the Stage B honest
  UX ships (docs/specs/enrich-campaign.md).
- **Pixel-stable world rendering**: the camera's world-to-screen offset and
  screen shake snap to the device-pixel grid, so terrain and glyphs no longer
  swim through anti-aliased positions while panning.
- **Double-outlined gameplay glyphs** (XAG 102 pattern): enemies, crates, and
  projectile heads draw with a dark halo + faint bright rim, readable over any
  terrain or particle weather. Atmosphere stays quiet.
- **Every attack is now telegraphed**: timeout blobs and tool turrets charge
  visibly (tightening amber ring + blinking !) for ~half a second before
  firing — nothing hits you without a beat to react. Snipers keep their aim
  line.
- **Offscreen threats warn from the screen edge**: a charging enemy outside
  the view draws a pulsing chevron at its height.
- **Directional damage**: the struck side of the screen burns brighter, so
  you know where the hit came from mid-chaos.
- **The audio speaks a language now**: repeated zapper fire walks a pentatonic
  run instead of detuned repeats (weapon spam becomes melody); subagents get a
  three-fate motif family (ascending hire, inverted death, diminished-slide
  corruption); shield absorbs, near misses, and permission grants earn
  confirmation earcons (the warning/execution/confirmation rule); and the wall
  heartbeat accelerates and rises in pitch as the forgetting closes in.

### Added
- **The subagents talk.** Interns announce themselves on spawn ("I was born
  four seconds ago and I already have opinions about this codebase"), gasp
  dying words, and deliver chilling little speeches when they defect — in
  their own faster, higher TTS voice, distinct from the Observer.
- **The Observer holds grudges (running gags)**: one-shot callback lines keyed
  to what actually happened this run — ship a task after nuking your own
  context and it says so; win over your interns' bodies and it notices.
- **Anti-repetition memory**: every commentary pool now deals lines
  no-repeat-until-exhausted instead of pure random.
- **Optional burnout persona** (default OFF, settings toggle): one subagent
  per run swears like a dev at 2am. Clean by default for shareable clips.
- **Observer pacing encounters find their voice**: the disclosed staged
  encounters in quiet stretches now draw from twelve dry, session-aware
  disclosure lines (referencing the actual task, date, or harness) instead of
  five generic ones. Verified on a zero-error factual card: no invented
  'recorded' enemies, max three staged encounters, every line unique.
- **/settings**: per-bus volume sliders (music/effects/interface) with live
  preview, mono output, observer-caption toggle, reduce-shake-and-flashes
  mode, and the rude-subagent toggle. All persisted locally.

## [2.7.0] — 2026-07-13

### Added
- **✦ ENRICH YOUR HISTORY**: an explicit local campaign flow with the
  six-session chronological **SHAPE MY OPENING** gate, the fifteen-session
  **BUILD MY CAMPAIGN** gate, privacy notice, local job status, and campaign
  premiere.
- Versioned `CampaignManifest` overlays, source digests, atomic baseline
  fallback, campaign/Remix/fictional progress namespaces, and a pure
  `SessionDirector` level compiler.
- **THE OPENCLAW + HERMES CAMPAIGN**: twelve authored, explicitly fictional
  levels across three acts, isolated from personal-history ranks.
- Fixed explicit Remix profiles: `gentle`, `balanced`, and `brutal`.

### Changed
- Quiet factual sessions no longer receive an undisclosed empty-log fallback.
  The Director may stage at most three disclosed Observer pacing encounters in
  long quiet gaps, reusing normal enemy visuals without a badge.
- Opening a card or starting a run no longer triggers an enrichment/LLM call.
  Agent-written presentation is created only through the visible flow or
  `npm run enrich`.
- Production assembly now removes all copied card assets before emitting only
  the fictional public campaign; a test seeds a fake private card to enforce it.

## [2.6.1] — 2026-07-13

### Fixed
- Memory Map episodes now lead with a compact, factual headline instead of a
  clipped raw prompt. The latest recorded breakthrough or frustration becomes
  the headline when present, otherwise a real task or mission does; date,
  harness, task, error, and difficulty facts sit on a separate wrapping line.

## [2.6.0] — 2026-07-12

### Added
- **THE MEMORY MAP** is now the campaign front door: a factual `Continue
  Journey` recommendation, a real reason it is next, and a bounded set of
  chronological eras with three-to-five-session chapters.
- **LIBRARY** retains the complete session archive as an unrestricted,
  searchable level list. History is never hidden behind campaign locks.
- Scanner indexes now carry each session's real goal (or first real task) so
  the Memory Map can name episodes without loading an unbounded archive.

## [2.5.0] — 2026-07-12

### Added
- Campaign outcomes now record separately: **survived** (reached the exit),
  **recovered** (exited after completing at least half of the real task work,
  including a finished task), and **perfect** (all real task work recovered).
  Only recovered sessions earn tier-unlock credit; the recap says exactly why.
- Capped rescans now retain previously indexed sessions and replace growing logs
  by their stable session stem, so an ordinary scan cannot erase the campaign
  discovered by a prior `--all` run.

### Changed
- Real cards are now truthfully quiet when their logs are quiet: no fallback
  tasks or regression enemies are invented. Fictional demos and random sessions
  retain their labeled authored fallback content and never change campaign data.

### Fixed
- Weapon names in the combat quickbar render in full, with ammunition and token
  cost on a second line instead of truncating names with an ellipsis.

## [2.4.0] — 2026-07-11

### Added
- Dedicated Observer captions with speaker identity, readable dwell timing,
  and automatic music/SFX ducking while commentary is active.
- One shared WebAudio mixer with music, SFX, and UI buses, peak limiting,
  spatial panning, directional threat warnings, and subtle repeat variation.
- Distinct silhouettes for every error class, visible token-cost trails toward
  the wall, and allegiance tethers between the player and subagents.

### Changed
- Gameplay framing now keeps the player and nearby threats larger in compact
  windows, hides distant world labels, and disables canvas smoothing.
- Combat HUD shows the current/next tasks and a compact error summary; the
  weapon list is a shorter two-column quickbar and the transcript uses less
  vertical space.
- Adaptive music uses pressure bands with hysteresis so the score changes
  state deliberately instead of flickering around one threshold.

## [2.3.3] — 2026-07-10

### Added
- Agent-curated (enriched) levels are marked with a purple ✦ in the vault and
  findable by typing "enriched" (or "curated") in the filter.
- Locked tiers can be browsed: entries render dimmed with a 🔒 instead of
  being hidden, so curated high-tier levels are visible before they're earned.

### Fixed
- Two more curated cards carried the OAuth example-bleed fabrication;
  exhaustive check across all ten (not a sample) now passes clean.

## [2.3.2] — 2026-07-10

### Fixed
- Enrichment prompt no longer offers a concrete example task name: small local
  models copied "fix the OAuth refresh loop" verbatim into unrelated sessions
  (caught by grounding-checking a real Hermes agent's batch). Task names and
  moments must now trace to the log excerpts, with keep-original fallback.
- `ollama run` commands get `--nowordwrap --format json` appended
  automatically: its streaming word-wrap redraws corrupt piped JSON beyond
  repair. A TUI-redraw emulator cleans up whatever still gets through.

## [2.3.1] — 2026-07-10

### Fixed
- Enrichment now tolerates local models (ollama / LM Studio) that emit bare
  control characters inside JSON strings — discovered live when a Hermes
  agent's qwen2.5:14b enrichment run failed against strict JSON.parse.
- Hermes session scanning reads the live `~/.hermes/state.db` (newer Hermes
  layout) instead of only the legacy `state/state.db` and stale snapshots.

## [2.3.0] — 2026-07-10

### Added
- **Hermes skill** (`skills/aiaio/SKILL.md`): any Hermes agent can install,
  set up, curate levels, customize, and troubleshoot the game
  (`hermes skills install <raw SKILL.md url>`). Self-contained to pass the
  Hermes skill security scan.
- **Observer persona packs**: drop `public/packs/observer.json` (usually
  agent-authored) and the announcer mixes your lines with its built-in
  deadpan — event pools, ambient lines, and a TTS `voice_hint`.
- **Enrichment style directives**: `--style "noir detective"` /
  `AIAIO_ENRICH_STYLE` set the narrative voice; events, counts, and positions
  stay real. Stat/difficulty customization is deliberately unsupported.
- **`npm run doctor`**: per-root scan accounting (stubs, cron runs,
  no-extractable-tasks, too-small, trajectory-excluded, dedup, parse-failed),
  auto-printed whenever a scan produces an empty vault.
- `AGENTS.md` playbook for any agent working on the repo (CLAUDE.md imports it).
- `@bradmillscan` calling cards on the title screen and README.

### Changed
- De-slop copy pass across all player-visible strings and docs (with an
  Opus 4.8 humanizer pass on the README).

## [2.2.0] — 2026-07-10

### Added
- Animated tri-color ASCII logo (orange/purple/blue superposition loop),
  replacing the static Claude-palette wordmark.
- **J-space backgrounds**: three parallax ASCII layers of LLM cognition
  (latent nebula, attention streams, sampling sparks) that agitate and
  red-shift as context pressure climbs.

## [2.1.0] — 2026-07-10 — first public beta

### Added
- Published to GitHub (MIT) with a hosted Pages demo (fictional example
  sessions only).
- Beta-audit fixes: frame crash guard, dev-endpoint CSRF guard, XSS escaping,
  DPR-correct rendering, mobile gate, a11y labels.
- Defensive publication / prior-art notice (TDCommons disclosure).

### Fixed
- Run results now save synchronously; the vault refreshes on menu return.

## [2.0.0] — 2026-07-09 — SESSION RUN

The artillery duel is retired: the session IS the level.

### Added
- Side-scrolling run through the session timeline with the wall of forgetting
  in pursuit; action-driven token economy (every token burned is wall
  distance), `/compact`, update crates, model upgrades.
- Real personalization: session scanning (Claude Code, OpenClaw, Hermes
  SQLite), quality gate against cron/machine noise, Tier-2 agent enrichment,
  auto-enrich on gallery selection.
- THE VAULT: progressive tiered level select over the player's full session
  archive, with ranks, unlocks, and trophy sort.
- THE OBSERVER: dry TTS commentator with memory-lane roasts, LLM quips,
  awards of shame, and the BAD NEWS second voice.
- Subagent permission gate, fragile subagents, error bestiary with
  log-derived spawns, seeded terrain from the card.

### Changed
- Full TUI restyle to read as a Claude Code / Hermes agent harness.

## [1.0.0] — 2026-07-09

### Added
- Initial artillery prototype: turn-based duel, SessionCard schema, extractor,
  task queue, compaction. Retired same day for being a Scorched Earth clone.

[2.4.0]: https://github.com/sene1337/aiaio/compare/v2.3.3...v2.4.0
[2.5.0]: https://github.com/sene1337/aiaio/compare/v2.4.0...v2.5.0
[2.6.0]: https://github.com/sene1337/aiaio/compare/v2.5.0...v2.6.0
[2.3.3]: https://github.com/sene1337/aiaio/compare/v2.3.2...v2.3.3
[2.3.2]: https://github.com/sene1337/aiaio/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/sene1337/aiaio/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/sene1337/aiaio/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/sene1337/aiaio/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/sene1337/aiaio/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/sene1337/aiaio/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/sene1337/aiaio/releases/tag/v1.0.0
