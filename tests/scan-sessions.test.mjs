import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeIndex } from '../scripts/scan-sessions.mjs';

test('capped rescans retain history and replace a session by its stable stem', () => {
  const existing = [
    { file: 'old-session-aaaaaaaa.json', session_id: 'old-session-aaaaaaaa', mtime: 10 },
    { file: 'growing-log-11111111.json', session_id: 'growing-log-11111111', mtime: 20 },
  ];
  const updates = [
    { file: 'growing-log-22222222.json', session_id: 'growing-log-22222222', mtime: 30 },
  ];

  assert.deepEqual(mergeIndex(existing, updates), [
    { file: 'growing-log-22222222.json', session_id: 'growing-log-22222222', mtime: 30 },
    { file: 'old-session-aaaaaaaa.json', session_id: 'old-session-aaaaaaaa', mtime: 10 },
  ]);
});
