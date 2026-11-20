export type TmcPlayerContext = { readonly profileId: string; readonly channel: string };
export type TmcPlayerBounds = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export type TmcPlayerMode = 'embedded' | 'detached';
export type TmcPlayerStatus = {
  readonly sequence: number;
  readonly state: 'closed' | 'loading' | 'ready' | 'error';
  readonly profileId: string | null;
  readonly channel: string | null;
  readonly mode: TmcPlayerMode;
  readonly message: string | null;
};
export type TmcPlayerOpenRequest = TmcPlayerContext & { readonly mode: TmcPlayerMode; readonly bounds: TmcPlayerBounds | null };
export type TmcPlayerLayoutRequest = TmcPlayerContext & { readonly bounds: TmcPlayerBounds | null };

export function isPlayerContext(value: unknown): value is TmcPlayerContext {
  return !!value && typeof value === 'object' && 'profileId' in value && typeof value.profileId === 'string' &&
    value.profileId.length > 0 && value.profileId.length <= 256 && 'channel' in value && typeof value.channel === 'string' && /^[a-z0-9_-]{1,64}$/.test(value.channel);
}
export function isPlayerBounds(value: unknown): value is TmcPlayerBounds | null {
  if (value === null) return true;
  return !!value && typeof value === 'object' && 'x' in value && 'y' in value && 'width' in value && 'height' in value &&
    [value.x, value.y, value.width, value.height].every((part) => typeof part === 'number' && Number.isInteger(part) && part >= 0 && part <= 10000) &&
    typeof value.width === 'number' && value.width >= 400 && typeof value.height === 'number' && value.height >= 300;
}
