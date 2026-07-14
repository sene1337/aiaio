# Design research notes (distilled from Codex audit sessions)

Distilled 2026-07-13 from raw Codex web-research output captured during the AIAIO audit
sessions of 2026-07-11 through 2026-07-13. This file preserves the *source guidance* the
audits were built on. The conclusions drawn from this research (scores, roadmap, phases)
live in `docs/DESIGN-ROADMAP.md` — read that first; read this when you need the underlying
rule, number, or citation.

Provenance notes: everything below was recovered from the raw dump. Anything added from
general knowledge is marked `[not from dump]` (used once). Sources whose content did NOT
survive in the dump are listed at the end.

---

## Xbox Accessibility Guideline 102 — Contrast
https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102

- Contrast ratio = luminance difference between element and background; "stronger" ratio =
  more visible. High-contrast text stays legible even at 74% reduced sharpness (their demo
  ranges 1.2:1 → 21:1).
- Audit contrast in ALL contexts, not just menus: in-game text, subtitles, loading screens,
  error/toast messages, HUD meters, mini-map elements, targeting icons, interaction glyphs.
- Double-outline pattern (For Honor): symbol on solid fill, outlined in black AND white —
  black keeps it visible on light backgrounds, white on dark backgrounds. Works over any
  scene content.
- Map/HUD icon pattern (Forza Horizon 4): solid yellow fill under black outline + black
  text so icons survive a busy map background.
- HUD meter pattern (The Outer Worlds): white outline around colored meters + bright text
  on opaque panel backgrounds.
- Slider pattern (Minecraft / Gears Tactics): slider tab in bright fill + dark outline so
  the control is discernible from track and panel.
- Character/platform outlining (Eagle Island): optional settings to dim the backdrop (up to
  solid black) and add white outlines to characters and platforms; outline color should be
  configurable or contrast against every background it appears on.
- Directional-cue example (Immortals Fenyx Rising): white arrow with black outline for
  incoming-attack direction.
- Avoid red/green as the only differentiator for targeting/important elements (colorblind).
- Support high contrast at minimum; configurable contrast is better (some cognitive
  disabilities find maximum-contrast UIs harder, so make it adjustable).
- From the Codex synthesis in the dump: AIAIO's CSS palette measures ~5.3:1 against panel
  backgrounds; Microsoft's bar for important standard-size information is ≥4.5:1.

## Xbox Accessibility Guideline 103 — Additional channels for visual and audio cues
(thin: goal/overview only recovered)

- Core rule: express every gameplay-critical cue through MULTIPLE senses. Never sound-only,
  never color/visual-only — pair sound + shape + motion + text.
- Canonical failure: enemy gunfire that is audio-only means a player in a loud room (or
  hard of hearing) loses health before they can react.
- Cue types called out: gunfire, taking damage, presence of interactables, new objective.
- Haptics named as a valid additional channel (see XAG 110).

## Xbox Accessibility Guideline 105 — Audio accessibility

- Provide separate volume/mute controls per audio TYPE, minimum set:
  Music / Voice-over / Active sound effects / Background-ambient effects / Narration /
  Voice chat.
- "Active" SFX are defined as those critical to gameplay (engine noise, gunshots,
  footsteps); background/ambient are those not critical — split them onto different buses.
- Rationale: music and effects can mask speech output and screen readers; players must be
  able to duck or mute each category independently.
- Reference implementation: Grounded ships six sliders — master, effects, music, UI,
  dialogue, voice chat.

## Xbox Accessibility Guideline 109 — Objective clarity
(fully recovered)

- Players must always be able to answer "what am I supposed to be doing right now?" without
  memorizing anything. Objective review must be available at ANY time.
- Write objectives as clear, prescriptive next steps ("Unblock the obstructed laser"), not
  vague goals. Grounded shows current tasks on-screen persistently, with subtasks.
- Keep a log-style list of COMPLETED objectives too (Witcher 3 quest journal). Separate
  main / secondary / completed into visually distinct categories to avoid overload.
- Show explicit progress fractions toward prerequisites: "15/20 skulls collected",
  "3 of 5 hidden switches found". Ori shows per-area completion percent (e.g. 9%).
- Offer waypoint/path markers, hints, or reminders that trigger when the player has made
  NO progress for a period (genre-dependent); can be bundled into difficulty presets.
  Fable III's glowing ground path has adjustable brightness and can be fully disabled.
