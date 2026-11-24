const assert = require('node:assert/strict');
const { beforeEach, afterEach, test, mock } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const nativeFetch = globalThis.fetch;
const { inspect } = require('node:util');

let root;
let handlers;
let encryptionAvailable;
let decryptionAvailable;
let requests;
let warnings;
let expectedWarnings;
let restore;

global.MAIN_WINDOW_VITE_DEV_SERVER_URL = 'http://localhost:5173/';
global.MAIN_WINDOW_VITE_NAME = 'main_window';
global.WebSocket = class {
  constructor() { throw new Error('Unexpected real WebSocket in restore tests'); }
};
mock.module('electron', {
  cache: true,
  exports: {
    app: { getPath: () => root, getVersion: () => '1.1.0-test', isPackaged: false, once() {} },
    ipcMain: { handle(channel, handler) {
      assert.equal(handlers.has(channel), false, `Duplicate handler: ${channel}`);
      handlers.set(channel, handler);
    } },
    BrowserWindow: { getAllWindows: () => [] },
    safeStorage: {
      isEncryptionAvailable: () => encryptionAvailable,
      encryptString: (value) => Buffer.from(value),
      decryptString(value) {
        if (!decryptionAvailable) throw new Error('Controlled decryption failure');
        return value.toString();
      },
    },
  },
});

const { registerIpcHandlers } = require('../.test-build/main/ipc/registerIpcHandlers.js');
const { TmcSecureAuthSessionStore } = require('../.test-build/main/auth/TmcSecureAuthSessionStore.js');
const { TmcAuthBrokerClient, TmcDesktopSessionRestoreError } = require('../.test-build/main/auth/TmcAuthBrokerClient.js');
const { TmcAuthSessionStore } = require('../.test-build/main/auth/TmcAuthSessionStore.js');
const { TmcActiveAccountStore } = require('../.test-build/main/accounts/TmcActiveAccountStore.js');
const { TMC_IPC_CHANNELS: channels } = require('../.test-build/shared/ipc/IpcChannels.js');
const config = {
  backendBaseUrl: 'https://backend.invalid', desktopClientId: 'restore-test',
  desktopClientVersion: 'test', desktopFlavor: 'test', defaultHistorySeconds: 60,
  oauthFinalizeUrl: 'https://backend.invalid/finalize',
  oauthDesktopRestoreUrl: 'https://backend.invalid/restore',
  oauthDesktopLogoutUrl: 'https://backend.invalid/logout', oauthReturnScheme: 'desktop-claim',
};
const session = (profileId) => ({
  profileId, username: `fixture-${profileId}`, userId: `fixture-user-${profileId}`,
  accessToken: `synthetic-access-${profileId}`, desktopSessionToken: `synthetic-desktop-${profileId}`,
});
const response = (profileId, overrides = {}) => new Response(JSON.stringify({
  profile_id: profileId, username: session(profileId).username, user_id: session(profileId).userId,
  access_token: session(profileId).accessToken, desktop_session_token: session(profileId).desktopSessionToken,
  ...overrides,
}));
const restoreWarning = (reason) => `[TMC Auth] Saved desktop session was not restored (${reason}); saved authentication retained.`;
const readWarning = '[TMC Auth] Saved authentication could not be read; stored data retained.';
const saveWarning = '[TMC Auth] Restored authentication could not be saved; account not activated and stored data retained.';

beforeEach(async (context) => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-session-restore-')));
  handlers = new Map();
  requests = [];
  warnings = [];
  expectedWarnings = [];
  encryptionAvailable = true;
  decryptionAvailable = true;
  restore = async (profileId) => response(profileId);
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === config.oauthFinalizeUrl) {
      assert.equal(JSON.parse(options.body).login_token, 'synthetic-claim-B');
      return response('B');
    }
    assert.equal(url, config.oauthDesktopRestoreUrl, 'Only synthetic restore calls are allowed; no logout');
    const { desktop_session_token: token } = JSON.parse(options.body);
    assert.match(token, /^synthetic-desktop-[AB]$/);
    const profileId = token.slice(-1);
    requests.push(profileId);
    assert.ok(options.signal instanceof AbortSignal);
    return restore(profileId, options);
  });
  context.mock.method(console, 'warn', (...args) => {
    assert.equal(args.length, 1, 'Never log raw errors, bodies or credentials');
    warnings.push(args[0]);
  });
});

