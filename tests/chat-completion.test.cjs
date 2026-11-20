const assert = require('node:assert/strict');
const { test } = require('node:test');
const { completionToken, completionChoices, completionEdit } = require('../.test-build/renderer/chat/TmcChatCompletion.js');
const catalog = {
  profileId: 'A', channel: 'channel', personalPermission: true, favoritesSaveFailed: false,
  favorites: [{ id: '25', name: 'Kappa', category: 'global', availability: 'available' }],
  emotes: [
    { id: '1902', name: 'Keepo', category: 'channel', availability: 'available' },
    { id: '1902', name: 'Keepo', category: 'personal', availability: 'available' },
    { id: '999', name: 'Locked', category: 'channel', availability: 'locked' },
    { id: '998', name: 'Unknown', category: 'channel', availability: 'unknown' },
    { id: '25', name: 'Kappa', category: 'global', availability: 'available' },
    { id: '26', name: '<3', category: 'global', availability: 'available' },
    { id: '27', name: ':)', category: 'global', availability: 'available' },
  ],
};
const atEnd = (text) => completionToken(text, text.length, text.length);

test('triggers use the current collapsed caret word, including empty and symbolic emote queries', () => {
  assert.deepEqual(atEnd('hello @fi'), { kind: 'user', start: 6, end: 9, query: 'fi' });
  assert.deepEqual(atEnd('😀 :Ka'), { kind: 'emote', start: 3, end: 6, query: 'Ka' });
  assert.equal(atEnd('@').query, '');
  assert.equal(atEnd(':<').query, '<');
  assert.equal(atEnd('::').query, ':');
  assert.equal(completionToken('hi :kappa, world', 7, 7).end, 9);
  assert.equal(completionToken(':Kappa', 0, 0), null);
  assert.equal(completionToken(':Kappa', 3, 6), null);
});

test('URLs, emails, times, overlong words and invalid user prefixes never open completion', () => {
  for (const text of ['https://example.test', 'name@example.test', '12:30', 'word:Ka', '@bad-name',
    `:${'x'.repeat(130)}`, `@${'x'.repeat(26)}`, `${'x'.repeat(30)}:${'y'.repeat(129)}`]) {
    assert.equal(atEnd(text), null, text);
  }
  assert.equal(completionToken('@ok', -1, -1), null);
  assert.equal(completionToken('@ok', 99, 99), null);
});

test('user candidates are recent seen logins, case-insensitive, unique, bounded and prefix-matched', () => {
  const choices = completionChoices(atEnd('@FI'), ['fixture_one', 'fixture_two', 'Fixture_one', 'not-valid-name', 'other'], null);
  assert.deepEqual(choices.map((choice) => choice.value), ['fixture_one', 'fixture_two']);
  assert.equal(completionChoices(atEnd('@'), Array.from({ length: 1500 }, (_, index) => `user${index}`), null).length, 20);
  assert.equal(completionChoices(atEnd('@one'), ['fixture_one'], null).length, 0);
});

test('emote suggestions prioritize prefix/favorites, preserve exact code, deduplicate and exclude unusable emotes', () => {
  assert.deepEqual(completionChoices(atEnd(':'), [], catalog).map((choice) => choice.value), ['Kappa', 'Keepo', '<3', ':)']);
  assert.deepEqual(completionChoices(atEnd(':ka'), [], catalog).map((choice) => choice.value), ['Kappa']);
  assert.deepEqual(completionChoices(atEnd(':app'), [], catalog).map((choice) => choice.value), ['Kappa']);
  assert.deepEqual(completionChoices(atEnd(':<'), [], catalog).map((choice) => choice.value), ['<3']);
  assert.deepEqual(completionChoices(atEnd('::'), [], catalog).map((choice) => choice.value), [':)']);
  assert.deepEqual(completionChoices(atEnd(':'), [], null), []);
  const many = { ...catalog, emotes: Array.from({ length: 1000 }, (_, index) => ({ id: String(index), name: `Code${index}`, category: 'global', availability: 'available' })) };
  assert.equal(completionChoices(atEnd(':Code'), [], many).length, 20);
});

test('completion replaces the active word while retaining surrounding Unicode draft, suffix and punctuation', () => {
  const text = '😀 hi :kappa, world';
  const caret = '😀 hi :kap'.length;
  const token = completionToken(text, caret, caret);
  const edit = completionEdit(text, token, { kind: 'emote', value: 'Kappa', id: '25' });
  assert.equal(edit.value, '😀 hi Kappa, world');
  assert.equal(edit.caret, '😀 hi Kappa'.length);
  assert.deepEqual(completionEdit('@fi', atEnd('@fi'), { kind: 'user', value: 'fixture_one' }), { value: '@fixture_one ', caret: 13 });
  const middle = completionToken(':Ka world', 3, 3);
  assert.deepEqual(completionEdit(':Ka world', middle, { kind: 'emote', value: 'Kappa', id: '25' }), { value: 'Kappa world', caret: 6 });
});
