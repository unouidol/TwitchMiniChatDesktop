const assert = require('node:assert/strict');
const { beforeEach, afterEach, test, mock } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

let userDataPath;
let handlers = new Map();
let encryptionAvailable = true;
let decryptionAvailable = true;
let ircClient;
const mainFrame = { url: 'http://localhost:5173/' };
const sender = { mainFrame, isDestroyed: () => false, send: () => undefined };
const event = { sender, senderFrame: mainFrame };

global.MAIN_WINDOW_VITE_DEV_SERVER_URL = mainFrame.url;
global.MAIN_WINDOW_VITE_NAME = 'main_window';
global.WebSocket = class {
  constructor() { throw new Error('Unexpected WebSocket access in account-removal tests'); }
};

mock.module('electron', {
  cache: true,
  exports: {
    app: { getPath: () => userDataPath },
    ipcMain: {
      handle: (channel, handler) => {
        assert.equal(handlers.has(channel), false, `Duplicate handler: ${channel}`);
        handlers.set(channel, handler);
      },
    },
    BrowserWindow: {
      getAllWindows: () => [],
      fromWebContents: (contents) => contents === sender ? { webContents: sender } : null,
    },
    safeStorage: {
      isEncryptionAvailable: () => encryptionAvailable,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => {
        if (!decryptionAvailable) throw new Error('Controlled decryption failure');
        return value.toString();
      },
    },
  },
});

const { registerIpcHandlers } = require('../.test-build/main/ipc/registerIpcHandlers.js');
const { TmcTwitchIrcClient } = require('../.test-build/main/chat/TmcTwitchIrcClient.js');
const { TmcSecureAuthSessionStore } = require('../.test-build/main/auth/TmcSecureAuthSessionStore.js');
const { TMC_IPC_CHANNELS: channels } = require('../.test-build/shared/ipc/IpcChannels.js');
const config = {
  backendBaseUrl: 'https://backend.invalid',
  desktopClientId: 'test-client',
  desktopClientVersion: 'test',
  desktopFlavor: 'test',
  defaultHistorySeconds: 60,
  oauthFinalizeUrl: 'https://backend.invalid/finalize',
  oauthDesktopRestoreUrl: 'https://backend.invalid/restore',
  oauthDesktopLogoutUrl: 'https://backend.invalid/logout',
  oauthReturnScheme: 'desktop-claim',
};
const session = (profileId) => ({
  profileId,
  username: `test-${profileId}`,
  userId: `test-user-${profileId}`,
  accessToken: `synthetic-access-${profileId}`,
  desktopSessionToken: `synthetic-desktop-${profileId}`,
});
let requests;
let remoteLogout;
let logoutWarnings;
let expectedLogoutWarnings;

beforeEach(async (context) => {
  context.mock.method(TmcTwitchIrcClient.prototype, 'connect', function (params) {
    this.username = params.username;
    this.disconnectCount = this.disconnectCount || 0;
    ircClient = this;
  });
  context.mock.method(TmcTwitchIrcClient.prototype, 'disconnect', function () {
    this.disconnectCount++;
    this.username = null;
  });
  userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-account-removal-'));
  handlers = new Map();
  requests = [];
  logoutWarnings = 0;
  expectedLogoutWarnings = 0;
  encryptionAvailable = true;
  decryptionAvailable = true;
  remoteLogout = async () => new Response('{}');
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    const payload = JSON.parse(options.body);
    requests.push({ url, payload });
    if (url === config.oauthDesktopLogoutUrl) return remoteLogout(payload, options);
    assert.equal(url, config.oauthDesktopRestoreUrl, 'Unexpected external call');
    const profileId = payload.desktop_session_token.replace('synthetic-desktop-', '');
    const restored = session(profileId);
    return new Response(JSON.stringify({
      profile_id: restored.profileId,
      username: restored.username,
      user_id: restored.userId,
      access_token: restored.accessToken,
      desktop_session_token: restored.desktopSessionToken,
    }));
  });
  context.mock.method(console, 'warn', (...arguments_) => {
    assert.deepEqual(arguments_, ['[TMC Accounts] Remote desktop logout failed; account removed locally.']);
    logoutWarnings++;
    assert.ok(logoutWarnings <= expectedLogoutWarnings, 'Unexpected remote logout warning');
  });
});

