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
} as const;

/**
 * Union type of all supported TMC Inter-Process Communication channel names.
 */
export type TmcIpcChannel =
  (typeof TMC_IPC_CHANNELS)[keyof typeof TMC_IPC_CHANNELS];
