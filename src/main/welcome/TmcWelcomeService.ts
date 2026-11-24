import { JsonFileStore } from '../storage/JsonFileStore';
import { fetchDesktopRelease, isNewerRelease, stableVersion, type DesktopRelease } from './TmcReleaseClient';
import type { TmcWelcomeSnapshot, TmcWelcomeReason } from '../../shared/app/TmcWelcome';

type WelcomeState = { seenVersion: string | null; noticedVersion: string | null; release: DesktopRelease | null; lastAttempt: number | null };
const empty: WelcomeState = { seenVersion: null, noticedVersion: null, release: null, lastAttempt: null };
function cachedRelease(value: unknown): DesktopRelease | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || !('version' in value) || typeof value.version !== 'string' || !stableVersion(value.version) ||
    !('downloadUrl' in value) || typeof value.downloadUrl !== 'string' ||
    !['', 'v'].some((prefix) => value.downloadUrl === `https://github.com/unouidol/TwitchMiniChatDesktop/releases/download/${prefix}${value.version}/TMC-desktop-Setup.exe`)) throw new Error('Invalid cached desktop release');
  return { version: value.version, downloadUrl: value.downloadUrl };
}

/** Account-independent welcome/update state. All mutations have one serialized owner. */
export class TmcWelcomeService {
  private state: WelcomeState = { ...empty };
  private startup: TmcWelcomeReason = null;
  private checkState: TmcWelcomeSnapshot['checkState'] = 'never';
  private initialized: Promise<void> | null = null;
  private checking: Promise<TmcWelcomeSnapshot> | null = null;
  private stopped = false;
  private sequence = 0;
  private readonly lifetime = new AbortController();
  constructor(private readonly store: JsonFileStore<unknown>, private readonly version: string,
    private readonly automaticChecks: boolean, private readonly changed: (value: TmcWelcomeSnapshot) => void,
    private readonly fetchRelease: (signal?: AbortSignal) => Promise<DesktopRelease | null> = (signal) => fetchDesktopRelease(fetch, signal), private readonly now = Date.now) {}

  private initialize(): Promise<void> {
    return this.initialized ||= (async () => {
      const value = await this.store.read();
      if (value !== null) {
        if (!value || typeof value !== 'object' || !('seenVersion' in value) || !('noticedVersion' in value) ||
          !('release' in value) || !('lastAttempt' in value)) throw new Error('Welcome preferences unreadable');
        for (const entry of [value.seenVersion, value.noticedVersion]) if (entry !== null && (typeof entry !== 'string' || entry.length > 64)) throw new Error('Invalid welcome version');
        if (value.lastAttempt !== null && (typeof value.lastAttempt !== 'number' || !Number.isSafeInteger(value.lastAttempt) || value.lastAttempt < 0)) throw new Error('Invalid welcome check time');
        const release = cachedRelease(value.release);
        this.state = { seenVersion: typeof value.seenVersion === 'string' ? value.seenVersion : null,
          noticedVersion: typeof value.noticedVersion === 'string' ? value.noticedVersion : null,
          release,
          lastAttempt: typeof value.lastAttempt === 'number' ? value.lastAttempt : null };
      }
      const available = this.state.release && isNewerRelease(this.state.release.version, this.version) ? this.state.release.version : null;
      this.startup = !this.state.seenVersion ? 'first' : available && available !== this.state.noticedVersion ? 'available'
        : this.state.seenVersion !== this.version && isNewerRelease(this.version.replace(/-.*/, ''), this.state.seenVersion) ? 'updated' : null;
      const next = { ...this.state, seenVersion: this.version, noticedVersion: this.startup === 'available' ? available : this.state.noticedVersion };
      await this.store.write(next); this.state = next;
    })();
  }
  private snapshot(startup: TmcWelcomeReason = null): TmcWelcomeSnapshot {
    const release = this.state.release;
    const available = release && isNewerRelease(release.version, this.version) ? release : null;
    return { sequence: ++this.sequence, installedVersion: this.version, automaticChecks: this.automaticChecks, availableVersion: available?.version || null,
      downloadUrl: available?.downloadUrl || null, lastAttempt: this.state.lastAttempt, checkState: this.checkState, startup };
  }
  async start(): Promise<TmcWelcomeSnapshot> {
    await this.initialize();
    const value = this.snapshot(this.startup); this.startup = null;
    if (this.automaticChecks && (this.state.lastAttempt === null || this.state.lastAttempt > this.now() || this.now() - this.state.lastAttempt >= 86400000)) {
      void this.check().catch(() => console.warn('[TMC Welcome] Could not store update check.'));
    }
    return value;
  }
  async getState(): Promise<TmcWelcomeSnapshot> { await this.initialize(); return this.snapshot(); }
  check(): Promise<TmcWelcomeSnapshot> {
    if (this.checking) return this.checking;
    const operation = (async () => {
      await this.initialize();
      if (this.stopped) return this.snapshot();
      if (this.state.lastAttempt !== null && this.now() >= this.state.lastAttempt && this.now() - this.state.lastAttempt < 60000) return this.snapshot();
      const next = { ...this.state, lastAttempt: this.now() };
      await this.store.write(next); this.state = next;
      this.checkState = 'checking'; this.changed(this.snapshot());
      try {
        const release = await this.fetchRelease(this.lifetime.signal);
        if (this.stopped) return this.snapshot();
        const updated = { ...this.state, release };
        await this.store.write(updated); this.state = updated;
        this.checkState = release ? 'checked' : 'unpublished';
      } catch { this.checkState = 'failed'; }
      if (!this.stopped) this.changed(this.snapshot());
      return this.snapshot();
    })();
    this.checking = operation;
    void operation.finally(() => { this.checking = null; }).catch(() => undefined);
    return operation;
  }
  dispose(): void { this.stopped = true; this.lifetime.abort(); }
}
