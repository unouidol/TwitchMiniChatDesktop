import assert from 'node:assert/strict';
import path from 'node:path';
import { settledNativeViews } from './native-layout.mjs';

export async function exerciseBadges(browser, fixture, evidence, readNativeViews) {
  const sentBefore = fixture.sentMessages.length;
  const synthetic = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" rx="5" fill="#a78bfa"/></svg>');
  await browser.execute(`
    const prototype = HTMLImageElement.prototype;
    const original = Object.getOwnPropertyDescriptor(prototype, 'src');
    const fixtureImage = arguments[0];
    Object.defineProperty(prototype, 'src', { ...original, set(value) {
      if (!/^https:\\/\\/static-cdn\\.jtvnw\\.net\\/badges\\/v1\\/00000000-0000-0000-0000-00000000000[1-6]\\/2$/.test(value)) throw new Error('Unexpected badge image boundary');
      original.set.call(this, value.includes('000000000006') ? 'data:image/png;base64,AAAA' : fixtureImage);
    } });
    document.addEventListener('synthetic-badge-boundary-reset', () => Object.defineProperty(prototype, 'src', original), { once: true });
  `, synthetic);
  fixture.setBadgeMessages(true);
  await browser.$('#loadHistoryButton').click();
  const row = await browser.$('[data-tmc-message-id="badge-history"]');
  await row.waitForDisplayed();
  const nativeBefore = await settledNativeViews(browser, readNativeViews);
  await browser.waitUntil(async () => (await row.$$('.tmc-chat-badge-image img')).length === 4);
  await browser.waitUntil(async () => (await row.$('[data-tmc-badge="founder/1"]').getText()) === 'Founder');
  assert.equal(await row.$('[data-tmc-badge="subscriber/1"]').getAttribute('title'), 'Channel subscriber');
  assert.equal(await row.$('[data-tmc-badge="mystery/1"]').getText(), 'mystery');
  assert.equal((await browser.$$('[data-tmc-message-id="badge-missing"] [data-tmc-badge]')).length, 0);
  await browser.waitUntil(async () => (await browser.$('[data-tmc-live-status]').getText()) === 'Live: connected');
  fixture.sendBadgeMessage();
  await browser.$('[data-tmc-message-id="badge-live"] img').waitForDisplayed();
  assert.equal((await browser.$$('[data-tmc-message-id="badge-live"] img')).length, 2);
  assert.deepEqual(await settledNativeViews(browser, readNativeViews), nativeBefore);
  await browser.saveScreenshot(path.join(evidence, 'chat-badges.png'));
  await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'B');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-b'));
  await browser.waitUntil(async () => (await browser.$$('[data-tmc-message-id="badge-history"] img')).length === 4);
  await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'A');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-a'));
  await browser.$('#openChannelButton').waitForEnabled();
  fixture.setBadgeMessages(false);
  await browser.$('#loadHistoryButton').click();
  await browser.$('#loadHistoryButton').waitForEnabled();
  await browser.waitUntil(async () => (await browser.$$('#chatList img')).length === 0);
  await browser.execute("document.dispatchEvent(new Event('synthetic-badge-boundary-reset'))");
  assert.equal(fixture.sentMessages.length, sentBefore, 'Badges never send or replay chat');
}
