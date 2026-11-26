export const TMC_PROJECT_LINKS = {
  website: 'https://tmc.ircminichat.party/',
  discord: 'https://discord.gg/E8yRUp2MBK',
  support: 'https://ko-fi.com/tmc_app',
} as const;
export type TmcWelcomeReason = 'first' | 'updated' | 'available' | null;
export type TmcWelcomeSnapshot = {
  sequence: number;
  installedVersion: string;
  automaticChecks: boolean;
  availableVersion: string | null;
  downloadUrl: string | null;
  checkState: 'never' | 'checking' | 'checked' | 'failed' | 'unpublished';
  lastAttempt: number | null;
  startup: TmcWelcomeReason;
};
export type TmcWelcomeApi = {
  start: () => Promise<TmcWelcomeSnapshot>;
  getState: () => Promise<TmcWelcomeSnapshot>;
  check: () => Promise<TmcWelcomeSnapshot>;
  onChanged: (listener: (value: TmcWelcomeSnapshot) => void) => () => void;
};
