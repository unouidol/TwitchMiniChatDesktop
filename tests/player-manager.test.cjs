const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const { EventEmitter } = require('node:events');
let id = 0;
let held = false;
const views = [];
const partitions = new Set();
const storage = { clears: 0, setPermissionRequestHandler(callback) { this.requestPermission = callback; }, setPermissionCheckHandler(callback) { this.checkPermission = callback; },
  async clearStorageData() { this.clears++; }, async clearCache() {}, async clearAuthCache() {}, async closeAllConnections() {} };
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
  contentView = { addChildView: (view) => this.children.add(view), removeChildView: (view) => this.children.delete(view) };
  constructor(options = {}) { super(); this.width = options.width || 1200; this.height = options.height || 1000; }
  getContentSize() { return [this.width, this.height]; }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; this.emit('closed'); }
  setTitle() {} showInactive() {}
}
mock.module('electron', { cache: true, exports: { BrowserWindow: Window, WebContentsView: View, session: { fromPartition: (name) => { partitions.add(name); return storage; } } } });
const { TmcPlayerManager } = require('../.test-build/main/player/TmcPlayerManager.js');
const a = { profileId: 'A', channel: 'channel' };
const rectangle = { x: 10, y: 10, width: 500, height: 300 };
const request = (context) => ({ ...context, mode: 'embedded', bounds: rectangle });

test('moving playback retains its view while close destroys media, closes the actual loopback source and clears only the dedicated memory session', async (context) => {
  const owner = new Window();
  const manager = new TmcPlayerManager(() => 'A', () => {}); context.after(() => manager.close());
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
  assert.deepEqual([...partitions], ['tmc-anonymous-live-player']); assert.ok(storage.clears > 0);
});

test('modal occlusion applied before creation stays effective through loading and can restore the same view', async (context) => {
  const manager = new TmcPlayerManager(() => 'A', () => {}); context.after(() => manager.close());
  const owner = new Window(); manager.occlude(true, owner);
  await manager.show(request(a), owner); const view = views.at(-1);
  assert.equal(view.bounds.width, 0); assert.equal(view.webContents.isAudioMuted(), true);
  manager.occlude(false, owner);
  assert.equal(view.bounds.width, rectangle.width); assert.equal(view.webContents.isAudioMuted(), false);
});

test('latest pending context can be cancelled before creation and stale close cannot cancel a newer account', async (context) => {
  let active = 'A'; const manager = new TmcPlayerManager(() => active, () => {}); context.after(() => manager.close());
  const owner = new Window(); await manager.show(request(a), owner); const old = views.at(-1);
  const b = { profileId: 'B', channel: 'other' }; active = 'B';
  const opening = manager.show(request(b), owner);
  assert.throws(() => manager.close(a), /context changed/);
  const closing = manager.close(b);
  await assert.rejects(opening, /superseded/); await closing;
  assert.equal(old.webContents.isDestroyed(), true); assert.equal(manager.source, null); assert.equal(manager.getStatus().state, 'closed');
  await manager.show(request(b), owner);
  assert.deepEqual([...partitions], ['tmc-anonymous-live-player']);
});

test('teardown uses its captured WebContents even when native view destruction removes the getter', async (context) => {
  const manager = new TmcPlayerManager(() => 'A', () => {}); context.after(() => manager.close());
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
  const manager = new TmcPlayerManager(() => ++reads >= 3 ? 'B' : 'A', () => {}); context.after(() => manager.close());
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
  const manager = new TmcPlayerManager(() => 'A', () => {}); context.after(() => manager.close());
  const pending = manager.show(request(a), new Window());
  const rejected = assert.rejects(pending, (error) => error.message === 'Could not load the player.' && error.cause.message === 'Player load timed out.');
  while (!deadline) await new Promise(setImmediate);
  deadline(); await rejected;
  assert.equal(views.at(-1).webContents.isDestroyed(), true); assert.equal(manager.source, null); assert.equal(manager.getStatus().state, 'error');
});
