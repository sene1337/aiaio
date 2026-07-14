# Enrich an AIAIO campaign

Campaign enrichment builds a versioned presentation overlay over immutable
local SessionCards. It never rewrites cards or source logs.

Use the main menu's **✦ ENRICH YOUR HISTORY** for the normal player flow. It
shows the selected shape, session gate, configured-AI privacy notice, local job
status, and a campaign premiere with an explicit **BEGIN** action.

- **SHAPE MY OPENING** needs six eligible local sessions and keeps chronological
  order.
- **BUILD MY CAMPAIGN** needs fifteen eligible local sessions and curates 15–24.

## Agent / CLI flow

The Hermes skill and local UI call the same compiler:

```bash
# factual campaign
npm run enrich -- --selection story --pace balanced --tone "dry mission control"

# explicit user request only: fixed Remix profiles
npm run enrich -- --selection hardest --pace intense --remix brutal
```

The writer is `claude -p` by default. Set `AIAIO_LLM_CMD` to another command
that accepts a prompt on stdin and returns JSON. Before any such call, obtain
the player's consent: compact redacted excerpts from the selected SessionCards
will be sent to that configured command.

## What is published

`scripts/enrich-campaign.mjs` validates `qa-logs/sources.json`, card presence,
and source freshness, then writes `public/cards/campaigns/latest.json` through a
staging file and atomic rename. A manifest contains only card-relative file
names, source ids/digests, ordering, recipe, writer status, and bounded
presentation copy—never log paths or raw excerpts.

If the agent times out, is unavailable, or returns invalid output, the compiler
publishes a complete deterministic baseline manifest. Missing/stale sources,
malformed input, or an insufficient six/fifteen-session pool publish nothing and
report the exact reason. Cancelling a dev job discards staging and preserves the
previous ready manifest.

## Factual play, Observer pacing, and Remix

`SessionDirector.compile()` is the single source of stations, moments,
encounters, crates, terrain positions, and permission terminals. Factual plans
retain source mechanics. In long quiet gaps only, the Observer may add at most
three internally recorded pacing encounters; they reuse an existing enemy type,
have no visual badge, and announce themselves with one short seeded nonrepeating
line.

Remix is never a slider:

| Profile | Hostiles | Enemy damage | Other |
|---|---:|---:|---|
| gentle | 70% | 80% | +10 shield, no Observer injections |
| balanced | normal | normal | up to three Observer injections |
| brutal | 150%, cap 36 total / 10 per type | 125% | no stability handicap, up to three injections |

Remix must be explicitly requested and writes to an isolated progress namespace.
Factual session recovery retains the existing history namespace; fictional public
campaign progress is isolated too.
