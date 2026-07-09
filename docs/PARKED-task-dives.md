# PARKED: Task Dives (v2 pass — approved direction, deliberately deferred)

Status: Brad approved the design 2026-07-09 and parked it: "let's save this idea
for a v2 pass another time. Let's just keep getting the core down."

## The design (the agreed version)

The six traversal concepts in `mockups/` become **dives**: at a big task station
(≥3 work units only — one or two per level, so they stay events, not chores),
pressing W doesn't start a progress bar — you dive INTO the task. The screen
tears open into a 30–45s playable mini-level seeded from that task's content.
Clear it = task complete in one shot. Small tasks keep hold-W.

**Which mini-game you get is determined by the KIND of work:**

| task smell | dive |
|---|---|
| debugging / "why is X failing" | Scrollback (descend the relevant transcript) |
| migration / build / deploy | Call Stack (climb the frames) |
| queue / triage / support | Three Lanes (catch the stream) |
| memory / docs / "remember…" | Memory Palace |
| refactor / cleanup | Ring Buffer |
| routing / integration | Rail Map |

**The tension stays connected:** your body remains heads-down and exposed in the
main world during a dive. A big hit out there rips you out with partial
progress. Token economy keeps running.

## Why this version and not "work first, then traverse to unlock"

Brad's original pitch gated the *reward* behind a mini-game after the work was
paid for — a toll booth (see: every resented hacking minigame). The flip makes
the mini-game BE the work, replacing the least interesting verb in the game
(standing still holding W) with the most interesting one. Rejected during design
review; flip approved.

## Prototype plan when unparked

1. Build ONE dive: Scrollback, wired to the level's biggest task.
2. Playtest question that decides everything: does being ripped out of a dive
   by main-world damage feel thrilling or infuriating?
3. Only then graduate the other five mockups to playable slices.

Mockups live in `mockups/` (self-contained attract-modes with design notes).
