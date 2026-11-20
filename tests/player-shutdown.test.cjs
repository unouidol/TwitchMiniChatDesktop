const assert = require('node:assert/strict');
const { test, mock, beforeEach } = require('node:test');
const { EventEmitter } = require('node:events');
const app = new EventEmitter();
let attempts, exits;
app.quit = () => { attempts++; const event = { prevented: false, preventDefault() { this.prevented = true; } };
  app.emit('before-quit', event); if (!event.prevented) { exits++; app.emit('will-quit'); } };
app.exit = () => assert.fail('Use the injected failure boundary');
mock.module('electron', { cache: true, exports: { app } });
const { registerPlayerShutdown } = require('../.test-build/main/player/registerPlayerShutdown.js');
const tick = () => new Promise(setImmediate);
beforeEach(() => { app.removeAllListeners(); attempts = 0; exits = 0; });

test('quit waits for owned cleanup once, including repeated native quit requests, before allowing session teardown', async () => {
  let release, closes = 0;
  registerPlayerShutdown({ close: () => { closes++; return new Promise((resolve) => { release = resolve; }); } });
  app.quit(); app.quit(); await tick();
  assert.equal(exits, 0); assert.equal(closes, 1);
  release(); await tick();
  assert.equal(exits, 1); assert.equal(attempts, 3); assert.equal(app.listenerCount('before-quit'), 0);
});

test('failed cleanup uses the explicit failure path instead of reporting a successful graceful quit', async () => {
  let failures = 0;
  registerPlayerShutdown({ close: async () => { throw new Error('Controlled cleanup failure'); } }, () => { failures++; });
  app.quit(); await tick();
  assert.equal(failures, 1); assert.equal(exits, 0);
});
