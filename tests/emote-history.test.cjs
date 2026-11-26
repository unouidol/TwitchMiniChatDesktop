const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TmcBackendClient } = require('../.test-build/main/backend/TmcBackendClient.js');

for (const [payload, expected] of [
  [{ text: '  😀 Kappa  ', emotes: '25:4-8' }, '  😀 Kappa  '],
  [{ text: '', message: 'Kappa', emotes_raw: '25:0-4' }, 'Kappa'],
  [{ text: '   ', message: '', body: '  Kappa  ', emotesRaw: '25:2-6' }, '  Kappa  '],
  [{ text: '  😀 Kappa  ', message: 'wrong alias', emotes_raw: '25:4-8' }, '  😀 Kappa  '],
]) {
  test('history keeps alias fallback while preserving exact chosen text and emote offsets', async (context) => {
    context.mock.method(globalThis, 'fetch', async (url) => {
      assert.equal(new URL(url).origin, 'https://backend.invalid');
      return new Response(JSON.stringify([{ ...payload, id: 'fixture-history', user: 'fixture-viewer', ts: 1000 }]));
    });
    const client = new TmcBackendClient({ backendBaseUrl: 'https://backend.invalid', desktopClientId: 'synthetic',
      desktopClientVersion: 'test' }, { getSession: () => ({ desktopSessionToken: 'synthetic-desktop' }) });
    const result = await client.loadHistory({ channel: 'fixture-channel', seconds: 60 });
    assert.equal(result.messages[0].text, expected);
    assert.equal(result.messages[0].fragments.map((piece) => piece.text).join(''), expected);
    assert.equal(result.messages[0].fragments.find((piece) => piece.kind === 'emote').text, 'Kappa');
  });
}

test('history with null emotes remains readable plain text', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([
    { text: 'hello', emotes: null, user: 'fixture-viewer', ts: 1000 },
  ])));
  const client = new TmcBackendClient({ backendBaseUrl: 'https://backend.invalid', desktopClientId: 'synthetic',
    desktopClientVersion: 'test' }, { getSession: () => ({ desktopSessionToken: 'synthetic-desktop' }) });
  const result = await client.loadHistory({ channel: 'fixture-channel', seconds: 60 });
  assert.deepEqual(result.messages[0].fragments, [{ kind: 'text', text: 'hello' }]);
});
