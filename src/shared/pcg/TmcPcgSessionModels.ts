/**
 * Lifecycle state for the local Pokemon Community Game panel session.
 */
export type TmcPcgSessionState =
  | 'empty'
  | 'active'
  | 'held'
  | 'expired'
  | 'loading'
  | 'error';

/**
 * Account/channel key used to isolate one PCG extension session.
 */
export type TmcPcgSessionKey = {
  readonly profileId: string;
  readonly channel: string;
};

/**
 * Renderer-safe PCG session status.
 */
export type TmcPcgSessionStatus = {
  readonly state: TmcPcgSessionState;
  readonly profileId: string | null;
  readonly channel: string | null;
  readonly heldCount: number;
  readonly message: string | null;
};

/**
 * Request used to activate or restore a PCG session for a channel.
 */
export type TmcPcgActivateSessionRequest = TmcPcgSessionKey;
