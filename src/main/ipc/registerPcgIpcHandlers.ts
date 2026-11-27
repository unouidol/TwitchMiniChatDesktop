import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import type {
  TmcPcgActivateRequest,
  TmcPcgBoundsRequest,
  TmcPcgStatus,
} from '../../shared/pcg/TmcPcgModels';
import type {
  TmcPcgActivateSessionRequest,
  TmcPcgSessionStatus,
} from '../../shared/pcg/TmcPcgSessionModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import type { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import type { TmcAccountChannelStore } from '../channels/TmcAccountChannelStore';
import type { TmcPcgSessionHoldManager } from '../pcg/TmcPcgSessionHoldManager';
import type { TmcPcgSessionManager } from '../pcg/TmcPcgSessionManager';
import type { TmcTwitchWebSignOut } from '../web/TmcTwitchWebSignOut';
import { assertLocalRenderer } from './assertLocalRenderer';

/**
 * Registers PCG Inter-Process Communication handlers.
 */
export function registerPcgIpcHandlers(options: {
  readonly pcgSessionManager: TmcPcgSessionManager;
  readonly accountRegistry: TmcAccountSessionRegistry;
  readonly accountChannelStore: TmcAccountChannelStore;
  readonly pcgSessionHoldManager?: TmcPcgSessionHoldManager;
  readonly twitchWebSignOut: TmcTwitchWebSignOut;
}): void {
  let rendererSender: WebContents | null = null;

  const sendStatusChanged = (status: TmcPcgStatus): void => {
    sendToRenderer(rendererSender, TMC_IPC_CHANNELS.PCG_STATUS_CHANGED, status);
  };

  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_ACTIVATE,
    async (
      event: IpcMainInvokeEvent,
      request: TmcPcgActivateRequest = {},
    ): Promise<TmcPcgStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;
      const activation = await resolveActivationRequest(
        request,
        options.accountRegistry,
        options.accountChannelStore,
      );

      if (activation.ok === false) {
        return sendAndReturnStatus(sendStatusChanged, activation.status);
      }

      return options.pcgSessionManager.activate(
        activation.profileId,
        activation.channel,
        BrowserWindow.fromWebContents(event.sender),
      );
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_GET_STATUS,
    async (event: IpcMainInvokeEvent): Promise<TmcPcgStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;

      return options.pcgSessionManager.getStatus();
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_SET_BOUNDS,
    async (
      event: IpcMainInvokeEvent,
      request: TmcPcgBoundsRequest,
    ): Promise<TmcPcgStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;

      return options.pcgSessionManager.setBounds(
        request,
        BrowserWindow.fromWebContents(event.sender),
      );
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_HIDE_VIEW,
    async (event: IpcMainInvokeEvent): Promise<TmcPcgStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;

      return options.pcgSessionManager.hideView();
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_OPEN_TWITCH_LOGIN,
    async (event: IpcMainInvokeEvent): Promise<TmcPcgStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;

      return options.pcgSessionManager.openTwitchLogin(
        BrowserWindow.fromWebContents(event.sender),
      );
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_OPEN_DETACHED_WINDOW,
    async (event: IpcMainInvokeEvent): Promise<TmcPcgStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;

      return options.pcgSessionManager.openDetachedWindow(
        BrowserWindow.fromWebContents(event.sender),
      );
    },
  );
  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_SIGN_OUT_TWITCH,
    async (event: IpcMainInvokeEvent, request: unknown): Promise<TmcPcgStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;
      const profileId = readString(
        request && typeof request === 'object' && 'profileId' in request ? request.profileId : null,
      );
      // The renderer names the account it showed; refuse if PCG or the active
      // account moved on, so a stale click never signs out another account.
      if (!profileId || profileId !== options.pcgSessionManager.getStatus().profileId ||
        profileId !== options.accountRegistry.getActiveSession()?.profileId) {
        throw new Error('PCG account changed. Reopen the menu and try again.');
      }

      await options.twitchWebSignOut.signOut(profileId);

      return options.pcgSessionManager.getStatus();
    },
  );

  if (options.pcgSessionHoldManager) {
    registerLegacyHoldIpcHandlers(options.pcgSessionHoldManager);
  }
}

function registerLegacyHoldIpcHandlers(
  pcgSessionHoldManager: TmcPcgSessionHoldManager,
): void {
  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_GET_SESSION_STATUS,
    async (event: IpcMainInvokeEvent): Promise<TmcPcgSessionStatus> => {
      assertLocalRenderer(event);
      return pcgSessionHoldManager.getStatus();
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_ACTIVATE_SESSION,
    async (
      event,
      request: TmcPcgActivateSessionRequest,
    ): Promise<TmcPcgSessionStatus> => {
      assertLocalRenderer(event);
      return pcgSessionHoldManager.activateSession(
        request.profileId,
        request.channel,
      );
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.PCG_HOLD_ACTIVE_SESSION,
    async (event: IpcMainInvokeEvent): Promise<TmcPcgSessionStatus> => {
      assertLocalRenderer(event);
      return pcgSessionHoldManager.holdActiveSession();
    },
  );
}

type ResolvedActivation =
  | {
      readonly ok: true;
      readonly profileId: string;
      readonly channel: string;
    }
  | {
      readonly ok: false;
      readonly status: TmcPcgStatus;
    };

async function resolveActivationRequest(
  request: TmcPcgActivateRequest,
  accountRegistry: TmcAccountSessionRegistry,
  accountChannelStore: TmcAccountChannelStore,
): Promise<ResolvedActivation> {
  const activeSession = accountRegistry.getActiveSession();
  const profileId = readString(request.profileId) || activeSession?.profileId || null;

  if (!profileId) {
    return {
      ok: false,
      status: {
        state: 'empty',
        twitchAuth: 'unknown',
        displayMode: 'embedded',
        profileId: null,
        channel: null,
        message: 'Sign in is required for the PCG panel.',
      },
    };
  }

  const state = await accountChannelStore.getState(profileId);
  const channel = normalizeChannel(request.channel || state.lastChannel || '');

  if (!channel) {
    return {
      ok: false,
      status: {
        state: 'empty',
        twitchAuth: 'unknown',
        displayMode: 'embedded',
        profileId,
        channel: null,
        message: 'Select a channel before opening PCG.',
      },
    };
  }

  return {
    ok: true,
    profileId,
    channel,
  };
}

function sendAndReturnStatus(
  sendStatusChanged: (status: TmcPcgStatus) => void,
  status: TmcPcgStatus,
): TmcPcgStatus {
  sendStatusChanged(status);

  return status;
}

function sendToRenderer(
  rendererSender: WebContents | null,
  channel: string,
  payload: TmcPcgStatus,
): void {
  if (!rendererSender || rendererSender.isDestroyed()) {
    return;
  }

  rendererSender.send(channel, payload);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').toLowerCase();
}

