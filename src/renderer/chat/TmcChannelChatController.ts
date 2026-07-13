import { TMC_ACCOUNT_CHANGED_EVENT } from '../accounts/initializeAccountSwitcher';
import {
  renderFavoriteChannels,
  renderRecentChannels,
} from '../channels/renderRecentChannels';
import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
import type { TmcHistoryMessage } from '../../shared/backend/TmcHistoryModels';
import type {
  TmcChatLiveStatus,
  TmcLiveChatMessage,
} from '../../shared/chat/TmcChatModels';
import type { TmcPcgSessionPanelController } from '../pcg/initializePcgSessionPanel';
import type { TmcAccountChannelState } from '../../shared/channels/TmcAccountChannelModels';
import { appendLocalMessage } from './appendLocalMessage';
import { renderHistoryMessages } from './renderHistoryMessages';

/**
 * Window event emitted after a Twitch login completes successfully.
 */
export const TMC_AUTH_LOGGED_IN_EVENT = 'tmc:auth:logged-in';

/**
 * Window event emitted after the current Twitch channel changes.
 */
export const TMC_CHANNEL_CHANGED_EVENT = 'tmc:channel:changed';

/**
 * Number of seconds requested from the backend history endpoint.
 */
const HISTORY_WINDOW_SECONDS = 3600;

/**
 * Maximum number of chat deduplication keys retained in memory.
 */
const MAX_CHAT_DEDUP_KEYS = 1000;

/**
 * Time bucket used for fallback live-message deduplication.
 */
const CHAT_DEDUP_BUCKET_MS = 10000;

/**
 * Dependencies used by the renderer channel chat controller.
 */
export type TmcChannelChatControllerOptions = {
  /**
   * Safe preload API exposed by Electron.
   */
  readonly tmc: TmcRendererPreloadApi;

  /**
   * Current channel input in the shell UI.
   */
  readonly channelInput: HTMLInputElement | null;

  /**
   * Optional manual refresh button.
   */
  readonly loadHistoryButton?: HTMLButtonElement | null;

  /**
   * Optional PCG session status controller for passive hold/restore updates.
   */
  readonly pcgSessionPanel?: TmcPcgSessionPanelController | null;
};

type ChannelSidebarControls = {
  readonly favoriteToggleButton: HTMLButtonElement | null;
};

/**
 * Coordinates channel switching, backend history loading, and passive live chat.
 */
export class TmcChannelChatController {
  private readonly tmc: TmcRendererPreloadApi;
  private readonly channelInput: HTMLInputElement | null;
  private readonly loadHistoryButton: HTMLButtonElement | null;
  private readonly favoriteToggleButton: HTMLButtonElement | null;
  private readonly liveStatusElement: HTMLElement | null;
  private readonly pcgSessionPanel: TmcPcgSessionPanelController | null;
  private readonly renderedMessageKeys: string[] = [];
  private readonly renderedMessageKeySet = new Set<string>();
  private readonly unsubscribeLiveMessage: () => void;
  private readonly unsubscribeStatusChanged: () => void;
  private currentChannel: string | null = null;
  private lastRenderedStatusKey: string | null = null;
  private liveStatusRevision = 0;
  private activeChannelState: TmcAccountChannelState | null = null;
  private generation = 0;

  private readonly handleAuthLoggedIn = (): void => {
    void this.reconnectCurrentChannelAfterAccountChange();
  };

  private readonly handleAccountChanged = (): void => {
    void this.reconnectCurrentChannelAfterAccountChange();
  };

