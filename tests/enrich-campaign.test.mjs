import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function writeFixture(root, count) {
  const cards = join(root, 'public', 'cards');
  const logs = join(root, 'logs');
  mkdirSync(cards, { recursive: true });
  mkdirSync(logs, { recursive: true });
  const index = []; const sources = {};
  for (let i = 1; i <= count; i++) {
    const file = `session-${i}.json`;
    const card = { session_id: `session-${i}`, message_count: i * 100, goal: `task ${i}`, tasks: [{ name: `task ${i}`, work_units: 2, at: 0.4 }], errors: [{ category: 'timeout', count: i, at: [0.6] }] };
    writeFileSync(join(cards, file), JSON.stringify(card));
    const source = join(logs, `${i}.jsonl`);
    writeFileSync(source, '{}\n');
    sources[file] = source;
    index.push({ file, session_id: card.session_id, errors: i, tasks: 1, stability: 70, messages: i * 100, mtime: i });
  }
  writeFileSync(join(cards, 'index.json'), JSON.stringify(index));
  mkdirSync(join(root, 'qa-logs'), { recursive: true });
  writeFileSync(join(root, 'qa-logs', 'sources.json'), JSON.stringify(sources));
}

test('campaign enrichment enforces gates and atomically emits a baseline manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'aiaio-enrich-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(process.cwd(), 'scripts', 'enrich-campaign.mjs'), join(root, 'scripts', 'enrich-campaign.mjs'));
  writeFixture(root, 5);
  let result = spawnSync(process.execPath, ['scripts/enrich-campaign.mjs', '--profile', 'opening', '--baseline'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /Need 6 eligible sessions/);
  assert.equal(existsSync(join(root, 'public', 'cards', 'campaigns', 'latest.json')), false);

  writeFixture(root, 15);
  result = spawnSync(process.execPath, ['scripts/enrich-campaign.mjs', '--profile', 'campaign', '--selection', 'longest', '--baseline'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(join(root, 'public', 'cards', 'campaigns', 'latest.json'), 'utf8'));
  assert.equal(manifest.entries.length, 15);
  assert.equal(manifest.entries[0].sourceSessionId, 'session-15');
  assert.equal(manifest.writerStatus, 'baseline');
  assert.equal(readdirSync(join(root, 'public', 'cards', 'campaigns')).some((file) => file.endsWith('.staging')), false);
});
