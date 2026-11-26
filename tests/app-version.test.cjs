const assert = require('node:assert/strict');
const { test } = require('node:test');
const manifest = require('../package.json');

test('window title and visible badge use the manifest version and the same compilation identity', async () => {
  const { appVersionPlugin } = await import('../build/appVersion.mjs');
  const source = '<title>TMC desktop</title><span data-tmc-app-version></span>';
  const html = appVersionPlugin('dev').transformIndexHtml(source);
  const title = /<title>(.*?)<\/title>/.exec(html)[1];
  const badge = /data-tmc-app-version>(.*?)<\/span>/.exec(html)[1];
  assert.equal(title, `TMC desktop ${badge}`);
  assert.ok(badge.startsWith(`v${manifest.version} · dev `));
  assert.match(badge, /\d{8}\.\d{6}Z$/);
});
