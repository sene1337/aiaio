# AIAIO — pre-release audit (security / reliability / accessibility / UI consistency)

**Date:** 2026-09-08
**Auditor:** Claude Fable 5.1 (subagent), read-only pass, `/pre-release-check` procedure
**Repo:** `/Volumes/OWC Envoy Ultra/dev/aiaio` @ `main` (`47bc3dd`, v2.14.1)
**Method:** Full static read of `src/`, `scripts/`, `vite.config.ts`, `index.html`,
`.github/workflows/pages.yml`, `tests/`, and the shipped `dist/` bundle. Manual line-by-line
trace of every `innerHTML`, `fetch(`, `localStorage.` call site. Independent recomputation of
WCAG relative-luminance contrast ratios for the CSS palette. No dev server was started, no
browser was opened, no file was written or edited outside this report.

---

## Step 0 — actual architecture (scoping)

This is **not** a typical multi-tenant web app. It is a **client-only, zero-dependency static
Vite/TypeScript build** (Canvas 2D + DOM/CSS), deployed as a single bundle to **GitHub Pages**.
There is no server, no database, no accounts, no payments file uploads to a backend, and no
public API. Real trust boundaries for this app:

| Boundary | What crosses it | Verdict |
|---|---|---|
| **Hosted demo (GitHub Pages)** | Nothing but the static bundle + 12 fictional cards | production surface, verified clean |
| **Local dev server** (`npm run dev`) | Redacted session excerpts → local CLI (`claude -p` or `AIAIO_LLM_CMD`) via `/__qa`, `/__quip`, `/__enrich/*` | dev-only, single-user localhost, CSRF-guarded |
| **Local Node scripts** (`scripts/*.mjs`) | Reads the user's own agent-session logs on their own machine | local tool, runs as the user, no network egress except the optional LLM CLI |
| **Dropped/loaded SessionCard `.json`** | User's own file → `parseSessionCard()` | client-side only, strictly bounded parser |
| **Custom Observer pack** (`public/packs/observer.json`) | User- or agent-authored text → `observer.loadPack()` | client-side only, strictly bounded loader |

Categories marked **N/A** below have no such surface in this codebase; no findings were
invented to fill them.

- **Auth / authz / multi-tenancy / DB / payments / public API:** N/A (no such surface exists).
- **File upload (server-side):** N/A — the only "upload" is a client-side `File.text()` read
  of a locally dropped `.json`, never sent anywhere.
- **CSRF against a real backend:** N/A in production (no backend). In dev, the two dev-only
  POST middlewares (`/__qa`, `/__enrich/*`) already carry a same-origin + `Content-Type`
  CSRF guard (`vite.config.ts:15-26`, labelled `M-1` in a code comment) — reviewed, correct.
- **Touch-target sizing / mobile responsive layout:** N/A by design — `main.ts:882-893`
  hard-gates coarse-pointer-only devices to an honest "needs desktop + keyboard" screen before
  any game UI renders.

---

## Findings

Severity/format per the audit contract: Severity · Category · Location · Issue · Impact ·
Evidence · Reproduction · Fix · Confidence.