  /**
   * Creates a controller and binds live chat listeners once.
   */
  constructor(options: TmcChannelChatControllerOptions) {
    this.tmc = options.tmc;
    this.channelInput = options.channelInput;
    this.loadHistoryButton = options.loadHistoryButton || null;
    this.pcgSessionPanel = options.pcgSessionPanel || null;
    this.liveStatusElement = document.querySelector<HTMLElement>(
      '[data-tmc-live-status]',
    );

    let channelControls: ChannelSidebarControls = {
      favoriteToggleButton: null,
    };

    try {
      channelControls = ensureChannelSidebarControls();
    } catch (error) {
      console.warn('[TMC Channels] Sidebar controls initialization failed:', error);
    }

    this.favoriteToggleButton = channelControls.favoriteToggleButton;
    this.favoriteToggleButton?.addEventListener('click', () => {
      void this.toggleFavoriteForCurrentChannel();
    });

    if (this.tmc.chat?.onLiveMessage) {
      this.unsubscribeLiveMessage = this.tmc.chat.onLiveMessage((message) => {
        this.handleLiveMessage(message);
      });
    } else {
      console.warn('[TMC Chat] Live message API is not available.');
      this.unsubscribeLiveMessage = noop;
    }

    if (this.tmc.chat?.onStatusChanged) {
      this.unsubscribeStatusChanged = this.tmc.chat.onStatusChanged((status) => {
        this.handleStatusChanged(status);
      });
    } else {
      console.warn('[TMC Chat] Live status API is not available.');
      this.unsubscribeStatusChanged = noop;
    }

    window.addEventListener(TMC_AUTH_LOGGED_IN_EVENT, this.handleAuthLoggedIn);
    window.addEventListener(TMC_ACCOUNT_CHANGED_EVENT, this.handleAccountChanged);
  }

  /**
   * Loads per-account channel state and opens the best startup channel.
   */
  async initialize(): Promise<void> {
    try {
      await this.refreshLiveStatus();
      await this.switchToActiveAccountChannel();
    } catch (error) {
      appendLocalMessage('error', getErrorMessage(error));
    }
  }

  /**
   * Reloads history and live chat for the current channel input value.
   */
  async refreshCurrentChannel(): Promise<void> {
    const channel = this.readCurrentChannel();

    if (!channel) {
      return;
    }

    await this.loadChannel(channel);
  }

  /**
   * Switches to a new Twitch channel, records it for the active account, and connects live chat.
   */
  async switchToChannel(channel: string): Promise<void> {
    const normalizedChannel = normalizeChannel(channel);

    if (!normalizedChannel) {
      return;
    }

    await this.loadChannel(normalizedChannel);
  }

  /**
   * Removes live chat and auth event listeners owned by this controller.
   */
  dispose(): void {
    this.unsubscribeLiveMessage();
    this.unsubscribeStatusChanged();
    window.removeEventListener(TMC_AUTH_LOGGED_IN_EVENT, this.handleAuthLoggedIn);
    window.removeEventListener(TMC_ACCOUNT_CHANGED_EVENT, this.handleAccountChanged);
  }

  private async loadChannel(channel: string): Promise<void> {
    const normalizedChannel = normalizeChannel(channel);

    if (!normalizedChannel) {
      return;
    }

    const previousChannel = this.currentChannel;
    const generation = ++this.generation;

    this.currentChannel = normalizedChannel;
    this.setChannelInput(normalizedChannel);
    this.updateFavoriteToggleButton();
    console.debug('[TMC Channel] switching', {
      from: previousChannel,
      to: normalizedChannel,
    });

    await this.holdPcgSessionForChannelChange(generation);

    this.setRefreshDisabled(true);
    clearChatList();
    dispatchChannelChanged(normalizedChannel);
    appendLocalMessage('system', `Loading history for #${normalizedChannel}...`);

    try {
      await this.tmc.accountChannels.setLast({ channel: normalizedChannel });
      const channelStateResult = await this.tmc.accountChannels.addRecent({
        channel: normalizedChannel,
      });

      if (!this.isCurrentGeneration(generation)) {
        return;
      }

      this.renderAccountChannelState(channelStateResult.state);
      await this.activatePcgSessionForChannel(
        channelStateResult.state.profileId,
        normalizedChannel,
        generation,
      );

      const result = await this.tmc.backend.loadHistory({
        channel: normalizedChannel,
        seconds: HISTORY_WINDOW_SECONDS,
      });

      if (!this.isCurrentGeneration(generation)) {
        return;
      }

      renderHistoryMessages(result.messages);
      this.rememberHistoryMessages(result.messages);
      appendLocalMessage(
        'system',
        `Loaded ${result.messages.length} cached messages for #${result.channel}.`,
      );

      await this.connectLiveForChannel(normalizedChannel, generation);
    } catch (error) {
      if (this.isCurrentGeneration(generation)) {
        appendLocalMessage('error', getErrorMessage(error));
      }
    } finally {
      if (this.isCurrentGeneration(generation)) {
        this.setRefreshDisabled(false);
      }
    }
  }

