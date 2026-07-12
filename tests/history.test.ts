import { buildMemoryMap } from '../src/history';
import { LevelEntry, LevelProgress } from '../src/levels';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const entries: LevelEntry[] = [
  { file: 'a.json', session_id: 'a', when: '2026-01-01', errors: 1, tasks: 1, stability: 80, messages: 30 },
  { file: 'b.json', session_id: 'b', when: '2026-01-03', errors: 2, tasks: 2, stability: 70, messages: 40 },
  { file: 'c.json', session_id: 'c', when: '2026-01-05', errors: 4, tasks: 2, stability: 60, messages: 50 },
  { file: 'd.json', session_id: 'd', when: '2026-01-07', errors: 6, tasks: 3, stability: 50, messages: 60 },
  { file: 'e.json', session_id: 'e', when: '2026-01-09', errors: 8, tasks: 3, stability: 40, messages: 70 },
  { file: 'f.json', session_id: 'f', when: '2026-02-03', errors: 1, tasks: 1, stability: 90, messages: 20 },
];

const progress = new Map<string, LevelProgress>([
  ['a', { rank: 'A', bestScore: 1, plays: 1, lastPlayed: '2026-07-12', survived: true, recovered: true, perfect: false }],
  ['b', { rank: 'S', bestScore: 1, plays: 1, lastPlayed: '2026-07-12', survived: true, recovered: true, perfect: true }],
]);

const map = buildMemoryMap([...entries].reverse(), (id) => progress.get(id) ?? null);
assert(map.eras.length === 2, 'a dated gap must make a separate factual era');
assert(map.eras[0].chapters[0].entries.length === 5, 'chapter size must stay bounded at five records');
assert(map.eras[1].label === '2026-02-03', 'a one-day era label must be the factual session date');
assert(map.recommendation?.entry.session_id === 'c', 'Continue Journey must choose the first unrecovered record after recovery');
assert(map.recommendation?.reason === 'first unrecovered session after 2026-01-03', 'Continue Journey reason must cite the real prior date');

const dense = entries.map((entry, index) => ({ ...entry, session_id: `dense-${index}`, when: '2026-03-01' }));
const denseMap = buildMemoryMap(dense, () => null);
assert(denseMap.eras[0].chapters.length === 2, 'six sessions in one era must produce two chapters');
assert(denseMap.eras[0].chapters.every((chapter) => chapter.entries.length === 3), 'normal chapters must remain within the three-to-five session range');

console.log('history memory-map regressions passed');
