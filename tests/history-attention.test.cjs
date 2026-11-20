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
const { registerBackendIpcHandlers } = require('../.test-build/main/ipc/registerBackendIpcHandlers.js');
const config = { backendBaseUrl: 'https://backend.invalid', desktopClientId: 'synthetic', desktopClientVersion: 'test' };
const event = { sender, senderFrame: frame };
const request = { channel: 'channel', seconds: 60 };
const session = (id) => ({ profileId: id, username: id === 'A' ? 'alice' : 'bob', userId: id, accessToken: `synthetic-access-${id}` });
const history = () => new Response(JSON.stringify([{ id: 'history', user: 'other', text: 'Hello @alice', ts: 1000 }]));

test('history attention belongs to the initiating account and is recomputed from safe normalized messages', async (context) => {
  let active = session('A');
  context.mock.method(globalThis, 'fetch', async () => history());
  registerBackendIpcHandlers(config, { getSession: () => ({ desktopSessionToken: 'synthetic-desktop' }) }, { getActiveSession: () => active });
  const first = await handler(event, request);
  assert.deepEqual(first.messages[0].attention, { profileId: 'A', kind: 'mention' });
  assert.doesNotMatch(JSON.stringify(first), /synthetic-access|desktopSessionToken/);
  active = session('B');
  assert.equal((await handler(event, request)).messages[0].attention, undefined);
});

test('history load rejects a completion after selection/token change instead of returning old attention', async (context) => {
  let active = session('A');
  let release;
  context.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { release = resolve; }));
  registerBackendIpcHandlers(config, { getSession: () => ({ desktopSessionToken: 'synthetic-desktop' }) }, { getActiveSession: () => active });
  const loading = handler(event, request);
  active = session('B');
  release(history());
  await assert.rejects(loading, /account changed/);
  active = session('A');
  const rotated = handler(event, request);
  active = { ...active, accessToken: 'synthetic-rotated' };
  release(history());
  await assert.rejects(rotated, /account changed/);
});

test('history sender/payload validation rejects foreign frames and malformed input before fetch', async (context) => {
  let fetched = false;
  context.mock.method(globalThis, 'fetch', async () => { fetched = true; return history(); });
  registerBackendIpcHandlers(config, { getSession: () => ({ desktopSessionToken: 'synthetic-desktop' }) }, { getActiveSession: () => session('A') });
  for (const invalid of [null, {}, { ...request, channel: '../bad' }, { ...request, seconds: '60' }, { ...request, seconds: NaN }]) {
    await assert.rejects(handler(event, invalid), /Invalid history/);
  }
  await assert.rejects(handler({ sender, senderFrame: { url: frame.url } }, request), /Untrusted/);
  frame.url = 'https://www.twitch.tv/';
  await assert.rejects(handler(event, request), /Untrusted/);
  frame.url = global.MAIN_WINDOW_VITE_DEV_SERVER_URL;
  assert.equal(fetched, false);
});