  private async holdPcgSessionForChannelChange(generation: number): Promise<void> {
    if (!this.pcgSessionPanel) {
      return;
    }

    try {
      await this.pcgSessionPanel.holdActiveSession();
    } catch (error) {
      if (this.isCurrentGeneration(generation)) {
        appendLocalMessage('system', `PCG hold failed: ${getErrorMessage(error)}`);
      }
    }
  }

  private async activatePcgSessionForChannel(
    profileId: string,
    channel: string,
    generation: number,
  ): Promise<void> {
    if (!this.pcgSessionPanel || !this.isCurrentGeneration(generation)) {
      return;
    }

    this.pcgSessionPanel.renderLoading(profileId, channel);

    try {
      await this.pcgSessionPanel.activateSession(profileId, channel);
    } catch (error) {
      if (this.isCurrentGeneration(generation)) {
        appendLocalMessage('system', `PCG activation failed: ${getErrorMessage(error)}`);
      }
    }
  }

  private async switchToActiveAccountChannel(): Promise<void> {
    const result = await this.tmc.accountChannels.getActiveState();
    const state = result.state;
    const previousProfileId = this.activeChannelState?.profileId || null;
    const sameProfile = previousProfileId === state.profileId;

    this.renderAccountChannelState(state);

    const channel = sameProfile && this.currentChannel
      ? this.currentChannel
      : state.lastChannel || (await this.readFallbackChannel());

    console.debug('[TMC Channel] active-account restore', { channel });

    if (channel) {
      await this.switchToChannel(channel);
    }
  }

  private async reconnectCurrentChannelAfterAccountChange(): Promise<void> {
    try {
      const status = await this.tmc.chat.getStatus();

      if (status.state === 'connected' || status.state === 'connecting') {
        await this.tmc.chat.disconnectLive({ channel: status.channel || undefined });
      }
    } catch {
      // A failed disconnect should not block reconnecting with the active account.
    }

    await this.switchToActiveAccountChannel();
  }

  private async connectLiveForChannel(
    channel: string,
    generation: number,
  ): Promise<void> {
    const normalizedChannel = normalizeChannel(channel);

    if (!normalizedChannel || !this.isCurrentGeneration(generation)) {
      return;
    }

    try {
      const status = await this.tmc.chat.getStatus();

      if (!this.isCurrentGeneration(generation)) {
        return;
      }

      const connectedChannel = status.channel ? normalizeChannel(status.channel) : null;

      if (
        connectedChannel === normalizedChannel &&
        (status.state === 'connected' || status.state === 'connecting')
      ) {
        return;
      }

      if (status.state === 'connected' || status.state === 'connecting') {
        await this.tmc.chat.disconnectLive({
          channel: status.channel || undefined,
        });

        if (!this.isCurrentGeneration(generation)) {
          return;
        }
      }

      await this.tmc.chat.connectLive({ channel: normalizedChannel });
    } catch (error) {
      if (!this.isCurrentGeneration(generation)) {
        return;
      }

      const message = getErrorMessage(error);

      if (message === 'Login required.') {
        appendLocalMessage('system', 'Login required for live chat');
        return;
      }

      appendLocalMessage('system', `Live chat connection failed: ${message}`);
    }
  }

