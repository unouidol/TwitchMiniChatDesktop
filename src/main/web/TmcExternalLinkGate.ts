import { BrowserWindow, dialog, shell } from 'electron';

type TmcConfirmExternalOpen = (url: URL) => Promise<boolean>;
type TmcOpenExternal = (url: string) => Promise<void>;

const MAX_SHOWN_URL_LENGTH = 300;

/**
 * Opens links from remote Twitch/PCG pages in the system browser only after the
 * user confirms.
 *
 * Electron 43 reports no user gesture for `window.open` or navigations (only
 * DownloadItem has `hasUserGesture()`), so a remote page or extension could
 * otherwise open any https URL in the user's browser unasked. One request is
 * shown at a time; requests arriving meanwhile are dropped, so a page cannot
 * queue up a burst of prompts or tabs.
 */
export class TmcExternalLinkGate {
  private pending = false;

  constructor(
    private readonly confirm: TmcConfirmExternalOpen,
    private readonly open: TmcOpenExternal,
  ) {}

  request(url: URL | null): void {
    if (!url || url.protocol !== 'https:') {
      return;
    }

    if (this.pending) {
      console.warn(`[PCG] external link dropped while another is awaiting confirmation host=${url.hostname}`);
      return;
    }

    this.pending = true;
    void this.confirm(url)
      .then((confirmed) => (confirmed ? this.open(url.toString()) : undefined))
      .catch((error: unknown) => {
        console.warn(`[PCG] external link failed message=${error instanceof Error ? error.message : 'unknown'}`);
      })
      .finally(() => {
        this.pending = false;
      });
  }
}

export function createExternalLinkGate(): TmcExternalLinkGate {
  return new TmcExternalLinkGate(confirmWithDialog, (url) => shell.openExternal(url));
}

async function confirmWithDialog(url: URL): Promise<boolean> {
  const shown = url.toString();
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    buttons: ['Cancel', 'Open in browser'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Open external link',
    message: `Open ${url.hostname} in your browser?`,
    detail: `A Twitch or PCG page wants to open:\n${shown.length > MAX_SHOWN_URL_LENGTH ? `${shown.slice(0, MAX_SHOWN_URL_LENGTH)}…` : shown}`,
  };
  const parent = BrowserWindow.getFocusedWindow();
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);

  return response === 1;
}
