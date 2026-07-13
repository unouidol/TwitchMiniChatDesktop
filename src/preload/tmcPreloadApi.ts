import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
} from 'electron';

import type {
  TmcAccountListResult,
  TmcActiveAccountResult,
  TmcRemoveLocalAccountRequest,
  TmcSetActiveAccountRequest,
} from '../shared/accounts/TmcAccountModels';
import type { TmcAppInfo } from '../shared/app/TmcAppInfo';
import type {
  FinalizeTwitchLoginRequest,
  FinalizeTwitchLoginResult,
  StartTwitchLoginRequest,
  StartTwitchLoginResult,
  TmcAuthStatus,
} from '../shared/auth/TmcAuthModels';
import type {
  LoadHistoryRequest,
  LoadHistoryResult,
} from '../shared/backend/TmcHistoryModels';
import type {
  TmcActiveAccountChannelStateResult,
  TmcSetLastChannelRequest,
  TmcToggleFavoriteChannelRequest,
} from '../shared/channels/TmcAccountChannelModels';
import type {
  TmcChatLiveStatus,
  TmcConnectLiveChatRequest,
  TmcDisconnectLiveChatRequest,
  TmcLiveChatMessage,
  TmcSendChatMessageRequest,
} from '../shared/chat/TmcChatModels';
import { TMC_IPC_CHANNELS } from '../shared/ipc/IpcChannels';
import type {
  TmcPcgActivateRequest,
  TmcPcgBoundsRequest,
  TmcPcgStatus,
} from '../shared/pcg/TmcPcgModels';
import type {
  TmcPcgActivateSessionRequest,
  TmcPcgSessionStatus,
} from '../shared/pcg/TmcPcgSessionModels';
import type {
  SetCurrentChannelRequest,
  TmcDesktopSettings,
} from '../shared/settings/TmcSettingsModels';

/**
 * Authentication API exposed to the local renderer through the safe preload bridge.
 */
export type TmcAuthPreloadApi = {
  /**
   * Reads the current authentication status.
   */
  readonly getStatus: () => Promise<TmcAuthStatus>;

  /**
   * Reads the current authentication session safely without exposing secrets.
   */
  readonly getSession: () => Promise<TmcAuthStatus>;

  /**
   * Opens the Twitch login flow through the backend OAuth broker.
   */
  readonly startTwitchLogin: (
    request: StartTwitchLoginRequest,
  ) => Promise<StartTwitchLoginResult>;

  /**
   * Compatibility alias for older renderer code.
   */
  readonly openTwitchLogin: (
    request: StartTwitchLoginRequest & { readonly slot?: number },
  ) => Promise<StartTwitchLoginResult>;

  /**
   * Finalizes a manually pasted one-time login code.
   */
  readonly finalizeLoginToken: (
    loginToken: string,
  ) => Promise<FinalizeTwitchLoginResult>;

  /**
   * Compatibility alias for object-based finalize calls.
   */
  readonly finalizeTwitchLogin: (
    request: FinalizeTwitchLoginRequest,
  ) => Promise<FinalizeTwitchLoginResult>;
};

/**
 * Account API exposed to the local renderer through the safe preload bridge.
 */
export type TmcAccountsPreloadApi = {
  /**
   * Lists locally saved desktop accounts without exposing secrets.
   */
  readonly list: () => Promise<TmcAccountListResult>;

  /**
   * Reads the active account without exposing secrets.
   */
  readonly getActive: () => Promise<TmcActiveAccountResult>;

  /**
   * Sets the active account for chat, PCG, and account-scoped channel state.
   */
  readonly setActive: (
    request: TmcSetActiveAccountRequest,
  ) => Promise<TmcActiveAccountResult>;

  /**
   * Removes a saved account only from this desktop device.
   */
  readonly removeLocal: (
    request: TmcRemoveLocalAccountRequest,
  ) => Promise<TmcAccountListResult>;
};

/**
 * Per-account channel API exposed to the local renderer.
 */
