const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const exits = [], commands = [];
let child;
mock.module('electron', { cache: true, exports: { app: { exit: (code) => exits.push(code) } } });
mock.module('node:child_process', { cache: true, exports: { spawn: (binary, args, options) => {
  child = new EventEmitter(); child.kill = () => { child.killed = true; return true; };
  commands.push({ binary, args, options }); return child;
} } });
const { handleSquirrelStartup } = require('../.test-build/main/windows/handleSquirrelStartup.js');
const executable = path.resolve('fixture-root/app-version/TMC-desktop.exe');
test('recognized installer events wait for updater exit, explicitly manage Desktop/StartMenu and never start normal application', () => {
  for (const event of ['install', 'updated', 'uninstall']) {
    const before = exits.length;
    assert.equal(handleSquirrelStartup('win32', [`--squirrel-${event}`], executable), true);
    assert.equal(exits.length, before);
    assert.deepEqual(commands.at(-1), { binary: path.resolve('fixture-root/Update.exe'),
      args: [`--${event === 'uninstall' ? 'remove' : 'create'}Shortcut=TMC-desktop.exe`, '--shortcut-locations=Desktop,StartMenu'],
      options: { windowsHide: true, stdio: 'ignore' } });
    child.emit('exit', 0); assert.equal(exits.at(-1), 0);
  }
  const before = commands.length;
  assert.equal(handleSquirrelStartup('win32', ['--squirrel-obsolete'], executable), true);
  assert.equal(commands.length, before); assert.equal(exits.at(-1), 0);
  for (const args of [[], ['--squirrel-firstrun'], ['--channel=example']]) assert.equal(handleSquirrelStartup('win32', args, executable), false);
  assert.equal(handleSquirrelStartup('linux', ['--squirrel-install'], executable), false);
});
test('spawn and nonzero-exit failures produce one non-success exit, with owned timers cleared', () => {
  handleSquirrelStartup('win32', ['--squirrel-install'], executable);
  const before = exits.length;
  child.emit('error', new Error('Controlled spawn failure')); child.emit('exit', 1);
  assert.equal(exits.length, before + 1); assert.equal(exits.at(-1), 1);
  handleSquirrelStartup('win32', ['--squirrel-updated'], executable);
  child.emit('exit', 7); assert.equal(exits.at(-1), 1);
});
test('stalled updater is terminated at the deadline and never reported as success', (context) => {
  let deadline;
  context.mock.method(globalThis, 'setTimeout', (callback, delay) => { assert.equal(delay, 10000); deadline = callback; return 0; });
  handleSquirrelStartup('win32', ['--squirrel-install'], executable);
  deadline(); assert.equal(child.killed, true); assert.equal(exits.at(-1), 1);
});
