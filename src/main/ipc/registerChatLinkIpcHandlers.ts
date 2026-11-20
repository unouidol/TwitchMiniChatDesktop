import { ipcMain, shell } from 'electron';
import { assertLocalRenderer } from './assertLocalRenderer';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { externalChatUrl } from '../../shared/chat/TmcChatLinks';

export function registerChatLinkIpcHandlers(): void {
  ipcMain.handle(TMC_IPC_CHANNELS.CHAT_OPEN_LINK, async (event, request: unknown): Promise<void> => {
    assertLocalRenderer(event);
    if (!request || typeof request !== 'object' || !('url' in request)) throw new Error('Invalid chat link.');
    const url = externalChatUrl(request.url);
    if (!url) throw new Error('Invalid chat link.');
    try { await shell.openExternal(url); }
    catch {
      console.warn('[TMC Chat] The default browser could not open a validated web link.');
      throw new Error('Could not open the link in your browser.');
    }
  });
}
