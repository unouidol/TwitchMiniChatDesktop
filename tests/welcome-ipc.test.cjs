const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const handlers = new Map(); let root; let packaged = false; let version = '1.0.0-dev';
const frame = { url: 'http://localhost:5173/' };
const sender = { mainFrame: frame };
global.MAIN_WINDOW_VITE_DEV_SERVER_URL = frame.url; global.MAIN_WINDOW_VITE_NAME = 'main_window';
mock.module('electron', { cache: true, exports: {
  app: { getVersion: () => version, getPath: () => root, get isPackaged() { return packaged; }, once() {} },
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


test('packaged stable startup checks once through the real welcome IPC composition and retains cooldown', { timeout: 5000 }, async (context) => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-welcome-stable-')));
  context.after(async () => { packaged = false; version = '1.0.0-dev'; assert.equal(path.dirname(await fs.realpath(root)), await fs.realpath(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  packaged = true; version = '1.1.0';
  let fetched = 0, entered;
  const requested = new Promise((resolve) => { entered = resolve; });
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/unouidol/TwitchMiniChatDesktop/releases/latest');
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    fetched++; entered(); return new Response(null, { status: 404 });
  });
  registerWelcomeIpcHandlers();
  const event = { sender, senderFrame: frame };
  const initial = await handlers.get(ipc.WELCOME_START)(event);
  assert.equal(initial.automaticChecks, true); assert.equal(initial.startup, 'first');
  await requested;
  const checked = await handlers.get(ipc.WELCOME_CHECK)(event);
  assert.equal(checked.checkState, 'unpublished'); assert.equal(fetched, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'welcome.json'), 'utf8')).lastAttempt, checked.lastAttempt);
  const next = await handlers.get(ipc.WELCOME_START)(event);
  assert.equal(next.lastAttempt, checked.lastAttempt); assert.equal(fetched, 1);
  assert.equal(next.startup, null); assert.equal(next.automaticChecks, true);
});

test('packaged RC keeps automatic metadata checks disabled', async (context) => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-welcome-rc-')));
  context.after(async () => { packaged = false; version = '1.0.0-dev'; assert.equal(path.dirname(await fs.realpath(root)), await fs.realpath(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  packaged = true; version = '1.1.0-rc.1';
  context.mock.method(globalThis, 'fetch', async () => assert.fail('RC startup must not request release metadata'));
  registerWelcomeIpcHandlers();
  const initial = await handlers.get(ipc.WELCOME_START)({ sender, senderFrame: frame });
  assert.equal(initial.automaticChecks, false); assert.equal(initial.lastAttempt, null);
});
