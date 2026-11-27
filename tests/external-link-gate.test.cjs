const assert = require('node:assert/strict');
const { test, mock } = require('node:test');

mock.module('electron', {
  cache: true,
  exports: {
    BrowserWindow: { getFocusedWindow: () => null },
    dialog: { showMessageBox: async () => { throw new Error('Unexpected real dialog'); } },
    shell: { openExternal: async () => { throw new Error('Unexpected real external open'); } },
  },
});
const { TmcExternalLinkGate } = require('../.test-build/main/web/TmcExternalLinkGate.js');

function setup() {
  const asked = [];
  const opened = [];
  let answer;
  const gate = new TmcExternalLinkGate(
    (url) => { asked.push(url.toString()); return new Promise((resolve) => { answer = resolve; }); },
    async (url) => { opened.push(url); },
  );
  return { gate, asked, opened, answer: (value) => answer(value) };
}
const settle = () => new Promise(setImmediate);

test('opens only after the user confirms, and exactly the requested URL', async () => {
  const { gate, asked, opened, answer } = setup();
  gate.request(new URL('https://example.test/path?q=1'));
  await settle();
  assert.deepEqual(asked, ['https://example.test/path?q=1']);
  assert.deepEqual(opened, [], 'Nothing opens before the answer');
  answer(true);
  await settle();
  assert.deepEqual(opened, ['https://example.test/path?q=1']);
});

test('a cancelled prompt opens nothing', async () => {
  const { gate, opened, answer } = setup();
  gate.request(new URL('https://example.test/'));
  answer(false);
  await settle();
  assert.deepEqual(opened, []);
});

test('requests while a prompt is open are dropped, not queued; the next one asks again', async (context) => {
  context.mock.method(console, 'warn', () => undefined);
  const { gate, asked, opened, answer } = setup();
  gate.request(new URL('https://first.test/'));
  for (let index = 0; index < 20; index += 1) gate.request(new URL(`https://burst${index}.test/`));
  assert.equal(asked.length, 1);
  answer(true);
  await settle();
  assert.deepEqual(opened, ['https://first.test/']);
  gate.request(new URL('https://later.test/'));
  assert.deepEqual(asked, ['https://first.test/', 'https://later.test/']);
});

test('non-https and missing URLs never prompt', async () => {
  const { gate, asked } = setup();
  for (const url of [null, new URL('http://example.test/'), new URL('file:///C:/x'), new URL('javascript:alert(1)')]) gate.request(url);
  await settle();
  assert.deepEqual(asked, []);
});
