import { app, BrowserWindow, safeStorage, session, shell, WebContentsView } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installNetworkGuards } from './network-guards';
import { registerPlayerShutdown } from '../../src/main/player/registerPlayerShutdown';

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
// Replace only the OS browser boundary. Never launch an authenticated browser.
let browserAttempts = 0;
const linkAttempts: string[] = [];
shell.openExternal = async (target: string): Promise<void> => {
  const url = new URL(target);
  if (url.hostname === 'example.test') {
    assert.ok([
      'https://example.test/history?x=1&y=2', 'http://example.test/live',
      'https://example.test/middle', 'https://example.test/keyboard', 'https://example.test/fail',
    ].includes(target));
    linkAttempts.push(target);
    fs.writeFileSync(path.join(root, 'chat-link-attempts.json'), JSON.stringify({ attempts: linkAttempts }));
    if (target === 'https://example.test/fail' && linkAttempts.filter((attempt) => attempt === target).length === 1) throw new Error('Synthetic default browser unavailable');
    return;
  }
  assert.equal(url.origin, backend.origin);
  assert.equal(url.pathname, '/oauth/start');
  const nativePanels = BrowserWindow.getAllWindows().flatMap((window) => window.contentView.children);
  assert.ok(nativePanels.length > 0, 'The embedded PCG view must exist while login is open');
  for (const panel of nativePanels) {
    assert.equal(panel.getBounds().width, 0, 'Native panel must not cover the login dialog');
    assert.equal(panel.getBounds().height, 0);
  }
  browserAttempts++;
  fs.writeFileSync(path.join(root, 'browser-attempts.json'), JSON.stringify({ browserAttempts }));
  if (browserAttempts === 1) throw new Error('Synthetic OS browser failure');
};
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
// Bound the expanded complete auth/chat/appearance/badge scenario; individual
// production deadlines and assertion timeouts remain unchanged.
const watchdog = setTimeout(() => fail('E2E Electron lifetime exceeded 180 seconds'), 180000);
watchdog.unref();
app.once('will-quit', () => clearTimeout(watchdog));

let playerService: import('../../src/main/player/TmcPlayerManager').TmcPlayerManager | null = null;
const destroyedContents = new Set<number>();
app.on('web-contents-created', (_event, contents) => {
  const id = contents.id;
  contents.once('destroyed', () => { destroyedContents.add(id); if (destroyedContents.size > 256) fail('Destroyed contents observation limit exceeded'); });
});
const guards = installNetworkGuards({
  backendOrigin: backend.origin,
  socketUrl,
  rendererRoot: path.resolve(__dirname, '../renderer/main_window'),
  evidencePath: path.join(root, `${phase}-network.json`),
  fail,
  playerSource: () => {
    const source = playerService?.source;
    return source ? { ...source, channel: playerService.getStatus().channel } : null;
  },
});