### SEC-1 — Medium · Security / Data Exposure
**Location:** `scripts/make-demo-cards.mjs` (whole file) vs. `public/packs/` (untouched by any
build script).
**Issue:** `make-demo-cards.mjs` gives `public/cards/` a hard safety net: it wholesale-deletes
`dist/cards` and rebuilds it as fiction-only content (`rmSync(outDir, {recursive:true,
force:true})`, then writes only the 12 fictional cards and forces `index.json` to `[]`). No
equivalent exists for `public/packs/` — a personal Observer persona pack (which
`AGENTS.md:135-137` explicitly encourages authoring with "the user's actual history — their
projects, their running jokes, the incident they still talk about") has no strip/replace step
anywhere in the build pipeline. Vite's default `publicDir` behavior copies `public/packs/*`
into `dist/packs/*` verbatim.
**Impact:** In the **CI-driven Pages deploy** (`.github/workflows/pages.yml`) this is currently
unreachable — the workflow checks out a fresh clone, and `public/packs/` is gitignored
(`.gitignore:6`), so it does not exist in that checkout. Risk appears only in a
**locally-built-and-manually-deployed** `dist/` (e.g. `npm run build` on Brad's machine,
followed by any manual publish of that `dist/` folder) once a pack file exists — confirmed
empty today (`public/packs/` has 0 files on disk), so no current leak, but the safety net that
exists for cards does not exist for packs.
**Evidence:** `scripts/make-demo-cards.mjs:11-27` (cards purge/rebuild); `grep -rn "packs"
scripts/*.mjs vite.config.ts .github/workflows/pages.yml` → zero matches; `tests/public-build.test.mjs`
asserts private **cards** never survive the build but never references `packs` at all —
confirming this is an untested blind spot, not a covered case.
**Reproduction (code-level, not executed):** author `public/packs/observer.json` with personal
lines → `npm run build` → `dist/packs/observer.json` would exist verbatim (not run, to keep
this audit read-only; reasoning verified from Vite's documented `publicDir` copy behavior plus
the absence of any script that touches `packs`).
**Fix:** In `make-demo-cards.mjs`, mirror the cards treatment: `rmSync(join(dist,'packs'),
{recursive:true, force:true})` before/without recreating it (the hosted demo has no persona
pack), or explicitly exclude `public/packs` from `publicDir` copying in `vite.config.ts`. Add
a `packs` assertion to `tests/public-build.test.mjs` alongside the existing cards assertion.
**Confidence:** High (verified by source read + grep + test-file read).

### SEC-2 — Low · Security / Reliability, Consistency
**Location:** `src/main.ts:383-386` (`fetchEnrichStatus`), called unconditionally from
`openEnrichChooser` at `src/main.ts:405` and `openEnrichConsent` at `src/main.ts:420`; the
top-level `#btn-enrich` click handler (`src/main.ts:915`) that reaches it is **not** gated by
`import.meta.env.DEV` (only the two depth-selection buttons are, `main.ts:397-398`).
**Issue:** Opening the in-game **✦ ENRICH YOUR HISTORY** menu on the hosted (production)
build fires a real same-origin `fetch('/__enrich/status', {cache:'no-store'})` GET request.
This contradicts the codebase's own stated invariant, "Zero network calls in production
builds" (`AGENTS.md:174-176`, `README.md:41-42`).
**Impact:** Low — no request body, no data sent, GET only, and the failure is already
caught (`try {...} catch { /* dev server absent... */ }`, `main.ts:413`) with an explanatory
UI message already shown one line above it (`main.ts:399-401`). On GitHub Pages this 404s
silently. Net effect: an unnecessary failed network call + a 404 entry in the browser's network
panel on every visit to that menu, not a data leak.
**Evidence:** confirmed the string `/__enrich/status` **is present** in the shipped bundle
(`dist/assets/index-p1bMRTz9.js`, verified by `grep`), while `/__qa` and `/__quip` are correctly
dead-code-eliminated by the `import.meta.env.DEV` guard at their only call sites
(`telemetry.ts:53`, `main.ts:710`) — proving the elimination mechanism works and that this one
path was simply never wrapped in the same guard.
**Reproduction:** read `main.ts:388-413`: `openEnrichChooser()` calls `await
fetchEnrichStatus()` inside a try/catch with no `import.meta.env.DEV` check anywhere in that
function; it is reachable from the unconditional `#btn-enrich` listener at `main.ts:915`.
**Fix:** wrap the `fetchEnrichStatus()` call at `main.ts:404-413` in `if
(import.meta.env.DEV) { ... }`, matching the pattern already used for `/__qa` and `/__quip`.
**Confidence:** Confirmed (source + built-bundle grep); the live 404 network-panel behavior on
the actual hosted page was not observed in a browser (not permitted this pass) — that part is
High Confidence, not Confirmed.

### A11Y-1 — Medium · Accessibility (WCAG 2.2 AA — 4.1.2, 2.4.3, 2.4.11)
**Location:** `index.html:84,124,132,149,184` — all five modal dialogs
(`#modal-library`, `#modal-schema`, `#modal-settings`, `#modal-enrich`, `#modal-premiere`).
**Issue:** Every modal is a plain `<div class="modal">`. None carries `role="dialog"` or
`aria-modal="true"`. Opening one only does `classList.remove('hidden')` (e.g.
`main.ts:258,316,323,341,389,956`) — no focus is moved into the modal, no focus is restored to
the invoking control on close, no focus trap keeps Tab inside it, and **no Escape-key handler
closes any of them** (confirmed: the sole global `keydown` listener, `wireKeyboard()` at
`main.ts:736-774`, has no `case 'Escape'` and never inspects `.modal`).
**Impact:** A keyboard user can Tab out of an open modal into background controls that are
still present under the overlay (only visually hidden by z-index/backdrop, not by DOM state), and
has no fast, conventional way (Escape) to dismiss any modal — they must locate and activate a
specific "close ✕"/back button by Tab order. A screen reader gets no announcement that a
dialog opened at all (no `role="dialog"`, no `aria-modal`). All five modals share this pattern
uniformly.
**Evidence:** `grep -n "aria-label\|role=\|<h[1-6]" index.html` shows `aria-label` on
`#screen-menu`, `#tl-tracks`, `#tl-map`, `#screen-recap`, `#screen-briefing`, and `role="status"
aria-live="polite"` on `#observer-caption` — but no `role`/`aria-modal` attribute anywhere on
the five `.modal` divs; `grep -n "Escape" src/*.ts` → no matches.
**Reproduction:** open `#modal-settings` (click `/settings`) → press Tab repeatedly → focus
travels into elements behind the overlay; press Escape → nothing closes.
**Fix:** add `role="dialog" aria-modal="true"` (plus an `aria-labelledby` pointing at each
modal's `<h3>`) to all five; on open, call `.focus()` on the modal's first focusable element
and remember `document.activeElement` to restore on close; add a small focus-trap (cycle Tab/
Shift+Tab within the modal's focusable set) while `!classList.contains('hidden')`; add a single
`case 'Escape'` in `wireKeyboard()` (or a separate listener) that closes whichever `.modal` is
currently visible.
**Confidence:** Confirmed (full source read of every modal open/close call site and the only
keyboard listener in the app).

### A11Y-2 — Medium · Accessibility (WCAG 2.2 AA — 2.3.3 intent, "reduced motion" checklist item)
**Location:** `src/ui.ts:52` (`reducedFx`), `src/ui.ts:371`, `src/transition.ts:17`.
**Issue:** The CSS `@media (prefers-reduced-motion: reduce)` block (`style.css:289-292`)
correctly and automatically disables the *CSS-driven* animations (`.glitchable`,
`.banner.compaction`, `#crt-overlay`, cursor blink) whenever the OS-level preference is set —
no action needed from the player. But the more intense *canvas-rendered* effects — screen
shake, glitch jitter, white damage-flash (`ui.ts:371`: `if (this.reducedFx) { this.shakeMag = 0;
this.glitchTtl = 0; this.whiteFlashTtl = 0; }`) and the level-transition wipe
(`transition.ts:17`) — are gated **only** by a manual in-game checkbox
(`localStorage.getItem('aiaio-reduced-fx') === '1'`, default unset → `false`/full motion).
The app never reads `matchMedia('(prefers-reduced-motion: reduce)')` in JavaScript anywhere
(confirmed by grep — the only `matchMedia` call in the codebase is the unrelated
`(pointer: coarse)` touch gate at `main.ts:882`).
**Impact:** A player with the OS-level "reduce motion" preference set gets full screen
shake/glitch/flash on first launch regardless, and must separately discover and enable
`/settings → "reduce shake & flashes"` to get the behavior their OS preference already asked
for. This is inconsistent with the CSS layer's own correct behavior one file over.
**Evidence:** `grep -n "matchMedia\|reduced-motion\|prefers-reduced" src/*.ts` → only the CSS
file has the media query; `ui.ts:52,371`, `transition.ts:17` all check the manual
`localStorage` flag exclusively.
**Fix:** on first boot (when `localStorage.getItem('aiaio-reduced-fx')` is `null`, i.e. the
player has never touched the setting), seed `reducedFx` from
`window.matchMedia('(prefers-reduced-motion: reduce)').matches` and reflect that in the
settings checkbox's initial `checked` state; keep the explicit toggle as an override once the
player sets it.
**Confidence:** Confirmed.

### A11Y-3 — Low · Accessibility (WCAG 2.2 AA — 2.3.3 checklist item, partial)
**Location:** `src/style.css:106-108` (`.tl-node.next .chip { animation: tl-pulse ... }`) and
`src/style.css:116-117` (`#tl-guy.walking { animation: tl-guy-bob ... }`).
**Issue:** These two decorative animations (the pulsing glow on the timeline's "next" level
chip, and the walking-bob on the timeline avatar) are not included in the
`prefers-reduced-motion` media query at `style.css:289-292`, unlike the three animations that
are.
**Impact:** Minor — both are small, low-amplitude effects (opacity pulse; 4px vertical bob),
not flash/strobe-level, but they are still motion the OS preference asked to reduce and the
file's own pattern already handles three similar cases.
**Evidence:** direct read of `style.css:100-120` and `:289-292` — the two animation names never
appear inside the reduced-motion block.
**Fix:** add `.tl-node.next .chip, #tl-guy.walking { animation: none !important; }` (or the
non-important transform-only fallback) inside the existing `@media (prefers-reduced-motion:
reduce)` rule.
**Confidence:** Confirmed.

### A11Y-4 — Low · Accessibility (WCAG 2.2 AA — 4.1.2, 2.1.1, partial — redundant path exists)
**Location:** `src/ui.ts:1140-1163` (`renderWeaponBar`).
**Issue:** Each weapon-slot HUD element is a bare `document.createElement('div')` with a
`click` listener (`div.addEventListener('click', () => run.selectWeapon(i))`) and no
`role="button"`, `tabindex`, or `keydown` handling. It is invisible to keyboard Tab order and
to assistive tech as an interactive control.
**Impact:** Low, because weapon selection is fully available through the documented keyboard
shortcuts (`[ ] ` / `1-9`, `README.md:78`) that call the same `run.selectWeapon` /
`run.cycleWeapon` path — the underlying function is keyboard-accessible, only this specific
mouse affordance is not exposed as a control to AT.
**Evidence:** `ui.ts:1144-1161`; compared against `.tl-node`/`.tl-track`/`.lib-play`/`.lib-add`
elsewhere in the same codebase, which are correctly real `<button>` elements.
**Fix:** either switch `weapon-slot` to a `<button>` element (matching the pattern used
everywhere else in this file), or add `role="button" tabindex="0"` plus an Enter/Space
`keydown` handler if it must stay a `<div>` for layout reasons.
**Confidence:** Confirmed.

### A11Y-5 — Low · Accessibility (WCAG 2.2 AA — 2.4.7, partial)
**Location:** `src/style.css:182,272` (`#library-filter:focus`, `#gallery-filter:focus`).
**Issue:** Both rules do `outline: none; border-color: var(--green);` — the only visible focus
indicator is a 1px border-color swap. Every other focus indicator in the file
(`.cmd:focus-visible`, `style.css:284`) uses a 1px **outline** plus a background fill, which is
more robust (outlines aren't affected by adjacent layout/box-shadow clipping the way a thin
border can be).
**Impact:** Low — there is a visible, high-contrast (dark grey `--border` → bright green
`--green`) change on focus, so this is not a "no indicator" violation, just a thinner one than
the app's own established pattern for command-list rows.
**Evidence:** direct read of both rules plus `.cmd:focus-visible` for comparison.
**Fix:** add a matching `outline: 1px solid var(--green); outline-offset: -1px;` (or a
`box-shadow`) alongside the existing border-color change for consistency with `.cmd:focus-visible`.
**Confidence:** Confirmed.

### REL-1 — Low · Reliability
**Location:** `src/audio.ts:28,35,99`; `src/main.ts:967,970`; `src/timeline.ts:128,352`;
`src/observer.ts:333,419,530`.
**Issue:** These `localStorage.setItem(...)` calls are not wrapped in try/catch. Elsewhere in
the same codebase (`levels.ts:183,224`; `main.ts:149`; `telemetry.ts:72`) every `setItem` is
guarded with an explicit `try { ... } catch { /* storage full */ }`, showing the team is aware
of and already defends against this failure mode — just not uniformly.
**Impact:** Low. `localStorage.setItem` can throw a `DOMException` (quota exceeded, or storage
blocked by browser privacy settings / some private-browsing modes). Where unguarded, that
throw aborts the rest of the enclosing event-handler function silently (visible only as a
console error), so the specific action (mute toggle, volume change, caption/reduced-fx toggle,
voice pick, track selection, timeline "conquered" marker) may not visually complete or persist.
It cannot corrupt other stored data and does not affect the render/game loop.
**Evidence:** direct grep + read of every `localStorage.` call site (35 total across `src/`);
cross-referenced against the guarded call sites to confirm the inconsistency, not an
across-the-board gap.
**Fix:** wrap the listed `setItem` calls the same way the guarded ones already are — a shared
`safeSet(key, value)` helper would remove the duplication.
**Confidence:** Confirmed (code-level); real-world throw frequency is environment-dependent and
was not reproduced live (Needs Verification for actual trigger frequency, not for the missing
guard itself).

---

## Verified-safe / positive findings

These were actively checked (not assumed) and found correct — recorded because "adversarial in
security, systematic in accessibility" cuts both ways: a clean result from real scrutiny is
worth stating plainly, not just failures.

- **XSS surface — clean.** Every `innerHTML` assignment across the whole `src/` tree (25 call
  sites in `main.ts`, `ui.ts`, `timeline.ts`, `logo.ts`; zero in `observer.ts`, `monologue.ts`,
  `run.ts`, `campaign.ts`, `session.ts`, `session-director.ts`) was read individually. Every
  interpolation of card-derived, LLM-derived, or otherwise non-literal text goes through the
  same `escapeHtml()` (`ui.ts:39-43`, standard `&<>"'` entity escaping) before insertion — this
  includes even the dev-only LLM-written "Observer roast" text (`ui.ts:1307-1312`), which is
  the one place adversarial content from a session log could theoretically reach an LLM and
  come back as attacker-influenced text. Technique: exhaustive grep for `innerHTML` +
  line-by-line manual read of each site's interpolated variables, not keyword sampling.
  Confidence: High.
- **SessionCard parsing — well-bounded.** `parseSessionCard()` (`session.ts:338-387`), the
  entry point for any dropped/loaded `.json` file, whitelists every field by explicit property
  access (never spreads/merges the raw object, so `__proto__`/`constructor` keys in a hostile
  file are inert), and caps every array (12 tasks / 24 errors / 12 moments / 64 thoughts) and
  string (200 chars top-level, 26 chars per thought word). Confidence: High.
- **Observer persona pack loading — well-bounded.** `observer.loadPack()`
  (`observer.ts:463-486`) enforces exactly the caps `AGENTS.md` documents (8 lines/event, 16
  ambient, 140 chars/line) and rejects unknown event keys against the real `LINES` pool.
  Confidence: High.
- **Enrich pipeline whitelist-merge — enforced in code, not just by prompt.** In
  `scripts/enrich-campaign.mjs:96-101`, the LLM's JSON response is read for exactly four fields
  (`title`, `taskLabel`, `momentText`, `observerLines`), each length-clamped; any other or
  hallucinated field in the model's output is structurally discarded — this is a real
  enforcement of the "stats derive from data; narrative is the only customizable layer"
  invariant (`AGENTS.md:168-170`), not merely a prompt instruction. Confidence: High.
- **Dev-only endpoints correctly scoped to the dev server.** `/__qa`, `/__quip`,
  `/__enrich/*` are registered only via Vite's `configureServer` plugin hook, which `vite
  build`/`vite preview` never invoke. Confirmed absent from the production bundle for `/__qa`
  and `/__quip` (properly dead-code-eliminated via `import.meta.env.DEV`); see SEC-2 for the one
  partial exception. Confidence: Confirmed.
- **GitHub Pages deploy — no personal-data path.** `.github/workflows/pages.yml` builds from a
  fresh `actions/checkout`, where `public/cards/`, `public/packs/`, `qa-logs/`, `session-dumps/`
  cannot exist (all gitignored); `npm run build` → `node scripts/make-demo-cards.mjs dist` (run
  twice, redundantly but harmlessly) wholesale-replaces `dist/cards` with fiction-only content
  regardless. `tests/public-build.test.mjs` exercises exactly this path with a planted
  `PRIVATE_SENTINEL` card and asserts it does not survive. Confidence: Confirmed.
- **Double-submit / concurrency on the enrich job — handled both ends.**
  `beginEnrichment()` (`main.ts:431-450`) disables its button synchronously before the first
  `await`; the dev-server job runner (`vite.config.ts:196-220`) tracks one in-flight `job` and
  attaches a second request to it instead of starting a duplicate. Confidence: High.
- **Cross-tab progress consistency.** `levels.ts:134-137` invalidates the in-memory progress
  cache on a `storage` event from another tab, and `recordResult`/`getCampaignProgress` do a
  fresh read before merging writes — avoids one tab silently clobbering another's saved rank.
  Confidence: High.
- **speechSynthesis feature-detected everywhere** it's used (`'speechSynthesis' in window`
  guards all 6 call sites in `observer.ts`) — no crash on browsers/environments without TTS.
  Confidence: Confirmed.
- **Captions for TTS exist and are correctly implemented.** `#observer-caption` carries
  `role="status" aria-live="polite"` (`index.html:107`); `UI.setCaption()` (`ui.ts:105-118`)
  sets `.textContent` (not `innerHTML`) and is toggle-able via a `/settings` checkbox
  (`aiaio-captions`, default on). Confidence: Confirmed.
- **Colour contrast — spot-checked pairs pass AA.** Independently recomputed WCAG relative
  luminance (not just trusting the code's own inline comment) for the three text/background
  pairs most likely to be marginal: `--dim` (#8f8b82) on `--bg` (#0f0f0e) = **5.65:1**; `--dim`
  on `--bg-panel` (#161615) = **5.33:1**; `--clay` (#ff9440) on `--bg` = **8.73:1**; `--red`
  (#f47067) on `--bg` = **6.73:1**. All clear the 4.5:1 AA threshold for normal text; the
  in-code comment's claim (`style.css:10`) is accurate. **Scope note:** this was not computed
  exhaustively for every colour/background combination in the file (e.g. `--blue`, `--purple`,
  `--yellow`, `--green` against `--bg-sel`, or disabled/dim-on-dim states) — those read as
  visually high-contrast on inspection but were not independently calculated. Confidence: High
  for the four computed pairs; Needs Verification for the remainder.
- **No meaning conveyed by colour alone.** Every colour-coded state in the HUD/timeline also
  carries a distinct glyph (☒/☐/▸/▓ for tasks, ✻/⏺/☐ for timeline node states, etc.) —
  spot-checked across `ui.ts` and `timeline.ts`. Confidence: High.
- **Redaction pipeline — sound, and its limits are the ones the docs already disclose.**
  `redact()` (`extract-sessioncard.mjs:55-82`) catches API keys (OpenAI/Anthropic/GitHub/AWS/
  Google/Slack), JWTs, PEM blocks, bearer tokens, generic `key=value` creds, emails, long
  hex/base64 blobs, IPv4, and phone-shaped sequences, then hard-truncates to 80 chars; it is
  applied at every text field that reaches a card (`goal`, task names, error samples,
  moments/asks, and every mined thought-word individually). It is **regex/pattern-based, not
  NLP** — it will not catch a person's name in free prose. This is exactly the limitation
  `README.md:13-15` and `AGENTS.md:24-25` already disclose ("skim `public/cards/*.json` before
  sharing") — confirmed accurate, not a new gap. Two cheap, low-priority additions worth
  considering: a credit-card-number-shaped pattern and an SSN-shaped pattern are absent from
  `REDACTIONS` (informational only — neither is a plausible payload of an agent session log).
  Confidence: High.

---

## Remediation plan (priority order)

1. **A11Y-1** — modal `role`/focus management/Escape (Medium, touches all 5 modals, one shared
   fix pattern).
2. **A11Y-2** — seed `reducedFx` from `prefers-reduced-motion` on first boot (Medium, one
   conditional at startup).
3. **SEC-1** — strip `dist/packs` in `make-demo-cards.mjs` + extend
   `tests/public-build.test.mjs` (Medium exposure only in the untested local-deploy path, cheap
   fix, closes a real asymmetry).
4. **SEC-2** — gate `fetchEnrichStatus()` behind `import.meta.env.DEV` (Low impact, one-line
   fix, restores the stated invariant exactly).
5. **REL-1** — wrap the nine unguarded `localStorage.setItem` calls, ideally via one shared
   helper (Low impact, mechanical).
6. **A11Y-3, A11Y-4, A11Y-5** — small CSS/markup touch-ups (Low, cosmetic-adjacent, no logic
   risk).

## Quick wins (safe, low regression risk, could be done in one pass)

- SEC-2 (one `if` added).
- A11Y-3 (two selectors added to an existing media query).
- A11Y-5 (one `outline` declaration added to two existing rules).
- REL-1 (mechanical try/catch wrapping, ideally via a `safeSet()` helper).

## Needs deeper investigation / architectural touch

- A11Y-1 (modal focus management) touches five call sites and needs a small shared utility
  (focus trap + restore) rather than five one-off patches — worth designing once, applying five
  times.
- SEC-1's real-world exposure depends on Brad's actual deploy habit (CI-only vs. occasional
  local `dist/` push) — worth a one-line confirmation from him on which path he actually uses,
  even though the fix is cheap regardless.
- The hidden-tab `requestAnimationFrame` pause pattern that `AGENTS.md:185-189` documents as an
  already-fixed known trap was **not independently re-verified live** in this pass (no browser
  permitted) — a quick manual playtest (background the tab mid-run, foreground it, confirm no
  progress loss) would upgrade that from "trusted per docs" to "confirmed."

## Release recommendation

**Ship with known risks.**

Justification, tied to this app's actual distribution modes:

- **Hosted GitHub Pages demo:** clean. Fiction-only data, CI-driven purge of any personal-data
  path, no XSS-exploitable surface found after an exhaustive `innerHTML` trace, no accounts/
  payments/DB to compromise. SEC-2's stray fetch is cosmetic (a 404, no data movement). Nothing
  here blocks shipping the hosted demo as-is.
- **Local "clone and run your own history" mode (the actual product):** also fundamentally
  sound — the redaction pipeline, SessionCard parser, and persona-pack loader are all
  well-bounded and match their own documentation. The two Medium findings (A11Y-1 modal focus
  management, A11Y-2 reduced-motion default) are real accessibility gaps worth fixing before
  calling the beta accessibility-complete, but neither is a data-safety or correctness blocker —
  they degrade the experience for keyboard/AT users and motion-sensitive players without
  breaking anything for anyone else. SEC-1 (packs asymmetry) is a latent trap, not an active
  leak — nothing has leaked today, and the fix is cheap enough to land before it ever could.

No finding in this pass rises to Critical or High. Recommend landing SEC-2, REL-1, and the three
Low a11y items as a fast quick-wins batch, and scheduling A11Y-1 + A11Y-2 + SEC-1 as the next
small batch before the next public-facing push.