- Interruptions not related to the current objective (notifications, side-quest popups)
  must be postponable or suppressible by the player (Gears 5 HUD notification toggles).
- Provide a way to revisit narrative: replay cutscenes or a written "story so far"
  (Tell Me Why episode replay; Dragon Quest XI "The Story So Far").
- Design driver: memory/attention conditions AND the situational case of "hasn't played
  recently" — directly relevant to a game where levels come from weeks-old sessions.

## Xbox Accessibility Guideline 112 — UI navigation
(recovered via the Indonesian-language mirror of the page)

- UI must be consistent and intuitive across the WHOLE game; inconsistent navigation
  mechanics disorient players and break assistive tech (voice, eye-gaze, screen readers).
- Navigation order must be logical and consistent on every screen; pressing Left moves
  focus to the tile visually to the left (Sea of Thieves grid example).
- Keep one interaction grammar everywhere: A = select, B = back, LT/RT = page, LB/RB = tab.
  Changing the mapping between screens is called out as highly confusing.
- Prefer linear (single-row or single-column) menu layouts; multi-row grids must still
  follow an intuitive focus order.
- First-launch accessibility prompt pattern (Minecraft Dungeons): the very first screen
  offers TTS, subtitles, enemy outline color, chat wheel type — and if the platform-level
  "read to me" setting is on, the screen auto-narrates.
- If the game cannot read platform accessibility settings, narration should default ON.

## Xbox Accessibility Guideline 113 — UI focus handling (bonus find)

- Players must ALWAYS be able to tell which UI element has input focus.
- A "very subtle glow behind text" is the named anti-pattern — insufficient for low vision,
  cognitive disabilities, or couch distance. Make focus indicators unmistakable.

## Microsoft "Making games accessible" (UWP) — caption/subtitle rules
(this is where the concrete caption numbers live; XAG 104 itself was not recovered)

- Simple readable font; sufficiently large size, ideally player-adjustable.
- High contrast text with strong outline/shadow; dark background overlay behind captions,
  toggleable on/off.
- Max 38 characters per line; max 2–3 lines on screen at once; short sentences.
- Don't display caption text before the event occurs (spoiler timing rule).
- Differentiate WHO/WHAT is making the sound in the caption.
- Game dialogue, game audio, and sound effects should all be displayable as text.
- Use 3D/spatial audio cues to provide additional positional information.

## Google PAIR Guidebook — Mental Models
https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/

- A mental model = the user's theory of how the system works and how their actions affect
  it. Mismatched models → unmet expectations, frustration, misuse, abandonment.
- Set expectations for adaptation: tell users the system changes over time and personalizes.
- Onboard in stages: explain what it CAN do, what it CAN'T do, how it may change, and how
  the user can improve it. Don't front-load everything.
- "Inboarding": introduce new features in context when they become relevant — never while
  the user is busy doing something unrelated.
- Explain the benefit, not the technology. Put tech detail behind tooltips/progressive
  disclosure for the curious.
- Plan for co-learning: user feedback changes the model, which changes the interaction,
  which changes the model again. Tell users why continued feedback benefits THEM.