afterEach(async () => {
  try {
    assert.deepEqual(warnings.sort(), expectedWarnings.sort());
    assert.doesNotMatch(JSON.stringify(warnings), /synthetic-|sensitive-body|sensitive-network/);
  } finally {
    assert.equal(await fs.realpath(root), root);
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('tmc-session-restore-'));
    await fs.rm(root, { recursive: true });
  }
});

async function seed(profileIds = ['A']) {
  const store = new TmcSecureAuthSessionStore();
  for (const profileId of profileIds) await store.saveSession(session(profileId));
  return store;
}
async function initialize(runtimeConfig = config) {
  handlers = new Map();
  await registerIpcHandlers(runtimeConfig);
  return handlers.get(channels.ACCOUNT_LIST)();
}
async function assertSignedOut() {
  assert.deepEqual((await handlers.get(channels.ACCOUNT_LIST)()).accounts, []);
  assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).isLoggedIn, false);
}

const failures = [
  { name: 'offline', reason: 'unavailable', run() { throw new TypeError('sensitive-network'); } },
  ...[400, 401, 403, 404, 408, 429, 500, 503].map((status) => ({
    name: `HTTP ${status}`, reason: status === 401 || status === 403 ? 'rejected' : 'unavailable',
    run: () => new Response('sensitive-body', { status }),
  })),
  { name: 'malformed JSON', reason: 'invalid-response', run: () => new Response('sensitive-body') },
  { name: 'null response', reason: 'invalid-response', run: () => new Response('null') },
  { name: 'missing fields', reason: 'invalid-response', run: () => new Response('{}') },
  { name: 'different profile', reason: 'identity-mismatch', run: () => response('B') },
  { name: 'different user', reason: 'identity-mismatch', run: () => response('A', { user_id: 'fixture-user-B' }) },
];
for (const entry of failures) {
  test(`${entry.name} preserves authentication and restores it on a later successful startup`, async () => {
    const store = await seed();
    const before = await fs.readFile(store.getFilePath());
    restore = entry.run;
    expectedWarnings.push(restoreWarning(entry.reason));
    await initialize();
    await assertSignedOut();
    assert.deepEqual(await fs.readFile(store.getFilePath()), before);
    restore = async (profileId) => response(profileId);
    assert.deepEqual((await initialize()).accounts.map((account) => account.profileId), ['A']);
    assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).profileId, 'A');
    assert.deepEqual(requests, ['A', 'A']);
  });
}

test('one failed account does not prevent another from restoring or erase either saved credential', async () => {
  const store = await seed(['A', 'B']);
  restore = async (profileId) => {
    if (profileId === 'A') throw new TypeError('Controlled offline failure');
    return response('B');
  };
  expectedWarnings.push(restoreWarning('unavailable'));
  const result = await initialize();
  assert.deepEqual(result.accounts.map((account) => account.profileId), ['B']);
  assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).profileId, 'B');
  assert.deepEqual((await store.loadSessions()).map((saved) => saved.profileId).sort(), ['A', 'B']);
  for (const saved of await store.loadSessions()) {
    assert.equal(saved.desktopSessionToken, session(saved.profileId).desktopSessionToken);
  }
});

for (const preferred of ['A', 'B']) {
  test(`saved selection ${preferred} survives both restore orders and is persisted only after restore completes`, async (context) => {
    const other = preferred === 'A' ? 'B' : 'A';
    let clock = 1_000_000;
    context.mock.method(Date, 'now', () => ++clock);
    const store = await seed([preferred, other]);
    const preference = new TmcActiveAccountStore();
    await preference.saveActiveProfileId(preferred);
    const writes = [];
    const savePreference = TmcActiveAccountStore.prototype.saveActiveProfileId;
    context.mock.method(TmcActiveAccountStore.prototype, 'saveActiveProfileId', async function (id) {
      writes.push(id);
      return savePreference.call(this, id);
    });
    for (const order of [[other, preferred], [preferred, other]]) {
      requests.length = 0;
      writes.length = 0;
      const result = await initialize();
      assert.deepEqual(requests, order, 'Exercise both actual restore orders');
      assert.equal(result.activeProfileId, preferred);
      assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).profileId, preferred);
      assert.equal(await preference.loadActiveProfileId(), preferred);
      assert.deepEqual(writes, [preferred], 'No intermediate fallback may overwrite the preference');
      assert.deepEqual(result.accounts.map((account) => account.profileId).sort(), ['A', 'B']);
      for (const saved of await store.loadSessions()) {
        assert.equal(saved.desktopSessionToken, session(saved.profileId).desktopSessionToken);
      }
    }
  });
}

