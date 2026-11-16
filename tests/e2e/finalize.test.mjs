import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { finalizeAccountRemoval, stopOwnedDriver, trackOwnedDrivers } from './finalize.mjs';

test('already-signalled owned driver still requires close and verified exit', async () => {
  const child = Object.assign(new EventEmitter(), { pid: 101, killed: true, exitCode: null, signalCode: null,
    kill() { assert.fail('Must not signal an already-signalled child again'); } });
  let exitVerified = false;
  const closed = stopOwnedDriver(child, (pid) => { assert.equal(pid, 101); exitVerified = true; return false; });
  assert.equal(exitVerified, false);
  child.emit('close');
  await closed;
  assert.equal(exitVerified, true);
});

test('driver ownership is checked after native spawn populates the executable and arguments', async () => {
  const evidence = path.join(os.tmpdir(), 'tmc-driver-tracking-only');
  const tracking = trackOwnedDrivers(process.execPath, evidence);
  try {
    const child = spawn(process.execPath, ['-e', '', '--', `--log-path=${path.join(evidence, 'first-driver.log')}`], { windowsHide: true });
    const closed = once(child, 'close');
    await once(child, 'spawn');
    assert.equal(tracking.drivers.has(child), true);
    await closed;
    const unrelated = spawn(process.execPath, ['-e', ''], { windowsHide: true });
    await once(unrelated, 'close');
    assert.equal(tracking.drivers.has(unrelated), false);
  } finally { tracking.close(); }
});

const cases = [
  { name: 'EIO diagnostic write does not skip any cleanup', fault: 'diagnostic' },
  { name: 'browser shutdown failure does not skip processes, fixture, environment or profile', fault: 'browser' },
  { name: 'fixture shutdown failure still restores environment and removes owned profile', fault: 'fixture' },
  { name: 'original scenario cause survives a secondary diagnostic failure', fault: 'diagnostic', scenarioFailure: true },
  { name: 'unsafe profile ownership is rejected and reported', fault: 'ownership' },
  { name: 'one process failure does not skip other releases and retains profile safely', fault: 'process' },
  { name: 'successful finalization restores absent inherited environment state', fault: undefined },
];

for (const entry of cases) {
  test(entry.name, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-electron-e2e-'));
    const evidence = await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-finalization-evidence-'));
    const cacheDir = path.join(root, 'wdio-cache');
    await fs.mkdir(cacheDir);
    await fs.writeFile(path.join(root, 'fixture-owner'), entry.fault === 'ownership' ? 'not-owned' : 'tmc-electron-account-removal');
    const attempted = [];
    const original = entry.scenarioFailure ? new Error('original scenario cause') : undefined;
    const boundaryError = Object.assign(new Error(`Expected deterministic ${entry.fault} fault`), { code: 'EIO' });
    const environment = { ELECTRON_RUN_AS_NODE: 'changed-by-scenario' };
    const inherited = entry.fault ? 'inherited-value' : undefined;
    let outcome;
    try {
      try {
        await finalizeAccountRemoval({ root, evidence, cacheDir,
          traffic: { events: [], close() { attempted.push('traffic'); } },
          browser: { async deleteSession() { attempted.push('browser'); if (entry.fault === 'browser') throw boundaryError; },
            async saveScreenshot() { attempted.push('screenshot'); } },
          processes: new Set([101, 202]),
          fixture: { async close() { attempted.push('fixture'); if (entry.fault === 'fixture') throw boundaryError; } },
          inheritedRunAsNode: inherited, electronPath: 'unused-for-simulated-process-boundary', scenarioError: original, result: {},
        }, { environment,
          files: { ...fs,
            async writeFile(filename, ...args) {
              if (path.basename(filename) === 'driver-traffic.json') {
                attempted.push('diagnostic');
                if (entry.fault === 'diagnostic') throw boundaryError;
              }
              return fs.writeFile(filename, ...args);
            },
            async rm(filename, ...args) {
              attempted.push('profile');
              assert.equal(environment.ELECTRON_RUN_AS_NODE, inherited, 'Environment restored before removal');
              return fs.rm(filename, ...args);
            },
          },
          async stopProcess(pid) { attempted.push(`process-${pid}`); if (pid === 101 && entry.fault === 'process') throw boundaryError; },
        });
      } catch (error) { outcome = error; }
      const releases = attempted.filter((action) => action !== 'screenshot');
      assert.deepEqual(releases, ['traffic', 'diagnostic', 'browser', 'process-101', 'process-202', 'fixture',
        ...(['ownership', 'process'].includes(entry.fault) ? [] : ['profile'])]);
      assert.equal(environment.ELECTRON_RUN_AS_NODE, inherited);
      const retained = ['ownership', 'process'].includes(entry.fault);
      assert.equal(await fs.stat(root).then(() => true, (error) => {
        if (error.code !== 'ENOENT') throw error;
        return false;
      }), retained);
      if (entry.fault) {
        assert.ok(outcome instanceof AggregateError);
        if (original) { assert.equal(outcome.cause, original); assert.equal(outcome.errors[0], original); }
        if (!['ownership'].includes(entry.fault)) assert.ok(outcome.errors.some((error) => error.cause === boundaryError));
        assert.equal(await fs.stat(path.join(evidence, 'result.json')).then(() => true, () => false), false);
      } else assert.equal(outcome, undefined);
      const report = JSON.parse(await fs.readFile(path.join(evidence, 'finalization.json'), 'utf8'));
      assert.equal(report.remainingProfile, retained);
      assert.equal(report.failures.length > 0, Boolean(entry.fault));
      console.log(`Verified attempted releases: ${releases.join(', ')}; simulated resources, not real Electron leakage.`);
    } finally {
      for (const directory of [root, evidence]) {
        assert.equal(path.dirname(directory), await fs.realpath(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith(directory === root ? 'tmc-electron-e2e-' : 'tmc-finalization-evidence-'));
        await fs.rm(directory, { recursive: true, force: true });
      }
    }
  });
}
