import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { remote } from 'webdriverio';
import { provenance, verifyIntegrity } from './driver.mjs';

// Launch the unmodified, protected Forge artifact, not an alternate bootstrap.
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const binary = path.resolve(process.argv.slice(2).find((value) => !value.startsWith('--')) || 'out/twitchminichatdesktop-win32-x64/TMC-desktop.exe');
const driverPath = process.env.TMC_E2E_DRIVER_PATH;
assert.equal(process.platform, 'win32');
await verifyIntegrity(driverPath, provenance.binarySha256);
const archive = path.join(path.dirname(binary), 'resources', 'app.asar');
const files = asar.listPackage(archive).map((entry) => entry.replaceAll('\\', '/'));
assert.ok(files.every((entry) => entry === '/package.json' || entry === '/.vite' || entry.startsWith('/.vite/')), 'Only production bundles and package metadata may ship');
const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString());
const fuses = await getCurrentFuseWire(binary);
for (const [name, expected] of Object.entries({ RunAsNode: 0, EnableCookieEncryption: 1, EnableNodeOptionsEnvironmentVariable: 0,
  EnableNodeCliInspectArguments: 0, EnableEmbeddedAsarIntegrityValidation: 1, OnlyLoadAppFromAsar: 1 })) {
  assert.equal(fuses[FuseV1Options[name]], String(expected).charCodeAt(0), `Production fuse ${name}`);
}
const root = await fs.mkdtemp(path.join(project, '.test-build', 'packaged-smoke-'));
await fs.writeFile(path.join(root, 'owner'), 'tmc-packaged-smoke');
const profile = path.join(root, 'profile');
await fs.mkdir(profile);
const environment = { ...process.env };
for (const key of Object.keys(environment)) if (key.startsWith('TMC_') || key.startsWith('ELECTRON_') || key === 'NODE_OPTIONS') delete environment[key];
environment.TMC_BACKEND_BASE_URL = 'http://127.0.0.1:9';
environment.TMC_OAUTH_START_URL = 'http://127.0.0.1:9/oauth/start';
let browser, driver, application;
const children = new Set();
const result = { passed: false, version: metadata.version, binary, archiveSha256: createHash('sha256').update(await fs.readFile(archive)).digest('hex'),
  files, fuses, launches: [], profileRemoved: false };
