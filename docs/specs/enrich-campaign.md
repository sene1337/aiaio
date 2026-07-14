# SPEC: ENRICH — Campaign Enrichment & Session Director

Reconstructed 2026-07-13 from the CEO plan review interview (Codex session
`019f5dce-21a5`, 42 decisions answered by Brad) after the original run failed
to save its plan. This document is the durable version, gstack-spec shaped.
Decision IDs (D1–D25 and named gates) trace to the interview transcript
(`docs/CEO-INTERVIEW-TRANSCRIPT.md`).

## 1. Why

- **Who:** every AIAIO player; first Brad, then the Hermes/agent community the
  game is built for.
- **Current behavior (verified in play):** the v2.7.0 attempt shipped a
  campaign engine with a broken interactive flow — no visible confirmation,
  gates that swallow clicks, a cosmetic progress meter over one blocking batch
  job, a completion path that failed without recovery, and levels that didn't
  visibly appear on finish.
- **Desired behavior:** one attractive, honest ENRICH entry point that turns a
  player's real history into an authored, paced campaign — with consent,
  truthful progress, a premiere payoff, and a recover-from-anything job model.
- **Why now:** ENRICH is the personalization flywheel — the difference between
  "a log viewer with guns" and a game people show off. The half-built version
  actively damages trust.
- **Done-check:** the end-to-end flow *choose depth → see gate facts → consent
  → watch honest progress → premiere → play level 1* passes as an automated
  test AND as a human playtest, on both a large archive and a too-small one.

## 2. Decisions ledger (locked by Brad in the interview — do not relitigate)

