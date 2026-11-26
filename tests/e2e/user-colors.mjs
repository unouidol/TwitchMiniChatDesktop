import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';

export async function exerciseUserColors(browser, fixture, evidence) {
  const author = (id) => browser.$(`[data-tmc-message-id="${id}"] [data-tmc-author-login]`);
  const color = (id) => browser.execute(`return getComputedStyle(document.querySelector('[data-tmc-message-id="${id}"] [data-tmc-author-login]')).color`);
  fixture.setColorMessages(true);
  await browser.$('#loadHistoryButton').click();
  try {
    await browser.waitUntil(async () => (await author('color-history-red').getAttribute('data-tmc-color-source')) === 'lookup');
  } catch (error) {
    const profileId = await browser.$('[data-tmc-account-select]').getValue();
    const result = await browser.executeAsync((profile, done) => {
      globalThis.window.tmc.chat.getUserColors({ profileId: profile, channel: 'fixture-channel', usernames: ['fixture_color_red', 'fixture_color_yellow'] })
        .then((value) => done(value), () => done({ failed: true }));
    }, profileId);
    await fs.writeFile(path.join(evidence, 'user-colors-failure.json'), JSON.stringify({ result, calls: fixture.colorCalls }, null, 2));
    throw error;
  }
  assert.equal(await color('color-history-red'), 'rgb(255, 0, 0)');
  assert.equal(await color('color-history-yellow'), 'rgb(255, 255, 0)');
  assert.equal(await color('color-history-provided'), 'rgb(0, 255, 0)');
  assert.equal(await author('color-history-provided').getAttribute('data-tmc-color-source'), 'provided');
  assert.equal(await author('color-history-unset').getAttribute('data-tmc-color-source'), 'fallback');
  assert.equal(fixture.colorCalls.filter((call) => call.path === 'users').length, 1, 'Missing history colors resolve in one batch');
  assert.equal(fixture.colorCalls.filter((call) => call.path === 'color').length, 1);
  assert.ok(fixture.colorCalls.every((call) => !call.logins?.includes('fixture_color_tagged')), 'Supplied metadata needs no lookup');
  const before = fixture.colorCalls.length;
  await browser.$('#openChannelButton').waitForEnabled();
  await browser.$('#loadHistoryButton').click();
  await browser.waitUntil(async () => (await author('color-history-red').getAttribute('data-tmc-color-source')) === 'lookup');
  assert.equal(fixture.colorCalls.length, before, 'Repeated history uses cached user colors, including unset entries');
  await browser.waitUntil(async () => (await browser.$('[data-tmc-live-status]').getText()) === 'Live: connected');
  fixture.sendColorMessage('color-live-red', 'fixture_color_red');
  await browser.waitUntil(async () => (await author('color-live-red').getAttribute('data-tmc-color-source')) === 'lookup');
  assert.equal(await color('color-live-red'), 'rgb(255, 0, 0)');
  assert.equal(fixture.colorCalls.length, before, 'A missing live tag reuses the already resolved author color');
  fixture.holdColors();
  fixture.sendColorMessage('color-live-late', 'fixture_color_late');
  await browser.waitUntil(async () => fixture.colorCalls.some((call) => call.ids?.includes('6104')));
  fixture.sendColorMessage('color-live-tagged', 'fixture_color_late', '#123456');
  await browser.waitUntil(async () => (await author('color-live-late').getAttribute('data-tmc-color-source')) === 'lookup');
  fixture.releaseColors();
  const currentProfile = await browser.$('[data-tmc-account-select]').getValue();
  await browser.executeAsync((profileId, done) => {
    globalThis.window.tmc.chat.getUserColors({ profileId, channel: 'fixture-channel', usernames: ['fixture_color_late'] })
      .then(() => done(true), () => done(false));
  }, currentProfile);
  assert.equal(await color('color-live-tagged'), 'rgb(18, 52, 86)', 'A late API response cannot overwrite an actual live tag');
  assert.equal(await color('color-live-late'), 'rgb(18, 52, 86)');
  await browser.saveScreenshot(path.join(evidence, 'resolved-user-colors.png'));
  fixture.setColorMessages(false);
}
