import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'vite';
import { remote } from 'webdriverio';
import { startFixture } from './fixture.mjs';
import { exerciseLoginDialog } from './login-dialog.mjs';
import { exerciseLayout } from './layout.mjs';
import { exercisePcgMenu } from './pcg-menu.mjs';
import { exerciseEmotes } from './emotes.mjs';
import { exerciseReplies } from './replies.mjs';
import { exerciseUserColors } from './user-colors.mjs';
import { exerciseMentions } from './mentions.mjs';
import { exerciseAppearance, verifyAppearanceRestart } from './appearance.mjs';
import { exerciseTimestamps } from './timestamps.mjs';
import { exerciseBadges } from './badges.mjs';
import { exerciseSearch } from './search.mjs';
import { exercisePlayer } from './player.mjs';
import { appVersionPlugin } from '../../build/appVersion.mjs';
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
let windowSizeSequence = 0;

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

async function readNativeViews() {
  const snapshots = (await fs.readdir(root)).filter((name) => /^first-pcg-bounds-\d+\.json$/.test(name));
  snapshots.sort((a, b) => Number(a.match(/(\d+)\.json$/)[1]) - Number(b.match(/(\d+)\.json$/)[1]));
  return snapshots.length ? JSON.parse(await fs.readFile(path.join(root, snapshots.at(-1)), 'utf8')) : [];
}

