import { isTwitchBadgeImage, type TmcBadgeCatalog } from '../../shared/chat/TmcChatBadges';
import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';

/** Enrich only newly added badge containers, with bounded pending DOM references. */
export class TmcChatBadgeController {
  private readonly containers = new Set<HTMLElement>();
  private catalog: TmcBadgeCatalog | null = null;
  private expires = 0;
  private pending = false;
  private revision = 0;
  private disposed = false;
  constructor(private readonly tmc: TmcRendererPreloadApi, private readonly channel: () => string | null,
    private readonly viewportChanged: () => void) {}

  reset(): void { this.revision++; this.containers.clear(); this.catalog = null; this.pending = false; this.expires = 0; }
  dispose(): void { this.disposed = true; this.reset(); }

  schedule(authors: readonly HTMLElement[]): void {
    if (this.disposed) return;
    for (const author of authors.slice(-1000)) {
      const container = author.parentElement?.querySelector<HTMLElement>('.tmc-chat-badges');
      if (container?.childElementCount) this.containers.add(container);
    }
    while (this.containers.size > 1000) this.containers.delete(this.containers.values().next().value);
    if (!this.containers.size) return;
    if (this.catalog && this.expires > Date.now()) { this.apply(); return; }
    if (this.pending) return;
    const profileId = document.querySelector<HTMLSelectElement>('[data-tmc-account-select]')?.value;
    const channel = this.channel();
    if (!profileId || !channel) { this.containers.clear(); return; }
    const revision = this.revision;
    this.pending = true;
    void this.tmc.badges.getCatalog({ profileId, channel }).then((catalog) => {
      if (this.disposed || revision !== this.revision || this.channel() !== channel ||
          document.querySelector<HTMLSelectElement>('[data-tmc-account-select]')?.value !== profileId || catalog.profileId !== profileId || catalog.channel !== channel) return;
      this.catalog = catalog;
      this.expires = Date.now() + (catalog.status === 'ready' ? 300000 : 30000);
      this.apply();
    }).catch(() => {
      if (revision === this.revision) { this.containers.clear(); this.expires = Date.now() + 30000;
        this.catalog = { profileId, channel, badges: [], status: 'unavailable' }; }
    }).finally(() => { if (revision === this.revision) this.pending = false; });
  }

  private apply(): void {
    const revision = this.revision;
    const definitions = new Map(this.catalog?.badges.map((badge) => [`${badge.setId}/${badge.version}`, badge]));
    for (const container of this.containers) {
      if (!container.isConnected) continue;
      for (const slot of container.querySelectorAll<HTMLElement>('[data-tmc-badge]')) {
        const badge = definitions.get(slot.dataset.tmcBadge);
        if (!badge || !isTwitchBadgeImage(badge.imageUrl)) continue;
        if (slot.childElementCount) continue;
        const image = document.createElement('img');
        image.alt = '';
        image.title = badge.title;
        image.width = 18; image.height = 18;
        image.decoding = 'async'; image.loading = 'eager'; image.referrerPolicy = 'no-referrer';
        image.addEventListener('load', () => {
          if (revision !== this.revision || !this.isCurrent(container)) return;
          slot.hidden = false;
          container.hidden = false;
          this.viewportChanged();
        }, { once: true });
        image.addEventListener('error', () => {
          if (revision !== this.revision || !this.isCurrent(container)) return;
          slot.hidden = true;
          slot.replaceChildren();
          slot.classList.remove('tmc-chat-badge-image');
          container.hidden = !Array.from(container.children).some((child) => child instanceof HTMLElement && !child.hidden);
          if (this.isCurrent(container)) this.viewportChanged();
        }, { once: true });
        slot.title = badge.title;
        slot.setAttribute('role', 'img');
        slot.setAttribute('aria-label', badge.title);
        slot.classList.add('tmc-chat-badge-image');
        slot.replaceChildren(image);
        image.src = badge.imageUrl;
      }
    }
    this.containers.clear();
    this.viewportChanged();
  }

  private isCurrent(container: HTMLElement): boolean {
    return !this.disposed && container.isConnected && this.catalog !== null &&
      this.channel() === this.catalog.channel &&
      document.querySelector<HTMLSelectElement>('[data-tmc-account-select]')?.value === this.catalog.profileId;
  }
}
