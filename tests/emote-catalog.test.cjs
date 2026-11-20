const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const http = require('node:http');
const { once } = require('node:events');
const nativeFetch = globalThis.fetch;
const { TmcEmoteCatalogService } = require('../.test-build/main/chat/TmcEmoteCatalogService.js');
function memoryStore() {
  let value = { version: 1, profiles: [] };
  return { async read() { return structuredClone(value); }, async write(next) { value = structuredClone(next); } };
}
let active;
let calls;
let permission;
const account = (id) => ({ profileId: id, userId: `user-${id}`, username: `fixture-${id}`, accessToken: `synthetic-access-${id}` });
const json = (value) => new Response(JSON.stringify(value));
const emote = (id, name) => ({ id, name });
function transport(context) {
  context.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(['OAuth synthetic-access-A', 'OAuth synthetic-access-B', 'Bearer synthetic-access-A', 'Bearer synthetic-access-B'].includes(options.headers.Authorization));
    if (url.href === 'https://id.twitch.tv/oauth2/validate') return json({ client_id: 'synthetic-client', user_id: active.userId,
      scopes: permission ? ['user:read:emotes'] : [] });
    assert.equal(url.origin, 'https://api.twitch.tv');
    assert.equal(options.headers['Client-Id'], 'synthetic-client');
    if (url.pathname === '/helix/chat/emotes/global') return json({ data: [emote('25', 'Kappa')] });
    if (url.pathname === '/helix/users') return json({ data: [{ id: 'broadcaster' }] });
    if (url.pathname === '/helix/chat/emotes') return json({ data: [emote('1902', 'Keepo'), emote('999', 'Locked')] });
    assert.equal(url.pathname, '/helix/chat/emotes/user');
    assert.equal(url.searchParams.get('user_id'), active.userId);
    assert.equal(url.searchParams.get('broadcaster_id'), 'broadcaster');
    if (!url.searchParams.has('after')) return json({ data: [emote('25', 'Kappa'), emote(active.profileId === 'A' ? '88' : '1902', active.profileId === 'A' ? 'AWave' : 'Keepo')], pagination: { cursor: 'next' } });
    assert.equal(url.searchParams.get('after'), 'next');
    return json({ data: [emote('89', `${active.profileId}Extra`)], pagination: {} });
  });
}
beforeEach(() => { active = account('A'); calls = []; permission = true; });

test('favorites add only new sent emotes at the front, preserve reuse position and survive service restart per account', async (context) => {
  transport(context);
  const store = memoryStore();
  const service = new TmcEmoteCatalogService(() => active, store);
  await service.getCatalog('A', 'channel');
  const send = (text) => service.recordSent('A', { channel: 'channel', text });
  await send('AWave');
  await send('Kappa');
  await send('AWave AWave');
  assert.deepEqual((await service.getCatalog('A', 'channel')).favorites.map((item) => item.name), ['Kappa', 'AWave']);
  const restart = new TmcEmoteCatalogService(() => active, store);
  assert.deepEqual((await restart.getCatalog('A', 'other')).favorites.map((item) => item.name), ['Kappa', 'AWave']);
  assert.ok((await restart.getCatalog('A', 'other')).favorites.every((item) => item.availability === 'available'));
  active = account('B');
  assert.deepEqual((await restart.getCatalog('B', 'other')).favorites, []);
  await restart.recordSent('B', { channel: 'other', text: 'Keepo' });
  assert.deepEqual((await restart.getCatalog('B', 'other')).favorites.map((item) => item.name), ['Keepo']);
  active = account('A');
  assert.deepEqual((await restart.getCatalog('A', 'other')).favorites.map((item) => item.name), ['Kappa', 'AWave']);
  assert.doesNotMatch(JSON.stringify(await store.read()), /synthetic-access|Bearer|OAuth|user-A/);
});

test('favorites hold 24 entries, evict the tail, and an evicted emote becomes a new front entry', async (context) => {
  transport(context);
  const boundary = globalThis.fetch;
  context.mock.method(globalThis, 'fetch', (url, options) => new URL(url).pathname === '/helix/chat/emotes/global'
    ? Promise.resolve(json({ data: Array.from({ length: 26 }, (_, index) => emote(String(100 + index), `Global${index}`)) }))
    : boundary(url, options));
  const service = new TmcEmoteCatalogService(() => active, memoryStore());
  await service.getCatalog('A', 'channel');
  for (let index = 0; index < 26; index++) await service.recordSent('A', { channel: 'channel', text: `Global${index}` });
  const favorites = async () => (await service.getCatalog('A', 'channel')).favorites.map((item) => item.name);
  const expected = Array.from({ length: 24 }, (_, index) => `Global${25 - index}`);
  assert.deepEqual(await favorites(), expected);
  await service.recordSent('A', { channel: 'channel', text: 'Global3 Global15' });
  assert.deepEqual(await favorites(), expected);
  await service.recordSent('A', { channel: 'channel', text: 'Global0' });
  assert.deepEqual(await favorites(), ['Global0', ...expected.slice(0, 23)]);
});

