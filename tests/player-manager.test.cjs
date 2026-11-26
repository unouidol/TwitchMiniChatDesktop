const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const { EventEmitter } = require('node:events');
let id = 0;
let held = false;
const views = [];
const windows = [];
const partitions = new Set();
const makeStorage = () => ({ requestHandlers: 0, checkHandlers: 0,
  setPermissionRequestHandler(callback) { this.requestHandlers++; this.requestPermission = callback; },
  setPermissionCheckHandler(callback) { this.checkHandlers++; this.checkPermission = callback; },
  get cookies() { assert.fail('Player must not read cookie values'); },
  async clearStorageData() { assert.fail('Shared login must not be cleared'); },
  async clearCache() { assert.fail('PCG cache must not be cleared'); },
  async clearAuthCache() { assert.fail('Shared HTTP authentication must not be cleared'); },
  async closeAllConnections() { assert.fail('PCG connections must not be closed'); },
});
const storage = makeStorage();
const sessions = new Map([['persist:tmc-pcg-A', storage]]);
class Contents extends EventEmitter {
  id = ++id; destroyed = false; muted = false;
  setWindowOpenHandler(handler) { this.popup = handler; }
  isDestroyed() { return this.destroyed; }
  stop() { this.abort?.(new Error('Stopped')); }
  close() { if (this.destroyed) return; this.abort?.(new Error('Closed')); this.destroyed = true; this.emit('destroyed'); }
  setAudioMuted(value) { this.muted = value; }
  isAudioMuted() { return this.muted; }
  loadURL(url) { this.url = url; return held ? new Promise((resolve, reject) => { this.abort = reject; this.release = resolve; }) : Promise.resolve(); }
}
class View {
  webContents = new Contents();
  constructor(options) { this.preferences = options.webPreferences; views.push(this); }
  setBounds(value) { this.bounds = value; }
}
class Window extends EventEmitter {
  webContents = new Contents(); destroyed = false; children = new Set();
  contentView = Object.assign(new EventEmitter(), { addChildView: (view) => this.children.add(view), removeChildView: (view) => this.children.delete(view),
    getBounds: () => ({ x: 0, y: 0, width: this.contentWidth ?? this.width, height: this.contentHeight ?? this.height }) });
  constructor(options = {}) { super(); this.width = options.width || 1200; this.height = options.height || 1000; windows.push(this); }
  getContentSize() { return [this.width, this.height]; }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; this.emit('closed'); }
  setTitle() {} showInactive() {}
}
mock.module('electron', { cache: true, exports: { BrowserWindow: Window, WebContentsView: View, session: { fromPartition: (name) => {
  partitions.add(name); if (!sessions.has(name)) sessions.set(name, makeStorage()); return sessions.get(name);
} } } });
const { TmcPlayerManager } = require('../.test-build/main/player/TmcPlayerManager.js');
const { TmcTwitchWebSessions } = require('../.test-build/main/web/TmcTwitchWebSessions.js');
const webSessions = new TmcTwitchWebSessions(() => ['A', 'B']);
const createPlayer = (active, changed) => new TmcPlayerManager(active, changed, webSessions);
const a = { profileId: 'A', channel: 'channel' };
const rectangle = { x: 10, y: 10, width: 500, height: 300 };
const request = (context) => ({ ...context, mode: 'embedded', bounds: rectangle });

