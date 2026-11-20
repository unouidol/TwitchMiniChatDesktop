export type TmcUserColorsRequest = {
  readonly profileId: string;
  readonly channel: string;
  readonly usernames: readonly string[];
};
export type TmcUserColorsResult = {
  readonly profileId: string;
  readonly channel: string;
  readonly status: 'ready' | 'unavailable';
  readonly colors: readonly { readonly username: string; readonly color: string | null }[];
};
export function isTwitchLogin(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_]{1,25}$/.test(value);
}
