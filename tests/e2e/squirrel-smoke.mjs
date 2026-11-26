import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

// Keep the production protected executable/ASAR intact; replace only Update.exe,
// so lifecycle checks cannot touch real shortcuts or launch authenticated services.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assert.equal(process.platform, 'win32');
const root = await fs.realpath(await fs.mkdtemp(path.join(project, '.test-build', 'squirrel-smoke-')));
await fs.writeFile(path.join(root, 'owner'), 'tmc-squirrel-smoke');
const appDir = path.join(root, 'app-test');
const profile = path.join(root, 'profile');
await fs.cp(path.join(project, 'out/twitchminichatdesktop-win32-x64'), appDir, { recursive: true });
await fs.mkdir(profile);
await fs.writeFile(path.join(root, 'Updater.cs'), `using System; using System.IO; using System.Threading;
class Updater { static void Main(string[] args) {
  string root=AppDomain.CurrentDomain.BaseDirectory;
  File.WriteAllLines(Path.Combine(root,"updater-args.txt"),args);
  Thread.Sleep(600);
  File.WriteAllText(Path.Combine(root,"updater-completed"),"done");
} }`);
const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
execFileSync(compiler, ['/nologo', '/target:winexe', `/out:${path.join(root, 'Update.exe')}`, path.join(root, 'Updater.cs')], { windowsHide: true, timeout: 15000 });
const environment = { ...process.env };
for (const key of Object.keys(environment)) if (key.startsWith('TMC_') || key.startsWith('ELECTRON_') || key === 'NODE_OPTIONS') delete environment[key];
environment.TMC_BACKEND_BASE_URL = 'http://127.0.0.1:9';
let child;
const observations = [];
let failure;
const cleanupErrors = [];
function ownedProcesses() {
  const output = execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference="Stop"; @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:TMC_SQUIRREL_ROOT,[StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.ProcessId }) | ConvertTo-Json -Compress'],
  { encoding: 'utf8', windowsHide: true, timeout: 5000, env: { ...environment, TMC_SQUIRREL_ROOT: root + path.sep } });
  const parsed = output.trim() ? JSON.parse(output) : [];
  const pids = Array.isArray(parsed) ? parsed : [parsed];
  assert.ok(pids.every((pid) => Number.isSafeInteger(pid) && pid > 0));
  return pids;
}
try {
  for (const event of ['install', 'updated', 'uninstall', 'obsolete']) {
    await fs.rm(path.join(root, 'updater-completed'), { force: true });
    await fs.rm(path.join(root, 'updater-args.txt'), { force: true });
    child = spawn(path.join(appDir, 'TMC-desktop.exe'), [`--squirrel-${event}`, '1.1.0', `--user-data-dir=${profile}`],
      { cwd: root, env: environment, windowsHide: true, stdio: 'ignore' });
    let timer;
    let code;
    try {
      [code] = await Promise.race([once(child, 'exit'), new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Squirrel event exceeded 10 seconds')), 10000);
      })]);
    } finally { clearTimeout(timer); }
    const completedBeforeExit = await fs.access(path.join(root, 'updater-completed')).then(() => true, (error) => { if (error.code !== 'ENOENT') throw error; return false; });
    const observation = { event, code, completedBeforeExit }; observations.push(observation);
    if (event !== 'obsolete') {
      // Also wait for a detached boundary process from a failing baseline.
      for (let retry = 0; !await fs.access(path.join(root, 'updater-completed')).then(() => true, () => false) && retry < 50; retry++) await delay(100);
      const args = (await fs.readFile(path.join(root, 'updater-args.txt'), 'utf8')).trim().split(/\r?\n/);
      observation.args = args;
      assert.deepEqual(args, [`--${event === 'uninstall' ? 'remove' : 'create'}Shortcut=TMC-desktop.exe`, '--shortcut-locations=Desktop,StartMenu']);
      assert.equal(completedBeforeExit, true, 'Installer app must wait for shortcut updater completion before exiting');
    } else assert.equal(completedBeforeExit, false);
    assert.equal(code, 0);
    const names = await fs.readdir(profile);
    assert.equal(names.some((name) => /^(tmc-|welcome\.json|settings\.json)/.test(name)), false, 'Installer events never initialize normal account/settings/welcome services');
  }
} catch (error) { failure = error; }
finally {
  const attempt = async (operation) => { try { await operation(); return true; } catch (error) { cleanupErrors.push(error); return false; } };
  const released = await attempt(async () => {
    for (const pid of ownedProcesses()) process.kill(pid);
    const deadline = Date.now() + 10000;
    while (ownedProcesses().length) { assert.ok(Date.now() < deadline, 'Owned installer processes did not exit'); await delay(100); }
  });
  let profileRemoved = false;
  if (released) await attempt(async () => {
    assert.equal(await fs.realpath(root), root);
    assert.equal(path.dirname(root), await fs.realpath(path.join(project, '.test-build')));
    assert.equal(await fs.readFile(path.join(root, 'owner'), 'utf8'), 'tmc-squirrel-smoke');
    for (const target of [profile, appDir]) {
      assert.equal(await fs.realpath(target), target);
      assert.equal(path.dirname(target), root);
      await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
    profileRemoved = true;
  });
  await attempt(() => fs.writeFile(path.join(root, 'result.json'), JSON.stringify({ passed: !failure && !cleanupErrors.length,
    observations, profileRemoved, error: failure ? String(failure) : null, cleanupErrors: cleanupErrors.map(String) }, null, 2)));
}
if (failure || cleanupErrors.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], `Squirrel smoke failed; evidence: ${root}`, { cause: failure || cleanupErrors[0] });
console.log(`PASS: protected Squirrel install/update/uninstall/obsolete lifecycle; evidence: ${root}`);
