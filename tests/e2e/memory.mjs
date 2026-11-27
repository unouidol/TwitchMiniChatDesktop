import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Memory lifecycle scenario. Decision rules were fixed before the first run:
// - counts of live WebContents after a forced main-process GC are asserted;
// - counts before GC are reported (they depend on when V8 collects);
// - megabytes are reported only: a threshold on a shared runner would be flaky.
// Fixture pages are inert, so absolute sizes understate real Twitch/PCG pages;
// what this scenario proves is whether pages are released, not how heavy they are.

const pcg = (contents) => contents.filter((entry) => entry.partition);
const summary = (label, report) => ({
  label,
  liveBeforeGc: report.beforeGc.length,
  liveAfterGc: report.afterGc.length,
  pcgBeforeGc: pcg(report.beforeGc).length,
  pcgAfterGc: pcg(report.afterGc).length,
  rendererMB: Math.round(report.processes.filter((entry) => entry.type === 'Tab').reduce((total, entry) => total + entry.workingSetKB, 0) / 1024),
  totalMB: Math.round(report.processes.reduce((total, entry) => total + entry.workingSetKB, 0) / 1024),
  processes: report.processes.length,
});

export async function exerciseMemory(browser, evidence, readMetrics, readPlayback) {
  const rows = [];
  const record = async (label, request = 'measure') => {
    const report = await readMetrics(request);
    const dom = await browser.execute('return { nodes: document.getElementsByTagName("*").length, jsHeapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576) }');
    rows.push({ ...summary(label, report), mainRendererNodes: dom.nodes, mainRendererHeapMB: dom.jsHeapMB });
    return report;
  };

  const baseline = await record('baseline');

  // Qualify the instrument first: a retained, unattached PCG view must be seen.
  const probed = await record('qualification: leaked probe view', 'leak-probe-create');
  assert.equal(pcg(probed.afterGc).length, pcg(baseline.afterGc).length + 1, 'The counter sees a retained PCG view after GC');
  const released = await record('qualification: probe released', 'leak-probe-release');
  assert.equal(pcg(released.afterGc).length, pcg(baseline.afterGc).length, 'The counter sees the probe go');

  // Account switching: TMC keeps one PCG page and replaces it on every switch.
  const select = await browser.$('[data-tmc-account-select]');
  const original = await select.getValue();
  const accounts = await browser.execute('return Array.from(document.querySelector("[data-tmc-account-select]").options, (option) => option.value)');
  assert.ok(accounts.length >= 2, 'The scenario needs two accounts');
  const status = await browser.$('[data-tmc-pcg-status]');
  const switchTo = async (target) => {
    await select.selectByAttribute('value', target);
    await browser.waitUntil(async () => (await status.getText()).includes('active'), { timeout: 30000, timeoutMsg: `PCG reactivates for ${target}` });
  };
  // Warm up so every account has its kept panel, then switching must create none.
  for (const target of [...accounts.filter((account) => account !== original), original]) await switchTo(target);
  await browser.pause(2000);
  const warm = await record('after warm-up (one panel per account)');
  for (let index = 0; index < 10; index += 1) {
    await switchTo(accounts[(accounts.indexOf(original) + index + 1) % accounts.length]);
  }
  if (await select.getValue() !== original) {
    await select.selectByAttribute('value', original);
    await browser.waitUntil(async () => (await status.getText()).includes('active'), { timeout: 30000 });
  }
  // Settle before measuring: "active" can still describe the previous account.
  await browser.pause(2000);
  const switched = await record('after 10 account switches');

  // Separate PCG window: open and close five times.
  const menu = await browser.$('[data-tmc-pcg-menu] summary');
  const mainHandle = await browser.getWindowHandle();
  for (let index = 0; index < 5; index += 1) {
    const before = await browser.getWindowHandles();
    await menu.click();
    await browser.$('[data-tmc-pcg-detach]').click();
    let child;
    await browser.waitUntil(async () => { child = (await browser.getWindowHandles()).find((handle) => !before.includes(handle)); return Boolean(child); }, { timeout: 20000 });
    await browser.switchToWindow(child);
    await browser.closeWindow();
    await browser.switchToWindow(mainHandle);
    await browser.waitUntil(async () => (await status.getText()).includes('active'), { timeout: 20000 });
  }
  const detached = await record('after 5 separate PCG windows');

  // Video player: open and close five times.
  const toggle = await browser.$('[data-tmc-player-toggle]');
  for (let index = 0; index < 5; index += 1) {
    await toggle.click();
    await browser.waitUntil(async () => (await readPlayback())?.status.state === 'ready', { timeout: 20000, timeoutMsg: 'Video opens' });
    await toggle.click();
    await browser.waitUntil(async () => {
      const value = await readPlayback();
      return value?.status.state === 'closed' && !value.sourceActive;
    }, { timeout: 20000, timeoutMsg: 'Video closes' });
  }
  const played = await record('after 5 video open/close');

  await fs.writeFile(path.join(evidence, 'memory-scenario.json'), JSON.stringify({ rows, baseline, warm, switched, detached, played }, null, 2));
  console.log(`[memory] ${JSON.stringify(rows)}`);
  console.table(rows);

  // Pre-registered assertions (after GC only). Option A (2026-11-27): one kept
  // panel per account, reused on every switch back.
  const ids = (report) => pcg(report.afterGc).map((entry) => entry.id).sort((a, b) => a - b);
  assert.ok(pcg(warm.afterGc).length <= accounts.length,
    `At most one PCG page per account: ${JSON.stringify(pcg(warm.afterGc))}`);
  assert.deepEqual(ids(switched), ids(warm),
    `Account switches reuse the kept panels, creating and leaking none: ${JSON.stringify(pcg(switched.afterGc))}`);
  assert.equal(detached.afterGc.length, switched.afterGc.length,
    `Closed separate PCG windows must not leave pages alive: ${JSON.stringify(detached.afterGc)}`);
  assert.equal(played.afterGc.length, detached.afterGc.length,
    `Closed video must not leave pages alive: ${JSON.stringify(played.afterGc)}`);
}
