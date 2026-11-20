const assert = require('node:assert/strict');
const { test, mock, after } = require('node:test');
const { readChatReply } = require('../.test-build/shared/chat/TmcChatReply.js');
const { TmcTwitchIrcClient } = require('../.test-build/main/chat/TmcTwitchIrcClient.js');
const id = '885196de-cb67-427a-baa8-82f9b0fcd05f';
const reply = { parentMessageId: id, parentDisplayName: 'Viewer', parentText: 'hello <img>' };
const original = global.WebSocket;
class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances = [];
  readyState = 1;
  lines = [];
  constructor() { Socket.instances.push(this); }
  send(line) { this.lines.push(line.trim()); }
  close() { this.readyState = 3; }
}
global.WebSocket = Socket;
after(() => { global.WebSocket = original; });

test('IRC badges use supplied PRIVMSG and own USERSTATE metadata and reset across connections', () => {
  const received = [];
  const client = new TmcTwitchIrcClient({ onMessage: (message) => received.push(message) });
  client.connect({ channel: 'channel', username: 'viewer', accessToken: 'synthetic' });
  const socket = Socket.instances.at(-1);
  socket.onopen();
  socket.onmessage({ data: '@badges=moderator/1,vip/1 :other!other@irc PRIVMSG #channel :hello\r\n@badges=subscriber/12 :server USERSTATE #channel\r\n' });
  assert.deepEqual(received[0].badges, [{ setId: 'moderator', version: '1' }, { setId: 'vip', version: '1' }]);
  assert.deepEqual(client.sendMessage('channel', 'hello').badges, [{ setId: 'subscriber', version: '12' }]);
  client.disconnect();
  client.connect({ channel: 'channel', username: 'another', accessToken: 'synthetic-other' });
  Socket.instances.at(-1).onopen();
  assert.equal(client.sendMessage('channel', 'next').badges, undefined);
  client.disconnect();
});

test('IRC carries validated received colors and own USERSTATE color, reset on a different connection', () => {
  const messages = [];
  const client = new TmcTwitchIrcClient({ onMessage: (message) => messages.push(message) });
  client.connect({ channel: 'fixture-channel', username: 'viewer', accessToken: 'synthetic' });
  const socket = Socket.instances.at(-1);
  socket.onopen();
  socket.onmessage({ data: ':server GLOBALUSERSTATE\r\n@color=#00ff7f :fixture-bot!fixture-bot@irc PRIVMSG #fixture-channel :hello\r\n@color=not-a-color :other!other@irc PRIVMSG #fixture-channel :safe\r\n' });
  assert.equal(messages[0].color, '#00FF7F');
  assert.equal(messages[1].color, undefined);
  socket.onmessage({ data: '@color=#1e90ff :server GLOBALUSERSTATE\r\n' });
  assert.equal(client.sendMessage('fixture-channel', 'first').color, '#1E90FF');
  socket.onmessage({ data: '@color=#FF7F50 :server USERSTATE #wrong-channel\r\n' });
  assert.equal(client.sendMessage('fixture-channel', 'second').color, '#1E90FF');
  socket.onmessage({ data: '@color=#DA70D6 :server USERSTATE #fixture-channel\r\n' });
  assert.equal(client.sendMessage('fixture-channel', 'third').color, '#DA70D6');
  client.disconnect();
  client.connect({ channel: 'fixture-channel', username: 'other', accessToken: 'synthetic-other' });
  const next = Socket.instances.at(-1);
  next.onopen();
  assert.equal(client.sendMessage('fixture-channel', 'new account').color, undefined);
  client.disconnect();
});

test('reply metadata rejects injection, synthetic IDs and oversized previews', () => {
  assert.deepEqual(readChatReply(reply), reply);
  for (const candidate of [null, {}, { ...reply, parentMessageId: 'local-self-1' },
    { ...reply, parentMessageId: `${id}\r\nJOIN #wrong` }, { ...reply, parentText: 'x'.repeat(2001) },
    { ...reply, parentDisplayName: '' }, { ...reply, parentDisplayName: 1 }]) {
    assert.equal(readChatReply(candidate), undefined);
  }
});

test('real IRC client sends one tagged reply, preserves echo and rejects wrong channel/disconnected sends', () => {
  const client = new TmcTwitchIrcClient();
  client.connect({ channel: 'fixture-channel', username: 'viewer', accessToken: 'synthetic' });
  const socket = Socket.instances.at(-1);
  socket.onopen();
  const before = socket.lines.length;
  const echo = client.sendMessage('fixture-channel', 'my answer', reply);
  assert.equal(socket.lines.at(-1), `@reply-parent-msg-id=${id} PRIVMSG #fixture-channel :my answer`);
  assert.deepEqual(echo.reply, reply);
  assert.match(echo.id, /^local-self-/);
  assert.throws(() => client.sendMessage('other', 'wrong', reply), /channel changed/);
  assert.throws(() => client.sendMessage('fixture-channel', 'wrong', { ...reply, parentMessageId: 'bad;tag=1' }), /Invalid chat reply/);
  assert.throws(() => client.sendMessage('fixture-channel', 'line\nbreak', reply), /one line/);
  assert.equal(socket.lines.length, before + 1);
  client.disconnect();
  assert.throws(() => client.sendMessage('fixture-channel', 'offline', reply), /not connected/);
});

