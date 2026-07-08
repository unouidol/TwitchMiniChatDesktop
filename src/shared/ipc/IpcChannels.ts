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
} as const;

/**
 * Union type of all supported TMC Inter-Process Communication channel names.
 */
export type TmcIpcChannel =
  (typeof TMC_IPC_CHANNELS)[keyof typeof TMC_IPC_CHANNELS];