test('favorites ignore unrecognized, locked and mismatched-account/channel usage', async (context) => {
  transport(context);
  const service = new TmcEmoteCatalogService(() => active, memoryStore());
  await service.getCatalog('A', 'channel');
  await service.recordSent('A', { channel: 'channel', text: 'Locked Keepo not-an-emote' });
  await service.recordSent('B', { channel: 'channel', text: 'Kappa' });
  await service.recordSent('A', { channel: 'other', text: 'Kappa' });
  assert.deepEqual((await service.getCatalog('A', 'channel')).favorites, []);
});

test('known sent emotes still become favorites after cache expiry without a network request during send', async (context) => {
  transport(context);
  const store = memoryStore();
  const service = new TmcEmoteCatalogService(() => active, store);
  await service.getCatalog('A', 'channel');
  const now = Date.now();
  const before = calls.length;
  context.mock.method(Date, 'now', () => now + 300001);
  assert.equal(service.outgoingFragments({ channel: 'channel', text: 'Kappa' }), undefined);
  await service.recordSent('A', { channel: 'channel', text: 'Kappa' });
  assert.equal(calls.length, before);
  assert.deepEqual((await store.read()).profiles[0].emotes.map((item) => item.name), ['Kappa']);
});

test('concurrent sends serialize disk mutations and preserve initiating account during account switch', async (context) => {
  transport(context);
  const store = memoryStore();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const write = store.write;
  store.write = async (data) => { await gate; await write(data); };
  const service = new TmcEmoteCatalogService(() => active, store);
  await service.getCatalog('A', 'channel');
  const first = service.recordSent('A', { channel: 'channel', text: 'AWave' });
  const second = service.recordSent('A', { channel: 'channel', text: 'Kappa' });
  active = account('B');
  const catalogB = service.getCatalog('B', 'channel');
  release();
  await Promise.all([first, second]);
  assert.deepEqual((await catalogB).favorites, []);
  assert.deepEqual((await store.read()).profiles.find((profile) => profile.profileId === 'A').emotes.map((item) => item.name), ['Kappa', 'AWave']);
});

test('corrupt or unwritable favorites preserve stored data, expose a warning and never fail an already sent message', async (context) => {
  transport(context);
  let writes = 0;
  const corrupt = { async read() { return { version: 1, profiles: [{ profileId: 'A', emotes: [{ id: '../bad', name: 'bad' }] }] }; },
    async write() { writes++; } };
  const service = new TmcEmoteCatalogService(() => active, corrupt);
  const catalog = await service.getCatalog('A', 'channel');
  assert.equal(catalog.favoritesSaveFailed, true);
  assert.ok(catalog.emotes.some((item) => item.name === 'Kappa'));
  await assert.doesNotReject(service.recordSent('A', { channel: 'channel', text: 'Kappa' }));
  assert.equal(writes, 0);
  const store = memoryStore();
  store.write = async () => { throw Object.assign(new Error('synthetic-write-fault'), { code: 'EIO' }); };
  const failing = new TmcEmoteCatalogService(() => active, store);
  await failing.getCatalog('A', 'channel');
  await assert.doesNotReject(failing.recordSent('A', { channel: 'channel', text: 'Kappa' }));
  assert.equal((await failing.getCatalog('A', 'channel')).favoritesSaveFailed, true);
  assert.deepEqual((await store.read()).profiles, []);
});

test('stored favorites remain in place when entitlement is absent and are disabled without deletion', async (context) => {
  transport(context);
  const store = memoryStore();
  const service = new TmcEmoteCatalogService(() => active, store);
  await service.getCatalog('A', 'channel');
  await service.recordSent('A', { channel: 'channel', text: 'AWave Kappa' });
  permission = false;
  const restarted = new TmcEmoteCatalogService(() => active, store);
  const catalog = await restarted.getCatalog('A', 'channel');
  assert.deepEqual(catalog.favorites.map((item) => [item.name, item.availability]), [['Kappa', 'available'], ['AWave', 'unknown']]);
  assert.equal((await store.read()).profiles[0].emotes.length, 2);
});

