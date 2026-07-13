import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { createMainWindow } from './main/windows/createMainWindow';
import { registerIpcHandlers } from './main/ipc/registerIpcHandlers';
import { TMC_RUNTIME_CONFIG } from './main/config/TmcRuntimeConfig';

/*
 * Handles creating/removing shortcuts on Windows when installing/uninstalling.
 * Keep this near app startup because Squirrel may need to quit the app early.
 */
if (started) {
  app.quit();
}

/**
 * Initializes the Electron application.
 * IPC handlers must be registered before the renderer window is created.
 */
app.whenReady().then(async () => {
  await registerIpcHandlers(TMC_RUNTIME_CONFIG);
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