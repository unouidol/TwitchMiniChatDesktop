import { BrowserWindow, WebContentsView, type Session, type WebContents, type View } from 'electron';
import type { TmcTwitchWebSessions } from '../web/TmcTwitchWebSessions';
import { TmcPlayerDocument } from './TmcPlayerDocument';
import type { TmcPlayerBounds, TmcPlayerContext, TmcPlayerMode, TmcPlayerOpenRequest, TmcPlayerStatus } from '../../shared/player/TmcPlayerModels';

/** One playback surface using the selected account's existing PCG/Twitch web session. */
export class TmcPlayerManager {
  private status: TmcPlayerStatus = { sequence: 0, state: 'closed', profileId: null, channel: null, mode: 'embedded', message: null };
  private revision = 0;
  private requestedContext: TmcPlayerContext | null = null;
  private pending: Promise<void> = Promise.resolve();
  private view: WebContentsView | null = null;
  private contents: WebContents | null = null;
  private document: TmcPlayerDocument | null = null;
  private owner: BrowserWindow | null = null;
  private watchedOwner: BrowserWindow | null = null;
  private ownerContents: WebContents | null = null;
  private viewOwner: BrowserWindow | null = null;
  private detached: BrowserWindow | null = null;
  private detachedRoot: View | null = null;
  private bounds: TmcPlayerBounds | null = null;
  private partition: Session | null = null;
  private occluded = false;
  private mutedBeforeOcclusion = false;
  private readonly hiddenOwners = new WeakSet<BrowserWindow>();
  private readonly ownerClosed = (): void => { void this.close().catch(() => console.warn('[TMC Player] Playback cleanup failed.')); };
  private readonly ownerNavigated = (details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>): void => {
    if (details.isMainFrame && !details.isSameDocument) this.ownerClosed();
  };
  private readonly ownerDestroyed = (): void => { this.unwatchOwner(); this.ownerClosed(); };

  constructor(private readonly activeProfile: () => string | null, private readonly changed: (status: TmcPlayerStatus) => void,
    private readonly webSessions: TmcTwitchWebSessions) {}
  getStatus(): TmcPlayerStatus { return this.status; }
  get source(): { origin: string; pathname: string } | null { return this.document?.source || null; }
  occlude(hidden: boolean, owner: BrowserWindow): void {
    if (hidden) this.hiddenOwners.add(owner); else this.hiddenOwners.delete(owner);
    if (this.owner === owner) this.applyBounds();
  }

