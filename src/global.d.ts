/**
 * Global renderer declarations for the secure TMC preload bridge.
 */
export {};

declare module '*.css' {
  const content: string;
  export default content;
}

declare global {
  interface Window {
    readonly tmc: {
      /**
       * Returns basic application information.
       */
      readonly getAppInfo: () => {
        readonly appName: string;
        readonly platform: NodeJS.Platform;
      };

      /**
       * Sends a diagnostic ping to the Electron main process.
       */
      readonly ping: () => Promise<string>;
    };
  }
}