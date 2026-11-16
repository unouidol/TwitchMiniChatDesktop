import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { provenance, verifyIntegrity, verifyVersions } from './driver.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));

test('launcher rejects absent, missing, non-file and tampered drivers before application startup', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmc-driver-negative-'));
  try {
    const tampered = path.join(root, 'tampered.exe');
    await fs.copyFile(process.env.TMC_E2E_DRIVER_PATH, tampered);
    const handle = await fs.open(tampered, 'r+');
    try {
      const firstByte = Buffer.alloc(1);
      await handle.read(firstByte, 0, 1, 0);
      firstByte[0] ^= 255;
      await handle.write(firstByte, 0, 1, 0);
    } finally {
      await handle.close();
    }
    const cases = [
      { name: 'unconfigured', value: undefined, diagnostic: /Explicit absolute TMC_E2E_DRIVER_PATH/ },
      { name: 'missing', value: path.join(root, 'missing.exe'), diagnostic: /ENOENT/ },
      { name: 'non-file', value: root, diagnostic: /regular file/ },
      { name: 'tampered', value: tampered, diagnostic: /SHA-256 integrity mismatch/ },
    ];
    for (const entry of cases) {
      const env = { ...process.env };
      delete env.TMC_E2E_DRIVER_PATH;
      if (entry.value) env.TMC_E2E_DRIVER_PATH = entry.value;
      const result = spawnSync(process.execPath, ['tests/e2e/account-removal.mjs'], {
        cwd: project, env, encoding: 'utf8', timeout: 30000, windowsHide: true,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 1, entry.name);
      assert.match(result.stderr, entry.diagnostic);
      assert.doesNotMatch(result.stdout, /vite .*building|Starting ChromeDriver|PASS:/);
      const evidence = result.stdout.match(/Diagnostics: (.+)/)?.[1]?.trim();
      assert.ok(evidence, 'Failure evidence must be retained');
      const files = await fs.readdir(evidence);
      assert.ok(files.includes('failure.txt'));
      assert.equal(files.some((name) => /^(first|restart)(\.json|-driver.log|-electron.log)$/.test(name)), false);
    }
  } finally {
    assert.equal(path.dirname(await fs.realpath(root)), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('tmc-driver-negative-'));
    await fs.rm(root, { recursive: true });
  }
});

test('version gate rejects mismatched driver, Electron and Chromium before remote can be called', () => {
  const valid = { electron: provenance.electronVersion, chrome: provenance.chromiumVersion };
  const output = `ChromeDriver ${provenance.driverVersion} (official)`;
  verifyVersions(output, valid);
  assert.throws(() => verifyVersions('ChromeDriver 149.0.0.0', valid), /Unexpected ChromeDriver version/);
  assert.throws(() => verifyVersions(output, { ...valid, electron: '42.0.0' }), /Unexpected Electron version/);
  assert.throws(() => verifyVersions(output, { ...valid, chrome: '149.0.0.0' }), /Incompatible actual Electron Chromium/);
});

test('provisioned driver matches the independently authenticated archive-derived pin', async () => {
  assert.equal(await verifyIntegrity(process.env.TMC_E2E_DRIVER_PATH, provenance.binarySha256), provenance.binarySha256);
});
