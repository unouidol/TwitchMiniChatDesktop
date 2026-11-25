const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const nativeSessions = new Map();
mock.module('electron', { cache: true, exports: { session: { fromPartition(name) {
  if (!nativeSessions.has(name)) nativeSessions.set(name, {
    handlers: 0, checks: 0,
    setPermissionRequestHandler(handler) { this.handlers++; this.request = handler; },
    setPermissionCheckHandler(handler) { this.checks++; this.check = handler; },
    get cookies() { assert.fail('Session selection must not inspect cookies'); },
  });
  return nativeSessions.get(name);
} } } });
const { TmcTwitchWebSessions } = require('../.test-build/main/web/TmcTwitchWebSessions.js');
const { buildTwitchWebPartition } = require('../.test-build/main/web/TmcTwitchWebPartition.js');

test('PCG legacy storage is reused per account, with one permission owner and no credential access', () => {
  const sessions = new TmcTwitchWebSessions(() => ['alice', 'bob']);
  const first = sessions.get('alice');
  assert.equal(first, nativeSessions.get('persist:tmc-pcg-alice'));
  assert.equal(sessions.get('alice'), first);
  assert.notEqual(sessions.get('bob'), first);
  assert.equal(first.handlers, 1); assert.equal(first.checks, 1);
  for (const permission of ['camera', 'microphone', 'geolocation', 'notifications', 'storage-access']) {
    let allowed; first.request(null, permission, (value) => { allowed = value; });
    assert.equal(allowed, false); assert.equal(first.check(), false);
  }
});

test('unknown accounts and case-aliased legacy storage are rejected before opening another session', () => {
  const sessions = new TmcTwitchWebSessions(() => ['case', 'CASE']);
  const count = nativeSessions.size;
  assert.throws(() => sessions.get('missing'), /unavailable/);
  assert.throws(() => sessions.get('case'), /conflict/);
  assert.equal(nativeSessions.size, count);
  assert.throws(() => buildTwitchWebPartition(''), /Invalid/);
  assert.throws(() => buildTwitchWebPartition('x'.repeat(257)), /Invalid/);
});

test('noncanonical identities never reuse lossy legacy paths or each other', () => {
  const ids = ['a:b', 'a_b', 'a/b', 'a\\b', 'ä', 'A.B'];
  const names = ids.map(buildTwitchWebPartition);
  assert.equal(new Set(names).size, ids.length);
  assert.equal(names[1], 'persist:tmc-pcg-a_b');
  assert.ok(names.filter((_, index) => index !== 1).every((name) => /^persist:tmc-twitch-web~[a-f0-9]{64}$/.test(name)));
});
