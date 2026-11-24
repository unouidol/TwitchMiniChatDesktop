import { app, BrowserWindow } from 'electron';
import { handleSquirrelStartup } from './main/windows/handleSquirrelStartup';
import { createMainWindow } from './main/windows/createMainWindow';
import { registerIpcHandlers } from './main/ipc/registerIpcHandlers';
import { TMC_RUNTIME_CONFIG } from './main/config/TmcRuntimeConfig';
import { registerPlayerShutdown } from './main/player/registerPlayerShutdown';

/*
 * Handles creating/removing shortcuts on Windows when installing/uninstalling.
 * The installer handler owns exit after Update.exe completes. Never quit it early or
 * initialize normal windows/services while processing installer events.
 */
if (!handleSquirrelStartup()) {
  // Register trusted IPC before creating the local renderer window.
  app.whenReady().then(async () => {
    const services = await registerIpcHandlers(TMC_RUNTIME_CONFIG);
    registerPlayerShutdown(services.player);
    createMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}
