const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// Every invoke handler must refuse senders other than the local main frame, and
// do so before any other work. Enumerating registered handlers means a handler
// added later without a sender check fails here, not in a review.

let userDataPath;
const handlers = new Map();
const mainFrame = { url: 'http://localhost:5173/' };
const sender = { mainFrame, isDestroyed: () => false, send: () => undefined };
const remoteContents = { mainFrame: { url: 'https://www.twitch.tv/' }, isDestroyed: () => false, send: () => undefined };

global.MAIN_WINDOW_VITE_DEV_SERVER_URL = mainFrame.url;
global.MAIN_WINDOW_VITE_NAME = 'main_window';
global.WebSocket = class {
  constructor() { throw new Error('Unexpected WebSocket access in sender-validation tests'); }
};

mock.module('electron', {
  cache: true,
  exports: {
    app: { getPath: () => userDataPath, getVersion: () => '1.1.1-test', isPackaged: false, once() {} },
    ipcMain: {
      handle: (channel, handler) => {
        assert.equal(handlers.has(channel), false, `Duplicate handler: ${channel}`);
        handlers.set(channel, handler);
      },
    },
    session: { fromPartition: () => { throw new Error('Unexpected web session access'); } },
    shell: { openExternal: async () => { throw new Error('Unexpected external open'); } },
    BrowserWindow: {
      getAllWindows: () => [],
      fromWebContents: (contents) => contents === sender ? { webContents: sender } : null,
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString(),
    },
  },
});

const { registerIpcHandlers } = require('../.test-build/main/ipc/registerIpcHandlers.js');

const untrustedSenders = [
  ['a remote page in another WebContents', { sender: remoteContents, senderFrame: remoteContents.mainFrame }],
  ['a subframe of the main window', { sender, senderFrame: { url: 'https://www.twitch.tv/embed' } }],
  ['the main window showing another URL', { sender, senderFrame: { url: 'https://www.twitch.tv/' } }],
];

test('every registered IPC handler rejects untrusted senders before doing any work', async (context) => {
  userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-ipc-senders-'));
  context.after(() => fs.rm(userDataPath, { recursive: true, force: true }));
  context.mock.method(globalThis, 'fetch', async (url) => { throw new Error(`Unexpected external call ${url}`); });

  await registerIpcHandlers({
    backendBaseUrl: 'https://backend.invalid',
    desktopClientId: 'test-client',
    desktopClientVersion: 'test',
    desktopFlavor: 'test',
    defaultHistorySeconds: 60,
    oauthFinalizeUrl: 'https://backend.invalid/finalize',
    oauthDesktopRestoreUrl: 'https://backend.invalid/restore',
    oauthDesktopLogoutUrl: 'https://backend.invalid/logout',
    oauthReturnScheme: 'desktop-claim',
  });

  assert.ok(handlers.size > 40, `Expected the full handler set, registered ${handlers.size}`);
  const unprotected = [];
  for (const [channel, handler] of handlers) {
    for (const [label, event] of untrustedSenders) {
      try {
        // Payloads are deliberately invalid: the sender check must come first.
        await handler(event, { profileId: 'A', channel: 'c', url: 'https://example.test/' });
        unprotected.push(`${channel} (${label}): accepted`);
      } catch (error) {
        if (!/Untrusted/.test(String(error && error.message))) {
          unprotected.push(`${channel} (${label}): ${error && error.message}`);
        }
      }
    }
  }
  assert.deepEqual(unprotected, []);
});
