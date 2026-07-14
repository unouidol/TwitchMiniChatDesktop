import {
  TMC_ACCOUNT_CHANGED_EVENT,
  TMC_ACCOUNT_REMOVED_EVENT,
} from '../accounts/initializeAccountSwitcher';

/**
 * Maximum number of manually sent messages retained for each account.
 */
const MAX_HISTORY_ENTRIES_PER_ACCOUNT = 50;

/**
 * Coordinates in-memory command-style history for the manual chat input.
 */
export class TmcChatInputHistoryController {
  /**
   * In-memory message lists keyed by the active account profile identifier.
   */
  private readonly historyByAccount = new Map<string, string[]>();
  /**
   * Current traversal position and the draft captured before that traversal.
   */
  private navigationAccountId: string | null = null;
  private navigationIndex: number | null = null;
  private draftText: string | null = null;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.shouldHandleNavigationKey(event)) {
      return;
    }

    if (event.key === 'ArrowUp') {
      this.navigateUp(event);
      return;
    }

    this.navigateDown(event);
  };

  private readonly handleInput = (): void => {
    if (this.navigationIndex !== null) {
      this.resetNavigation();
    }
  };

  private readonly handleAccountChanged = (): void => {
    this.resetNavigation();
  };

  private readonly handleAccountRemoved = (event: Event): void => {
    const profileId = readRemovedProfileId(event);

    if (!profileId) {
      return;
    }

    this.historyByAccount.delete(profileId);

    if (this.navigationAccountId === profileId) {
      this.resetNavigation();
    }
  };

  /**
   * Binds keyboard navigation to one manual chat input.
   */
  constructor(
    private readonly input: HTMLInputElement,
    private readonly getActiveAccountId: () => string | null,
  ) {
    this.input.addEventListener('keydown', this.handleKeyDown);
    this.input.addEventListener('input', this.handleInput);
    window.addEventListener(TMC_ACCOUNT_CHANGED_EVENT, this.handleAccountChanged);
    window.addEventListener(TMC_ACCOUNT_REMOVED_EVENT, this.handleAccountRemoved);
  }

  /**
   * Adds one successfully accepted manual message to the active account history.
   */
  recordSentMessage(
    message: string,
    accountId: string | null = this.getActiveAccountId(),
  ): void {
    const normalizedMessage = message.trim();

    if (!normalizedMessage || !accountId) {
      this.resetNavigation();
      return;
    }

    const history = this.historyByAccount.get(accountId) || [];

    if (history[history.length - 1] !== normalizedMessage) {
      history.push(normalizedMessage);

      if (history.length > MAX_HISTORY_ENTRIES_PER_ACCOUNT) {
        history.shift();
      }

      this.historyByAccount.set(accountId, history);
    }

    this.resetNavigation();
  }

  /**
   * Removes event listeners and releases in-memory message history.
   */
  destroy(): void {
    this.input.removeEventListener('keydown', this.handleKeyDown);
    this.input.removeEventListener('input', this.handleInput);
    window.removeEventListener(TMC_ACCOUNT_CHANGED_EVENT, this.handleAccountChanged);
    window.removeEventListener(TMC_ACCOUNT_REMOVED_EVENT, this.handleAccountRemoved);
    this.historyByAccount.clear();
    this.resetNavigation();
  }

  private shouldHandleNavigationKey(event: KeyboardEvent): boolean {
    return (
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      !event.defaultPrevented &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.isComposing &&
      event.currentTarget === this.input &&
      document.activeElement === this.input
    );
  }

  private navigateUp(event: KeyboardEvent): void {
    const history = this.getActiveHistory();

    if (!history || history.length === 0) {
      return;
    }

    if (this.navigationIndex === null) {
      this.draftText = this.input.value;
      this.navigationIndex = history.length;
    }

    if (this.navigationIndex > 0) {
      this.navigationIndex -= 1;
      this.input.value = history[this.navigationIndex];
    }

    event.preventDefault();
  }

  private navigateDown(event: KeyboardEvent): void {
    const history = this.getActiveHistory();

    if (!history || this.navigationIndex === null) {
      return;
    }

    if (this.navigationIndex < history.length - 1) {
      this.navigationIndex += 1;
      this.input.value = history[this.navigationIndex];
    } else {
      this.input.value = this.draftText || '';
      this.resetNavigation();
    }

    event.preventDefault();
  }

  private getActiveHistory(): string[] | null {
    const accountId = this.getActiveAccountId();

    if (!accountId) {
      this.resetNavigation();
      return null;
    }

    if (this.navigationAccountId !== accountId) {
      this.resetNavigation();
      this.navigationAccountId = accountId;
    }

    return this.historyByAccount.get(accountId) || null;
  }

  private resetNavigation(): void {
    this.navigationAccountId = null;
    this.navigationIndex = null;
    this.draftText = null;
  }
}

function readRemovedProfileId(event: Event): string | null {
  if (!(event instanceof CustomEvent) || !event.detail) {
    return null;
  }

  const profileId = (event.detail as { profileId?: unknown }).profileId;

  return typeof profileId === 'string' && profileId ? profileId : null;
}
