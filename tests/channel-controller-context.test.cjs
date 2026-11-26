const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TmcChannelChatController } = require('../.test-build/renderer/chat/TmcChannelChatController.js');
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function setup(context) {
  const calls = { recent: [], history: [], rendered: [], opened: [], errors: [] };
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  globalThis.window = new EventTarget();
  globalThis.document = { querySelector: (selector) => selector === '#chatChannelLabel' ? {} : selector === '#chatList' ? { replaceChildren() {} } : null };
  context.after(() => { globalThis.document = oldDocument; globalThis.window = oldWindow; });
  const controller = Object.create(TmcChannelChatController.prototype);
  Object.assign(controller, {
    generation: 0, currentChannel: 'alpha', activeChannelState: { profileId: 'A' },
    completionUsers: new Set(), renderedMessageKeys: [], renderedMessageKeySet: new Set(), scrollController: null,
    nameColorController: { reset() {} }, badgeController: { reset() {} }, searchController: { reset() {} },
    resetMentions() {}, setChannelInput() {}, updateFavoriteToggleButton() {}, setRefreshDisabled() {},
    holdPcgSessionForChannelChange: async () => {}, readCurrentChannel: () => controller.currentChannel,
    appendLocalMessage: (author, text) => { if (author === 'error') calls.errors.push(text); },
    renderAccountChannelState: (state) => calls.rendered.push(state),
    tmc: { accounts: { getActive: async () => ({ isLoggedIn: true, activeProfileId: 'A' }) },
      accountChannels: { setLast: async () => {}, addRecent: async (request) => { calls.recent.push(request); return { state: { profileId: 'B' } }; } },
      backend: { loadHistory: async (request) => { calls.history.push(request); throw new Error('Unexpected history load'); } },
      chat: { getStatus: async () => ({ state: 'disconnected' }) },
    },
  });
  return { controller, calls };
}
test('a held A channel write cannot issue recent/history requests after selection changes to B', async (context) => {
  const { controller, calls } = setup(context); const entered = deferred(), gate = deferred(); let initiating;
  controller.tmc.accountChannels.setLast = async (request) => { initiating = request; entered.resolve(); await gate.promise; };
  const loading = controller.switchToChannel('alpha'); await entered.promise;
  controller.generation++; controller.activeChannelState = { profileId: 'B' }; controller.currentChannel = 'beta';
  gate.resolve(); await loading;
  assert.deepEqual(initiating, { profileId: 'A', channel: 'alpha' });
  assert.deepEqual(calls.recent, []); assert.deepEqual(calls.history, []); assert.deepEqual(calls.rendered, []);
});
test('a delayed A favorite result never replaces B sidebar state', async (context) => {
  const { controller, calls } = setup(context); const gate = deferred(); let initiating;
  controller.tmc.accountChannels.toggleFavorite = (request) => { initiating = request; return gate.promise; };
  const pending = controller.toggleFavoriteForCurrentChannel();
  controller.generation++; controller.activeChannelState = { profileId: 'B' }; controller.currentChannel = 'beta';
  gate.resolve({ state: { profileId: 'A', favoriteChannels: ['alpha'] } }); await pending;
  assert.deepEqual(initiating, { profileId: 'A', channel: 'alpha' }); assert.deepEqual(calls.rendered, []);
});
test('a delayed channel-state read cannot reopen A channel after the account changed', async (context) => {
  const { controller, calls } = setup(context); const gate = deferred();
  controller.tmc.accountChannels.getActiveState = () => gate.promise;
  controller.switchToChannel = async (channel) => calls.opened.push(channel);
  const pending = controller.switchToActiveAccountChannel();
  controller.generation++; controller.activeChannelState = { profileId: 'B' };
  gate.resolve({ state: { profileId: 'A', lastChannel: 'alpha' } }); await pending;
  assert.deepEqual(calls.rendered, []); assert.deepEqual(calls.opened, []);
});
test('a failed active channel-state read is reported without an unhandled reconnect rejection', async (context) => {
  const { controller, calls } = setup(context);
  controller.tmc.accountChannels.getActiveState = async () => { throw new Error('read blocked'); };
  await controller.reconnectCurrentChannelAfterAccountChange();
  assert.deepEqual(calls.errors, ['read blocked']); assert.deepEqual(calls.history, []);
});