  show(request: TmcPlayerOpenRequest, owner: BrowserWindow): Promise<TmcPlayerStatus> {
    this.watchOwner(owner);
    const context = { profileId: request.profileId, channel: request.channel };
    this.requestedContext = context;
    const revision = ++this.revision;
    if (this.status.state === 'loading' && this.contents && !this.contents.isDestroyed()) this.contents.stop();
    return this.serialize(async () => {
      this.assertCurrent(context, revision);
      try {
        if (this.status.profileId !== context.profileId || this.owner !== owner) await this.release();
        this.assertCurrent(context, revision);
        if (!this.owner) this.owner = owner;
        const channelChanged = !this.view || this.status.channel !== context.channel;
        this.bounds = request.bounds;
        this.update({ ...context, mode: request.mode, state: 'loading', message: null });
        if (!this.document) this.document = new TmcPlayerDocument();
        const url = await this.document.url(context.channel);
        this.assertCurrent(context, revision);
        if (!this.partition) {
          this.partition = this.webSessions.get(context.profileId);
        }
        if (!this.view) {
          this.view = new WebContentsView({ webPreferences: { session: this.partition, sandbox: true,
            contextIsolation: true, nodeIntegration: false, webSecurity: true } });
          this.contents = this.view.webContents;
          this.contents.setWindowOpenHandler(() => ({ action: 'deny' }));
          this.contents.on('will-navigate', (event) => event.preventDefault());
        }
        this.move(request.mode);
        if (channelChanged) {
          const contents = this.contents;
          if (!contents) throw new Error('Player contents unavailable.');
          let timer: ReturnType<typeof setTimeout>;
          try {
            await Promise.race([contents.loadURL(url), new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Player load timed out.')), 15000);
            })]);
          } finally { clearTimeout(timer); }
        }
        this.assertCurrent(context, revision);
        this.update({ ...context, mode: request.mode, state: 'ready', message: null });
        return this.status;
      } catch (error) {
        try { await this.release(); }
        catch (cleanupError) {
          this.update({ ...context, state: 'error', message: 'Player cleanup failed. Reopen the app before playing again.' });
          throw new Error('Player cleanup failed.', { cause: cleanupError });
        }
        if (revision !== this.revision || this.activeProfile() !== context.profileId) throw new Error('Player request superseded.');
        this.update({ ...context, mode: request.mode, state: 'error', message: 'Could not load the player. Close it and try again.' });
        throw new Error('Could not load the player.', { cause: error });
      }
    });
  }

  layout(context: TmcPlayerContext, bounds: TmcPlayerBounds | null, owner: BrowserWindow): TmcPlayerStatus {
    this.assertOwner(context);
    if (owner !== this.owner) throw new Error('Player window changed.');
    if (bounds) {
      const [width, height] = owner.getContentSize();
      if (bounds.x + bounds.width > width || bounds.y + bounds.height > height) throw new Error('Player bounds outside window.');
    }
    this.bounds = bounds;
    this.applyBounds();
    return this.status;
  }

  setMode(context: TmcPlayerContext, mode: TmcPlayerMode): TmcPlayerStatus {
    this.assertOwner(context);
    if (!this.view) throw new Error('Player is closed.');
    this.move(mode);
    this.update({ mode });
    return this.status;
  }

  close(context?: TmcPlayerContext): Promise<TmcPlayerStatus> {
    const expected = this.requestedContext || this.status;
    if (context && (expected.profileId !== context.profileId || expected.channel !== context.channel)) throw new Error('Player context changed.');
    this.requestedContext = null;
    ++this.revision;
    if (this.contents && !this.contents.isDestroyed()) this.contents.close({ waitForBeforeUnload: false });
    return this.serialize(async () => {
      try { await this.release(); this.update({ state: 'closed', message: null }); }
      catch (error) { this.update({ state: 'error', message: 'Player cleanup failed. Reopen the app before playing again.' }); throw new Error('Player cleanup failed.', { cause: error }); }
      return this.status;
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
  private watchOwner(owner: BrowserWindow): void {
    if (this.watchedOwner === owner) return;
    this.unwatchOwner();
    this.watchedOwner = owner; this.ownerContents = owner.webContents;
    owner.once('closed', this.ownerDestroyed);
    this.ownerContents.on('did-start-navigation', this.ownerNavigated);
  }
  private unwatchOwner(): void {
    this.watchedOwner?.removeListener('closed', this.ownerDestroyed);
    this.ownerContents?.removeListener('did-start-navigation', this.ownerNavigated);
    this.watchedOwner = null; this.ownerContents = null;
  }
  private assertCurrent(context: TmcPlayerContext, revision: number): void {
    if (revision !== this.revision || this.activeProfile() !== context.profileId) throw new Error('Player request superseded.');
  }
  private assertOwner(context: TmcPlayerContext): void {
    if (this.activeProfile() !== context.profileId || this.status.profileId !== context.profileId || this.status.channel !== context.channel) throw new Error('Player context changed.');
  }
  private update(partial: Partial<Omit<TmcPlayerStatus, 'sequence'>>): void {
    this.status = { ...this.status, ...partial, sequence: this.status.sequence + 1 };
    this.changed(this.status);
  }
  private readonly detachedClosed = (): void => { this.unwatchDetachedLayout(); this.detached = null; this.viewOwner = null; this.ownerClosed(); };
  private readonly detachedResized = (): void => this.applyBounds();

  private move(mode: TmcPlayerMode): void {
    if (!this.view || !this.owner || this.owner.isDestroyed()) throw new Error('Player window unavailable.');
    if (this.viewOwner && !this.viewOwner.isDestroyed()) this.viewOwner.contentView.removeChildView(this.view);
    this.viewOwner = null;
    if (mode === 'detached') {
      if (!this.detached) {
        this.detached = new BrowserWindow({ width: 1010, height: 698, minWidth: 480, minHeight: 400, show: false,
          title: `TMC live · #${this.status.channel}`, backgroundColor: '#080914', webPreferences: {
            session: this.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
        this.detached.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        this.detached.webContents.on('will-navigate', (event) => event.preventDefault());
        this.detached.on('closed', this.detachedClosed);
        this.detached.on('resize', this.detachedResized);
        this.detachedRoot = this.detached.contentView;
        this.detachedRoot.on('bounds-changed', this.detachedResized);
      }
      this.detached.setTitle(`TMC live · #${this.status.channel}`);
      this.viewOwner = this.detached;
      this.detached.contentView.addChildView(this.view);
      this.detached.showInactive();
    } else {
      this.viewOwner = this.owner;
      this.owner.contentView.addChildView(this.view);
      this.destroyDetached();
    }
    this.applyBounds();
  }

  private applyBounds(): void {
    if (!this.view || !this.contents || this.contents.isDestroyed()) return;
    const detached = this.viewOwner === this.detached && this.detached && !this.detached.isDestroyed();
    if (detached) {
      if (!this.detachedRoot) throw new Error('Player window layout unavailable.');
      const { width, height } = this.detachedRoot.getBounds();
      this.restoreAudio();
      this.view.setBounds({ x: 0, y: 0, width, height });
    } else {
      const bounds = this.owner && !this.hiddenOwners.has(this.owner) ? this.bounds : null;
      if (!bounds && !this.occluded) { this.mutedBeforeOcclusion = this.contents.isAudioMuted(); this.contents.setAudioMuted(true); this.occluded = true; }
      if (bounds) this.restoreAudio();
      this.view.setBounds(bounds || { x: 0, y: 0, width: 0, height: 0 });
    }
  }
  private restoreAudio(): void {
    if (this.occluded && this.contents && !this.contents.isDestroyed()) this.contents.setAudioMuted(this.mutedBeforeOcclusion);
    this.occluded = false;
  }
  private destroyDetached(): void {
    const detached = this.detached;
    this.detached = null;
    this.unwatchDetachedLayout();
    if (!detached || detached.isDestroyed()) return;
    detached.removeListener('closed', this.detachedClosed);
    detached.removeListener('resize', this.detachedResized);
    detached.destroy();
  }
  private unwatchDetachedLayout(): void {
    this.detachedRoot?.removeListener('bounds-changed', this.detachedResized);
    this.detachedRoot = null;
  }
  private async release(): Promise<void> {
    if (this.view) {
      if (this.viewOwner && !this.viewOwner.isDestroyed()) this.viewOwner.contentView.removeChildView(this.view);
      const contents = this.contents;
      if (contents && !contents.isDestroyed()) {
        let timer: ReturnType<typeof setTimeout>;
        let destroyed: () => void;
        try {
          await new Promise<void>((resolve, reject) => {
            destroyed = resolve;
            contents.once('destroyed', destroyed);
            timer = setTimeout(() => reject(new Error('Player destruction timed out.')), 2000);
            contents.close({ waitForBeforeUnload: false });
          });
        } finally { clearTimeout(timer); contents.removeListener('destroyed', destroyed); }
      }
      this.view = null;
      this.contents = null;
    }
    this.viewOwner = null; this.owner = null; this.bounds = null; this.occluded = false;
    this.destroyDetached();
    const document = this.document;
    this.document = null;
    await document?.close();
    // Closing media must not clear PCG's login/storage/cache or connections.
    this.partition = null;
  }
}
