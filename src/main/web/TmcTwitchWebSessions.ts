import { session, type Session } from 'electron';
import { buildTwitchWebPartition } from './TmcTwitchWebPartition';

/** Chromium storage is authoritative; never copies cookies or chat tokens. */
export class TmcTwitchWebSessions {
  private readonly configured = new WeakSet<Session>();
  constructor(private readonly profiles: () => readonly string[]) {}

  get(profileId: string): Session {
    const normalized = profileId.trim();
    const profiles = this.profiles();
    if (!profiles.includes(normalized)) throw new Error('Twitch web account unavailable.');
    const partition = buildTwitchWebPartition(normalized);
    if (profiles.some((other) => other !== normalized && buildTwitchWebPartition(other).toLowerCase() === partition.toLowerCase())) {
      throw new Error('Twitch web account storage identities conflict.');
    }
    const browserSession = session.fromPartition(partition);
    if (!this.configured.has(browserSession)) {
      browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      browserSession.setPermissionCheckHandler(() => false);
      this.configured.add(browserSession);
    }
    return browserSession;
  }
}