  private async toggleFavoriteForCurrentChannel(): Promise<void> {
    const channel = this.readCurrentChannel();

    if (!channel) {
      return;
    }

    try {
      const result = await this.tmc.accountChannels.toggleFavorite({ channel });
      this.renderAccountChannelState(result.state);
    } catch (error) {
      appendLocalMessage('error', getErrorMessage(error));
    }
  }

  private renderAccountChannelState(state: TmcAccountChannelState): void {
    this.activeChannelState = state;

    renderRecentChannels(state.recentChannels, (channel) => {
      console.debug('[TMC Channel] recent click', { channel });
      void this.switchToChannel(channel);
    });

    renderFavoriteChannels(state.favoriteChannels, (channel) => {
      console.debug('[TMC Channel] favorite click', { channel });
      void this.switchToChannel(channel);
    });

    this.updateFavoriteToggleButton();
  }

  private async readFallbackChannel(): Promise<string | null> {
    const currentChannel = normalizeChannel(this.currentChannel || '');

    if (currentChannel) {
      return currentChannel;
    }

    const inputChannel = normalizeChannel(this.channelInput?.value || '');

    if (inputChannel) {
      return inputChannel;
    }

    try {
      const settings = await this.tmc.settings.get();
      const settingsChannel = normalizeChannel(settings.currentChannel);

      if (settingsChannel) {
        return settingsChannel;
      }
    } catch {
      // The legacy settings fallback is optional for per-account channel state.
    }

    return 'unouidol';
  }

  private handleLiveMessage(message: TmcLiveChatMessage): void {
    const messageChannel = normalizeChannel(message.channel);

    if (this.currentChannel && messageChannel !== this.currentChannel) {
      return;
    }

    if (!this.rememberLiveMessage(message)) {
      return;
    }

    appendLiveChatMessage(message);
  }

  private handleStatusChanged(status: TmcChatLiveStatus): void {
    this.liveStatusRevision += 1;
    this.renderLiveStatus(status);
    const statusChannel = status.channel ? normalizeChannel(status.channel) : null;

    if (statusChannel && this.currentChannel && statusChannel !== this.currentChannel) {
      return;
    }

    const statusKey = `${status.state}:${status.channel || ''}:${status.message || ''}`;

    if (statusKey === this.lastRenderedStatusKey) {
      return;
    }

    this.lastRenderedStatusKey = statusKey;

    if (status.state === 'connected' && statusChannel) {
      appendLocalMessage('system', `Live connected to #${statusChannel}`);
      return;
    }

    if (status.state === 'error' && status.message) {
      appendLocalMessage('system', status.message);
    }
  }

  private async refreshLiveStatus(): Promise<void> {
    const revisionBeforeRequest = this.liveStatusRevision;
    const status = await this.tmc.chat.getStatus();

    if (revisionBeforeRequest !== this.liveStatusRevision) {
      return;
    }

    this.renderLiveStatus(status);
  }

  private renderLiveStatus(status: TmcChatLiveStatus): void {
    if (!this.liveStatusElement) {
      return;
    }

    this.liveStatusElement.textContent = `Live: ${status.state}`;
    this.liveStatusElement.dataset.tmcLiveState = status.state;
  }
  private rememberHistoryMessages(messages: readonly TmcHistoryMessage[]): void {
    for (const message of messages) {
      const key = buildHistoryMessageDedupKey(message);

      if (key) {
        this.rememberMessageKey(key);
      }
    }
  }

  private rememberLiveMessage(message: TmcLiveChatMessage): boolean {
    const primaryKey = buildLiveMessagePrimaryDedupKey(message);
    const selfEchoKey = buildLiveMessageSelfEchoDedupKey(message);
    const isLocalSelfMessage =
      message.isSelf && message.id.startsWith('local-self-');

    if (this.renderedMessageKeySet.has(primaryKey)) {
      return false;
    }

    if (
      selfEchoKey &&
      !isLocalSelfMessage &&
      this.renderedMessageKeySet.has(selfEchoKey)
    ) {
      return false;
    }

    this.rememberMessageKey(primaryKey);

    if (selfEchoKey && isLocalSelfMessage) {
      this.rememberMessageKey(selfEchoKey);
    }

    return true;
  }

