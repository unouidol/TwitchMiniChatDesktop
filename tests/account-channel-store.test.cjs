const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { JsonFileStore } = require('../.test-build/main/storage/JsonFileStore.js');
const { TmcAccountChannelStore } = require('../.test-build/main/channels/TmcAccountChannelStore.js');
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function memory(context) {
  let persisted = { states: {} }; let writes = 0;
  const controls = { readError: null, writeError: null, beforeWrite: null };
  context.mock.method(JsonFileStore.prototype, 'read', async () => {
    if (controls.readError) throw controls.readError;
    return structuredClone(persisted);
  });
  context.mock.method(JsonFileStore.prototype, 'write', async (value) => {
    if (controls.writeError) throw controls.writeError;
    if (controls.beforeWrite) await controls.beforeWrite();
    await new Promise(setImmediate); persisted = structuredClone(value); writes++;
  });
  return { store: new TmcAccountChannelStore('unused-memory-boundary'), data: () => persisted, writes: () => writes, controls };
}

test('channel transactions retain concurrent last/recent/favorites for both profiles', async (context) => {
  const { store } = memory(context);
  await Promise.all([
    store.setLastChannel('A', '#Alpha'), store.addRecentChannel('A', 'Alpha'),
    store.toggleFavoriteChannel('A', 'Alpha'), store.setLastChannel('B', 'Beta'),
    store.addRecentChannel('B', 'Beta'), store.toggleFavoriteChannel('A', 'Gamma'),
  ]);
  const a = await store.getState('A'), b = await store.getState('B');
  assert.equal(a.lastChannel, 'alpha'); assert.deepEqual(a.recentChannels, ['alpha']);
  assert.deepEqual(a.favoriteChannels, ['alpha', 'gamma']);
  assert.equal(b.lastChannel, 'beta'); assert.deepEqual(b.recentChannels, ['beta']);
  assert.deepEqual(b.favoriteChannels, []);
});

test('a channel read queued after a held write observes the committed preference', async (context) => {
  const { store, controls } = memory(context); const entered = deferred(), gate = deferred();
  controls.beforeWrite = async () => { entered.resolve(); await gate.promise; };
  const writing = store.setLastChannel('A', 'alpha'); await entered.promise;
  const reading = store.getState('A'); gate.resolve(); await writing;
  assert.equal((await reading).lastChannel, 'alpha');
});

test('a read failure rejects mutations without writing an empty channel store', async (context) => {
  const { store, writes, controls } = memory(context); const failure = Object.assign(new Error('read blocked'), { code: 'EACCES' });
  controls.readError = failure;
  await assert.rejects(store.toggleFavoriteChannel('A', 'alpha'), (error) => error === failure);
  assert.equal(writes(), 0);
  controls.readError = null;
  await store.toggleFavoriteChannel('A', 'alpha');
  assert.deepEqual((await store.getState('A')).favoriteChannels, ['alpha']);
});

test('a failed write preserves preferences and does not poison later transactions', async (context) => {
  const { store, data, controls } = memory(context); await store.toggleFavoriteChannel('A', 'alpha');
  const before = structuredClone(data()); const failure = Object.assign(new Error('replace blocked'), { code: 'EPERM' });
  controls.writeError = failure;
  await assert.rejects(store.setLastChannel('B', 'beta'), (error) => error === failure);
  assert.deepEqual(data(), before);
  controls.writeError = null;
  await store.addRecentChannel('B', 'beta');
  assert.deepEqual((await store.getState('A')).favoriteChannels, ['alpha']);
  assert.deepEqual((await store.getState('B')).recentChannels, ['beta']);
});

test('real channel preferences survive concurrent transactions and a fresh store; corrupt files are preserved', async (context) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-channel-store-')));
  context.after(async () => {
    assert.equal(path.dirname(await fs.realpath(root)), await fs.realpath(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const store = new TmcAccountChannelStore(root);
  await Promise.all([store.setLastChannel('A', 'alpha'), store.toggleFavoriteChannel('A', 'alpha'), store.setLastChannel('B', 'beta')]);
  const fresh = new TmcAccountChannelStore(root);
  assert.deepEqual((await fresh.getState('A')).favoriteChannels, ['alpha']);
  assert.equal((await fresh.getState('B')).lastChannel, 'beta');
  const file = path.join(root, 'tmc-account-channels.json');
  for (const content of ['{invalid-json', 'null', '{"states":42}']) {
    await fs.writeFile(file, content);
    await assert.rejects(new TmcAccountChannelStore(root).addRecentChannel('A', 'gamma'));
    assert.equal(await fs.readFile(file, 'utf8'), content);
  }
});

test('profile keys resembling object properties remain independent through later updates', async (context) => {
  const { store } = memory(context);
  await store.setLastChannel('__proto__', 'alpha');
  await store.setLastChannel('B', 'beta');
  assert.equal((await store.getState('__proto__')).lastChannel, 'alpha');
  assert.equal((await store.getState('B')).lastChannel, 'beta');
});