afterEach(async () => {
  try {
    assert.equal(logoutWarnings, expectedLogoutWarnings, 'Expected remote logout warning count');
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
});

function invoke(channel, request, invokeEvent = event) {
  assert.ok(handlers.has(channel), `Missing handler: ${channel}`);
  return handlers.get(channel)(invokeEvent, request);
}

async function start(profileIds = ['A', 'B']) {
  const store = new TmcSecureAuthSessionStore();
  for (const profileId of profileIds) await store.saveSession(session(profileId));
  await registerIpcHandlers(config);
  await invoke(channels.ACCOUNT_SET_ACTIVE, { profileId: 'A' });
  await invoke(channels.CHAT_CONNECT_LIVE, { channel: 'test-channel' });
  return store;
}

async function assertRestart(expectedProfiles) {
  const persisted = await new TmcSecureAuthSessionStore().loadSessions();
  assert.deepEqual(persisted.map((account) => account.profileId).sort(), expectedProfiles);
  for (const account of persisted) {
    assert.equal(account.desktopSessionToken, session(account.profileId).desktopSessionToken);
  }
  requests.length = 0;
  handlers = new Map();
  await registerIpcHandlers(config);
  const restored = await invoke(channels.ACCOUNT_LIST);
  assert.deepEqual(restored.accounts.map((account) => account.profileId).sort(), expectedProfiles);
  assert.deepEqual(requests.map(({ payload }) => payload.desktop_session_token).sort(),
    expectedProfiles.map((profileId) => session(profileId).desktopSessionToken));
  return restored;
}

test('removes the currently selected account and preserves another saved account after restart', async () => {
  await start();
  const result = await invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: ' A ' });
  assert.deepEqual(result.accounts.map((account) => account.profileId), ['B']);
  assert.equal(result.activeProfileId, 'B');
  assert.equal(ircClient.disconnectCount, 1);
  assert.equal((await invoke(channels.AUTH_GET_STATUS)).profileId, 'B');
  assert.deepEqual(requests.filter(({ url }) => url === config.oauthDesktopLogoutUrl), [{
    url: config.oauthDesktopLogoutUrl,
    payload: { desktop_session_token: session('A').desktopSessionToken },
  }]);
  assert.equal((await assertRestart(['B'])).activeProfileId, 'B');
});

test('removes another saved account without disconnecting the currently selected account', async () => {
  await start();
  const result = await invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'B' });
  assert.equal(result.activeProfileId, 'A');
  assert.equal(ircClient.disconnectCount, 0);
  assert.equal(ircClient.username, session('A').username);
  assert.equal((await invoke(channels.AUTH_GET_STATUS)).profileId, 'A');
  assert.equal(requests.at(-1).payload.desktop_session_token, session('B').desktopSessionToken);
  await assertRestart(['A']);
});

test('removes the last account and clears the compatibility session after restart', async () => {
  await start(['A']);
  const result = await invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' });
  assert.deepEqual(result.accounts, []);
  assert.equal(result.activeProfileId, null);
  assert.equal(ircClient.disconnectCount, 1);
  assert.equal((await invoke(channels.AUTH_GET_STATUS)).isLoggedIn, false);
  assert.equal((await assertRestart([])).activeProfileId, null);
  assert.equal((await invoke(channels.AUTH_GET_STATUS)).isLoggedIn, false);
});

for (const failure of ['network', 'http']) {
  test(`remote logout ${failure} failure does not prevent local removal`, async () => {
    await start();
    expectedLogoutWarnings = 1;
    remoteLogout = async () => {
      if (failure === 'network') throw new Error('Controlled offline failure');
      return new Response('{}', { status: 503 });
    };
    const result = await invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' });
    assert.equal(result.activeProfileId, 'B');
    assert.equal(ircClient.disconnectCount, 1);
    assert.equal((await invoke(channels.AUTH_GET_STATUS)).profileId, 'B');
    await assertRestart(['B']);
  });
}

test('remote logout timeout still completes local removal', async (context) => {
  await start();
  expectedLogoutWarnings = 1;
  const timeout = context.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 10_000);
    return AbortSignal.abort(new DOMException('Controlled timeout', 'TimeoutError'));
  });
  let logoutSignal;
  remoteLogout = async (_payload, { signal }) => {
    logoutSignal = signal;
    signal.throwIfAborted();
    return new Response('{}');
  };
  const result = await invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' });
  assert.equal(timeout.mock.callCount(), 1);
  assert.ok(logoutSignal instanceof AbortSignal);
  assert.equal(logoutSignal.aborted, true);
  assert.equal(result.activeProfileId, 'B');
  assert.equal(ircClient.disconnectCount, 1);
  await assertRestart(['B']);
});

