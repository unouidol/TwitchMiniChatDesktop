const assert = require('node:assert/strict');
const { test } = require('node:test');
const { chatAttention } = require('../.test-build/shared/chat/TmcChatAttention.js');
const { readChatReply } = require('../.test-build/shared/chat/TmcChatReply.js');
const account = { profileId: 'A', username: 'alice', userId: '123' };
const message = (text, extra = {}) => ({ text, author: 'other', ...extra });
const reply = { parentMessageId: '885196de-cb67-427a-baa8-82f9b0fcd05f', parentDisplayName: 'Alice', parentText: 'original' };

test('whole login mentions support case, @, Unicode punctuation, multiple mentions and ordinary words', () => {
  for (const text of ['@alice', 'Hi ALICE!', '(Alice), thanks', '😀 @ALICE?', 'one\n@alice\ntwo', '«alice»', '!game @alice', '@alice @alice']) {
    assert.deepEqual(chatAttention(message(text), account), { profileId: 'A', kind: 'mention' }, text);
  }
  assert.deepEqual(chatAttention(message('hello @a_b'), { ...account, username: 'a_b' }), { profileId: 'A', kind: 'mention' });
});

test('substrings, identifier boundaries, emails, URLs and another account never count as mentions', () => {
  for (const text of ['malice', 'alice123', 'alice_bot', 'alice-bot', '@@alice', 'éalice', 'alice\u0301',
    'alice@example.test', 'person@alice.test', 'https://example.test/alice', '(http://example.test/@alice)', 'www.example.test/alice']) {
    assert.equal(chatAttention(message(text), account), undefined, text);
  }
  assert.equal(chatAttention(message('@alice'), { ...account, profileId: 'B', username: 'bob', userId: '456' }), undefined);
  assert.equal(chatAttention(message('@alice'), null), undefined);
  assert.equal(chatAttention(message('anything'), { ...account, username: 'bad.*' }), undefined);
});

test('reply identity uses stable user ID first and login only when ID is absent, never display name or quoted text', () => {
  assert.deepEqual(chatAttention(message('answer', { reply: { ...reply, parentUserId: '123', parentUsername: 'old_name' } }), account), { profileId: 'A', kind: 'reply' });
  assert.deepEqual(chatAttention(message('answer', { reply: { ...reply, parentUsername: 'ALICE' } }), account), { profileId: 'A', kind: 'reply' });
  assert.equal(chatAttention(message('answer', { reply: { ...reply, parentUserId: '456', parentUsername: 'alice' } }), account), undefined);
  assert.equal(chatAttention(message('answer', { reply: { ...reply, parentText: '@alice quoted', parentDisplayName: 'alice' } }), account), undefined);
  assert.deepEqual(chatAttention(message('@alice, answer', { reply: { ...reply, parentUserId: '456' } }), account), { profileId: 'A', kind: 'mention' });
});

test('self messages never highlight, and attention results contain no account credentials', () => {
  assert.equal(chatAttention(message('@alice', { author: 'ALICE' }), account), undefined);
  assert.equal(chatAttention(message('@alice', { isSelf: true }), account), undefined);
  assert.equal(chatAttention(message('self reply', { author: 'alice', reply: { ...reply, parentUserId: '123' } }), account), undefined);
  assert.deepEqual(Object.keys(chatAttention(message('@alice'), { ...account, accessToken: 'synthetic-private' })).sort(), ['kind', 'profileId']);
});

test('optional reply identities are bounded and malformed metadata cannot manufacture recipient identity', () => {
  assert.equal(readChatReply({ ...reply, parentUserId: '123', parentUsername: 'alice' }).parentUserId, '123');
  for (const extra of [{ parentUserId: '' }, { parentUserId: 'x'.repeat(129) }, { parentUserId: '123\r\n' },
    { parentUsername: 'bad name' }, { parentUsername: 'x'.repeat(65) }, { parentUserId: 123 }]) {
    assert.equal(readChatReply({ ...reply, ...extra }), undefined);
  }
});
