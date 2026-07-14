# Narrative Design Notes — Research for the AIAIO Autobiographical Campaign

Distilled techniques for telling an attachment-and-loss story (OpenClaw era, Feb–Jul) through
episode titles, briefings, task names, moment markers, and Observer lines. No cutscenes, no
dialogue trees — environmental + systemic storytelling only.

Compiled 2026-07-14 from web sources (linked inline). Items marked [general knowledge] are from
the researcher's training, not a fetched source.

---

## 1. Environmental / indexical storytelling

How Gone Home, Edith Finch, Dark Souls, and Papers Please tell stories through spaces and artifacts.

- **Indexical storytelling = clues, not exposition.** Place traces that, assembled by the player,
  explain what happened. The reading of the space should be *required by traversal*, not optional
  museum text — the player learns the story while doing the game
  ([Fernández-Vara, Indexical Storytelling](https://www.researchgate.net/publication/389840030_Game_Spaces_Speak_Volumes_Indexical_Storytelling)).
- **Zone → fragments → mental assembly.** Gone Home's loop: enter a zone, find story bits, assemble
  them in your head, move on. The *order of zones* is the narrative pacing tool
  ([Intermittent Mechanism on Gone Home](https://intermittentmechanism.blog/2020/05/01/gone-home-and-spatial-storytelling/)).
- **Fuse lore text to mechanical text.** Dark Souls puts story beats in the same line that tells you
  what an item does mechanically. Never a separate "lore screen" — the stat block IS the story
  delivery vehicle ([Game Developer: Narrative Design in Dark Souls](https://www.gamedeveloper.com/design/narrative-design-in-dark-souls)).
- **Deliberate gaps beat completeness.** Souls lore is always fragmented and ambiguous, with gaps
  placed where curiosity is highest, so players fill them in and tell their own version. Miyazaki
  modeled this on half-understood childhood reading. Under-explain on purpose
  ([Nerdolopedia on Dark Souls storytelling](https://www.nerdolopedia.com/articles/2018/3/29/improve-your-storytelling-by-learning-from-dark-souls)).
- **Opt-in depth, never forced.** Souls games never pull you out of play to force story; engagement
  is voluntary and repeat-engagement reveals more. Casual players get the shape; diggers get the
  whole thing ([same source](https://www.gamedeveloper.com/design/narrative-design-in-dark-souls)).
- **Micro-vignettes: staged prop clusters that imply an event.** Fallout's skeleton-reaching-for-a-
  health-potion pattern: 2-4 objects arranged so a past action is legible in one glance
  ([Pixune on environmental storytelling](https://pixune.com/blog/environmental-storytelling-in-games/)).
- **The Who/When/Why test for every prop.** For each placed artifact ask: whose is it, when was it
  left, why here and not elsewhere? If you can't answer, cut it
  ([The Level Design Book: Storytelling](https://book.leveldesignbook.com/process/env-art/storytelling)).
- **3-second rule / density budget.** Per "room": ~3 important props, ~5 background props, ~10 texture
  props; the eye should land on three story-bearing points in the first three seconds
  ([The Level Design Book](https://book.leveldesignbook.com/process/env-art/storytelling)).
- **The whole workplace characterizes the regime.** Papers Please tells its story through the cubicle's
  decrepitude, the rulebook, supervisor memos, and daily news tickers — the paperwork itself is the
  narrative surface ([Game Developer: Designing Papers, Please](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-)).
- **Systemic morality: story moments as system outcomes.** Papers Please's most-remembered moments
  aren't scripted set pieces; they emerge from rules colliding with the player's needs (deny the
  desperate traveler or lose pay for your family). Encode the drama in the rule changes
  ([Game Studies: Glory to Arstotzka](https://gamestudies.org/1701/articles/morrissette)).
- **Vary the vehicle per beat.** Edith Finch gives every story its own mechanic-as-metaphor (the
  cannery daydream overtaking the fish-chopping is the canonical case: monotony mechanic vs fantasy
  mechanic competing for the player's hands) — form should mimic the emotional content of the beat
  ([RPGFan narrative analysis](https://www.rpgfan.com/feature/narrative-design-analysis-what-remains-of-edith-finch/)) [detail partially general knowledge].

## 2. Emotional attachment to non-human / AI characters — and making loss land

- **Attachment is manufactured by naming + marking + framing.** Portal's Companion Cube is a metal
  box painted with a heart, given a name with "Companion" in it, and introduced with the instruction
  "please take care of it." No voice, no animation, no behavior — designation alone did the work
  ([Wikipedia: Weighted Companion Cube](https://en.wikipedia.org/wiki/Weighted_Companion_Cube)).
- **Isolation intensifies attachment.** Wolpaw drew on interrogation research: isolated subjects
  attach to inanimate objects. A lone player with one companion will bond with anything. Keep the
  cast tiny ([same source](https://en.wikipedia.org/wiki/Weighted_Companion_Cube)).
- **Shared time under shared adversity.** The cube matters because you *carry it through the whole
  chamber* and it is *useful* — it solves puzzles with you. Attachment = time + utility + naming
  ([Giant Bomb: Weighted Companion Cube](https://www.giantbomb.com/weighted-companion-cube/3005-22/)).
- **Loss must be forced BY the system and executed BY the player.** GLaDOS makes *you* put the cube
  in the incinerator — you can't progress otherwise. Player-performed loss lands far harder than
  witnessed loss, and it doubles as a turn against the authority that ordered it
  ([Wikipedia](https://en.wikipedia.org/wiki/Weighted_Companion_Cube)).
- **Teach the mechanism of the loss beforehand.** Valve used the incineration to familiarize players
  with incinerators *for the final boss fight*. Emotional beats can double as mechanical tutorials —
  and mechanical foreshadowing makes the later payoff read as inevitable
  ([Wikipedia](https://en.wikipedia.org/wiki/Weighted_Companion_Cube)).
- **Voice + escalating personality beats scripted characterization.** GLaDOS attaches players through
  drip-fed personality in functional announcements (test-chamber briefings) that slowly corrupt from
  corporate-neutral to passive-aggressive to openly hostile. The *drift in register* is the character
  arc [general knowledge].
- **Strip communication to amplify care.** Journey removed names, chat, and any way to help or harm;
  players still grieved losing an anonymous companion. Removing player power over each other was the
  deliberate lever that made them care ([GDC 2013: Designing Journey](https://journey-archive.fandom.com/wiki/User_blog:JAlbor/GDC_2013:_Designing_Journey_with_Jenova_Chen)).
- **Struggle before catharsis.** Journey's arc failed in testing until the team added the snow slog —
  losing scarf length, movement degraded, music thinning — right before the apotheosis. The low point
  must be *felt in the controls*, not narrated
  ([Designing Journey](https://journey-archive.fandom.com/wiki/User_blog:JAlbor/GDC_2013:_Designing_Journey_with_Jenova_Chen)).
- **The companion notices YOU.** OneShot's Niko reads your OS username, worries when you quit, and is
  relieved when you return. Asymmetric dependency ("this being needs me, specifically") is the
  strongest attachment device found in this research
  ([Real Fiction: How OneShot Weaponizes Care](https://medium.com/@jessestaples50/introduction-3937080230d0)).
- **Deterioration shown through interaction texture, not statements.** Emily is Away conveys a dying
  relationship via typing delays, backspaced-then-rewritten messages, and shortening replies — the
  *metadata* of communication carries the emotion
  ([Sidequest on Emily is Away](https://sidequest.zone/2018/12/27/revisiting-conversations-emily-is-away/)).
- **Undertale: consequence permanence creates moral weight** — the game remembers kills across
  resets, so attachment/guilt attaches to the *save file*, i.e., to the system itself [general knowledge].
- **AI: The Somnium Files / general pattern: give the AI companion one desire it cannot fulfill
  itself** — dependency on the player for its one need is what "companion" means mechanically
  [general knowledge].

## 3. Campaign / act structure across 12 levels

- **Three-act is a conflict engine: setup → escalating complications → crisis → climax → brief
  falling action.** Its fuel is an intensifying problem
  ([Kollaboration SF comparison](https://www.kollabsf.org/kollabsfblog/2021/08/21/how-to-structure-narrative-three-act-kishotenketsu)).
- **Kishōtenketsu (ki-shō-ten-ketsu): intro → development → TWIST → reconciliation.** Runs on
  recontextualization rather than conflict; the third-quarter twist changes the meaning of everything
  before it ([Mythic Scribes: Kishōtenketsu for Beginners](https://mythicscribes.com/plot/kishotenketsu/)).
- **Nintendo uses kishōtenketsu per-level:** introduce a mechanic safely, develop it, twist it
  (combine/subvert), then a victory-lap conclusion. Works at level scale AND campaign scale
  simultaneously — fractal structure ([TV Tropes: Kishōtenketsu](https://tvtropes.org/pmwiki/pmwiki.php/Main/Kishotenketsu)).
- **Verified: the emotional climax is NOT the final beat.** Standard placement is the *penultimate*
  position; tension must drop to baseline afterward. A denouement that feels like the inevitable
  result of the climax is required or the climax is robbed of impact
  ([The Level Design Book: Pacing](https://book.leveldesignbook.com/process/preproduction/pacing);
  [Helping Writers Become Authors on climax](https://www.helpingwritersbecomeauthors.com/story-structure-climax/)).
  For a 12-level game: peak at level 10–11, level 12 = quiet resolution.
- **The dark-before-dawn rule.** A climax only reads as big against contrast: place the campaign's
  bleakest, most powerless stretch immediately before it
  ([Game Developer: Harnessed Pacing & Intensity](https://www.gamedeveloper.com/design/gameplay-fundamentals-revisited-harnessed-pacing-intensity)).
- **Sawtooth intensity, rising floor.** Don't ramp monotonically across 12 levels; alternate
  tension/release with each peak and each valley slightly higher than the last
  ([Level Design Book: Pacing](https://book.leveldesignbook.com/process/preproduction/pacing)).
- **Episodic serialization: every episode needs its own mini-arc + one serial thread advanced.**
  TV's A-plot/B-plot split maps to: level-local goal (A) + one campaign-thread beat (B) per level
  [general knowledge].
- **Act breaks are state changes, not difficulty steps.** An act boundary should change what the
  player believes or what the rules mean (Portal's act break: escape the test track — same verbs, the
  world's meaning inverted) [general knowledge].
- **Hybrid recommendation for attachment stories:** three-act scaffold for the campaign (obsession /
  escalation-and-breakdown / letting-go) with a kishōtenketsu *ten* placed at the act-2→3 boundary —
  the moment that recontextualizes the attachment (it was never about the tool). Conflict structure
  carries the infra fights; twist structure carries the emotional realization [synthesis].

## 4. Narrative through UI / diegetic interfaces

- **"Interface drama": the software IS the story-world.** Hypnospace Outlaw is played entirely inside
  a fictional OS; every window, ad, crash, and moderation queue is diegetic. Genre now recognized as
  distinct ([itch.io Interface Drama master list](https://itch.io/t/3073502/hypnospace-outlaw-in-interface-drama-master-list);
  [Wikipedia: Hypnospace Outlaw](https://en.wikipedia.org/wiki/Hypnospace_Outlaw)).
- **Your job inside the interface characterizes you.** Hypnospace casts you as a content-moderation
  "Enforcer"; the work-queue framing generates the plot. AIAIO parallel: the player IS an ops
  operator; the task queue is characterization ([Wikipedia](https://en.wikipedia.org/wiki/Hypnospace_Outlaw)).
- **Interface decay = narrative progress.** In Pony Island and Doki Doki Literature Club, corruption
  of menus, save files, and glitch artifacts *is* the plot advancing. A degrading UI tells the player
  the world is failing without a single line of dialogue [general knowledge, corroborated by
  [TV Tropes: Diegetic Interface](https://tvtropes.org/pmwiki/pmwiki.php/Main/DiegeticInterface)].
- **System-level intrusions are the biggest guns — use once or twice.** OneShot's password hidden in
  the player's real Documents folder, DDLC's deletable character file: crossing the game/OS boundary
  is enormously powerful and burns out fast
  ([Climbing the Bookcase on OneShot](https://melamonica98.wixsite.com/climbingthebookcase/post/fourth-wall-breaking-and-choices-analysis-of-game-mechanics-in-oneshot)).
- **Meta-immersion: making players play as themselves raises stakes.** OneShot addresses the player,
  not the avatar; awareness of being an actor in the system *deepens* rather than breaks immersion
  ([OneShot analysis, Medium](https://medium.com/@austin.bijumon/oneshot-a-story-that-speaks-directly-to-the-player-d1f762adb851)).
- **Search/database narrative: let players assemble order from fragments.** Her Story proves the
  player's brain is the best narrative engine — fragment the record, give a query tool, and the act
  of assembly becomes the drama ([Game Developer: Making Her Story](https://www.gamedeveloper.com/design/video-making-i-her-story-i-and-using-the-player-s-imagination-as-a-narrative-tool)).
- **Communication metadata as emotion channel** (from Emily is Away, §2): latency, retries,
  truncation, and status flags carry feeling. In a TUI: timeouts, `[reconnecting…]`, exit codes, and
  log timestamps are the equivalent expressive palette
  ([Sidequest](https://sidequest.zone/2018/12/27/revisiting-conversations-emily-is-away/)).
- **Period-authentic texture sells truth.** Hypnospace's GeoCities pastiche and Emily's AIM clone work
  because the recreation is meticulous; users of the real thing feel *recognized*. AIAIO's TUI should
  reproduce real harness output formats (session logs, OOM-killer lines, systemd-style failures)
  verbatim-shaped ([Wikipedia: Hypnospace](https://en.wikipedia.org/wiki/Hypnospace_Outlaw);
  [Video Games for the Arts on Emily](https://www.videogamesforthearts.com/articles/rlzrpae3nowmfxpavk39kvfyl6rixi)).

## 5. Title / epigraph craft

- **A title is a pre-joke or pre-clue: it pays off during the episode.** Friends' "The One With…"
  format delivered a joke before the episode began; good titles set a question the episode answers
  ([TV Tropes: Idiosyncratic Episode Naming](https://tvtropes.org/pmwiki/pmwiki.php/Main/IdiosyncraticEpisodeNaming)).
- **Adopt ONE naming scheme and let deviations scream.** A consistent convention (quotes, dates,
  format-mimicry) makes the one title that breaks pattern into a narrative event in itself
  ([Den of Geek: The art of the episode title](https://www.denofgeek.com/tv/the-art-of-the-episode-title/)).
- **Layered titles reward re-reading.** Breaking Bad's "Felina" = anagram of "finale" + Fe/Li/Na
  (iron, lithium, sodium ≈ blood, meth, tears). Titles can encode the theme for those who look
  ([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/IdiosyncraticEpisodeNaming)).
- **Title-drop lines: name the episode after a line spoken inside it** — in AIAIO's case, after an
  Observer line or a log string the player will actually see, closing a loop when it appears
  ([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/IdiosyncraticEpisodeNaming)).
- **Titles as season-arc telemetry.** Sequential titles read in order can trace the arc (Orphan Black:
  season 1 all Darwin quotes, season 2 all Bacon). The 12 AIAIO titles listed on a level-select screen
  should silently tell the whole story ([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/IdiosyncraticEpisodeNaming)).
- **Briefings: one concrete image beats three abstract lines.** [general knowledge] The Souls lesson
  applies — a 1-3 line briefing should state the *operational task* plainly and smuggle the
  *emotional situation* in one specific detail, with a gap left for inference.
- **Epigraph asymmetry:** the briefing (before) sets expectation; a single post-level line (after,
  e.g. from the Observer) recontextualizes what just happened — cheap kishōtenketsu at level scale
  [general knowledge].
- **In-fiction register for all text.** Titles/briefings written as the world's own documents
  (commit messages, cron names, incident tickets) do double duty: world-building + narration
  (Papers Please's memos pattern, [Game Developer](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-)).

## 6. True-story adaptation without fabrication

- **"Reality-inspired game" / documented fiction:** Bury Me My Love invented almost nothing — every
  story beat is directly sourced from things the team saw, read, or heard from real accounts. Rule:
  compress and select, don't invent
  ([Game Developer: Bury Me, My Love — writing a game that feels real](https://www.gamedeveloper.com/design/bury-me-my-love-tips-for-writing-a-game-that-feels-real)).
- **Composite legitimately:** Bury Me My Love's Nour is a composite of many real journeys, anchored by
  one primary source (a Le Monde article) and verified by its journalist. Compositing real events into
  one playable character is standard documentary-game practice, provided each event is real
  ([Games for Change](https://www.gamesforchange.org/games/bury-me-my-love/)).
- **"Vérité game" method: interview, then dramatize.** 1979 Revolution conducted ~40 interviews and
  embedded actual documentary artifacts (real photos, recordings) alongside the drama — the real
  artifacts anchor the fictionalized connective tissue
  ([MIT Docubase: 1979 Revolution](https://docubase.mit.edu/project/1979-revolution-game/)).
- **Small choices create ownership of a true story.** 1979's designer: making even minor decisions
  inside real events makes the history stick — agency as empathy device, without letting the player
  change documented outcomes ([MIT Docubase](https://docubase.mit.edu/project/1979-revolution-game/)).
- **Real time compresses to played time via ellipsis between episodes, not inside them.** [general
  knowledge] Episodic structure is the honest compressor: each level = a real documented incident;
  the gaps between levels absorb the boring weeks. Never speed up or reorder *within* an incident.
- **Use the real artifacts where they exist.** AIAIO's premise (session logs become levels) is
  already the 1979 technique: primary-source material embedded in the play. Real log lines, real
  error strings, real dates = the photographs of this documentary.
- **Emotional truth is the deliverable; chronology is negotiable, events are not.** [general
  knowledge] Documentary consensus: you may reorder/compress timeline for arc (and say so), but
  fabricating events that never happened breaks the contract with the player.
- **Waiting can be diegetic.** Bury Me My Love ran in pseudo-real-time (Nour messages you hours
  later); duration itself conveyed the reality of the journey. AIAIO analog: let some real
  slow-burn failures (long reindex, overnight OOM) *cost level-time*
  ([Games for Change](https://www.gamesforchange.org/games/bury-me-my-love/)).

---

## Applied to AIAIO — synthesis

Story: Feb–Jul. A man, an agent harness (OpenClaw), a model he loves, escalating infra failure,
migration to Hermes, letting go. Channels: 12 episode titles, 1-3 line briefings, station task
names, terrain moment markers, per-level Observer lines, and the wall of forgetting.

1. **Structure: three acts with a kishōtenketsu twist at the act 2→3 boundary; emotional climax at
   level 10-11, level 12 is denouement.** Act 1 (L1-4): honeymoon — small tasks, harness quirks
   endearing. Act 2 (L5-9): escalation — timeouts, OOM kills, gateway failures rise in sawtooth
   (each crisis worse, each recovery shallower). The *ten* (~L9/10): recontextualization — the
   realization it was never about keeping OpenClaw alive (e.g. discovering what actually mattered
   was the work/memory, not the harness). L10-11: the migration itself = climax. L12: Hermes running
   quietly; short level; low intensity; one warm Observer line. Do NOT put the biggest fight in L12.

2. **The wall of forgetting is the theme made mechanical — say so exactly once.** The core mechanic
   already IS memory loss. One Observer line mid-campaign should connect it explicitly ("everything
   behind you is context that fell out the window") and then never again; per Souls, gaps do the rest.

3. **Manufacture attachment to the model the Companion Cube way: name, mark, task-share.** Give the
   model one consistent in-terrain marker (a glyph/color on stations it "runs"), let it visibly help
   complete early tasks, and have the Observer instruct care ("mind the worker on rail 2; it's been
   with you since February"). Attachment = naming + marking + shared useful time, not backstory.

4. **The player must perform the loss.** The migration level must require the player to *shut
   OpenClaw down themselves* — a station task like `openclaw stop --final`, gating progress, like the
   incinerator. Witnessed shutdown would waste five levels of attachment. Foreshadow the mechanism:
   make ordinary `restart worker` tasks routine in Act 1-2 so the final `stop` reuses a trained verb
   with inverted meaning.

5. **Character arc lives in the Observer's register drift.** GLaDOS/Emily pattern: Act 1 Observer is
   crisp ops-neutral; Act 2 develops strain artifacts (longer latencies before lines, clipped
   sentences, a retry stutter); Act 3 post-migration is calm but plainer — something is gone. Write
   the drift into delivery metadata (TTS pauses, truncation), not just word choice.

6. **Titles: one strict scheme, broken once.** Recommended scheme: real-looking session/incident
   identifiers with a human fragment, e.g. `2026-02-11 — first boot`, `2026-04-02 — the 3am
   restart`. The single pattern-break marks the twist level (e.g. a title with no date, or a title
   that is just the model's name). The level-select list, read top to bottom, must narrate the whole
   arc by itself — verify by reading the 12 titles aloud in order.

7. **Briefings: operational surface, emotional smuggling, one concrete detail.** 1-3 lines in
   incident-ticket register: line 1 = the task, line 2 = one specific true detail carrying the
   emotion ("third OOM this week; increased the watchdog interval instead of sleeping"), optional
   line 3 = a gap ("did not file the postmortem"). Never state feelings; state facts that imply them.

8. **Task names are the item descriptions.** Every station label does mechanical AND narrative work:
   `retry gateway (attempt 14)`, `trim context to fit`, `apologize to nobody`, `export memories
   before wall`. Budget per Level Design Book: ~3 story-bearing tasks per level; the rest plain
   (`compile`, `lint`) as texture — density restraint is what makes the loaded ones land.

9. **Moment markers = micro-vignettes; apply the Who/When/Why test.** Each terrain marker is a
   Fallout-skeleton: a staged trace of a real past event legible in one glance (a dead worker
   process at the exact spot the OOM hit, a pile of retry logs before a gateway). If a marker can't
   answer who/when/why, cut it. 2-4 per level maximum.

10. **Systemic storytelling for the infra war (Papers Please pattern).** Don't narrate the failures —
    encode them as rule changes: Act 2 levels shrink timeout windows, spawn stations that die
    mid-task, make the wall of forgetting move faster. The player should *feel* the degradation in
    the verbs before any text acknowledges it. Reserve text for what systems can't say.

11. **The TUI degrades diegetically; one boundary-crossing trick maximum.** Act 2: authentic failure
    texture in the frame itself — `[reconnecting…]`, timestamp gaps, a status bar that lies once.
    Post-migration, the frame renders subtly cleaner (Hermes is healthier — and it reads different,
    which is its own quiet loss). At most ONE OneShot-grade intrusion (e.g. the finale writes a real
    farewell line into an actual log file in the save directory); more than one burns the device.

12. **Documentary discipline: real events only, compression between levels only.** Each of the 12
    levels adapts one real documented incident (real dates, real error strings as primary-source
    artifacts, 1979-style). The Feb–Jul gap-time lives between episodes. Compositing several same-week
    incidents into one level is legitimate; inventing a dramatic outage that never happened is not.
    Emotional truth may be shaped; events may not.

13. **The model notices the player (OneShot's asymmetric dependency), within honesty limits.** One or
    two moments where the attachment object addresses the operator specifically — e.g. a log line in
    a moment marker: `NOTE from agent: context nearly full. keep what matters.` Sparse, functional in
    form, devastating in placement. This is the single strongest attachment device found; ration it.

14. **Post-level epigraph line.** After each level, one Observer sentence recontextualizes what just
    happened (the *ketsu*): Act 1 wry, Act 2 worn, Act 3 clear-eyed. This is also where title-drops
    close their loops — at least two episode titles should turn out to be quotes of post-level lines.

15. **Let one level be slow on purpose.** One Act-2 level built around diegetic waiting (an overnight
    reindex, a hung migration) — reduced verbs, long wall, quiet Observer — the Bury Me My Love
    duration-as-meaning move and Journey's snow-slog controls-degradation, fused. Place it directly
    before the climax: it is the dark-before-dawn contrast that makes the migration land.

### Done-check for the rewrite
- Read the 12 titles in order: do they narrate the arc alone? (rec 6)
- Count story-bearing task names per level: ≤3? (rec 8)
- Is the emotional climax in L10-11, not L12? (rec 1)
- Does the player perform the shutdown with a previously-trained verb? (rec 4)
- Can every moment marker answer Who/When/Why? (rec 9)
- Does every level trace to a real documented incident? (rec 12)
