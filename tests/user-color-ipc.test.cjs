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
const { registerUserColorIpcHandlers } = require('../.test-build/main/ipc/registerUserColorIpcHandlers.js');
test('color IPC accepts only trusted local main frame, bounded profile/channel and 100 valid logins', async () => {
  const calls = [];
  registerUserColorIpcHandlers({ getColors: async (request) => { calls.push(request); return request; } });
  const event = { sender, senderFrame: frame };
  const request = { profileId: 'A', channel: 'channel', usernames: ['bot_red'] };
  assert.deepEqual(await handler(event, request), request);
  for (const invalid of [null, {}, { ...request, profileId: '' }, { ...request, channel: '../bad' },
    { ...request, usernames: ['BadName'] }, { ...request, usernames: Array(101).fill('bot_red') }, { ...request, usernames: [12] }]) {
    assert.throws(() => handler(event, invalid), /Invalid user color/);
  }
  assert.throws(() => handler({ sender, senderFrame: { url: frame.url } }, request), /Untrusted/);
  frame.url = 'https://www.twitch.tv/';
  assert.throws(() => handler(event, request), /Untrusted/);
  assert.equal(calls.length, 1);
});
