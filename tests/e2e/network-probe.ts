import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installNetworkGuards } from './network-guards';

const rootArgument = process.argv.find((value) => value.startsWith('--tmc-probe-root='));
assert.ok(rootArgument);
const root = fs.realpathSync.native(rootArgument.slice('--tmc-probe-root='.length));
assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
assert.ok(path.basename(root).startsWith('tmc-electron-e2e-'));
assert.equal(fs.readFileSync(path.join(root, 'fixture-owner'), 'utf8'), 'tmc-network-guard-probe');
for (const name of ['appData', 'userData', 'sessionData', 'logs', 'crashDumps'] as const) {
  const directory = path.join(root, name);
  fs.mkdirSync(directory);
  app.setPath(name, directory);
}
process.chdir(root);
const config = JSON.parse(fs.readFileSync(path.join(root, 'probe-config.json'), 'utf8'));
assert.ok(['mainFetch', 'mainWebSocket', 'chromium'].includes(config.transport));
for (const origin of [config.allowedOrigin, config.deniedOrigin]) {
  const url = new URL(origin);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.protocol, 'http:');
}
class GuardRejection extends Error {}
let rejected = false;
const guards = installNetworkGuards({
  backendOrigin: config.allowedOrigin,
  socketUrl: `${config.allowedOrigin.replace('http:', 'ws:')}/irc`,
  rendererRoot: path.join(root, 'unused-renderer'),
  evidencePath: path.join(root, 'network.json'),
  fail(message): never {
    rejected = true;
    throw new GuardRejection(message);
  },
});
const watchdog = setTimeout(() => { console.error('Guard probe timed out'); app.exit(2); }, 15000);
watchdog.unref();
function reportFailure(error: unknown) {
  console.error(error);
  if (error instanceof GuardRejection) { app.exit(1); return; }
  guards.finish('unexpected-error');
  app.exit(2);
}
process.on('uncaughtException', reportFailure);
process.on('unhandledRejection', reportFailure);
void app.whenReady().then(async () => {
  if (config.transport === 'mainFetch') {
    await fetch(`${config.allowedOrigin}/allowed`);
    await fetch(`${config.deniedOrigin}/denied?synthetic-sensitive-query=do-not-record`);
  } else if (config.transport === 'mainWebSocket') {
    const socket = new WebSocket(`${config.allowedOrigin.replace('http:', 'ws:')}/irc`);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => { socket.close(); resolve(); }, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    new WebSocket(`${config.deniedOrigin.replace('http:', 'ws:')}/denied?synthetic-sensitive-query=do-not-record`);
  } else {
    const window = new BrowserWindow({ show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
    await window.loadURL(`${config.allowedOrigin}/allowed`);
    try {
      await window.loadURL(`${config.deniedOrigin}/denied`);
    } catch (error) {
      if (rejected && error instanceof Error && 'code' in error &&
          ['ERR_FAILED', 'ERR_ABORTED'].includes(String(error.code))) {
        console.error(`Expected Chromium navigation cancellation: ${String(error.code)}`);
        app.exit(1);
        return;
      }
      throw error;
    }
  }
  console.error('Guard failed to terminate the forbidden request');
  app.exit(3);
});
