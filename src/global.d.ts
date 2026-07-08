import type { TmcPreloadApi } from './preload/tmcPreloadApi';

/**
 * Global renderer declarations for the secure TMC preload bridge.
 */
export {};

declare global {
  interface Window {
    /**
     * Safe TMC API exposed by Electron preload.
     */
    readonly tmc: TmcPreloadApi;
  }
}
