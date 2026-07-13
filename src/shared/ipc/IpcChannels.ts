/**
 * Defines the Inter-Process Communication channel names used by TMC Desktop.
 *
 * Keeping channel names in one shared file avoids typo-prone string literals
 * across the main process, preload bridge, and renderer.
 */
export const TMC_IPC_CHANNELS = {
  /**
   * Diagnostic ping from the renderer to the main process.
   */
  appPing: 'tmc:app:ping',

  /**
   * Loads cached Twitch chat history from the TMC backend.
   */
  backendLoadHistory: 'tmc:backend:load-history',

  /**
   * Loads non-secret local desktop settings.
   */
  settingsGet: 'tmc:settings:get',

  /**
   * Updates the current Twitch channel in local desktop settings.
   */
  settingsSetCurrentChannel: 'tmc:settings:set-current-channel',

  /**
   * Reads current authentication status.
   */
  authGetStatus: 'tmc:auth:get-status',

  /**
   * Reads current authentication session without exposing secret tokens.
   */
  authGetSession: 'tmc:auth:get-session',

  /**
   * Opens the external Twitch OAuth flow.
   */
  authOpenTwitchLogin: 'tmc:auth:open-twitch-login',

  /**
   * Finalizes the Twitch OAuth login token in the main process.
   */
  authFinalizeTwitchLogin: 'tmc:auth:finalize-twitch-login',

  /**
   * Alias for the auth open Twitch login IPC channel name.
   */
  AUTH_OPEN_TWITCH_LOGIN: 'tmc:auth:open-twitch-login',

  /**
   * Alias for the auth finalize Twitch login IPC channel name.
   */
  AUTH_FINALIZE_TWITCH_LOGIN: 'tmc:auth:finalize-twitch-login',

  /**
   * Alias for the auth get session IPC channel name.
   */
  AUTH_GET_SESSION: 'tmc:auth:get-session',

  /**
   * Alias for the auth get status IPC channel name.
   */
  AUTH_GET_STATUS: 'tmc:auth:get-status',

  /**
   * Alias for the settings get IPC channel name.
   */
  SETTINGS_GET: 'tmc:settings:get',

  /**
   * Alias for the settings set current channel IPC channel name.
   */
  SETTINGS_SET_CURRENT_CHANNEL: 'tmc:settings:set-current-channel',
  /**
   * Lists saved desktop Twitch accounts without secrets.
   */
  ACCOUNT_LIST: 'tmc:account:list',

  /**
   * Reads the active desktop Twitch account without secrets.
   */
  ACCOUNT_GET_ACTIVE: 'tmc:account:get-active',

  /**
   * Sets the active desktop Twitch account.
   */
  ACCOUNT_SET_ACTIVE: 'tmc:account:set-active',

  /**
   * Removes a saved desktop account from this device only.
   */
  ACCOUNT_REMOVE_LOCAL: 'tmc:accounts:remove-local',
  /**
   * Reads channel state for the active account.
   */
  ACCOUNT_CHANNELS_GET_ACTIVE_STATE: 'tmc:account-channels:get-active-state',

  /**
   * Sets the last channel for the active account.
   */
  ACCOUNT_CHANNELS_SET_LAST: 'tmc:account-channels:set-last',

  /**
   * Adds a recent channel for the active account.
   */
  ACCOUNT_CHANNELS_ADD_RECENT: 'tmc:account-channels:add-recent',

  /**
   * Toggles a favorite channel for the active account.
   */
  ACCOUNT_CHANNELS_TOGGLE_FAVORITE: 'tmc:account-channels:toggle-favorite',

  /**
   * Connects the manual live Twitch chat client.
   */
  CHAT_CONNECT_LIVE: 'tmc:chat:connect-live',

  /**
   * Disconnects the manual live Twitch chat client.
   */
  CHAT_DISCONNECT_LIVE: 'tmc:chat:disconnect-live',

  /**
   * Sends one explicit user-authored Twitch chat message.
   */
  CHAT_SEND_MESSAGE: 'tmc:chat:send-message',

  /**
   * Reads the current live Twitch chat connection status.
   */
  CHAT_GET_STATUS: 'tmc:chat:get-status',

  /**
   * Activates the passive PCG desktop panel for account/channel.
   */
  PCG_ACTIVATE: 'tmc:pcg:activate',

  /**
   * Reads the passive PCG desktop panel status.
   */
  PCG_GET_STATUS: 'tmc:pcg:get-status',

  /**
   * Emits passive PCG desktop panel status changes.
   */
  PCG_STATUS_CHANGED: 'tmc:pcg:status-changed',

  /**
   * Applies renderer-measured bounds to the passive PCG WebContentsView.
   */
  PCG_SET_BOUNDS: 'tmc:pcg:set-bounds',

  /**
   * Hides the passive PCG WebContentsView without destroying its session.
   */
  PCG_HIDE_VIEW: 'tmc:pcg:hide-view',

  /**
   * Opens a manual Twitch web login window in the active PCG partition.
   */
  PCG_OPEN_TWITCH_LOGIN: 'tmc:pcg:open-twitch-login',

  /**
   * Opens the active PCG popout in a separate manual window.
   */
  PCG_OPEN_DETACHED_WINDOW: 'tmc:pcg:open-detached-window',

  /**
   * Reads the current PCG session hold manager status.
   */
  PCG_GET_SESSION_STATUS: 'tmc:pcg:get-session-status',

  /**
   * Activates or restores the PCG session for one account/channel key.
   */
  PCG_ACTIVATE_SESSION: 'tmc:pcg:activate-session',

  /**
   * Moves the current PCG session into the hold grace window.
   */
  PCG_HOLD_ACTIVE_SESSION: 'tmc:pcg:hold-active-session',

  /**
   * Emits a live Twitch chat message to subscribed renderer code.
   */
  CHAT_LIVE_MESSAGE: 'tmc:chat:live-message',

  /**
   * Emits live Twitch chat connection status changes.
   */
  CHAT_STATUS_CHANGED: 'tmc:chat:status-changed',
} as const;

/**
 * Union type of all supported TMC Inter-Process Communication channel names.
 */
export type TmcIpcChannel =
  (typeof TMC_IPC_CHANNELS)[keyof typeof TMC_IPC_CHANNELS];


  