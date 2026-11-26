const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TmcSettingsStore } = require('../.test-build/main/settings/TmcSettingsStore.js');

async function setup(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-appearance-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, store: new TmcSettingsStore(root), file: path.join(root, 'settings.json') };
}

test('legacy settings gain appearance defaults without changing channel history or rewriting on reads', async (context) => {
  const { store, file } = await setup(context);
  const legacy = JSON.stringify({ currentChannel: 'Example', recentChannels: ['Example', 'Other'] });
  await fs.writeFile(file, legacy);
  const settings = await store.loadSettings();
  assert.deepEqual(settings.chatAppearance, { fontSize: 16, density: 'comfortable', showTimestamps: true });
  assert.deepEqual(settings.recentChannels, ['example', 'other']);
  assert.equal(await fs.readFile(file, 'utf8'), legacy);
});

test('appearance and legacy channel updates serialize and survive a fresh store without losing either change', async (context) => {
  const { store, root } = await setup(context);
  await Promise.all([
    store.setChatAppearance({ fontSize: 20, density: 'compact', showTimestamps: true }),
    store.setCurrentChannel('new_channel'),
    store.setChatAppearance({ fontSize: 18, density: 'comfortable', showTimestamps: true }),
  ]);
  const restored = await new TmcSettingsStore(root).loadSettings();
  assert.equal(restored.currentChannel, 'new_channel');
  assert.deepEqual(restored.chatAppearance, { fontSize: 18, density: 'comfortable', showTimestamps: true });
});

test('pre-timestamp appearance retains its chosen size/density and timestamp visibility persists independently', async (context) => {
  const { store, root, file } = await setup(context);
  await fs.writeFile(file, JSON.stringify({ currentChannel: 'example', chatAppearance: { fontSize: 20, density: 'compact' } }));
  assert.deepEqual((await store.loadSettings()).chatAppearance, { fontSize: 20, density: 'compact', showTimestamps: true });
  await store.setChatAppearance({ fontSize: 20, density: 'compact', showTimestamps: false });
  assert.deepEqual((await new TmcSettingsStore(root).loadSettings()).chatAppearance, { fontSize: 20, density: 'compact', showTimestamps: false });
  await assert.rejects(store.setChatAppearance({ fontSize: 20, density: 'compact', showTimestamps: 'false' }), /Invalid/);
});

test('invalid input and read/write failures preserve prior data and do not poison later settings operations', async (context) => {
  const { store, file } = await setup(context);
  await store.setChatAppearance({ fontSize: 18, density: 'compact', showTimestamps: true });
  const saved = await fs.readFile(file, 'utf8');
  for (const value of [null, {}, { fontSize: 200, density: 'compact', showTimestamps: true }, { fontSize: '18', density: 'compact', showTimestamps: true }, { fontSize: 18, density: 'unknown' }]) {
    await assert.rejects(store.setChatAppearance(value), /Invalid/);
  }
  assert.equal(await fs.readFile(file, 'utf8'), saved);
  await fs.mkdir(`${file}.tmp`);
  await assert.rejects(store.setChatAppearance({ fontSize: 20, density: 'comfortable', showTimestamps: true }));
  assert.equal(await fs.readFile(file, 'utf8'), saved);
  await fs.rmdir(`${file}.tmp`);
  await store.setChatAppearance({ fontSize: 14, density: 'compact', showTimestamps: true });
  await fs.writeFile(file, '{corrupt');
  await assert.rejects(store.setChatAppearance({ fontSize: 20, density: 'comfortable', showTimestamps: true }));
  assert.equal(await fs.readFile(file, 'utf8'), '{corrupt');
});
