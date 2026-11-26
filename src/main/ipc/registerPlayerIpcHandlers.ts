import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { assertLocalRenderer } from './assertLocalRenderer';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { isPlayerBounds, isPlayerContext } from '../../shared/player/TmcPlayerModels';
import type { TmcPlayerManager } from '../player/TmcPlayerManager';

export function registerPlayerIpcHandlers(manager: TmcPlayerManager): void {
  const owner = (event: IpcMainInvokeEvent): BrowserWindow => {
    assertLocalRenderer(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('Player window unavailable.');
    return window;
  };
  ipcMain.handle(TMC_IPC_CHANNELS.PLAYER_STATUS, (event) => { owner(event); return manager.getStatus(); });
  ipcMain.handle(TMC_IPC_CHANNELS.PLAYER_OCCLUDE, (event, value: unknown) => {
    const window = owner(event);
    if (!value || typeof value !== 'object' || !('hidden' in value) || typeof value.hidden !== 'boolean') throw new Error('Invalid player occlusion.');
    manager.occlude(value.hidden, window);
  });
  ipcMain.handle(TMC_IPC_CHANNELS.PLAYER_OPEN, (event, value: unknown) => {
    const window = owner(event);
    if (!isPlayerContext(value) || !('mode' in value) || (value.mode !== 'embedded' && value.mode !== 'detached') ||
        !('bounds' in value) || !isPlayerBounds(value.bounds) || (value.mode === 'embedded' && !value.bounds)) throw new Error('Invalid player request.');
    if (value.bounds) {
      const [width, height] = window.getContentSize();
      if (value.bounds.x + value.bounds.width > width || value.bounds.y + value.bounds.height > height) throw new Error('Player bounds outside window.');
    }
    return manager.show({ profileId: value.profileId, channel: value.channel, mode: value.mode, bounds: value.bounds }, window);
  });
  ipcMain.handle(TMC_IPC_CHANNELS.PLAYER_LAYOUT, (event, value: unknown) => {
    const window = owner(event);
    if (!isPlayerContext(value) || !('bounds' in value) || !isPlayerBounds(value.bounds)) throw new Error('Invalid player layout.');
    return manager.layout(value, value.bounds, window);
  });
  ipcMain.handle(TMC_IPC_CHANNELS.PLAYER_MODE, (event, value: unknown) => {
    owner(event);
    if (!isPlayerContext(value) || !('mode' in value) || (value.mode !== 'embedded' && value.mode !== 'detached')) throw new Error('Invalid player mode.');
    return manager.setMode(value, value.mode);
  });
  ipcMain.handle(TMC_IPC_CHANNELS.PLAYER_CLOSE, (event, value: unknown) => {
    owner(event);
    if (!isPlayerContext(value)) throw new Error('Invalid player context.');
    return manager.close(value);
  });
}
