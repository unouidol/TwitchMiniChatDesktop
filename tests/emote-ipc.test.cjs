const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
let handler;
const frame = { url: 'http://localhost:5173/' };
const sender = { mainFrame: frame };
global.MAIN_WINDOW_VITE_DEV_SERVER_URL = frame.url;
global.MAIN_WINDOW_VITE_NAME = 'main_window';
mock.module('electron', { cache: true, exports: {
  ipcMain: { handle: (_channel, value) => { handler = value; } },
  BrowserWindow: { fromWebContents: (contents) => contents === sender ? { webContents: sender } : null },
} });
const { registerEmoteIpcHandlers } = require('../.test-build/main/ipc/registerEmoteIpcHandlers.js');
test('emote catalog accepts only the trusted local main frame and bounded typed payload', async () => {
  let requests = 0;
  registerEmoteIpcHandlers({ getCatalog: async (profileId, channel) => { requests++; return { profileId, channel }; } });
  const event = { sender, senderFrame: frame };
  assert.deepEqual(await handler(event, { profileId: 'A', channel: 'channel' }), { profileId: 'A', channel: 'channel' });
  for (const request of [null, {}, { profileId: 'A', channel: '../channel' }, { profileId: 'A', channel: 'a'.repeat(65) }, { profileId: 5, channel: 'channel' }]) {
    assert.throws(() => handler(event, request), /Invalid emote/);
  }
  for (const untrusted of [
    { sender: {}, senderFrame: frame },
    { sender, senderFrame: { url: frame.url } },
  ]) assert.throws(() => handler(untrusted, { profileId: 'A', channel: 'channel' }), /Untrusted/);
  frame.url = 'https://www.twitch.tv/';
  assert.throws(() => handler(event, { profileId: 'A', channel: 'channel' }), /Untrusted/);
  assert.equal(requests, 1);
});