for (const preferred of [null, 'removed-account']) {
  test(`a ${preferred === null ? 'missing' : 'stale'} preference selects a restored account after the restore batch`, async (context) => {
    await seed(['A', 'B']);
    const preference = new TmcActiveAccountStore();
    if (preferred) await preference.saveActiveProfileId(preferred);
    const writes = [];
    const savePreference = TmcActiveAccountStore.prototype.saveActiveProfileId;
    context.mock.method(TmcActiveAccountStore.prototype, 'saveActiveProfileId', async function (id) {
      writes.push(id);
      return savePreference.call(this, id);
    });
    const result = await initialize();
    assert.ok(['A', 'B'].includes(result.activeProfileId));
    assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).profileId, result.activeProfileId);
    assert.equal(await preference.loadActiveProfileId(), result.activeProfileId);
    assert.deepEqual(writes, [result.activeProfileId]);
  });
}

test('an unavailable preferred account falls back to another restored account without deleting credentials', async () => {
  const store = await seed(['A', 'B']);
  const preference = new TmcActiveAccountStore();
  await preference.saveActiveProfileId('A');
  restore = async (id) => {
    if (id === 'A') throw new TypeError('Controlled preferred-account failure');
    return response(id);
  };
  expectedWarnings.push(restoreWarning('unavailable'));
  const result = await initialize();
  assert.equal(result.activeProfileId, 'B');
  assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).profileId, 'B');
  assert.equal(await preference.loadActiveProfileId(), 'B');
  assert.deepEqual((await store.loadSessions()).map((saved) => saved.profileId).sort(), ['A', 'B']);
});

test('a fully failed startup retains the preference for a later successful restart', async () => {
  const store = await seed(['A', 'B']);
  const preference = new TmcActiveAccountStore();
  await preference.saveActiveProfileId('A');
  restore = async () => { throw new TypeError('Controlled offline startup'); };
  expectedWarnings.push(restoreWarning('unavailable'), restoreWarning('unavailable'));
  await initialize();
  await assertSignedOut();
  assert.equal(await preference.loadActiveProfileId(), 'A');
  assert.deepEqual((await store.loadSessions()).map((saved) => saved.profileId).sort(), ['A', 'B']);
  restore = async (id) => response(id);
  assert.equal((await initialize()).activeProfileId, 'A');
  assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).profileId, 'A');
});

test('restore timeout is passed to the actual request and retains saved authentication', async (context) => {
  const store = await seed();
  const before = await fs.readFile(store.getFilePath());
  const timeout = context.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 10_000);
    return AbortSignal.abort(new DOMException('Controlled timeout', 'TimeoutError'));
  });
  restore = async (_profileId, { signal }) => {
    signal.throwIfAborted();
    assert.fail('An aborted request cannot restore an account');
  };
  expectedWarnings.push(restoreWarning('unavailable'));
  await initialize();
  assert.equal(timeout.mock.callCount(), 1);
  await assertSignedOut();
  assert.deepEqual(await fs.readFile(store.getFilePath()), before);
});