// Substitute only the Twitch HTTP boundary with the loopback fixture. The
// existing guard still sees every actual transport destination and rejects others.
const guardedFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const original = new URL(input instanceof Request ? input.url : String(input));
  if (original.origin === 'https://id.twitch.tv' || original.origin === 'https://api.twitch.tv') {
    assert.ok(['/oauth2/validate', '/helix/users', '/helix/chat/color', '/helix/chat/badges', '/helix/chat/badges/global', '/helix/chat/emotes', '/helix/chat/emotes/global', '/helix/chat/emotes/user'].includes(original.pathname));
    const local = new URL(`/twitch${original.pathname}`, backend.origin);
    local.search = original.search;
    return guardedFetch(local, init);
  }
  return guardedFetch(input, init);
};

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
    // Synthetic browser cookie only in B's isolated temporary partition. No login/network.
    await session.fromPartition('persist:tmc-pcg-B').cookies.set({
      url: 'https://www.twitch.tv', name: 'auth-token', value: 'synthetic-browser-session-B',
      secure: true, httpOnly: true, expirationDate: Math.floor(Date.now() / 1000) + 3600,
    });
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
  let startupPreferredProfileId: string | undefined;
  if (phase === 'first') {
    // Select the account restored last, independently of timestamp ties during seeding.
    startupPreferredProfileId = saved[saved.length - 1].profileId;
    const { TmcActiveAccountStore } = await import('../../src/main/accounts/TmcActiveAccountStore');
    await new TmcActiveAccountStore().saveActiveProfileId(startupPreferredProfileId);
  }
  const { registerIpcHandlers } = await import('../../src/main/ipc/registerIpcHandlers');
  const { createMainWindow } = await import('../../src/main/windows/createMainWindow');
  const services = await registerIpcHandlers({
    backendBaseUrl: backend.origin,
    desktopClientId: 'synthetic-e2e',
    desktopClientVersion: 'test',
    desktopFlavor: 'test',
    defaultHistorySeconds: 60,
    oauthStartUrl: `${backend.origin}/oauth/start`,
    oauthFinalizeUrl: `${backend.origin}/finalize`,
    oauthDesktopRestoreUrl: `${backend.origin}/restore`,
    oauthDesktopLogoutUrl: `${backend.origin}/logout`,
    oauthReturnScheme: 'desktop-claim',
    pcgExtensionUrlTemplate: `${backend.origin}/pcg/{channel}`,
    chatWebSocketUrl: socketUrl,
  });
  playerService = services.player;
  registerPlayerShutdown(services.player, () => fail('Player shutdown cleanup failed'));
  const window = createMainWindow();
  // Read-only native-view observation. No renderer test API or IPC substitute.
  let previousBounds = '';
  let boundsRevision = 0;
  let sizeCommand = 0;
  let playbackRevision = 0;
  let previousPlayback = '';
  const playerSecurity = new Map<number, { bridge: string; node: string; process: string; persistent: boolean; sandboxed: boolean }>();
  const probingSecurity = new Set<number>();
  let cookieCommand = '';
  let cookieCommandPending = false;
  const boundsObservation = setInterval(() => {
    const source = services.player.source;
    const playerViews = BrowserWindow.getAllWindows().flatMap((owner) => owner.contentView.children
      .filter((view): view is WebContentsView => view instanceof WebContentsView)
      .flatMap((view) => {
        const contents = view.webContents;
        if (!contents || contents.isDestroyed() || !source || !contents.getURL().startsWith(`${source.origin}${source.pathname}?`)) return [];
        const id = contents.id;
        if (!playerSecurity.has(id) && !probingSecurity.has(id) && services.player.getStatus().state === 'ready') {
          probingSecurity.add(id);
          // Observe only the app-owned local wrapper, never remote Twitch/PCG DOM.
          void contents.executeJavaScript('({ bridge: typeof window.tmc, node: typeof require, process: typeof process })').then((value: unknown) => {
            assert.ok(value && typeof value === 'object' && 'bridge' in value && typeof value.bridge === 'string' &&
              'node' in value && typeof value.node === 'string' && 'process' in value && typeof value.process === 'string');
            const metric = app.getAppMetrics().find((entry) => entry.pid === contents.getOSProcessId());
            playerSecurity.set(id, { bridge: value.bridge, node: value.node, process: value.process, persistent: contents.session.isPersistent(), sandboxed: metric?.sandboxed === true });
          }).catch(() => { if (!contents.isDestroyed()) fail('Local player isolation observation failed'); }).finally(() => probingSecurity.delete(id));
        }
        return [{ id, windowId: owner.id, bounds: view.getBounds(), security: playerSecurity.get(id) || null }];
      }));
    const playback = JSON.stringify({ status: services.player.getStatus(), sourceActive: !!source, destroyed: [...destroyedContents], playerViews, mainWindowId: window.id });
    if (playback !== previousPlayback) {
      if (++playbackRevision > 512) fail('Playback observation limit exceeded');
      fs.writeFileSync(path.join(root, `${phase}-playback-${playbackRevision}.json`), playback);
      previousPlayback = playback;
    }
    const sizePath = path.join(root, `${phase}-window-size-${sizeCommand + 1}.json`);
    if (fs.existsSync(sizePath)) {
      const requested: unknown = JSON.parse(fs.readFileSync(sizePath, 'utf8'));
      assert.ok(requested && typeof requested === 'object' && 'width' in requested && 'height' in requested);
      const { width, height } = requested;
      assert.ok(typeof width === 'number' && Number.isInteger(width) && width >= 960 && width <= 2000);
      assert.ok(typeof height === 'number' && Number.isInteger(height) && height >= 650 && height <= 1400);
      const previous = window.getBounds();
      window.setSize(width, height);
      fs.writeFileSync(path.join(root, `${phase}-window-size-${++sizeCommand}.ack.json`), JSON.stringify(previous));
    }
    if (window.isDestroyed()) return;
    const closePlayerPath = path.join(root, `${phase}-close-player`);
    const closePlayerAck = `${closePlayerPath}.ack`;
    if (fs.existsSync(closePlayerPath) && !fs.existsSync(closePlayerAck)) {
      assert.equal(fs.readFileSync(closePlayerPath, 'utf8'), 'close-owned-detached-player');
      const status = services.player.getStatus();
      assert.equal(status.mode, 'detached');
      const children = BrowserWindow.getAllWindows().filter((child) => child !== window && child.getTitle() === `TMC live · #${status.channel}`);
      assert.equal(children.length, 1);
      children[0].close();
      fs.writeFileSync(closePlayerAck, 'closed');
    }
    // Parent-runner control of synthetic cookie storage, never production IPC.
    const commandPath = path.join(root, 'pcg-cookie-command');
    if (phase === 'first' && !cookieCommandPending && fs.existsSync(commandPath)) {
      const requested = fs.readFileSync(commandPath, 'utf8');
      assert.ok(requested === 'present' || requested === 'missing');
      if (requested !== cookieCommand) {
        cookieCommandPending = true;
        const cookies = session.fromPartition('persist:tmc-pcg-B').cookies;
        const operation = requested === 'missing'
          ? cookies.remove('https://www.twitch.tv', 'auth-token')
          : cookies.set({ url: 'https://www.twitch.tv', name: 'auth-token',
            value: 'synthetic-browser-session-B', secure: true, httpOnly: true,
            expirationDate: Math.floor(Date.now() / 1000) + 3600 });
        void operation.then(() => {
          cookieCommand = requested;
          cookieCommandPending = false;
          fs.writeFileSync(path.join(root, 'pcg-cookie-ack'), requested);
        }).catch(() => fail('Synthetic PCG cookie fixture change failed'));
      }
    }
    const snapshot = JSON.stringify(window.contentView.children
      .filter((view): view is WebContentsView => view instanceof WebContentsView)
      .map((view) => ({ id: view.webContents.id, bounds: view.getBounds() })));
    if (snapshot === previousBounds) return;
    if (++boundsRevision > 2048) fail('Native bounds observation limit exceeded');
    // Immutable snapshots avoid replacing a file while Windows readers hold it.
    const destination = path.join(root, `${phase}-pcg-bounds-${boundsRevision}.json`);
    fs.writeFileSync(`${destination}.tmp`, snapshot);
    fs.renameSync(`${destination}.tmp`, destination);
    previousBounds = snapshot;
  }, 100);
  boundsObservation.unref();
  window.once('closed', () => clearInterval(boundsObservation));
  app.once('will-quit', () => clearInterval(boundsObservation));
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
    startupPreferredProfileId,
    encryptionAvailable: true,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    rendererSurface,
    rendererSandboxed: rendererMetric?.sandboxed,
  }));
});
