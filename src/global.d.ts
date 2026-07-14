/**
 * Global renderer declarations for the secure TMC preload bridge.
 */
export {};

import type { TmcRendererPreloadApi } from './renderer/TmcRendererPreloadApi';

declare module '*.css' {
  const content: string;
  export default content;
}

declare global {
  interface Window {
    readonly tmc: TmcRendererPreloadApi;
  }
}