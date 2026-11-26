const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const handlers = new Map();
const frame = { url: 'http://localhost:5173/' }; const sender = { mainFrame: frame };
global.MAIN_WINDOW_VITE_DEV_SERVER_URL = frame.url; global.MAIN_WINDOW_VITE_NAME = 'main_window';
mock.module('electron', { cache: true, exports: {
  ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  BrowserWindow: { fromWebContents: (contents) => contents === sender ? { webContents: sender } : null },
} });
const { registerAccountChannelIpcHandlers } = require('../.test-build/main/ipc/registerAccountChannelIpcHandlers.js');
const { TMC_IPC_CHANNELS: channels } = require('../.test-build/shared/ipc/IpcChannels.js');
const event = { sender, senderFrame: frame };
const request = { profileId: 'A', channel: '#Alpha' };
function setup() {
  let active = 'A'; const calls = []; let finish = async (profileId, channel) => ({ profileId, lastChannel: channel });
  const operation = async (profileId, channel) => { calls.push([profileId, channel]); return finish(profileId, channel); };
  registerAccountChannelIpcHandlers({ getActiveSession: () => active ? { profileId: active } : null }, {
    getState: (profileId) => operation(profileId, null), setLastChannel: operation,
    addRecentChannel: operation, toggleFavoriteChannel: operation,
  });
  return { calls, select: (id) => { active = id; }, hold: (fn) => { finish = fn; } };
}
const mutations = [channels.ACCOUNT_CHANNELS_SET_LAST, channels.ACCOUNT_CHANNELS_ADD_RECENT, channels.ACCOUNT_CHANNELS_TOGGLE_FAVORITE];
test('channel IPC rejects foreign senders, invalid input and initiating-account mismatch before storage', async () => {
  const { calls } = setup();
  for (const name of mutations) {
    const handler = handlers.get(name);
    for (const value of [null, {}, { channel: 'alpha' }, { ...request, profileId: 'B' }, { ...request, channel: '../bad' }]) {
      await assert.rejects(handler(event, value));
    }
    await assert.rejects(handler({ sender, senderFrame: { url: frame.url } }, request), /Untrusted/);
    frame.url = 'https://www.twitch.tv/';
    await assert.rejects(handler(event, request), /Untrusted/); frame.url = global.MAIN_WINDOW_VITE_DEV_SERVER_URL;
  }
  await assert.rejects(handlers.get(channels.ACCOUNT_CHANNELS_GET_ACTIVE_STATE)({ sender, senderFrame: { url: frame.url } }), /Untrusted/);
  assert.equal(calls.length, 0);
});
test('channel IPC carries accepted account identity and rejects stale completion without routing to B', async () => {
  for (const name of [...mutations, channels.ACCOUNT_CHANNELS_GET_ACTIVE_STATE]) {
    const state = setup(); let release;
    state.hold((profileId, channel) => new Promise((resolve) => { release = () => resolve({ profileId, lastChannel: channel }); }));
    const pending = handlers.get(name)(event, request);
    state.select('B'); release();
    await assert.rejects(pending, /account changed/);
    assert.equal(state.calls[0][0], 'A'); assert.equal(state.calls.length, 1);
  }
});
test('valid channel operations use normalized input and explicit current guest identity', async () => {
  const state = setup();
  for (const name of mutations) assert.equal((await handlers.get(name)(event, request)).state.profileId, 'A');
  assert.deepEqual(state.calls, [['A', 'alpha'], ['A', 'alpha'], ['A', 'alpha']]);
  state.select(null);
  assert.equal((await handlers.get(mutations[0])(event, { profileId: '__guest__', channel: 'alpha' })).state.profileId, '__guest__');
});
