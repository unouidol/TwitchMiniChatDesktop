import assert from 'node:assert/strict';
import path from 'node:path';
import { Key } from 'webdriverio';
import { settledNativeViews } from './native-layout.mjs';

export async function exerciseSearchWithEmotes(browser, fixture, evidence, readNativeViews) {
  const nativeBefore = await settledNativeViews(browser, readNativeViews);
  const sentBefore = fixture.sentMessages.length;
  const message = '[data-tmc-message-id="e403cdaf-b781-4740-8473-9a00291fef0b"]';
  await browser.execute(`window.searchImage = document.querySelector('${message} img'); window.searchLink = document.querySelector('${message} a');`);
  await browser.action('key').down(Key.Control).down('f').up('f').up(Key.Control).perform();
  const input = await browser.$('#chatSearch');
  await input.waitForDisplayed();
  assert.equal(await input.isFocused(), true);
  await input.setValue('KAPPA');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-search-status]').getText()).includes('/ 2 matches'));
  await browser.keys('Enter');
  assert.equal(await browser.execute(`return window.searchImage === document.querySelector('${message} img') && window.searchLink === document.querySelector('${message} a')`), true);
  assert.equal(await browser.$(`${message} img`).isDisplayed(), true);
  await input.setValue('<img');
  assert.match(await browser.$('[data-tmc-search-status]').getText(), /1 matches/);
  assert.equal((await browser.$$('[data-tmc-message-id="fixture-emote-invalid"] img')).length, 0, 'Literal HTML search never creates markup');
  await input.setValue('.*');
  assert.equal(await browser.$('[data-tmc-search-status]').getText(), 'No matches.');
  await browser.keys('Escape');
  await input.waitForDisplayed({ reverse: true });
  assert.equal((await browser.$$('.tmc-search-match')).length, 0);
  assert.deepEqual(await settledNativeViews(browser, readNativeViews), nativeBefore);
  assert.equal(fixture.sentMessages.length, sentBefore);
  await browser.execute('delete window.searchImage; delete window.searchLink');
  await browser.saveScreenshot(path.join(evidence, 'search-emotes-preserved.png'));
}

export async function exerciseSearch(browser, fixture, evidence, readNativeViews) {
  const sentBefore = fixture.sentMessages.length;
  const draft = await browser.$('#messageInput').getValue();
  fixture.setMentionMessages(true);
  await browser.$('#loadHistoryButton').click();
  await browser.$('[data-tmc-message-id="mention-history-a"]').waitForExist();
  const nativeBefore = await settledNativeViews(browser, readNativeViews);
  await browser.$('[data-tmc-search-toggle]').click();
  const input = await browser.$('#chatSearch');
  await input.setValue('HELLO');
  assert.match(await browser.$('[data-tmc-search-status]').getText(), /2 matches/);
  await browser.keys('Enter');
  assert.equal(await browser.$('[data-tmc-message-id="mention-history-a"]').getAttribute('class').then((value) => value.includes('tmc-search-current')), true);
  await browser.keys('Enter');
  assert.equal(await browser.$('[data-tmc-message-id="mention-history-b"]').getAttribute('class').then((value) => value.includes('tmc-search-current')), true);
  await browser.action('key').down(Key.Shift).down(Key.Enter).up(Key.Enter).up(Key.Shift).perform();
  assert.match(await browser.$('[data-tmc-search-status]').getText(), /^1 \/ 2/);
  await input.setValue('fixture_mention_bot');
  assert.match(await browser.$('[data-tmc-search-status]').getText(), /34 matches/);
  await input.setValue('ordinary');
  assert.match(await browser.$('[data-tmc-search-status]').getText(), /30 matches/);
  await browser.keys('Enter');
  const position = await browser.execute('return document.querySelector("#chatList").scrollTop');
  fixture.sendMentionMessages('plain');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-search-status]').getText()).includes('/ 31 matches'));
  assert.equal(await browser.execute('return document.querySelector("#chatList").scrollTop'), position, 'New matches never move a reader');
  assert.equal(await browser.$('#messageInput').getValue(), draft);
  assert.deepEqual(await settledNativeViews(browser, readNativeViews), nativeBefore);
  await browser.saveScreenshot(path.join(evidence, 'chat-search.png'));
  // Keep the production history request pending while the actual IRC client
  // delivers a row into the temporary feed. History commit must release it.
  fixture.holdHistory();
  try {
    await browser.$('#loadHistoryButton').click();
    await browser.waitUntil(async () => fixture.pendingHistories > 0);
    fixture.sendSearchMessage();
    await browser.$('[data-tmc-message-id="search-temporary"]').waitForExist();
    await browser.$('[data-tmc-search-toggle]').click();
    await input.setValue('Live during history refresh');
    assert.match(await browser.$('[data-tmc-search-status]').getText(), /1 matches/);
  } finally { fixture.releaseHistory(); }
  await browser.$('#loadHistoryButton').waitForEnabled();
  assert.equal(await input.isDisplayed(), false, 'History commit closes search opened against temporary live rows');
  assert.equal(await input.getValue(), '');
  await browser.$('[data-tmc-search-toggle]').click();
  await input.setValue('Live during history refresh');
  assert.equal(await browser.$('[data-tmc-search-status]').getText(), 'No matches.', 'Detached temporary rows never remain navigable results');
  await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'B');
  await input.waitForDisplayed({ reverse: true });
  assert.equal(await input.getValue(), '');
  assert.equal((await browser.$$('.tmc-search-match')).length, 0);
  await browser.$('#openChannelButton').waitForEnabled();
  await browser.$('[data-tmc-search-toggle]').click();
  await input.setValue('hello');
  await browser.$('#channelInput').setValue('fixture-other');
  await browser.$('#openChannelButton').click();
  await input.waitForDisplayed({ reverse: true });
  assert.equal(await input.getValue(), '');
  fixture.setMentionMessages(false);
  await browser.$('#openChannelButton').waitForEnabled();
  await browser.$('#channelInput').setValue('fixture-channel');
  await browser.$('#openChannelButton').click();
  await browser.$('#openChannelButton').waitForEnabled();
  await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'A');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-a'));
  await browser.$('#openChannelButton').waitForEnabled();
  assert.equal(fixture.sentMessages.length, sentBefore, 'Search never sends or replays chat');
}
