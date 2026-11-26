const assert = require('node:assert/strict');
const { test } = require('node:test');
const { initializeWelcome } = require('../.test-build/renderer/welcome/initializeWelcome.js');
const { TMC_LOCAL_DIALOG_CHANGED_EVENT } = require('../.test-build/renderer/dialogs/TmcLocalDialog.js');
class Element extends EventTarget {
  dataset = {}; hidden = false; open = false; textContent = '';
  focus() {} querySelectorAll() { return []; } showModal() { this.open = true; }
}
test('a failed startup modal attempt makes no automatic retry loop and restores native visibility through its event', async (context) => {
  const elements = new Map(['dialog', 'open', 'close', 'check', 'download', 'status', 'version', 'error'].map((name) => [`[data-tmc-welcome-${name}]`, new Element()]));
  const eventWindow = new EventTarget();
  globalThis.window = eventWindow;
  globalThis.document = { querySelector: (selector) => elements.get(selector) || null };
  context.after(() => { delete globalThis.window; delete globalThis.document; });
  let attempts = 0, changed = 0;
  eventWindow.addEventListener(TMC_LOCAL_DIALOG_CHANGED_EVENT, () => changed++);
  const snapshot = { sequence: 1, installedVersion: '1.0.0', automaticChecks: false, availableVersion: null, downloadUrl: null,
    checkState: 'never', lastAttempt: null, startup: 'first' };
  const api = { welcome: { start: async () => snapshot, onChanged: () => () => {}, getState: async () => snapshot },
    pcg: { hideView: async () => { attempts++; throw new Error('Native view unavailable'); } }, player: { occlude: async () => {} } };
  const owner = initializeWelcome(api); context.after(() => owner.dispose());
  await new Promise(setImmediate); await new Promise(setImmediate);
  assert.equal(attempts, 1); assert.equal(changed, 1);
  assert.equal(elements.get('[data-tmc-welcome-error]').hidden, false);
  eventWindow.dispatchEvent(new Event(TMC_LOCAL_DIALOG_CHANGED_EVENT)); await new Promise(setImmediate);
  assert.equal(attempts, 1, 'Failed startup is consumed; only the menu may retry');
});
