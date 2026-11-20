const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseTwitchMessageContent: parse, twitchEmoteImageUrl: imageUrl } =
  require('../.test-build/shared/chat/TmcMessageContent.js');

test('Twitch positions preserve Unicode, repeated emotes, punctuation and exact whitespace', () => {
  const text = '  😀 Kappa  Kappa!';
  const result = parse(text, '25:11-15,4-8');
  assert.deepEqual(result, [
    { kind: 'text', text: '  😀 ' },
    { kind: 'emote', provider: 'twitch', id: '25', text: 'Kappa' },
    { kind: 'text', text: '  ' },
    { kind: 'emote', provider: 'twitch', id: '25', text: 'Kappa' },
    { kind: 'text', text: '!' },
  ]);
  assert.equal(result.map((piece) => piece.text).join(''), text);
});

test('adjacent emotes, literal markup and modern IDs retain exact message text', () => {
  const text = 'KappaHeyGuys <img src=x>';
  const result = parse(text, 'emotesv2_example:5-11/25:0-4');
  assert.equal(result.filter((piece) => piece.kind === 'emote').length, 2);
  assert.equal(result.map((piece) => piece.text).join(''), text);
  assert.deepEqual(result.at(-1), { kind: 'text', text: ' <img src=x>' });
});

test('ACTION emote offsets start at the action body, including its Unicode content', () => {
  const result = parse('\x01ACTION 😀 Kappa\x01', '25:2-6');
  assert.deepEqual(result, [
    { kind: 'text', text: '😀 ' },
    { kind: 'emote', provider: 'twitch', id: '25', text: 'Kappa' },
  ]);
  assert.deepEqual(parse('\x01ACTION waves\x01'), [{ kind: 'text', text: 'waves' }]);
});

test('missing metadata does not guess emotes from names', () => {
  assert.deepEqual(parse('Kappa <3 😀'), [{ kind: 'text', text: 'Kappa <3 😀' }]);
});

test('identical duplicate occurrences render once, but conflicting overlaps fall back to text', () => {
  assert.equal(parse('Kappa', '25:0-4,0-4').length, 1);
  assert.equal(parse('Kappa', '25:0-4,0-4')[0].kind, 'emote');
  assert.deepEqual(parse('Kappa', '25:0-4/26:0-4'), [{ kind: 'text', text: 'Kappa' }]);
});

for (const metadata of ['25:0-99', '25:3-1', '25:-1-3', '25:NaN-4', '25:0-1/26:1-3',
  '25:0-9007199254740992', '25:', '25:0-4/', '../evil:0-4', 'https://evil:0-4',
  '25:0-5', '25:0-4,', '25:0-4:extra', '25:0-4/'.repeat(3000)]) {
  test('malformed or excessive metadata preserves readable text', () => {
    assert.deepEqual(parse('Kappa x', metadata), [{ kind: 'text', text: 'Kappa x' }]);
  });
}

test('CDN addresses are fixed and reject URL injection or unbounded identifiers', () => {
  assert.equal(imageUrl('25'), 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0');
  assert.ok(imageUrl('emotesv2_example-1').startsWith('https://static-cdn.jtvnw.net/'));
  for (const id of ['', '../evil', '25?x=y', '25#x', 'https://evil', '0'.repeat(129)]) {
    assert.equal(imageUrl(id), null);
  }
});
