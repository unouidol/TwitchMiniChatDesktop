import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
import { TMC_PROJECT_LINKS, type TmcWelcomeSnapshot } from '../../shared/app/TmcWelcome';
import { isLocalDialogVisible, TMC_LOCAL_DIALOG_CHANGED_EVENT } from '../dialogs/TmcLocalDialog';

export function initializeWelcome(tmc: TmcRendererPreloadApi): { dispose: () => void } {
  const dialog = document.querySelector<HTMLDialogElement>('[data-tmc-welcome-dialog]');
  const trigger = document.querySelector<HTMLButtonElement>('[data-tmc-welcome-open]');
  const close = document.querySelector<HTMLButtonElement>('[data-tmc-welcome-close]');
  const check = document.querySelector<HTMLButtonElement>('[data-tmc-welcome-check]');
  const download = document.querySelector<HTMLButtonElement>('[data-tmc-welcome-download]');
  const status = document.querySelector<HTMLElement>('[data-tmc-welcome-status]');
  const version = document.querySelector<HTMLElement>('[data-tmc-welcome-version]');
  const error = document.querySelector<HTMLElement>('[data-tmc-welcome-error]');
  if (!dialog || !trigger || !close || !check || !download || !status || !version || !error) throw new Error('Welcome markup incomplete');
  const lifetime = new AbortController();
  let snapshot: TmcWelcomeSnapshot | null = null;
  let sequence = -1;
  let opening = false;
  let startupPending = false;
  const changed = (): void => { window.dispatchEvent(new Event(TMC_LOCAL_DIALOG_CHANGED_EVENT)); };
  const render = (value: TmcWelcomeSnapshot): void => {
    if (lifetime.signal.aborted || value.sequence < sequence) return;
    sequence = value.sequence;
    snapshot = value;
    trigger.dataset.ready = 'true';
    version.textContent = `Installed version: ${value.installedVersion}`;
    check.disabled = value.checkState === 'checking';
    download.hidden = !value.downloadUrl;
    trigger.textContent = value.availableVersion ? 'About TMC · Update available' : 'About TMC';
    status.textContent = value.checkState === 'checking' ? 'Checking for updates…' : value.availableVersion ? `TMC desktop ${value.availableVersion} is available.`
      : value.checkState === 'failed' ? 'Could not check for updates. You can try again later.'
      : value.checkState === 'unpublished' ? 'No public stable Windows release is available yet.'
      : value.checkState === 'checked' ? 'No newer Windows version was found at the last check.'
      : value.automaticChecks ? 'Updates are checked in the background, at most once a day.' : 'Automatic checks are off in development builds. You can check manually.';
  };
  const open = async (): Promise<void> => {
    if (opening || isLocalDialogVisible() || lifetime.signal.aborted) return;
    opening = true; startupPending = false; dialog.dataset.opening = 'true'; error.hidden = true;
    const menu = document.querySelector<HTMLDetailsElement>('[data-tmc-account-menu]');
    if (menu) menu.open = false;
    try {
      await Promise.all([tmc.pcg.hideView(), tmc.player.occlude({ hidden: true })]);
      if (lifetime.signal.aborted) return;
      render(await tmc.welcome.getState());
      if (lifetime.signal.aborted) return;
      dialog.showModal(); close.focus(); startupPending = false;
    } catch { if (!lifetime.signal.aborted) { error.hidden = false; error.textContent = 'Could not open About TMC. Please try again.'; } }
    finally { opening = false; delete dialog.dataset.opening; if (!lifetime.signal.aborted) changed(); }
  };
  trigger.addEventListener('click', () => { void open(); }, { signal: lifetime.signal });
  close.addEventListener('click', () => dialog.close(), { signal: lifetime.signal });
  dialog.addEventListener('close', () => { changed(); document.querySelector<HTMLElement>('[data-tmc-account-menu] summary')?.focus(); }, { signal: lifetime.signal });
  check.addEventListener('click', async () => {
    check.disabled = true;
    try { render(await tmc.welcome.check()); }
    catch { if (!lifetime.signal.aborted) status.textContent = 'Could not check for updates. Please try again later.'; }
    finally { if (!lifetime.signal.aborted) check.disabled = false; }
  }, { signal: lifetime.signal });
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-tmc-project-link]')) button.addEventListener('click', () => {
    const key = button.dataset.tmcProjectLink;
    const url = key === 'website' || key === 'discord' || key === 'support' ? TMC_PROJECT_LINKS[key] : key === 'download' ? snapshot?.downloadUrl : null;
    if (url) void tmc.chat.openLink({ url }).catch(() => { if (!lifetime.signal.aborted) status.textContent = 'Could not open your browser. Please try again.'; });
  }, { signal: lifetime.signal });
  const unsubscribe = tmc.welcome.onChanged(render);
  window.addEventListener(TMC_LOCAL_DIALOG_CHANGED_EVENT, () => { if (startupPending && !isLocalDialogVisible()) void open(); }, { signal: lifetime.signal });
  void tmc.welcome.start().then((value) => {
    if (lifetime.signal.aborted) return;
    render(value); startupPending = !!value.startup;
    if (startupPending) void open();
  }).catch(() => { if (!lifetime.signal.aborted) { error.hidden = false; error.textContent = 'Welcome preferences could not be read. Your saved accounts are unchanged.'; } });
  return { dispose: () => { lifetime.abort(); unsubscribe(); } };
}
