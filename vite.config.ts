import { defineConfig, Plugin } from 'vite';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dev-only QA telemetry sink: the game POSTs gameplay events to /__qa and they
 * land as JSONL in qa-logs/ for analysis. Exists only in the dev server —
 * production builds have no endpoint and fall back to localStorage.
 */
function qaTelemetryPlugin(): Plugin {
  return {
    name: 'qa-telemetry',
    configureServer(server) {
      const dir = join(process.cwd(), 'qa-logs');
      mkdirSync(dir, { recursive: true });
      server.middlewares.use('/__qa', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (chunk) => { body += chunk; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const day = new Date().toISOString().slice(0, 10);
            const line = JSON.stringify({ received: new Date().toISOString(), ...payload });
            appendFileSync(join(dir, `qa-${day}.jsonl`), line + '\n');
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  plugins: [qaTelemetryPlugin()],
});
