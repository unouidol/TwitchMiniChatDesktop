import { BrowserWindow } from 'electron';

/**
 * Sends one IPC event to every window that can still receive it.
 *
 * `window.isDestroyed()` alone is not enough: while a BrowserWindow emits
 * `closed`, it is still listed by `BrowserWindow.getAllWindows()` and is not
 * yet destroyed, but its WebContents already is (Electron 43
 * `BrowserWindow::WebContentsDestroyed` -> `CloseImmediately` ->
 * `NativeWindow::NotifyWindowClosed` emits `closed` before
 * `WindowList::RemoveWindow`). Any status broadcast triggered from a `closed`
 * handler would otherwise throw "Object has been destroyed" in the main process.
 */
export function broadcastToWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    window.webContents.send(channel, payload);
  }
}