for (const failure of ['write', 'encrypt', 'decrypt']) {
  test(`persistent ${failure} failure rejects removal without changing either account`, async () => {
    const store = await start();
    const originalFile = await fs.readFile(store.getFilePath());
    if (failure === 'write') await fs.mkdir(`${store.getFilePath()}.tmp`);
    if (failure === 'encrypt') encryptionAvailable = false;
    if (failure === 'decrypt') decryptionAvailable = false;
    await assert.rejects(invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' }));
    assert.deepEqual(await fs.readFile(store.getFilePath()), originalFile);
    assert.deepEqual((await invoke(channels.ACCOUNT_LIST)).accounts.map((account) => account.profileId).sort(), ['A', 'B']);
    assert.equal((await invoke(channels.AUTH_GET_STATUS)).profileId, 'A');
    assert.equal(ircClient.disconnectCount, 0);
    assert.equal(requests.some(({ url }) => url === config.oauthDesktopLogoutUrl), false);
    encryptionAvailable = true;
    decryptionAvailable = true;
    if (failure === 'write') await fs.rmdir(`${store.getFilePath()}.tmp`);
    await assertRestart(['A', 'B']);
  });
}

test('a late remote logout completion does not affect a newly selected account or its chat', async () => {
  await start(['A', 'B', 'C']);
  let finishLogout;
  let notifyLogoutStarted;
  const logoutStarted = new Promise((resolve) => { notifyLogoutStarted = resolve; });
  remoteLogout = () => {
    notifyLogoutStarted();
    return new Promise((resolve) => { finishLogout = resolve; });
  };
  const removal = invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' });
  await logoutStarted;
  await invoke(channels.ACCOUNT_SET_ACTIVE, { profileId: 'C' });
  await invoke(channels.CHAT_CONNECT_LIVE, { channel: 'other-channel' });
  finishLogout(new Response('{}'));
  assert.equal((await removal).activeProfileId, 'C');
  assert.equal(ircClient.disconnectCount, 1);
  assert.equal(ircClient.username, session('C').username);
  assert.equal((await invoke(channels.AUTH_GET_STATUS)).profileId, 'C');
  await assertRestart(['B', 'C']);
});

test('rejects malformed payloads and remote or subframe senders before touching storage', async () => {
  const store = await start();
  const originalFile = await fs.readFile(store.getFilePath());
  for (const request of [undefined, null, {}, { profileId: 12 }, { profileId: ' ' }]) {
    await assert.rejects(invoke(channels.ACCOUNT_REMOVE_LOCAL, request), /profileId/);
  }
  for (const untrusted of [
    { sender: {}, senderFrame: mainFrame },
    { sender, senderFrame: { url: mainFrame.url } },
  ]) {
    await assert.rejects(invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' }, untrusted), /Untrusted/);
  }
  mainFrame.url = 'https://www.twitch.tv/';
  try {
    await assert.rejects(invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' }), /Untrusted/);
  } finally {
    mainFrame.url = 'http://localhost:5173/';
  }
  assert.deepEqual(await fs.readFile(store.getFilePath()), originalFile);
  assert.equal(ircClient.disconnectCount, 0);
});

test('overlapping removals cannot restore a removed account or overwrite remaining credentials', async () => {
  await start(['A', 'B', 'C']);
  await Promise.all([
    invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' }),
    invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'B' }),
  ]);
  assert.equal((await invoke(channels.AUTH_GET_STATUS)).profileId, 'C');
  await assertRestart(['C']);
});

test('selection changes while storage is pending do not disconnect the newly selected account', async (context) => {
  await start();
  const originalDelete = TmcSecureAuthSessionStore.prototype.deleteSession;
  let finishDeletion;
  const deletionGate = new Promise((resolve) => { finishDeletion = resolve; });
  context.mock.method(TmcSecureAuthSessionStore.prototype, 'deleteSession', async function (profileId) {
    await deletionGate;
    return originalDelete.call(this, profileId);
  });
  const removal = invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' });
  await invoke(channels.ACCOUNT_SET_ACTIVE, { profileId: 'B' });
  await invoke(channels.CHAT_CONNECT_LIVE, { channel: 'other-channel' });
  finishDeletion();
  assert.equal((await removal).activeProfileId, 'B');
  assert.equal(ircClient.disconnectCount, 0);
  assert.equal(ircClient.username, session('B').username);
  assert.equal((await invoke(channels.AUTH_GET_STATUS)).profileId, 'B');
  await assertRestart(['B']);
});

for (const content of [
  '{invalid-json',
  JSON.stringify({ version: 2, encryptedPayload: 123 }),
  JSON.stringify({ version: 2, encryptedPayload: Buffer.from('{}').toString('base64') }),
]) {
  test(`rejects unreadable persisted data without overwriting it: ${content}`, async () => {
    const store = await start();
    await fs.writeFile(store.getFilePath(), content);
    await assert.rejects(invoke(channels.ACCOUNT_REMOVE_LOCAL, { profileId: 'A' }));
    assert.equal(await fs.readFile(store.getFilePath(), 'utf8'), content);
    assert.equal((await invoke(channels.ACCOUNT_LIST)).accounts.length, 2);
    assert.equal((await invoke(channels.AUTH_GET_STATUS)).profileId, 'A');
    assert.equal(ircClient.disconnectCount, 0);
    assert.equal(requests.some(({ url }) => url === config.oauthDesktopLogoutUrl), false);
  });
}
