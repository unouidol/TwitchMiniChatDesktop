import assert from 'node:assert/strict';
import path from 'node:path';

/** Exercise real menu, bridge and native windows against the inert local panel. */
export async function exercisePcgMenu(browser, evidence, readNativeViews, setBrowserSession) {
  const menu = await browser.$('[data-tmc-pcg-menu]');
  const trigger = await browser.$('[data-tmc-pcg-menu] summary');
  const login = await browser.$('[data-tmc-pcg-login]');
  const detach = await browser.$('[data-tmc-pcg-detach]');
  const logout = await browser.$('[data-tmc-pcg-logout]');
  const status = await browser.$('[data-tmc-pcg-status]');
  const visible = async () => {
    await browser.waitUntil(async () => (await readNativeViews()).some((view) => view.bounds.width > 20));
  };
  const hidden = async () => {
    await browser.waitUntil(async () => {
      const views = await readNativeViews();
      return views.length > 0 && views.every((view) => view.bounds.width === 0 && view.bounds.height === 0);
    });
  };
  await visible();
  const ids = (await readNativeViews()).map((view) => view.id);
  assert.equal(await login.isDisplayed(), false);
  assert.equal(await detach.isDisplayed(), false);
  const headerHeight = await browser.execute("return document.querySelector('.tmc-pcg-header').getBoundingClientRect().height");
  assert.ok(headerHeight <= 55, 'PCG header leaves room for game content');
  await trigger.click();
  await login.waitForDisplayed();
  assert.equal(await login.isEnabled(), true);
  await hidden();
  assert.deepEqual((await readNativeViews()).map((view) => view.id), ids);
  await browser.saveScreenshot(path.join(evidence, 'pcg-menu.png'));
  await browser.keys('Escape');
  assert.equal(await menu.getAttribute('open'), null);
  assert.equal(await trigger.isFocused(), true);
  await visible();
  await trigger.click();
  await browser.$('#channelInput').click();
  await login.waitForDisplayed({ reverse: true });
  await visible();

  const mainHandle = await browser.getWindowHandle();
  const before = await browser.getWindowHandles();
  await trigger.click();
  await detach.click();
  await browser.waitUntil(async () => (await status.getText()).includes('detached'));
  assert.equal(await menu.getAttribute('open'), null);
  await hidden();
  let childHandle;
  await browser.waitUntil(async () => {
    childHandle = (await browser.getWindowHandles()).find((handle) => !before.includes(handle));
    return Boolean(childHandle);
  });
  await browser.switchToWindow(childHandle);
  assert.equal(await browser.getTitle(), 'Local inert panel fixture');
  await browser.closeWindow();
  await browser.switchToWindow(mainHandle);
  await browser.waitUntil(async () => (await status.getText()).includes('active'));
  await visible();
  assert.deepEqual((await readNativeViews()).map((view) => view.id), ids, 'Embedded PCG is retained across detach/return');
  // Fix host dimensions so showing the prompt changes position only. Native
  // bounds must follow a cookie event even without a ResizeObserver size change.
  await browser.execute("document.querySelector('#pcgHost').style.cssText = 'height:360px;min-height:360px;flex:none'");
  await visible();
  await setBrowserSession('missing');
  const quickLogin = await browser.$('[data-tmc-pcg-login-quick]');
  await quickLogin.waitForDisplayed();
  await browser.waitUntil(async () => {
    const hostY = await browser.execute("return Math.round(document.querySelector('#pcgHost').getBoundingClientRect().top)");
    return (await readNativeViews()).some((view) => view.bounds.y === hostY);
  });
  assert.equal(await browser.$('.tmc-pcg-panel').getAttribute('data-tmc-pcg-twitch-auth'), 'signed-out');
  await browser.saveScreenshot(path.join(evidence, 'pcg-sign-in-after-logout.png'));
  await setBrowserSession('present');
  await quickLogin.waitForDisplayed({ reverse: true });
  assert.equal(await browser.$('.tmc-pcg-panel').getAttribute('data-tmc-pcg-twitch-auth'), 'session-present');
  assert.deepEqual((await readNativeViews()).map((view) => view.id), ids);

  // Real Electron storage: sign-out must clear the shared Twitch web session.
  await trigger.click();
  await logout.waitForDisplayed();
  await logout.click();
  await browser.waitUntil(() => browser.isAlertOpen(), { timeout: 10000 });
  assert.match(await browser.getAlertText(), /Sign out of Twitch for PCG and video/);
  await browser.acceptAlert();
  // signed-out is visible as soon as the cookie goes, before storage clearing
  // and verification finish: changing the synthetic session earlier races it.
  await browser.waitUntil(async () => ['done', 'failed'].includes(await browser.$('.tmc-pcg-panel').getAttribute('data-tmc-pcg-sign-out')),
    { timeout: 20000, timeoutMsg: 'PCG sign-out should finish' });
  assert.equal(await browser.$('.tmc-pcg-panel').getAttribute('data-tmc-pcg-sign-out'), 'done',
    `PCG sign-out failed: ${await browser.$('#chatList').getText()}`);
  assert.equal(await browser.$('.tmc-pcg-panel').getAttribute('data-tmc-pcg-twitch-auth'), 'signed-out');
  await quickLogin.waitForDisplayed();
  assert.deepEqual((await readNativeViews()).map((view) => view.id), ids, 'Sign-out reloads the retained PCG view');
  await trigger.click();
  await login.waitForDisplayed();
  assert.equal(await logout.isDisplayed(), false, 'Sign-out is offered only while signed in');
  await browser.keys('Escape');
  // The fixture caches its last command; step through "missing" to restore B.
  await setBrowserSession('missing');
  await setBrowserSession('present');
  await quickLogin.waitForDisplayed({ reverse: true });

  await browser.execute("document.querySelector('#pcgHost').style.cssText = ''");
  await visible();
  await browser.saveScreenshot(path.join(evidence, 'pcg-layout.png'));
}
