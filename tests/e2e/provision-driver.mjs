import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportDriverEnvironment, provenance, verifyIntegrity } from './driver.mjs';

assert.equal(process.platform, provenance.platform);
assert.equal(process.arch, provenance.architecture);
const parent = fileURLToPath(new URL('../../.test-build/electron-e2e/', import.meta.url));
await fs.mkdir(parent, { recursive: true });
const destination = await fs.mkdtemp(path.join(parent, 'provisioned-driver-'));
const archive = path.join(destination, 'driver.zip');
const response = await fetch(provenance.sourceUrl, { signal: AbortSignal.timeout(120000) });
assert.equal(response.status, 200, 'Official ChromeDriver archive download failed');
await fs.writeFile(archive, Buffer.from(await response.arrayBuffer()));
await verifyIntegrity(archive, provenance.archiveSha256);
const extracted = path.join(destination, 'verified');
execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command',
  '$ErrorActionPreference = "Stop"; Expand-Archive -LiteralPath $env:TMC_DRIVER_ARCHIVE -DestinationPath $env:TMC_DRIVER_DESTINATION'], {
  windowsHide: true, timeout: 60000,
  env: { ...process.env, TMC_DRIVER_ARCHIVE: archive, TMC_DRIVER_DESTINATION: extracted },
});
const binary = path.join(extracted, 'chromedriver.exe');
await verifyIntegrity(binary, provenance.binarySha256);
await fs.writeFile(path.join(destination, 'provenance.json'), JSON.stringify({ ...provenance, binaryPath: binary }, null, 2));
if (process.env.GITHUB_ENV) await exportDriverEnvironment(binary, process.env.GITHUB_ENV);
console.log(`Verified official driver (not executed): ${binary}`);
console.log('Set TMC_E2E_DRIVER_PATH explicitly to this path before npm run test:e2e.');