  private rememberMessageKey(key: string): void {
    if (this.renderedMessageKeySet.has(key)) {
      return;
    }

    this.renderedMessageKeySet.add(key);
    this.renderedMessageKeys.push(key);

    while (this.renderedMessageKeys.length > MAX_CHAT_DEDUP_KEYS) {
      const oldestKey = this.renderedMessageKeys.shift();

      if (oldestKey) {
        this.renderedMessageKeySet.delete(oldestKey);
      }
    }
  }

  private readCurrentChannel(): string | null {
    const channel = normalizeChannel(this.channelInput?.value || this.currentChannel || '');

    return channel || null;
  }

  private setChannelInput(channel: string): void {
    if (this.channelInput) {
      this.channelInput.value = channel;
    }
  }

  private updateFavoriteToggleButton(): void {
    if (!this.favoriteToggleButton) {
      return;
    }

    const channel = this.readCurrentChannel();
    const isFavorite = Boolean(
      channel && this.activeChannelState?.favoriteChannels.includes(channel),
    );

    this.favoriteToggleButton.disabled = !channel;
    this.favoriteToggleButton.textContent = isFavorite
      ? 'Remove favorite'
      : 'Favorite current';
  }

  private setRefreshDisabled(disabled: boolean): void {
    if (this.loadHistoryButton) {
      this.loadHistoryButton.disabled = disabled;
    }
  }

  private isCurrentGeneration(generation: number): boolean {
    return generation === this.generation;
  }
}

/**
 * Notifies renderer controllers that Twitch authentication completed.
 */
export function notifyAuthLoggedIn(): void {
  window.dispatchEvent(new CustomEvent(TMC_AUTH_LOGGED_IN_EVENT));
}

function appendLiveChatMessage(message: TmcLiveChatMessage): void {
  const chatList = document.querySelector<HTMLDivElement>('#chatList');

  if (!chatList) {
    return;
  }

  const messageElement = document.createElement('article');
  messageElement.className = 'tmc-message';
  messageElement.dataset.tmcMessageId = message.id;

  if (message.isSelf) {
    messageElement.classList.add('tmc-message-self');
    messageElement.dataset.tmcMessageSelf = 'true';
  }

  const timeElement = document.createElement('time');
  timeElement.className = 'tmc-message-time';
  timeElement.dateTime = new Date(message.timestampMs).toISOString();
  timeElement.textContent = formatTime(message.timestampMs);

  const authorElement = document.createElement('strong');
  authorElement.textContent = message.displayName || message.username;

  const textElement = document.createElement('span');
  textElement.textContent = message.text;

  messageElement.append(timeElement, authorElement, textElement);
  chatList.appendChild(messageElement);
  chatList.scrollTop = chatList.scrollHeight;
}

function ensureChannelSidebarControls(): ChannelSidebarControls {
  const sidebar =
    document.querySelector<HTMLElement>('.tmc-sidebar-panel') ||
    document.querySelector<HTMLElement>('.tmc-sidebar');

  if (!sidebar) {
    return { favoriteToggleButton: null };
  }

  const loadHistoryButton =
    document.querySelector<HTMLButtonElement>('#loadHistoryButton');

  const favoriteToggleButton = ensureFavoriteToggleButton(
    sidebar,
    loadHistoryButton,
  );

  ensureFavoriteChannelsSection(sidebar);

  return { favoriteToggleButton };
}

