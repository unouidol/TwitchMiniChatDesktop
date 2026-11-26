import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
import { readTwitchNameColor } from '../../shared/chat/TmcChatNameColor';
import { isTwitchLogin } from '../../shared/chat/TmcUserColors';

/** DOM-only enrichment. The main service owns provider/cache decisions. */
export class TmcChatNameColorController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly attempted = new Set<string>();
  private readonly inFlightNames = new Set<string>();
  private readonly authors = new Set<HTMLElement>();
  private readonly known = new Map<string, { color: string; provided: boolean }>();
  private revision = 0;
  private inFlight = false;
  private disposed = false;

  constructor(private readonly tmc: TmcRendererPreloadApi, private readonly getChannel: () => string | null) {}

  reset(): void {
    this.revision++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.inFlight = false;
    this.attempted.clear();
    this.inFlightNames.clear();
    this.authors.clear();
    this.known.clear();
  }

  dispose(): void { this.disposed = true; this.reset(); }

  schedule(added: readonly HTMLElement[] = []): void {
    if (this.disposed) return;
    for (const author of added.slice(-1000)) {
      const username = author.dataset.tmcAuthorLogin;
      const supplied = readTwitchNameColor(author.dataset.tmcNameColor);
      if (!username) continue;
      if (supplied && author.dataset.tmcColorSource === 'provided') this.remember(username, supplied, true);
      else {
        const known = this.known.get(username);
        if (known) this.apply(author, known.color);
        else if (isTwitchLogin(username) && (!this.attempted.has(username) || this.inFlightNames.has(username))) this.authors.add(author);
      }
    }
    while (this.authors.size > 1000) this.authors.delete(this.authors.values().next().value);
    if (this.timer !== null || !this.authors.size) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.reuseKnown();
      if (!this.inFlight) void this.resolve();
    }, 60);
  }

  private remember(username: string, color: string, provided: boolean): void {
    if (this.known.get(username)?.provided && !provided) return;
    this.known.delete(username);
    this.known.set(username, { color, provided });
    while (this.known.size > 1000) this.known.delete(this.known.keys().next().value);
  }

  private profileId(): string {
    return document.querySelector<HTMLSelectElement>('[data-tmc-account-select]')?.value || '';
  }

  private apply(author: HTMLElement, color: string): void {
    if (author.dataset.tmcColorSource !== 'fallback') return;
    author.style.color = color;
    author.dataset.tmcNameColor = color;
    author.dataset.tmcColorSource = 'lookup';
  }

  private reuseKnown(): void {
    for (const author of this.authors) {
      const known = this.known.get(author.dataset.tmcAuthorLogin);
      if (known) this.apply(author, known.color);
      if (!author.isConnected || known || (this.attempted.has(author.dataset.tmcAuthorLogin) && !this.inFlightNames.has(author.dataset.tmcAuthorLogin))) this.authors.delete(author);
    }
  }

  private async resolve(): Promise<void> {
    const profileId = this.profileId();
    const channel = this.getChannel();
    if (this.disposed || !profileId || !channel) return;
    this.reuseKnown();
    const names = [...new Set([...this.authors].map((author) => author.dataset.tmcAuthorLogin))].slice(0, Math.min(100, 1000 - this.attempted.size));
    if (!names.length) return;
    const revision = this.revision;
    names.forEach((name) => { this.attempted.add(name); this.inFlightNames.add(name); });
    this.inFlight = true;
    try {
      const result = await this.tmc.chat.getUserColors({ profileId, channel, usernames: names });
      if (this.disposed || revision !== this.revision || profileId !== this.profileId() || channel !== this.getChannel() ||
          result.profileId !== profileId || result.channel !== channel) return;
      // A live tag arriving during lookup takes precedence over its response.
      for (const entry of result.colors) {
        const color = readTwitchNameColor(entry.color);
        if (names.includes(entry.username) && color) this.remember(entry.username, color, false);
      }
    } catch {
      console.warn('[TMC Chat] User color lookup failed; readable fallback colors retained.');
    } finally {
      if (revision === this.revision) { this.inFlight = false; this.inFlightNames.clear(); this.reuseKnown(); this.schedule(); }
    }
  }
}
