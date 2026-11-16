import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';

export const provenance = JSON.parse(await fs.readFile(new URL('./driver-provenance.json', import.meta.url), 'utf8'));

export async function verifyIntegrity(filename, expectedDigest) {
  assert.ok(filename && path.isAbsolute(filename), 'Explicit absolute TMC_E2E_DRIVER_PATH is required');
  const stat = await fs.lstat(filename);
  assert.ok(stat.isFile(), 'Driver must be a regular file, not a directory or symbolic link');
  const digest = createHash('sha256').update(await fs.readFile(filename)).digest('hex');
  assert.equal(digest, expectedDigest, 'ChromeDriver SHA-256 integrity mismatch; binary was not executed');
  return digest;
}

export async function exportDriverEnvironment(binaryPath, environmentFile) {
  assert.ok(!/[\r\n]/.test(binaryPath), 'Driver path must fit one environment-file line');
  await verifyIntegrity(binaryPath, provenance.binarySha256);
  await fs.appendFile(environmentFile, `TMC_E2E_DRIVER_PATH=${binaryPath}\n`, 'utf8');
}

export function verifyDriverVersion(driverOutput) {
  assert.equal(driverOutput.match(/^ChromeDriver (\d+\.\d+\.\d+\.\d+)\b/)?.[1], provenance.driverVersion,
    'Unexpected ChromeDriver version');
}

export function verifyVersions(driverOutput, versions) {
  verifyDriverVersion(driverOutput);
  assert.equal(versions.electron, provenance.electronVersion, 'Unexpected Electron version');
  assert.equal(versions.chrome, provenance.chromiumVersion, 'Incompatible actual Electron Chromium version');
}

export async function verifyDriver(driverPath, electronPath) {
  assert.equal(process.platform, provenance.platform, 'Driver pin is Windows-only');
  assert.equal(process.arch, provenance.architecture, 'Driver pin requires x64');
  const digest = await verifyIntegrity(driverPath, provenance.binarySha256);
  const driverOutput = execFileSync(driverPath, ['--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true }).trim();
  verifyDriverVersion(driverOutput);
  const versions = JSON.parse(execFileSync(electronPath, ['-p', 'JSON.stringify(process.versions)'], {
    encoding: 'utf8', timeout: 15000, windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  }));
  verifyVersions(driverOutput, versions);
  return { ...provenance, verifiedBinarySha256: digest, driverOutput, electronVersions: versions };
}

export function observeDriverTraffic() {
  const events = [];
  const subscriptions = [];
  function record(transport, url) {
    const parsed = new URL(url);
    const allowed = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
    events.push({ transport, origin: parsed.origin, allowed });
  }
  function subscribe(name, listener) {
    const topic = channel(name);
    topic.subscribe(listener);
    subscriptions.push(() => topic.unsubscribe(listener));
  }
  subscribe('undici:request:create', ({ request }) => record('undici', request.origin));
  subscribe('http.client.request.start', ({ request }) => record('http', `${request.protocol}//${request.host}`));
  return { events, close() { for (const unsubscribe of subscriptions) unsubscribe(); } };
}
