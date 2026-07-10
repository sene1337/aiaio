# Enrich your SessionCard with your own agent

AIAIO's players *have agents*: Hermes, OpenClaw, Claude Code, whatever. So the
"AI enrichment" tier doesn't ship a model: **your agent writes your level.**

Two ways to run it:

## 1. The script (pipes through your CLI agent)

```bash
# default command is `claude -p`; override with AIAIO_LLM_CMD
node scripts/enrich-sessioncard.mjs public/cards/<card>.json ~/.claude/projects/<session-dir>

# examples of other agents:
AIAIO_LLM_CMD="ollama run llama3.2" node scripts/enrich-sessioncard.mjs card.json session.jsonl
```

It builds the prompt below, sends it to your agent, whitelists + redacts the
response, and writes `<card>.enriched.json`. Original numeric fields (counts,
tokens, stability) are **never** changed by the LLM, only the narrative fields.

## 2. The copy-paste prompt (any chat agent)

Paste this to your agent along with your SessionCard JSON and (optionally) some
of the session transcript:

---

You are writing the level script for AIAIO, a game where a real agent session
becomes a playable level. Below is a SessionCard (mechanical summary) and
excerpts from the actual session log.

Rewrite ONLY the narrative fields so the level tells this session's story:

- `goal`: one punchy line (≤140 chars): what this session was really about,
  in the spirit of the user's own words.
- `tasks`: 3–6 entries. `name` (≤60 chars): the real things worked on, phrased
  as imperative tasks ("fix the OAuth refresh loop", not "user asked about
  auth"). `at` (0..1): where in the session each began. `work_units` (1–6):
  proportional to how much of the session it consumed. `completed`: whether it
  actually got done.
- `moments`: 6–12 entries. Real, specific beats. `kind` is "win",
  "frustration", or "note"; `text` (≤110 chars) should quote or tightly
  paraphrase the actual moment; `at` (0..1) is its timeline position.

Rules: do not change any other field. Do not invent events that didn't happen.
Never include secrets, API keys, tokens, emails, or personally sensitive
content in any text field. Output ONLY the complete updated JSON object.

---

## Privacy note

Enrichment sends session content to whatever model your command invokes. For
private sessions, point `AIAIO_LLM_CMD` at a **local** model (Ollama, LM
Studio). The script additionally re-redacts every text field it accepts
(API-key/token/email/hex patterns) and enforces length caps, but the model
already saw the transcript, so choose the model accordingly.
