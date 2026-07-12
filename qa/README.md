# QA autoplay

Autoplay is a development-only driver for repeatable browser QA. It lives
outside `src/`, is loaded only when Vite is in dev mode, and is removed from
production builds.

Start the dev server, then open one of these URLs:

```text
http://127.0.0.1:5173/?qa=autoplay&profile=compaction
http://127.0.0.1:5173/?qa=autoplay&profile=artillery
http://127.0.0.1:5173/?qa=autoplay&profile=tactical
```

The default is the fictional chaotic example card. To test a local scanned
card, add its basename without putting that private filename in tracked code:

```text
?qa=autoplay&profile=compaction&card=my-local-card.enriched.json
```

For a human-played capture, load a private card directly into its briefing
without starting the autoplay controller:

```text
?qa=manual&card=my-local-card.enriched.json
```

Both modes are local QA entry points, not game features. The production build
removes their dynamic loader, and card basenames remain in the URL rather than
tracked source.

The driver rotates weapons, advances and retreats around enemies, claims the
Task tool, spawns subagents in the compaction profile, uses upgrades, and
restarts completed runs after a short pause. Normal URLs never load it.

Voice/caption tests that cycle system voices should finish with
`&resetVoice=1`. It clears the QA-selected voice name and restores automatic
Observer voice selection without shipping any reset route in production.
