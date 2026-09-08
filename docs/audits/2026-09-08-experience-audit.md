# AIAIO player-experience audit — 2026-09-08

Read-only audit. Technique: LLM judgment from full reads of every file listed below
(no keyword grep as a judgment method; grep was used only a few times, after forming
a hypothesis, to confirm an absence — e.g. "is there an Escape handler anywhere" —
never to generate findings). Cross-referenced against `docs/DESIGN-ROADMAP.md` (prior
expert audit, July) and `docs/research/design-research-notes.md` (source citations)
to avoid re-reporting already-fixed issues and to carry forward only what's still open.

**Files read in full:** `AGENTS.md`, `README.md`, `docs/DESIGN-ROADMAP.md`,
`docs/research/design-research-notes.md`, `docs/JOURNAL.md` (whole file), `index.html`,
`src/style.css`, `src/main.ts`, `src/ui.ts`, `src/run.ts`, `src/timeline.ts`,
`src/observer.ts`, `src/audio.ts`, `src/music.ts`, `src/enemies.ts`, `src/weapons.ts`.
`terrain.ts`, `session-director.ts`, `levels.ts`, and `session.ts` were **not** read this
pass (outside the requested file list) — pacing/spawn-placement findings from the prior
audit are carried forward as unverified, not re-confirmed, and are labeled as such.

No mechanics changes are proposed. Every fix below is a clarity/feedback/consistency
change to existing systems, per the audit brief.

---

## Top findings, ranked by player impact

| # | Severity | Dimension | Finding | Verified? |
|---|---|---|---|---|
| 1 | **P0** | Onboarding | The only in-game control legend is an 11px, single-line, `overflow:hidden; white-space:nowrap` status bar — it can be truncated on narrow viewports and is the sole non-README source of "how do I play" | VERIFIED |
| 2 | P1 | Feel/Accessibility | "reduce shake & flashes" setting does not suppress the hit-flash screen vignette | VERIFIED |
| 3 | P1 | Accessibility | Canvas shake/glitch/flash never reads `prefers-reduced-motion`; only a manual toggle exists | VERIFIED |
| 4 | P1 | Feel (death clarity) | The recap never states *what* killed you, only *how* (wall / combat / exit) | VERIFIED |
| 5 | P1 | Audio mix | No Observer/voice volume control — only a binary on/off; contradicts the project's own roadmap item | VERIFIED |
| 6 | P1 | Terminal-native identity | Enemy/projectile glyphs use color-emoji codepoints (⏱👻🔧📈🔁) that render in full color on default OS fonts, contradicting "no illustrated sprites" | VERIFIED (code) / high-confidence render risk |
| 7 | P1/P2 | Readability under action | J-space background layers (thought stream, sparks, attention streams) gain the most opacity/size in exactly the 560px radius around the avatar where combat also happens | SUSPECTED (needs a play session) |
| 8 | P2 | Onboarding/feel | Denied subagent spawn ("Task tool not granted") is a transcript line only — no banner, no distinct sound | VERIFIED |
| 9 | P2 | Accessibility/flow | No modal (settings, schema, enrich, premiere, library) closes on Escape; `.tl-node` map chips have no `:focus-visible` style | VERIFIED |
| 10 | P2 | Visual consistency | Vestigial "player 1" color CSS on the session-info panel (a single-player game) | VERIFIED |
| 11 | P2 | Visual consistency | `tool_turret`'s body glyph (🔧) doesn't match its own projectile's glyph (⚙) | VERIFIED |
| 12 | P2 | Feel/juice | Recovery Shield's shield-gain has no unique confirmation sound (unlike shield-absorb, which has one) | VERIFIED |
| 13 | — | Pacing | Prior audit's spawn-clustering / terrain-reachability findings not re-confirmed (out of this pass's file scope) | CARRIED FORWARD, unverified |

---

## 1. Onboarding and teachability

