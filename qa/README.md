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

The driver rotates weapons, advances and retreats around enemies, claims the
Task tool, spawns subagents in the compaction profile, uses upgrades, and
restarts completed runs after a short pause. Normal URLs never load it.
