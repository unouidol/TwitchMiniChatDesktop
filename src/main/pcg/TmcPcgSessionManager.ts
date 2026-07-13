import {
  BrowserWindow,
  WebContentsView,
  shell,
  type BrowserWindowConstructorOptions,
  type Rectangle,
  type WebContents,
} from 'electron';
import type {
  TmcPcgBoundsRequest,
  TmcPcgSessionKey,
  TmcPcgStatus,
} from '../../shared/pcg/TmcPcgModels';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';

const HIDDEN_BOUNDS: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
const TWITCH_LOGIN_URL = 'https://www.twitch.tv/login';
const TWITCH_AUTH_COOKIE_NAME = 'auth-token';
const TWITCH_HOST_SUFFIX = 'twitch.tv';
const EXT_TWITCH_HOST_SUFFIX = 'ext-twitch.tv';
const TWITCH_AUTH_HOSTS = new Set([
  'id.twitch.tv',
  'passport.twitch.tv',
  'www.twitch.tv',
  'twitch.tv',
]);

/**
 * Main-process manager for the passive PCG desktop web session.
 *
 * This manager only loads the configured PCG URL in a WebContentsView. It does
 * not inspect DOM, inject probes, send chat commands, queue gameplay actions,
 * or automate PCG. The renderer owns layout measurement and sends bounds here.
 */
export class TmcPcgSessionManager {
  private status: TmcPcgStatus = {
    state: 'empty',
    displayMode: 'embedded',
    profileId: null,
    channel: null,
    message: null,
  };
  private view: WebContentsView | null = null;
  private attachedWindow: BrowserWindow | null = null;
  private currentBounds: Rectangle | null = null;
  private currentPartition: string | null = null;
  private authPopup: BrowserWindow | null = null;
  private isClosingAuthenticatedPopup = false;
  private panelUrl: string | null = null;
  private readonly detachedWindows = new Map<string, BrowserWindow>();
  private detachedPanelWindow: BrowserWindow | null = null;

  constructor(
    private readonly config: TmcRuntimeConfig,
    private readonly onStatusChanged: (status: TmcPcgStatus) => void,
  ) {}

  /**
   * Builds the stable session key from profileId and normalized channel.
   */
  buildSessionKey(profileId: string, channel: string): string {
    const key = this.normalizeKey(profileId, channel);

    return `${key.profileId}:${key.channel}`;
  }

  /**
   * Builds the account-isolated persistent Electron session partition.
   */
  buildPartition(profileId: string): string {
    const normalizedProfileId = profileId.trim();

    if (!normalizedProfileId) {
      throw new Error('PCG profileId cannot be empty.');
    }

    const safeProfileId = normalizedProfileId.replace(/[^a-zA-Z0-9_-]/g, '_');

    return `persist:tmc-pcg-${safeProfileId}`;
  }

  /**
   * Applies renderer-measured bounds to the PCG WebContentsView.
   */
  setBounds(
    bounds: TmcPcgBoundsRequest,
    ownerWindow?: BrowserWindow | null,
  ): TmcPcgStatus {
    const normalizedBounds = normalizeBounds(bounds);

    this.currentBounds = normalizedBounds;

    if (ownerWindow && !ownerWindow.isDestroyed()) {
      this.attachViewToWindow(ownerWindow);
    }

    this.applyCurrentBounds();

    return this.status;
  }

  /**
   * Hides the PCG WebContentsView without destroying its persistent session.
   */
  hideView(): TmcPcgStatus {
    this.currentBounds = null;
    this.applyCurrentBounds();

    return this.status;
  }

  /**
   * Opens manual Twitch web login in the active PCG persistent partition.
   */
  async openTwitchLogin(
    ownerWindow?: BrowserWindow | null,
  ): Promise<TmcPcgStatus> {
    const profileId = this.status.profileId;

    if (!profileId || !this.currentPartition || !this.view) {
      return this.setStatus({
        state: 'error',
        displayMode: this.status.displayMode,
        profileId: profileId || null,
        channel: this.status.channel,
        message: 'Open PCG before starting Twitch web sign-in.',
      });
    }

    const expectedPartition = this.buildPartition(profileId);

    if (this.currentPartition !== expectedPartition) {
      return this.setStatus({
        state: 'error',
        displayMode: this.status.displayMode,
        profileId,
        channel: this.status.channel,
        message: 'PCG partition is not ready for this account.',
      });
    }

    this.openAuthPopup(
      TWITCH_LOGIN_URL,
      this.currentPartition,
      ownerWindow || this.attachedWindow,
      {
        width: 900,
        height: 720,
        minWidth: 720,
        minHeight: 560,
        title: 'Sign in to Twitch for PCG',
      },
    );

    return this.setStatus({
      ...this.status,
      message: 'Twitch sign-in window opened for PCG.',
    });
  }

