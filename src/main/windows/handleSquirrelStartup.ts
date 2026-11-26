import { app } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';

/** Installer events own a bounded updater process and never start app services. */
export function handleSquirrelStartup(platform = process.platform, args: readonly string[] = process.argv.slice(1), executable = process.execPath): boolean {
  if (platform !== 'win32') return false;
  const event = args[0];
  if (event === '--squirrel-obsolete') { app.exit(0); return true; }
  if (event !== '--squirrel-install' && event !== '--squirrel-updated' && event !== '--squirrel-uninstall') return false;
  const operation = event === '--squirrel-uninstall' ? 'remove' : 'create';
  let settled = false;
  let timer: ReturnType<typeof setTimeout>;
  const finish = (code: number): void => {
    if (settled) return;
    settled = true; clearTimeout(timer);
    if (code !== 0) console.warn('[TMC Installer] Shortcut operation failed.');
    app.exit(code);
  };
  try {
    const updater = spawn(path.resolve(path.dirname(executable), '..', 'Update.exe'),
      [`--${operation}Shortcut=${path.basename(executable)}`, '--shortcut-locations=Desktop,StartMenu'],
      { windowsHide: true, stdio: 'ignore' });
    updater.once('error', () => finish(1));
    updater.once('exit', (code) => finish(code === 0 ? 0 : 1));
    timer = setTimeout(() => {
      console.warn('[TMC Installer] Shortcut operation timed out.');
      updater.kill(); finish(1);
    }, 10000);
  } catch { finish(1); }
  return true;
}