- Implicit feedback (behavior signals) must be visible somewhere ("which signals are used
  to what end"); explicit feedback should state precisely what impact it has and when.
- Fail gracefully: if the mental model includes "it learns," the FIRST failure becomes an
  opportunity to establish the feedback relationship instead of a trust break.
- Occasional-use products: mental models erode — remind, reinforce, and adjust; consider
  "re-boarding" when a feature changes enough that users would notice.
- If the AI refers to itself as "I", users assume near-perfect natural language competence
  — choose the persona's voice with that expectation cost in mind (Observer-relevant).
- Watch product logs for confusion/frustration patterns to know when to rebuild models.

## MDA framework (Hunicke / LeBlanc / Zubek)
(thin: only abstract + intro recovered; the 8-aesthetics taxonomy is NOT in the dump)

- MDA = Mechanics → Dynamics → Aesthetics; a formal bridge between design, criticism, and
  technical research, taught at GDC 2001–2004.
- Designer and player see the game from opposite ends: designer from mechanics forward,
  player from aesthetics backward. Analyze from BOTH perspectives when tuning.
- Coded subsystems interact to create complex, dynamic, often unpredictable behavior —
  consider interdependencies before changing any one system.
- Practical use (as applied in the audit): every visual/audio choice should traceably
  express a mechanic and an intended feeling; don't decorate, express.

## Godot — Multiple resolutions / integer scaling
https://docs.godotengine.org/en/latest/tutorials/rendering/multiple_resolutions.html

- Pixel-art recipe: base viewport 640×360 — it integer-scales to 1280×720, 1920×1080,
  2560×1440, and 3840×2160 with no black bars. Most pixel-art games use 256×224 – 640×480.
- Stretch mode `viewport` = render at exact base size, then scale the whole framebuffer to
  the window (true low-res). `canvas_items` = elements scale relative to base size (crisp
  text, sub-pixel motion allowed).
- Integer scale mode: fractional scaling (e.g. 2.133×) makes checkerboards uneven and line
  widths wildly inconsistent; integer mode rounds down (2.5 → 2×) and letterboxes the
  remainder so every source pixel maps to a whole n×n block.
- If sprites need sub-pixel movement/rotation or you want hi-res UI, use `canvas_items`
  instead of `viewport` — the two are an explicit tradeoff.
- Stretch aspect options: `keep` (enforce one ratio, letterbox/pillarbox), `keep_width` /
  `keep_height` (expand one axis), `expand` (support many ratios; anchor UI to corners).
- An extra content-scale factor can be exposed to players as a UI-scale accessibility
  option on top of the automatic scale.
- Exclusive fullscreen matters for integer scaling: windowed-fullscreen can lose 1 px of
  height and silently drop you a whole scale factor.
- Non-pixel-art desktop default: 1920×1080 base, `canvas_items` + `expand`, UI anchored.

## GDC Level Design Workshop — Pacing (Burgess / Scott / Perry, GDC China 2014)
(partial slide text recovered from the PDF)

- Pacing is a tool for keeping the player interested, conveying specific emotions, and
  controlling the IMPACT of events on the player.
- Visualize pacing as a graph: activity/intensity in relation to time. Draw the curve for
  a level before tuning it.
- Player motivation runs on incentives — "some little nugget to keep them going": items,
  story beats, shiny stuff, placed along the pacing curve.
- Design in "beats" and hold interest by varying the TYPE and FREQUENCY of beats — beats
  range from a small health boost up to a boss fight.
- Pacing borrows from music: rhythm, intensity changes, structured variation over time.
- Adjacent GDC finds in the same searches (session-level guidance):
  - "1,2,3 Action!" (GDC 2022): alternate game mechanics between level chunks; vary
    environment/visuals; include narrative elements; keep tension curves in line.
  - Susan O'Connor (GDC 2013): mission objectives serve the story ("the story IS what the
    player DOES"); build natural emotional rise-and-fall with cause and effect — "so often
    in games, things happen for no reason. Make things matter."

## Valve — The AI Systems of Left 4 Dead (Mike Booth, 2009)
https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf

- The four stated goals of the L4D AI: (1) robust behavior performances, (2) competent
  human-player proxies, (3) promote replayability, (4) generate dramatic game pacing.
- Replayability thesis: procedural population of enemies AND loot on fixed maps is what
  makes few maps playable for years (Counter-Strike/TF comparison: unpredictability from
  system interactions, not map count).
- Structured unpredictability = a frequency ladder of threat types:
  - Wanderers (high frequency) — ambient dazed enemies, alert on contact
  - Mobs (medium frequency) — 20–30 enemies rushing at once
  - Special enemies (medium frequency) — individual units with unique abilities that
    harass and force cooperation
  - Bosses (low frequency) — force a full strategy change
- "Flow distance": precompute travel distance from the start to every area; following the
  increasing gradient always leads to the exit; "escape route" = shortest start→exit path.
  Used as the master metric for spawn placement and progress tracking.
- Director spatial queries: "is area X visible from area Y?", "where is a spot NEAR the
  survivors but NOT visible to any of them?" — spawn threats close but unseen.
- From the Wikipedia snippet in the dump: the Director tracks each player's current
  situation and adds or REMOVES items and enemies in response, with the explicit goal of
  maintaining constant tension and making each playthrough new.
- Movement believability: reactive path following (steer toward a look-ahead point + local
  obstacle avoidance) beats full path optimization — cheap to re-path, superposes with
  flocking, avoids robotic rail-following.
- [not from dump] The talk's well-known adrenaline model (build-up → peak → relax cycle
  driven by an "emotional intensity" estimate per player) was NOT in the recovered slide
  lines — verify against the PDF before citing specifics of the intensity algorithm.

