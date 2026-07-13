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
): TmcChatIpcController {
  void runtimeConfig;

  let rendererSender: WebContents | null = null;
  const ircClient = new TmcTwitchIrcClient({
    onMessage: (message: TmcLiveChatMessage): void => {
      sendToRenderer(
        rendererSender,
        TMC_IPC_CHANNELS.CHAT_LIVE_MESSAGE,
        message,
      );
    },
    onStatusChanged: (status: TmcChatLiveStatus): void => {
      sendToRenderer(
        rendererSender,
        TMC_IPC_CHANNELS.CHAT_STATUS_CHANGED,
        status,
      );
    },
  });

  ipcMain.handle(
    TMC_IPC_CHANNELS.CHAT_CONNECT_LIVE,
    async (
      event: IpcMainInvokeEvent,
      request: TmcConnectLiveChatRequest,
    ): Promise<TmcChatLiveStatus> => {
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
      rendererSender = event.sender;

      const session = accountRegistry.getActiveSession();

      if (!session) {
        throw new Error('Login required.');
      }

      if (ircClient.getConnectedUsername() !== session.username.toLowerCase()) {
        throw new Error('Live chat connection required.');
      }

      const message = ircClient.sendMessage(request.channel, request.text);
      sendToRenderer(
        rendererSender,
        TMC_IPC_CHANNELS.CHAT_LIVE_MESSAGE,
        message,
      );

      return ircClient.getStatus();
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.CHAT_GET_STATUS,
    async (event: IpcMainInvokeEvent): Promise<TmcChatLiveStatus> => {
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