**Product shape**
- Session Director before larger features (`approve_session_director_approach`).
- Two personal depths: **SHAPE MY OPENING** = six chronological real sessions
  (D17); **BUILD MY CAMPAIGN** = 15–24 curated levels (D12), reordering for
  pacing allowed in the authored campaign only (chat: "re order for game
  pacing is fine"); the raw Memory Map stays chronological.
- One button, first-pass-everything model directionally approved but
  explicitly **not final** (D8 note) — v1 ships the two named gates;
  re-enrich is deferred (D9).
- **Fictional campaign**: an authored, labelled OpenClaw + Hermes arc based on
  the shape of Brad's real struggles, for players who can't/won't enrich
  (D14). Its progress is separate from real-history ranks (D22).
- ENRICH is local-app only; the hosted demo never pretends otherwise (D14).

**Truth model**
- "This is a fun game, not a truthful projection database"
  (`outside_voice_overlay_tension`) — creative freedom lives in a **manifest
  overlay**; raw SessionCards stay unchanged as hidden source snapshots
  (D16, `simple_keep_original`). Originals always playable.
- Observer may stage encounters in quiet stretches: **restrained** intensity
  (`observer_intervention_intensity`), reusing existing enemy visuals with
  **no badge** — the unique, non-repeating voiced quip IS the disclosure
  (chat decisions; upheld against the outside reviewer's challenge,
  `outside_voice_quiet_enemy_tension`).
- No "Director's Notes" recap card (`director_notes_expansion` — skip).
- Chapter titles are **narrative arcs** ("building your first wiki",
  "troubleshooting bluebubbles") — traceable to the session record, produced
  by whatever method players will actually trust and engage with
  (`chapter_annotations_expansion`, `narrative_arc_authoring`).
- Agent-written session-specific Observer quips: **in scope now**
  (`agent_authored_quips_expansion`), behind the existing grounding checks
  (`grounding_gate` — keep current checks).
- **Remix** (combat tuning — "insanely difficult" etc.) is allowed
  (`recipe_mechanics_guardrail`) but only via fixed explicit profiles, with
  fully separate progress (D24), and only on explicit request.

**Consent & privacy**
- Before any AI reads anything: a short notice — *your selected AI will read
  snippets from N sessions* — one extra confirmation after depth choice
  (`simple_enrichment_consent`).
- No silent agent calls anywhere: opening a card or starting a run must never
  trigger enrichment or quip generation (`automatic_level_enrichment`, D23).
- Agent failure → deterministic **baseline fallback** builds the same campaign
  from real cards, disclosed to the player (D18).

**Interfaces**
- Simple UI, rich agent recipes (D25): the in-game surface stays minimal; the
  Hermes skill / CLI is the advanced surface ("find the hardest sessions and
  make him insanely difficult levels"), both driving **one canonical engine**
  (`canonical_enrichment_interfaces`).
- Too little history → **explain and wait** (`insufficient_history`): factual
  counts, no fabrication, no degraded stub campaign.
- Finish → **campaign premiere** (D20), not auto-start, not a silent return.
- **Ship in stages** (`staged_campaign_delivery`) — this is also what the
  eng review (6/10) demanded and the v2.7.0 attempt ignored.

## 3. Scope

**In scope (v1):** Session Director + manifest overlay foundation; SHAPE MY
OPENING; BUILD MY CAMPAIGN; fictional campaign; consent notice; honest job
progress; premiere; baseline fallback; grounding gate on agent copy; Hermes
skill parity via the canonical engine.

**Out of scope (v1):** re-enrich flows (D9); per-episode enrich buttons
("too granular" — chat); in-game recipe dashboards (D25); Director's Notes;
Task Dives (parked); any stat customization outside labelled Remix profiles.

**Systems touched:** `src/campaign.ts`, `src/session-director.ts` (salvage
from v2.7.0 attempt), `src/main.ts` (menu flow), `src/run.ts` (plan consumer),
`src/levels.ts` (progress namespaces), `vite.config.ts` (local job endpoints),
`scripts/enrich-campaign.mjs`, `skills/aiaio/SKILL.md`, tests.

**Failure modes & rollback:** agent absent/failing → baseline fallback
(disclosed); job interrupted → resumable from persisted per-session state;
manifest invalid → atomic publish means last-good stays live; total rollback =
delete manifest, raw cards untouched by design.

## 4. UX specification (the part v2.7.0 skipped — normative, not decorative)

Grounded in the DESIGN-ROADMAP research (PAIR mental models: visible system
state and honest affordances; Xbox guidelines: objective clarity, redundant
cues, readable text; GDC pacing) and AIAIO's TUI identity: **the flow is a
terminal transcript, because that is our design language.**

### 4.1 Entry
- Menu shows one primary command-style button: `✦ /enrich history` with a
  one-line subtitle ("your agent turns your history into a campaign").
- Depth chooser renders as two command options with factual eligibility
  printed underneath each, computed BEFORE the player commits:
  `SHAPE MY OPENING — 6 chronological levels · you have 87 eligible sessions ✓`
  `BUILD MY CAMPAIGN — 15–24 curated levels · you have 87 eligible ✓`
- Insufficient history: the option renders visible but disabled, with the
  factual sentence ("you have 4 of the 6 required — play/scan more history").
  Never a dead click.

### 4.2 Consent (one screen, one decision)
- States: which AI command will run (`claude -p`, `ollama …`, from config),
  that it will read **redacted snippets from N named sessions**, that raw
  cards never change, and whether the command is local or may leave the
  machine.
- Exactly one primary action: `[ CONFIRM — start enrichment ]`, one secondary:
  `[ back ]`. Buttons change state on click within 100ms (pressed → spinner).
  A second click on a running gate does nothing except pulse the status line
  (no double-start; the job lock already exists — surface it).

### 4.3 Progress (honesty is a mechanic here too)
- The job is a determinate batch: N sessions, each enriched independently.
  Progress = **real units**: `⏺ enriching 3/6 — "the alby hub rescue" · 0:42`.
  NO percentage interpolation, NO synthetic easing. If a unit is long, the
  elapsed clock and the current session name are the honest signal.
- Progress renders as a live TUI transcript (the game's own aesthetic):
  one `⏺` line per session start, `⎿ done · title` on completion,
  `⎿ fallback · agent failed, baseline copy used` on unit failure.
- The job survives page reload: state persisted per unit; reopening the menu
  shows `resume — 3/6 complete` instead of restarting.
- Cancel is always visible; cancel keeps completed units, publishes nothing.

### 4.4 Completion — the premiere
- On finish, an explicit **CAMPAIGN PREMIERE** screen: campaign title, the
  chapter/act list with narrative-arc names, per-level one-liners, and one
  primary action: `[ ▶ play episode 1 ]`. Secondary: back to menu (campaign
  visible at the top of the Memory Map from then on).
- If any units used fallback, the premiere says so factually, in one line.

### 4.5 Failure
- Whole-job failure → a real error screen: what failed, what was kept, two
  actions (`retry` / `build baseline campaign instead`). Silence is banned.

## 5. Technical design

- **SessionDirector** (pure, deterministic): SessionCard + recipe → level
  plan (stations, encounters, crates, terminals, pacing encounters). Same
  inputs, same plan. All authored content lives in a versioned
  **CampaignManifest** referencing card ids + content digests; atomic publish
  with last-good fallback. (Salvage: this architecture from the v2.7.0 tree.)
- **Job model (the rewrite):** per-session units executed sequentially by the
  local job runner; each unit writes its outcome (`done|fallback|failed`) to
  the persisted job state; the dev-server endpoint reports unit-level state;
  the UI polls and renders transcript lines. No blocking monolith batch.
- **Honest-progress invariant:** UI progress may only display counts and
  timestamps that exist in the job state file. Enforced by an E2E test that
  asserts no meter renders without a corresponding unit event.
- **Grounding gate** on all agent copy (existing checks, per Brad).
- **Progress namespaces:** history / campaign / fictional / remix are separate
  stores (salvage from v2.7.0).

## 6. Staged delivery (each stage independently playable + verified)

- **Stage A — foundation (salvage + verify):** SessionDirector, manifests,
  namespaces, fictional-campaign data. Gate: unit tests + deterministic-plan
  test + a human plays one fictional level.
- **Stage B — SHAPE MY OPENING, full UX:** entry, gates, consent, unit-based
  job runner, transcript progress, resume, premiere. Gate: the automated E2E
  flow test (choose → confirm → run → finish → premiere → play) plus scripted
  failure/rescue cases (agent absent; kill mid-job; reload mid-job) plus a
  human playtest.
- **Stage C — BUILD MY CAMPAIGN + fictional campaign in the public demo.**
  Gate: Stage B tests generalized; production-build test proves no personal
  assets ship.
- **Stage D — Remix profiles + Hermes-skill recipes** through the canonical
  engine. Gate: recipe validation tests; separate-progress verification.

No stage ships (or is journaled as shipped) without its gate AND a human
playtest. That rule exists because v2.7.0 was journaled as verified on
mechanical checks alone while the interactive flow was broken.

## 7. Acceptance criteria

1. E2E happy path passes headlessly and by hand, on a 900-card archive and on
   a 4-card archive (insufficient-history path).
2. Every progress signal maps 1:1 to a persisted job event (no fake meters).
3. Interrupted jobs resume; cancelled jobs publish nothing; failed jobs offer
   retry + baseline.
4. Raw SessionCards byte-identical before/after any enrichment.
5. Zero agent/LLM invocations without the consent screen in that session.
6. Production build contains no personal cards, no job endpoints, no ENRICH
   promises it can't keep (button hidden or clearly local-only in hosted demo).
7. Deterministic: same cards + same manifest version → identical campaign.
