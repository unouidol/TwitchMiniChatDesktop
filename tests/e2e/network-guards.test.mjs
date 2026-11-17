import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { builtinModules, createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { build } from 'vite';
import { WebSocketServer } from 'ws';
import { verifyNetworkEvidence } from './network-evidence.mjs';
import { createCanonicalTemporaryDirectory } from './finalize.mjs';

const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(project, '.test-build/electron-e2e');
await build({ configFile: false, envFile: false, build: {
  outDir: path.join(output, 'guard-probes'), emptyOutDir: false,
  lib: { entry: path.join(project, 'tests/e2e/network-probe.ts'), formats: ['cjs'], fileName: () => 'probe.cjs' },
  rollupOptions: { external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)] },
} });

async function target() {
  const counts = { http: 0, upgrade: 0 };
  const server = http.createServer((_request, response) => {
    counts.http++;
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Local guard probe</title>');
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    counts.upgrade++;
    sockets.handleUpgrade(request, socket, head, (connection) => sockets.emit('connection', connection, request));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { counts, origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      await new Promise((resolve) => sockets.close(resolve));
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } };
}

async function removeOwnedProfile(root) {
  assert.equal(await fs.realpath(root), root);
  assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
  assert.equal(await fs.readFile(path.join(root, 'fixture-owner'), 'utf8'), 'tmc-network-guard-probe');
  const deadline = Date.now() + 10000;
  for (;;) {
    try { await fs.rm(root, { recursive: true }); return; } catch (error) {
      if (!['EBUSY', 'ENOTEMPTY'].includes(error.code) || Date.now() >= deadline) throw error;
      await delay(100);
    }
  }
}

for (const transport of ['mainFetch', 'mainWebSocket', 'chromium']) {
  test(`real Electron ${transport} guard rejects and records a local unexpected destination`, async () => {
    const root = await createCanonicalTemporaryDirectory('tmc-electron-e2e-');
    await fs.writeFile(path.join(root, 'fixture-owner'), 'tmc-network-guard-probe');
    const evidence = path.join(output, `guard-probe-${transport}-${path.basename(root)}`);
    await fs.mkdir(evidence, { recursive: true });
    const allowed = await target();
    const denied = await target();
    let child;
    let exited;
    try {
      await fs.writeFile(path.join(root, 'probe-config.json'), JSON.stringify({
        transport, allowedOrigin: allowed.origin, deniedOrigin: denied.origin,
      }));
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      child = spawn(require('electron'), [path.join(output, 'guard-probes/probe.cjs'), `--tmc-probe-root=${root}`], {
        cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      exited = once(child, 'close');
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      const timeout = setTimeout(() => child.kill(), 25000);
      let code;
      try { [code] = await exited; } finally { clearTimeout(timeout); }
      await fs.writeFile(path.join(evidence, 'process.log'), stdout + stderr);
      const raw = await fs.readFile(path.join(root, 'network.json'), 'utf8');
      await fs.writeFile(path.join(evidence, 'network.json'), raw);
      assert.equal(code, 1, 'Probe must fail specifically through the guard, not pass or time out');
      assert.match(stderr, /Forbidden .* destination/);
      const observed = verifyNetworkEvidence(JSON.parse(raw), 'guard-denied', transport);
      assert.equal(observed.counts[transport].denied, 1);
      assert.doesNotMatch(raw, /do-not-record|synthetic-sensitive-query|\/denied/);
      assert.deepEqual(denied.counts, { http: 0, upgrade: 0 }, 'Rejected request must never reach target');
      assert.ok(allowed.counts.http + allowed.counts.upgrade > 0, 'Allowed request must really reach fixture');
      await fs.writeFile(path.join(evidence, 'probe-result.json'), JSON.stringify({
        expectedFailure: true, exitCode: code, transport, allowedTarget: allowed.counts, deniedTarget: denied.counts,
      }, null, 2));
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) { child.kill(); await exited; }
      await allowed.close();
      await denied.close();
      await removeOwnedProfile(root);
      console.log(`Probe process exited and owned profile removed; evidence: ${evidence}`);
    }
  });
}

test('missing, incomplete and inconsistent network evidence is never an empty success', () => {
  assert.throws(() => verifyNetworkEvidence(undefined));
  assert.throws(() => verifyNetworkEvidence({ schemaVersion: 1, collectionComplete: false }));
  assert.throws(() => verifyNetworkEvidence({ schemaVersion: 1, collectionComplete: true, completionReason: 'will-quit',
    installed: { mainFetch: true, mainWebSocket: true, chromium: true }, events: [],
    counts: { mainFetch: { allowed: 1, denied: 0 } }, scopes: { mainFetch: 'test' } }));
});
