import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
import type { TmcPlayerBounds, TmcPlayerContext, TmcPlayerMode, TmcPlayerStatus } from '../../shared/player/TmcPlayerModels';
import { TMC_ACCOUNT_CHANGED_EVENT, TMC_ACCOUNT_MENU_CHANGED_EVENT } from '../accounts/initializeAccountSwitcher';
import { TMC_AUTH_DIALOG_CHANGED_EVENT } from '../auth/initializeAuthPanel';
import { TMC_AUTH_LOGGED_IN_EVENT, TMC_CHANNEL_CHANGED_EVENT } from '../chat/TmcChannelChatController';

/** Measures the local host only; main owns playback and its lifetime. */
export function initializeLivePlayer(tmc: TmcRendererPreloadApi, channel: () => string | null,
  viewportChanged: () => void): { dispose: () => void } {
  const panel = document.querySelector<HTMLElement>('[data-tmc-player-panel]');
  const host = document.querySelector<HTMLElement>('[data-tmc-player-host]');
  const trigger = document.querySelector<HTMLButtonElement>('[data-tmc-player-toggle]');
  const title = document.querySelector<HTMLElement>('[data-tmc-player-title]');
  const status = document.querySelector<HTMLElement>('[data-tmc-player-status]');
  const move = document.querySelector<HTMLButtonElement>('[data-tmc-player-move]');
  const close = document.querySelector<HTMLButtonElement>('[data-tmc-player-close]');
  const sizing = document.querySelector<HTMLElement>('[data-tmc-player-sizing]');
  const size = document.querySelector<HTMLInputElement>('[data-tmc-player-height]');
  const chat = document.querySelector<HTMLElement>('.tmc-chat');
  if (!panel || !host || !trigger || !title || !status || !move || !close || !sizing || !size || !chat) throw new Error('Player UI is incomplete.');
  const lifetime = new AbortController();
  let requested = false, loading = false, moving = false, layoutReady = false;
  let context: TmcPlayerContext | null = null;
  let mode: TmcPlayerMode = 'embedded';
  let revision = 0, sequence = -1, desiredHeight = 300;
  let frame: number | null = null;
  const selected = (): TmcPlayerContext | null => {
    const profileId = document.querySelector<HTMLSelectElement>('[data-tmc-account-select]')?.value;
    const currentChannel = channel();
    return profileId && currentChannel ? { profileId, channel: currentChannel } : null;
  };
  const same = (a: TmcPlayerContext | null, b: TmcPlayerContext | null): boolean => !!a && !!b && a.profileId === b.profileId && a.channel === b.channel;
  const available = (): number => {
    let other = 0;
    for (const child of chat.children) if (child !== panel && !child.classList.contains('tmc-chat-feed')) other += child.getBoundingClientRect().height;
    const overhead = panel.getBoundingClientRect().height - (host.hidden ? 0 : host.getBoundingClientRect().height) + (sizing.hidden ? 32 : 0);
    return Math.floor(chat.getBoundingClientRect().height - other - 180 - overhead);
  };
  const bounds = (): TmcPlayerBounds | null => {
    if (document.querySelector('[data-tmc-auth-dialog][open], [data-tmc-auth-dialog][data-opening="true"], [data-tmc-account-menu][open]')) return null;
    const rect = host.getBoundingClientRect();
    const value = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.floor(rect.width), height: Math.floor(rect.height) };
    return value.width >= 400 && value.height >= 300 && value.x >= 0 && value.y >= 0 && value.x + value.width <= innerWidth && value.y + value.height <= innerHeight ? value : null;
  };
  const configure = (): void => {
    host.hidden = mode !== 'embedded'; sizing.hidden = mode !== 'embedded';
    move.textContent = mode === 'embedded' ? 'Open in window' : 'Show in chat';
    const room = available();
    move.disabled = loading || moving || (mode === 'detached' && (room < 300 || chat.getBoundingClientRect().width < 400));
    move.title = move.disabled && mode === 'detached' ? 'Enlarge the app to keep video and chat readable.' : '';
    size.max = String(Math.max(300, Math.min(600, room)));
    size.value = String(Math.max(300, Math.min(desiredHeight, Number(size.max))));
    host.style.height = `${size.value}px`;
  };
  const showError = (message: string): void => { panel.hidden = false; host.hidden = true; sizing.hidden = true; panel.dataset.state = 'error'; status.textContent = message; viewportChanged(); };
  const render = (value: TmcPlayerStatus): void => {
    const target = value.profileId && value.channel ? { profileId: value.profileId, channel: value.channel } : null;
    if (lifetime.signal.aborted || value.sequence < sequence || !same(target, selected())) return;
    sequence = value.sequence; mode = value.mode;
    layoutReady = value.state === 'loading' || value.state === 'ready';
    if (value.state === 'closed') requested = false;
    panel.hidden = value.state === 'closed';
    trigger.textContent = requested ? 'Hide live' : 'Show live'; trigger.setAttribute('aria-expanded', String(!panel.hidden));
    panel.dataset.state = value.state; panel.dataset.mode = mode;
    title.textContent = `Live · #${value.channel}`;
    status.textContent = value.message || (value.state === 'loading' ? 'Opening player…' : mode === 'detached'
      ? 'Player open in a separate window. Enlarge the app to show it above chat.' : 'Twitch shows playback and live/offline status in the player.');
    configure();
    if (value.state === 'error') { host.hidden = true; sizing.hidden = true; }
    viewportChanged(); schedule();
  };
  const activate = async (): Promise<void> => {
    const target = selected(); const operation = ++revision;
    if (!target) {
      const old = context; requested = false; loading = false; layoutReady = false; panel.hidden = true; context = null;
      trigger.textContent = 'Show live'; trigger.disabled = true; trigger.setAttribute('aria-expanded', 'false'); viewportChanged();
      if (old) try { await tmc.player.close(old); } catch { if (!lifetime.signal.aborted && operation === revision) showError('Player cleanup failed. Reopen the app.'); }
      return;
    }
    context = target; loading = true; layoutReady = false; panel.hidden = false;
    title.textContent = `Live · #${target.channel}`; status.textContent = 'Opening player…';
    host.hidden = false; sizing.hidden = false; host.style.height = `${desiredHeight}px`;
    if (mode !== 'detached' && (available() < 300 || host.getBoundingClientRect().width < 400)) mode = 'detached';
    configure();
    const rectangle = mode === 'embedded' ? bounds() : null;
    if (mode === 'embedded' && !rectangle) mode = 'detached';
    configure(); viewportChanged();
    try {
      const result = await tmc.player.open({ ...target, mode, bounds: mode === 'embedded' ? rectangle : null });
      if (!lifetime.signal.aborted && operation === revision && same(target, selected())) render(result);
    } catch { if (!lifetime.signal.aborted && operation === revision && same(target, selected())) showError('Could not open the player. Close it and try again.'); }
    finally { if (operation === revision) { loading = false; configure(); schedule(); } }
  };
  const changeMode = async (next: TmcPlayerMode): Promise<void> => {
    if (!context || moving || loading) return;
    const target = context, operation = revision; moving = true;
    try { const result = await tmc.player.setMode({ ...target, mode: next }); if (!lifetime.signal.aborted && operation === revision && same(target, selected())) render(result); }
    catch { if (!lifetime.signal.aborted && operation === revision) showError('Could not move the player. Close it and try again.'); }
    finally { moving = false; if (!lifetime.signal.aborted) { configure(); schedule(); } }
  };
  const synchronize = async (): Promise<void> => {
    trigger.disabled = !selected();
    if (!requested || !context || panel.dataset.state === 'error') return;
    if (loading || moving) {
      if (mode === 'embedded' && layoutReady) {
        const target = context, operation = revision;
        try { await tmc.player.layout({ ...target, bounds: bounds() }); }
        catch { if (operation === revision && same(target, selected())) showError('Player layout could not be updated. Close it and try again.'); }
      }
      return;
    }
    configure();
    if (mode === 'embedded' && (available() < 300 || host.getBoundingClientRect().width < 400)) { await changeMode('detached'); return; }
    if (mode === 'embedded') {
      const target = context, operation = revision;
      try { await tmc.player.layout({ ...target, bounds: bounds() }); }
      catch { if (operation === revision && same(target, selected())) showError('Player layout could not be updated. Close it and try again.'); }
    }
  };
  function schedule(): void {
    if (lifetime.signal.aborted || frame !== null) return;
    frame = requestAnimationFrame(() => { frame = null; void synchronize(); });
  }
  const stop = async (): Promise<void> => {
    const target = context, operation = ++revision;
    requested = false; loading = false; layoutReady = false; panel.hidden = true;
    trigger.textContent = 'Show live'; trigger.setAttribute('aria-expanded', 'false'); viewportChanged();
    if (!target) return;
    try { const result = await tmc.player.close(target); if (operation === revision) render(result); }
    catch { if (!lifetime.signal.aborted && operation === revision && same(target, selected())) showError('Player cleanup failed. Reopen the app before playing again.'); }
  };
  const changedContext = (): void => { if (requested) void activate(); else schedule(); };
  const occlusionChanged = (): void => {
    const hidden = !!document.querySelector('[data-tmc-auth-dialog][open], [data-tmc-auth-dialog][data-opening="true"], [data-tmc-account-menu][open]');
    void tmc.player.occlude({ hidden }).then(schedule).catch(() => {
      if (requested && !lifetime.signal.aborted) showError('Could not update player visibility. Close it and try again.');
    });
  };
  trigger.addEventListener('click', () => { if (requested) void stop(); else { requested = true; mode = 'embedded'; void activate(); } }, { signal: lifetime.signal });
  close.addEventListener('click', () => { void stop(); }, { signal: lifetime.signal });
  document.querySelector('[data-tmc-player-browser]')?.addEventListener('click', () => {
    const target = selected();
    if (!target) return;
    const operation = revision;
    void tmc.chat.openLink({ url: `https://www.twitch.tv/${encodeURIComponent(target.channel)}` }).catch(() => {
      if (operation === revision && !lifetime.signal.aborted) status.textContent = 'Could not open Twitch in your browser. Try again.';
    });
  }, { signal: lifetime.signal });
  move.addEventListener('click', () => { void changeMode(mode === 'embedded' ? 'detached' : 'embedded'); }, { signal: lifetime.signal });
  size.addEventListener('input', () => { const value = Number(size.value); if (Number.isFinite(value)) desiredHeight = Math.max(300, Math.min(600, value)); configure(); viewportChanged(); schedule(); }, { signal: lifetime.signal });
  for (const event of [TMC_ACCOUNT_CHANGED_EVENT, TMC_AUTH_LOGGED_IN_EVENT, TMC_CHANNEL_CHANGED_EVENT]) window.addEventListener(event, changedContext, { signal: lifetime.signal });
  window.addEventListener('resize', schedule, { signal: lifetime.signal });
  for (const event of [TMC_AUTH_DIALOG_CHANGED_EVENT, TMC_ACCOUNT_MENU_CHANGED_EVENT]) window.addEventListener(event, occlusionChanged, { signal: lifetime.signal });
  const observer = new ResizeObserver(schedule);
  const observe = (): void => { observer.observe(chat); for (const child of chat.children) if (!child.classList.contains('tmc-chat-feed')) observer.observe(child); };
  observe();
  const mutations = new MutationObserver(() => { observe(); schedule(); }); mutations.observe(chat, { childList: true });
  const unsubscribe = tmc.player.onStatusChanged(render); schedule();
  return { dispose: () => {
    lifetime.abort(); ++revision; observer.disconnect(); mutations.disconnect(); unsubscribe();
    if (frame !== null) cancelAnimationFrame(frame);
    const target = context;
    if (target) void tmc.player.close(target).catch(() => console.warn('[TMC Player] Playback cleanup failed during page exit.'));
  } };
}
