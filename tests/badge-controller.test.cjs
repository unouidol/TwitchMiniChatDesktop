const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const { TmcChatBadgeController } = require('../.test-build/renderer/chat/TmcChatBadgeController.js');
const original = global.document;
const originalElement = global.HTMLElement;
afterEach(() => {
  if (original === undefined) delete global.document; else global.document = original;
  if (originalElement === undefined) delete global.HTMLElement; else global.HTMLElement = originalElement;
});
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

// DOM boundary only: exercise the production slot builder and image callbacks.
class Element {
  children = []; dataset = {}; hidden = false; textContent = ''; isConnected = true;
  attributes = {}; events = {};
  classList = { add() {}, remove() {} };
  get childElementCount() { return this.children.length; }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  querySelectorAll() { return this.children; }
}

for (const stale of [false, true]) test(`badge images load without text fallback; late image events ${stale ? 'after reset are inert' : 'hide failures'}`, async () => {
  global.HTMLElement = Element;
  global.document = { createElement: () => new Element(), querySelector: () => ({ value: 'A' }) };
  const { createChatBadges } = require('../.test-build/renderer/chat/createChatBadges.js');
  const container = createChatBadges([{ setId: 'moderator', version: '1' }, { setId: 'unknown', version: '1' }]);
  const [slot, unknown] = container.children;
  assert.equal(container.hidden, true); assert.equal(slot.hidden, true); assert.equal(slot.textContent, '');
  const controller = new TmcChatBadgeController({ badges: { getCatalog: async (request) => ({ ...request, status: 'ready', badges: [
    { setId: 'moderator', version: '1', title: 'Moderator', imageUrl: 'https://static-cdn.jtvnw.net/badges/v1/00000000-0000-0000-0000-000000000001/2' },
  ] }) } }, () => 'channel', () => {});
  controller.schedule([{ parentElement: { querySelector: () => container } }]);
  await tick();
  const image = slot.children[0];
  assert.equal(image.loading, 'eager', 'Hidden slots must fetch before they can become visible');
  assert.equal(image.alt, ''); assert.equal(slot.attributes['aria-label'], 'Moderator');
  assert.equal(unknown.hidden, true); assert.equal(unknown.textContent, '');
  if (stale) controller.reset();
  image.events.load();
  assert.equal(slot.hidden, stale); assert.equal(container.hidden, stale);
  image.events.error();
  assert.equal(slot.hidden, true); assert.equal(container.hidden, true);
  assert.equal(slot.children.length, stale ? 1 : 0);
  assert.equal(slot.textContent, '');
  controller.dispose();
});
