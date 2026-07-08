import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './main/ipc/registerIpcHandlers';
import { createMainWindow } from './main/windows/createMainWindow';

/*
 * Handles creating/removing shortcuts on Windows when installing/uninstalling.
 */
if (started) {
  app.quit();
} else {
  app.on('ready', () => {
    registerIpcHandlers();
    createMainWindow();
  });

  app.on('window-all-closed', () => {
    /*
     * macOS apps usually stay active until the user quits explicitly.
     */
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    /*
     * Re-create the window on macOS when the dock icon is clicked and no windows
     * are currently open.
     */
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}