  /**
   * Opens the active PCG popout in a separate manual window.
   */
  async openDetachedWindow(
    ownerWindow?: BrowserWindow | null,
  ): Promise<TmcPcgStatus> {
    const profileId = this.status.profileId;
    const channel = this.status.channel;

    if (!profileId || !channel || !this.currentPartition) {
      return this.setStatus({
        state: 'error',
        displayMode: this.status.displayMode,
        profileId: profileId || null,
        channel: channel || null,
        message: 'Open PCG before opening it in a separate window.',
      });
    }

    const expectedPartition = this.buildPartition(profileId);

    if (this.currentPartition !== expectedPartition) {
      return this.setStatus({
        state: 'error',
        displayMode: this.status.displayMode,
        profileId,
        channel,
        message: 'PCG partition is not ready for this account.',
      });
    }

    const sessionKey = this.buildSessionKey(profileId, channel);
    const existingWindow = this.detachedWindows.get(sessionKey);

    if (existingWindow && !existingWindow.isDestroyed()) {
      if (existingWindow.isMinimized()) {
        existingWindow.restore();
      }

      existingWindow.show();
      existingWindow.focus();

      return this.enterDetachedDisplayMode(
        existingWindow,
        `PCG extension focused in a separate window for #${channel}.`,
      );
    }

    const url = buildPcgExtensionUrl(this.config, channel);

    if (!url) {
      return this.setStatus({
        state: 'error',
        displayMode: this.status.displayMode,
        profileId,
        channel,
        message: 'PCG extension URL is not configured.',
      });
    }

    const detachedWindow = new BrowserWindow(
      buildPcgChildWindowOptions(
        this.currentPartition,
        ownerWindow || this.attachedWindow,
        {
          width: 380,
          height: 700,
          minWidth: 320,
          minHeight: 560,
          title: 'PokémonCommunityGame',
        },
      ),
    );

    this.detachedWindows.set(sessionKey, detachedWindow);
    configurePcgChildWindow(
      detachedWindow,
      this.currentPartition,
      ownerWindow || this.attachedWindow,
    );
    detachedWindow.on('closed', () => {
      if (this.detachedWindows.get(sessionKey) === detachedWindow) {
        this.detachedWindows.delete(sessionKey);
      }

      this.restoreEmbeddedDisplayMode(detachedWindow);
      console.info('[PCG] detached window closed');
    });

    try {
      console.info(`[PCG] detached window opening ${sanitizeUrlForLog(url)}`);
      await detachedWindow.loadURL(url);
    } catch (error) {
      if (this.detachedWindows.get(sessionKey) === detachedWindow) {
        this.detachedWindows.delete(sessionKey);
      }

      return this.setStatus({
        state: 'error',
        displayMode: this.status.displayMode,
        profileId,
        channel,
        message: getErrorMessage(error),
      });
    }

    return this.enterDetachedDisplayMode(
      detachedWindow,
      `PCG extension opened in a separate window for #${channel}.`,
    );
  }
  /**
   * Activates the passive PCG web surface for an account/channel pair.
   */
  async activate(
    profileId: string,
    channel: string,
    ownerWindow?: BrowserWindow | null,
  ): Promise<TmcPcgStatus> {
    let key: TmcPcgSessionKey;

    try {
      key = this.normalizeKey(profileId, channel);
    } catch (error) {
      return this.setStatus({
        state: 'error',
        displayMode: this.status.displayMode,
        profileId: null,
        channel: null,
        message: getErrorMessage(error),
      });
    }

    const url = buildPcgExtensionUrl(this.config, key.channel);

    if (!url) {
      return this.setStatus({
        state: 'error',
        displayMode: this.status.displayMode,
        profileId: key.profileId,
        channel: key.channel,
        message: 'PCG extension URL is not configured.',
      });
    }

    this.panelUrl = url;
    this.setStatus({
      state: 'loading',
      displayMode: this.status.displayMode,
      profileId: key.profileId,
      channel: key.channel,
      message: null,
    });

    try {
      const view = this.ensureView(key.profileId, ownerWindow || null);
      this.applyCurrentBounds();
      console.info(`[PCG] loading panel ${sanitizeUrlForLog(url)}`);
      await view.webContents.loadURL(url);

      return this.setStatus({
        state: 'active',
        displayMode: this.status.displayMode,
        profileId: key.profileId,
        channel: key.channel,
        message: null,
      });
    } catch (error) {
      return this.setStatus({
        state: 'error',
        displayMode: this.status.displayMode,
        profileId: key.profileId,
        channel: key.channel,
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Returns renderer-safe PCG status.
   */
  getStatus(): TmcPcgStatus {
    return this.status;
  }

  private ensureView(
    profileId: string,
    ownerWindow: BrowserWindow | null,
  ): WebContentsView {
    const partition = this.buildPartition(profileId);

    if (
      this.view &&
      !this.view.webContents.isDestroyed() &&
      this.currentPartition === partition
    ) {
      if (ownerWindow) {
        this.attachViewToWindow(ownerWindow);
      }

      return this.view;
    }

    this.detachCurrentView();
    this.closeAuthPopup();
    this.currentPartition = partition;
    this.view = new WebContentsView({
      webPreferences: buildPcgWebPreferences(partition),
    });
    this.configurePcgWebContents(this.view, partition, ownerWindow);

    if (ownerWindow) {
      this.attachViewToWindow(ownerWindow);
    }

    return this.view;
  }

  private configurePcgWebContents(
    view: WebContentsView,
    partition: string,
    ownerWindow: BrowserWindow | null,
  ): void {
    view.webContents.setWindowOpenHandler(({ url }) => {
      const parsedUrl = tryParseUrl(url);

      if (!isAllowedPcgWindowOpenUrl(parsedUrl)) {
        console.warn(`[PCG] window.open blocked ${sanitizeUrlForLog(url)}`);
        openExternalIfSafe(parsedUrl);
        return { action: 'deny' };
      }

      console.info(`[PCG] window.open allowed ${sanitizeUrlForLog(url)}`);

      return {
        action: 'allow',
        overrideBrowserWindowOptions: buildPcgChildWindowOptions(
          partition,
          ownerWindow || this.attachedWindow,
          {
            width: 380,
            height: 700,
            minWidth: 320,
            minHeight: 560,
            title: 'PokémonCommunityGame',
          },
        ),
      };
    });

    view.webContents.on('will-navigate', (event, url) => {
      const parsedUrl = tryParseUrl(url);

      if (!parsedUrl || !isAllowedTwitchOrPcgUrl(parsedUrl)) {
        event.preventDefault();
        console.warn(`[PCG] navigation blocked ${sanitizeUrlForLog(url)}`);
        openExternalIfSafe(parsedUrl);
        return;
      }

      if (isTwitchAuthorizationHost(parsedUrl)) {
        event.preventDefault();
        console.info(
          `[PCG] authorization navigation moved to popup host=${parsedUrl.hostname.toLowerCase()}`,
        );
        this.openAuthPopup(parsedUrl.toString(), partition, ownerWindow);
        return;
      }

      console.info(`[PCG] navigation allowed ${sanitizeUrlForLog(url)}`);
    });

    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url) => {
      if (errorCode === -3) {
        return;
      }

      console.warn(
        `[PCG] load failed code=${errorCode} url=${sanitizeUrlForLog(url)} message=${sanitizeLogText(errorDescription)}`,
      );
    });

    view.webContents.on('did-finish-load', () => {
      const loadedUrl = view.webContents.getURL();
      console.info(`[PCG] load finished ${sanitizeUrlForLog(loadedUrl)}`);
    });

    view.webContents.on('did-create-window', (childWindow, details) => {
      console.info(`[PCG] child window created ${sanitizeUrlForLog(details.url)}`);
      configurePcgChildWindow(childWindow, partition, this.attachedWindow);

      const markDetachedIfNeeded = (url: string): void => {
        if (!isDetachedPcgWindowUrl(url)) {
          return;
        }

        this.enterDetachedDisplayMode(
          childWindow,
          'PCG extension opened in a separate window.',
        );
      };

      markDetachedIfNeeded(details.url);
      childWindow.webContents.on('will-navigate', (_event, url) => {
        markDetachedIfNeeded(url);
      });
      childWindow.webContents.on('did-navigate', (_event, url) => {
        markDetachedIfNeeded(url);
      });
      childWindow.on('closed', () => {
        this.restoreEmbeddedDisplayMode(childWindow);
        console.info('[PCG] child window closed');
      });
    });
  }

  private openAuthPopup(
    url: string,
    partition: string,
    ownerWindow: BrowserWindow | null,
    options: TmcPcgAuthPopupOptions = {},
  ): void {
    const parsedUrl = tryParseUrl(url);

    if (!parsedUrl || !isAllowedTwitchOrPcgUrl(parsedUrl)) {
      console.warn(`[PCG] popup blocked ${sanitizeUrlForLog(url)}`);
      return;
    }

    if (this.authPopup && !this.authPopup.isDestroyed()) {
      this.authPopup.focus();
      void this.authPopup.loadURL(url);
      return;
    }

    const authPopup = new BrowserWindow(
      buildPcgChildWindowOptions(partition, ownerWindow || this.attachedWindow, {
        width: options.width || 560,
        height: options.height || 760,
        minWidth: options.minWidth || 420,
        minHeight: options.minHeight || 560,
        title: options.title || 'PCG Twitch Sign-in',
      }),
    );
    this.authPopup = authPopup;
    configurePcgWebContentsForChildWindow(
      authPopup.webContents,
      partition,
      authPopup,
      'auth popup',
    );

    const checkAuthentication = (): void => {
      void this.closeAuthPopupWhenAuthenticated(authPopup);
    };

    authPopup.webContents.on('did-navigate', checkAuthentication);
    authPopup.webContents.on('did-finish-load', checkAuthentication);

    authPopup.on('closed', () => {
      console.info('[PCG] popup closed, reloading panel');
      if (this.authPopup === authPopup) {
        this.authPopup = null;
      }
      this.isClosingAuthenticatedPopup = false;
      this.reloadPanelAfterAuth();
      this.setStatus({
        ...this.status,
        message: 'PCG panel reloaded after Twitch sign-in window closed.',
      });
    });

    void authPopup.loadURL(url);
  }

  /**
   * Closes the PCG Twitch popup only after its persistent partition has a
   * Twitch session cookie. Cookie values are never read or logged.
   */
  private async closeAuthPopupWhenAuthenticated(
    authPopup: BrowserWindow,
  ): Promise<void> {
    if (
      this.authPopup !== authPopup ||
      authPopup.isDestroyed() ||
      this.isClosingAuthenticatedPopup
    ) {
      return;
    }

    try {
      const cookies = await authPopup.webContents.session.cookies.get({
        url: 'https://www.twitch.tv',
        name: TWITCH_AUTH_COOKIE_NAME,
      });

      if (cookies.length === 0 || this.authPopup !== authPopup) {
        return;
      }

      this.isClosingAuthenticatedPopup = true;
      this.setStatus({
        ...this.status,
        message: 'Twitch sign-in completed. Reloading PCG panel.',
      });
      authPopup.close();
    } catch {
      // Keep the popup open when the session state cannot be confirmed.
    }
  }
  private reloadPanelAfterAuth(): void {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return;
    }

    const currentUrl = this.view.webContents.getURL() || this.panelUrl;

    if (!currentUrl) {
      return;
    }

    const parsedUrl = tryParseUrl(currentUrl);

    if (!parsedUrl || !isAllowedTwitchOrPcgUrl(parsedUrl)) {
      return;
    }

    void this.view.webContents.loadURL(currentUrl).catch((error: unknown) => {
      console.warn(`[PCG] panel reload failed message=${sanitizeLogText(getErrorMessage(error))}`);
    });
  }

  private closeAuthPopup(): void {
    if (!this.authPopup || this.authPopup.isDestroyed()) {
      this.authPopup = null;
      return;
    }

    this.authPopup.close();
    this.authPopup = null;
  }

  private attachViewToWindow(ownerWindow: BrowserWindow): void {
    if (!this.view || ownerWindow.isDestroyed()) {
      return;
    }

    if (this.attachedWindow === ownerWindow) {
      return;
    }

    this.detachCurrentView();
    ownerWindow.contentView.addChildView(this.view);
    this.attachedWindow = ownerWindow;
    this.applyCurrentBounds();
  }

  private detachCurrentView(): void {
    if (!this.view || !this.attachedWindow || this.attachedWindow.isDestroyed()) {
      this.attachedWindow = null;
      return;
    }

    try {
      this.attachedWindow.contentView.removeChildView(this.view);
    } catch {
      // Detach is best-effort; replacing a view must not crash app startup.
    }

    this.attachedWindow = null;
  }

  private enterDetachedDisplayMode(
    detachedWindow: BrowserWindow,
    message: string,
  ): TmcPcgStatus {
    if (detachedWindow.isDestroyed()) {
      return this.status;
    }

    this.detachedPanelWindow = detachedWindow;
    const status = this.setStatus({
      ...this.status,
      displayMode: 'detached',
      message,
    });
    this.applyCurrentBounds();

    return status;
  }

  private restoreEmbeddedDisplayMode(detachedWindow: BrowserWindow): void {
    if (this.detachedPanelWindow !== detachedWindow) {
      return;
    }

    this.detachedPanelWindow = null;
    this.setStatus({
      ...this.status,
      displayMode: 'embedded',
      message: null,
    });
    this.applyCurrentBounds();
  }
  private applyCurrentBounds(): void {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return;
    }

    const bounds = this.status.displayMode === 'detached'
      ? HIDDEN_BOUNDS
      : this.currentBounds || HIDDEN_BOUNDS;

    this.view.setBounds(bounds);
  }

