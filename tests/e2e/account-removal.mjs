import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'vite';
import { remote } from 'webdriverio';
import { startFixture } from './fixture.mjs';
import { observeDriverTraffic, provenance, verifyDriver } from './driver.mjs';
import { verifyNetworkEvidence } from './network-evidence.mjs';
import { createCanonicalTemporaryDirectory, finalizeAccountRemoval, trackOwnedDrivers } from './finalize.mjs';

const require = createRequire(import.meta.url);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(project, '.test-build/electron-e2e');
const root = await createCanonicalTemporaryDirectory('tmc-electron-e2e-');
const evidence = path.join(output, `evidence-${path.basename(root)}`);
let browser;
let fixture;
const processes = new Set();
const driverPath = process.env.TMC_E2E_DRIVER_PATH;
const electronPath = require('electron');
const cacheDir = path.join(root, 'wdio-cache');
const traffic = observeDriverTraffic();
const driverTracking = trackOwnedDrivers(driverPath, evidence);
const inheritedRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
delete process.env.ELECTRON_RUN_AS_NODE;
let scenarioError;
let result;

async function waitFor(predicate, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${message}`);
}

async function readReport(phase) {
  const report = path.join(root, `${phase}.json`);
  await waitFor(async () => {
    try { await fs.access(report); return true; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return false;
    }
  }, `real Electron bootstrap report (${phase})`);
  const value = JSON.parse(await fs.readFile(report, 'utf8'));
  processes.add(value.pid);
  assert.equal(value.profile, path.join(root, 'profile'));
  assert.equal(value.encryptionAvailable, true);
  await fs.copyFile(report, path.join(evidence, `${phase}.json`));
  return value;
}

async function options() {
  return browser.execute(`
    const select = document.querySelector('[data-tmc-account-select]');
    if (!(select instanceof HTMLSelectElement)) throw new Error('Account select is missing or invalid');
    return Array.from(select.options, (option) => option.value);
  `);
}

async function readNetworkEvidence(phase) {
  const filename = `${phase}-network.json`;
  const value = verifyNetworkEvidence(JSON.parse(await fs.readFile(path.join(root, filename), 'utf8')));
  await fs.writeFile(path.join(evidence, filename), JSON.stringify(value, null, 2));
  return value;
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return false;
  }
}

async function closeApplication(report) {
  let driverDisconnect;
  try {
    await browser.execute('window.close()');
  } catch (error) {
    driverDisconnect = error;
  }
  await browser.deleteSession();
  browser = undefined;
  await waitFor(() => !alive(report.pid), `Electron process ${report.pid} exits fully after shell close and driver detach`);
  if (driverDisconnect) console.warn(`Driver disconnected during verified application exit: ${driverDisconnect.message}`);
}

async function launch(phase) {
  fixture.setPhase(phase);
  const verification = await verifyDriver(driverPath, electronPath);
  await fs.writeFile(path.join(evidence, `${phase}-driver-verification.json`), JSON.stringify(verification, null, 2));
  assert.deepEqual(await fs.readdir(cacheDir), [], 'WDIO cache must be empty before each application start');
  browser = await remote({
    cacheDir,
    connectionRetryCount: 0,
    connectionRetryTimeout: 20000,
    capabilities: {
      browserName: 'chrome',
      'wdio:enforceWebDriverClassic': true,
      acceptInsecureCerts: false,
      browserVersion: provenance.chromiumVersion,
      'goog:chromeOptions': {
        binary: electronPath,
        args: [`--app=${path.join(output, 'build/main.cjs')}`, `--tmc-e2e-root=${root}`,
          '--enable-logging=file', `--log-file=${path.join(evidence, `${phase}-electron.log`)}`,
          `--tmc-e2e-backend=${fixture.origin}`, `--tmc-e2e-phase=${phase}`,
          `--user-data-dir=${path.join(root, 'profile')}`],
        excludeSwitches: ['password-store', 'use-mock-keychain'],
        prefs: { 'ssl.rev_checking.enabled': true },
      },
      'wdio:chromedriverOptions': {
        binary: driverPath,
        allowedIps: '127.0.0.1',
        allowedOrigins: 'http://localhost:*',
        verbose: true,
        logPath: path.join(evidence, `${phase}-driver.log`),
      },
    },
  });
  const launchedPid = browser.capabilities['goog:processID'];
  if (Number.isSafeInteger(launchedPid) && launchedPid > 0) processes.add(launchedPid);
  const report = await readReport(phase);
  assert.equal(report.versions.chrome, provenance.chromiumVersion);
  assert.equal(report.versions.electron, provenance.electronVersion);
  assert.deepEqual(await fs.readdir(cacheDir), [], 'Explicit binaries must bypass WDIO acquisition');
  const rendererUrl = pathToFileURL(path.join(output, 'renderer/main_window/index.html')).href;
  await browser.waitUntil(async () => {
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle);
      if ((await browser.getUrl()) === rendererUrl) return true;
    }
    return false;
  }, { timeout: 20000, timeoutMsg: 'Production renderer window must be present' });
  await browser.$('[data-tmc-account-select]').waitForEnabled({ timeout: 20000 });
  return report;
}

try {
  await fs.writeFile(path.join(root, 'fixture-owner'), 'tmc-electron-account-removal');
  await fs.mkdir(evidence, { recursive: true });
  assert.equal(process.platform, 'win32', 'This initial E2E verifies Windows OS-backed encryption and sandbox metrics');
  await verifyDriver(driverPath, electronPath);
  await fs.mkdir(cacheDir);
  const windowSource = await fs.readFile(path.join(project, 'src/main/windows/createMainWindow.ts'), 'utf8');
  for (const [name, value] of Object.entries({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true })) {
    assert.match(windowSource, new RegExp(`\\b${name}:\\s*${value}\\b`), `Production window must retain ${name}=${value}`);
  }
  const shared = {
    configFile: false,
    envFile: false,
    define: { MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined', MAIN_WINDOW_VITE_NAME: '"main_window"' },
  };
  await build({ ...shared, build: {
    outDir: path.join(output, 'build'),
    emptyOutDir: false,
    lib: { entry: path.join(project, 'tests/e2e/bootstrap.ts'), formats: ['cjs'], fileName: () => 'main.cjs' },
    rollupOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
      output: { inlineDynamicImports: true },
      plugins: [{ name: 'reject-real-config', resolveId(source) {
        if (source.endsWith('/TmcRuntimeConfig') || source.includes('LocalPropertiesReader')) {
          throw new Error('E2E bootstrap must not import real runtime configuration');
        }
      } }],
    },
  } });
  await build({ ...shared, build: {
    outDir: path.join(output, 'build'), emptyOutDir: false,
    lib: { entry: path.join(project, 'src/preload.ts'), formats: ['cjs'], fileName: () => 'preload.js' },
    rollupOptions: { external: ['electron'] },
  } });
  await build({ configFile: false, envFile: false, root: project, base: './',
    build: { outDir: path.join(output, 'renderer/main_window'), emptyOutDir: false } });
  fixture = await startFixture();
  const first = await launch('first');
  assert.deepEqual((await options()).sort(), ['A', 'B']);
  await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'A');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-a'),
    { timeout: 20000, timeoutMsg: 'UI selected-account display should show A' });
  await waitFor(() => fixture.chats.some((chat) => chat.username === 'fixture-a' && !chat.closed), 'real IRC client connects to local fixture');
  await browser.$('[data-tmc-remove-local-account]').click();
  await browser.waitUntil(() => browser.isAlertOpen(), { timeout: 10000 });
  assert.match(await browser.getAlertText(), /Remove this account from this device/);
  await browser.acceptAlert();
  await browser.waitUntil(async () => JSON.stringify(await options()) === '["B"]', { timeout: 20000 });
  assert.equal(await browser.$('[data-tmc-account-select]').getValue(), 'B');
  assert.match(await browser.$('[data-tmc-account-status]').getText(), /fixture-b/);
  await waitFor(() => fixture.chats.filter((chat) => chat.username === 'fixture-a').every((chat) => chat.closed), 'removed account chat disconnects');
  assert.deepEqual(fixture.requests.filter((entry) => entry.path === '/logout').map((entry) => entry.profileId), ['A']);
  const encrypted = await fs.readFile(path.join(root, 'profile/tmc-desktop-auth-sessions.json'), 'utf8');
  assert.equal(encrypted.includes('synthetic-desktop-'), false);
  await closeApplication(first);
  const firstNetwork = await readNetworkEvidence('first');
  const restarted = await launch('restart');
  assert.notEqual(restarted.pid, first.pid);
  assert.deepEqual(restarted.savedProfiles, ['B']);
  assert.deepEqual(await options(), ['B']);
  assert.equal(await browser.$('[data-tmc-account-select]').getValue(), 'B');
  assert.match(await browser.$('[data-tmc-account-status]').getText(), /fixture-b/);
  assert.deepEqual(fixture.requests.filter((entry) => entry.phase === 'restart' && entry.path === '/restore')
    .map((entry) => entry.profileId), ['B']);
  await closeApplication(restarted);
  const restartNetwork = await readNetworkEvidence('restart');
  assert.deepEqual(await fs.readdir(cacheDir), [], 'WDIO acquisition cache must remain empty');
  assert.ok(traffic.events.length > 0, 'Driver traffic observation must see real loopback commands');
  assert.ok(traffic.events.every((event) => event.allowed), 'WDIO parent must not request external acquisition');
  assert.equal(driverTracking.drivers.size, 2, 'Both explicit ChromeDriver child handles must be owned by this run');
  assert.deepEqual(fixture.failures, []);
  const failureLog = await fs.readFile(path.join(root, 'failures.log'), 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  });
  assert.equal(failureLog, '');
  result = {
    firstPid: first.pid, restartedPid: restarted.pid,
    requests: fixture.requests, chats: fixture.chats,
    applicationNetwork: { first: firstNetwork, restart: restartNetwork },
    persistedProfilesAfterRestart: restarted.savedProfiles,
  };
} catch (error) {
  scenarioError = error;
} finally {
  await finalizeAccountRemoval({ root, evidence, cacheDir, traffic, browser, processes, fixture,
    inheritedRunAsNode, electronPath, scenarioError, result, driverTracking });
}
console.log('PASS: real Electron UI removal, OS encryption, full exit and persistent restart; only B restored; finalization succeeded.');
