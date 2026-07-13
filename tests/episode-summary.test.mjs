import assert from 'node:assert/strict';
import test from 'node:test';
import { EPISODE_TITLE_LIMIT, compactEpisodeText, episodeHeadline } from '../src/episode-summary.js';

test('episode headlines use the final factual breakthrough or facepalm', () => {
  assert.equal(episodeHeadline({
    goal: 'repair the data pipeline before the daily report',
    moments: [
      { at: 0.2, kind: 'frustration', text: 'The migration locked the only healthy replica.' },
      { at: 0.8, kind: 'win', text: 'The read path recovered after the rollback.' },
    ],
  }), 'BREAKTHROUGH: The read path recovered after the rollback.');

  assert.equal(episodeHeadline({
    moments: [{ at: 0.7, kind: 'frustration', text: 'The deploy failed after the final approval.' }],
  }), 'FACEPALM: The deploy failed after the final approval.');
});

test('episode headlines fall back to a real task and never expose CSS-style clipping', () => {
  assert.equal(episodeHeadline({
    goal: 'replace the background job runner',
    tasks: [{ name: 'restore the delayed queue', completed: true }],
  }), 'restore the delayed queue');

  const compact = compactEpisodeText('User question: please investigate why the scheduled worker keeps failing after every restart and repair the retry path.');
  assert.ok(compact.length <= EPISODE_TITLE_LIMIT);
  assert.ok(!compact.includes('...'));
  assert.ok(!compact.includes('…'));
});
