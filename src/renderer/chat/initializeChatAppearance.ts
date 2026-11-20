import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
import { DEFAULT_CHAT_APPEARANCE, isChatAppearance, type TmcChatAppearance } from '../../shared/settings/TmcSettingsModels';

/** Controls non-secret desktop appearance through the existing settings owner. */
export function initializeChatAppearance(tmc: TmcRendererPreloadApi, viewportChanged: () => void): { dispose: () => void } {
  const chat = document.querySelector<HTMLElement>('#chatList');
  const font = document.querySelector<HTMLSelectElement>('#chatFontSize');
  const density = document.querySelector<HTMLSelectElement>('#chatDensity');
  const timestamps = document.querySelector<HTMLInputElement>('#chatTimestamps');
  const status = document.querySelector<HTMLElement>('[data-tmc-appearance-status]');
  let current = DEFAULT_CHAT_APPEARANCE;
  let disposed = false;
  let saving = false;
  const enabled = (value: boolean): void => {
    if (font) font.disabled = !value;
    if (density) density.disabled = !value;
    if (timestamps) timestamps.disabled = !value;
  };
  const apply = (value: TmcChatAppearance): void => {
    current = value;
    chat?.style.setProperty('--tmc-chat-font-size', `${value.fontSize}px`);
    if (chat) chat.dataset.density = value.density;
    if (chat) chat.dataset.timestamps = value.showTimestamps ? 'visible' : 'hidden';
    if (font) font.value = String(value.fontSize);
    if (density) density.value = value.density;
    if (timestamps) timestamps.checked = value.showTimestamps;
    viewportChanged();
  };
  const change = async (): Promise<void> => {
    if (saving || disposed) return;
    const value = { fontSize: Number(font?.value), density: density?.value, showTimestamps: timestamps?.checked };
    if (!isChatAppearance(value)) return;
    saving = true;
    enabled(false);
    if (status) status.textContent = 'Saving…';
    try {
      const result = await tmc.settings.setChatAppearance(value);
      if (!disposed) {
        apply(result.chatAppearance);
        if (status) status.textContent = 'Saved on this device.';
      }
    } catch {
      if (!disposed) {
        apply(current);
        if (status) status.textContent = 'Could not save. Your previous settings are kept. Try again.';
      }
    } finally {
      saving = false;
      if (!disposed) enabled(true);
    }
  };
  font?.addEventListener('change', change);
  density?.addEventListener('change', change);
  timestamps?.addEventListener('change', change);
  void tmc.settings.get().then((settings) => {
    if (disposed) return;
    apply(settings.chatAppearance);
    enabled(true);
  }).catch(() => {
    if (!disposed && status) status.textContent = 'Could not load appearance settings. Reopen the app to retry.';
  });
  return { dispose: () => {
    disposed = true;
    font?.removeEventListener('change', change);
    density?.removeEventListener('change', change);
    timestamps?.removeEventListener('change', change);
  } };
}
