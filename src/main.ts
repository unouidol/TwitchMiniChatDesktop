import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

/**
 * Vite development server URL injected by Electron Forge.
 */
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;

/**
 * Vite renderer bundle name injected by Electron Forge.
 */
declare const MAIN_WINDOW_VITE_NAME: string;

/*
 * Handles creating/removing shortcuts on Windows when installing/uninstalling.
 */
if (started) {
  app.quit();
}

/**
 * Registers application-level Inter-Process Communication handlers.
 *
 * TMC Desktop exposes only explicit actions to the renderer instead of generic
 * Node.js access.
 */
function registerIpcHandlers(): void {
  ipcMain.handle('tmc:ping', async () => {
    return 'pong';
  });
}

/**
 * Creates the main TMC Desktop window.
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 560,
    title: 'Twitch Mini Chat Desktop',
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.on('ready', () => {
  registerIpcHandlers();
  createWindow();
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
    createWindow();
  }
});
