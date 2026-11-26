const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readTwitchNameColor, chatNameColor } = require('../.test-build/shared/chat/TmcChatNameColor.js');

test('Twitch name colors accept only exact RGB metadata, including black, and never arbitrary CSS', () => {
  assert.equal(readTwitchNameColor('#12aBcD'), '#12ABCD');
  assert.equal(readTwitchNameColor('#000000'), '#000000');
  for (const value of [undefined, null, 123, '', '#fff', '#FFFFFFFF', 'red', ' #123456 ', '#12345g',
    'rgb(1,2,3)', 'url(https://invalid)', '#123456;background:red', '#123456\n']) {
    assert.equal(readTwitchNameColor(value), undefined);
  }
});

test('unset name colors stay stable across capitalization and use different colors for different users', () => {
  assert.equal(chatNameColor(' Viewer '), chatNameColor('viewer'));
  assert.equal(chatNameColor('viewer', 'invalid'), chatNameColor('viewer'));
  assert.notEqual(chatNameColor('fixture-viewer'), chatNameColor('fixture-other-viewer'));
  assert.match(chatNameColor(''), /^#[A-F0-9]{6}$/);
});

test('provider colors take precedence for ordinary and bot usernames alike', () => {
  assert.equal(chatNameColor('fixture-viewer', '#1e90ff'), '#1E90FF');
  assert.equal(chatNameColor('fixture-bot', '#00ff7f'), '#00FF7F');
});