async function readPlayback() {
  const files = (await fs.readdir(root)).filter((name) => /^first-playback-\d+\.json$/.test(name));
  files.sort((a, b) => Number(a.match(/(\d+)\.json$/)[1]) - Number(b.match(/(\d+)\.json$/)[1]));
  return files.length ? JSON.parse(await fs.readFile(path.join(root, files.at(-1)), 'utf8')) : null;
}
async function closeOwnedPlayerWindow() {
  const command = path.join(root, 'first-close-player');
  await fs.writeFile(`${command}.tmp`, 'close-owned-detached-player', { flag: 'wx' });
  await fs.rename(`${command}.tmp`, command);
  await waitFor(async () => {
    try { await fs.access(`${command}.ack`); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }, 'owned detached player close');
}

// ChromeDriver's Browser.getWindowForTarget is unavailable for this Electron
// build. Control only this run's actual BrowserWindow through its marked root.
async function resizeOwnedWindow(width, height) {
  const sequence = ++windowSizeSequence;
  const command = path.join(root, `first-window-size-${sequence}.json`);
  // Electron polls for this name; publish it only after the entire payload closes.
  await fs.writeFile(`${command}.tmp`, JSON.stringify({ width, height }), { flag: 'wx' });
  await fs.rename(`${command}.tmp`, command);
  const acknowledgement = path.join(root, `first-window-size-${sequence}.ack.json`);
  await waitFor(async () => {
    try { await fs.access(acknowledgement); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }, 'owned native window resize');
  return JSON.parse(await fs.readFile(acknowledgement, 'utf8'));
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
  await browser.$('[data-tmc-welcome-dialog]').waitForDisplayed({ timeout: 20000 });
  assert.equal(await browser.$('[data-tmc-welcome-download]').isDisplayed(), phase !== 'first', 'Download appears only for a known newer desktop installer');
  await browser.saveScreenshot(path.join(evidence, `welcome-${phase}.png`));
  await browser.$('[data-tmc-welcome-close]').click();
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
  fixture = await startFixture();
  await build({ ...shared, build: {
    outDir: path.join(output, 'build'),
    emptyOutDir: false,
    lib: { entry: path.join(project, 'tests/e2e/bootstrap.ts'), formats: ['cjs'], fileName: () => 'main.cjs' },
    rolldownOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
      output: { inlineDynamicImports: true },
      plugins: [{ name: 'local-player-frame', enforce: 'pre', transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/main/player/TmcPlayerDocument.ts')) return;
        const boundary = 'https://player.twitch.tv';
        assert.equal(code.split(boundary).length, 2, 'Only the official player frame HTTP origin is substituted');
        return code.replace(boundary, `${fixture.origin}/player-frame`);
      } }, { name: 'local-desktop-release', transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/main/welcome/TmcReleaseClient.ts')) return;
        const boundary = 'https://api.github.com/repos/unouidol/TwitchMiniChatDesktop/releases/latest';
        assert.equal(code.split(boundary).length, 2, 'Only the public release metadata HTTP boundary is substituted');
        return code.replace(boundary, `${fixture.origin}/desktop-release`);
      } }, { name: 'reject-real-config', resolveId(source) {
        if (source.endsWith('/TmcRuntimeConfig') || source.includes('LocalPropertiesReader')) {
          throw new Error('E2E bootstrap must not import real runtime configuration');
        }
      } }],
    },
  } });
  await build({ ...shared, build: {
    outDir: path.join(output, 'build'), emptyOutDir: false,
    lib: { entry: path.join(project, 'src/preload.ts'), formats: ['cjs'], fileName: () => 'preload.cjs' },
    rolldownOptions: { external: ['electron'] },
  } });
  await build({ configFile: false, envFile: false, root: project, base: './',
    plugins: [appVersionPlugin('e2e')],
    build: { outDir: path.join(output, 'renderer/main_window'), emptyOutDir: false } });
  const first = await launch('first');
  assert.deepEqual((await options()).sort(), ['A', 'B']);
  assert.ok(['A', 'B'].includes(first.startupPreferredProfileId));
  const firstRestoreOrder = fixture.requests.filter((entry) => entry.phase === 'first' && entry.path === '/restore')
    .map((entry) => entry.profileId);
  assert.equal(firstRestoreOrder.length, 2);
  assert.notEqual(firstRestoreOrder[0], first.startupPreferredProfileId, 'Preferred account must restore after another account');
  const initialActiveProfileId = await browser.$('[data-tmc-account-select]').getValue();
  assert.equal(initialActiveProfileId, first.startupPreferredProfileId, 'Startup selection must honor the saved preference');
  assert.match(await browser.$('[data-tmc-account-status]').getText(),
    new RegExp(`fixture-${first.startupPreferredProfileId.toLowerCase()}`));
  await exerciseLoginDialog(browser, evidence);
  assert.deepEqual(fixture.requests.filter((entry) => entry.path === '/finalize').map((entry) => entry.accepted), [false, false, true]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'browser-attempts.json'), 'utf8')), { browserAttempts: 2 });
  await exerciseLayout(browser, fixture, evidence, readNativeViews);
  await exercisePcgMenu(browser, evidence, readNativeViews, async (state) => {
    const destination = path.join(root, 'pcg-cookie-command');
    await fs.writeFile(`${destination}.tmp`, state);
    await fs.rename(`${destination}.tmp`, destination);
    await waitFor(async () => {
      try { return (await fs.readFile(path.join(root, 'pcg-cookie-ack'), 'utf8')) === state; }
      catch (error) { if (error.code !== 'ENOENT') throw error; return false; }
    }, 'synthetic browser-session fixture change');
  });
  await exerciseEmotes(browser, fixture, evidence, readNativeViews, async () => {
    try { return JSON.parse(await fs.readFile(path.join(root, 'chat-link-attempts.json'), 'utf8')).attempts; }
    catch (error) { if (error.code !== 'ENOENT') throw error; return []; }
  }, resizeOwnedWindow);
  await exerciseAppearance(browser, fixture, evidence, readNativeViews);
  await exerciseTimestamps(browser, fixture, readNativeViews);
  await exerciseReplies(browser, fixture, evidence);
  await exerciseUserColors(browser, fixture, evidence);
  await exerciseMentions(browser, fixture, evidence, readNativeViews);
  await exerciseBadges(browser, fixture, evidence, readNativeViews);
  await exerciseSearch(browser, fixture, evidence, readNativeViews);
  await exercisePlayer(browser, fixture, evidence, readNativeViews, readPlayback, resizeOwnedWindow, closeOwnedPlayerWindow);
  const projectLinks = (await fs.readFile(path.join(root, 'project-link-attempts.txt'), 'utf8')).trim().split('\n');
  assert.deepEqual(projectLinks, ['https://github.com/unouidol/TwitchMiniChatDesktop/releases/download/v99.0.0/TMC-desktop-Setup.exe']);
  await fs.writeFile(path.join(evidence, 'welcome-browser.json'), JSON.stringify({ intercepted: projectLinks }, null, 2));
  await fs.writeFile(path.join(evidence, 'player-lifecycle.json'), JSON.stringify(await readPlayback(), null, 2));
  await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'A');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-a'),
    { timeout: 20000, timeoutMsg: 'UI selected-account display should show A' });
  await waitFor(() => fixture.chats.some((chat) => chat.username === 'fixture-a' && !chat.closed), 'real IRC client connects to local fixture');
  await browser.$('[data-tmc-account-menu] summary').click();
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
  await resizeOwnedWindow(1160, 1100);
  await browser.$('[data-tmc-player-toggle]').waitForEnabled();
  await browser.$('[data-tmc-player-toggle]').click();
  await browser.waitUntil(async () => (await readPlayback()).status.state === 'ready' && (await readPlayback()).sourceActive);
  await browser.$('[data-tmc-auth-login]').click();
  await browser.$('[data-tmc-auth-dialog]').waitForDisplayed();
  await browser.waitUntil(async () => (await readPlayback()).status.mode === 'embedded' && (await readPlayback()).playerViews[0]?.bounds.width === 0);
  await browser.refresh();
  await browser.waitUntil(async () => (await readPlayback()).status.state === 'closed' && !(await readPlayback()).sourceActive);
  await browser.$('[data-tmc-player-toggle]').waitForEnabled();
  assert.equal(await browser.$('[data-tmc-player-panel]').isDisplayed(), false, 'Reload closes the previous playback context');
  await browser.$('[data-tmc-player-toggle]').click();
  await browser.waitUntil(async () => (await readPlayback()).status.state === 'ready' && (await readPlayback()).sourceActive);
  await browser.waitUntil(async () => (await readPlayback()).status.mode === 'embedded' && (await readPlayback()).playerViews[0]?.bounds.width >= 400);
  await fs.writeFile(path.join(evidence, 'player-active-at-exit.json'), JSON.stringify(await readPlayback(), null, 2));
  await closeApplication(first);
  const firstNetwork = await readNetworkEvidence('first');
  const restarted = await launch('restart');
  await verifyAppearanceRestart(browser);
  await browser.waitUntil(async () => (await browser.$('.tmc-pcg-panel').getAttribute('data-tmc-pcg-twitch-auth')) === 'session-present');
  assert.notEqual(restarted.pid, first.pid);
  assert.deepEqual(restarted.savedProfiles, ['B']);
  assert.deepEqual(await options(), ['B']);
  assert.equal(await browser.$('[data-tmc-account-select]').getValue(), 'B');
  assert.match(await browser.$('[data-tmc-account-status]').getText(), /fixture-b/);
  assert.deepEqual(fixture.requests.filter((entry) => entry.phase === 'restart' && entry.path === '/restore')
    .map((entry) => entry.profileId), ['B']);
  await browser.waitUntil(async () => (await browser.$('[data-tmc-live-status]').getText()) === 'Live: connected', { timeout: 20000 });
  const restartedFavorites = await browser.execute(async () => {
    return globalThis.window.tmc.emotes.getCatalog({ profileId: 'B', channel: 'fixture-channel' }).then(
      (catalog) => ({ favorites: catalog.favorites.map((emote) => emote.name), failed: catalog.favoritesSaveFailed }),
      () => ({ failed: true }),
    );
  });
  assert.deepEqual(restartedFavorites, { favorites: ['Kappa', 'Keepo'], failed: false }, 'Fresh Electron process restores only B favorites');
  await closeApplication(restarted);
  const restartNetwork = await readNetworkEvidence('restart');
  assert.deepEqual(await fs.readdir(cacheDir), [], 'WDIO acquisition cache must remain empty');
  assert.ok(traffic.events.length > 0, 'Driver traffic observation must see real loopback commands');
  assert.ok(traffic.events.every((event) => event.allowed), 'WDIO parent must not request external acquisition');
  assert.equal(driverTracking.drivers.size, 2, 'Both explicit ChromeDriver child handles must be owned by this run');
  assert.deepEqual(fixture.failures, []);
  assert.equal(fixture.sentMessages.length, 6, 'Navigation/refresh/restart must not replay sent messages');
  const failureLog = await fs.readFile(path.join(root, 'failures.log'), 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  });
  assert.equal(failureLog, '');
  result = {
    firstPid: first.pid, restartedPid: restarted.pid,
    initialActiveProfileId,
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