const alive = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code !== 'ESRCH') throw error; return false; }
};
async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'close');
  child.kill();
  let timer;
  try { await Promise.race([exited, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Owned process did not exit')), 5000); })]); }
  finally { clearTimeout(timer); }
}
function ownedProcesses() {
  const text = execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference="Stop"; @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $env:TMC_SMOKE_EXE -and $_.CommandLine.Contains($env:TMC_SMOKE_PROFILE) } | ForEach-Object { $_.ProcessId }) | ConvertTo-Json -Compress'],
  { encoding: 'utf8', timeout: 5000, windowsHide: true, env: { ...environment, TMC_SMOKE_EXE: binary, TMC_SMOKE_PROFILE: profile } });
  const parsed = text.trim() ? JSON.parse(text) : [];
  const pids = parsed === null ? [] : Array.isArray(parsed) ? parsed : [parsed];
  assert.ok(pids.every((pid) => Number.isSafeInteger(pid) && pid > 0), 'Owned process scan returns only valid PIDs');
  return pids;
}
async function launch() {
  // Own the app process before asking WebDriver to attach: a failed session
  // handshake cannot leave an untracked executable using the temporary profile.
  await fs.rm(path.join(profile, 'DevToolsActivePort'), { force: true });
  application = spawn(binary, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'],
    { cwd: root, env: environment, windowsHide: true, stdio: 'ignore' });
  children.add(application);
  await once(application, 'spawn');
  if (process.argv.includes('--fail-after-app-spawn')) throw new Error('Intentional packaged-smoke failure after app spawn');
  let debuggingPort;
  for (let attempt = 0; attempt < 150; attempt++) {
    assert.equal(application.exitCode, null, 'Packaged app must remain running');
    try { debuggingPort = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (debuggingPort > 0) break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(100);
  }
  assert.ok(Number.isSafeInteger(debuggingPort) && debuggingPort > 0, 'Owned local renderer debugging endpoint');
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  driver = spawn(process.argv.includes('--fail-driver-spawn') ? path.join(root, 'missing-driver.exe') : driverPath,
    [`--port=${port}`, '--allowed-ips=127.0.0.1'], { cwd: root, env: environment, windowsHide: true, stdio: 'ignore' });
  children.add(driver);
  await once(driver, 'spawn');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (driver.exitCode !== null) throw new Error('Driver exited before startup');
    try { if ((await fetch(`http://127.0.0.1:${port}/status`)).ok) break; } catch { /* bounded local startup polling */ }
    await delay(100);
  }
  browser = await remote({ hostname: '127.0.0.1', port, logLevel: 'error', connectionRetryCount: 0, connectionRetryTimeout: 15000,
    capabilities: { browserName: 'chrome', 'wdio:enforceWebDriverClassic': true, acceptInsecureCerts: false,
      'goog:chromeOptions': { debuggerAddress: `127.0.0.1:${debuggingPort}` } } });
  const pid = application.pid;
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'Actual owned packaged process identity');
  await browser.waitUntil(async () => (await browser.getUrl()).includes('/app.asar/.vite/renderer/main_window/index.html'), { timeout: 20000 });
  await browser.waitUntil(async () => (await browser.$('[data-tmc-welcome-open]').getAttribute('data-ready')) === 'true');
  if (!result.launches.length) {
    await browser.$('[data-tmc-welcome-dialog]').waitForDisplayed();
    assert.equal(await browser.$('[data-tmc-welcome-download]').isDisplayed(), false);
    await browser.saveScreenshot(path.join(root, 'welcome-packaged.png'));
    await browser.$('[data-tmc-welcome-close]').click();
  } else assert.equal(await browser.$('[data-tmc-welcome-dialog]').isDisplayed(), false, 'Welcome does not repeat at the same version');
  await browser.$('[data-tmc-auth-login]').waitForClickable({ timeout: 15000 });
  const state = await browser.execute(async () => {
    const shell = globalThis.window;
    return Promise.all([shell.tmc.ping(), shell.tmc.accounts.list(), shell.tmc.settings.get(), shell.tmc.player.getStatus()]).then(
      ([ping, accounts, settings, player]) => ({ ping, accounts, settings, player, node: typeof shell.require, process: typeof shell.process,
        styles: shell.getComputedStyle(shell.document.querySelector('.tmc-shell')).display }),
      (error) => ({ error: String(error) }));
  });
  assert.equal(state.error, undefined); assert.equal(state.ping, 'pong');
  assert.equal(state.node, 'undefined'); assert.equal(state.process, 'undefined');
  assert.deepEqual(state.accounts.accounts, []); assert.equal(state.accounts.activeProfileId, null);
  assert.equal(state.styles, 'flex'); assert.equal(state.player.state, 'closed');
  await browser.waitUntil(async () => (await browser.$('#chatList').getText()).includes('Use Login to sign in'));
  assert.equal((await browser.$('#chatList').getText()).includes('Error invoking'), false, 'First launch guides login instead of requesting authenticated history');
  assert.match(await browser.getTitle(), new RegExp(metadata.version.replaceAll('.', '\\.')));
  result.launches.push({ pid, state });
  return state;
}
async function close() {
  const pid = result.launches.at(-1)?.pid;
  try { await browser?.execute('window.close()'); }
  catch (error) { if (!/no such window|invalid session|disconnected|target frame detached/i.test(String(error))) throw error; }
  try { await browser?.deleteSession(); } catch (error) { if (!/invalid session|ECONNREFUSED|disconnected/i.test(String(error))) throw error; }
  browser = null;
  for (let attempt = 0; pid && alive(pid) && attempt < 100; attempt++) await delay(100);
  assert.ok(!pid || !alive(pid), 'Packaged application exits fully');
  await stop(driver); driver = null;
}
const errors = [];
try {
  await launch();
  await browser.$('[data-tmc-auth-login]').click();
  await browser.$('[data-tmc-auth-dialog]').waitForDisplayed();
  assert.equal(await browser.$('[data-tmc-auth-start]').isDisplayed(), true);
  assert.equal(await browser.$('[data-tmc-auth-code-step]').isDisplayed(), false);
  await browser.$('[data-tmc-auth-close]').click();
  await browser.saveScreenshot(path.join(root, 'packaged-window.png'));
  assert.equal(await browser.execute(async () => globalThis.window.tmc.settings.setChatAppearance({ fontSize: 18, density: 'compact', showTimestamps: false }).then(() => true, () => false)), true);
  const saved = JSON.parse(await fs.readFile(path.join(profile, 'settings.json'), 'utf8'));
  assert.equal(saved.chatAppearance.fontSize, 18, 'Preferences are written in the isolated profile');
  await close();
  const restarted = await launch();
  assert.deepEqual(restarted.settings.chatAppearance, { fontSize: 18, density: 'compact', showTimestamps: false });
  await close();
  result.passed = true;
} catch (error) {
  result.error = String(error);
  errors.push(error);
  if (browser) {
    try {
      result.failureUi = await browser.execute(() => {
        const document = globalThis.window.document;
        const dialog = document.querySelector('[data-tmc-welcome-dialog]');
        const failure = document.querySelector('[data-tmc-welcome-error]');
        return { welcomeReady: document.querySelector('[data-tmc-welcome-open]')?.getAttribute('data-ready'),
          welcomeOpen: dialog?.hasAttribute('open'), welcomeOpening: dialog?.getAttribute('data-opening'),
          welcomeError: failure?.textContent, welcomeErrorHidden: failure?.hidden,
          authOpen: document.querySelector('[data-tmc-auth-dialog]')?.hasAttribute('open'),
          viewport: { width: globalThis.window.innerWidth, height: globalThis.window.innerHeight } };
      });
      await browser.saveScreenshot(path.join(root, 'failure.png'));
    } catch (diagnosticError) { result.diagnosticError = String(diagnosticError); }
  }
} finally {
  const attempt = async (operation) => { try { await operation(); return true; } catch (error) { errors.push(error); return false; } };
  for (const child of children) await attempt(() => stop(child));
  const released = await attempt(async () => {
    for (const pid of ownedProcesses()) process.kill(pid);
    for (let retry = 0; retry < 20; retry++) { if (!ownedProcesses().length) return; await delay(100); }
    throw new Error('Packaged child processes remain; retaining profile');
  });
  if (released) await attempt(async () => {
    assert.equal(await fs.readFile(path.join(root, 'owner'), 'utf8'), 'tmc-packaged-smoke');
    assert.equal(await fs.realpath(root), root);
    assert.equal(path.dirname(root), await fs.realpath(path.join(project, '.test-build')));
    assert.equal(await fs.realpath(profile), path.join(root, 'profile'));
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    result.profileRemoved = true;
  });
  result.passed = result.passed && errors.length === 0;
  result.failures = errors.map((error) => String(error));
  await attempt(() => fs.writeFile(path.join(root, 'result.json'), JSON.stringify(result, null, 2)));
}
if (errors.length) throw new AggregateError(errors, `Packaged smoke failed; evidence: ${root}`, { cause: errors[0] });
console.log(`PASS: protected packaged shell, login dialog, isolated preferences and full restart. Evidence: ${root}`);