test('aborting a real loopback response after headers also bounds body consumption and preserves authentication', async (context) => {
  const store = await seed();
  const before = await fs.readFile(store.getFilePath());
  const controller = new AbortController();
  context.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 10_000);
    return controller.signal;
  });
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{');
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/restore`;
    let observedHeaders = false;
    context.mock.method(globalThis, 'fetch', async (destination, options) => {
      assert.equal(destination, url, 'Real HTTP is restricted to this loopback fixture');
      assert.equal(JSON.parse(options.body).desktop_session_token, 'synthetic-desktop-A');
      const result = await nativeFetch(destination, options);
      observedHeaders = true;
      controller.abort(new DOMException('Controlled body timeout', 'TimeoutError'));
      return result;
    });
    expectedWarnings.push(restoreWarning('unavailable'));
    await initialize({ ...config, oauthDesktopRestoreUrl: url });
    assert.equal(observedHeaders, true);
    await assertSignedOut();
    assert.deepEqual(await fs.readFile(store.getFilePath()), before);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('successful restore accepts a renamed user and persists a rotated desktop token without selecting in the broker', async () => {
  const store = await seed();
  restore = async () => response('A', { username: 'renamed-user', desktop_session_token: 'synthetic-rotated-A' });
  const compatibility = new TmcAuthSessionStore();
  const broker = new TmcAuthBrokerClient(config, compatibility);
  const restored = await broker.restoreDesktopSession('synthetic-desktop-A');
  assert.equal(restored.username, 'renamed-user');
  assert.equal(compatibility.getSession(), null);
  assert.equal((await initialize()).activeProfileId, 'A');
  assert.equal((await store.loadSessions())[0].desktopSessionToken, 'synthetic-rotated-A');
  assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).username, 'renamed-user');
});

test('network failure preserves its cause without exposing it in startup diagnostics', async () => {
  const cause = new TypeError('sensitive-network');
  restore = async () => { throw cause; };
  const broker = new TmcAuthBrokerClient(config, new TmcAuthSessionStore());
  await assert.rejects(broker.restoreDesktopSession('synthetic-desktop-A'), (error) => {
    assert.ok(error instanceof TmcDesktopSessionRestoreError);
    assert.equal(error.reason, 'unavailable');
    assert.equal(error.cause, cause);
    assert.doesNotMatch(error.message, /sensitive-network/);
    return true;
  });
});

for (const failure of ['read', 'decrypt', 'unavailable-encryption']) {
  test(`local ${failure} failure preserves the file and allows recovery`, async (context) => {
    const store = await seed();
    const before = await fs.readFile(store.getFilePath());
    let read;
    if (failure === 'read') {
      const original = fs.readFile;
      read = context.mock.method(fs, 'readFile', (filename, ...args) => {
        if (filename === store.getFilePath()) return Promise.reject(Object.assign(new Error('Controlled read failure'), { code: 'EIO' }));
        return original(filename, ...args);
      });
    }
    if (failure === 'decrypt') decryptionAvailable = false;
    if (failure === 'unavailable-encryption') encryptionAvailable = false;
    expectedWarnings.push(readWarning);
    await initialize();
    await assertSignedOut();
    assert.deepEqual(requests, []);
    read?.mock.restore();
    assert.deepEqual(await fs.readFile(store.getFilePath()), before);
    decryptionAvailable = true;
    encryptionAvailable = true;
    assert.equal((await initialize()).activeProfileId, 'A');
  });
}

for (const content of [
  '{invalid-json',
  JSON.stringify({ version: 3, encryptedPayload: 'invalid' }),
  JSON.stringify({ version: 2, encryptedPayload: Buffer.from('sensitive-decrypted-token').toString('base64') }),
]) {
  test('unreadable storage is retained and cannot be silently overwritten by a new login', async () => {
    const store = await seed();
    await fs.writeFile(store.getFilePath(), content);
    expectedWarnings.push(readWarning);
    await initialize();
    await assertSignedOut();
    await assert.rejects(store.saveSession(session('B')));
    await assert.rejects(handlers.get(channels.AUTH_FINALIZE_TWITCH_LOGIN)({}, 'synthetic-claim-B'), (error) => {
      assert.equal(error.message, 'Saved authentication could not be updated. Existing saved data was retained.');
      assert.ok(error.cause instanceof Error, 'Retain a safe diagnostic category');
      assert.doesNotMatch(error.message, /sensitive-|synthetic-/);
      assert.doesNotMatch(inspect(error), /sensitive-|synthetic-/, 'Logging the IPC error must not reveal decrypted content');
      return true;
    });
    await assertSignedOut();
    assert.equal(await fs.readFile(store.getFilePath(), 'utf8'), content);
  });
}

test('a local save failure after restore keeps the original file and never activates the account', async (context) => {
  const store = await seed();
  const before = await fs.readFile(store.getFilePath());
  const original = fs.rename;
  context.mock.method(fs, 'rename', (from, to) => {
    if (to === store.getFilePath()) return Promise.reject(Object.assign(new Error('Controlled write failure'), { code: 'EIO' }));
    return original(from, to);
  });
  restore = async () => response('A', { desktop_session_token: 'synthetic-rotated-A' });
  expectedWarnings.push(saveWarning);
  await initialize();
  await assertSignedOut();
  assert.deepEqual(await fs.readFile(store.getFilePath()), before);
});

test('a new login whose persistence fails cannot replace an already active account', async (context) => {
  const store = await seed();
  await initialize();
  const before = await fs.readFile(store.getFilePath());
  const original = fs.rename;
  context.mock.method(fs, 'rename', (from, to) => {
    if (to === store.getFilePath()) return Promise.reject(Object.assign(new Error('Controlled login save failure'), { code: 'EIO' }));
    return original(from, to);
  });
  await assert.rejects(handlers.get(channels.AUTH_FINALIZE_TWITCH_LOGIN)({}, 'synthetic-claim-B'));
  assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).profileId, 'A');
  assert.deepEqual((await handlers.get(channels.ACCOUNT_LIST)()).accounts.map((account) => account.profileId), ['A']);
  assert.deepEqual(await fs.readFile(store.getFilePath()), before);
});

test('a successful new login persists before activation and returns only the renderer-safe contract', async () => {
  const store = await seed();
  await initialize();
  const result = await handlers.get(channels.AUTH_FINALIZE_TWITCH_LOGIN)({}, 'synthetic-claim-B');
  assert.deepEqual(result, {
    success: true, profileId: 'B', username: 'fixture-B', userId: 'fixture-user-B', message: 'Logged in as fixture-B.',
  });
  assert.doesNotMatch(JSON.stringify(result), /synthetic-|accessToken|desktopSessionToken/);
  assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).profileId, 'B');
  assert.deepEqual((await store.loadSessions()).map((saved) => saved.profileId).sort(), ['A', 'B']);
  assert.equal((await handlers.get(channels.ACCOUNT_LIST)()).activeProfileId, 'B');
});

test('a stalled login request is bounded and leaves the selected saved account unchanged', async (context) => {
  const store = await seed();
  await initialize();
  const before = await fs.readFile(store.getFilePath());
  context.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 10_000);
    return AbortSignal.abort(new DOMException('Controlled login timeout', 'TimeoutError'));
  });
  context.mock.method(globalThis, 'fetch', async (destination, options) => {
    assert.equal(destination, config.oauthFinalizeUrl);
    options.signal.throwIfAborted();
    assert.fail('An aborted request must not finalize login');
  });
  await assert.rejects(handlers.get(channels.AUTH_FINALIZE_TWITCH_LOGIN)({}, 'synthetic-claim-B'));
  assert.equal((await handlers.get(channels.ACCOUNT_LIST)()).activeProfileId, 'A');
  assert.equal((await handlers.get(channels.AUTH_GET_STATUS)()).profileId, 'A');
  assert.deepEqual(await fs.readFile(store.getFilePath()), before);
});

test('login timeout interrupts a real loopback body before persistence or selection', async (context) => {
  const store = await seed();
  const controller = new AbortController();
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{');
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/finalize`;
    await initialize({ ...config, oauthFinalizeUrl: url });
    const before = await fs.readFile(store.getFilePath());
    context.mock.method(AbortSignal, 'timeout', (milliseconds) => {
      assert.equal(milliseconds, 10_000);
      return controller.signal;
    });
    let observedHeaders = false;
    context.mock.method(globalThis, 'fetch', async (destination, options) => {
      assert.equal(destination, url, 'Real HTTP is restricted to this loopback fixture');
      assert.equal(JSON.parse(options.body).login_token, 'synthetic-claim-B');
      const result = await nativeFetch(destination, options);
      observedHeaders = true;
      controller.abort(new DOMException('Controlled login body timeout', 'TimeoutError'));
      return result;
    });
    await assert.rejects(handlers.get(channels.AUTH_FINALIZE_TWITCH_LOGIN)({}, 'synthetic-claim-B'));
    assert.equal(observedHeaders, true);
    assert.equal((await handlers.get(channels.ACCOUNT_LIST)()).activeProfileId, 'A');
    assert.deepEqual(await fs.readFile(store.getFilePath()), before);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
