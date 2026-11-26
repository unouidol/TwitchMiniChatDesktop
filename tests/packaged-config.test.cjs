const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test, mock } = require('node:test');

mock.module('electron', { cache: true, exports: { app: { isPackaged: true, getVersion: () => '7.8.9-packaged' } } });

test('packaged runtime uses its executable version and never probes working-directory developer properties', (context) => {
  let probes = 0;
  context.mock.method(fs, 'existsSync', () => { probes++; throw new Error('Unexpected developer-file probe'); });
  const { TMC_RUNTIME_CONFIG } = require('../.test-build/main/config/TmcRuntimeConfig.js');
  const { readLocalPropertiesFromProjectRoot } = require('../.test-build/main/config/LocalPropertiesReader.js');
  assert.equal(TMC_RUNTIME_CONFIG.desktopClientVersion, '7.8.9-packaged');
  assert.deepEqual(readLocalPropertiesFromProjectRoot(), {});
  assert.equal(probes, 0);
});
