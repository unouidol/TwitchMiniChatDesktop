const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { TmcChatNameColorController } = require('../.test-build/renderer/chat/TmcChatNameColorController.js');
const originalDocument = global.document;
let profile;
let timers;
const tick = () => new Promise(setImmediate);
const author = (name, supplied) => ({ isConnected: true, style: { color: '' }, dataset: {
  tmcAuthorLogin: name, tmcColorSource: supplied ? 'provided' : 'fallback', ...(supplied ? { tmcNameColor: supplied } : {}),
} });
beforeEach((context) => {
  profile = 'A';
  timers = new Map();
  let sequence = 0;
  global.document = {
    querySelector: () => ({ value: profile }),
    querySelectorAll: () => assert.fail('Enrichment must not scan the growing chat DOM'),
  };
  context.mock.method(globalThis, 'setTimeout', (callback) => { const id = ++sequence; timers.set(id, callback); return id; });
  context.mock.method(globalThis, 'clearTimeout', (id) => { timers.delete(id); });
});
afterEach(() => { if (originalDocument === undefined) delete global.document; else global.document = originalDocument; });
async function flush() {
  const entry = timers.entries().next().value;
  if (entry) { timers.delete(entry[0]); entry[1](); await tick(); }
}

test('newly registered authors resolve in bounded batches without any full-DOM query or per-message scan', async () => {
  const requests = [];
  const controller = new TmcChatNameColorController({ chat: { getUserColors: async (request) => {
    requests.push(request); return { ...request, colors: request.usernames.map((username) => ({ username, color: null })) };
  } } }, () => 'channel');
  for (let index = 0; index < 5000; index++) controller.schedule([author(`user_${index}`)]);
  assert.equal(timers.size, 1, 'Live arrivals share one scheduled batch');
  for (let turn = 0; timers.size && turn < 15; turn++) await flush();
  assert.equal(timers.size, 0);
  assert.equal(requests.length, 10);
  assert.ok(requests.every((request) => request.usernames.length === 100));
  assert.ok(requests.flatMap((request) => request.usernames).every((name) => Number(name.slice(5)) >= 4000));
  controller.dispose();
});

test('provided live metadata arriving during lookup wins and new fallback messages reuse it without another request', async () => {
  let release;
  let calls = 0;
  const controller = new TmcChatNameColorController({ chat: { getUserColors: (request) => {
    calls++; return new Promise((resolve) => { release = () => resolve({ ...request, colors: [{ username: 'bot_red', color: '#FF0000' }] }); });
  } } }, () => 'channel');
  const missing = author('bot_red');
  controller.schedule([missing]);
  await flush();
  controller.schedule([author('bot_red', '#123456')]);
  await flush();
  assert.equal(missing.style.color, '#123456', 'Live tags update pending authors while the provider request is still held');
  release();
  await tick();
  assert.equal(missing.style.color, '#123456');
  const next = author('bot_red');
  controller.schedule([next]);
  assert.equal(next.style.color, '#123456');
  assert.equal(calls, 1);
  controller.dispose();
});

test('messages from an in-flight username all receive its eventual color without duplicate requests', async () => {
  let release;
  let calls = 0;
  const controller = new TmcChatNameColorController({ chat: { getUserColors: (request) => {
    calls++;
    return new Promise((resolve) => { release = () => resolve({ ...request, colors: [{ username: 'bot_red', color: '#FF0000' }] }); });
  } } }, () => 'channel');
  const first = author('bot_red');
  controller.schedule([first]);
  await flush();
  const second = author('bot_red');
  controller.schedule([second]);
  await flush();
  assert.equal(calls, 1);
  release();
  await tick();
  assert.equal(first.style.color, '#FF0000');
  assert.equal(second.style.color, '#FF0000');
  assert.equal(calls, 1);
  controller.dispose();
});

test('account/context reset discards late completion; dispose releases scheduled work', async () => {
  const releases = [];
  const controller = new TmcChatNameColorController({ chat: { getUserColors: (request) => new Promise((resolve) => {
    releases.push(() => resolve({ ...request, colors: [{ username: 'bot_red', color: request.profileId === 'A' ? '#FF0000' : '#0000FF' }] }));
  }) } }, () => 'channel');
  const old = author('bot_red');
  controller.schedule([old]);
  await flush();
  controller.reset();
  profile = 'B';
  const current = author('bot_red');
  controller.schedule([current]);
  await flush();
  releases[0]();
  await tick();
  assert.equal(old.style.color, '');
  assert.equal(current.style.color, '');
  releases[1]();
  await tick();
  assert.equal(current.style.color, '#0000FF');
  controller.schedule([author('another')]);
  assert.equal(timers.size, 1);
  controller.dispose();
  assert.equal(timers.size, 0);
  controller.schedule([author('ignored')]);
  assert.equal(timers.size, 0);
});
