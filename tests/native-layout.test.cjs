const assert = require('node:assert/strict');
const { test } = require('node:test');

test('native layout waits for selected identity and current bounds and compares numeric geometry regardless of WebDriver key order', async () => {
  const { settledNativeViews } = await import('./e2e/native-layout.mjs');
  const view = [{ id: 10, bounds: { x: 816, y: 291, width: 313, height: 360 } }];
  const state = { status: { profileId: 'A', channel: 'channel', state: 'active', displayMode: 'embedded', twitchAuth: 'signed-out' },
    selected: 'A', channel: 'channel', auth: 'signed-out', bounds: { height: 360, width: 313, x: 816, y: 291 } };
  let reads = 0;
  const browser = {
    async execute() { return { ...state, selected: reads === 0 ? 'B' : 'A' }; },
    async waitUntil(predicate) {
      assert.equal(await predicate(), false, 'An old account snapshot is never accepted');
      assert.equal(await predicate(), false, 'One matching observation is insufficient');
      assert.equal(await predicate(), true, 'Two observations of the actual bounds settle');
    },
  };
  assert.deepEqual(await settledNativeViews(browser, async () => { reads++; return view; }), view);
});

test('native layout rejects pending authentication and genuine geometry changes instead of aligning the view to make the test pass', async () => {
  const { settledNativeViews } = await import('./e2e/native-layout.mjs');
  let pending = true;
  const browser = {
    async execute() { return { status: { profileId: 'A', channel: 'channel', state: 'active', displayMode: 'embedded', twitchAuth: pending ? 'unknown' : 'signed-out' },
      selected: 'A', channel: 'channel', auth: pending ? 'unknown' : 'signed-out', bounds: { x: 1, y: 2, width: 100, height: 200 } }; },
    async waitUntil(predicate) {
      assert.equal(await predicate(), false);
      assert.equal(await predicate(), false);
      pending = false;
      assert.equal(await predicate(), false, 'Different native bounds remain a failure after auth settles');
      throw new Error('Expected bounded wait failure');
    },
  };
  await assert.rejects(settledNativeViews(browser, async () => [{ id: 1, bounds: { x: 1, y: 3, width: 100, height: 200 } }]), /bounded wait failure/);
});
