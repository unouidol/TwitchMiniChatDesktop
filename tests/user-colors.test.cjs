const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { TmcUserColorService } = require('../.test-build/main/chat/TmcUserColorService.js');
let active;
let calls;
const session = (profileId) => ({ profileId, userId: `user-${profileId}`, accessToken: `synthetic-${profileId}` });
const json = (value) => new Response(JSON.stringify(value));
const request = (usernames = ['bot_red', 'bot_yellow'], overrides = {}) => ({ profileId: active.profileId, channel: 'channel', usernames, ...overrides });
function transport(context, transform = (_url, value) => value) {
  context.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.match(options.headers.Authorization, /^(OAuth|Bearer) synthetic-/);
    let value;
    if (url.href === 'https://id.twitch.tv/oauth2/validate') value = { client_id: 'synthetic-client', user_id: active.userId };
    else {
      assert.equal(url.origin, 'https://api.twitch.tv');
      assert.equal(options.headers['Client-Id'], 'synthetic-client');
      if (url.pathname === '/helix/users') value = { data: url.searchParams.getAll('login').filter((login) => login !== 'missing')
        .map((login) => ({ id: login === 'bot_red' ? '6101' : '6102', login })) };
      else {
        assert.equal(url.pathname, '/helix/chat/color');
        value = { data: url.searchParams.getAll('user_id').map((id) => ({ user_id: id, user_login: id === '6101' ? 'bot_red' : 'bot_yellow',
          color: id === '6101' ? '#ff0000' : '#ffff00' })) };
      }
    }
    return json(transform(url, value));
  });
}
beforeEach(() => { active = session('A'); calls = []; });

test('missing colors resolve in one batched login/color request; cache reuse exposes only public metadata', async (context) => {
  transport(context);
  const service = new TmcUserColorService(() => active);
  const result = await service.getColors(request(['bot_yellow', 'bot_red', 'bot_red']));
  assert.deepEqual(result.colors, [{ username: 'bot_red', color: '#FF0000' }, { username: 'bot_yellow', color: '#FFFF00' }]);
  assert.equal(result.status, 'ready');
  assert.deepEqual(calls[1].searchParams.getAll('login'), ['bot_red', 'bot_yellow']);
  assert.deepEqual(calls[2].searchParams.getAll('user_id'), ['6101', '6102']);
  await service.getColors(request(['bot_red'], { channel: 'other' }));
  assert.equal(calls.length, 3);
  assert.doesNotMatch(JSON.stringify(result), /synthetic|user-A|client_id|Authorization|accessToken/);
});

test('unset colors and absent users are cached as empty metadata without inventing provider colors', async (context) => {
  transport(context, (url, value) => url.pathname === '/helix/chat/color'
    ? { data: value.data.map((item) => ({ ...item, color: '' })) } : value);
  const service = new TmcUserColorService(() => active);
  const result = await service.getColors(request(['bot_red', 'missing']));
  assert.deepEqual(result.colors, [{ username: 'bot_red', color: null }, { username: 'missing', color: null }]);
  await service.getColors(request(['bot_red', 'missing']));
  assert.equal(calls.length, 3);
  const now = Date.now();
  context.mock.method(Date, 'now', () => now + 300001);
  await service.getColors(request(['bot_red']));
  assert.equal(calls.length, 6);
});

test('positive color entries expire and account/token rotation never reuses another OAuth context', async (context) => {
  transport(context);
  const service = new TmcUserColorService(() => active);
  await service.getColors(request(['bot_red']));
  active = session('B');
  await service.getColors(request(['bot_red']));
  active = { ...active, accessToken: 'synthetic-rotated' };
  await service.getColors(request(['bot_red']));
  assert.equal(calls.length, 9);
  const now = Date.now();
  context.mock.method(Date, 'now', () => now + 1800001);
  await service.getColors(request(['bot_red']));
  assert.equal(calls.length, 12);
});

