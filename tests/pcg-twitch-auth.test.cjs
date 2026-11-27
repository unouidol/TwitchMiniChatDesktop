const assert = require('node:assert/strict');
const { test, beforeEach, mock } = require('node:test');
const { EventEmitter } = require('node:events');

let sessions;
let views;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const sessionFor = (partition) => {
  if (!sessions.has(partition)) {
    const cookies = new EventEmitter();
    cookies.matches = [];
    cookies.calls = 0;
    cookies.read = async () => cookies.matches;
    cookies.get = async (filter) => {
      assert.deepEqual(filter, { url: 'https://www.twitch.tv', name: 'auth-token' });
      cookies.calls++;
      return cookies.read();
    };
    sessions.set(partition, { cookies, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} });
  }
  return sessions.get(partition);
};
class FakeContents extends EventEmitter {
  constructor(partition) { super(); this.session = sessionFor(partition); this.destroyed = false; }
  isDestroyed() { return this.destroyed; }
  setWindowOpenHandler() {}
  async loadURL(url) { this.url = url; this.loads = (this.loads || 0) + 1; }
  getURL() { return this.url || ''; }
  isLoading() { return false; }
  isCrashed() { return false; }
  close() { if (this.destroyed) return; this.destroyed = true; this.emit('destroyed'); }
}
class FakeView {
  constructor(options) {
    this.webContents = new FakeContents(options.webPreferences.partition);
    views.push(this);
  }
  setBounds(value) { this.bounds = value; }
}
mock.module('electron', { cache: true, exports: {
  session: { fromPartition: sessionFor },
  WebContentsView: FakeView,
  BrowserWindow: class {},
  shell: { openExternal: async () => { throw new Error('Unexpected external browser'); } },
} });
const { TmcPcgSessionManager } = require('../.test-build/main/pcg/TmcPcgSessionManager.js');
const { TmcTwitchWebSessions } = require('../.test-build/main/web/TmcTwitchWebSessions.js');
const makeManager = () => new TmcPcgSessionManager({
  pcgExtensionUrlTemplate: 'https://fixture.ext-twitch.tv/{channel}',
}, () => {}, new TmcTwitchWebSessions(() => ['A', 'B']));
const cookieEvidence = () => [{ name: 'auth-token', domain: '.twitch.tv',
  get value() { throw new Error('Cookie values must never be inspected'); },
}];
const changed = (cookies, domain = '.twitch.tv', name = 'auth-token') => {
  cookies.emit('changed', {}, { name, domain }, 'explicit', false);
};
beforeEach(() => { sessions = new Map(); views = []; });

test('PCG detects an absent or persisted browser session separately for each account without reading values', async () => {
  sessionFor('persist:tmc-pcg-B').cookies.matches = cookieEvidence();
  const manager = makeManager();
  await manager.activate('A', 'channel');
  await flush();
  assert.equal(manager.getStatus().twitchAuth, 'signed-out');
  await manager.activate('B', 'channel');
  await flush();
  assert.equal(manager.getStatus().twitchAuth, 'session-present');
  await manager.activate('A', 'channel');
  await flush();
  assert.equal(manager.getStatus().twitchAuth, 'signed-out');
});

test('sign-in, logout and expiry cookie changes refresh only the active Twitch partition', async () => {
  const manager = makeManager();
  await manager.activate('A', 'channel');
  const cookies = sessionFor('persist:tmc-pcg-A').cookies;
  cookies.matches = cookieEvidence();
  changed(cookies, '.evil-twitch.tv');
  changed(cookies, '.twitch.tv', 'unrelated');
  await flush();
  assert.equal(cookies.calls, 1);
  changed(cookies);
  await flush();
  assert.equal(manager.getStatus().twitchAuth, 'session-present');
  cookies.matches = [];
  cookies.emit('changed', {}, { name: 'auth-token', domain: '.twitch.tv' }, 'expired', true);
  await flush();
  assert.equal(manager.getStatus().twitchAuth, 'signed-out');
});

test('a late cookie query for A cannot change B and switching releases the old listener', async () => {
  const first = deferred();
  const a = sessionFor('persist:tmc-pcg-A').cookies;
  a.read = () => first.promise;
  const manager = makeManager();
  await manager.activate('A', 'channel');
  sessionFor('persist:tmc-pcg-B').cookies.matches = cookieEvidence();
  await manager.activate('B', 'channel');
  await flush();
  const before = manager.getStatus();
  first.resolve([]);
  await flush();
  assert.deepEqual(manager.getStatus(), before);
  assert.equal(a.listenerCount('changed'), 0);
  assert.equal(views[0].webContents.listenerCount('destroyed'), 0);
});