test('received reply tags decode once as text; malformed parent metadata keeps the message readable', () => {
  const messages = [];
  const client = new TmcTwitchIrcClient({ onMessage: (message) => messages.push(message) });
  client.connect({ channel: 'fixture-channel', username: 'viewer', accessToken: 'synthetic' });
  const socket = Socket.instances.at(-1);
  socket.onopen();
  socket.onmessage({ data: `@id=${id};reply-parent-msg-id=${id};reply-parent-display-name=Other;reply-parent-msg-body=hello\\sworld\\:\\\\s :other!other@irc PRIVMSG #fixture-channel :answer\r\n` });
  assert.deepEqual(messages[0].reply, { parentMessageId: id, parentDisplayName: 'Other', parentText: 'hello world;\\s' });
  socket.onmessage({ data: '@reply-parent-msg-id=bad :other!other@irc PRIVMSG #fixture-channel :still readable\r\n' });
  assert.equal(messages[1].reply, undefined);
  assert.equal(messages[1].text, 'still readable');
  client.disconnect();
});

test('received replies preserve validated recipient ID/login for account-specific highlighting', () => {
  const messages = [];
  const client = new TmcTwitchIrcClient({ onMessage: (message) => messages.push(message) });
  client.connect({ channel: 'fixture-channel', username: 'viewer', accessToken: 'synthetic' });
  const socket = Socket.instances.at(-1);
  socket.onopen();
  socket.onmessage({ data: `@reply-parent-msg-id=${id};reply-parent-display-name=Alice;reply-parent-user-id=123;reply-parent-user-login=alice :other!other@irc PRIVMSG #fixture-channel :answer\r\n` });
  assert.deepEqual(messages[0].reply, { parentMessageId: id, parentDisplayName: 'Alice', parentText: '', parentUserId: '123', parentUsername: 'alice' });
  client.disconnect();
});

const handlers = new Map();
const frame = { url: 'http://localhost:5173/' };
const sender = { mainFrame: frame, isDestroyed: () => false, send: () => {} };
global.MAIN_WINDOW_VITE_DEV_SERVER_URL = frame.url;
global.MAIN_WINDOW_VITE_NAME = 'main_window';
mock.module('electron', { cache: true, exports: {
  ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: (contents) => contents === sender ? { webContents: sender } : null },
} });
const { registerChatIpcHandlers } = require('../.test-build/main/ipc/registerChatIpcHandlers.js');
const { TMC_IPC_CHANNELS: IPC } = require('../.test-build/shared/ipc/IpcChannels.js');

test('send IPC requires trusted main frame, initiating account and connected channel, without replay', async () => {
  let session = { profileId: 'A', username: 'viewer', accessToken: 'synthetic' };
  const recorded = [];
  const controller = registerChatIpcHandlers({}, { getActiveSession: () => session }, undefined,
    async (profileId, message) => { recorded.push({ profileId, text: message.text }); });
  const event = { sender, senderFrame: frame };
  await handlers.get(IPC.CHAT_CONNECT_LIVE)(event, { channel: 'fixture-channel' });
  const socket = Socket.instances.at(-1);
  socket.onopen();
  const request = { profileId: 'A', channel: 'fixture-channel', text: 'answer', reply };
  const send = handlers.get(IPC.CHAT_SEND_MESSAGE);
  await send(event, request);
  const before = socket.lines.length;
  for (const invalid of [null, {}, { ...request, profileId: 'B' }, { ...request, channel: 'wrong' },
    { ...request, reply: { ...reply, parentMessageId: 'bad' } }, { ...request, text: 5 }]) {
    await assert.rejects(send(event, invalid));
  }
  await assert.rejects(send({ sender, senderFrame: { url: frame.url } }, request), /Untrusted/);
  await assert.rejects(send({ sender: {}, senderFrame: frame }, request), /Untrusted/);
  frame.url = 'https://www.twitch.tv/';
  await assert.rejects(send(event, request), /Untrusted/);
  frame.url = global.MAIN_WINDOW_VITE_DEV_SERVER_URL;
  session = { ...session, profileId: 'B' };
  await assert.rejects(send(event, request), /account changed/);
  assert.equal(socket.lines.length, before);
  assert.deepEqual(recorded, [{ profileId: 'A', text: 'answer' }], 'Only the successful explicit send records usage');
  controller.disconnectLive();
});

test('post-send favorite storage failure cannot turn one successful IRC write into a send failure or replay', async () => {
  const session = { profileId: 'A', username: 'viewer', accessToken: 'synthetic' };
  const controller = registerChatIpcHandlers({}, { getActiveSession: () => session }, undefined,
    async () => { throw new Error('synthetic-favorite-storage-failure'); });
  const event = { sender, senderFrame: frame };
  await handlers.get(IPC.CHAT_CONNECT_LIVE)(event, { channel: 'fixture-channel' });
  const socket = Socket.instances.at(-1);
  socket.onopen();
  const before = socket.lines.length;
  await assert.doesNotReject(handlers.get(IPC.CHAT_SEND_MESSAGE)(event, { profileId: 'A', channel: 'fixture-channel', text: 'answer' }));
  assert.equal(socket.lines.length, before + 1);
  controller.disconnectLive();
});
