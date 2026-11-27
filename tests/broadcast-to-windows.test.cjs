const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
let windows = [];
mock.module('electron', { cache: true, exports: { BrowserWindow: { getAllWindows: () => windows } } });
const { broadcastToWindows } = require('../.test-build/main/windows/broadcastToWindows.js');

function fakeWindow({ windowDestroyed = false, contentsDestroyed = false } = {}) {
  const sent = [];
  return {
    sent,
    isDestroyed: () => windowDestroyed,
    webContents: {
      isDestroyed: () => contentsDestroyed,
      send: (channel, payload) => {
        if (contentsDestroyed) throw new TypeError('Object has been destroyed');
        sent.push([channel, payload]);
      },
    },
  };
}

test('a window still emitting closed (listed, not destroyed, WebContents destroyed) is skipped without throwing', () => {
  const closing = fakeWindow({ contentsDestroyed: true });
  const destroyed = fakeWindow({ windowDestroyed: true });
  const live = fakeWindow();
  windows = [closing, destroyed, live];
  assert.doesNotThrow(() => broadcastToWindows('tmc:pcg:status-changed', { displayMode: 'embedded' }));
  assert.deepEqual(live.sent, [['tmc:pcg:status-changed', { displayMode: 'embedded' }]]);
  assert.deepEqual(closing.sent, []);
  assert.deepEqual(destroyed.sent, []);
});
