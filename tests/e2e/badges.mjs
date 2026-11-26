import assert from 'node:assert/strict';
import path from 'node:path';
import { settledNativeViews } from './native-layout.mjs';

/** Supplied transport metadata must not introduce badges in either feed. */
export async function exerciseBadgeFreeChat(browser, fixture, evidence, readNativeViews) {
  const sentBefore = fixture.sentMessages.length;
  assert.equal(await browser.execute(() => 'badges' in globalThis.window.tmc), false, 'No unused badge catalog bridge');
  fixture.setBadgeMessages(true);
  try {
    await browser.$('#loadHistoryButton').click();
    const history = await browser.$('[data-tmc-message-id="badge-history"]');
    await history.waitForDisplayed();
    const nativeBefore = await settledNativeViews(browser, readNativeViews);
    assert.equal((await history.$$('.tmc-chat-badges, [data-tmc-badge], img')).length, 0);
    assert.match(await history.getText(), /Supplied Twitch badges/);
    assert.doesNotMatch(await history.getText(), /Broadcaster|Moderator|VIP|Subscriber|Founder|mystery/);
    const author = await history.$('[data-tmc-author-login]');
    assert.equal(await author.getAttribute('data-tmc-author-login'), 'fixture_badge_user');
    assert.equal(await author.getAttribute('data-tmc-color-source'), 'provided');
    assert.equal((await browser.$$('[data-tmc-message-id="badge-missing"] [data-tmc-badge]')).length, 0);
    await browser.waitUntil(async () => (await browser.$('[data-tmc-live-status]').getText()) === 'Live: connected');
    fixture.sendBadgeMessage();
    const live = await browser.$('[data-tmc-message-id="badge-live"]');
    await live.waitForDisplayed();
    assert.match(await live.getText(), /Live badge metadata/);
    assert.equal((await live.$$('.tmc-chat-badges, [data-tmc-badge], img')).length, 0);
    assert.doesNotMatch(await live.getText(), /Moderator|VIP/);
    assert.deepEqual(await settledNativeViews(browser, readNativeViews), nativeBefore);
    await browser.saveScreenshot(path.join(evidence, 'badge-free-chat.png'));
    await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'B');
    await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-b'));
    await browser.$('[data-tmc-message-id="badge-history"]').waitForDisplayed();
    assert.equal((await browser.$$('#chatList .tmc-chat-badges, #chatList [data-tmc-badge]')).length, 0);
    await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'A');
    await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-a'));
    await browser.$('#openChannelButton').waitForEnabled();
  } finally {
    fixture.setBadgeMessages(false);
  }
  await browser.$('#loadHistoryButton').click();
  await browser.$('#loadHistoryButton').waitForEnabled();
  assert.equal(fixture.sentMessages.length, sentBefore, 'Badge removal never sends or replays chat');
}
