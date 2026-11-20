import { createHash } from 'node:crypto';
import type { TmcAuthSession } from '../auth/TmcAuthSessionStore';
import { readTwitchNameColor } from '../../shared/chat/TmcChatNameColor';
import { isTwitchLogin, type TmcUserColorsRequest, type TmcUserColorsResult } from '../../shared/chat/TmcUserColors';

type ColorContext = { colors: Map<string, { color: string | null; expires: number }>; cooldown: number };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Public metadata only. Requests/caches remain scoped to the initiating OAuth identity. */
export class TmcUserColorService {
  private readonly contexts = new Map<string, ColorContext>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly getActiveSession: () => TmcAuthSession | null) {}

  async getColors(request: TmcUserColorsRequest): Promise<TmcUserColorsResult> {
    const session = this.getActiveSession();
    if (!session || session.profileId !== request.profileId) throw new Error('Chat account changed.');
    if (request.usernames.length > 100 || !request.usernames.every(isTwitchLogin)) throw new Error('Invalid user color request.');
    const names = [...new Set(request.usernames)].sort();
    const key = `${session.profileId}:${createHash('sha256').update(`${session.userId}:${session.accessToken}`).digest('hex')}`;
    let context = this.contexts.get(key);
    if (!context) {
      context = { colors: new Map(), cooldown: 0 };
      this.contexts.set(key, context);
      while (this.contexts.size > 8) this.contexts.delete(this.contexts.keys().next().value);
    }
    const missing = names.filter((name) => (context.colors.get(name)?.expires || 0) <= Date.now());
    if (missing.length && context.cooldown <= Date.now()) {
      const batchKey = `${key}:${missing.join(',')}`;
      let loading = this.pending.get(batchKey);
      if (!loading && this.pending.size < 4) {
        loading = this.load(session, missing, context).finally(() => this.pending.delete(batchKey));
        this.pending.set(batchKey, loading);
      }
      if (loading) await loading;
    }
    this.assertCurrent(session);
    const colors: Array<{ username: string; color: string | null }> = [];
    for (const username of names) {
      const cached = context.colors.get(username);
      if (cached && cached.expires > Date.now()) colors.push({ username, color: cached.color });
    }
    return { profileId: request.profileId, channel: request.channel, colors,
      status: colors.length === names.length ? 'ready' : 'unavailable' };
  }

  private assertCurrent(session: TmcAuthSession): void {
    const current = this.getActiveSession();
    if (!current || current.profileId !== session.profileId || current.userId !== session.userId || current.accessToken !== session.accessToken) {
      throw new Error('Chat account changed.');
    }
  }

  private async load(session: TmcAuthSession, names: readonly string[], context: ColorContext): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const json = async (url: string, clientId?: string): Promise<Record<string, unknown>> => {
      const response = await fetch(url, { redirect: 'error', signal: controller.signal, headers: clientId
        ? { Authorization: `Bearer ${session.accessToken}`, 'Client-Id': clientId }
        : { Authorization: `OAuth ${session.accessToken}` } });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Twitch color lookup unavailable.');
      }
      const value: unknown = await response.json();
      this.assertCurrent(session);
      if (!object(value)) throw new Error('Invalid Twitch color response.');
      return value;
    };
    try {
      const validation = await json('https://id.twitch.tv/oauth2/validate');
      if (validation.user_id !== session.userId || typeof validation.client_id !== 'string' || !validation.client_id || validation.client_id.length > 128) throw new Error('Invalid Twitch identity.');
      const clientId = validation.client_id;
      const query = new URLSearchParams(names.map((name) => ['login', name]));
      const users = await json(`https://api.twitch.tv/helix/users?${query}`, clientId);
      if (!Array.isArray(users.data) || users.data.length > names.length) throw new Error('Invalid Twitch users.');
      const byId = new Map<string, string>();
      const byName = new Set<string>();
      for (const user of users.data) {
        if (!object(user) || typeof user.id !== 'string' || !/^\d{1,32}$/.test(user.id) || !isTwitchLogin(user.login) ||
            !names.includes(user.login) || byId.has(user.id) || byName.has(user.login)) throw new Error('Invalid Twitch user identity.');
        byId.set(user.id, user.login);
        byName.add(user.login);
      }
      const resolved = new Map<string, string | null>(names.map((name) => [name, null]));
      if (byId.size) {
        const ids = new URLSearchParams([...byId.keys()].map((id) => ['user_id', id]));
        const result = await json(`https://api.twitch.tv/helix/chat/color?${ids}`, clientId);
        if (!Array.isArray(result.data) || result.data.length !== byId.size) throw new Error('Invalid Twitch color list.');
        const seen = new Set<string>();
        for (const item of result.data) {
          if (!object(item) || typeof item.user_id !== 'string' || !byId.has(item.user_id) || seen.has(item.user_id) ||
              item.user_login !== byId.get(item.user_id) || (item.color !== '' && !readTwitchNameColor(item.color))) throw new Error('Invalid Twitch color metadata.');
          resolved.set(byId.get(item.user_id), readTwitchNameColor(item.color) || null);
          seen.add(item.user_id);
        }
      }
      this.assertCurrent(session);
      for (const [name, color] of resolved) {
        context.colors.delete(name);
        context.colors.set(name, { color, expires: Date.now() + (color ? 1800000 : 300000) });
      }
      while (context.colors.size > 1000) context.colors.delete(context.colors.keys().next().value);
    } catch {
      context.cooldown = Date.now() + 30000;
      console.warn('[TMC Chat] User colors unavailable; readable fallback colors retained.');
    } finally { clearTimeout(timer); }
  }
}
