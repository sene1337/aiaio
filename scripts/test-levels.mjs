import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// The app intentionally has no test dependency. Compile the small pure-logic
// suite to an isolated temporary directory, then run it with the local Node.
const outDir = mkdtempSync(join(tmpdir(), 'aiaio-levels-'));
const tsc = join(process.cwd(), 'node_modules', '.bin', 'tsc');
const compiled = spawnSync(tsc, [
  '--module', 'commonjs', '--moduleResolution', 'node', '--target', 'ES2020',
  '--strict', '--skipLibCheck', '--outDir', outDir,
  'src/levels.ts', 'tests/levels.test.ts',
], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

const tested = spawnSync(process.execPath, [join(outDir, 'tests', 'levels.test.js')], { stdio: 'inherit' });
process.exit(tested.status ?? 1);
