import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Transport = 'mainFetch' | 'mainWebSocket' | 'chromium';

export function installNetworkGuards(options: {
  backendOrigin: string;
  socketUrl: string;
  rendererRoot: string;
  evidencePath: string;
  fail: (message: string) => never;
}) {
  const evidence = {
    schemaVersion: 1,
    installed: { mainFetch: false, mainWebSocket: false, chromium: false },
    scopes: {
      mainFetch: 'main globalThis.fetch initial destinations; native redirect hops are not intercepted',
      mainWebSocket: 'main globalThis.WebSocket construction destinations',
      chromium: 'onBeforeRequest on sessions created after hook installation',
    },
    chromiumSessions: 0,
    counts: {
      mainFetch: { allowed: 0, denied: 0 },
      mainWebSocket: { allowed: 0, denied: 0 },
      chromium: { allowed: 0, denied: 0 },
    },
    events: [] as Array<{ transport: Transport; allowed: boolean; scheme: string; origin: string }>,
    collectionComplete: false,
    completionReason: 'collecting',
  };
  let progressSequence = 0;
  let finalWritten = false;
  function persist() {
    if (finalWritten) return;
    // Never replace a file that a Windows scanner/reader may still hold open.
    // Sparse immutable progress snapshots retain crash diagnostics; the complete
    // report keeps its existing name and is published exactly once at finish.
    const sequence = ++progressSequence;
    if (!evidence.collectionComplete && (sequence & (sequence - 1)) !== 0) return;
    const destination = evidence.collectionComplete ? options.evidencePath : `${options.evidencePath}.progress-${sequence}`;
    const temporary = `${destination}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(evidence, null, 2));
    fs.renameSync(temporary, destination);
    if (evidence.collectionComplete) finalWritten = true;
  }
  function finish(reason: string) {
    if (evidence.collectionComplete) return;
    evidence.collectionComplete = true;
    evidence.completionReason = reason;
    persist();
  }
  function observe(transport: Transport, url: URL, allowed: boolean) {
    if (evidence.events.length >= 10000) reject('Application network evidence limit exceeded');
    evidence.counts[transport][allowed ? 'allowed' : 'denied']++;
    evidence.events.push({ transport, allowed, scheme: url.protocol, origin: url.origin });
    persist();
    if (!allowed) finish('guard-denied');
  }
  function reject(message: string): never {
    options.fail(message);
    throw new Error(message);
  }
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const allowed = url.origin === options.backendOrigin;
    observe('mainFetch', url, allowed);
    if (!allowed) reject('Forbidden main-process fetch destination');
    return nativeFetch(input, init);
  };
  evidence.installed.mainFetch = true;
  const NativeWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const parsed = new URL(url);
      const allowed = String(url) === options.socketUrl;
      observe('mainWebSocket', parsed, allowed);
      if (!allowed) reject('Forbidden main-process WebSocket destination');
      super(url, protocols);
    }
  };
  evidence.installed.mainWebSocket = true;
  app.on('session-created', (createdSession) => {
    evidence.chromiumSessions++;
    persist();
    createdSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      const localAsset = url.protocol === 'file:' &&
        fileURLToPath(url).startsWith(path.resolve(options.rendererRoot) + path.sep);
      const allowed = localAsset || url.origin === options.backendOrigin || url.href === 'about:blank';
      observe('chromium', url, allowed);
      callback({ cancel: !allowed });
      if (!allowed) reject('Forbidden Chromium request destination');
    });
  });
  evidence.installed.chromium = true;
  app.once('will-quit', () => finish('will-quit'));
  persist();
  return { finish };
}
