import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('production card assembly purges private assets and ships only fictional campaign cards', () => {
  const root = mkdtempSync(join(tmpdir(), 'aiaio-public-build-'));
  mkdirSync(join(root, 'examples'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(process.cwd(), 'examples', 'openclaw-hermes-campaign.json'), join(root, 'examples', 'openclaw-hermes-campaign.json'));
  cpSync(join(process.cwd(), 'scripts', 'fictional-campaign.mjs'), join(root, 'scripts', 'fictional-campaign.mjs'));
  cpSync(join(process.cwd(), 'scripts', 'make-demo-cards.mjs'), join(root, 'scripts', 'make-demo-cards.mjs'));
  mkdirSync(join(root, 'dist', 'cards'), { recursive: true });
  writeFileSync(join(root, 'dist', 'cards', 'private-session.json'), JSON.stringify({ session_id: 'PRIVATE_SENTINEL' }));
  const result = spawnSync(process.execPath, ['scripts/make-demo-cards.mjs', 'dist'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, 'dist', 'cards', 'private-session.json')), false);
  const index = JSON.parse(readFileSync(join(root, 'dist', 'cards', 'index.json'), 'utf8'));
  assert.deepEqual(index, []);
  const manifest = JSON.parse(readFileSync(join(root, 'dist', 'cards', 'campaigns', 'openclaw-hermes.json'), 'utf8'));
  assert.equal(manifest.kind, 'fictional');
  assert.equal(manifest.entries.length, 12);
});