export type TmcAccountChannelsPreloadApi = {
  /**
   * Reads last/recent/favorite channels for the active account.
   */
  readonly getActiveState: () => Promise<TmcActiveAccountChannelStateResult>;

  /**
   * Saves the last selected channel for the active account.
   */
  readonly setLast: (
    request: TmcSetLastChannelRequest,
  ) => Promise<TmcActiveAccountChannelStateResult>;

  /**
   * Adds a channel to the active account's recent channel list.
   */
  readonly addRecent: (
    request: TmcSetLastChannelRequest,
  ) => Promise<TmcActiveAccountChannelStateResult>;

  /**
   * Toggles a channel in the active account's favorite channel list.
   */
  readonly toggleFavorite: (
    request: TmcToggleFavoriteChannelRequest,
  ) => Promise<TmcActiveAccountChannelStateResult>;
};

/**
 * Backend API exposed to the local renderer through the safe preload bridge.
 */
export type TmcBackendPreloadApi = {
  /**
   * Loads cached chat history through the Electron main process.
   */
  readonly loadHistory: (
    request: LoadHistoryRequest,
  ) => Promise<LoadHistoryResult>;
};

/**
 * Live chat API exposed to the local renderer through the safe preload bridge.
 */
export type TmcChatPreloadApi = {
  /**
   * Connects the active account to Twitch live chat for the selected channel.
   */
  readonly connectLive: (
    request: TmcConnectLiveChatRequest,
  ) => Promise<TmcChatLiveStatus>;

  /**
   * Disconnects the current live chat session.
   */
  readonly disconnectLive: (
    request?: TmcDisconnectLiveChatRequest,
  ) => Promise<TmcChatLiveStatus>;

  /**
   * Sends one user-triggered manual chat message through the active IRC session.
   */
  readonly sendMessage: (
    request: TmcSendChatMessageRequest,
  ) => Promise<TmcChatLiveStatus>;

  /**
   * Reads the current live chat connection status.
   */
  readonly getStatus: () => Promise<TmcChatLiveStatus>;

  /**
   * Subscribes to incoming live chat messages.
   */
  readonly onLiveMessage: (
    callback: (message: TmcLiveChatMessage) => void,
  ) => () => void;

  /**
   * Subscribes to live chat status changes.
   */
  readonly onStatusChanged: (
    callback: (status: TmcChatLiveStatus) => void,
  ) => () => void;
};

/**
 * Settings API exposed to the local renderer through the safe preload bridge.
 */
export type TmcSettingsPreloadApi = {
  /**
   * Loads non-secret local desktop settings.
   */
  readonly get: () => Promise<TmcDesktopSettings>;

  /**
   * Updates the current channel in local desktop settings.
   */
  readonly setCurrentChannel: (
    request: SetCurrentChannelRequest,
  ) => Promise<TmcDesktopSettings>;
};

/**
 * Passive PCG API exposed to the local renderer through the safe preload bridge.
 */
export type TmcPcgPreloadApi = {
  /**
   * Activates the passive PCG panel for the current or requested account/channel.
   */
  readonly activate: (
    request?: TmcPcgActivateRequest,
  ) => Promise<TmcPcgStatus>;

  /**
   * Reads the current passive PCG panel status.
   */
  readonly getStatus: () => Promise<TmcPcgStatus>;

  /**
   * Updates the passive PCG WebContentsView bounds.
   */
  readonly setBounds: (
    request: TmcPcgBoundsRequest,
  ) => Promise<TmcPcgStatus>;

  /**
   * Hides the passive PCG WebContentsView.
   */
  readonly hideView: () => Promise<TmcPcgStatus>;

  /**
   * Opens manual Twitch web login in the active PCG partition.
   */
  readonly openTwitchLogin: () => Promise<TmcPcgStatus>;

  /**
   * Opens the active PCG popout in a separate manual window.
   */
  readonly openDetachedWindow: () => Promise<TmcPcgStatus>;

  /**
   * Subscribes to passive PCG status changes.
   */
  readonly onStatusChanged: (
    callback: (status: TmcPcgStatus) => void,
  ) => () => void;

  /**
   * Reads the current PCG hold/session lifecycle status.
   */
  readonly getSessionStatus: () => Promise<TmcPcgSessionStatus>;

  /**
   * Activates a PCG session for a specific account/channel pair.
   */
  readonly activateSession: (
    request: TmcPcgActivateSessionRequest,
  ) => Promise<TmcPcgSessionStatus>;

  /**
   * Moves the active PCG session into hold state.
   */
  readonly holdActiveSession: () => Promise<TmcPcgSessionStatus>;
};

