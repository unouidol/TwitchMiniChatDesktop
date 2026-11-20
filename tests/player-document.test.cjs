const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TmcPlayerDocument } = require('../.test-build/main/player/TmcPlayerDocument.js');

test('player source binds loopback and serves only its unpredictable path and current validated channel with restrictive headers', async (context) => {
  const document = new TmcPlayerDocument(); context.after(() => document.close());
  const url = await document.url('channel');
  assert.equal(new URL(url).hostname, 'localhost');
  assert.match(new URL(url).pathname, /^\/player\/[a-f0-9]{48}$/);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await response.text();
  assert.match(html, /https:\/\/player\.twitch\.tv\/\?channel=channel&amp;parent=localhost/);
  assert.match(html, /muted=true/); assert.doesNotMatch(html, /<script|preload|window\.tmc|access.token/);
  assert.equal((await fetch(url, { method: 'POST' })).status, 404);
  assert.equal((await fetch(url.replace('/player/', '/wrong/'))).status, 404);
  await assert.rejects(document.url('../bad'), /Invalid/);
  const next = await document.url('other');
  assert.equal((await fetch(url)).status, 404, 'Retired channel documents cannot be served');
  assert.equal((await fetch(next)).status, 200);
  await document.close();
  assert.equal(document.source, null);
  await assert.rejects(fetch(next, { signal: AbortSignal.timeout(1000) }), /fetch failed/);
});

test('closing while listen is pending releases the actual server and does not publish a late URL', async () => {
  const document = new TmcPlayerDocument();
  const pending = document.url('channel');
  const rejected = assert.rejects(pending, /closed/);
  await document.close(); await rejected;
  assert.equal(document.source, null);
});