**P0 — No in-game control legend beyond a truncatable status line.**
`index.html`'s briefing screen (`#screen-briefing`, lines 55-64) shows task queue and
loadout (`ui.ts` `buildBriefing()`, lines 1237-1305) but never lists ←→/↑/↓/space/W/U/S/C.
The only place all controls appear together is `renderHud()`'s `#status-bar` string
(`ui.ts` 1061-1072), styled at `font-size: 11px` (`style.css` 504-508) with
`white-space: nowrap; overflow: hidden` and no scroll — on a narrow window the tail of
the line (voice cycling, mute) is silently clipped, not wrapped or scrolled. A
first-time player who hasn't read the README must find move/jump/fire/work/compact/
subagent by scanning a single dim 11px line while the wall is already advancing.
This directly contradicts the primer's own bar: "a first-time player understands what
to do within seconds without reading."
- Fix: add a compact "CONTROLS" block to the briefing screen (same content the README
  already has under "Play") so it's read once, calmly, before the run starts — not
  discovered mid-combat. Keep the status bar as the persistent reference, but stop
  making it the *only* teaching surface.
- Confidence: high.

**P1 — Contextual "inboarding" is done well and should be the template.** Positive
finding, not a fix: the work-station hint ("hold W: …") only appears when standing at
a station (`ui.ts` 1202-1206), the `/compact` hint only appears once context passes 40%
(`ui.ts` 1211), and the permission-terminal hint only appears near the terminal. This
matches the PAIR Guidebook's "inboard in context" rule cited in the research notes and
should be the pattern extended to the control legend above, not replaced by it.

