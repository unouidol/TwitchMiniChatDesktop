const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { readChatBadges, isTwitchBadgeImage } = require('../.test-build/shared/chat/TmcChatBadges.js');
const { TmcBadgeCatalogService } = require('../.test-build/main/chat/TmcBadgeCatalogService.js');
const original = global.fetch;
after(() => { global.fetch = original; });
const image = (id) => `https://static-cdn.jtvnw.net/badges/v1/00000000-0000-0000-0000-00000000000${id}/2`;
const session = { profileId: 'A', username: 'alice', userId: '123', accessToken: 'synthetic-only' };
const request = { profileId: 'A', channel: 'channel' };
const set = (url, title) => ({ set_id: 'subscriber', versions: [{ id: '1', title, image_url_2x: url }] });
function provider(active, paths, transform = (value) => value) {
  return async (url, options) => {
    assert.equal(options.redirect, 'error');
    paths.push(url);
    const value = url.includes('validate') ? { user_id: active().userId, client_id: 'client' } : url.includes('/users?')
      ? { data: [{ id: '100', login: 'channel' }] } : { data: [set(image(url.endsWith('/global') ? 1 : 2), url.endsWith('/global') ? 'Global' : 'Channel')] };
    return new Response(JSON.stringify(transform(value, url)));
  };
}

test('badge metadata is bounded, deduplicated and never inferred from text or author names; CDN URLs are fixed', () => {
  assert.deepEqual(readChatBadges('moderator/1,subscriber/12,moderator/2,bad/1/2,broken'), [{ setId: 'moderator', version: '1' }, { setId: 'subscriber', version: '12' }]);
  assert.deepEqual(readChatBadges([{ set_id: 'vip', id: '1' }]), [{ setId: 'vip', version: '1' }]);
  for (const invalid of [null, 'x'.repeat(2049), Array(21).fill({ setId: 'vip', version: '1' }), [{ setId: '<img>', version: '1' }]]) assert.deepEqual(readChatBadges(invalid), []);
  assert.equal(isTwitchBadgeImage(image(1)), true);
  for (const invalid of ['javascript:alert(1)', image(1) + '?token=bad', image(1).replace('static-cdn.jtvnw.net', 'evil.test'), image(1).replace('https:', 'http:')]) assert.equal(isTwitchBadgeImage(invalid), false);
});

test('channel badge versions override globals, concurrent requests deduplicate and no credential crosses the catalog boundary', async () => {
  const paths = [];
  global.fetch = provider(() => session, paths);
  const service = new TmcBadgeCatalogService(() => session);
  const [first, second] = await Promise.all([service.getCatalog(request), service.getCatalog(request)]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.badges, [{ setId: 'subscriber', version: '1', title: 'Channel', imageUrl: image(2) }]);
  assert.equal(paths.length, 4);
  await service.getCatalog(request);
  assert.equal(paths.length, 4);
  assert.doesNotMatch(JSON.stringify(first), /synthetic-only|accessToken/);
});

test('stale account and rotated token completions are rejected rather than published to the selected account', async () => {
  for (const changed of [{ ...session, profileId: 'B' }, { ...session, accessToken: 'synthetic-rotated' }]) {
    let active = session;
    let release;
    global.fetch = () => new Promise((resolve) => { release = resolve; });
    const service = new TmcBadgeCatalogService(() => active);
    const pending = service.getCatalog(request);
    active = changed;
    release(new Response(JSON.stringify({ user_id: '123', client_id: 'client' })));
    await assert.rejects(pending, /account changed/);
  }
});

test('unsafe provider metadata and transient HTTP failure retain authentication and readable fallback with bounded retry cooldown', async () => {
  for (const mode of ['unsafe', 'mismatch', 'http']) {
    const paths = [];
    global.fetch = mode === 'http' ? async () => { paths.push('failure'); return new Response('', { status: 503 }); }
      : provider(() => session, paths, (value, url) => mode === 'mismatch' && url.includes('/users?') ? { data: [{ id: '100', login: 'wrong' }] }
        : mode === 'unsafe' && url.includes('/badges') ? { data: [set('https://evil.test/badge', 'Bad')] } : value);
    const service = new TmcBadgeCatalogService(() => session);
    assert.equal((await service.getCatalog(request)).status, 'unavailable');
    const count = paths.length;
    await service.getCatalog(request);
    assert.equal(paths.length, count);
    assert.equal(session.accessToken, 'synthetic-only');
  }
});

test('badge deadline aborts body consumption and clears its timer without deleting authentication', async (context) => {
  let abort;
  let cleared = false;
  context.mock.method(globalThis, 'setTimeout', (callback, delay) => { assert.equal(delay, 10000); abort = callback; return 1; });
  context.mock.method(globalThis, 'clearTimeout', () => { cleared = true; });
  global.fetch = async (_url, options) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Body interrupted')), { once: true });
  }) });
  const service = new TmcBadgeCatalogService(() => session);
  const pending = service.getCatalog(request);
  await new Promise(setImmediate);
  abort();
  assert.equal((await pending).status, 'unavailable');
  assert.equal(cleared, true);
  assert.equal(session.accessToken, 'synthetic-only');
});
