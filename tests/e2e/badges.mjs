import assert from 'node:assert/strict';
import path from 'node:path';
import { settledNativeViews } from './native-layout.mjs';

/** Replace only image transport; the actual renderer and image events remain. */
export async function exerciseBadges(browser, fixture, evidence, readNativeViews) {
  const sentBefore = fixture.sentMessages.length;
  const synthetic = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" fill="#a78bfa"/></svg>');
  await browser.execute((fixtureImage) => {
    const prototype = globalThis.window.HTMLImageElement.prototype;
    const original = Object.getOwnPropertyDescriptor(prototype, 'src');
    Object.defineProperty(prototype, 'src', { ...original, set(value) {
      if (!/^https:\/\/static-cdn\.jtvnw\.net\/badges\/v1\/00000000-0000-0000-0000-00000000000[1-6]\/2$/.test(value)) throw new Error('Unexpected badge image boundary');
      original.set.call(this, value.includes('000000000006') ? 'data:image/png;base64,AAAA' : fixtureImage);
    } });
    globalThis.window.document.addEventListener('synthetic-badge-boundary-reset', () => Object.defineProperty(prototype, 'src', original), { once: true });
  }, synthetic);
  fixture.setBadgeMessages(true);
  try {
    await browser.$('#loadHistoryButton').click();
    const history = await browser.$('[data-tmc-message-id="badge-history"]');
    await history.waitForDisplayed();
    const nativeBefore = await settledNativeViews(browser, readNativeViews);
    await browser.waitUntil(async () => (await history.$$('.tmc-chat-badge-image img')).length === 4 &&
      await browser.execute(() => [...globalThis.window.document.querySelectorAll('[data-tmc-message-id="badge-history"] .tmc-chat-badge-image img')]
        .every((image) => image.complete && image.naturalWidth > 0 && !image.parentElement.hidden)));
    await browser.waitUntil(async () => (await history.$('[data-tmc-badge="founder/1"]').getAttribute('hidden')) !== null);
    assert.equal(await history.$('[data-tmc-badge="subscriber/1"]').getAttribute('title'), 'Channel subscriber');
    assert.equal(await history.$('[data-tmc-badge="mystery/1"]').isDisplayed(), false);
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
    await browser.waitUntil(async () => {
      const images = await live.$$('.tmc-chat-badge-image img');
      return images.length === 2 && await images[0].isDisplayed() && await images[1].isDisplayed();
    });
    assert.doesNotMatch(await live.getText(), /Moderator|VIP/);
    assert.deepEqual(await settledNativeViews(browser, readNativeViews), nativeBefore);
    await browser.saveScreenshot(path.join(evidence, 'chat-badge-icons.png'));
    await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'B');
    await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-b'));
    await browser.$('[data-tmc-message-id="badge-history"]').waitForDisplayed();
    await browser.waitUntil(async () => (await browser.$$('[data-tmc-message-id="badge-history"] .tmc-chat-badge-image img')).length === 4);
    assert.doesNotMatch(await browser.$('[data-tmc-message-id="badge-history"]').getText(), /Broadcaster|Moderator|VIP|Subscriber|Founder|mystery/);
    await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'A');
    await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-a'));
    await browser.$('#openChannelButton').waitForEnabled();
  } finally {
    fixture.setBadgeMessages(false);
    await browser.execute(() => globalThis.window.document.dispatchEvent(new Event('synthetic-badge-boundary-reset')));
  }
  await browser.$('#loadHistoryButton').click();
  await browser.$('#loadHistoryButton').waitForEnabled();
  assert.equal(fixture.sentMessages.length, sentBefore, 'Badge enrichment never sends or replays chat');
}