**P2 — Subagent-denied feedback is text-only.** `run.ts` 748-750:
```
if (!this.subagentsUnlocked && !cached) {
  this.pushLog('⛔ permission denied: Task tool not granted. find the [y/n] terminal');
  return;
}
```
Every other rejected/failed action in the game (compaction, /compact-too-late, crate
already used) gets at minimum a distinct log line; this one additionally deserves a
banner or its own SFX cue the first time it happens, since a first-time player pressing
S early currently gets no feedback distinguishable from ordinary transcript chatter.
- Fix: on first denial per run, push a 2-3s info banner ("Task tool required — find the
  [y/n] terminal") the same way `claimPermission()` already does for the grant.
- Confidence: high.

Audited: onboarding — 3 findings

## 2. Readability under action

**P1/P2 SUSPECTED — J-space layers peak in density exactly where combat happens.**
`drawJSpace()` (`ui.ts` 178-261) draws four concurrent background layers: a latent
nebula (L1), attention-stream particles (L2), the thought-stream field (L2.5), and
sampling sparks (L3). The thought-stream's alpha explicitly *increases* the closer a
word is to the avatar (`glow = Math.max(0, 1 - d/560)`, alpha up to 0.34, `ui.ts` 234-236)
— i.e. the "flashlight" effect brightens text in the same 560px radius where enemies,
telegraphs, and projectiles need to read clearly. The roadmap's own salience ladder
(avatar > threat > objective/exit > wall > terrain/particles/telemetry, restated in
`design-research-notes.md`) puts particles/telemetry last; this system was designed to
get *more* visually assertive near the player, which is the opposite direction. Code
reading can't settle whether this reads as "atmospheric" or "cluttered" in motion —
needs a play session at a real combat cluster (2+ telegraphing enemies plus a thought
cluster) to confirm.
- Fix if confirmed: cap thought-stream alpha inside a smaller "combat-safe" radius (e.g.
  120px) around the avatar specifically, or fade thought text out while `telegraphing`
  enemies are on screen, rather than a flat distance falloff.
- Confidence: medium (code-verified mechanism; visual severity unverified).

**Positive, verified:** enemy name labels only render when `relevant` (near, telegraphing,
or stunned — `ui.ts` 486-487, 917-921), matching the roadmap's "labels near/on first
encounter" rule. HP pips are small but present only for hostiles. World-space text
(station labels, crate prompts, enemy names) is explicitly divided by `camZoom` (e.g.
`ui.ts` 812, 846) so it holds constant screen size across the three zoom steps
(`ui.ts` 336) — good defensive practice against the "font sizes vs zoom" failure mode
called out in the roadmap.

**P2 — Weapon tooltip is hover-only, unreachable from keyboard during play.**
`.weapon-slot:hover .tooltip` (`style.css` 464) is the only way to see a weapon's
source-log flavor text and isn't reachable by keyboard, but this is low-severity: the
same flavor text is already shown once in the briefing's LOADOUT list (`ui.ts` 1256-1259)
before the run starts, so nothing is permanently hidden from a keyboard-only player.
- Confidence: high (code-verified); severity low because the info isn't actually lost.

Audited: readability under action — 2 findings (1 suspected, 1 minor)

## 3. Feel / juice

**P1 — "reduce shake & flashes" doesn't reduce the hit-flash vignette.**
`ui.ts` 370-371:
```
ctx.save();
if (this.reducedFx) { this.shakeMag = 0; this.glitchTtl = 0; this.whiteFlashTtl = 0; }
```
`hitFlashTtl` (the red radial vignette drawn at up to 0.28 alpha across the whole
canvas on every hit, `ui.ts` 703-718) is not in this list. A player who enables this
accessibility setting still gets full-screen red flashing on every hit — the one effect
most likely to be the actual reason someone reaches for the setting.
- Fix: add `this.hitFlashTtl = 0;` to the same guard, or scale its alpha by a
  `reducedFx ? 0.3 : 1` multiplier if some feedback should remain.
- Confidence: high.

**P1 — Death clarity: the recap never says what killed you.** `run.ts` `finish()`
(483-488) sets `headline` from only three fixed strings — `'FORGOTTEN: the wall took
the whole process'`, `'PROCESS KILLED: exit code 137'`, or a survive/perfect line — with
no reference to which enemy or attack landed the final blow. `ui.buildRecap()` (1329-1333)
renders that same generic headline verbatim, and `main.ts`'s `buildForward()` (479-519)
never adds a cause either. The *only* place a cause is ever named is the transient
transcript line pushed in `damageAvatar()` ("💢 took N from timeout-blob mortar",
`run.ts` 427), which sits in a 3-line, 11px feed and has almost certainly scrolled off
by the time the 1.5s wall-wipe transition finishes and the recap appears. The audit
brief specifically asks whether a player knows *why* they died — right now, for combat
deaths, they don't, unless they were watching the transcript at the exact moment.
- Fix: thread the last-damage `source` string (already computed in `damageAvatar`) into
  `RunOver` and surface it on the recap headline, e.g. "PROCESS KILLED: exit code 137 —
  timeout-blob mortar caught you heads-down."
- Confidence: high.

**P2 — Recovery Shield has no unique gain confirmation.** In `fire()`'s `'support'`
branch (`run.ts` 557-563), gaining shield only pushes a log line and returns — no
`emit()` call, so no dedicated sound plays for the *gain* (only the generic `fire` sound
from earlier in the function, and a *different* sound, `shieldAbsorb()`, plays later when
that shield is spent absorbing a hit). Every other weapon in the game has a load-bearing
kill/impact sound; this is the one action whose payoff is silent.
- Fix: emit a `'shield_gain'` event and route it to `audio.shieldAbsorb()` (already
  exists, appropriate tone) or a new short chime.
- Confidence: high.

**Positive, verified:** hit feedback is genuinely well-layered — directional radial
vignette tied to attack origin (`hitFlashDir`, `ui.ts` 279, 710-718), hitstop scaled by
kill quality (0.03 vs 0.085s, `run.ts` 1105), particle name-scatter on kill, and a
three-part telegraph→execution→confirmation sound language on the timeout-blob, sniper,
and tool-turret (`run.ts` `stepEnemies`, telegraphing states + `threat_warning` emits).
This is above the bar the roadmap set and worth preserving as-is.

Audited: feel/juice — 3 findings (2 fixes, 1 gap in an otherwise strong system)

## 4. Pacing and difficulty curve

Not independently re-verified this pass — `terrain.ts`, `session-director.ts`,
`levels.ts`, and `session.ts` (the files that actually place spawns and validate terrain)
were outside the requested reading list. The prior `DESIGN-ROADMAP.md` audit flagged
spawn-position stacking (88% of an 884-card sample) and missing reachability/slope
validation as still-open under "P2: Complete the agentic grammar," and nothing in the
files read this pass (enemies.ts's `allocateSpawns`, run.ts's placement consumption)
contradicts that being still open. Carrying forward rather than re-stating as new.

One positive, verified item: the Observer's idle nudge (30s no-progress →
`remark('idle', ..., 0)`, `observer.ts` 657-660) matches the XAG-109 "reminder after no
progress" pattern cited in the research notes, and the zap-heat gauge shows a live
`heat X/8` counter in the weapon bar before the mandatory "thinking" cooldown hits
(`ui.ts` 1148-1150), so that particular forced pause is forewarned rather than a surprise.

