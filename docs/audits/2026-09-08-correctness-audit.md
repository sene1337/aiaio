# AIAIO correctness and robustness audit — 2026-09-08

Scope: `src/run.ts`, `src/ui.ts`, `src/main.ts`, `src/session.ts`, `src/session-director.ts`,
`src/timeline.ts`, `src/observer.ts`, `src/audio.ts`, `src/music.ts`, `src/transition.ts`,
`src/monologue.ts`, `src/levels.ts`, `src/campaign.ts`, `src/enemies.ts`, `src/weapons.ts`,
`src/terrain.ts`, `src/physics.ts`, `src/context.ts`, `src/updates.ts`, `src/tasks.ts`,
`src/history.ts`, `src/telemetry.ts` — all 22 files, read in full (~7,865 lines).

**Method.** Every file above was read start-to-finish by hand (not grepped for keywords) and
traced against the hunt list in the brief: state leaks across runs, listener/timer leaks,
wall-clock-vs-rAF races, off-by-ones, NaN/undefined propagation, localStorage failures,
unhandled rejections, per-frame perf hotspots, audio-node hygiene, speechSynthesis queue growth,
keyboard edge cases, resize/DPR handling, stale UI, and dead/duplicated logic. A handful of
targeted `grep`s were used only to confirm whether a suspicious symbol has any callers (dead-code
verification), never as the primary bug-finding technique. Findings below are separated into
**VERIFIED** (traced through the actual code paths that would trigger them) and **SUSPECTED**
(plausible from the code but I could not fully confirm without running the app, which this audit
was told not to do). I did not run the dev server or open a browser, per the brief.

Nothing in `docs/PARKED-task-dives.md` is revisited, and no new features are proposed — this is a
bugs/robustness/perf pass only.

---

## Findings, ranked by player impact

### P0 — Blocker

#### 1. Unguarded `localStorage` access at module-load and constructor time can blank-screen the entire app
**Status: VERIFIED (code path traced through the import graph). Confidence: medium-high** —
high confidence the code pattern is a real regression against the codebase's own convention;
medium confidence on how many real users hit the trigger condition, since it depends on browser
privacy settings.

