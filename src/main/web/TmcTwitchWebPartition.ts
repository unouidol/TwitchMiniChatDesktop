import { createHash } from 'node:crypto';

/** Keep unambiguous legacy PCG names; do not reuse lossy names for other IDs. */
export function buildTwitchWebPartition(profileId: string): string {
  const normalized = profileId.trim();
  if (!normalized || normalized.length > 256) throw new Error('Invalid Twitch web account.');
  return /^[a-z0-9_-]+$/i.test(normalized) ? `persist:tmc-pcg-${normalized}`
    : `persist:tmc-twitch-web~${createHash('sha256').update(normalized).digest('hex')}`;
}