  private normalizeKey(profileId: string, channel: string): TmcPcgSessionKey {
    const normalizedProfileId = profileId.trim();
    const normalizedChannel = normalizeChannel(channel);

    if (!normalizedProfileId) {
      throw new Error('Sign in is required for the PCG panel.');
    }

    if (!normalizedChannel) {
      throw new Error('PCG channel cannot be empty.');
    }

    return {
      profileId: normalizedProfileId,
      channel: normalizedChannel,
    };
  }

  private setStatus(status: TmcPcgStatus): TmcPcgStatus {
    this.status = status;
    this.onStatusChanged(status);

    return status;
  }
}

type TmcPcgAuthPopupOptions = {
  readonly width?: number;
  readonly height?: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly title?: string;
};
/**
 * Builds the configured PCG extension URL for a channel.
 */
export function buildPcgExtensionUrl(
  config: TmcRuntimeConfig,
  channel: string,
): string | null {
  const template = config.pcgExtensionUrlTemplate?.trim();

  if (!template) {
    return null;
  }

  return template.includes('{channel}')
    ? template.replace(/\{channel\}/g, encodeURIComponent(channel))
    : template;
}

function buildPcgChildWindowOptions(
  partition: string,
  parentWindow: BrowserWindow | null,
  options: TmcPcgAuthPopupOptions = {},
): BrowserWindowConstructorOptions {
  return {
    width: options.width || 380,
    height: options.height || 700,
    minWidth: options.minWidth || 320,
    minHeight: options.minHeight || 560,
    title: options.title || 'PokémonCommunityGame',
    parent: parentWindow || undefined,
    modal: false,
    show: true,
    webPreferences: buildPcgWebPreferences(partition),
  };
}

