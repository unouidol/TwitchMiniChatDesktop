import assert from 'node:assert/strict';
import path from 'node:path';
import { exerciseEmotePicker } from './emote-picker.mjs';
import { exerciseLinks } from './links.mjs';
import { exerciseCompletion } from './completion.mjs';
import { exerciseSearchWithEmotes } from './search.mjs';

export async function exerciseEmotes(browser, fixture, evidence, readNativeViews, readLinkAttempts) {
  // Substitute only image delivery/decoding input. No real CDN requests, relaxed
  // network guards, production renderer test API, or substituted parsing/DOM.
  const syntheticImage = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><circle cx="28" cy="28" r="26" fill="#a78bfa"/><circle cx="19" cy="22" r="4"/><circle cx="37" cy="22" r="4"/><path d="M16 34 Q28 46 40 34" stroke="black" stroke-width="4" fill="none"/></svg>',
  );
  await browser.execute(`
    const prototype = HTMLImageElement.prototype;
    const original = Object.getOwnPropertyDescriptor(prototype, 'src');
    const fixtureImage = arguments[0];
    Object.defineProperty(prototype, 'src', { ...original, set(value) {
      const url = new URL(value);
      if (url.origin !== 'https://static-cdn.jtvnw.net' ||
          !/^\\/emoticons\\/v2\\/(25|404|1902|88|999)\\/default\\/dark\\/2\\.0$/.test(url.pathname)) {
        throw new Error('Unexpected emote image boundary');
      }
      original.set.call(this, url.pathname.includes('/404/') ? 'data:image/png;base64,AAAA' : fixtureImage);
    } });
    document.addEventListener('synthetic-emote-boundary-reset', () => {
      Object.defineProperty(prototype, 'src', original);
    }, { once: true });
  `, syntheticImage);
  fixture.setEmoteMessages(true);
  await browser.$('#loadHistoryButton').click();
  await browser.$('[data-tmc-message-id="fixture-emote-missing"]').waitForExist();
  await browser.$('[data-tmc-message-id="fixture-emote-missing"]').scrollIntoView();
  // Observe a real painted frame before asserting lazy-image error delivery.
  await browser.saveScreenshot(path.join(evidence, 'emote-history-loading.png'));
  await browser.waitUntil(async () => (await browser.$$('.tmc-chat-emote')).length === 1);
  await browser.waitUntil(async () => browser.execute(`
    const image = document.querySelector('.tmc-chat-emote');
    return Boolean(image && image.complete && image.naturalWidth > 0);
  `));
  const image = await browser.$('.tmc-chat-emote');
  assert.equal(await image.getAttribute('alt'), 'Kappa');
  assert.equal(await image.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(await browser.execute("return document.querySelector('.tmc-message-content').firstChild.textContent"), '  😀 ');
  await browser.waitUntil(async () => (await browser.$('#chatList').getText()).includes('MissingEmote'));
  assert.equal(await browser.execute("return document.querySelectorAll('#chatList img:not(.tmc-chat-emote)').length"), 0);
  assert.equal(await browser.isAlertOpen(), false);
  const historyColors = await browser.execute(`return Array.from(document.querySelectorAll('#chatList .tmc-message:not(.tmc-message-system) strong'), (author) => getComputedStyle(author).color)`);
  assert.equal(historyColors[0], 'rgb(0, 255, 127)', 'History uses a supplied Twitch RGB color');
  assert.notEqual(historyColors[1], historyColors[2], 'Missing/invalid colors fall back per username');
  assert.equal((await browser.$$('#chatList .tmc-message-reply-button')).length, 1, 'Only a server UUID in history is replyable');
  await browser.$('[data-tmc-message-id="e403cdaf-b781-4740-8473-9a00291fef0b"]').moveTo();
  await browser.$('#chatList .tmc-message-reply-button').click();
  await browser.$('[data-tmc-reply-preview]').waitForDisplayed();
  assert.match(await browser.$('[data-tmc-reply-label]').getText(), /fixture-viewer:.*Kappa.*hello/);
  await browser.$('[data-tmc-reply-cancel]').click();
  assert.equal(fixture.sentMessages.length, 1, 'Selecting history replies does not send');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-live-status]').getText()) === 'Live: connected');
  fixture.sendEmoteMessages();
  await browser.$('[data-tmc-message-id="fixture-emote-live"] img').waitForDisplayed();
  await browser.$('[data-tmc-message-id="fixture-emote-action"] img').waitForDisplayed();
  assert.equal(await browser.execute("return getComputedStyle(document.querySelector('[data-tmc-message-id=\"fixture-emote-live\"] strong')).color"), 'rgb(30, 144, 255)');
  assert.equal(await browser.execute("return getComputedStyle(document.querySelector('[data-tmc-message-id=\"fixture-emote-action\"] strong')).color"), 'rgb(30, 144, 255)', 'Missing live metadata reuses the latest supplied live color');
  assert.equal(await browser.execute(`
    const body = document.querySelector('[data-tmc-message-id="fixture-emote-live"] .tmc-message-content');
    return Array.from(body.childNodes, (node) => node instanceof HTMLImageElement ? node.alt : node.textContent).join('');
  `), '😀 Kappa!');
  assert.equal(await browser.execute(`
    const body = document.querySelector('[data-tmc-message-id="fixture-emote-action"] .tmc-message-content');
    return Array.from(body.childNodes, (node) => node instanceof HTMLImageElement ? node.alt : node.textContent).join('');
  `), 'Kappa waves');
  await browser.saveScreenshot(path.join(evidence, 'emotes.png'));
  await exerciseEmotePicker(browser, fixture, evidence, readNativeViews);
  await exerciseLinks(browser, fixture, evidence, readLinkAttempts);
  await exerciseCompletion(browser, fixture, evidence, readNativeViews);
  await exerciseSearchWithEmotes(browser, fixture, evidence, readNativeViews);
  fixture.setEmoteMessages(false);
  await browser.$('#loadHistoryButton').click();
  await browser.waitUntil(async () => (await browser.$$('.tmc-chat-emote')).length === 0);
  await browser.execute("document.dispatchEvent(new Event('synthetic-emote-boundary-reset'))");
}
