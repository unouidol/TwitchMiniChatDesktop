/** Wait for the actual selected PCG view, its DOM host and the sampled native bounds to agree. */
export async function settledNativeViews(browser, readNativeViews) {
  let settled;
  let previous;
  await browser.waitUntil(async () => {
    const state = await browser.execute(async () => {
      return globalThis.window.tmc.pcg.getStatus().then((status) => {
        const document = globalThis.document;
        const host = document.querySelector('#pcgHost').getBoundingClientRect();
        return { status, selected: document.querySelector('[data-tmc-account-select]').value,
          channel: document.querySelector('#chatChannelLabel').textContent.slice(1),
          auth: document.querySelector('.tmc-pcg-panel').dataset.tmcPcgTwitchAuth,
          bounds: { x: Math.round(host.x), y: Math.round(host.y), width: Math.round(host.width), height: Math.round(host.height) } };
      }, () => null);
    });
    const views = await readNativeViews();
    const valid = state && state.status.profileId === state.selected && state.status.channel === state.channel &&
      state.status.state === 'active' && state.status.displayMode === 'embedded' && state.status.twitchAuth !== 'unknown' && state.status.twitchAuth === state.auth &&
      views.length === 1 && ['x', 'y', 'width', 'height'].every((key) => views[0].bounds[key] === state.bounds[key]);
    const signature = valid ? JSON.stringify({ state, views }) : null;
    const stable = signature !== null && signature === previous;
    previous = signature;
    settled = views;
    return stable;
  }, { timeout: 10000, interval: 100, timeoutMsg: 'Selected PCG identity, DOM host and native view must settle before layout comparison' });
  return settled;
}