function configurePcgChildWindow(
  childWindow: BrowserWindow,
  partition: string,
  parentWindow: BrowserWindow | null,
): void {
  configurePcgWebContentsForChildWindow(
    childWindow.webContents,
    partition,
    childWindow,
    'child window',
  );

  childWindow.webContents.on('did-create-window', (nestedWindow, details) => {
    console.info(`[PCG] nested child window created ${sanitizeUrlForLog(details.url)}`);
    configurePcgChildWindow(nestedWindow, partition, childWindow || parentWindow);
  });
}

function configurePcgWebContentsForChildWindow(
  webContents: WebContents,
  partition: string,
  parentWindow: BrowserWindow | null,
  logLabel: string,
): void {
  webContents.setWindowOpenHandler(({ url }) => {
    const parsedUrl = tryParseUrl(url);

    if (!isAllowedPcgWindowOpenUrl(parsedUrl)) {
      console.warn(`[PCG] ${logLabel} window.open blocked ${sanitizeUrlForLog(url)}`);
      openExternalIfSafe(parsedUrl);
      return { action: 'deny' };
    }

    console.info(`[PCG] ${logLabel} window.open allowed ${sanitizeUrlForLog(url)}`);

    return {
      action: 'allow',
      overrideBrowserWindowOptions: buildPcgChildWindowOptions(
        partition,
        parentWindow,
        {
          width: 380,
          height: 700,
          minWidth: 320,
          minHeight: 560,
          title: 'PokémonCommunityGame',
        },
      ),
    };
  });

  webContents.on('will-navigate', (event, url) => {
    const parsedUrl = tryParseUrl(url);

    if (!parsedUrl || !isAllowedTwitchOrPcgUrl(parsedUrl)) {
      event.preventDefault();
      console.warn(`[PCG] ${logLabel} navigation blocked ${sanitizeUrlForLog(url)}`);
      openExternalIfSafe(parsedUrl);
      return;
    }

    console.info(`[PCG] ${logLabel} navigation allowed ${sanitizeUrlForLog(url)}`);
  });

  webContents.on('did-fail-load', (_event, errorCode, errorDescription, url) => {
    if (errorCode === -3) {
      return;
    }

    console.warn(
      `[PCG] ${logLabel} load failed code=${errorCode} url=${sanitizeUrlForLog(url)} message=${sanitizeLogText(errorDescription)}`,
    );
  });

  webContents.on('did-finish-load', () => {
    console.info(`[PCG] ${logLabel} load finished ${sanitizeUrlForLog(webContents.getURL())}`);
  });
}
function buildPcgWebPreferences(partition: string): Electron.WebPreferences {
  return {
    partition,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  };
}

