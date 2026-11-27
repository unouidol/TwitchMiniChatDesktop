import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import type {
  TmcChatLiveStatus,
  TmcConnectLiveChatRequest,
  TmcLiveChatMessage,
  TmcSendChatMessageRequest,
} from '../../shared/chat/TmcChatModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import type { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import { TmcTwitchIrcClient } from '../chat/TmcTwitchIrcClient';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import { assertLocalRenderer } from './assertLocalRenderer';
import { readChatReply } from '../../shared/chat/TmcChatReply';

export type TmcChatIpcController = {
  /**
   * Disconnects the current live chat client without sending messages.
   */
  readonly disconnectLive: () => TmcChatLiveStatus;
};

/**
 * Registers live Twitch chat Inter-Process Communication handlers.
 */
export function registerChatIpcHandlers(
  runtimeConfig: TmcRuntimeConfig,
  accountRegistry: TmcAccountSessionRegistry,
  decorateMessage: (message: TmcLiveChatMessage) => TmcLiveChatMessage = (message) => message,
  onMessageSent: (profileId: string, message: TmcLiveChatMessage) => Promise<void> = async () => undefined,
): TmcChatIpcController {
  let rendererSender: WebContents | null = null;
  const ircClient = new TmcTwitchIrcClient({
    onMessage: (message: TmcLiveChatMessage): void => {
      sendToRenderer(
        rendererSender,
        TMC_IPC_CHANNELS.CHAT_LIVE_MESSAGE,
        decorateMessage(message),
      );
    },
    onStatusChanged: (status: TmcChatLiveStatus): void => {
      sendToRenderer(
        rendererSender,
        TMC_IPC_CHANNELS.CHAT_STATUS_CHANGED,
        status,
      );
    },
  }, runtimeConfig.chatWebSocketUrl);

  ipcMain.handle(
    TMC_IPC_CHANNELS.CHAT_CONNECT_LIVE,
    async (
      event: IpcMainInvokeEvent,
      request: TmcConnectLiveChatRequest,
    ): Promise<TmcChatLiveStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;

      const session = accountRegistry.getActiveSession();

      if (!session) {
        throw new Error('Login required.');
      }

      ircClient.connect({
        channel: request.channel,
        username: session.username,
        accessToken: session.accessToken,
      });

      return ircClient.getStatus();
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.CHAT_DISCONNECT_LIVE,
    async (event: IpcMainInvokeEvent): Promise<TmcChatLiveStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;
      ircClient.disconnect();

      return ircClient.getStatus();
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.CHAT_SEND_MESSAGE,
    async (
      event: IpcMainInvokeEvent,
      request: TmcSendChatMessageRequest,
    ): Promise<TmcChatLiveStatus> => {
      assertLocalRenderer(event);
      if (!request || typeof request.profileId !== 'string' || !request.profileId || request.profileId.length > 256 ||
          typeof request.channel !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(request.channel) || typeof request.text !== 'string' || request.text.length > 2000 ||
          (request.reply !== undefined && !readChatReply(request.reply))) throw new Error('Invalid chat message.');
      rendererSender = event.sender;

      const session = accountRegistry.getActiveSession();

      if (!session) {
        throw new Error('Login required.');
      }

      if (session.profileId !== request.profileId) throw new Error('Chat account changed.');
      if (ircClient.getConnectedUsername() !== session.username.toLowerCase()) {
        throw new Error('Live chat connection required.');
      }

      const message = ircClient.sendMessage(request.channel, request.text, request.reply);
      const decoratedMessage = decorateMessage(message);
      sendToRenderer(
        rendererSender,
        TMC_IPC_CHANNELS.CHAT_LIVE_MESSAGE,
        decoratedMessage,
      );

      try {
        await onMessageSent(session.profileId, message);
      } catch {
        // The IRC write already happened; metadata failure must not invite resend.
        console.warn('[TMC Emotes] Message sent, but post-send emote metadata could not be saved.');
      }
      return ircClient.getStatus();
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.CHAT_GET_STATUS,
    async (event: IpcMainInvokeEvent): Promise<TmcChatLiveStatus> => {
      assertLocalRenderer(event);
      rendererSender = event.sender;

      return ircClient.getStatus();
    },
  );

  return {
    disconnectLive: (): TmcChatLiveStatus => {
      ircClient.disconnect();

      return ircClient.getStatus();
    },
  };
}

/**
 * Sends a live chat event to the last renderer that invoked a chat IPC action.
 */
function sendToRenderer(
  rendererSender: WebContents | null,
  channel: string,
  payload: TmcLiveChatMessage | TmcChatLiveStatus,
): void {
  if (!rendererSender || rendererSender.isDestroyed()) {
    return;
  }

  rendererSender.send(channel, payload);
}