function ensureFavoriteToggleButton(
  sidebar: HTMLElement,
  loadHistoryButton: HTMLButtonElement | null,
): HTMLButtonElement {
  const existingButton = document.querySelector<HTMLButtonElement>(
    '[data-tmc-toggle-favorite-channel]',
  );

  if (existingButton) {
    return existingButton;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tmc-button tmc-button-secondary tmc-favorite-toggle-button';
  button.dataset.tmcToggleFavoriteChannel = 'true';
  button.textContent = 'Favorite current';

  const insertionParent =
    loadHistoryButton?.parentElement instanceof HTMLElement
      ? loadHistoryButton.parentElement
      : sidebar;

  insertAfterOrAppend(insertionParent, button, loadHistoryButton);

  return button;
}

function ensureFavoriteChannelsSection(sidebar: HTMLElement): void {
  const existingFavoriteContainer =
    document.querySelector('#favoriteChannelsContainer') ||
    document.querySelector('[data-tmc-favorite-channels]');

  if (existingFavoriteContainer) {
    return;
  }

  const section = document.createElement('div');
  section.className = 'tmc-channel-section';

  const title = document.createElement('h3');
  title.className = 'tmc-sidebar-subtitle';
  title.textContent = 'Favorite channels';

  const container = document.createElement('div');
  container.id = 'favoriteChannelsContainer';
  container.dataset.tmcFavoriteChannels = 'true';
  container.className = 'tmc-channel-shortcuts';

  section.append(title, container);

  const recentContainer =
    document.querySelector('#recentChannelsContainer') ||
    document.querySelector('[data-tmc-recent-channels]');

  const recentSection =
    recentContainer?.parentElement instanceof HTMLElement
      ? recentContainer.parentElement
      : null;

  insertAfterOrAppend(sidebar, section, recentSection);
}

/**
 * Inserts a node after a reference element when both nodes share the same parent.
 *
 * If the reference is missing or belongs to another parent, the node is appended
 * instead. This keeps optional sidebar controls from crashing the renderer when
 * the static HTML layout changes.
 */
function insertAfterOrAppend(
  parent: HTMLElement,
  node: HTMLElement,
  reference: Element | null,
): void {
  if (reference?.parentElement === parent) {
    parent.insertBefore(node, reference.nextSibling);
    return;
  }

  parent.appendChild(node);
}

function clearChatList(): void {
  document.querySelector<HTMLDivElement>('#chatList')?.replaceChildren();
}

function normalizeChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').toLowerCase();
}

function dispatchChannelChanged(channel: string): void {
  window.dispatchEvent(
    new CustomEvent(TMC_CHANNEL_CHANGED_EVENT, {
      detail: {
        channel,
      },
    }),
  );
}

function buildHistoryMessageDedupKey(message: TmcHistoryMessage): string | null {
  if (message.id) {
    return `id:${message.id}`;
  }

  const channel = normalizeChannel(message.channel);
  const bucket = Math.floor(message.timestampMillis / CHAT_DEDUP_BUCKET_MS);
  const username = message.user.trim().toLowerCase();

  if (!channel || !username) {
    return null;
  }

  return `message:${channel}:${bucket}:${username}:${message.text}`;
}

function buildLiveMessagePrimaryDedupKey(message: TmcLiveChatMessage): string {
  if (message.id) {
    return `id:${message.id}`;
  }

  return `message:${buildLiveMessageContentDedupKey(message)}`;
}

function buildLiveMessageSelfEchoDedupKey(
  message: TmcLiveChatMessage,
): string | null {
  if (!message.isSelf) {
    return null;
  }

  return `self:${buildLiveMessageContentDedupKey(message)}`;
}

function buildLiveMessageContentDedupKey(message: TmcLiveChatMessage): string {
  const channel = normalizeChannel(message.channel);
  const bucket = Math.floor(message.timestampMs / CHAT_DEDUP_BUCKET_MS);
  const username = message.username.trim().toLowerCase();

  return `${channel}:${bucket}:${username}:${message.text}`;
}

function formatTime(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown channel chat error.';
}

/**
 * Empty event unsubscribe used when optional preload APIs are unavailable.
 */
function noop(): void {
  // Intentionally empty.
}
