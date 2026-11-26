import { app, type Event } from 'electron';
import type { TmcPlayerManager } from './TmcPlayerManager';

/** Let owned media/source/session cleanup finish before Electron tears down sessions. */
export function registerPlayerShutdown(player: TmcPlayerManager, failure: () => void = () => app.exit(1)): void {
  let pending = false;
  let complete = false;
  const beforeQuit = (event: Event): void => {
    if (complete) return;
    event.preventDefault();
    if (pending) return;
    pending = true;
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Player shutdown timed out.')), 10000); });
    void Promise.race([Promise.resolve().then(() => player.close()), timeout]).finally(() => clearTimeout(timer)).then(() => { complete = true; app.quit(); }, () => {
      console.warn('[TMC Player] Shutdown cleanup failed.');
      failure();
    });
  };
  app.on('before-quit', beforeQuit);
  app.once('will-quit', () => app.removeListener('before-quit', beforeQuit));
}
