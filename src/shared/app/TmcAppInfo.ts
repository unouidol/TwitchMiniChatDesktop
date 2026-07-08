/**
 * Public application metadata exposed to the local renderer.
 */
export type TmcAppInfo = {
  /**
   * Human-readable app name.
   */
  readonly appName: string;

  /**
   * Current Node.js platform identifier.
   */
  readonly platform: NodeJS.Platform;
};