test('out-of-order queries within one account cannot restore obsolete session evidence', async () => {
  const older = deferred();
  const cookies = sessionFor('persist:tmc-pcg-A').cookies;
  cookies.read = () => older.promise;
  const manager = makeManager();
  await manager.activate('A', 'channel');
  cookies.read = async () => [];
  changed(cookies);
  await flush();
  older.resolve(cookieEvidence());
  await flush();
  assert.equal(manager.getStatus().twitchAuth, 'signed-out');
});

test('cookie lookup failure is unknown, preserves the panel and can recover without logging secrets', async (context) => {
  const cookies = sessionFor('persist:tmc-pcg-A').cookies;
  cookies.read = async () => { throw new Error('sensitive-cookie-read-failure'); };
  const warnings = [];
  context.mock.method(console, 'warn', (...args) => warnings.push(args));
  const manager = makeManager();
  const status = await manager.activate('A', 'channel');
  await flush();
  assert.equal(status.state, 'active');
  assert.equal(status.twitchAuth, 'unknown');
  assert.deepEqual(warnings, [['[PCG] Twitch browser-session state could not be checked.']]);
  cookies.read = async () => cookieEvidence();
  changed(cookies);
  await flush();
  assert.equal(manager.getStatus().twitchAuth, 'session-present');
});

test('destroying the observed contents releases subscriptions and rejects late completions', async () => {
  const lookup = deferred();
  const cookies = sessionFor('persist:tmc-pcg-A').cookies;
  cookies.read = () => lookup.promise;
  const manager = makeManager();
  await manager.activate('A', 'channel');
  const before = manager.getStatus();
  const contents = views[0].webContents;
  contents.destroyed = true;
  views[0].webContents = undefined; // Electron can clear the view getter during teardown.
  contents.emit('destroyed');
  lookup.resolve(cookieEvidence());
  await flush();
  assert.deepEqual(manager.getStatus(), before);
  assert.equal(cookies.listenerCount('changed'), 0);
});

test('late panel activation cannot attach B browser-session evidence to A', async () => {
  const load = deferred();
  const original = FakeContents.prototype.loadURL;
  FakeContents.prototype.loadURL = function (url) {
    this.url = url;
    return this.session === sessionFor('persist:tmc-pcg-A') ? load.promise : Promise.resolve();
  };
  try {
    const manager = makeManager();
    const a = manager.activate('A', 'channel');
    sessionFor('persist:tmc-pcg-B').cookies.matches = cookieEvidence();
    await manager.activate('B', 'channel');
    load.resolve();
    await a;
    assert.equal(manager.getStatus().profileId, 'B');
    assert.equal(manager.getStatus().twitchAuth, 'session-present');
  } finally { FakeContents.prototype.loadURL = original; }
});

test('a rejected web identity hides the retained previous view even after renderer bounds synchronization', async () => {
  const children = new Set();
  const owner = { isDestroyed: () => false, contentView: {
    addChildView: (view) => children.add(view), removeChildView: (view) => children.delete(view),
  } };
  const manager = makeManager();
  const bounds = { x: 0, y: 0, width: 300, height: 400 };
  await manager.activate('A', 'channel', owner);
  await flush();
  manager.setBounds(bounds, owner);
  const original = views[0];
  assert.equal(original.bounds.width, 300);
  const rejected = await manager.activate('unregistered', 'channel', owner);
  assert.equal(rejected.state, 'error');
  assert.equal(original.bounds.width, 0);
  manager.setBounds(bounds, owner);
  assert.equal(original.bounds.width, 0, 'A bounds update cannot reveal the previous identity');
  assert.equal(original.webContents.isDestroyed(), false);
  assert.equal(views.length, 1, 'Rejection never creates or reassigns a browser session');
  await manager.activate('A', 'channel', owner); await flush();
  assert.equal(views[0], original); assert.equal(original.bounds.width, 300);
  assert.equal(manager.getStatus().twitchAuth, 'signed-out');
});

