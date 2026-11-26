const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readChatBadges } = require('../.test-build/shared/chat/TmcChatBadges.js');

test('transport badge metadata stays bounded and deduplicated without inferring author roles', () => {
  assert.deepEqual(readChatBadges('moderator/1,subscriber/12,moderator/2,bad/1/2,broken'), [
    { setId: 'moderator', version: '1' }, { setId: 'subscriber', version: '12' },
  ]);
  assert.deepEqual(readChatBadges([{ set_id: 'vip', id: '1' }]), [{ setId: 'vip', version: '1' }]);
  for (const invalid of [null, 'x'.repeat(2049), Array(21).fill({ setId: 'vip', version: '1' }), [{ setId: '<img>', version: '1' }]]) {
    assert.deepEqual(readChatBadges(invalid), []);
  }
});
