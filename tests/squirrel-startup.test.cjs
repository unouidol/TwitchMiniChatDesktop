const assert = require('node:assert/strict');
const path = require('node:path');
const { test, mock } = require('node:test');
let ready = 0, quit = 0, registry = 0, windows = 0, shutdown = 0;
const events = new Map();
mock.module('electron', { cache: true, exports: { app: {
  whenReady: async () => { ready++; }, quit: () => { quit++; }, on: (name, handler) => events.set(name, handler),
  isPackaged: true, getVersion: () => '1.1.0-test',
}, BrowserWindow: { getAllWindows: () => [] } } });
const compiled = (name) => path.resolve(__dirname, '../.test-build', name);
for (const [name, exports] of Object.entries({
  'main/windows/createMainWindow.js': { createMainWindow: () => { windows++; } },
  'main/ipc/registerIpcHandlers.js': { registerIpcHandlers: async () => { registry++; return { player: {} }; } },
  'main/config/TmcRuntimeConfig.js': { TMC_RUNTIME_CONFIG: {} },
  'main/player/registerPlayerShutdown.js': { registerPlayerShutdown: () => { shutdown++; } },
})) {
  const filename = require.resolve(compiled(name));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
test('Squirrel handler owns event completion; installer events cannot boot services or request an early quit', async () => {
  const handlerFile = require.resolve(compiled('main/windows/handleSquirrelStartup.js'));
  require.cache[handlerFile] = { id: handlerFile, filename: handlerFile, loaded: true, exports: { handleSquirrelStartup: () => true } };
  require(compiled('main.js'));
  await new Promise(setImmediate);
  assert.deepEqual({ ready, quit, registry, windows, shutdown, listeners: events.size }, { ready: 0, quit: 0, registry: 0, windows: 0, shutdown: 0, listeners: 0 });
  delete require.cache[compiled('main.js')];
  require.cache[handlerFile].exports.handleSquirrelStartup = () => false;
  require(compiled('main.js'));
  await new Promise(setImmediate);
  assert.deepEqual({ ready, quit, registry, windows, shutdown }, { ready: 1, quit: 0, registry: 1, windows: 1, shutdown: 1 });
  events.get('activate')(); assert.equal(windows, 2);
});
