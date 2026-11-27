import { BrowserWindow, type Session } from 'electron';
import type { TmcPlayerStatus } from '../../shared/player/TmcPlayerModels';
import type { TmcTwitchWebSessions } from './TmcTwitchWebSessions';

const TWITCH_AUTH_COOKIE = { url: 'https://www.twitch.tv', name: 'auth-token' } as const;

type TmcTwitchWebPlayer = {
  getStatus(): TmcPlayerStatus;
  close(): Promise<TmcPlayerStatus>;
};

type TmcTwitchWebPcg = {
  completeTwitchWebSignOut(profileId: string): void;
};

/**
 * Signs one account out of its Twitch web session, shared by PCG and video.
 *
 * Chat OAuth is a separate identity and is not touched. Cookie values are never
 * read: only the presence of the Twitch auth cookie is checked afterwards.
 */
export class TmcTwitchWebSignOut {
  constructor(
    private readonly webSessions: TmcTwitchWebSessions,
    private readonly pcg: TmcTwitchWebPcg,
    private readonly player: TmcTwitchWebPlayer,
  ) {}

  async signOut(profileId: string): Promise<void> {
    const owner = profileId.trim();
    const browserSession = this.webSessions.get(owner);
    const t0 = Date.now();
    const diagLines: string[] = [];
    const count = async (): Promise<number> => (await browserSession.cookies.get(TWITCH_AUTH_COOKIE)).length;
    const diag = (_e: unknown, cookie: Electron.Cookie, cause: string, removed: boolean): void => {
      if (cookie.name === 'auth-token') diagLines.push(` at=${Date.now()} +${Date.now() - t0}ms changed removed=${removed} cause=${cause} domain=${cookie.domain} path=${cookie.path} hostOnly=${cookie.hostOnly} session=${cookie.session}`);
    };
    browserSession.cookies.on('changed', diag);
    diagLines.push(` at=${Date.now()} +0ms start authCookies=${await count()} windows=${BrowserWindow.getAllWindows().length}`);
    const player = this.player.getStatus();

    if (player.profileId === owner && player.state !== 'closed') {
      await this.player.close();
    }

    // Sign-in popups and separate PCG windows share the storage being cleared;
    // left open they would keep showing a signed-in page.
    await destroyWindowsUsing(browserSession);
    await browserSession.clearStorageData();
    diagLines.push(` at=${Date.now()} +${Date.now() - t0}ms after clearStorageData authCookies=${await count()}`);
    await browserSession.clearCache();
    await browserSession.clearAuthCache();
    diagLines.push(` at=${Date.now()} +${Date.now() - t0}ms after caches authCookies=${await count()}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    diagLines.push(` at=${Date.now()} +${Date.now() - t0}ms after 300ms authCookies=${await count()}`);
    browserSession.cookies.removeListener('changed', diag);

    if ((await browserSession.cookies.get(TWITCH_AUTH_COOKIE)).length > 0) {
      throw new Error(`Twitch sign-in for PCG and video could not be cleared. DIAG ${diagLines.join(' | ')}`);
    }

    this.pcg.completeTwitchWebSignOut(owner);
  }
}

async function destroyWindowsUsing(browserSession: Session): Promise<void> {
  const windows = BrowserWindow.getAllWindows().filter((window) =>
    !window.isDestroyed() && !window.webContents.isDestroyed() &&
    window.webContents.session === browserSession);

  await Promise.all(windows.map((window) => new Promise<void>((resolve) => {
    window.once('closed', () => resolve());
    // destroy() skips beforeunload, which a Twitch page could use to keep it open.
    window.destroy();
  })));
}