Audited: pacing/difficulty — 0 new findings (1 carried-forward item, not re-verified)

## 5. Screens and flow

**P2 — No modal closes on Escape.** `grep -n Escape src/*.ts` finds exactly one hit:
`timeline.ts` 498, which only handles collapsing an expanded era on the Timeline itself
— and `Timeline.onKey` explicitly bails out while any modal is open
(`if (document.querySelector('.modal:not(.hidden)')) return;`, line 491). None of
settings, schema, enrich, premiere, or library (`main.ts` — all wired via `.addEventListener('click', ...)`
only) bind an Escape handler. Every close button is a real `<button>`, so Tab+Enter
still works — this isn't a keyboard dead end — but Escape-to-close is a near-universal
expectation the research notes explicitly cite (XAG-112: consistent interaction grammar
across the whole game).
- Fix: one shared `document.addEventListener('keydown', e => { if (e.key==='Escape') closeTopModal(); })`
  covers all five modals.
- Confidence: high.

**P2 — `.tl-node` map chips have no `:focus-visible` style.** `style.css` defines
`.cmd:focus-visible` (line 284) for command-palette rows but nothing equivalent for
`.tl-node` — only a JS-driven `.focused` class (`timeline.ts` `applyFocus()`, 461-479)
that tracks arrow-key/hover navigation, which is a *separate* state from real DOM
keyboard focus. Tabbing to a `.tl-node` button (they are real `<button>` elements, so
Tab does reach them) falls back to the browser's unstyled default outline rather than
the app's own focus language, and does not visually match or move the on-map "guy"
cursor. Not a hard blocker (Enter still works after Tab), but it's the one interactive
surface in the game without a deliberate focus treatment — worth noting since XAG-113
explicitly calls out "invisible or barely-visible focus" as the named anti-pattern.
- Fix: add a `.tl-node:focus-visible` rule matching `.tl-node.focused`'s treatment, and/or
  sync `applyFocus()`'s cursor to native `focus` events, not just click/hover/arrow-key.
- Confidence: high.

**Positive, verified:** the touch-only gate (`main.ts` 880-893) is an honest, clearly-
worded dead end rather than a silent failure — it explains *why* and *how* to fix it
(desktop + keyboard), matching the "no dead ends, no silent failures" bar. ENRICH's
dev-only gating (`main.ts` 396-401) is also honestly communicated in-UI rather than
silently broken. Recap always offers exactly one next action (continue/retry, plus
timeline-back), matching the Hades-pattern research note about one continuation action.

Audited: screens and flow — 2 findings

## 6. Audio mix and voice

**P1 — No Observer/voice volume control.** `index.html`'s settings grid (132-146) has
sliders for `music`, `sfx`, `ui`, plus mono/captions/reduced-fx/swears checkboxes — no
Observer or voice-over slider. `observer.ts` hardcodes `u.volume` in every utterance
path: `0.85` in `speak()` (line 750) and `speakQueued()` (line 517), `0.8` in
`speakSub()` (line 354), `0.9` in `badNews()` (line 724) — none read from
`audioMixer`. V toggles Observer speech fully on/off (binary) but there is no way to
turn the Observer down without silencing it, and no way to turn it up relative to SFX.
This is the one item from `DESIGN-ROADMAP.md`'s P1 accessibility list
("Independent Master, Observer, Music, SFX, UI, and Ambience controls") that the
Journal's v2.8.0 settings pass didn't cover — the shipped settings modal has
music/sfx/ui but the roadmap's own list names Observer and Ambience as separate buses
that never materialized.
- Fix: add a fourth slider (`voice`) to the settings grid, wire it into
  `AudioMixer.userLevels`, and read it in the three `u.volume =` call sites above.