- Evidence: `src/observer.ts:308` — `voiceOn = localStorage.getItem(LS_VOICE) !== '0';` and
  `src/observer.ts:328` — `swearsOn = localStorage.getItem(LS_SWEARS) === '1';` are class-field
  initializers on `Observer`, and `src/observer.ts:757` does
  `export const observer = new Observer();` at **module scope**. Same shape in `src/audio.ts:14-20`
  (`AudioMixer`'s `userLevels`/`mono`/`muted` fields) with `export const audioMixer = new AudioMixer();`
  at `src/audio.ts:115`.
- `main.ts` imports `{ observer }` from `./observer` and `{ audio, audioMixer }` from `./audio`
  near the top of the file. ES module evaluation runs the entire imported module's top-level code
  — including these `export const x = new X()` singletons — **before `main()` is even called**
  (the `main();` call is the last line of `main.ts`). If `localStorage.getItem` throws in this
  environment (Safari with "Block All Cookies", some locked-down enterprise browsers, some
  privacy extensions that disable Web Storage entirely — a real, if not universal, condition),
  the module graph fails to evaluate. Nothing renders: not the game, not even the touch-only-device
  graceful gate at the top of `main()` (`src/main.ts:882-893`), because `main()` is never reached.
  The failure surfaces only as a console "Uncaught" error — a fully silent failure from the
  player's point of view, violating the "no silent failures" bar in the brief.
- A second, slightly less severe instance: `ui.ts:52` — `reducedFx = localStorage.getItem('aiaio-reduced-fx') === '1';`
  is a field on the `UI` class, which is instantiated inside `main()` (`ui = new UI();` at
  `src/main.ts:895`), i.e. after the touch-gate check but before `wireKeyboard`, `loadTimeline`,
  or `requestAnimationFrame(frame)` run. A throw here still kills the rest of `main()` synchronously
  (no wrapping try/catch), so the game never starts, though at least the touch-only gate would
  have already rendered for those users.
- A third, contained instance: `timeline.ts:119` (`localStorage.getItem('aiaio-track')` in the
  `Timeline` constructor) and `timeline.ts:128/351-352` (`setTrack`/`render`). `Timeline` is
  constructed inside `loadTimeline()` (`src/main.ts:213`), which is invoked as `void loadTimeline();`
  with **no `.catch()`** (`src/main.ts:904`). A throw here becomes an unhandled promise rejection;
  the rest of `main()` (keyboard wiring, the frame loop) still starts, but the entire front-door
  Timeline UI silently never renders — the player sees a menu shell with no way to pick a level.
- **Why this is a real regression, not a style nitpick:** the codebase already has the correct
  pattern in several places — `main.ts:146` (`customTrack()`), `main.ts:149` (`saveCustomTrack()`),
  and every localStorage touch in `levels.ts` (`loadProgress`, `recordResult`, `getCampaignProgress`,
  `recordCampaignResult`) wraps `JSON.parse`/`getItem`/`setItem` in `try {} catch {}`. The
  unguarded sites above are inconsistent with that established convention, not an intentional
  design choice.
- **Fix:** wrap each of these field initializers (and `Timeline`'s constructor/`setTrack`/`render`
  localStorage calls, and `transition.ts:17`'s `localStorage.getItem('aiaio-reduced-fx')`) in the
  same try/catch-with-fallback pattern already used in `levels.ts`. Since these are simple boolean/
  string reads, a tiny helper (`safeGet(key, fallback)`) used everywhere would close this class of
  bug in one pass.

---

### P1 — Major

#### 2. An "update gamble" nerf can silently and permanently disable involuntary compaction
**Status: VERIFIED (full path traced through 3 files). Confidence: high**

- The compaction-threshold nerf in `src/updates.ts:56` —
  `nerf: (t) => { t.compactionThreshold = Math.max(0.5, t.compactionThreshold - 0.08); }` —
  is applied by `Run.chooseCrateOption()`'s `'gamble'` case in `src/run.ts:692-711`. Note the
  order there: `this.spendTokens(RUN_COST.update)` runs **before** the gamble result is rolled
  (line 689), and `this.ctx.threshold = target.compactionThreshold;` (line 699) is a **raw
  assignment**, not routed through `context.ts`'s `spend()`.
- `context.ts`'s `spend()` (lines 28-32) is **edge-triggered**: it only signals a compaction when
  a token spend causes `overThreshold(m)` to flip from `false` to `true` in that same call
  (`return !wasOver && overThreshold(m);`). If the nerf drops `threshold` below the player's
  *already-current* `used` fraction (e.g. used 70%, old threshold 0.75, new threshold 0.67), the
  player instantly becomes "over threshold" without any `spend()` call ever observing the
  false→true transition. Every subsequent `burn()`/`spend()` call sees `wasOver === true` already,
  so `spend()` keeps returning `false` and `Run.compact()` is **never called again for the rest of
  the run**, no matter how many tokens are burned.
- **Player-visible consequence:** the "wall of forgetting" is the game's signature threat mechanic
  (surge, amnesia, un-shipped tasks — the whole point of the game per `AGENTS.md`), and this bug
  disables it. Meanwhile the HUD context bar (`ui.ts:1081` — `overThresh = ctxF >= run.ctx.threshold`)
  stays permanently red/over-threshold, visually implying imminent danger that mechanically will
  never arrive. It is presented to the player as a *nerf* ("new summarizer is more aggressive")
  but functionally behaves as an accidental, undisclosed buff.
- The player does have a manual escape hatch: pressing C (`voluntaryCompact()`, `run.ts:769-792`)
  forcibly resets `ctx.used` to 18% of budget regardless of this edge-case, because it checks
  whether `compactions` incremented rather than relying on `spend()`'s return value directly. But
  nothing tells the player they need to do this, or why the wall stopped surging.
- **Fix:** after any direct mutation of `ctx.threshold` (the gamble nerf/buff, `/tune context-manager`,
  model upgrades), explicitly check `overThreshold(this.ctx)` and call `this.compact()` if true,
  instead of relying solely on `spend()`'s crossing-edge detection. Equivalently, make `spend()`'s
  trigger level-triggered (`overThreshold(m)` alone) rather than edge-triggered, with compaction
  itself responsible for not re-firing every frame (it already resets `used` well under threshold).

#### 3. Stuck movement/work key: `held` Set is keyed by case-sensitive `e.key`, which changes under Shift
**Status: VERIFIED (documented KeyboardEvent behavior). Confidence: high**

- `src/main.ts:698-706`: the `held` Set is populated via `held.add(e.key)` on `keydown` and
  `held.delete(e.key)` on `keyup` (`main.ts:740, 784`). `currentInput()` checks
  `held.has('w') || held.has('W')` (and similarly for `a`/`A`, `d`/`D`).
- Per the DOM `KeyboardEvent` spec, `e.key` for a letter key reflects the **currently effective
  case** at the moment of the event, which depends on whether Shift (or Caps Lock) is active *at
  that instant* — not at the moment the physical key was first pressed. Concretely: press `w`
  (recorded as `'w'`), then press-and-hold Shift without releasing `w`, then release `w` — the
  `keyup` event now reports `e.key === 'W'` (Shift is down), so `held.delete('W')` removes an
  entry that was never added, and the original `'w'` entry is **never removed**. The character
  keeps moving/working as if `w` were still held, until `blur` or `visibilitychange` clears the
  whole `held` Set (`main.ts:785-788`).
- This is a real, reachable in-game scenario (a player reflexively tapping Shift for any reason —
  muscle memory from typing, or trying a capital-letter shortcut — while holding a movement or
  work key) and it directly contradicts the "no stuck keys (L-2)" comment already present at
  `main.ts:787`, which only covers the blur/visibility case, not this one.
- **Fix:** key the `held` Set by `e.code` (the physical key, e.g. `'KeyW'`, `'ArrowLeft'`), which
  is modifier-independent, instead of `e.key`. `FEATURE_KEYS`'s telemetry lookups can stay on
  `e.key` since they're cosmetic (first-use logging), but the actual held-state tracking should
  not be.

#### 4. HUD readouts (elapsed time, /compact cooldown) can visibly freeze while the player is idle
**Status: VERIFIED (traced the dirty-flag gate). Confidence: medium-high**

- `ui.ts:722-725`: `renderHud()` — which draws `round-label` ("T+Xs"), the compact-cooldown text
  in the status bar, HP/context bars, and all three side panels — only runs when
  `run.dirty !== this.lastDirty`. `Run.dirty` is incremented only on discrete gameplay events
  (`pushLog`, `pushBanner`, `burn`, `damageAvatar`, kills, etc. — see `run.ts`), never
  unconditionally once per frame from elapsed time.
- `Run.time` and `Run.compactCd` both advance every frame in `step()` regardless of `dirty`
  (`run.ts:900`, `run.ts:913`). If the player is fully idle — not moving (movement burns tokens
  every 10px via `burn()`, which does bump `dirty`, so *walking* keeps the HUD fresh), not firing,
  not working, with no nearby enemy triggering damage/emitter burns — nothing bumps `dirty`, so
  the "T+Xs" clock and the `/compact (Ns)` cooldown countdown in the status bar
  (`ui.ts:1068` — `c /compact${run.compactCd > 0 ? \` (${Math.ceil(run.compactCd)}s)\` : ''}`)
  visibly stop updating on screen even though the underlying values are changing.
- The most concrete real-play case: a player deliberately stands still and safe to wait out the
  20s `/compact` cooldown (a legitimate strategy the game itself suggests via "compact early,
  compact often"), and the cooldown countdown they're watching freezes mid-count until some
  unrelated event bumps `dirty`. This directly matches the brief's "no stale UI" bar.
- **Fix:** either bump `dirty` unconditionally once per frame (cheapest, though it defeats the
  purpose of the dirty-flag optimization), or split `renderHud` into a cheap always-updates
  sub-render for the handful of continuously-changing fields (time, cooldowns, wall gap) versus
  the event-gated panels.
- Related, lower-confidence (**SUSPECTED**) sibling bug in the same area: `ui.ts:726-729` gates
  `renderBanners()` on `run.banners.length !== this.lastBannerCount`. If a banner's TTL expires
  (`banners.shift()`) in the same `step()` call where a new banner is pushed (net length
  unchanged), the DOM never refreshes and the player briefly sees the old banner's text after it
  should have been replaced. I could not confirm how often two banner-affecting events actually
  land in the same frame in practice.

---

### P2 — Polish / robustness

#### 5. `speakSub()` has no queue guard; a chaotic subagent fight can grow an unbounded speechSynthesis backlog
**Status: VERIFIED (code path). Confidence: medium**

- `observer.ts:730-754`'s `speak()` (the main Observer voice) guards itself with
  `if (synth.speaking) return;` — it never talks over itself. `observer.ts:337-357`'s `speakSub()`
  (subagent voice lines, fired on spawn/corrupt/dying/occasional-kill events) has **no such guard**
  and is documented as intentionally queuing ("queues behind any observer line," line 355). In a
  fight with many subagent spawns/deaths/kills in quick succession (plausible with 2 concurrent
  subagents cycling rapidly, especially near the wall which eats them), each event enqueues a new
  `SpeechSynthesisUtterance` with no cap and no dedup, so the queue can grow faster than it drains,
  causing TTS commentary to increasingly lag behind — and eventually talk about — events long past.
- The file shows clear awareness of TTS pitfalls elsewhere (`wireSpeech`'s `onend`/`onerror`
  fallback timeout at `observer.ts:412-414`, explicitly commented "never leave the mix ducked or a
  stale subtitle pinned forever"), so this looks like a gap rather than a deliberate choice.
- **Fix:** either check `synth.speaking`/queue length before calling `speakSub`, or cap how many
  subagent utterances can be pending (e.g. skip the speech — but still log to the transcript — if
  more than 1-2 are already queued).

#### 6. Generative music never stops or resets — plays through every non-gameplay screen indefinitely
**Status: VERIFIED (`Music.stop()` confirmed to have zero callers via grep). Confidence: high**

- `music.ts:180-182` defines `stop()` to clear the `setInterval` driving `schedule()`. A repo-wide
  search confirms it is never called from anywhere. `music.ensure()` (`main.ts:742`, fired on every
  keydown) starts a `window.setInterval(() => this.schedule(), 120)` (`music.ts:89`) the first time
  it's invoked, and nothing ever stops it for the rest of the page's life.
- `music.tension`/`music.inside` are only updated inside `frameBody`'s `if (run && !$('screen-match').classList.contains('hidden'))` gate (`main.ts:848-852`). The moment the player leaves the match
  screen (menu, briefing, library, recap), that block stops executing, so `tension`/`inside` freeze
  at their last in-match value — but the interval-driven `schedule()` keeps composing and playing
  new pad chords and plucks against that frozen mood, forever, across the timeline/menu/library/
  briefing/recap screens. This isn't a leak in the sense of growing memory, but it is unintended,
  unwanted persistent background audio ("Clean audio mix" is an explicit AAA-bar item in the brief)
  that nothing in the UI explains or offers to pause outside of the global mute key.
- **Fix:** call `music.stop()` (or at minimum drop `tension` to 0 and pause scheduling) when
  leaving the match screen, and `ensure()`/resume it when a new match starts.

#### 7. `Terrain.surfaceAt()` is an O(height) linear scan called every frame for the avatar and for every grounded enemy
**Status: VERIFIED via code reading and complexity analysis; not measured/profiled. Confidence: medium on real-world FPS impact.**

- `terrain.ts:103-109`: `surfaceAt(x)` scans `y` from 0 up to `height` (900) looking for the first
  solid pixel in that column. It's called twice per frame for the avatar (`run.ts:987, 1005`) and,
  critically, once per frame **for every non-dead "grounded" enemy** in `stepEnemies()`
  (`run.ts:1149-1152`: `timeout_blob`, `regression_splitter`, `restart_crawler`, `tool_turret`,
  `overflow_emitter` all re-snap to `surfaceAt(e.x) - 10` every frame). With up to ~30-36 live
  hostiles (the `hostileBudgetCap`/`hostilePerTypeCap` in `campaign.ts`, higher under Brutal Remix)
  plus regression-splitter minis (which don't reduce the live count, since dead enemies are never
  removed from `Run.enemies` — see finding 9), this is dozens of O(height) scans per frame, 60
  times a second.
- Because `Terrain.generate()` fills each column contiguously from the surface line down to the
  floor (`terrain.ts:50-56`: `for (let y = surf; y < this.height; y++) mask[...] = 1`), and
  `carve()` only ever removes mass (never re-adds it), each column's solid region stays a single
  contiguous span for the life of the level. That means `surfaceAt` is a textbook binary-search
  candidate (O(log height) ≈ 10 comparisons instead of up to 900), or could be replaced by an
  incrementally-maintained per-column heightmap that `carve()` updates only for the columns it
  actually touches.
- **Fix:** binary search within `solidAt`'s known-monotonic column, or cache `surfaceY` per column
  in a `Uint16Array` sized `width`, updated inside `carve()` for the touched columns only.

#### 8. QA telemetry's page-unload flush uses `fetch()` without `keepalive`, so the final batch can be lost exactly when the code says it shouldn't be
**Status: VERIFIED (code gap). Confidence: high on the API gap; medium on real-world frequency (dev-only feature).**

- `main.ts:984-988`: `window.addEventListener('pagehide', () => qa.flush())` and the matching
  `visibilitychange` handler are explicitly commented "don't lose the tail of a play session when
  the tab closes." `telemetry.ts:53-58`'s `flush()` in dev mode does
  `fetch('/__qa', { method: 'POST', ... })` with **no `keepalive: true`**. Browsers are permitted
  (and in practice do, especially Safari and some Chrome versions) to abort in-flight `fetch`
  requests once the page is being unloaded; the documented, reliable API for exactly this situation
  is `navigator.sendBeacon()` or `fetch(..., { keepalive: true })`. As written, the pagehide flush
  can silently drop the last batch of telemetry — which is the one scenario the surrounding comment
  says it's guarding against. This only affects the dev-only QA pipeline (production always uses
  the synchronous localStorage fallback), so it has no player-facing impact, but it undermines the
  "evidence, not vibes" telemetry the team explicitly relies on for balance decisions.
- **Fix:** add `keepalive: true` to the `fetch` call, or switch to `navigator.sendBeacon('/__qa', ...)`
  for the pagehide/hidden path specifically.

#### 9. `Run.enemies` (and its side-table Maps) never prune dead entries; long fights and repeated regression-splitter kills grow the per-frame iteration cost monotonically
**Status: VERIFIED. Confidence: medium (bounded, not catastrophic, but avoidable).**

- `run.ts` never filters `this.enemies` to drop dead ones (contrast with `this.subagents`, which
  *is* filtered every frame at `run.ts:878`: `this.subagents = this.subagents.filter((sa) => sa.hp > 0);`).
  `stepEnemies()` (`run.ts:1125`) and the enemy-touch/collision code iterate the full array every
  frame, skipping dead entries with an early `continue` — so it's not incorrect, just an ever-growing
  amount of skipped work. Regression splitters add 2 live minis per kill (`run.ts:1111-1117`), so a
  fight that farms splitters strictly grows `enemies.length` for the rest of the run (bounded to
  roughly 3x the original splitter count, since minis don't re-split, but never shrinks).
- Two side tables compound this: `touchCooldowns = new Map<Enemy, number>()` (`run.ts:277`) and
  `observerInterventions = new Map<Enemy, string>()` (`run.ts:280`) both key by `Enemy` object
  reference and are never cleaned up for enemies that die without ever triggering their entry's
  removal path (`observerInterventions.delete(e)` only runs when the intervention actually fires
  within 700px of the player — an enemy that dies from range keeps its map entry forever).
- None of this is likely to be catastrophic for a single run given the spawn caps (~30-36 hostiles),
  but it's an easy, free cleanup and matches the brief's explicit "unbounded arrays" hunt item.
- **Fix:** filter `this.enemies` (and the two Maps) to drop dead entries once, e.g. at the top of
  `stepEnemies()`, the same way `subagents` already is.

#### 10. Confirmed-still-present: `allocateSpawns` is duplicated between `enemies.ts` and `scripts/scan-sessions.mjs`
**Status: VERIFIED the duplication still exists in `enemies.ts` (scripts/ was out of audit scope, so I did not re-check the other copy). Confidence: high that the trap is real, per the code's own comment.**

- `enemies.ts:94-95` carries the comment "NOTE: scripts/scan-sessions.mjs duplicates the budget
  curve for the gallery display — keep them in sync," and `AGENTS.md` independently lists this as
  a known trap that has "already cost a debugging session." I confirm the `enemies.ts` side (the
  live gameplay budget curve at `allocateSpawns`, lines 97-129) is exactly as documented — a single
  source of truth that a second file must be kept in sync with by hand. Since `scripts/scan-sessions.mjs`
  was outside this audit's file list, I did not verify whether the two curves currently agree — only
  that the duplication itself, and the risk it names, is real and unchanged. Worth a follow-up pass
  specifically diffing the two formulas.

#### 11. Dead code inventory
**Status: VERIFIED via targeted grep (zero callers each). Confidence: high.**

- `session.ts:322` `terrainParamsFromCard()` (+ its `TerrainParams` interface) — unused. Notably,
  its formula (`width = clamp(1400 + messages*4, 1400, 3000)`) **disagrees** with the terrain
  sizing formula actually used in `Run`'s constructor (`run.ts:289`:
  `width = clamp(2400 + messages*7, 2400, 6000)`). Since only the live copy in `run.ts` is ever
  exercised, this is currently harmless, but it's exactly the kind of stale duplicate a future edit
  could "fix" in the wrong place. Recommend deleting the dead one rather than leaving two divergent
  formulas for the same concept.
- `session.ts:422` `EXAMPLE_CLEAN` — unused (its sibling `EXAMPLE_CHAOTIC` is used by `qa/autoplay.ts`).
- `levels.ts:242` `unlockedTiers()` — unused; a leftover from the pre-Timeline tier/Vault system
  (per `docs/JOURNAL.md`, superseded by THE TIMELINE in v2.10.0).
- `weapons.ts:92` `WEAPON_ORDER` — unused.
- `tasks.ts:111` `distract()` — unused; superseded by the inline enemy-stun implementation of
  `distraction_barrage` in `run.ts` (`fire()`'s `'task_attack'` branch), per the documented "solo
  repurpose" in `README.md`.
- `history.ts:109` `focusedChapter()` — unused; likely a leftover from an earlier Timeline design
  that showed one focused chapter per era instead of the current expand-to-all-chapters UI.
- None of these are load-bearing; all are safe, low-risk cleanup (P3, bundled here rather than
  given individual severity ratings).

#### 12. Enrich modal's generic "Cancel" button does not stop the status-polling interval
**Status: SUSPECTED — could not confirm the DOM structure of `#modal-enrich` (index.html was out
of scope), so I don't know whether `btn-enrich-cancel` is reachable while a job is actively
polling. Confidence: low-medium.**

- `main.ts:927`: `$('btn-enrich-cancel').addEventListener('click', () => $('modal-enrich').classList.add('hidden'));`
  only hides the modal. It does not call `window.clearInterval(enrichmentPoll)`. Compare
  `btn-enrich-job-cancel` (`main.ts:924-926`), which POSTs `/__enrich/cancel` to the server and
  relies on `pollEnrichment()` observing `status.status === 'cancelled'` to clear the interval
  itself (`main.ts:467-470`) — that path is correct. If `btn-enrich-cancel` is visible/clickable
  while `enrichmentPoll` is running (e.g. the player dismisses the dialog by a different route than
  the job-cancel button while attached to a live job), the 1s `/__enrich/status` polling would keep
  running silently in the background for the rest of the session. This is dev-only tooling, not a
  production/player-facing issue, but worth a quick defensive fix: have the generic cancel handler
  also clear `enrichmentPoll` unconditionally.

---

## Also checked, no issues found

- **Hidden-tab rAF pause (the trap named in `AGENTS.md`).** `main.ts:822` clamps
  `dt = Math.min(0.05, (t - lastT) / 1000 || 0.016)` before it reaches `run.step()`, so a large gap
  from a backgrounded tab cannot produce runaway per-frame movement/physics. Progress recording
  (`recordResult`/`recordCampaignResult`) happens synchronously inside `run.emit`'s `'win'`/`'death'`
  handling, which fires from within `run.step()` itself — not deferred to a later frame — matching
  the pattern `AGENTS.md` documents as correct. `transition.ts`'s `wallWipe()` additionally backs
  its rAF-driven animation with wall-clock `setTimeout`s so the screen swap and cleanup happen even
  if `requestAnimationFrame` stalls.
- **Audio node hygiene.** `audio.ts`'s `tone()`/`noise()` never call `.disconnect()`, but per the
  Web Audio API spec, source nodes with no pending audio and no remaining JS references are
  eligible for garbage collection once their `stop()` time passes, regardless of whether they
  remain wired to a persistent downstream bus node. All node references in this file are local
  to their creating function (never stored), so this is correct, not a leak.
- **NaN/undefined propagation from optional card fields.** `session.ts`'s `parseSessionCard()`
  validates every numeric field through a `num()` helper requiring `isFinite`, and every array
  field is bounds-checked and clamped (`at` fields required to be `0..1`). `loadoutFromCard()`
  consistently uses `?? 0`/`clamp()` on every derived value. I did not find a path from a
  maliciously or accidentally malformed SessionCard JSON file to a `NaN` reaching gameplay math.
- **Resize/DPR handling.** `ui.ts`'s `render()` recomputes canvas backing size from
  `wrap.clientWidth/clientHeight * devicePixelRatio` every frame and only touches `canvas.width/height`
  when they've actually changed — no resize listener needed, no thrashing.
- **Keyboard listener lifecycle.** All `keydown`/`keyup`/`blur`/`click`/`dragover`/`drop` listeners
  are wired exactly once at boot (`main()`'s `wireKeyboard()`/`wireCardSlot()`), not re-attached per
  run or per screen transition — no listener accumulation across retries.
- **`observer.bindSink()`.** Confirmed it *replaces* the sink field rather than accumulating an
  array of them (`observer.ts:369-371`), so repeated `prepareRun()` calls across retries do not
  cause duplicate transcript lines.
- **`session-director.ts`'s `claim()` overlap resolution.** Only searches rightward when resolving
  station/crate overlaps (unlike `placeEncounter`, which fans both directions), so it could in
  theory stack entities at the right edge of a very dense level. Given current caps (≤5 stations,
  ≤5 crates, 1 permission terminal, minimum level width 2400px), I judged this low practical
  frequency and did not give it its own numbered finding.

---

## Summary table

| # | Finding | File(s) | Severity | Status | Confidence |
|---|---|---|---|---|---|
| 1 | Unguarded localStorage crashes app at load | observer.ts, audio.ts, ui.ts, timeline.ts | P0 | Verified | Med-High |
| 2 | Update nerf can permanently disable compaction | context.ts, updates.ts, run.ts | P1 | Verified | High |
| 3 | Stuck key via case-sensitive `e.key` + Shift | main.ts | P1 | Verified | High |
| 4 | HUD time/cooldown freezes while idle | ui.ts, run.ts | P1 | Verified | Med-High |
| 5 | Unbounded speechSynthesis queue via speakSub | observer.ts | P2 | Verified | Medium |
| 6 | Music never stops across screens | music.ts, main.ts | P2 | Verified | High |
| 7 | O(height) surfaceAt scan in hot per-frame paths | terrain.ts, run.ts | P2 | Verified | Medium |
| 8 | Telemetry pagehide fetch lacks keepalive | telemetry.ts, main.ts | P2 | Verified | High (dev-only) |
| 9 | Enemy array/side-Maps never pruned | run.ts | P2 | Verified | Medium |
| 10 | allocateSpawns duplication trap still present | enemies.ts | P2 | Verified | High |
| 11 | Dead code (6 symbols, incl. one divergent duplicate) | session.ts, levels.ts, weapons.ts, tasks.ts, history.ts | P3 | Verified | High |
| 12 | Enrich modal cancel may leak polling interval | main.ts | P2 | Suspected | Low-Med |

Audited: run.ts — 3 findings (enemy/Map cleanup, banner-refresh cross-reference, surfaceAt hotspot origin)
Audited: ui.ts — 2 findings (HUD dirty-flag staleness, banner refresh race)
Audited: main.ts — 3 findings (stuck key, localStorage crash site, enrich-cancel interval leak)
Audited: session.ts — 1 finding (dead code + divergent duplicate formula)
Audited: session-director.ts — 1 finding (claim() unidirectional overlap, noted, not numbered)
Audited: timeline.ts — 1 finding (localStorage crash site)
Audited: observer.ts — 2 findings (speakSub queue growth, localStorage crash site)
Audited: audio.ts — 1 finding (localStorage crash site); audio-node hygiene checked clean
Audited: music.ts — 1 finding (stop() dead code / persistent background music)
Audited: transition.ts — 0 findings (well-defended against the rAF trap); 1 minor localStorage site noted under finding 1
Audited: monologue.ts — 0 findings
Audited: levels.ts — 1 finding (dead code); otherwise a model example of defensive localStorage use
Audited: campaign.ts — 0 findings
Audited: enemies.ts — 1 finding (confirmed documented duplication trap still present)
Audited: weapons.ts — 1 finding (dead code)
Audited: terrain.ts — 1 finding (surfaceAt perf hotspot)
Audited: physics.ts — 0 findings
Audited: context.ts — 1 finding (edge-triggered threshold bug, root cause of finding 2)
Audited: updates.ts — 1 finding (the nerf that triggers finding 2)
Audited: tasks.ts — 1 finding (dead code)
Audited: history.ts — 1 finding (dead code)
Audited: telemetry.ts — 1 finding (pagehide fetch keepalive)
