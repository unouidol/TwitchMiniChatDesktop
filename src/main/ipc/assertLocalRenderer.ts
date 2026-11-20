import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

export function assertLocalRenderer(event: IpcMainInvokeEvent): void {
  const expected = MAIN_WINDOW_VITE_DEV_SERVER_URL || pathToFileURL(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)).href;
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== new URL(expected).href) {
    throw new Error('Untrusted chat sender.');
  }
}