test('moving retains its view; closing destroys media/source without clearing the shared PCG session', async (context) => {
  const owner = new Window();
  const manager = createPlayer(() => 'A', () => {}); context.after(() => manager.close());
  assert.equal(manager.source, null);
  await manager.show(request(a), owner);
  const view = views.at(-1); const source = manager.source;
  assert.equal(view.preferences.sandbox, true); assert.equal(view.preferences.contextIsolation, true);
  assert.equal(view.preferences.nodeIntegration, false); assert.equal(view.preferences.webSecurity, true); assert.equal(view.preferences.preload, undefined);
  assert.deepEqual(view.webContents.popup(), { action: 'deny' });
  let prevented = false; view.webContents.emit('will-navigate', { preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  let permission; storage.requestPermission(null, 'camera', (value) => { permission = value; }); assert.equal(permission, false); assert.equal(storage.checkPermission(), false);
  manager.setMode(a, 'detached'); assert.equal(view.webContents.isDestroyed(), false);
  manager.setMode(a, 'embedded'); assert.equal(owner.children.has(view), true);
  manager.layout(a, null, owner); assert.equal(view.webContents.isAudioMuted(), true); assert.equal(view.bounds.width, 0);
  manager.layout(a, rectangle, owner); assert.equal(view.webContents.isAudioMuted(), false);
  await manager.close(a);
  assert.equal(view.webContents.isDestroyed(), true); assert.equal(manager.source, null); assert.equal(owner.children.size, 0);
  await assert.rejects(fetch(`${source.origin}${source.pathname}?channel=channel`, { signal: AbortSignal.timeout(1000) }), /fetch failed/);
  assert.deepEqual([...partitions], ['persist:tmc-pcg-A']);
  assert.equal(view.preferences.session, webSessions.get('A'));
  assert.equal(storage.requestHandlers, 1); assert.equal(storage.checkHandlers, 1);
});

for (const action of ['embed', 'native-close']) test(`detached playback follows menu/content layout without an outer resize and cleans its observer on ${action}`, async (context) => {
  const owner = new Window();
  const manager = createPlayer(() => 'A', () => {}); context.after(() => manager.close());
  await manager.show({ ...request(a), mode: 'detached' }, owner);
  const detached = windows.at(-1), root = detached.contentView, view = views.at(-1);
  const original = detached.getContentSize();
  assert.equal(root.listenerCount('bounds-changed'), 1);
  detached.contentHeight = detached.height - 26;
  root.emit('bounds-changed');
  assert.deepEqual(view.bounds, root.getBounds(), 'Menu layout must not leave the bottom of the video outside its parent');
  assert.deepEqual(detached.getContentSize(), original, 'No outer-window resize was emitted');
  if (action === 'embed') manager.setMode(a, 'embedded');
  else { detached.destroy(); await manager.close(); }
  assert.equal(root.listenerCount('bounds-changed'), 0);
  const bounds = view.bounds;
  root.emit('bounds-changed');
  assert.deepEqual(view.bounds, bounds, 'Retired layout events cannot alter playback');
});

test('modal occlusion applied before creation stays effective through loading and can restore the same view', async (context) => {
  const manager = createPlayer(() => 'A', () => {}); context.after(() => manager.close());
  const owner = new Window(); manager.occlude(true, owner);
  await manager.show(request(a), owner); const view = views.at(-1);
  assert.equal(view.bounds.width, 0); assert.equal(view.webContents.isAudioMuted(), true);
  manager.occlude(false, owner);
  assert.equal(view.bounds.width, rectangle.width); assert.equal(view.webContents.isAudioMuted(), false);
});

test('account replacement uses distinct web storage and reopening A retains its original session', async (context) => {
  let active = 'A';
  const manager = createPlayer(() => active, () => {}); context.after(() => manager.close());
  const owner = new Window();
  await manager.show(request(a), owner);
  const first = views.at(-1), storedA = first.preferences.session;
  assert.equal(storedA, webSessions.get('A'));
  active = 'B'; await manager.show(request({ profileId: 'B', channel: 'other' }), owner);
  assert.equal(first.webContents.isDestroyed(), true);
  assert.equal(views.at(-1).preferences.session, webSessions.get('B'));
  assert.notEqual(views.at(-1).preferences.session, storedA);
  await manager.close();
  active = 'A'; await manager.show(request(a), owner);
  assert.equal(views.at(-1).preferences.session, storedA);
  assert.equal(storedA.requestHandlers, 1, 'Reopening media never overwrites shared permission handlers');
});

test('latest pending context can be cancelled before creation and stale close cannot cancel a newer account', async (context) => {
  let active = 'A'; const manager = createPlayer(() => active, () => {}); context.after(() => manager.close());
  const owner = new Window(); await manager.show(request(a), owner); const old = views.at(-1);
  const b = { profileId: 'B', channel: 'other' }; active = 'B';
  const opening = manager.show(request(b), owner);
  assert.throws(() => manager.close(a), /context changed/);
  const closing = manager.close(b);
  await assert.rejects(opening, /superseded/); await closing;
  assert.equal(old.webContents.isDestroyed(), true); assert.equal(manager.source, null); assert.equal(manager.getStatus().state, 'closed');
  await manager.show(request(b), owner);
  assert.deepEqual([...partitions], ['persist:tmc-pcg-A', 'persist:tmc-pcg-B']);
});

test('owner document reload closes media; its window-owned watcher ignores frame and same-document navigation', async (context) => {
  const manager = createPlayer(() => 'A', () => {}); context.after(() => manager.close());
  const owner = new Window(); await manager.show(request(a), owner);
  const view = views.at(-1), source = manager.source;
  owner.webContents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
  owner.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
  assert.equal(view.webContents.isDestroyed(), false);
  manager.occlude(true, owner);
  owner.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  assert.equal(view.webContents.isDestroyed(), true);
  await manager.close();
  assert.equal(manager.source, null); assert.equal(owner.webContents.listenerCount('did-start-navigation'), 1);
  await assert.rejects(fetch(`${source.origin}${source.pathname}?channel=channel`, { signal: AbortSignal.timeout(1000) }), /fetch failed/);
  manager.occlude(false, owner); await manager.show(request(a), owner);
  assert.equal(views.at(-1).bounds.width, rectangle.width);
  owner.destroy(); await manager.close();
  assert.equal(owner.webContents.listenerCount('did-start-navigation'), 0);
});

test('reload rejects an open queued behind previous media cleanup before it creates media', async (context) => {
  const manager = createPlayer(() => 'A', () => {}); context.after(() => manager.close());
  const owner = new Window(); await manager.show(request(a), owner);
  let release, entered;
  const blocked = new Promise((resolve) => { entered = resolve; });
  const contents = views.at(-1).webContents;
  const originalClose = contents.close.bind(contents);
  context.mock.method(contents, 'close', () => { release = originalClose; entered(); });
  const closing = manager.close(); await blocked;
  const count = views.length;
  const opening = manager.show(request(a), owner);
  const rejected = assert.rejects(opening, /superseded/);
  owner.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  context.mock.restoreAll(); release();
  await closing; await rejected; await manager.close();
  assert.equal(views.length, count); assert.equal(manager.source, null); assert.equal(manager.getStatus().state, 'closed');
  owner.destroy();
});

test('teardown uses its captured WebContents even when native view destruction removes the getter', async (context) => {
  const manager = createPlayer(() => 'A', () => {}); context.after(() => manager.close());
  const owner = new Window(); await manager.show(request(a), owner);
  const view = views.at(-1), contents = view.webContents;
  delete view.webContents;
  await manager.close(a);
  assert.equal(contents.isDestroyed(), true); assert.equal(manager.source, null); assert.equal(manager.getStatus().state, 'closed');
});

test('an account change during actual source creation rejects stale work and leaves no source/view behind', async (context) => {
  const { Server } = require('node:http');
  const realListen = Server.prototype.listen;
  const servers = [];
  context.mock.method(Server.prototype, 'listen', function (...args) { servers.push(this); return Reflect.apply(realListen, this, args); });
  let reads = 0;
  const manager = createPlayer(() => ++reads >= 3 ? 'B' : 'A', () => {}); context.after(() => manager.close());
  const pending = manager.show(request(a), new Window());
  await assert.rejects(pending, /superseded/);
  assert.equal(manager.source, null);
  assert.equal(servers.length, 1); assert.equal(servers[0].listening, false);
});

test('a bounded load failure destroys the view/server and preserves a useful cause without publishing a ready state', async (context) => {
  let deadline; held = true; context.after(() => { held = false; });
  const realTimeout = global.setTimeout;
  context.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    if (delay === 15000) { deadline = callback; return 0; }
    return realTimeout(callback, delay);
  });
  const manager = createPlayer(() => 'A', () => {}); context.after(() => manager.close());
  const pending = manager.show(request(a), new Window());
  const rejected = assert.rejects(pending, (error) => error.message === 'Could not load the player.' && error.cause.message === 'Player load timed out.');
  while (!deadline) await new Promise(setImmediate);
  deadline(); await rejected;
  assert.equal(views.at(-1).webContents.isDestroyed(), true); assert.equal(manager.source, null); assert.equal(manager.getStatus().state, 'error');
});
