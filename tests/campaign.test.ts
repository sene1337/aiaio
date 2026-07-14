import { combatModifiers, sourceDigest, validateManifest } from '../src/campaign';
import { planIsReachable, SessionDirector } from '../src/session-director';
import { SessionCard } from '../src/session';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const quiet: SessionCard = {
  session_id: 'director-quiet', message_count: 420, goal: 'review the relay',
  tasks: [{ name: 'review the relay', work_units: 3, at: 0.48 }], errors: [],
  moments: [{ at: 0.14, kind: 'note', text: 'relay opened' }],
};
const planA = SessionDirector.compile(quiet, { width: 4800 });
const planB = SessionDirector.compile(quiet, { width: 4800 });
assert(JSON.stringify(planA) === JSON.stringify(planB), 'Director plans must be deterministic');
assert(planIsReachable(planA), 'Director plans must keep stations/crates/interventions reachable');
const injected = planA.encounters.filter((encounter) => encounter.origin === 'observer');
assert(injected.length > 0 && injected.length <= 3, 'long factual quiet gaps may get at most three Observer interventions');
assert(new Set(injected.map((encounter) => encounter.observerLine)).size === injected.length, 'Observer intervention lines must not repeat within a plan');
assert(injected.every((encounter) => planA.stations.every((station) => Math.abs(station.x - encounter.x) >= 180)), 'Observer encounters must not sit on task stations');
const repeatedCopy = SessionDirector.compile(quiet, {
  width: 4800,
  entry: { file: 'quiet.json', sourceSessionId: 'director-quiet', sourceDigest: sourceDigest(quiet), order: 1, observerLines: ['same line', 'same line', 'same line'] },
});
const repeatedInjected = repeatedCopy.encounters.filter((encounter) => encounter.origin === 'observer');
assert(new Set(repeatedInjected.map((encounter) => encounter.observerLine)).size === repeatedInjected.length, 'repeated authored Observer copy must fall back to unique disclosures');
const burst = SessionDirector.compile({ ...quiet, errors: [{ category: 'timeout', count: 60, at: [0.6] }, { category: 'regression', count: 60, at: [0.6] }] }, { width: 4800 });
assert(planIsReachable(burst), 'recorded bursts must fan out to non-overlapping reachable encounter positions');

const gentle = SessionDirector.compile(quiet, { width: 4800, recipe: { selection: 'story', pace: 'calm', ruleset: 'remix', remixProfile: 'gentle' } });
assert(gentle.encounters.every((encounter) => encounter.origin !== 'observer'), 'gentle Remix must disable Observer injections');
const brutal = combatModifiers({ selection: 'hardest', pace: 'intense', ruleset: 'remix', remixProfile: 'brutal' });
assert(brutal.hostileBudgetCap === 36 && brutal.hostilePerTypeCap === 10 && brutal.enemyDamageMultiplier === 1.25, 'brutal Remix bounds must stay fixed');

const manifest = {
  schemaVersion: 1, id: 'test', revision: 1, kind: 'opening', createdAt: '2026-07-13T00:00:00Z', sourceCardDigest: sourceDigest(quiet),
  selectedSourceIds: ['director-quiet'], recipe: { selection: 'story', pace: 'balanced', ruleset: 'factual' }, writerStatus: 'baseline',
  entries: [{ file: 'director-quiet.json', sourceSessionId: 'director-quiet', sourceDigest: sourceDigest(quiet), order: 1 }],
};
assert(validateManifest(manifest), 'valid campaign manifests must be accepted');
assert(!validateManifest({ ...manifest, schemaVersion: 2 }), 'unknown manifest versions must be rejected');

console.log('campaign director regressions passed');
