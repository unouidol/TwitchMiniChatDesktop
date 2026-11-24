const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { JsonFileStore } = require('../.test-build/main/storage/JsonFileStore.js');
const { TmcWelcomeService } = require('../.test-build/main/welcome/TmcWelcomeService.js');
const { fetchDesktopRelease, parseDesktopRelease, isNewerRelease, TMC_DESKTOP_RELEASE_API } = require('../.test-build/main/welcome/TmcReleaseClient.js');
const release = { version: '2.0.0', downloadUrl: 'https://github.com/unouidol/TwitchMiniChatDesktop/releases/download/v2.0.0/TMC-desktop-Setup.exe' };
const payload = { tag_name: 'v2.0.0', draft: false, prerelease: false,
  assets: [{ name: 'TMC-desktop-Setup.exe', state: 'uploaded', size: 120000000, browser_download_url: release.downloadUrl }] };
async function store(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-welcome-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  return { file: path.join(root, 'welcome.json'), value: new JsonFileStore(path.join(root, 'welcome.json'), null) };
}
test('release comparison is numeric, stable follows dev and invalid versions cannot prompt', () => {
  assert.equal(isNewerRelease('1.10.0', '1.9.9'), true);
  assert.equal(isNewerRelease('1.1.0', '1.1.0-dev.18'), true);
  for (const [latest, installed] of [['1.0.0', '2.0.0'], ['1.0.0', '1.0.0'], ['v2.0.0-rc.1', '1.0.0'], ['2.0.0', 'broken'], ['99999999999999999.0.0', '1.0.0']]) assert.equal(isNewerRelease(latest, installed), false);
});
test('only an uploaded desktop installer from the exact repository can be offered', () => {
  assert.deepEqual(parseDesktopRelease(payload), release);
  for (const invalid of [null, { ...payload, draft: true }, { ...payload, prerelease: true }, { ...payload, tag_name: 'v2.0.0-beta' },
    { ...payload, assets: [] }, { ...payload, assets: [{ ...payload.assets[0], browser_download_url: 'https://example.test/setup.exe' }] },
    { ...payload, assets: [{ ...payload.assets[0], name: 'Android.apk' }] }]) assert.throws(() => parseDesktopRelease(invalid));
});
test('anonymous transport distinguishes unpublished, rate limits, malformed and oversized responses', async () => {
  assert.deepEqual(await fetchDesktopRelease(async (url, options) => {
    assert.equal(url, TMC_DESKTOP_RELEASE_API); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { Accept: 'application/vnd.github+json', 'User-Agent': 'TMC-desktop' });
    return new Response(JSON.stringify(payload));
  }), release);
  assert.equal(await fetchDesktopRelease(async () => new Response(null, { status: 404 })), null);
  for (const response of [new Response(null, { status: 403 }), new Response('{broken'), new Response('x'.repeat(256 * 1024 + 1))]) await assert.rejects(fetchDesktopRelease(async () => response));
});
test('welcome is claimed once; daily checks and offline failures retain known updates', async (context) => {
  const disk = await store(context); let now = 100000000; let calls = 0;
  const service = new TmcWelcomeService(disk.value, '1.0.0', true, () => {}, async () => { calls++; return release; }, () => now);
  assert.equal((await service.start()).startup, 'first'); await service.check(); assert.equal(calls, 1);
  assert.equal((await service.start()).startup, null); assert.equal((await service.getState()).availableVersion, '2.0.0'); service.dispose();
  const restart = new TmcWelcomeService(disk.value, '1.0.0', true, () => {}, async () => { calls++; throw new Error('offline'); }, () => now);
  assert.equal((await restart.start()).startup, 'available'); assert.equal(calls, 1);
  now += 86400000; await restart.check(); assert.equal(calls, 2);
  assert.equal((await restart.getState()).checkState, 'failed'); assert.equal((await restart.getState()).availableVersion, '2.0.0');
  assert.equal((await restart.start()).startup, null); restart.dispose();
});
test('dev startup never checks automatically; concurrent manual requests share transport', async (context) => {
  const disk = await store(context); let calls = 0, finish;
  const service = new TmcWelcomeService(disk.value, '1.1.0-dev.18', false, () => {}, async () => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  await service.start(); assert.equal(calls, 0);
  const first = service.check(); const second = service.check(); assert.equal(first, second);
  while (!finish) await new Promise(setImmediate);
  finish(null); assert.equal((await first).checkState, 'unpublished'); assert.equal(calls, 1); service.dispose();
});
test('unreadable preferences are preserved without request or overwrite', async (context) => {
  const disk = await store(context); await fs.writeFile(disk.file, '{broken'); let calls = 0;
  const service = new TmcWelcomeService(disk.value, '1.0.0', true, () => {}, async () => { calls++; return release; });
  await assert.rejects(service.start()); await assert.rejects(service.check());
  assert.equal(await fs.readFile(disk.file, 'utf8'), '{broken'); assert.equal(calls, 0); service.dispose();
});
test('dispose aborts pending work and rejects publication of its completion', async (context) => {
  const disk = await store(context); let finish, seenSignal; const events = [];
  const service = new TmcWelcomeService(disk.value, '1.0.0', false, (value) => events.push(value), async (signal) => {
    seenSignal = signal; return new Promise((resolve) => { finish = resolve; });
  });
  await service.start(); const pending = service.check(); while (!finish) await new Promise(setImmediate);
  service.dispose(); assert.equal(seenSignal.aborted, true); finish(release); await pending;
  assert.equal(events.length, 1); assert.equal((await service.getState()).availableVersion, null);
});
test('the shared request deadline interrupts a stalled response body', async (context) => {
  const realTimeout = setTimeout;
  context.mock.method(globalThis, 'setTimeout', (callback, duration) => realTimeout(callback, duration === 10000 ? 10 : duration));
  await assert.rejects(fetchDesktopRelease(async (_url, options) => new Response(new ReadableStream({
    start(controller) { options.signal.addEventListener('abort', () => controller.error(new Error('Body aborted by deadline')), { once: true }); },
  }))), /Body aborted by deadline/);
});
