import assert from 'node:assert/strict';
import path from 'node:path';

export async function exerciseLayout(browser, fixture, evidence, readNativeViews) {
  const input = await browser.$('#channelInput');
  const open = await browser.$('#openChannelButton');
  const refresh = await browser.$('#loadHistoryButton');
  const label = await browser.$('#chatChannelLabel');
  const menu = await browser.$('[data-tmc-account-menu]');
  const menuTrigger = await browser.$('[data-tmc-account-menu] summary');
  const remove = await browser.$('[data-tmc-remove-local-account]');
  const ready = async () => {
    await open.waitForEnabled();
    await browser.waitUntil(async () => (await browser.$('[data-tmc-live-status]').getText()) === 'Live: connected');
  };
  await ready();
  await browser.waitUntil(async () => (await readNativeViews()).some((view) => view.bounds.width > 20));
  const nativeViewIds = (await readNativeViews()).map((view) => view.id);
  const versionLabel = await browser.$('[data-tmc-app-version]').getText();
  assert.match(versionLabel, /^v\d+\.\d+\.\d+[^ ]* · e2e \d{8}\.\d{6}Z$/);
  assert.equal(await browser.getTitle(), `TMC desktop ${versionLabel}`);
  assert.equal(await remove.isDisplayed(), false);
  await menuTrigger.click();
  await remove.waitForDisplayed();
  await browser.waitUntil(async () => (await readNativeViews()).every((view) => view.bounds.width === 0 && view.bounds.height === 0));
  assert.deepEqual((await readNativeViews()).map((view) => view.id), nativeViewIds, 'Menu hides PCG without replacing its native view');
  await browser.saveScreenshot(path.join(evidence, 'account-menu.png'));
  await browser.keys('Escape');
  assert.equal(await menu.getAttribute('open'), null);
  assert.equal(await menuTrigger.isFocused(), true);
  await browser.waitUntil(async () => (await readNativeViews()).some((view) => view.bounds.width > 20));
  assert.deepEqual((await readNativeViews()).map((view) => view.id), nativeViewIds);
  await menuTrigger.click();
  await input.click();
  await remove.waitForDisplayed({ reverse: true });

  // A draft channel must not retarget Refresh, Favorite or Send.
  await input.setValue('fixture-other');
  assert.equal(await label.getText(), '#fixture-channel');
  await browser.$('#messageInput').setValue('synthetic-layout-message');
  await browser.$('#composerForm button[type="submit"]').click();
  await browser.waitUntil(async () => fixture.sentMessages.length === 1);
  assert.equal(fixture.sentMessages[0].channel, 'fixture-channel');
  await browser.$('[data-tmc-toggle-favorite-channel]').click();
  await browser.waitUntil(async () => (await browser.$('[data-tmc-favorite-channels]').getText()).includes('#fixture-channel'));
  assert.equal((await browser.$('[data-tmc-favorite-channels]').getText()).includes('#fixture-other'), false);
  const beforeRefresh = fixture.histories.length;
  await refresh.click();
  await browser.waitUntil(async () => fixture.histories.length > beforeRefresh);
  await ready();
  assert.equal(fixture.histories.at(-1).channel, 'fixture-channel');
  assert.equal(await label.getText(), '#fixture-channel');

  await input.setValue('fixture-other');
  await open.click();
  await ready();
  assert.equal(await label.getText(), '#fixture-other');
  assert.equal(fixture.histories.at(-1).channel, 'fixture-other');
  await input.setValue('fixture-channel');
  await browser.keys('Enter');
  await ready();
  assert.equal(await label.getText(), '#fixture-channel');
  const headerHeight = await browser.execute("return document.querySelector('.tmc-header').getBoundingClientRect().height");
  assert.ok(headerHeight <= 80, 'Header must stay compact');
  const viewport = await browser.execute('return { scrollWidth: document.documentElement.scrollWidth, width: innerWidth, scrollTop: document.scrollingElement.scrollTop }');
  assert.ok(viewport.scrollWidth <= viewport.width, 'The shell fits narrow Windows desktops without horizontal document scrolling');
  assert.equal(viewport.scrollTop, 0, 'Panels scroll independently; the document stays fixed for native view alignment');
  await browser.saveScreenshot(path.join(evidence, 'layout.png'));
}
