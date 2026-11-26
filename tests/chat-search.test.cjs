const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TmcChatSearchController } = require('../.test-build/renderer/chat/TmcChatSearchController.js');

class Control extends EventTarget {
  hidden = true; value = ''; textContent = ''; disabled = false;
  focus() { this.focused = true; }
  select() {}
  setAttribute() {}
}
const key = (key, extra = {}) => Object.assign(new Event('keydown', { cancelable: true }), { key, ...extra });
function row(id) {
  const classes = new Set();
  return { id, isConnected: true, classList: { add: (...values) => values.forEach((value) => classes.add(value)), remove: (...values) => values.forEach((value) => classes.delete(value)) }, classes };
}
function setup(context) {
  const original = global.document;
  const controls = new Map(['[data-tmc-search-panel]', '#chatSearch', '[data-tmc-search-toggle]', '[data-tmc-search-status]', '[data-tmc-search-previous]', '[data-tmc-search-next]', '[data-tmc-search-scope]', '[data-tmc-search-close]', '#messageInput'].map((selector) => [selector, new Control()]));
  const document = new EventTarget();
  document.querySelector = (selector) => controls.get(selector) || null;
  global.document = document;
  const revealed = [];
  const controller = new TmcChatSearchController((row) => revealed.push(row.id), () => {});
  context.after(() => { controller.dispose(); if (original === undefined) delete global.document; else global.document = original; });
  return { controller, controls, document, revealed, search(value) { controls.get('#chatSearch').value = value; controls.get('#chatSearch').dispatchEvent(new Event('input')); } };
}

test('search is literal, Unicode/case normalized and matches supplied text/emote codes or username without modifying rows', (context) => {
  const { controller, controls, document, search, revealed } = setup(context);
  const a = row('a'); const b = row('b');
  controller.add(a, 'ALICE', '😀 Café Kappa https://example.test');
  controller.add(b, 'bob', 'Literal <img> .*');
  document.dispatchEvent(key('f', { ctrlKey: true }));
  assert.equal(controls.get('[data-tmc-search-panel]').hidden, false);
  search('cafe\u0301'); assert.equal(a.classes.has('tmc-search-match'), true);
  search('alice'); assert.match(controls.get('[data-tmc-search-status]').textContent, /1 matches/);
  search('KAPPA'); assert.equal(a.classes.has('tmc-search-match'), true);
  search('.*'); assert.equal(a.classes.has('tmc-search-match'), false); assert.equal(b.classes.has('tmc-search-match'), true);
  controls.get('#chatSearch').dispatchEvent(key('Enter'));
  assert.deepEqual(revealed, ['b']);
  assert.equal(controls.get('#chatSearch').focused, true);
  search('missing'); assert.equal(controls.get('[data-tmc-search-next]').disabled, true);
});

test('results cycle both ways and live arrivals do not navigate, send or remove a draft; reset and disposal release the context', (context) => {
  const { controller, controls, document, search, revealed } = setup(context);
  const a = row('a'); const b = row('b'); const c = row('c');
  controller.add(a, 'one', 'match'); controller.add(b, 'two', 'match');
  controls.get('#messageInput').value = 'draft';
  controls.get('[data-tmc-search-toggle]').dispatchEvent(new Event('click'));
  search('match');
  controls.get('#chatSearch').dispatchEvent(key('Enter', { shiftKey: true }));
  controls.get('#chatSearch').dispatchEvent(key('Enter'));
  assert.deepEqual(revealed, ['b', 'a']);
  controller.add(c, 'three', 'match');
  assert.deepEqual(revealed, ['b', 'a']);
  assert.match(controls.get('[data-tmc-search-status]').textContent, /3 matches/);
  assert.equal(controls.get('#messageInput').value, 'draft');
  controller.reset();
  assert.equal(controls.get('[data-tmc-search-panel]').hidden, true);
  assert.equal(controls.get('#chatSearch').value, '');
  assert.equal(a.classes.size + b.classes.size + c.classes.size, 0);
  controller.dispose();
  document.dispatchEvent(key('f', { ctrlKey: true }));
  assert.equal(controls.get('[data-tmc-search-panel]').hidden, true);
});

test('search bounds recent row and text retention, removes evicted highlights and reports the reduced scope', (context) => {
  const { controller, controls, search } = setup(context);
  const first = row('first'); controller.add(first, 'author', 'match');
  controls.get('[data-tmc-search-toggle]').dispatchEvent(new Event('click')); search('match');
  for (let index = 0; index < 10000; index++) controller.add(row(String(index)), 'author', 'new');
  assert.equal(first.classes.size, 0);
  assert.match(controls.get('[data-tmc-search-scope]').textContent, /^10000 recent loaded messages ·/);
  controller.add(row('oversized'), 'author', 'match'.repeat(500000));
  assert.equal(controls.get('[data-tmc-search-next]').disabled, true);
  controls.get('#chatSearch').dispatchEvent(key('Escape'));
  assert.equal(controls.get('[data-tmc-search-panel]').hidden, true);
  assert.equal(controls.get('#messageInput').focused, true);
});
