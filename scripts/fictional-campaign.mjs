// fictional-campaign.mjs — the ONE builder for the authored public campaign.
// Consumed by scripts/make-demo-cards.mjs (build) and vite.config.ts (dev),
// so the two surfaces can never drift. Input: examples/openclaw-hermes-campaign.json.
//
// The campaign is an authored reconstruction of real, publicly tweeted events
// (see the file's "disclosure" field). Rich level fields (tasks, errors,
// moments, briefing, observerLines) map onto SessionCards + manifest entries;
// legacy flat fields (error/count/task) still work as a fallback.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function buildFictionalAssets(cwd = process.cwd()) {
  const campaign = JSON.parse(readFileSync(join(cwd, 'examples', 'openclaw-hermes-campaign.json'), 'utf8'));
  const cards = new Map();
  const entries = [];
  let order = 0;
  for (const act of campaign.acts) {
    let firstOfAct = true;
    for (const level of act.levels) {
      order++;
      const id = String(order).padStart(2, '0');
      const file = `openclaw-hermes/${id}.json`;
      const tasks = Array.isArray(level.tasks) && level.tasks.length > 0
        ? level.tasks.map((t) => ({ name: t.name, work_units: t.work_units ?? 2, completed: t.completed === true, at: t.at ?? 0.42 }))
        : [{ name: level.task ?? 'continue the recorded work', work_units: 2 + Math.floor(order / 3), completed: false, at: 0.42 }];
      const errors = Array.isArray(level.errors) && level.errors.length > 0
        ? level.errors
        : [{ category: level.error ?? 'timeout', count: level.count ?? 4, sample: 'fictional campaign signal', at: [0.3, 0.62, 0.79] }];
      const moments = Array.isArray(level.moments) && level.moments.length > 0
        ? level.moments
        : [{ at: 0.18, kind: 'note', text: `${act.name}: ${level.title}` }];
      const card = {
        session_id: `fictional-openclaw-hermes-${id}`,
        harness: 'fictional',
        when: level.when || 'THE LONG NOW',
        goal: level.goal,
        message_count: level.messages,
        token_peak: level.token_peak ?? 9000 + order * 550,
        compaction_events: level.compactions ?? Math.floor(order / 4),
        restarts: level.restarts ?? Math.floor(order / 3),
        recoveries: level.recoveries ?? Math.floor(order / 4),
        model_switches: level.model_switches ?? Math.floor(order / 5),
        stability_score: level.stability ?? Math.max(40, 78 - order * 2),
        tasks,
        errors,
        moments,
      };
      cards.set(file, card);
      entries.push({
        file,
        sourceSessionId: card.session_id,
        sourceDigest: `fiction-${id}`,
        order,
        title: level.title,
        taskLabel: tasks[0].name,
        ...(Array.isArray(level.briefing) && level.briefing.length > 0 ? { briefing: level.briefing.slice(0, 3) } : {}),
        ...(Array.isArray(level.observerLines) && level.observerLines.length > 0 ? { observerLines: level.observerLines.slice(0, 3) } : {}),
        ...(typeof level.epigraph === 'string' && level.epigraph.trim() ? { epigraph: level.epigraph } : {}),
        ...(level.pacing === false ? { pacing: false } : {}),
        ...(firstOfAct && act.gapBefore ? { gapBefore: String(act.gapBefore) } : {}),
        actName: act.name,
      });
      firstOfAct = false;
    }
  }
  const manifest = {
    schemaVersion: 1,
    id: campaign.id,
    revision: 2,
    kind: 'fictional',
    createdAt: '2026-07-14T00:00:00.000Z',
    sourceCardDigest: 'openclaw-hermes-true-story-v2',
    selectedSourceIds: entries.map((entry) => entry.sourceSessionId),
    recipe: { selection: 'story', pace: 'intense', observerTone: 'dry mission control', ruleset: 'factual' },
    writerStatus: 'custom',
    ...(campaign.subtitle ? { subtitle: campaign.subtitle } : {}),
    ...(campaign.disclosure ? { disclosure: campaign.disclosure } : {}),
    entries,
  };
  return { campaign, cards, manifest };
}