/**
 * Safe API exposed to the local renderer.
 *
 * Keep this surface intentionally small. Remote content such as Twitch or
 * PokémonCommunityGame must never receive direct access to Node.js, Electron,
 * file system APIs, or unrestricted Inter-Process Communication.
 */
export type TmcPreloadApi = {
  /**
   * Returns basic application information for the local UI.
   */
  readonly getAppInfo: () => TmcAppInfo;

  /**
   * Sends a diagnostic ping to the Electron main process.
   */
  readonly ping: () => Promise<string>;

  /**
   * Account operations available to the local UI.
   */
  readonly accounts: TmcAccountsPreloadApi;

  /**
   * Per-account channel operations available to the local UI.
   */
  readonly accountChannels: TmcAccountChannelsPreloadApi;

  /**
   * Authentication operations available to the local UI.
   */
  readonly auth: TmcAuthPreloadApi;

  /**
   * Backend operations available to the local UI.
   */
  readonly backend: TmcBackendPreloadApi;

  /**
   * Live chat operations available to the local UI.
   */
  readonly chat: TmcChatPreloadApi;

  /**
   * Settings operations available to the local UI.
   */
  readonly settings: TmcSettingsPreloadApi;

  /**
   * Passive PCG operations available to the local UI.
   */
  readonly pcg: TmcPcgPreloadApi;
};

/**
 * Resolves an IPC channel name while keeping compatibility with older
 * camelCase channel keys that may still exist in this project.
 */