test('duplicate pending and ready PCG activation navigates once and retains its view', async (context) => {
  const load = deferred();
  const calls = [];
  context.mock.method(FakeContents.prototype, 'loadURL', function (url) {
    this.url = url; calls.push(url); return load.promise;
  });
  const manager = makeManager();
  const first = manager.activate('A', 'channel');
  const second = manager.activate(' A ', '#channel');
  assert.equal(calls.length, 1, 'Account/channel notifications share the actual navigation');
  assert.equal(manager.getStatus().state, 'loading');
  load.resolve();
  const results = await Promise.all([first, second]);
  assert.ok(results.every((status) => status.state === 'active' && status.profileId === 'A'));
  await manager.activate('A', 'channel');
  assert.equal(calls.length, 1, 'The already loaded exact context is retained');
  assert.equal(views.length, 1);
});

test('shared PCG load failure remains an error, including aborts, and a later activation can retry', async (context) => {
  const load = deferred();
  let calls = 0;
  context.mock.method(FakeContents.prototype, 'loadURL', function (url) {
    this.url = url; calls++; return calls === 1 ? load.promise : Promise.resolve();
  });
  const manager = makeManager();
  const first = manager.activate('A', 'channel');
  const second = manager.activate('A', 'channel');
  load.reject(Object.assign(new Error('Controlled ERR_ABORTED'), { code: 'ERR_ABORTED', errno: -3 }));
  for (const status of await Promise.all([first, second])) {
    assert.equal(status.state, 'error');
    assert.equal(status.message, 'Controlled ERR_ABORTED');
  }
  assert.equal(calls, 1);
  assert.equal((await manager.activate('A', 'channel')).state, 'active');
  assert.equal(calls, 2);
});

test('a superseded shared PCG navigation cannot change the newer account or channel', async (context) => {
  const older = deferred();
  let calls = 0;
  context.mock.method(FakeContents.prototype, 'loadURL', function (url) {
    this.url = url; return ++calls === 1 ? older.promise : Promise.resolve();
  });
  const manager = makeManager();
  const first = manager.activate('A', 'channel');
  const second = manager.activate('A', 'channel');
  await manager.activate('B', 'other');
  const newer = manager.getStatus();
  older.reject(new Error('Old navigation aborted'));
  await Promise.all([first, second]);
  assert.deepEqual(manager.getStatus(), newer);
  assert.equal(newer.profileId, 'B');
  assert.equal(newer.channel, 'other');
  assert.equal(calls, 2);
});

test('switching accounts keeps one loaded panel per account and returns to it without reloading', async () => {
  const manager = makeManager();
  await manager.activate('A', 'channel');
  await manager.activate('B', 'channel');
  await manager.activate('A', 'channel');
  assert.equal(views.length, 2, 'Returning to A reuses its panel');
  assert.equal(views[0].webContents.loads, 1, 'The kept panel is not reloaded');
  assert.equal(manager.getStatus().state, 'active');
  assert.equal(manager.getStatus().profileId, 'A');
  for (let index = 0; index < 10; index += 1) await manager.activate(index % 2 ? 'A' : 'B', 'channel');
  assert.equal(views.length, 2, 'Panels are bounded by the number of accounts');
  assert.equal(views.filter((view) => view.webContents.isDestroyed()).length, 0);
  await manager.activate('A', 'other-channel');
  assert.equal(views[0].webContents.loads, 2, 'A different channel still loads');
});

test('a removed account closes its kept panel now, or the shown one at the next switch', async () => {
  const manager = makeManager();
  await manager.activate('A', 'channel');
  await manager.activate('B', 'channel');
  manager.releaseProfile('A');
  assert.equal(views[0].webContents.isDestroyed(), true, 'A kept panel closes immediately');
  manager.releaseProfile('B');
  assert.equal(views[1].webContents.isDestroyed(), false, 'The shown panel stays until the next selection');
  await manager.activate('A', 'channel');
  assert.equal(views[1].webContents.isDestroyed(), true, 'The removed account panel closes at the switch');
  assert.equal(views.length, 3, 'A gets a fresh panel');
  await manager.activate('B', 'channel');
  assert.equal(views.length, 4, 'A re-added B is not handed the closed panel');
});

test('signing out an account drops its kept signed-in panel', async () => {
  const manager = makeManager();
  await manager.activate('A', 'channel');
  await manager.activate('B', 'channel');
  manager.completeTwitchWebSignOut('A');
  assert.equal(views[0].webContents.isDestroyed(), true);
  assert.equal(views[1].webContents.isDestroyed(), false, 'The shown account is untouched');
});