- Confidence: high.

**Positive, verified:** speech ducking is real and asymmetric per bus
(`AudioMixer.setSpeechActive`, `audio.ts` 103-112: music to 35%, sfx to 58%, with
different attack/release times), matching the research notes' 6-9dB ducking guidance.
Repetition is actively managed via `FreshPick` (no-repeat-until-exhausted per pool,
`observer.ts` 56-67) and per-event minimum gaps (`GLOBAL_GAP_S`/`EVENT_GAP_S`/priority
system, 664-701) — a genuinely above-bar implementation of the "repetition management"
dimension the original roadmap scored 2.5/5. `speak()` also refuses to talk over itself
(`if (synth.speaking) return`, line 734) while still writing the line to the transcript,
so text is never lost even when audio is skipped.

Audited: audio mix and voice — 1 finding (in an otherwise strong system)

## 7. Visual consistency

**P1 — Enemy/projectile glyphs risk breaking the monochrome terminal identity.**
`enemies.ts`'s `ENEMY_DEFS` glyphs (27-66) include ⏱ 👻 🔧 📈 🔁 — all Unicode
codepoints with default emoji presentation on macOS/Windows/most mobile browsers. Canvas
`fillText`/`strokeText` (used throughout `drawEnemy()`, `ui.ts` 853-930, including the
double-outline `outlinedGlyph()` helper) cannot force these to render in a chosen
`fillStyle` color or the monospace font stack — the browser substitutes its native color
emoji font regardless of `ctx.font`/`ctx.fillStyle`. On the common case (macOS Chrome/
Safari, most Windows browsers) these WILL render as full-color illustrated glyphs, which
is exactly what `AGENTS.md`'s own invariant rules out: "Terminal-native identity: glyphs,
terminal windows, transcripts. No illustrated sprites." The other enemy glyphs (⚡ ☢, and
all UI glyphs: ☐ ☒ ⏺ ⎿ ✻ ✦ ▓ ░) are dingbats/box-drawing that reliably render
monochrome. This is a code-level, verifiable choice; only the *degree* of visual clash
depends on the viewer's OS/browser font substitution, which is well-documented browser
behavior, not a hypothesis.
- Fix: swap ⏱ 👻 🔧 📈 🔁 for monochrome alternatives from the same box-drawing/dingbat
  set already used elsewhere (e.g. the game's own ▓░▒█ corruption glyphs, or simple
  geometric substitutes — the shapes drawn under each glyph via `ctx.beginPath()` already
  carry most of the silhouette identity per-kind, so the glyph itself doesn't have to do
  all the work).
- Confidence: high on the code fact (glyphs are emoji-range codepoints); high on the
  rendering behavior (well-established browser/OS default); the finding is graded
  VERIFIED rather than SUSPECTED because both premises are independently confirmable
  without a play session.

**P2 — `tool_turret`'s body glyph doesn't match its own projectile's glyph.** The enemy
is 🔧 (`enemies.ts` 53) but its bolt's `FLIGHT` definition uses ⚙ (`run.ts` 90,
`tool_bolt: { head: ['⚙'], ... }`). Every other enemy's projectile glyph is thematically
continuous with its body (e.g. context_nuke's `█▓` matches the nuke enemy's block shape).
This one is a minor missed link in glyph vocabulary, independent of the emoji issue above
(⚙ is also nominally emoji-range but commonly renders as a plain gear across platforms —
the mismatch itself, not the color risk, is the finding here).
- Fix: use the same glyph (pick either) for both the tool-turret body and its bolt.
- Confidence: high.