function normalizeBounds(bounds: TmcPcgBoundsRequest): Rectangle | null {
  const x = Math.round(Number(bounds.x));
  const y = Math.round(Number(bounds.y));
  const width = Math.round(Number(bounds.width));
  const height = Math.round(Number(bounds.height));

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { x, y, width, height };
}

function isAllowedPcgWindowOpenUrl(url: URL | null): boolean {
  if (!url) {
    return false;
  }

  return url.protocol === 'about:' || isAllowedTwitchOrPcgUrl(url);
}

function isAllowedTwitchOrPcgUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();

  return (
    url.protocol === 'https:' &&
    (TWITCH_AUTH_HOSTS.has(host) ||
      host.endsWith(`.${TWITCH_HOST_SUFFIX}`) ||
      host === EXT_TWITCH_HOST_SUFFIX ||
      host.endsWith(`.${EXT_TWITCH_HOST_SUFFIX}`))
  );
}

function isDetachedPcgWindowUrl(url: string): boolean {
  const parsedUrl = tryParseUrl(url);

  if (!parsedUrl || !isAllowedTwitchOrPcgUrl(parsedUrl)) {
    return false;
  }

  const host = parsedUrl.hostname.toLowerCase();
  const path = parsedUrl.pathname.toLowerCase();

  return (
    host === EXT_TWITCH_HOST_SUFFIX ||
    host.endsWith(`.${EXT_TWITCH_HOST_SUFFIX}`) ||
    path.includes('/extensions/')
  );
}
function isTwitchAuthorizationHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();

  return host === 'id.twitch.tv' || host === 'passport.twitch.tv';
}

function openExternalIfSafe(url: URL | null): void {
  if (!url || url.protocol !== 'https:') {
    return;
  }

  void shell.openExternal(url.toString()).catch((error: unknown) => {
    console.warn(`[PCG] external open failed message=${sanitizeLogText(getErrorMessage(error))}`);
  });
}

function sanitizeUrlForLog(url: string): string {
  const parsedUrl = tryParseUrl(url);

  if (!parsedUrl) {
    return 'invalid-url';
  }

  return `${parsedUrl.origin}${parsedUrl.pathname}`;
}

function sanitizeLogText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').slice(0, 180);
}

function tryParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function normalizeChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').toLowerCase();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'PCG panel failed.';
}



