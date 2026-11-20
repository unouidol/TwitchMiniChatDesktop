import assert from 'node:assert/strict';
import path from 'node:path';

export async function exerciseLinks(browser, fixture, evidence, readAttempts) {
  const originalUrl = await browser.getUrl();
  const windows = await browser.getWindowHandles();
  const link = (url) => browser.$(`#chatList a[href="${url}"]`);
  const history = 'https://example.test/history?x=1&y=2';
  await link(history).waitForExist();
  assert.equal(await link(history).getText(), history, 'Closing prose punctuation stays outside the link');
  assert.equal(await link(history).getAttribute('rel'), 'noopener noreferrer');
  await browser.execute(`document.querySelector('#chatList a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`);
  assert.deepEqual(await readAttempts(), [], 'Programmatic events never launch the browser');
  await link(history).click();
  await browser.waitUntil(async () => (await readAttempts()).length === 1);
  fixture.sendLinkMessages();
  const row = await browser.$('[data-tmc-message-id="fixture-links"]');
  await row.$('img.tmc-chat-emote').waitForExist();
  assert.equal((await row.$$('a')).length, 4, 'Web links coexist with emotes while script/file schemes remain text');
  assert.equal((await row.$$('script')).length, 0);
  assert.equal(await browser.isAlertOpen(), false);
  await link('http://example.test/live').click();
  await browser.waitUntil(async () => (await readAttempts()).length === 2);
  await link('https://example.test/middle').click({ button: 'middle' });
  await browser.waitUntil(async () => (await readAttempts()).length === 3);
  await browser.execute(`document.querySelector('#chatList a[href="https://example.test/keyboard"]').focus()`);
  await browser.keys('Enter');
  await browser.waitUntil(async () => (await readAttempts()).length === 4);
  await link('https://example.test/fail').click();
  await browser.$('.tmc-link-error').waitForDisplayed();
  assert.equal((await readAttempts()).length, 5);
  assert.match(await browser.$('.tmc-link-error').getText(), /Could not open link/);
  await link('https://example.test/fail').click();
  await browser.waitUntil(async () => (await readAttempts()).length === 6);
  await browser.$('.tmc-link-error').waitForExist({ reverse: true });
  assert.deepEqual(await readAttempts(), [history, 'http://example.test/live', 'https://example.test/middle',
    'https://example.test/keyboard', 'https://example.test/fail', 'https://example.test/fail']);
  await browser.execute(`window.open('https://example.test/blocked', '_blank')`);
  assert.deepEqual(await browser.getWindowHandles(), windows, 'Unexpected popup stays denied');
  await browser.execute(`location.href = 'https://example.test/blocked'`);
  assert.equal(await browser.getUrl(), originalUrl, 'The local shell never navigates to remote links');
  assert.equal((await readAttempts()).length, 6, 'Navigation attempts do not implicitly open the browser');
  await browser.saveScreenshot(path.join(evidence, 'chat-links.png'));
}
