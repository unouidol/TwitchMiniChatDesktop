import assert from 'node:assert/strict';
import path from 'node:path';
import { settledNativeViews } from './native-layout.mjs';

export async function exerciseAppearance(browser, fixture, evidence, readNativeViews) {
  const nativeBefore = await settledNativeViews(browser, readNativeViews);
  const sentBefore = fixture.sentMessages.length;
  const account = await browser.$('[data-tmc-account-select]').getValue();
  const channel = await browser.$('#channelInput').getValue();
  const draft = await browser.$('#messageInput').getValue();
  await browser.$('[data-tmc-chat-appearance] summary').click();
  const font = await browser.$('#chatFontSize');
  const density = await browser.$('#chatDensity');
  await font.waitForEnabled();
  await browser.execute('window.appearanceRow = document.querySelector("#chatList .tmc-message")');
  for (const size of ['14', '20', '18']) {
    await font.selectByAttribute('value', size);
    await font.waitForEnabled();
    assert.equal(await browser.execute('return getComputedStyle(document.querySelector("#chatList .tmc-message")).fontSize'), `${size}px`);
  }
  const normalPadding = await browser.execute('return parseFloat(getComputedStyle(document.querySelector("#chatList .tmc-message")).paddingTop)');
  await density.selectByAttribute('value', 'compact');
  await density.waitForEnabled();
  assert.ok(await browser.execute('return parseFloat(getComputedStyle(document.querySelector("#chatList .tmc-message")).paddingTop)') < normalPadding);
  assert.equal(await browser.execute('return window.appearanceRow === document.querySelector("#chatList .tmc-message")'), true, 'Appearance never rebuilds chat or its controls');
  assert.equal(await browser.$('[data-tmc-account-select]').getValue(), account);
  assert.equal(await browser.$('#channelInput').getValue(), channel);
  assert.equal(await browser.$('#messageInput').getValue(), draft);
  assert.equal(fixture.sentMessages.length, sentBefore);
  assert.deepEqual(await settledNativeViews(browser, readNativeViews), nativeBefore);
  await browser.saveScreenshot(path.join(evidence, 'chat-appearance.png'));
  await browser.$('[data-tmc-chat-appearance] summary').click();
  await browser.execute('delete window.appearanceRow');
}

export async function verifyAppearanceRestart(browser) {
  await browser.waitUntil(async () => (await browser.$('#chatFontSize').isEnabled()));
  assert.equal(await browser.$('#chatFontSize').getValue(), '18');
  assert.equal(await browser.$('#chatDensity').getValue(), 'compact');
  assert.equal(await browser.$('#chatTimestamps').isSelected(), false);
  assert.equal(await browser.execute('return document.querySelector("#chatList").dataset.timestamps'), 'hidden');
  assert.equal(await browser.execute('return getComputedStyle(document.querySelector("#chatList .tmc-message")).fontSize'), '18px');
}
