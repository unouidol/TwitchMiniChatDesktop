const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
let handler;
const frame = { url: 'http://localhost:5173/' };
const sender = { mainFrame: frame };
global.MAIN_WINDOW_VITE_DEV_SERVER_URL = frame.url;
global.MAIN_WINDOW_VITE_NAME = 'main_window';
mock.module('electron', { cache: true, exports: { ipcMain: { handle: (_name, value) => { handler = value; } },
  BrowserWindow: { fromWebContents: (contents) => contents === sender ? { webContents: sender } : null } } });
const { registerBadgeIpcHandlers } = require('../.test-build/main/ipc/registerBadgeIpcHandlers.js');

test('badge IPC rejects malformed payloads and remote/subframes before reaching the main owner', async () => {
  let calls = 0;
  registerBadgeIpcHandlers({ getCatalog: async (value) => { calls++; return value; } });
  const event = { sender, senderFrame: frame };
  for (const invalid of [null, {}, { profileId: '', channel: 'channel' }, { profileId: 'A', channel: '../bad' }]) assert.throws(() => handler(event, invalid), /Invalid/);
  assert.throws(() => handler({ sender, senderFrame: { url: frame.url } }, { profileId: 'A', channel: 'channel' }), /Untrusted/);
  assert.equal(calls, 0);
  assert.deepEqual(await handler(event, { profileId: 'A', channel: 'channel' }), { profileId: 'A', channel: 'channel' });
});
