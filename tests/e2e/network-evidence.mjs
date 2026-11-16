import assert from 'node:assert/strict';

export function verifyNetworkEvidence(value, reason = 'will-quit', deniedTransport) {
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.collectionComplete, true, 'Application network collection must complete');
  assert.equal(value.completionReason, reason);
  assert.ok(Array.isArray(value.events));
  assert.deepEqual(value.installed, { mainFetch: true, mainWebSocket: true, chromium: true });
  const transports = Object.keys(value.installed);
  for (const event of value.events) {
    assert.ok(transports.includes(event.transport));
    assert.equal(typeof event.allowed, 'boolean');
    assert.deepEqual(Object.keys(event).sort(), ['allowed', 'origin', 'scheme', 'transport']);
    assert.equal(typeof event.scheme, 'string');
    assert.equal(typeof event.origin, 'string');
    if (event.origin !== 'null') assert.equal(new URL(event.origin).origin, event.origin);
  }
  for (const transport of transports) {
    assert.equal(typeof value.scopes[transport], 'string');
    for (const outcome of ['allowed', 'denied']) {
      assert.equal(value.counts[transport][outcome], value.events.filter((event) =>
        event.transport === transport && event.allowed === (outcome === 'allowed')).length);
    }
    assert.equal(value.counts[transport].denied, deniedTransport === transport ? 1 : 0);
    if (!deniedTransport || deniedTransport === transport) assert.ok(value.counts[transport].allowed > 0);
  }
  if (!deniedTransport || deniedTransport === 'chromium') assert.ok(value.chromiumSessions > 0);
  return value;
}
