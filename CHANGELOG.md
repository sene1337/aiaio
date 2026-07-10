# Changelog

All notable changes to AIAIO are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/) (minor = new player-facing capability,
patch = fixes and copy).

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

[2.3.1]: https://github.com/sene1337/aiaio/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/sene1337/aiaio/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/sene1337/aiaio/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/sene1337/aiaio/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/sene1337/aiaio/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/sene1337/aiaio/releases/tag/v1.0.0
