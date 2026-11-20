import type {
  TmcAccountListResult,
  TmcActiveAccountResult,
  TmcRemoveLocalAccountRequest,
  TmcSetActiveAccountRequest,
} from '../shared/accounts/TmcAccountModels';
import type { TmcAppInfo } from '../shared/app/TmcAppInfo';
import type { TmcEmoteCatalog, TmcEmoteCatalogRequest } from '../shared/chat/TmcEmoteCatalog';
import type { TmcUserColorsRequest, TmcUserColorsResult } from '../shared/chat/TmcUserColors';
import type { TmcBadgeRequest, TmcBadgeCatalog } from '../shared/chat/TmcChatBadges';

import type {
  TmcActiveAccountChannelStateResult,
  TmcSetLastChannelRequest,
  TmcToggleFavoriteChannelRequest,
} from '../shared/channels/TmcAccountChannelModels';
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
  TmcChatLiveStatus,
  TmcConnectLiveChatRequest,
  TmcDisconnectLiveChatRequest,
  TmcLiveChatMessage,
  TmcSendChatMessageRequest,
} from '../shared/chat/TmcChatModels';
import type {
  SetCurrentChannelRequest,
  TmcDesktopSettings,
  TmcChatAppearance,
} from '../shared/settings/TmcSettingsModels';
import type {
  TmcPcgActivateRequest,
  TmcPcgBoundsRequest,
  TmcPcgStatus,
} from '../shared/pcg/TmcPcgModels';
import type {
  TmcPcgActivateSessionRequest,
  TmcPcgSessionStatus,
} from '../shared/pcg/TmcPcgSessionModels';

/**
 * Renderer-side view of the safe preload bridge.
 */
export type TmcRendererPreloadApi = {
  readonly emotes: { readonly getCatalog: (request: TmcEmoteCatalogRequest) => Promise<TmcEmoteCatalog> };
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
  readonly accounts: {
    readonly list: () => Promise<TmcAccountListResult>;
    readonly getActive: () => Promise<TmcActiveAccountResult>;
    readonly setActive: (
      request: TmcSetActiveAccountRequest,
    ) => Promise<TmcActiveAccountResult>;
    readonly removeLocal: (
      request: TmcRemoveLocalAccountRequest,
    ) => Promise<TmcAccountListResult>;
  };

  /**
   * Per-account channel operations available to the local UI.
   */
  readonly accountChannels: {
    readonly getActiveState: () => Promise<TmcActiveAccountChannelStateResult>;
    readonly setLast: (
      request: TmcSetLastChannelRequest,
    ) => Promise<TmcActiveAccountChannelStateResult>;
    readonly addRecent: (
      request: TmcSetLastChannelRequest,
    ) => Promise<TmcActiveAccountChannelStateResult>;
    readonly toggleFavorite: (
      request: TmcToggleFavoriteChannelRequest,
    ) => Promise<TmcActiveAccountChannelStateResult>;
  };

  /**
   * Authentication operations available to the local UI.
   */
  readonly auth: {
    readonly getStatus: () => Promise<TmcAuthStatus>;
    readonly getSession: () => Promise<TmcAuthStatus>;
    readonly startTwitchLogin?: (
      request: StartTwitchLoginRequest,
    ) => Promise<StartTwitchLoginResult>;
    readonly openTwitchLogin: (
      request: StartTwitchLoginRequest & { readonly slot?: number },
    ) => Promise<StartTwitchLoginResult>;
    readonly finalizeLoginToken?: (
      loginToken: string,
    ) => Promise<FinalizeTwitchLoginResult>;
    readonly finalizeTwitchLogin: (
      request: FinalizeTwitchLoginRequest,
    ) => Promise<FinalizeTwitchLoginResult>;
  };

  /**
   * Backend operations available to the local UI.
   */
  readonly backend: {
    readonly loadHistory: (
      request: LoadHistoryRequest,
    ) => Promise<LoadHistoryResult>;
  };

  /**
   * Live chat operations available to the local UI.
   */
  readonly chat: {
    readonly openLink: (request: { readonly url: string }) => Promise<void>;
    readonly getUserColors: (request: TmcUserColorsRequest) => Promise<TmcUserColorsResult>;
    readonly connectLive: (
      request: TmcConnectLiveChatRequest,
    ) => Promise<TmcChatLiveStatus>;
    readonly disconnectLive: (
      request?: TmcDisconnectLiveChatRequest,
    ) => Promise<TmcChatLiveStatus>;
    readonly sendMessage: (
      request: TmcSendChatMessageRequest,
    ) => Promise<TmcChatLiveStatus>;
    readonly getStatus: () => Promise<TmcChatLiveStatus>;
    readonly onLiveMessage: (
      callback: (message: TmcLiveChatMessage) => void,
    ) => () => void;
    readonly onStatusChanged: (
      callback: (status: TmcChatLiveStatus) => void,
    ) => () => void;
  };

  /**
   * Settings operations available to the local UI.
   */
  readonly badges: { readonly getCatalog: (request: TmcBadgeRequest) => Promise<TmcBadgeCatalog> };
  readonly settings: {
    readonly setChatAppearance: (value: TmcChatAppearance) => Promise<TmcDesktopSettings>;
    readonly get: () => Promise<TmcDesktopSettings>;
    readonly setCurrentChannel: (
      request: SetCurrentChannelRequest,
    ) => Promise<TmcDesktopSettings>;
  };

  /**
   * PCG session lifecycle operations available to the local UI.
   */
  readonly pcg: {
    readonly activate: (
      request?: TmcPcgActivateRequest,
    ) => Promise<TmcPcgStatus>;
    readonly getStatus: () => Promise<TmcPcgStatus>;
    readonly setBounds: (
      request: TmcPcgBoundsRequest,
    ) => Promise<TmcPcgStatus>;
    readonly hideView: () => Promise<TmcPcgStatus>;
    readonly openTwitchLogin: () => Promise<TmcPcgStatus>;
    readonly openDetachedWindow: () => Promise<TmcPcgStatus>;
    readonly onStatusChanged: (
      callback: (status: TmcPcgStatus) => void,
    ) => () => void;
    readonly getSessionStatus: () => Promise<TmcPcgSessionStatus>;
    readonly activateSession: (
      request: TmcPcgActivateSessionRequest,
    ) => Promise<TmcPcgSessionStatus>;
    readonly holdActiveSession: () => Promise<TmcPcgSessionStatus>;
  };
};
