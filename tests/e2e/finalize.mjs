import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { channel } from 'node:diagnostics_channel';
import { once } from 'node:events';

export async function createCanonicalTemporaryDirectory(prefix, files = fs) {
  return files.realpath(await files.mkdtemp(path.join(os.tmpdir(), prefix)));
}

export function trackOwnedDrivers(driverPath, evidence) {
  const drivers = new Set();
  const pending = new Map();
  const topic = channel('child_process');
  const listener = ({ process: child }) => {
    const onSpawn = () => {
      pending.delete(child);
      if (child.spawnfile !== driverPath) return;
      if (['first', 'restart'].some((phase) => child.spawnargs.includes(`--log-path=${path.join(evidence, `${phase}-driver.log`)}`))) {
        drivers.add(child);
      }
    };
    pending.set(child, onSpawn);
    child.once('spawn', onSpawn);
  };
  topic.subscribe(listener);
  return { drivers, close() {
    topic.unsubscribe(listener);
    for (const [child, onSpawn] of pending) child.removeListener('spawn', onSpawn);
    pending.clear();
  } };
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return false;
  }
}

export async function stopOwnedElectron(pid, root, electronPath) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'Invalid owned Electron PID');
  if (!alive(pid)) return;
  const info = JSON.parse(execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference="Stop"; Get-CimInstance Win32_Process -Filter "ProcessId = $env:TMC_OWNED_PID" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress'], {
    encoding: 'utf8', windowsHide: true, timeout: 5000, env: { ...process.env, TMC_OWNED_PID: String(pid) },
  }) || 'null');
  if (!info) { assert.equal(alive(pid), false, `Cannot establish ownership of PID ${pid}`); return; }
  assert.equal(path.resolve(info.ExecutablePath).toLowerCase(), path.resolve(electronPath).toLowerCase(), 'Owned executable mismatch');
  assert.ok(info.CommandLine.includes(`--tmc-e2e-root=${root}`), 'Refusing to terminate a process without this test profile marker');
  process.kill(pid);
  const deadline = Date.now() + 5000;
  while (alive(pid)) {
    assert.ok(Date.now() < deadline, `Owned Electron PID ${pid} did not exit`);
    await delay(100);
  }
}

export async function stopOwnedDriver(child, isAlive = alive) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'close');
  if (!child.killed) child.kill();
  await exited;
  assert.equal(isAlive(child.pid), false, `Owned ChromeDriver PID ${child.pid} did not exit`);
}

export async function finalizeAccountRemoval({
  root, evidence, cacheDir, traffic, browser, processes, fixture, inheritedRunAsNode,
  electronPath, scenarioError, result, driverTracking,
}, { files = fs, environment = process.env, stopProcess = stopOwnedElectron } = {}) {
  const errors = scenarioError === undefined ? [] : [scenarioError];
  const attempts = [];
  async function attempt(stage, operation) {
    let timer;
    try {
      await Promise.race([Promise.resolve().then(operation), new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${stage} exceeded 15 seconds`)), 15000);
      })]);
      attempts.push({ stage, succeeded: true });
      return true;
    } catch (cause) {
      const error = new Error(`${stage}: ${cause.message || String(cause)}`, { cause });
      errors.push(error);
      attempts.push({ stage, succeeded: false });
      console.error(error);
      return false;
    } finally { clearTimeout(timer); }
  }
  if (scenarioError !== undefined) {
    await attempt('scenario error evidence', () => files.writeFile(path.join(evidence, 'failure.txt'), String(scenarioError.stack || scenarioError)));
    for (const phase of ['first', 'restart']) {
      await attempt(`${phase} failure network evidence`, async () => {
        try { await files.copyFile(path.join(root, `${phase}-network.json`), path.join(evidence, `${phase}-network.json`)); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          console.error(`Application network evidence unavailable for ${phase}`);
        }
      });
    }
    if (browser) await attempt('failure screenshot', () => browser.saveScreenshot(path.join(evidence, 'failure.png')));
    await attempt('bootstrap failure evidence', async () => {
      const text = await files.readFile(path.join(root, 'failures.log'), 'utf8').catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return 'No bootstrap failure log available';
      });
      await files.writeFile(path.join(evidence, 'bootstrap-failure.txt'), text);
      console.error(text);
    });
  }
  await attempt('driver observation close', () => traffic.close());
  await attempt('driver traffic evidence', async () => {
    const cacheEntries = await files.readdir(cacheDir).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    await files.writeFile(path.join(evidence, 'driver-traffic.json'), JSON.stringify({
      scope: 'Node WDIO parent HTTP/Undici requests, not OS-wide traffic', events: traffic.events, cacheEntries,
    }, null, 2));
  });
  if (browser) await attempt('browser session shutdown', () => browser.deleteSession());
  let processesReleased = true;
  for (const pid of processes) {
    const released = await attempt(`owned Electron ${pid} shutdown`, () => stopProcess(pid, root, electronPath));
    processesReleased = released && processesReleased;
  }
  for (const child of driverTracking?.drivers || []) {
    const released = await attempt(`owned ChromeDriver ${child.pid} shutdown`, () => stopOwnedDriver(child));
    processesReleased = released && processesReleased;
  }
  if (driverTracking) await attempt('driver ownership observation close', () => driverTracking.close());
  if (fixture) await attempt('fixture shutdown', () => fixture.close());
  await attempt('environment restoration', () => {
    if (inheritedRunAsNode === undefined) delete environment.ELECTRON_RUN_AS_NODE;
    else environment.ELECTRON_RUN_AS_NODE = inheritedRunAsNode;
  });
  await attempt(`owned profile removal ${root}`, async () => {
    assert.ok(processesReleased, `Retaining ${root}: owned process shutdown could not be verified`);
    assert.equal(await files.realpath(root), root);
    assert.equal(path.dirname(root), await files.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('tmc-electron-e2e-'));
    assert.equal(await files.readFile(path.join(root, 'fixture-owner'), 'utf8'), 'tmc-electron-account-removal');
    const deadline = Date.now() + 10000;
    for (;;) {
      try { await files.rm(root, { recursive: true }); return; } catch (error) {
        if (!['EBUSY', 'ENOTEMPTY'].includes(error.code) || Date.now() >= deadline) throw error;
        await delay(100);
      }
    }
  });
  if (!errors.length) await attempt('scenario result evidence', () => {
    assert.ok(result, 'Scenario did not produce a result');
    return files.writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  });
  await attempt('finalization evidence', () => files.writeFile(path.join(evidence, 'finalization.json'), JSON.stringify({
    attempts, failures: errors.map((error) => ({ name: error.name, message: error.message })),
    profile: root, remainingProfile: attempts.some((entry) => entry.stage.startsWith('owned profile removal') && !entry.succeeded),
  }, null, 2)));
  if (attempts.some((entry) => entry.stage.startsWith('owned profile removal') && entry.succeeded)) {
    console.log(`Verified test-owned profile removed. Diagnostics: ${evidence}`);
  } else console.error(`Test-owned profile retained: ${root}; diagnostics: ${evidence}`);
  if (errors.length) throw new AggregateError(errors, `Account-removal E2E failed; diagnostics: ${evidence}; profile: ${root}`, { cause: scenarioError ?? errors[0] });
}