test('favorites persist through a fresh JSON file store instance without saving credentials', async (context) => {
  transport(context);
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { JsonFileStore } = require('../.test-build/main/storage/JsonFileStore.js');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-emote-favorites-')));
  try {
    const filename = path.join(root, 'favorites.json');
    const store = () => new JsonFileStore(filename, { version: 1, profiles: [] });
    const first = new TmcEmoteCatalogService(() => active, store());
    await first.getCatalog('A', 'channel');
    await first.recordSent('A', { channel: 'channel', text: 'Kappa AWave' });
    const restarted = new TmcEmoteCatalogService(() => active, store());
    assert.deepEqual((await restarted.getCatalog('A', 'channel')).favorites.map((item) => item.name), ['AWave', 'Kappa']);
    assert.doesNotMatch(await fs.readFile(filename, 'utf8'), /synthetic-access|Bearer|OAuth/);
  } finally {
    assert.equal(await fs.realpath(root), root);
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('tmc-emote-favorites-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('catalog paginates usable personal emotes and distinguishes locked channel emotes', async (context) => {
  transport(context);
  const service = new TmcEmoteCatalogService(() => active, memoryStore());
  const result = await service.getCatalog('A', 'channel');
  assert.equal(result.profileId, 'A');
  assert.deepEqual(result.emotes.filter((item) => item.category === 'personal').map((item) => item.name), ['AWave', 'AExtra']);
  assert.equal(result.emotes.find((item) => item.category === 'channel' && item.name === 'Keepo').availability, 'locked');
  assert.equal(result.emotes.find((item) => item.category === 'global').availability, 'available');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-access|client_id|Bearer|OAuth/);
  assert.equal(calls.length, 6);
});

test('missing personal permission still provides globals and marks channel entitlement unknown', async (context) => {
  permission = false;
  transport(context);
  const result = await new TmcEmoteCatalogService(() => active, memoryStore()).getCatalog('A', 'channel');
  assert.equal(result.personalPermission, false);
  assert.equal(result.emotes.some((item) => item.category === 'personal'), false);
  assert.equal(result.emotes.find((item) => item.category === 'channel').availability, 'unknown');
  assert.equal(calls.some((url) => url.pathname.endsWith('/user')), false);
});

test('cache and outgoing emote recognition are isolated by account, token and channel', async (context) => {
  transport(context);
  const service = new TmcEmoteCatalogService(() => active, memoryStore());
  await service.getCatalog('A', 'channel');
  const count = calls.length;
  await service.getCatalog('A', 'channel');
  assert.equal(calls.length, count);
  assert.equal(service.outgoingFragments({ channel: 'channel', text: 'AWave Kappa' }).filter((item) => item.kind === 'emote').length, 2);
  assert.equal(service.outgoingFragments({ channel: 'other', text: 'AWave' }), undefined);
  active = account('B');
  assert.equal(service.outgoingFragments({ channel: 'channel', text: 'AWave' }), undefined);
  const b = await service.getCatalog('B', 'channel');
  assert.equal(b.emotes.some((item) => item.name === 'AWave'), false);
  assert.equal(service.outgoingFragments({ channel: 'channel', text: 'AWave Keepo' })[0].kind, 'text');
  assert.equal(b.emotes.find((item) => item.category === 'channel' && item.name === 'Keepo').availability, 'available');
});

test('account change during fetch cannot publish or cache the old catalog', async (context) => {
  let finish;
  context.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { finish = resolve; }));
  const service = new TmcEmoteCatalogService(() => active, memoryStore());
  const loading = service.getCatalog('A', 'channel');
  active = account('B');
  finish(json({ client_id: 'synthetic-client', user_id: 'user-A', scopes: [] }));
  await assert.rejects(loading);
  assert.equal(service.outgoingFragments({ channel: 'channel', text: 'Kappa' }), undefined);
});

test('validation rejects identity mismatch before making catalog requests', async (context) => {
  let count = 0;
  context.mock.method(globalThis, 'fetch', async () => { count++; return json({ client_id: 'synthetic-client', user_id: 'other-user', scopes: [] }); });
  await assert.rejects(new TmcEmoteCatalogService(() => active, memoryStore()).getCatalog('A', 'channel'));
  assert.equal(count, 1);
});

