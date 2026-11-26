import assert from 'node:assert/strict';
import path from 'node:path';
import { settledNativeViews } from './native-layout.mjs';

export async function exercisePlayer(browser, fixture, evidence, readNativeViews, readPlayback, resizeOwnedWindow, closeOwnedPlayerWindow) {
  const sentBefore = fixture.sentMessages.length;
  const initialCalls = fixture.playerCalls.length;
  const draft = await browser.$('#messageInput').getValue();
  const trigger = await browser.$('[data-tmc-player-toggle]');
  const panel = await browser.$('[data-tmc-player-panel]');
  assert.equal(await panel.isDisplayed(), false);
  assert.equal((await readPlayback()).sourceActive, false, 'No video source before explicit opening');
  const original = await resizeOwnedWindow(1160, 1100);
  try {
    fixture.holdPlayer();
    try {
      await trigger.click();
      await browser.waitUntil(async () => fixture.playerCalls.length > initialCalls);
      await browser.waitUntil(async () => (await readPlayback()).playerViews.length === 1);
      assert.equal((await readPlayback()).status.mode, 'embedded', 'Large viewport embeds video above the feed');
      await browser.$('[data-tmc-auth-login]').click();
      await browser.$('[data-tmc-auth-dialog]').waitForDisplayed();
      await browser.waitUntil(async () => (await readPlayback()).playerViews[0]?.bounds.width === 0);
      assert.equal((await readPlayback()).status.state, 'loading', 'Modal occlusion works while the iframe response is held');
      await browser.$('[data-tmc-auth-close]').click();
    } finally { fixture.releasePlayer(); }
    await browser.waitUntil(async () => {
      const value = await readPlayback();
      return value.status.state === 'ready' && value.playerViews[0]?.security;
    });
    const first = await readPlayback();
    const videoId = first.playerViews[0].id;
    assert.equal(first.playerViews[0].windowId, first.mainWindowId);
    assert.deepEqual(first.playerViews[0].security, { bridge: 'undefined', node: 'undefined', process: 'undefined', persistent: false, sandboxed: true });
    const pcgOnly = await settledNativeViews(browser, async () => (await readNativeViews()).filter((view) => view.id !== videoId));
    const geometry = await browser.execute(`return { host: document.querySelector('[data-tmc-player-host]').getBoundingClientRect().height,
      feed: document.querySelector('.tmc-chat-feed').getBoundingClientRect().height,
      composer: document.querySelector('#composerForm').getBoundingClientRect().bottom, viewport: innerHeight }`);
    assert.ok(geometry.host >= 300 && geometry.feed >= 180 && geometry.composer <= geometry.viewport + 1);
    const size = await browser.$('[data-tmc-player-height]');
    await size.click(); await browser.keys('ArrowRight');
    await browser.waitUntil(async () => (await readPlayback()).playerViews[0]?.bounds.height >= 310);
    await browser.saveScreenshot(path.join(evidence, 'live-player-embedded.png'));
    const calls = fixture.playerCalls.length;
    await browser.$('#loadHistoryButton').click(); await browser.$('#loadHistoryButton').waitForEnabled();
    await browser.waitUntil(async () => (await readPlayback()).status.state === 'ready');
    assert.equal(fixture.playerCalls.length, calls, 'History refresh does not restart the same video');
    await browser.$('#channelInput').setValue('fixture-other');
    assert.equal((await readPlayback()).status.channel, 'fixture-channel', 'A channel draft does not retarget playback');
    await browser.$('#openChannelButton').click(); await browser.$('#openChannelButton').waitForEnabled();
    await browser.waitUntil(async () => (await readPlayback()).status.channel === 'fixture-other' && (await readPlayback()).status.state === 'ready');
    assert.equal((await readPlayback()).playerViews[0].id, videoId);
    await browser.$('#channelInput').setValue('fixture-channel');
    await browser.$('#openChannelButton').click(); await browser.$('#openChannelButton').waitForEnabled();
    await browser.waitUntil(async () => (await readPlayback()).status.channel === 'fixture-channel' && (await readPlayback()).status.state === 'ready');
    await browser.$('[data-tmc-player-move]').click();
    await browser.waitUntil(async () => (await readPlayback()).status.mode === 'detached');
    assert.equal((await readPlayback()).playerViews[0].id, videoId, 'Detach retains the actual playback WebContents');
    await browser.$('[data-tmc-player-move]').waitForEnabled(); await browser.$('[data-tmc-player-move]').click();
    await browser.waitUntil(async () => (await readPlayback()).status.mode === 'embedded');
    assert.equal((await readPlayback()).playerViews[0].id, videoId);
    await browser.$('[data-tmc-player-close]').click();
    await browser.waitUntil(async () => {
      const value = await readPlayback(); return value.status.state === 'closed' && !value.sourceActive && value.destroyed.includes(videoId);
    });
    assert.deepEqual(await settledNativeViews(browser, readNativeViews), pcgOnly, 'Player operations preserve the native PCG identity and bounds');
    await resizeOwnedWindow(960, 650);
    await trigger.click();
    await browser.waitUntil(async () => (await readPlayback()).status.state === 'ready');
    assert.equal((await readPlayback()).status.mode, 'detached', 'Small windows keep video in a separate window');
    const secondId = (await readPlayback()).playerViews[0].id;
    assert.notEqual(secondId, videoId);
    await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'B');
    await browser.waitUntil(async () => {
      const value = await readPlayback(); return value.status.state === 'ready' && value.status.profileId === 'B' && value.destroyed.includes(secondId);
    });
    const thirdId = (await readPlayback()).playerViews[0].id;
    await closeOwnedPlayerWindow();
    await browser.waitUntil(async () => {
      const value = await readPlayback(); return value.status.state === 'closed' && !value.sourceActive && value.destroyed.includes(thirdId);
    });
    await panel.waitForDisplayed({ reverse: true });
    assert.equal(await browser.$('#messageInput').getValue(), draft);
    assert.equal(fixture.sentMessages.length, sentBefore, 'Playback never sends/replays chat');
    await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'A');
    await browser.waitUntil(async () => (await browser.$('[data-tmc-account-status]').getText()).includes('fixture-a'));
    await browser.$('#openChannelButton').waitForEnabled();
  } finally {
    fixture.releasePlayer();
    await resizeOwnedWindow(original.width, original.height);
  }
}
