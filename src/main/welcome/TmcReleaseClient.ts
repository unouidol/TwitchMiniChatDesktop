export const TMC_DESKTOP_RELEASE_API = 'https://api.github.com/repos/unouidol/TwitchMiniChatDesktop/releases/latest';
export const TMC_DESKTOP_RELEASE_BASE = 'https://github.com/unouidol/TwitchMiniChatDesktop/releases';
export const TMC_DESKTOP_ASSET = 'TMC-desktop-Setup.exe';
export type DesktopRelease = { version: string; downloadUrl: string };

export function stableVersion(value: unknown): number[] | null {
  if (typeof value !== 'string' || value.length > 64 || !/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null;
  const parts = value.replace(/^v/, '').split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
export function isNewerRelease(latest: string, installed: string): boolean {
  const release = stableVersion(latest);
  const match = /^(\d+\.\d+\.\d+)(-[0-9A-Za-z.-]+)?$/.exec(installed);
  const current = match && stableVersion(match[1]);
  if (!release || !current) return false;
  for (let index = 0; index < 3; index++) if (release[index] !== current[index]) return release[index] > current[index];
  return !!match[2];
}
export function parseDesktopRelease(value: unknown): DesktopRelease {
  if (!value || typeof value !== 'object' || !('tag_name' in value) || !stableVersion(value.tag_name) ||
    !('draft' in value) || value.draft !== false || !('prerelease' in value) || value.prerelease !== false ||
    !('assets' in value) || !Array.isArray(value.assets) || value.assets.length > 100) throw new Error('Invalid desktop release');
  const downloadUrl = `${TMC_DESKTOP_RELEASE_BASE}/download/${value.tag_name}/${TMC_DESKTOP_ASSET}`;
  const assets = value.assets.filter((asset: unknown) => asset && typeof asset === 'object' && 'name' in asset && asset.name === TMC_DESKTOP_ASSET);
  const asset: unknown = assets[0];
  if (assets.length !== 1 || !asset || typeof asset !== 'object' || !('state' in asset) || asset.state !== 'uploaded' ||
    !('browser_download_url' in asset) || asset.browser_download_url !== downloadUrl || !('size' in asset) ||
    typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 1024 ** 3) throw new Error('Windows installer unavailable');
  return { version: String(value.tag_name).replace(/^v/, ''), downloadUrl };
}

/** Anonymous metadata only. The browser, never this client, downloads installers. */
export async function fetchDesktopRelease(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<DesktopRelease | null> {
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(), 10000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetcher(TMC_DESKTOP_RELEASE_API, { signal: controller.signal, redirect: 'error', credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'TMC-desktop' } });
    if (response.status === 404) return null;
    if (response.status !== 200 || !response.body) throw new Error('Release check unavailable');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > 256 * 1024) throw new Error('Release metadata too large');
      chunks.push(result.value);
    }
    return parseDesktopRelease(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.abort(); await reader?.cancel(); }
}
