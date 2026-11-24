const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const handlers = new Map(); let root;
const frame = { url: 'http://localhost:5173/' };
const sender = { mainFrame: frame };
global.MAIN_WINDOW_VITE_DEV_SERVER_URL = frame.url; global.MAIN_WINDOW_VITE_NAME = 'main_window';
mock.module('electron', { cache: true, exports: {
  app: { getVersion: () => '1.0.0-dev', getPath: () => root, isPackaged: false, once() {} },
  ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  BrowserWindow: { fromWebContents: (value) => value === sender ? { webContents: sender } : null, getAllWindows: () => [] },
} });
const { registerWelcomeIpcHandlers } = require('../.test-build/main/ipc/registerWelcomeIpcHandlers.js');
const { TMC_IPC_CHANNELS: ipc } = require('../.test-build/shared/ipc/IpcChannels.js');
test('welcome bridge rejects foreign frames before storage or release checks', async (context) => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-welcome-ipc-')); context.after(() => fs.rm(root, { recursive: true, force: true }));
  registerWelcomeIpcHandlers();
  for (const name of [ipc.WELCOME_START, ipc.WELCOME_GET, ipc.WELCOME_CHECK]) {
    assert.throws(() => handlers.get(name)({ sender, senderFrame: { url: frame.url } }), /Untrusted/);
  }
  assert.deepEqual(await fs.readdir(root), []);
  const initial = await handlers.get(ipc.WELCOME_START)({ sender, senderFrame: frame });
  assert.equal(initial.startup, 'first'); assert.equal(initial.automaticChecks, false); assert.equal(initial.lastAttempt, null);
});
