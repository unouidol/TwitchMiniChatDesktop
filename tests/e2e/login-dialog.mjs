import assert from 'node:assert/strict';
import path from 'node:path';

/** Production DOM/IPC, with only browser launching and clipboard access substituted. */
export async function exerciseLoginDialog(browser, evidence) {
  const field = await browser.$('[data-tmc-auth-code]');
  const dialog = await browser.$('[data-tmc-auth-dialog]');
  const trigger = await browser.$('[data-tmc-auth-login]');
  const feedback = await browser.$('[data-tmc-auth-feedback]');
  const complete = await browser.$('[data-tmc-auth-finalize]');
  await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'A');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-a'));
  await browser.waitUntil(async () => (await browser.$('[data-tmc-pcg-status]').getText()).includes('active'));
  await browser.$('[data-tmc-pcg-login-quick]').waitForDisplayed();
  assert.equal(await browser.$('.tmc-pcg-panel').getAttribute('data-tmc-pcg-twitch-auth'), 'signed-out');
  await browser.saveScreenshot(path.join(evidence, 'pcg-sign-in-prompt.png'));
  assert.equal(await field.isDisplayed(), false);
  await trigger.click();
  await dialog.waitForDisplayed();
  assert.equal(await field.isDisplayed(), false);
  assert.equal(await browser.execute("return document.activeElement?.hasAttribute('data-tmc-auth-start')"), true);
  await browser.saveScreenshot(path.join(evidence, 'login-step-1.png'));
  await browser.execute("window.dispatchEvent(new Event('resize'))");
  await browser.$('[data-tmc-auth-start]').click();
  await browser.waitUntil(async () => (await feedback.getText()).includes('could not be opened'));
  assert.equal(await field.isDisplayed(), false);
  await browser.$('[data-tmc-auth-start]').click();
  await field.waitForDisplayed();
  assert.equal(await browser.$('[data-tmc-auth-start]').isDisplayed(), false);
  assert.equal(await complete.isEnabled(), false);
  await browser.saveScreenshot(path.join(evidence, 'login-step-2.png'));

  // No access to the user's real system clipboard, even on failure paths.
  await browser.execute(`
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      readText: async () => { throw new Error('Synthetic clipboard denial'); },
    } });
  `);
  await browser.$('[data-tmc-auth-paste]').click();
  await browser.waitUntil(async () => (await feedback.getText()).includes('using your keyboard'));
  await field.setValue('synthetic-expired');
  await complete.click();
  await browser.waitUntil(async () => (await feedback.getText()).includes('Could not complete login'));
  assert.equal(await dialog.isDisplayed(), true);
  await field.setValue('synthetic-stalled');
  await complete.click();
  await browser.waitUntil(async () => (await feedback.getText()).includes('Could not complete login'), { timeout: 20000 });
  assert.equal(await browser.$('[data-tmc-auth-close]').isEnabled(), true);
  assert.equal(await field.isEnabled(), true);
  assert.equal(await browser.$('[data-tmc-account-select]').getValue(), 'A');
  await browser.$('[data-tmc-auth-restart]').click();
  assert.equal(await field.getValue(), '');
  await browser.$('[data-tmc-auth-have-code]').click();

  // Dismiss and reopen while a clipboard read is pending. Its late result must
  // not populate a new login attempt or change the step the user sees.
  await browser.execute(`
    navigator.clipboard.readText = () => new Promise((resolve) => {
      document.addEventListener('synthetic-clipboard-resolve', () => resolve('synthetic-expired'), { once: true });
    });
  `);
  await browser.$('[data-tmc-auth-paste]').click();
  await browser.$('[data-tmc-auth-close]').click();
  await dialog.waitForDisplayed({ reverse: true });
  await trigger.click();
  await dialog.waitForDisplayed();
  await browser.execute("document.dispatchEvent(new Event('synthetic-clipboard-resolve'))");
  assert.equal(await field.getValue(), '');
  assert.equal(await field.isDisplayed(), false);
  await browser.keys('Escape');
  await dialog.waitForDisplayed({ reverse: true });
  assert.equal(await trigger.isFocused(), true);

  await trigger.click();
  await browser.$('[data-tmc-auth-have-code]').click();
  await browser.execute(`
    navigator.clipboard.readText = async () => '  synthetic-claim-B  ';
  `);
  await browser.$('[data-tmc-auth-paste]').click();
  await browser.waitUntil(async () => (await field.getValue()) === 'synthetic-claim-B');
  assert.equal(await complete.isEnabled(), true);
  await complete.click();
  assert.equal(await complete.isEnabled(), false);
  assert.equal(await browser.$('[data-tmc-auth-close]').isEnabled(), false);
  await dialog.waitForDisplayed({ reverse: true });
  await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-b'));
  await browser.waitUntil(async () => (await browser.$('.tmc-pcg-panel').getAttribute('data-tmc-pcg-twitch-auth')) === 'session-present');
  await browser.$('[data-tmc-pcg-login-quick]').waitForDisplayed({ reverse: true });
  assert.equal(await field.getValue(), '');
  await browser.execute('delete navigator.clipboard');
}
