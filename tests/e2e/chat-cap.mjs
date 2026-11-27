import assert from 'node:assert/strict';
import { Key } from 'webdriverio';

const MAX_ROWS = 1000;
const rowCount = (browser) => browser.execute("return document.querySelector('#chatList').childElementCount");

/**
 * Rendered chat rows are capped while a channel stays open, without moving the
 * row being read and without leaving pruned rows in search.
 */
export async function exerciseChatRowCap(browser, fixture) {
  // Start as a follower at the latest message, whatever the previous step left.
  if (await browser.$('.tmc-new-messages-button').isDisplayed()) await browser.$('.tmc-new-messages-button').click();
  await browser.execute("const list = document.querySelector('#chatList'); list.scrollTop = list.scrollHeight; list.dispatchEvent(new Event('scroll'))");
  const firstBefore = await browser.execute("return document.querySelector('#chatList').firstElementChild?.dataset.tmcMessageId || null");
  fixture.sendFloodMessages('flood-first', MAX_ROWS + 100);
  await browser.$(`[data-tmc-message-id="flood-first-${MAX_ROWS + 99}"]`).waitForExist({ timeout: 60000 });
  assert.equal(await rowCount(browser), MAX_ROWS, 'Only the most recent rows stay rendered');
  if (firstBefore) assert.equal(await browser.$(`[data-tmc-message-id="${firstBefore}"]`).isExisting(), false, 'The oldest row was pruned');
  assert.equal(await browser.$('[data-tmc-message-id="flood-first-0"]').isExisting(), false);
  assert.equal(await browser.execute(
    "const list = document.querySelector('#chatList'); return list.scrollHeight - list.clientHeight - list.scrollTop <= 64",
  ), true, 'A following reader stays at the latest message');

  const search = await browser.$('#chatSearch');
  await browser.action('key').down(Key.Control).down('f').up('f').up(Key.Control).perform();
  await search.waitForDisplayed();
  // Search trims the query; index 0 is the only text containing "message 0".
  await search.setValue('flood-first message 0');
  assert.equal(await browser.$('[data-tmc-search-status]').getText(), 'No matches.', 'Pruned rows are not searchable');
  await search.setValue(`flood-first message ${MAX_ROWS + 99}`);
  await browser.waitUntil(async () => (await browser.$('[data-tmc-search-status]').getText()).includes('1 matches'));
  await browser.keys('Escape');
  await search.waitForDisplayed({ reverse: true });

  // Read a row in the middle, then let more messages prune rows above it.
  const readId = `flood-first-${MAX_ROWS / 2 + 100}`;
  const rowTop = `return document.querySelector('[data-tmc-message-id="${readId}"]')?.getBoundingClientRect().top ?? null`;
  const topBefore = await browser.execute(
    `const row = document.querySelector('[data-tmc-message-id="${readId}"]'); row.scrollIntoView({ block: 'start' }); return row.getBoundingClientRect().top`,
  );
  await browser.pause(300);
  const anchoredTop = await browser.execute(rowTop);
  fixture.sendFloodMessages('flood-second', 50);
  await browser.$('[data-tmc-message-id="flood-second-49"]').waitForExist({ timeout: 30000 });
  assert.equal(await rowCount(browser), MAX_ROWS);
  const topAfter = await browser.execute(rowTop);
  assert.notEqual(topAfter, null, 'The row being read is not pruned');
  assert.ok(Math.abs(topAfter - anchoredTop) <= 2, `The row being read stays in place (before ${topBefore}, anchored ${anchoredTop}, after ${topAfter})`);
  assert.match(await browser.$('.tmc-new-messages-button').getText(), /50 new messages/);
  await browser.$('.tmc-new-messages-button').click();
  await browser.$('.tmc-new-messages-button').waitForDisplayed({ reverse: true });
}
