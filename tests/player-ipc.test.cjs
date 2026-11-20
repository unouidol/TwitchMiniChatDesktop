const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const handlers = new Map();
const frame = { url: 'http://localhost:5173/' };
const sender = { mainFrame: frame };
const window = { getContentSize: () => [1000, 800] };
global.MAIN_WINDOW_VITE_DEV_SERVER_URL = frame.url; global.MAIN_WINDOW_VITE_NAME = 'main_window';
mock.module('electron', { cache: true, exports: { ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  BrowserWindow: { fromWebContents: (value) => value === sender ? { ...window, webContents: sender } : null } } });
const { registerPlayerIpcHandlers } = require('../.test-build/main/ipc/registerPlayerIpcHandlers.js');
const { TMC_IPC_CHANNELS: ipc } = require('../.test-build/shared/ipc/IpcChannels.js');

test('player bridge rejects foreign frames, malformed context, unsafe bounds and occlusion payloads before the owner runs', async () => {
  let calls = 0;
  registerPlayerIpcHandlers({ getStatus: () => { calls++; }, show: async (value) => { calls++; return value; }, occlude: () => { calls++; } });
  const event = { sender, senderFrame: frame };
  const request = { profileId: 'A', channel: 'channel', mode: 'embedded', bounds: { x: 0, y: 0, width: 500, height: 300 } };
  for (const invalid of [null, {}, { ...request, channel: '../bad' }, { ...request, bounds: null }, { ...request, bounds: { x: 0, y: 0, width: 399, height: 300 } },
    { ...request, bounds: { x: 900, y: 0, width: 500, height: 300 } }, { ...request, bounds: { x: NaN, y: 0, width: 500, height: 300 } }, { ...request, mode: 'unknown' }]) assert.throws(() => handlers.get(ipc.PLAYER_OPEN)(event, invalid));
  assert.throws(() => handlers.get(ipc.PLAYER_OPEN)({ sender, senderFrame: { url: frame.url } }, request), /Untrusted/);
  assert.throws(() => handlers.get(ipc.PLAYER_OCCLUDE)(event, { hidden: 'true' }), /Invalid/);
  assert.equal(calls, 0);
  assert.deepEqual(await handlers.get(ipc.PLAYER_OPEN)(event, request), request);
  assert.equal(calls, 1);
});
