import { BrowserWindow } from 'electron';
import path from 'node:path';

/**
 * Vite development server URL injected by Electron Forge.
 */
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;

/**
 * Vite renderer bundle name injected by Electron Forge.
 */
declare const MAIN_WINDOW_VITE_NAME: string;

/**
 * Creates the main TMC Desktop window.
 *
 * The local renderer is isolated from Node.js. Remote content such as Twitch
 * and PokémonCommunityGame will be hosted in a separate, explicitly controlled
 * surface later.
 */
export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1160,
    height: 720,
    minWidth: 1040,
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

  return mainWindow;
}
