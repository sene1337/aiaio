# Prior Art Notice — Defensive Publication

**Method:** Deterministically generating playable video-game content from
AI-agent / large-language-model (LLM) session logs.

**Author / Inventor:** Brad Mills
**First public disclosure date:** 2026-07-10
**Status:** Published as prior art. This document, the accompanying formal
disclosure at [`docs/tdcommons-disclosure.md`](docs/tdcommons-disclosure.md),
and the public source history of this repository are intended to establish
public, dated, enabling prior art for the method described below.

---

## Purpose

This is a **defensive publication**. It is published to place the method
described here — and its reasonably foreseeable variations — into the public
domain as prior art, so that the technique remains free to use and cannot be
removed from the public domain by a later patent filing.

Publishing this does **not** grant any trademark, copyright, or other rights in
the AIAIO name, code, art, or brand, all of which are reserved by the author.
It concerns only the underlying *method*.

## The method, in one paragraph

A software system ingests one or more **AI-agent or LLM session logs** (for
example, the transcript, event log, or database of a coding-agent or
conversational-agent session from any harness), extracts operational signals
from that log — including but not limited to error events and their categories,
the user's tasks and requests, tool-call activity, token usage, context-window
compaction events, restarts, model changes, recoveries, and their positions in
time — and **deterministically maps those signals onto the parameters of a
playable game** (level geometry, enemies, weapons, objectives, a consumable
resource economy, hazards, difficulty, progression, and narrative content),
seeded reproducibly from a session identifier, such that the same session log
always produces the same game and different sessions produce meaningfully
different games. The mapping specifically translates **agent-native operational
concepts** — the context window as a consumable resource, compaction as a
memory-loss game event, the error taxonomy as an enemy/weapon inventory,
sub-agent delegation as a gated in-game ability, and model upgrades as
progression — into game mechanics.

The full enumerated method, its embodiments, and its variations are set out in
[`docs/tdcommons-disclosure.md`](docs/tdcommons-disclosure.md).

## Relationship to known prior art

The author is aware of, and this publication is distinct from, prior work that
generates game content from *other* user data — e.g., music files (Vib-Ribbon,
1999; Audiosurf, 2008), a source-code repository (GitHub `gh-dungeons`, 2025),
and the academic field of experience-driven procedural content generation. The
method disclosed here is directed to the previously undisclosed source and
mapping: **AI-agent / LLM session logs mapped onto agent-native game
mechanics.** This notice discloses that method broadly to prevent its
enclosure.

## Citation

> Brad Mills, "Deterministically generating playable game content from AI-agent
> / LLM session logs," defensive publication, 2026-07-10. Available at:
> [this repository] and Technical Disclosure Commons.