## Procedural Content Generation book / Experience-Driven PCG (Yannakakis & Togelius)

- EDPCG framework (IEEE Trans. Affective Computing 2011): generate content driven by a
  computational MODEL of the player's experience, assessed continuously, with content
  adjusted in real time to needs/preferences.
- The framework's axes: content quality evaluation (direct data-driven vs model-based),
  content representation (direct vs indirect), search/generation method.
- Super Mario case study: content quality = gameplay-based (model-free) signals combined
  with subjective pairwise-preference player modeling; indirect content representation;
  exhaustive search over generator parameters.
- Player-driven PCG premise: perception of the same game differs by personality, playstyle,
  expertise, and cultural background — one fixed tuning cannot fit all players.
- PCG book (Shaker/Togelius/Nelson, Springer 2016) chapters relevant here: ch. 10 "The
  experience-driven perspective", ch. 11 "Mixed-initiative content creation", ch. 12
  "Evaluating content generators" (free drafts at pcgbook.com).
- Recent academic direction (2024 searches): LLM-based personalized level generation from
  continuously collected per-player gameplay data (arXiv:2402.10133 — solves cold-start by
  zero-shot reasoning); PCG+LLM survey (arXiv:2410.15644); persona-adapted PCG via
  evolution (arXiv:2112.04406); "fun as moderate divergence" as an EDPCG-via-RL evaluation.

## GDC onboarding & replayability sessions
(thin: session ABSTRACTS only — the talk contents are not in the dump)

- "The Gamer's Brain, Part 2: UX of Onboarding" (Celia Hodent, GDC 2016): engagement in the
  first minutes is the retention gate; guidance is built on how the brain learns; covers
  common onboarding pitfalls; Fortnite examples.
- "Teaching by Design" (Mushroom 11, GDC 2017): tutorial = actual gameplay puzzles, gradual
  and focused, minimal hand-holding; designed around known cognitive biases and the tools
  to break them.
- Tencent onboarding "A-G-E" model (GDC 2024): Attraction (drives engagement) → Goal
  (guides motivation) → Effectiveness (measure whether tutorials actually taught).
- "Untapped Potential of Roguelikes" (Tom Cadwell, Riot, GDC 2015): roguelikes get strong
  long-term replayability specifically from the PURSUIT OF MASTERY; that mastery loop can
  be cross-pollinated into other genres.
- "Procedural Level Design in Eldritch" (GDC 2015): the designer's role shifts to shaping
  the experience the algorithm must deliver, not authoring layouts.

## Competitive landscape — personal-data games, session viz, AI-agent gamification
(2026-07-13 search; strongest recoverable section)

- Every direct neighbor found is a PRODUCTIVITY/observability tool, not a game. Nothing in
  the results turns agent sessions into playable content — AIAIO's slot is empty.
- Lattice (lattice.cc) — "command center for coding agent sessions"; extracts structure
  from conversation + tool activity as a session runs; AI-powered session insights.
- Recap (JetBrains plugin, v2026.1.1) — unified history viewer; auto-discovers local
  sessions from Claude Code, Codex CLI, Gemini CLI, Cursor, Copilot, Cline, Aider,
  OpenCode, OpenClaw, Hermes, Droid, and more; shows what agents changed and cost.
- Claudium (helloclaudium.com) — "watch Claude think"; live brain-metaphor visualization
  (regions named after brain areas); tails JSONL session logs; WebSocket hub accepts any
  agent runtime that emits tool-use records. Closest aesthetic neighbor — still not a game.
- NextDialog — "calm interface" for terminal-based agents; every session at a glance.
- Octarin — team-level shared memory over MCP; sessions captured (what was tried, what
  broke, what it cost) and served to future sessions; claims 166B+ tokens tracked.
- Sprintra — "project brain": notes captured mid-session + full session replay with every
  tool call, readable/writable by agents over MCP.
- relai — parses session files from all AI-coding CLIs into one dashboard; can FORK a
  session to a different assistant by writing a context primer from transcript + CLAUDE.md.
- Operon — desktop + team web dashboard to "see, control, and replay every AI coding
  session"; cost per developer, decision archive, handoff summaries.
- Relayer Labs — visual GRAPH interface for coding agents; voice control; inspect each
  step; desktop-to-mobile continuity.