function resolveIpcChannel(
  preferredKey: string,
  fallbackValue: string,
  legacyKeys: readonly string[] = [],
): string {
  const channels = TMC_IPC_CHANNELS as unknown as Record<string, string>;
  const keys = [preferredKey, ...legacyKeys];

  for (const key of keys) {
    const value = channels[key];

    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return fallbackValue;
}

/**
 * Subscribes to a main-process IPC event and returns an unsubscribe function.
 */
function subscribeToIpcEvent<TPayload>(
  channel: string,
  callback: (payload: TPayload) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, payload: TPayload) => {
    callback(payload);
  };

  ipcRenderer.on(channel, listener);

  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const IPC_APP_PING = resolveIpcChannel('APP_PING', 'tmc:app:ping', [
  'appPing',
]);

const IPC_BACKEND_LOAD_HISTORY = resolveIpcChannel(
  'BACKEND_LOAD_HISTORY',
  'tmc:backend:load-history',
  ['backendLoadHistory'],
);

const IPC_SETTINGS_GET = resolveIpcChannel(
  'SETTINGS_GET',
  'tmc:settings:get',
);

const IPC_SETTINGS_SET_CURRENT_CHANNEL = resolveIpcChannel(
  'SETTINGS_SET_CURRENT_CHANNEL',
  'tmc:settings:set-current-channel',
);

const IPC_AUTH_GET_STATUS = resolveIpcChannel(
  'AUTH_GET_STATUS',
  'tmc:auth:get-status',
);

const IPC_AUTH_GET_SESSION = resolveIpcChannel(
  'AUTH_GET_SESSION',
  'tmc:auth:get-session',
);

const IPC_AUTH_OPEN_TWITCH_LOGIN = resolveIpcChannel(
  'AUTH_OPEN_TWITCH_LOGIN',
  'tmc:auth:open-twitch-login',
);

const IPC_AUTH_FINALIZE_TWITCH_LOGIN = resolveIpcChannel(
  'AUTH_FINALIZE_TWITCH_LOGIN',
  'tmc:auth:finalize-twitch-login',
);

const IPC_ACCOUNT_LIST = resolveIpcChannel(
  'ACCOUNT_LIST',
  'tmc:accounts:list',
);

const IPC_ACCOUNT_GET_ACTIVE = resolveIpcChannel(
  'ACCOUNT_GET_ACTIVE',
  'tmc:accounts:get-active',
);

const IPC_ACCOUNT_SET_ACTIVE = resolveIpcChannel(
  'ACCOUNT_SET_ACTIVE',
  'tmc:accounts:set-active',
);

const IPC_ACCOUNT_REMOVE_LOCAL = resolveIpcChannel(
  'ACCOUNT_REMOVE_LOCAL',
  'tmc:accounts:remove-local',
);

const IPC_ACCOUNT_CHANNELS_GET_ACTIVE_STATE = resolveIpcChannel(
  'ACCOUNT_CHANNELS_GET_ACTIVE_STATE',
  'tmc:account-channels:get-active-state',
);

const IPC_ACCOUNT_CHANNELS_SET_LAST = resolveIpcChannel(
  'ACCOUNT_CHANNELS_SET_LAST',
  'tmc:account-channels:set-last',
);

const IPC_ACCOUNT_CHANNELS_ADD_RECENT = resolveIpcChannel(
  'ACCOUNT_CHANNELS_ADD_RECENT',
  'tmc:account-channels:add-recent',
);

const IPC_ACCOUNT_CHANNELS_TOGGLE_FAVORITE = resolveIpcChannel(
  'ACCOUNT_CHANNELS_TOGGLE_FAVORITE',
  'tmc:account-channels:toggle-favorite',
);

const IPC_CHAT_CONNECT_LIVE = resolveIpcChannel(
  'CHAT_CONNECT_LIVE',
  'tmc:chat:connect-live',
);

const IPC_CHAT_DISCONNECT_LIVE = resolveIpcChannel(
  'CHAT_DISCONNECT_LIVE',
  'tmc:chat:disconnect-live',
);

const IPC_CHAT_SEND_MESSAGE = resolveIpcChannel(
  'CHAT_SEND_MESSAGE',
  'tmc:chat:send-message',
);

const IPC_CHAT_GET_STATUS = resolveIpcChannel(
  'CHAT_GET_STATUS',
  'tmc:chat:get-status',
);

const IPC_CHAT_LIVE_MESSAGE = resolveIpcChannel(
  'CHAT_LIVE_MESSAGE',
  'tmc:chat:live-message',
);

const IPC_CHAT_STATUS_CHANGED = resolveIpcChannel(
  'CHAT_STATUS_CHANGED',
  'tmc:chat:status-changed',
);

const IPC_PCG_ACTIVATE = resolveIpcChannel(
  'PCG_ACTIVATE',
  'tmc:pcg:activate',
);

const IPC_PCG_GET_STATUS = resolveIpcChannel(
  'PCG_GET_STATUS',
  'tmc:pcg:get-status',
);

const IPC_PCG_STATUS_CHANGED = resolveIpcChannel(
  'PCG_STATUS_CHANGED',
  'tmc:pcg:status-changed',
);

const IPC_PCG_SET_BOUNDS = resolveIpcChannel(
  'PCG_SET_BOUNDS',
  'tmc:pcg:set-bounds',
);

const IPC_PCG_HIDE_VIEW = resolveIpcChannel(
  'PCG_HIDE_VIEW',
  'tmc:pcg:hide-view',
);

const IPC_PCG_OPEN_TWITCH_LOGIN = resolveIpcChannel(
  'PCG_OPEN_TWITCH_LOGIN',
  'tmc:pcg:open-twitch-login',
);

const IPC_PCG_OPEN_DETACHED_WINDOW = resolveIpcChannel(
  'PCG_OPEN_DETACHED_WINDOW',
  'tmc:pcg:open-detached-window',
);

const IPC_PCG_GET_SESSION_STATUS = resolveIpcChannel(
  'PCG_GET_SESSION_STATUS',
  'tmc:pcg:get-session-status',
);

const IPC_PCG_ACTIVATE_SESSION = resolveIpcChannel(
  'PCG_ACTIVATE_SESSION',
  'tmc:pcg:activate-session',
);

const IPC_PCG_HOLD_ACTIVE_SESSION = resolveIpcChannel(
  'PCG_HOLD_ACTIVE_SESSION',
  'tmc:pcg:hold-active-session',
);

/**
 * Creates the safe preload API exposed to the local renderer.
 */
function createTmcPreloadApi(): TmcPreloadApi {
  return {
    getAppInfo: (): TmcAppInfo => ({
      appName: 'Twitch Mini Chat Desktop',
      platform: process.platform,
    }),

    ping: async (): Promise<string> => {
      return ipcRenderer.invoke(IPC_APP_PING);
    },

    accounts: {
      list: async (): Promise<TmcAccountListResult> => {
        return ipcRenderer.invoke(IPC_ACCOUNT_LIST);
      },

      getActive: async (): Promise<TmcActiveAccountResult> => {
        return ipcRenderer.invoke(IPC_ACCOUNT_GET_ACTIVE);
      },

      setActive: async (
        request: TmcSetActiveAccountRequest,
      ): Promise<TmcActiveAccountResult> => {
        return ipcRenderer.invoke(IPC_ACCOUNT_SET_ACTIVE, request);
      },

      removeLocal: async (
        request: TmcRemoveLocalAccountRequest,
      ): Promise<TmcAccountListResult> => {
        return ipcRenderer.invoke(IPC_ACCOUNT_REMOVE_LOCAL, request);
      },
    },

    accountChannels: {
      getActiveState: async (): Promise<TmcActiveAccountChannelStateResult> => {
        return ipcRenderer.invoke(IPC_ACCOUNT_CHANNELS_GET_ACTIVE_STATE);
      },

      setLast: async (
        request: TmcSetLastChannelRequest,
      ): Promise<TmcActiveAccountChannelStateResult> => {
        return ipcRenderer.invoke(IPC_ACCOUNT_CHANNELS_SET_LAST, request);
      },

      addRecent: async (
        request: TmcSetLastChannelRequest,
      ): Promise<TmcActiveAccountChannelStateResult> => {
        return ipcRenderer.invoke(IPC_ACCOUNT_CHANNELS_ADD_RECENT, request);
      },

      toggleFavorite: async (
        request: TmcToggleFavoriteChannelRequest,
      ): Promise<TmcActiveAccountChannelStateResult> => {
        return ipcRenderer.invoke(IPC_ACCOUNT_CHANNELS_TOGGLE_FAVORITE, request);
      },
    },

    auth: {
      getStatus: async (): Promise<TmcAuthStatus> => {
        return ipcRenderer.invoke(IPC_AUTH_GET_STATUS);
      },

      getSession: async (): Promise<TmcAuthStatus> => {
        return ipcRenderer.invoke(IPC_AUTH_GET_SESSION);
      },

      startTwitchLogin: async (
        request: StartTwitchLoginRequest,
      ): Promise<StartTwitchLoginResult> => {
        return ipcRenderer.invoke(IPC_AUTH_OPEN_TWITCH_LOGIN, request);
      },

      openTwitchLogin: async (
        request: StartTwitchLoginRequest & { readonly slot?: number },
      ): Promise<StartTwitchLoginResult> => {
        return ipcRenderer.invoke(IPC_AUTH_OPEN_TWITCH_LOGIN, request);
      },

      finalizeLoginToken: async (
        loginToken: string,
      ): Promise<FinalizeTwitchLoginResult> => {
        return ipcRenderer.invoke(IPC_AUTH_FINALIZE_TWITCH_LOGIN, loginToken);
      },

      finalizeTwitchLogin: async (
        request: FinalizeTwitchLoginRequest,
      ): Promise<FinalizeTwitchLoginResult> => {
        return ipcRenderer.invoke(IPC_AUTH_FINALIZE_TWITCH_LOGIN, request);
      },
    },

    backend: {
      loadHistory: async (
        request: LoadHistoryRequest,
      ): Promise<LoadHistoryResult> => {
        return ipcRenderer.invoke(IPC_BACKEND_LOAD_HISTORY, request);
      },
    },

    chat: {
      connectLive: async (
        request: TmcConnectLiveChatRequest,
      ): Promise<TmcChatLiveStatus> => {
        return ipcRenderer.invoke(IPC_CHAT_CONNECT_LIVE, request);
      },

      disconnectLive: async (
        request?: TmcDisconnectLiveChatRequest,
      ): Promise<TmcChatLiveStatus> => {
        return ipcRenderer.invoke(IPC_CHAT_DISCONNECT_LIVE, request ?? {});
      },

      sendMessage: async (
        request: TmcSendChatMessageRequest,
      ): Promise<TmcChatLiveStatus> => {
        return ipcRenderer.invoke(IPC_CHAT_SEND_MESSAGE, request);
      },

      getStatus: async (): Promise<TmcChatLiveStatus> => {
        return ipcRenderer.invoke(IPC_CHAT_GET_STATUS);
      },

      onLiveMessage: (
        callback: (message: TmcLiveChatMessage) => void,
      ): (() => void) => {
        return subscribeToIpcEvent<TmcLiveChatMessage>(
          IPC_CHAT_LIVE_MESSAGE,
          callback,
        );
      },

      onStatusChanged: (
        callback: (status: TmcChatLiveStatus) => void,
      ): (() => void) => {
        return subscribeToIpcEvent<TmcChatLiveStatus>(
          IPC_CHAT_STATUS_CHANGED,
          callback,
        );
      },
    },

    settings: {
      get: async (): Promise<TmcDesktopSettings> => {
        return ipcRenderer.invoke(IPC_SETTINGS_GET);
      },

      setCurrentChannel: async (
        request: SetCurrentChannelRequest,
      ): Promise<TmcDesktopSettings> => {
        return ipcRenderer.invoke(IPC_SETTINGS_SET_CURRENT_CHANNEL, request);
      },
    },

    pcg: {
      activate: async (
        request?: TmcPcgActivateRequest,
      ): Promise<TmcPcgStatus> => {
        return ipcRenderer.invoke(IPC_PCG_ACTIVATE, request ?? {});
      },

      getStatus: async (): Promise<TmcPcgStatus> => {
        return ipcRenderer.invoke(IPC_PCG_GET_STATUS);
      },

      setBounds: async (
        request: TmcPcgBoundsRequest,
      ): Promise<TmcPcgStatus> => {
        return ipcRenderer.invoke(IPC_PCG_SET_BOUNDS, request);
      },

      hideView: async (): Promise<TmcPcgStatus> => {
        return ipcRenderer.invoke(IPC_PCG_HIDE_VIEW);
      },

      openTwitchLogin: async (): Promise<TmcPcgStatus> => {
        return ipcRenderer.invoke(IPC_PCG_OPEN_TWITCH_LOGIN);
      },

      openDetachedWindow: async (): Promise<TmcPcgStatus> => {
        return ipcRenderer.invoke(IPC_PCG_OPEN_DETACHED_WINDOW);
      },

      onStatusChanged: (
        callback: (status: TmcPcgStatus) => void,
      ): (() => void) => {
        return subscribeToIpcEvent<TmcPcgStatus>(
          IPC_PCG_STATUS_CHANGED,
          callback,
        );
      },

      getSessionStatus: async (): Promise<TmcPcgSessionStatus> => {
        return ipcRenderer.invoke(IPC_PCG_GET_SESSION_STATUS);
      },

      activateSession: async (
        request: TmcPcgActivateSessionRequest,
      ): Promise<TmcPcgSessionStatus> => {
        return ipcRenderer.invoke(IPC_PCG_ACTIVATE_SESSION, request);
      },

      holdActiveSession: async (): Promise<TmcPcgSessionStatus> => {
        return ipcRenderer.invoke(IPC_PCG_HOLD_ACTIVE_SESSION);
      },
    },
  };
}

/**
 * Installs the safe TMC preload bridge into the renderer global scope.
 */
export function installTmcPreloadApi(): void {
  contextBridge.exposeInMainWorld('tmc', createTmcPreloadApi());
}