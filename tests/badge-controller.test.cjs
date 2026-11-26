const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const { TmcChatBadgeController } = require('../.test-build/renderer/chat/TmcChatBadgeController.js');
const original = global.document;
afterEach(() => { if (original === undefined) delete global.document; else global.document = original; });
const tick = () => new Promise(setImmediate);

test('pending badge enrichment stays bounded and never scans the full chat or issues one request per message', async () => {
  global.document = { querySelector: () => ({ value: 'A' }), querySelectorAll: () => assert.fail('No full chat scan') };
  let queries = 0;
  let requests = 0;
  let release;
  const controller = new TmcChatBadgeController({ badges: { getCatalog: (request) => {
    requests++; return new Promise((resolve) => { release = () => resolve({ ...request, badges: [], status: 'ready' }); });
  } } }, () => 'channel', () => {});
  for (let index = 0; index < 5000; index++) controller.schedule([{ parentElement: { querySelector: () => ({
    childElementCount: 1, isConnected: true, querySelectorAll: () => { queries++; return []; },
  }) } }]);
  assert.equal(requests, 1);
  release(); await tick();
  assert.equal(queries, 1000);
  controller.dispose();
});

test('account/channel reset and disposal prevent late badge results from editing old rows or another account', async () => {
  let profile = 'A';
  global.document = { querySelector: () => ({ value: profile }) };
  let release;
  let changed = 0;
  const controller = new TmcChatBadgeController({ badges: { getCatalog: (request) => new Promise((resolve) => {
    release = () => resolve({ ...request, badges: [], status: 'ready' });
  }) } }, () => 'channel', () => { changed++; });
  const author = { parentElement: { querySelector: () => ({ childElementCount: 1, isConnected: true, querySelectorAll: () => assert.fail('Stale result must stay inert') }) } };
  controller.schedule([author]);
  profile = 'B'; controller.reset(); release(); await tick();
  controller.schedule([author]);
  controller.dispose(); release(); await tick();
  assert.equal(changed, 0);
});
