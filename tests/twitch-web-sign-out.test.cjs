const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const { EventEmitter } = require('node:events');
let windows = [];
const sessions = new Map();
function fakeSession(name) {
  if (!sessions.has(name)) {
    const calls = [];
    sessions.set(name, {
      calls, authCookieSurvives: false,
      setPermissionRequestHandler() {}, setPermissionCheckHandler() {},
      clearStorageData: async () => { calls.push('storage'); },
      clearCache: async () => { calls.push('cache'); },
      clearAuthCache: async () => { calls.push('auth-cache'); },
      cookies: { get: async (filter) => {
        calls.push(`cookie-check:${filter.name}`);
        return sessions.get(name).authCookieSurvives ? [{ name: filter.name }] : [];
      } },
    });
  }
  return sessions.get(name);
}
mock.module('electron', { cache: true, exports: {
  session: { fromPartition: fakeSession },
  BrowserWindow: { getAllWindows: () => windows },
} });
const { TmcTwitchWebSessions } = require('../.test-build/main/web/TmcTwitchWebSessions.js');
const { TmcTwitchWebSignOut } = require('../.test-build/main/web/TmcTwitchWebSignOut.js');
const { buildTwitchWebPartition } = require('../.test-build/main/web/TmcTwitchWebPartition.js');

function fakeWindow(browserSession, log) {
  const window = new EventEmitter();
  let destroyed = false;
  window.isDestroyed = () => destroyed;
  window.webContents = { session: browserSession, isDestroyed: () => destroyed };
  window.destroy = () => { log.push('window-destroyed'); destroyed = true; window.emit('closed'); };
  return window;
}

function setup(playerProfileId) {
  const log = [];
  const player = {
    status: { sequence: 1, state: playerProfileId ? 'ready' : 'closed', profileId: playerProfileId, channel: 'c', mode: 'embedded', message: null },
    getStatus() { return this.status; },
    close: async () => { log.push('player-closed'); return player.status; },
  };
  const pcg = { completeTwitchWebSignOut: (profileId) => log.push(`pcg-signed-out:${profileId}`) };
  const signOut = new TmcTwitchWebSignOut(new TmcTwitchWebSessions(() => ['A', 'B']), pcg, player);
  return { log, signOut };
}

test('clears only the account storage, after closing its player and windows, then reloads PCG', async () => {
  sessions.clear();
  const { log, signOut } = setup('A');
  const a = fakeSession(buildTwitchWebPartition('A'));
  const b = fakeSession(buildTwitchWebPartition('B'));
  const otherLog = [];
  const popupA = fakeWindow(a, log);
  const windowB = fakeWindow(b, otherLog);
  windows = [popupA, windowB];
  await signOut.signOut(' A ');
  assert.deepEqual(log, ['player-closed', 'window-destroyed', 'pcg-signed-out:A']);
  assert.deepEqual(a.calls, ['storage', 'cache', 'auth-cache', 'cookie-check:auth-token']);
  assert.deepEqual(b.calls, []);
  assert.deepEqual(otherLog, [], 'Another account keeps its windows');
});

test('leaves another account player playing', async () => {
  sessions.clear(); windows = [];
  const { log, signOut } = setup('B');
  await signOut.signOut('A');
  assert.deepEqual(log, ['pcg-signed-out:A']);
});

test('a surviving Twitch auth cookie fails loudly and never reports PCG signed out', async () => {
  sessions.clear(); windows = [];
  const { log, signOut } = setup(null);
  fakeSession(buildTwitchWebPartition('A')).authCookieSurvives = true;
  await assert.rejects(signOut.signOut('A'), /could not be cleared/);
  assert.deepEqual(log, []);
});

test('unknown accounts are rejected before any storage is touched', async () => {
  sessions.clear(); windows = [];
  const { log, signOut } = setup(null);
  await assert.rejects(signOut.signOut('C'), /unavailable/);
  assert.equal(sessions.size, 0);
  assert.deepEqual(log, []);
});
