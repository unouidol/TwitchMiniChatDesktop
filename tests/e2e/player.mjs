import assert from 'node:assert/strict';
import path from 'node:path';
import { settledNativeViews } from './native-layout.mjs';

export async function exercisePlayer(browser, fixture, evidence, readNativeViews, readPlayback, resizeOwnedWindow, closeOwnedPlayerWindow) {
  const waitForDetachedFit = async () => {
    let previous = ''; let samples = 0;
    await browser.waitUntil(async () => {
      const value = await readPlayback(); const view = value.playerViews[0];
      if (!view || value.status.mode !== 'detached' || view.bounds.width < 400 || view.bounds.height < 300 ||
          view.bounds.x !== 0 || view.bounds.y !== 0 || view.bounds.width !== view.parentBounds.width || view.bounds.height !== view.parentBounds.height) {
        previous = ''; samples = 0; return false;
      }
      const key = JSON.stringify([view.id, view.windowId, view.parentBounds]);
      samples = key === previous ? samples + 1 : 1; previous = key;
      return samples >= 3;
    }, { interval: 100, timeoutMsg: 'Detached video must stably fit its actual native content view after menu layout' });
  };
  const sentBefore = fixture.sentMessages.length;
  let initialCalls = fixture.playerCalls.length;
  const draft = await browser.$('#messageInput').getValue();
  const trigger = await browser.$('[data-tmc-player-toggle]');
  const panel = await browser.$('[data-tmc-player-panel]');
  const checkToggle = async (open) => {
    await browser.waitUntil(async () => (await trigger.getText()) === (open ? 'Close live' : 'Show live') &&
      (await trigger.getAttribute('aria-expanded')) === String(open));
    assert.equal(await trigger.getText(), open ? 'Close live' : 'Show live');
    assert.equal(await trigger.getAttribute('aria-expanded'), String(open));
    assert.equal(await trigger.$('[data-tmc-player-play]').isDisplayed(), !open);
    assert.equal(await trigger.$('[data-tmc-player-stop]').isDisplayed(), open);
  };
  const checkHeaderPlacement = async () => {
    const fits = await browser.execute(() => {
      const button = globalThis.window.document.querySelector('[data-tmc-player-toggle]').getBoundingClientRect();
      const heading = globalThis.window.document.querySelector('.tmc-chat-heading').getBoundingClientRect();
      const chat = globalThis.window.document.querySelector('.tmc-chat').getBoundingClientRect();
      return button.width > 0 && button.left >= heading.left && button.right <= chat.right &&
        button.top >= heading.top && button.bottom <= heading.bottom;
    });
    assert.equal(fits, true, 'Primary player control must fit beside the channel at normal and minimum app widths');
  };
  assert.equal(await browser.execute(() => !!globalThis.window.document.querySelector('.tmc-chat-heading [data-tmc-player-toggle]')), true);
  assert.equal(await browser.execute(() => !!globalThis.window.document.querySelector('.tmc-sidebar [data-tmc-player-toggle]')), false);
  await checkToggle(false);
  await checkHeaderPlacement();
  await browser.saveScreenshot(path.join(evidence, 'player-control-closed.png'));
  assert.equal(await panel.isDisplayed(), false);
  assert.equal((await readPlayback()).sourceActive, false, 'No video source before explicit opening');
  const initial = await readPlayback();
  const original = initial.mainWindowBounds;
  assert.deepEqual({ width: original.width, height: original.height },
    { width: initial.startupWindow.bounds.width, height: initial.startupWindow.bounds.height },
    'Earlier UI checks must restore the actual startup size');
  try {
    const workArea = initial.startupWindow.workArea;
    if (workArea.width < 1280 || workArea.height < 960) {
      // Windows may constrain creation to the runner's small physical desktop.
      // Exercise that real startup first, then use the existing owned resize
      // boundary to exercise the intended larger layout on this same runner.
      await trigger.click();
      await browser.waitUntil(async () => (await readPlayback()).status.state === 'ready');
      const startupPlayback = await readPlayback();
      if (startupPlayback.status.mode === 'detached') {
        const room = await browser.execute(() => {
          const document = globalThis.window.document;
          const chat = document.querySelector('.tmc-chat');
          const panel = document.querySelector('[data-tmc-player-panel]');
          const sizing = document.querySelector('[data-tmc-player-sizing]');
          const controls = [...chat.children].filter((child) => child !== panel && !child.classList.contains('tmc-chat-feed'));
          return { width: chat.getBoundingClientRect().width,
            videoHeight: chat.getBoundingClientRect().height - controls.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0)
              - panel.getBoundingClientRect().height - Number.parseFloat(globalThis.window.getComputedStyle(sizing).height) - 180 };
        });
        assert.ok(room.width < 400 || room.videoHeight < 300, 'Constrained startup may detach only when video and readable chat cannot fit');
        await waitForDetachedFit();
        assert.equal(await browser.$('[data-tmc-player-move]').isEnabled(), false);
      } else {
        assert.equal(startupPlayback.playerViews[0].windowId, startupPlayback.mainWindowId);
      }
      await browser.saveScreenshot(path.join(evidence, 'player-constrained-startup.png'));
      await trigger.click();
      await browser.waitUntil(async () => (await readPlayback()).status.state === 'closed' && !(await readPlayback()).sourceActive);
      await resizeOwnedWindow(1280, 960);
      initialCalls = fixture.playerCalls.length;
    } else {
      assert.equal(original.width, 1280, 'A sufficiently large desktop uses the intended startup width');
      assert.equal(original.height, 960, 'A sufficiently large desktop uses the intended startup height');
    }
    fixture.holdPlayer();
    try {
      await trigger.click();
      await browser.waitUntil(async () => fixture.playerCalls.length > initialCalls);
      await browser.waitUntil(async () => (await readPlayback()).playerViews.length === 1);
      await checkToggle(true);
      assert.equal(await browser.$('[data-tmc-player-status]').getText(), 'Opening player\u2026');
      assert.equal((await readPlayback()).status.mode, 'embedded', 'The intended startup layout embeds video above the feed');
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
    await browser.$('[data-tmc-player-status]').waitForDisplayed({ reverse: true });
    assert.equal(await browser.$('[data-tmc-player-status]').getText(), '');
    const first = await readPlayback();
    await checkToggle(true);
    await browser.saveScreenshot(path.join(evidence, 'player-control-open.png'));
    const videoId = first.playerViews[0].id;
    assert.equal(first.playerViews[0].windowId, first.mainWindowId);
    assert.deepEqual(first.playerViews[0].security, { bridge: 'undefined', node: 'undefined', process: 'undefined',
      persistent: true, sandboxed: true, sharedWithPcg: true, webSessionPresent: true });
    const pcgOnly = await settledNativeViews(browser, async () => (await readNativeViews()).filter((view) => view.id !== videoId));
    await browser.$('[data-tmc-account-menu] summary').click();
    await browser.$('[data-tmc-welcome-open]').click();
    await browser.$('[data-tmc-welcome-dialog]').waitForDisplayed();
    await browser.waitUntil(async () => (await readPlayback()).playerViews[0]?.bounds.width === 0);
    const selected = await browser.$('[data-tmc-account-select]').getValue();
    await browser.$('[data-tmc-welcome-check]').click();
    await browser.waitUntil(async () => (await browser.$('[data-tmc-welcome-status]').getText()).includes('99.0.0 is available'));
    await browser.$('[data-tmc-welcome-download]').click();
    await browser.saveScreenshot(path.join(evidence, 'welcome-update.png'));
    await browser.$('[data-tmc-welcome-close]').click();
    await browser.waitUntil(async () => (await readPlayback()).playerViews[0]?.bounds.width >= 400);
    assert.equal((await readPlayback()).playerViews[0].id, videoId, 'Welcome preserves the playing native surface');
    assert.equal(await browser.$('[data-tmc-account-select]').getValue(), selected);
    assert.deepEqual(await settledNativeViews(browser, async () => (await readNativeViews()).filter((view) => view.id !== videoId)), pcgOnly);
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
    const callsBeforeMoving = fixture.playerCalls.length;
    assert.equal(await browser.$('[data-tmc-player-move]').getText(), 'Detach video');
    await browser.$('[data-tmc-player-move]').click();
    await browser.waitUntil(async () => (await readPlayback()).status.mode === 'detached');
    await waitForDetachedFit();
    await checkToggle(true);
    assert.equal((await readPlayback()).playerViews[0].id, videoId, 'Detach retains the actual playback WebContents');
    assert.equal(await browser.$('[data-tmc-player-status]').getText(), 'Player open in a separate window.');
    assert.equal(await browser.$('[data-tmc-player-move]').getText(), 'Attach video');
    await browser.$('[data-tmc-player-move]').waitForEnabled(); await browser.$('[data-tmc-player-move]').click();
    await browser.waitUntil(async () => (await readPlayback()).status.mode === 'embedded');
    assert.equal((await readPlayback()).playerViews[0].id, videoId);
    assert.equal(await browser.$('[data-tmc-player-move]').getText(), 'Detach video');
    assert.equal(await browser.$('[data-tmc-player-status]').isDisplayed(), false);
    assert.equal(fixture.playerCalls.length, callsBeforeMoving, 'Detaching and attaching never reloads the video');
    await browser.$('[data-tmc-player-close]').click();
    await browser.waitUntil(async () => {
      const value = await readPlayback(); return value.status.state === 'closed' && !value.sourceActive && value.destroyed.includes(videoId);
    });
    await checkToggle(false);
    assert.deepEqual(await settledNativeViews(browser, readNativeViews), pcgOnly, 'Player operations preserve the native PCG identity and bounds');
    await resizeOwnedWindow(960, 650);
    await checkHeaderPlacement();
    await trigger.click();
    await browser.waitUntil(async () => (await readPlayback()).status.state === 'ready');
    assert.equal((await readPlayback()).status.mode, 'detached', 'Small windows keep video in a separate window');
    await waitForDetachedFit();
    const secondId = (await readPlayback()).playerViews[0].id;
    assert.notEqual(secondId, videoId);
    await browser.$('[data-tmc-account-select]').selectByAttribute('value', 'B');
    await browser.waitUntil(async () => {
      const value = await readPlayback(); return value.status.state === 'ready' && value.status.profileId === 'B' &&
        value.destroyed.includes(secondId) && value.playerViews[0]?.security?.sharedWithPcg && value.playerViews[0]?.security?.webSessionPresent;
    });
    const thirdId = (await readPlayback()).playerViews[0].id;
    await closeOwnedPlayerWindow();
    await browser.waitUntil(async () => {
      const value = await readPlayback(); return value.status.state === 'closed' && !value.sourceActive && value.destroyed.includes(thirdId);
    });
    await panel.waitForDisplayed({ reverse: true });
    await checkToggle(false);
    await trigger.click();
    await browser.waitUntil(async () => (await readPlayback()).status.state === 'ready');
    await waitForDetachedFit();
    await checkToggle(true);
    await trigger.click();
    await browser.waitUntil(async () => {
      const value = await readPlayback(); return value.status.state === 'closed' && !value.sourceActive && value.playerViews.length === 0;
    });
    await checkToggle(false);
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