test('identical concurrent batches share transport and reject a completion after account switch', async (context) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  transport(context);
  const boundary = globalThis.fetch;
  context.mock.method(globalThis, 'fetch', async (...args) => { await gate; return boundary(...args); });
  const service = new TmcUserColorService(() => active);
  const first = service.getColors(request());
  const second = service.getColors(request(['bot_yellow', 'bot_red']));
  release();
  await Promise.all([first, second]);
  assert.equal(calls.length, 3);
  let finish;
  context.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { finish = resolve; }));
  active = session('B');
  const loading = service.getColors(request());
  active = session('A');
  finish(json({ client_id: 'synthetic-client', user_id: 'user-B' }));
  await assert.rejects(loading, /account changed/);
});

for (const fault of ['wrong-user', 'duplicate-id', 'unrequested-user', 'bad-css', 'wrong-color-user', 'incomplete-colors']) {
  test(`provider mismatch ${fault} cannot publish/cache a partial or unsafe color response`, async (context) => {
    transport(context, (url, value) => {
      if (fault === 'wrong-user' && url.pathname === '/oauth2/validate') return { ...value, user_id: 'other' };
      if (url.pathname === '/helix/users') {
        if (fault === 'duplicate-id') return { data: value.data.map((item) => ({ ...item, id: '6101' })) };
        if (fault === 'unrequested-user') return { data: [{ id: '6101', login: 'stranger' }] };
      }
      if (url.pathname === '/helix/chat/color') {
        if (fault === 'bad-css') return { data: value.data.map((item) => ({ ...item, color: 'red;background:url(https://invalid)' })) };
        if (fault === 'wrong-color-user') return { data: value.data.map((item) => ({ ...item, user_login: 'stranger' })) };
        if (fault === 'incomplete-colors') return { data: [] };
      }
      return value;
    });
    const service = new TmcUserColorService(() => active);
    assert.deepEqual((await service.getColors(request())).colors, []);
    const before = calls.length;
    assert.equal((await service.getColors(request())).status, 'unavailable');
    assert.equal(calls.length, before, 'Failed lookup has a cooldown instead of repeated network requests');
  });
}

test('network/HTTP failures preserve session, expose no raw secrets and do not retry until cooldown expires', async (context) => {
  const original = active;
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('synthetic-private-cause'); });
  const service = new TmcUserColorService(() => active);
  const result = await service.getColors(request());
  assert.equal(active, original);
  assert.equal(result.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result), /synthetic|private|accessToken/);
  transport(context);
  await service.getColors(request());
  assert.equal(calls.length, 0);
  const now = Date.now();
  context.mock.method(Date, 'now', () => now + 30001);
  assert.equal((await service.getColors(request())).status, 'ready');
  context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 429 }));
  active = session('B');
  assert.equal((await service.getColors(request())).status, 'unavailable');
});

test('wrong profile, invalid names and oversized batches are rejected before any request', async () => {
  const service = new TmcUserColorService(() => active);
  await assert.rejects(service.getColors(request(['bot_red'], { profileId: 'B' })), /account changed/);
  for (const names of [['../bad'], ['bot-red'], ['A'.repeat(26)], Array(101).fill('bot_red')]) {
    await assert.rejects(service.getColors(request(names)), /Invalid/);
  }
  assert.deepEqual(calls, []);
});

test('the shared deadline aborts body consumption and leaves only a clean metadata failure', async (context) => {
  let deadline;
  let cleared = false;
  context.mock.method(globalThis, 'setTimeout', (callback, delay) => { assert.equal(delay, 10000); deadline = callback; return 1; });
  context.mock.method(globalThis, 'clearTimeout', () => { cleared = true; });
  context.mock.method(globalThis, 'fetch', async (_input, options) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('synthetic-body-abort')), { once: true });
  }) }));
  const service = new TmcUserColorService(() => active);
  const loading = service.getColors(request());
  await Promise.resolve();
  deadline();
  assert.equal((await loading).status, 'unavailable');
  assert.equal(cleared, true);
});