**P2 — Vestigial "player 1" CSS on the session-info panel.** `panel-1` displays session/
error-roster info (`renderSessionPanel`, `ui.ts` 1116-1138), not a second player, yet
`style.css` carries `.player-panel.p1.active { border-color: var(--clay); }` (376) and
`.p1 .task-row.current { color: var(--clay); }` (386) — leftover rules from what reads
like an earlier two-player-local design. In practice `renderSessionPanel` never adds
`.active` to panel-1 (`panel.className = 'player-panel p1'`, no `active`), so the rule
is currently inert, not actively confusing on screen — but it's dead CSS that could
mislead the next person editing panel styling into thinking panel-1 is a "player."
- Fix: none urgent; flag for a future cleanup pass, not a player-facing fix.
- Confidence: high (code fact); severity low (currently inert).

Audited: visual consistency — 3 findings

## 8. Accessibility basics

**Contrast — verified adequate, not independently re-measured pixel-by-pixel.**
`style.css`'s own comment documents `--dim: #8f8b82; /* ≥4.5:1 on --bg and --bg-panel
(WCAG AA) */` (line 10), and `design-research-notes.md` records a Codex-measured 5.3:1
against panel backgrounds versus Microsoft's 4.5:1 bar for standard text. Consistent
with what's in the CSS; no contradicting evidence found in the files read.

**Motion — see §3/§7 above (P1, hit-flash + reduced-motion), not repeated here.**

**Focus — see §5 above (P2, `.tl-node`), not repeated here.**

**Captions — Observer-only, and that's an appropriate scope.** `#set-captions` gates
`ui.setCaption()` (`ui.ts` 105-118); SFX events don't get text captions, but every
SFX-carrying event already has a paired visual cue (popups, particles, telegraphs,
directional flash) per the XAG-103 "never sound-only" rule — so the *absence* of SFX
captions isn't itself a gap here, since the redundant channel already exists visually.

Audited: accessibility basics — 0 new findings beyond what's cross-referenced in §3/§5/§7

## 9. Terminal-native identity

Covered in depth in §7 (emoji glyphs, P1). Beyond that: the rest of the identity system
is unusually disciplined and consistent with `AGENTS.md`'s invariants — ⏺/⎿ transcript
bullets, ☐/☒ task glyphs, boxed `> ` prompt with a blinking block cursor, a genuine
"Summarizing conversation…" spinner during `/compact`, the `[y/n]` permission terminal
styled exactly like a CLI confirmation prompt, and crate "command menus" that read as
`/install`, `/restore`, `/tune`, `/patch`, `/restock` — all matching real agent-harness
vocabulary rather than generic RPG "loot" framing. This is a genuine strength; the emoji
glyph choice in §7 is the one place the identity discipline lapses.

Audited: terminal-native identity — 0 new findings beyond §7 (cross-referenced)

---

## Summary for a first-time player vs a returning player

**First-time player, highest impact:** #1 (no real control legend) is the single
biggest risk to the stated AAA bar — everything else in the game (contextual hints,
telegraphs, HUD) assumes the player already knows the base four inputs. #6 (emoji
glyphs) is the next highest-impact item specifically for a first impression, since it's
visible in the very first few seconds of combat and cuts against the game's own core
pitch (terminal-native, not "another AI-generated pixel shooter," per the Journal's
2026-07-09 entry). #4 (death clarity) matters most on a first player's *first* death,
which — by design — is likely to happen early and often.

**Returning player, highest impact:** #5 (no voice volume) and #2 (reduced-fx gap)
compound over many runs — a returning player who has already decided the Observer talks
too loud, or that flashes bother them, currently has no way to fix either short of a full
mute. #9 (no Escape-to-close) is a small friction returning players hit more often since
they open settings/library more.

Nothing here proposes new mechanics; every fix is either wiring an existing value (
Observer volume, hit-flash into the reducedFx guard) or surfacing information the game
already computes (death cause, a control list already written in the README).