- Academic adjacents: personalized PCG from real player data is an active research vein
  (see EDPCG section); a study on PCG's impact on immersion (AUT thesis) compares identical
  games with/without procedural generation; serious-games engagement research (npj Heritage
  Science 2026) frames data-driven personalization as an engagement driver.
- Positioning implication recorded in the dump's own synthesis: session-history tools
  compete on recall and cost visibility; AIAIO competes on MEANING and play — the data is
  the level, not the dashboard.

## Codex audit synthesis captured in the dump (not a fetched source)
The dump also contains Codex's own conclusions built on the sources above. Key concrete
rules it derived (kept here because they are actionable and traceable):

- Salience ladder for the playfield: avatar (brightest persistent silhouette) → immediate
  threat → current task/exit → compaction wall → terrain/particles/telemetry (dimmest).
- Every enemy class needs its own silhouette + motion + attack language; names/labels
  appear only when targeted, nearby, newly encountered, or inspected — the world must read
  without labels.
- HUD tiering: persistent (health, shield, context, wall distance, weapon, objective) /
  contextual (prompts, warnings) / pause-dossier (session ID, rosters, logs) / captions in
  a dedicated lower-third separate from the combat feed.
- One shared audio graph with Master/Music/SFX/UI/Ambience buses + master limiter; duck
  music and noncritical SFX ~6–9 dB while the Observer speaks; Observer stays centered,
  world effects pan with camera.
- Attacks get a three-part sound language: warning → execution → confirmation; repeated
  events get small deterministic variations (pitch, envelope, filter, sample start).
- Adaptive music as layer states (safe / pressure / compaction / inside-the-wall) with
  hysteresis on transitions to stop threshold flicker.
- Virtual pixel grid: fixed internal resolution (e.g. 640×360), whole-number scaling,
  nearest-neighbor, snap entities/effects/camera to grid; keep DOM HUD independently sharp.

---

## Expected sources with NO real recoverable content (link/title only)

- **XAG 104 — Subtitles and captions**: only the guideline title in index tables and a
  bare link cited by the synthesis. The concrete caption numbers in this file come from
  the separate Microsoft UWP accessibility page, not XAG 104 itself.
- **XAG 114 — UI context**: nothing beyond its row in the guideline index table.
- **MDA framework**: abstract/intro only — the mechanics/dynamics/aesthetics definitions
  and the 8-aesthetics taxonomy are NOT in the dump (section above is honest to what was
  fetched).
- **GDC onboarding / replayability talks**: session abstracts only; no slide or talk
  content was fetched (flagged thin in their section).
- **XAG 103**: goal/overview only; implementation guidelines were not fetched.

---

## Addendum 2026-07-14: menu / level-select / results-screen research

Fetched after Brad's morning feedback on the v2.8.0 front door (dense
data-terminal, buried ENRICH, campaign hidden behind a button). The original
audit never covered out-of-combat screens.

### Level select (Game UI Database patterns, UX Planet)
- Present selection as a MAP or spatial journey, not a list — world-map
  metaphors with a visible path dominate memorable examples.
- Locked vs unlocked must be legible at a glance; per-node stats/ranks on the
  map itself; attractive background is a hallmark, not a luxury.
- Growing content → scroll horizontally within the map scene rather than
  navigating away.

### Main menu (multiple design guides)
- ONE primary action dominates via size/color/position; everything else is
  visually subordinate.
- Fewer than 6–7 items; group or hide the rest behind sub-surfaces.
- The title/identity should be proud — the menu carries the game's aesthetic,
  not a utility layout. Consistency with in-game HUD style.

### Results / end-of-run (Hades analyses, roguelite progression guides)
- Every run — win OR lose — must visibly move something forward; show exactly
  what moved (unlocks, deltas, story). Failure that yields visible progress is
  the roguelite retention engine.
- Characters who REMEMBER prior attempts turn death screens into narrative
  (AIAIO already has Observer run-memory; extend across runs per session).
- Celebrate first (big outcome/rank reveal), inform second (stats), then ONE
  continuation action ("next episode"), not a dump back to the menu.

Sources: gameuidatabase.com screens 42/6/53/52, uxplanet.org game-design UX
best practices, krishnamohanyag.medium.com game-menus-as-ux-masterpieces,
justinmind.com game UI principles, screenrant/game-wisdom/kokutech Hades
analyses, bugnet.io roguelite meta-progression.
