const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const { externalChatUrl, linkifyChatText } = require('../.test-build/shared/chat/TmcChatLinks.js');

test('link parsing preserves Unicode/whitespace, balanced parentheses and surrounding prose punctuation', () => {
  const text = '  😀 (https://example.test/a_(b)). HTTP://Example.test:80/x?y=1&z=2! <https://example.test/next>  ';
  const pieces = linkifyChatText(text);
  assert.equal(pieces.map((piece) => piece.text).join(''), text);
  assert.deepEqual(pieces.filter((piece) => piece.kind === 'link').map((piece) => piece.href), [
    'https://example.test/a_(b)', 'http://example.test/x?y=1&z=2', 'https://example.test/next',
  ]);
  assert.equal(linkifyChatText('https://[::1]/path')[0].href, 'https://[::1]/path');
  assert.equal(linkifyChatText("'https://example.test/o'reilly'").find((piece) => piece.kind === 'link').text, "https://example.test/o'reilly");
});

test('only explicit HTTP/S is recognized; malformed/user-info/control/file/script URLs stay inert', () => {
  const bad = ['javascript:alert(1)', 'data:text/html,hello', 'file:///C:/Windows', 'mailto:a@example.test',
    '//example.test/a', 'https:example.test', 'https://', 'https://user:pass@example.test', 'https://@example.test',
    'https://example.test/\npath', 'https://example.test/ path', 'https://example.test/\\path',
    `https://example.test/${'x'.repeat(4096)}`];
  for (const value of bad) assert.equal(externalChatUrl(value), null);
  for (const text of ['javascript:alert(1) file:///C:/Windows', 'www.example.test', 'abchttps://example.test', 'x@https://example.test', 'https://user:pass@example.test']) {
    assert.equal(linkifyChatText(text).some((piece) => piece.kind === 'link'), false);
    assert.equal(linkifyChatText(text).map((piece) => piece.text).join(''), text);
  }
  assert.equal(externalChatUrl('https://example.test/a%20b#part'), 'https://example.test/a%20b#part');
  assert.equal(externalChatUrl('https://example.test/caffè'), 'https://example.test/caff%C3%A8');
  assert.equal(externalChatUrl(`https://example.test/${'😀'.repeat(400)}`), null, 'Canonical URL length is bounded too');
  assert.equal(externalChatUrl(null), null);
});

test('link count budgets bound rendering while retaining the exact full message text', () => {
  const text = Array.from({ length: 120 }, (_, index) => `https://example.test/${index}`).join(' ');
  const pieces = linkifyChatText(text);
  assert.equal(pieces.filter((piece) => piece.kind === 'link').length, 100);
  assert.equal(pieces.map((piece) => piece.text).join(''), text);
  assert.equal(linkifyChatText(text, 1).filter((piece) => piece.kind === 'link').length, 1);
  assert.deepEqual(linkifyChatText(text, 0), [{ kind: 'text', text }]);
});

test('oversized candidates including long punctuation tails remain inert without repeated bracket rescans', () => {
  const text = 'https://example.test/' + ')'.repeat(100000);
  assert.deepEqual(linkifyChatText(text), [{ kind: 'text', text }]);
  const bounded = 'https://example.test/(page)' + ')'.repeat(3000);
  assert.equal(linkifyChatText(bounded).find((piece) => piece.kind === 'link').href, 'https://example.test/(page)');
});

let openHandler;
let browserFailure = false;
const opened = [];
const frame = { url: 'http://localhost:5173/' };
const sender = { mainFrame: frame };
let windowOpen;
let navigation;
const contents = { setWindowOpenHandler(handler) { windowOpen = handler; },
  on(event, handler) { if (event === 'will-navigate') navigation = handler; } };
global.MAIN_WINDOW_VITE_DEV_SERVER_URL = frame.url;
global.MAIN_WINDOW_VITE_NAME = 'main_window';
mock.module('electron', { cache: true, exports: {
  ipcMain: { handle: (_channel, handler) => { openHandler = handler; } },
  shell: { async openExternal(url) { opened.push(url); if (browserFailure) throw new Error('synthetic-private-OS-cause'); } },
  BrowserWindow: class {
    static fromWebContents(candidate) { return candidate === sender ? { webContents: sender } : null; }
    webContents = contents;
    async loadURL() {}
  },
} });
const { registerChatLinkIpcHandlers } = require('../.test-build/main/ipc/registerChatLinkIpcHandlers.js');
const { createMainWindow } = require('../.test-build/main/windows/createMainWindow.js');

test('main link handler validates local frame and URL before calling only the browser boundary', async () => {
  registerChatLinkIpcHandlers();
  const event = { sender, senderFrame: frame };
  await openHandler(event, { url: 'HTTPS://Example.test/path' });
  assert.deepEqual(opened, ['https://example.test/path']);
  for (const request of [null, {}, { url: 1 }, { url: 'javascript:alert(1)' }, { url: 'file:///C:/Windows' },
    { url: 'https://user:pass@example.test' }, { url: 'https://example.test/\nmalformed' }]) {
    await assert.rejects(openHandler(event, request), /Invalid chat link/);
  }
  await assert.rejects(openHandler({ sender, senderFrame: { url: frame.url } }, { url: 'https://example.test' }), /Untrusted/);
  frame.url = 'https://www.twitch.tv/';
  await assert.rejects(openHandler(event, { url: 'https://example.test' }), /Untrusted/);
  frame.url = global.MAIN_WINDOW_VITE_DEV_SERVER_URL;
  assert.equal(opened.length, 1);
  browserFailure = true;
  await assert.rejects(openHandler(event, { url: 'https://example.test/fail' }), (error) => {
    assert.match(error.message, /Could not open/);
    assert.doesNotMatch(error.message, /private-OS-cause/);
    return true;
  });
  browserFailure = false;
});

test('main shell window denies renderer popups/navigation and does not open an external browser implicitly', () => {
  const before = opened.length;
  createMainWindow();
  assert.deepEqual(windowOpen({ url: 'https://example.test' }), { action: 'deny' });
  let prevented = false;
  navigation({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(opened.length, before);
});
