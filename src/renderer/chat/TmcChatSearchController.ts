type SearchEntry = { row: HTMLElement; text: string };
const MAX_ROWS = 10000;
const MAX_CHARACTERS = 2000000;
const normalized = (text: string): string => text.normalize('NFC').toLowerCase();

/** Local display-only search. Never replaces message content or requests remote history. */
export class TmcChatSearchController {
  private readonly entries: SearchEntry[] = [];
  private matches: SearchEntry[] = [];
  private characters = 0;
  private limited = false;
  private position = -1;
  private readonly lifetime = new AbortController();
  private readonly panel = document.querySelector<HTMLElement>('[data-tmc-search-panel]');
  private readonly input = document.querySelector<HTMLInputElement>('#chatSearch');
  private readonly trigger = document.querySelector<HTMLButtonElement>('[data-tmc-search-toggle]');
  private readonly status = document.querySelector<HTMLElement>('[data-tmc-search-status]');
  private readonly previous = document.querySelector<HTMLButtonElement>('[data-tmc-search-previous]');
  private readonly next = document.querySelector<HTMLButtonElement>('[data-tmc-search-next]');
  private readonly scope = document.querySelector<HTMLElement>('[data-tmc-search-scope]');

  constructor(private readonly reveal: (row: HTMLElement) => void, private readonly viewportChanged: () => void) {
    const listener = { signal: this.lifetime.signal };
    this.trigger?.addEventListener('click', () => this.toggle(), listener);
    document.querySelector('[data-tmc-search-close]')?.addEventListener('click', () => this.close(true), listener);
    this.input?.addEventListener('input', () => this.search(), listener);
    this.previous?.addEventListener('click', () => this.navigate(-1), listener);
    this.next?.addEventListener('click', () => this.navigate(1), listener);
    this.input?.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); this.navigate(event.shiftKey ? -1 : 1); }
      if (event.key === 'Escape') { event.preventDefault(); this.close(true); }
    }, listener);
    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.isComposing || document.querySelector('[data-tmc-auth-dialog][open]')) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault(); this.open();
      }
    }, listener);
    this.renderStatus();
  }

  add(row: HTMLElement, author: string, text: string): void {
    if (this.lifetime.signal.aborted) return;
    const content = normalized(`${author}\n${text}`);
    if (content.length > MAX_CHARACTERS) { this.limited = true; this.renderStatus(); return; }
    const entry = { row, text: content };
    this.entries.push(entry);
    this.characters += content.length;
    while (this.entries.length > MAX_ROWS || this.characters > MAX_CHARACTERS) {
      const removed = this.entries.shift();
      this.characters -= removed.text.length;
      removed.row.classList.remove('tmc-search-match', 'tmc-search-current');
      const selected = this.matches[this.position];
      this.matches = this.matches.filter((match) => match !== removed);
      this.position = selected ? this.matches.indexOf(selected) : -1;
      this.limited = true;
    }
    const query = this.query();
    if (this.panel && !this.panel.hidden && query && content.includes(query)) {
      this.matches.push(entry); row.classList.add('tmc-search-match');
    }
    this.renderStatus();
  }

  /** Drops entries for rows pruned from the chat, so they are neither kept alive nor revealed. */
  forget(rows: ReadonlySet<Element>): void {
    if (!rows.size || this.lifetime.signal.aborted) return;
    const kept = this.entries.filter((entry) => !rows.has(entry.row));
    if (kept.length === this.entries.length) return;
    const selected = this.matches[this.position];
    this.entries.splice(0, this.entries.length, ...kept);
    this.characters = kept.reduce((total, entry) => total + entry.text.length, 0);
    this.matches = this.matches.filter((entry) => !rows.has(entry.row));
    this.position = selected && !rows.has(selected.row) ? this.matches.indexOf(selected) : -1;
    this.limited = true;
    this.renderStatus();
  }

  reset(): void {
    this.close(false);
    this.entries.length = 0; this.characters = 0; this.limited = false;
    this.renderStatus();
  }

  dispose(): void { this.reset(); this.lifetime.abort(); }

  private query(): string { return normalized(this.input?.value.trim().slice(0, 200) || ''); }

  private open(): void {
    if (!this.panel || this.lifetime.signal.aborted) return;
    this.panel.hidden = false;
    this.trigger?.setAttribute('aria-expanded', 'true');
    this.viewportChanged();
    this.input?.focus();
    this.input?.select();
    this.search();
  }

  private toggle(): void { if (this.panel?.hidden) this.open(); else this.close(true); }

  private close(focus: boolean): void {
    for (const entry of this.matches) entry.row.classList.remove('tmc-search-match', 'tmc-search-current');
    this.matches = []; this.position = -1;
    if (this.input) this.input.value = '';
    const changed = this.panel && !this.panel.hidden;
    if (this.panel) this.panel.hidden = true;
    this.trigger?.setAttribute('aria-expanded', 'false');
    this.renderStatus();
    if (changed) this.viewportChanged();
    if (focus) document.querySelector<HTMLInputElement>('#messageInput')?.focus({ preventScroll: true });
  }

  private search(): void {
    for (const entry of this.matches) entry.row.classList.remove('tmc-search-match', 'tmc-search-current');
    const query = this.query();
    this.matches = query ? this.entries.filter((entry) => entry.text.includes(query) && entry.row.isConnected) : [];
    this.position = -1;
    for (const entry of this.matches) entry.row.classList.add('tmc-search-match');
    this.renderStatus();
  }

  private navigate(direction: 1 | -1): void {
    if (!this.matches.length) return;
    this.matches[this.position]?.row.classList.remove('tmc-search-current');
    this.position = this.position < 0 ? direction === 1 ? 0 : this.matches.length - 1
      : (this.position + direction + this.matches.length) % this.matches.length;
    const row = this.matches[this.position].row;
    row.classList.add('tmc-search-current');
    this.reveal(row);
    this.input?.focus({ preventScroll: true });
    this.renderStatus();
  }

  private renderStatus(): void {
    if (this.status) this.status.textContent = !this.query() ? 'Type text or a username.' : !this.matches.length ? 'No matches.'
      : `${this.position < 0 ? '–' : this.position + 1} / ${this.matches.length} matches`;
    if (this.scope) this.scope.textContent = `${this.entries.length} recent loaded messages${this.limited ? ' · older or oversized messages excluded' : ''}`;
    if (this.previous) this.previous.disabled = !this.matches.length;
    if (this.next) this.next.disabled = !this.matches.length;
  }
}
