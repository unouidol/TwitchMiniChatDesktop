import { app, safeStorage, session } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installNetworkGuards } from './network-guards';

function argument(name: string): string {
  const prefix = `--tmc-e2e-${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  assert.ok(value, `Missing test bootstrap argument: ${name}`);
  return value;
}

const root = fs.realpathSync.native(argument('root'));
assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
assert.ok(path.basename(root).startsWith('tmc-electron-e2e-'));
assert.equal(fs.readFileSync(path.join(root, 'fixture-owner'), 'utf8'), 'tmc-electron-account-removal');
const phase = argument('phase');
assert.ok(phase === 'first' || phase === 'restart');
const backend = new URL(argument('backend'));
assert.equal(backend.hostname, '127.0.0.1');
assert.equal(backend.protocol, 'http:');
const socketUrl = `${backend.origin.replace('http:', 'ws:')}/irc`;
const profile = path.join(root, 'profile');
for (const name of ['appData', 'userData', 'sessionData', 'logs', 'crashDumps'] as const) {
  const directory = name === 'userData' || name === 'sessionData' ? profile : path.join(root, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
process.chdir(root);
assert.equal(app.getPath('userData'), profile);

function fail(message: string): never {
  guards.finish('failure');
  fs.appendFileSync(path.join(root, 'failures.log'), `${message}\n`);
  console.error(message);
  app.exit(1);
  process.exit(1);
}

process.on('uncaughtException', (error) => fail(error.message));
process.on('unhandledRejection', (error: unknown) => fail(String(error)));
const watchdog = setTimeout(() => fail('E2E Electron lifetime exceeded 120 seconds'), 120000);
watchdog.unref();
app.once('will-quit', () => clearTimeout(watchdog));

const guards = installNetworkGuards({
  backendOrigin: backend.origin,
  socketUrl,
  rendererRoot: path.resolve(__dirname, '../renderer/main_window'),
  evidencePath: path.join(root, `${phase}-network.json`),
  fail,
});

app.on('window-all-closed', () => app.quit());

void app.whenReady().then(async () => {
  assert.equal(session.defaultSession.getStoragePath(), app.getPath('sessionData'));
  const available = safeStorage.isEncryptionAvailable() ||
    (safeStorage.isAsyncEncryptionAvailable && await safeStorage.isAsyncEncryptionAvailable());
  assert.ok(available, 'Real OS-backed safeStorage is unavailable; E2E cannot pass');
  if (process.platform === 'linux') {
    assert.notEqual(safeStorage.getSelectedStorageBackend(), 'basic_text', 'Plaintext safeStorage is not acceptable');
  }
  const { TmcSecureAuthSessionStore } = await import('../../src/main/auth/TmcSecureAuthSessionStore');
  const store = new TmcSecureAuthSessionStore();
  if (phase === 'first') {
    assert.equal(fs.existsSync(store.getFilePath()), false, 'First boot must use a fresh profile');
    const { TmcAccountChannelStore } = await import('../../src/main/channels/TmcAccountChannelStore');
    const channels = new TmcAccountChannelStore(profile);
    for (const profileId of ['B', 'A']) {
      await store.saveSession({
        profileId,
        username: `fixture-${profileId.toLowerCase()}`,
        userId: `fixture-user-${profileId}`,
        accessToken: `synthetic-access-${profileId}`,
        desktopSessionToken: `synthetic-desktop-${profileId}`,
      });
      await channels.setLastChannel(profileId, 'fixture-channel');
    }
  }
  const saved = await store.loadSessions();
  assert.deepEqual(saved.map((entry) => entry.profileId).sort(), phase === 'first' ? ['A', 'B'] : ['B']);
  for (const entry of saved) assert.equal(entry.desktopSessionToken, `synthetic-desktop-${entry.profileId}`);
  const { registerIpcHandlers } = await import('../../src/main/ipc/registerIpcHandlers');
  const { createMainWindow } = await import('../../src/main/windows/createMainWindow');
  await registerIpcHandlers({
    backendBaseUrl: backend.origin,
    desktopClientId: 'synthetic-e2e',
    desktopClientVersion: 'test',
    desktopFlavor: 'test',
    defaultHistorySeconds: 60,
    oauthFinalizeUrl: `${backend.origin}/forbidden-finalize`,
    oauthDesktopRestoreUrl: `${backend.origin}/restore`,
    oauthDesktopLogoutUrl: `${backend.origin}/logout`,
    oauthReturnScheme: 'desktop-claim',
    pcgExtensionUrlTemplate: `${backend.origin}/pcg/{channel}`,
    chatWebSocketUrl: socketUrl,
  });
  const window = createMainWindow();
  window.once('closed', () => app.quit());
  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  const rendererSurface: unknown = await window.webContents.executeJavaScript(
    '({ nodeAvailable: typeof require !== "undefined", isolatedBridge: typeof window.tmc?.accounts?.removeLocal === "function" })',
  );
  assert.deepEqual(rendererSurface, { nodeAvailable: false, isolatedBridge: true });
  const rendererMetric = app.getAppMetrics().find((metric) => metric.pid === window.webContents.getOSProcessId());
  assert.equal(rendererMetric?.sandboxed, true, 'Renderer must be sandboxed at OS level');
  fs.writeFileSync(path.join(root, `${phase}.json`), JSON.stringify({
    pid: process.pid,
    profile: app.getPath('userData'),
    savedProfiles: saved.map((entry) => entry.profileId).sort(),
    encryptionAvailable: true,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    rendererSurface,
    rendererSandboxed: rendererMetric?.sandboxed,
  }));
});
