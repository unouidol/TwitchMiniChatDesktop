const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TmcChatScrollController } = require('../.test-build/renderer/chat/TmcChatScrollController.js');

class ChatViewport extends EventTarget {
  constructor() { super(); this.scrollHeight = 1000; this.clientHeight = 400; this.position = 0; }
  get scrollTop() { return this.position; }
  set scrollTop(value) { this.position = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); }
}

test('opening and closing an integrated panel keeps a following chat at the latest message', () => {
  const chat = new ChatViewport();
  const button = new EventTarget();
  const controller = new TmcChatScrollController(chat, button);
  controller.handleInitialHistoryLoaded();
  assert.equal(chat.scrollTop, 600);
  chat.clientHeight = 200;
  controller.notifyViewportChanged();
  assert.equal(chat.scrollTop, 800);
  chat.clientHeight = 400;
  controller.notifyViewportChanged();
  assert.equal(chat.scrollTop, 600);
  controller.destroy();
});

test('resizing chat for the emote panel does not pull a reader away from older messages', () => {
  const chat = new ChatViewport();
  const button = new EventTarget();
  const controller = new TmcChatScrollController(chat, button);
  controller.handleInitialHistoryLoaded();
  chat.scrollTop = 100;
  chat.dispatchEvent(new Event('scroll'));
  controller.notifyMessagesAppended();
  assert.equal(button.hidden, false);
  chat.clientHeight = 200;
  controller.notifyViewportChanged();
  assert.equal(chat.scrollTop, 100);
  assert.equal(button.hidden, false);
  chat.clientHeight = 400;
  controller.notifyViewportChanged();
  assert.equal(chat.scrollTop, 100);
  controller.destroy();
});

test('explicit mention navigation pauses following and retains the existing new-message indicator owner', () => {
  const chat = new ChatViewport();
  const button = new EventTarget();
  const controller = new TmcChatScrollController(chat, button);
  controller.handleInitialHistoryLoaded();
  let focused = false;
  controller.revealMessage({
    scrollIntoView(options) { assert.equal(options.block, 'center'); chat.scrollTop = 100; },
    focus(options) { assert.equal(options.preventScroll, true); focused = true; },
  });
  assert.equal(focused, true);
  controller.notifyMessagesAppended();
  assert.equal(chat.scrollTop, 100);
  assert.equal(button.hidden, false);
  controller.destroy();
});

test('a near-bottom reveal ignores its queued scroll event until the reader moves or jumps', () => {
  const chat = new ChatViewport();
  const button = new EventTarget();
  const controller = new TmcChatScrollController(chat, button);
  controller.handleInitialHistoryLoaded();
  controller.revealMessage({ scrollIntoView() { chat.scrollTop = 580; }, focus() {} });
  chat.dispatchEvent(new Event('scroll'));
  controller.notifyMessagesAppended();
  assert.equal(chat.scrollTop, 580);
  assert.equal(button.hidden, false);
  chat.scrollTop = 590;
  chat.dispatchEvent(new Event('scroll'));
  controller.notifyMessagesAppended();
  assert.equal(chat.scrollTop, 600);
  assert.equal(button.hidden, true);
  controller.revealMessage({ scrollIntoView() { chat.scrollTop = 580; }, focus() {} });
  button.dispatchEvent(new Event('click'));
  controller.notifyMessagesAppended();
  assert.equal(chat.scrollTop, 600);
  controller.destroy();
});