test('network failures expose no raw causes or secrets and do not alter saved authentication', async (context) => {
  const original = active;
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('sensitive-synthetic-access'); });
  await assert.rejects(new TmcEmoteCatalogService(() => active, memoryStore()).getCatalog('A', 'channel'), (error) => {
    assert.doesNotMatch(String(error), /sensitive|synthetic-access/);
    return true;
  });
  assert.equal(active, original);
});

test('catalog request deadline aborts a stalled transport', async (context) => {
  const timeout = globalThis.setTimeout;
  context.mock.method(globalThis, 'setTimeout', (callback, milliseconds) => {
    assert.equal(milliseconds, 15000);
    return timeout(callback, 1);
  });
  context.mock.method(globalThis, 'fetch', (_input, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  await assert.rejects(new TmcEmoteCatalogService(() => active, memoryStore()).getCatalog('A', 'channel'));
});

test('unauthenticated or mismatched-account requests never contact a provider', async (context) => {
  context.mock.method(globalThis, 'fetch', () => assert.fail('No provider request is allowed'));
  const service = new TmcEmoteCatalogService(() => active, memoryStore());
  await assert.rejects(service.getCatalog('B', 'channel'));
  active = null;
  await assert.rejects(service.getCatalog('A', 'channel'));
});

test('cache expiry and token rotation require fresh provider validation', async (context) => {
  transport(context);
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const service = new TmcEmoteCatalogService(() => active, memoryStore());
  await service.getCatalog('A', 'channel');
  const first = calls.length;
  active = { ...active, accessToken: 'synthetic-access-B' };
  await service.getCatalog('A', 'channel');
  assert.equal(calls.length, first * 2);
  now += 300001;
  await service.getCatalog('A', 'channel');
  assert.equal(calls.length, first * 3);
});

for (const data of [[{ id: '../evil', name: 'Kappa' }], [{ id: '25', name: 'bad name' }], [null]]) {
  test('malformed provider metadata cannot become a successful catalog', async (context) => {
    context.mock.method(globalThis, 'fetch', async (url) => new URL(url).hostname === 'id.twitch.tv'
      ? json({ client_id: 'synthetic-client', user_id: active.userId, scopes: [] }) : json({ data }));
    await assert.rejects(new TmcEmoteCatalogService(() => active, memoryStore()).getCatalog('A', 'channel'));
  });
}

test('pagination loops and invalid cursor types fail rather than publish a partial catalog', async (context) => {
  transport(context);
  const original = globalThis.fetch;
  for (const cursor of ['loop', 123]) {
    let pages = 0;
    context.mock.method(globalThis, 'fetch', async (url, options) => {
      if (new URL(url).pathname.endsWith('/user')) { pages++; return json({ data: [], pagination: { cursor } }); }
      return original(url, options);
    });
    await assert.rejects(new TmcEmoteCatalogService(() => active, memoryStore()).getCatalog('A', 'channel'));
    assert.equal(pages, typeof cursor === 'number' ? 1 : 2);
  }
});

test('pending request limit bounds provider traffic and releases failed requests', async (context) => {
  const releases = [];
  context.mock.method(globalThis, 'fetch', () => new Promise((resolve) => releases.push(resolve)));
  const service = new TmcEmoteCatalogService(() => active, memoryStore());
  const pending = Array.from({ length: 4 }, (_value, index) => service.getCatalog('A', `channel${index}`));
  await assert.rejects(service.getCatalog('A', 'fifth'), /already loading/);
  assert.equal(releases.length, 4);
  const completion = Promise.allSettled(pending);
  releases.forEach((resolve) => resolve(json({})));
  assert.ok((await completion).every((result) => result.status === 'rejected'));
});

test('catalog deadline interrupts a real unfinished response body', async (context) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{');
  });
  const timeout = globalThis.setTimeout;
  let abort;
  let headersSeen = false;
  context.mock.method(globalThis, 'setTimeout', (callback, milliseconds, ...args) => {
    if (milliseconds === 15000) abort = callback;
    return timeout(callback, milliseconds, ...args);
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const destination = `http://127.0.0.1:${server.address().port}/validate`;
    context.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, 'https://id.twitch.tv/oauth2/validate');
      const response = await nativeFetch(destination, options);
      headersSeen = true;
      abort();
      return response;
    });
    await assert.rejects(new TmcEmoteCatalogService(() => active, memoryStore()).getCatalog('A', 'channel'));
    assert.equal(headersSeen, true);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
