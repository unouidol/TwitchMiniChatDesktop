/**
 * Maximum distance from the bottom that still enables automatic scrolling.
 */
const CHAT_BOTTOM_THRESHOLD_PX = 64;

/**
 * Coordinates automatic chat scrolling and the pending-message indicator.
 */
export class TmcChatScrollController {
  private shouldAutoScroll = true;
  private newMessageCount = 0;

  private readonly handleScroll = (): void => {
    this.shouldAutoScroll = this.isNearBottom();

    if (this.shouldAutoScroll) {
      this.clearNewMessageCount();
    }
  };

  private readonly handleJumpToLatest = (): void => {
    this.scrollToLatest();
  };

  /**
   * Creates the controller and binds its scroll and click listeners once.
   */
  constructor(
    private readonly chatList: HTMLElement,
    private readonly jumpToLatestButton: HTMLButtonElement,
  ) {
    this.chatList.addEventListener('scroll', this.handleScroll);
    this.jumpToLatestButton.addEventListener('click', this.handleJumpToLatest);
    this.renderIndicator();
  }

  /**
   * Handles messages appended after the initial history render.
   */
  notifyMessagesAppended(messageCount = 1): void {
    if (messageCount <= 0) {
      return;
    }

    if (this.shouldAutoScroll) {
      this.scrollToLatest();
      return;
    }

    this.newMessageCount += messageCount;
    this.renderIndicator();
  }

  /**
   * Finishes an initial history render at the latest message without a count.
   */
  handleInitialHistoryLoaded(): void {
    this.scrollToLatest();
  }

  /**
   * Clears pending state before a channel or account context changes.
   */
  resetForContextChange(): void {
    this.shouldAutoScroll = true;
    this.clearNewMessageCount();
  }

  /**
   * Removes all event listeners owned by this controller.
   */
  destroy(): void {
    this.chatList.removeEventListener('scroll', this.handleScroll);
    this.jumpToLatestButton.removeEventListener('click', this.handleJumpToLatest);
  }

  private isNearBottom(): boolean {
    const distanceFromBottom =
      this.chatList.scrollHeight -
      this.chatList.clientHeight -
      this.chatList.scrollTop;

    return distanceFromBottom <= CHAT_BOTTOM_THRESHOLD_PX;
  }

  private scrollToLatest(): void {
    this.chatList.scrollTop = this.chatList.scrollHeight;
    this.shouldAutoScroll = true;
    this.clearNewMessageCount();
  }

  private clearNewMessageCount(): void {
    if (this.newMessageCount === 0 && this.jumpToLatestButton.hidden) {
      return;
    }

    this.newMessageCount = 0;
    this.renderIndicator();
  }

  private renderIndicator(): void {
    this.jumpToLatestButton.hidden = this.newMessageCount === 0;
    this.jumpToLatestButton.textContent = this.newMessageCount === 1
      ? '1 new message'
      : `${this.newMessageCount} new messages`;
  }
}
