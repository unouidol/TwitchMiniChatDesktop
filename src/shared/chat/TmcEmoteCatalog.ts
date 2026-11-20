export type TmcCatalogEmote = {
  readonly id: string;
  readonly name: string;
  readonly category: 'personal' | 'channel' | 'global';
  readonly availability: 'available' | 'locked' | 'unknown';
};

export type TmcEmoteCatalog = {
  readonly favorites: readonly TmcCatalogEmote[];
  readonly favoritesSaveFailed: boolean;
  readonly profileId: string;
  readonly channel: string;
  readonly personalPermission: boolean;
  readonly emotes: readonly TmcCatalogEmote[];
};

export type TmcEmoteCatalogRequest = { readonly profileId: string; readonly channel: string };

export const TMC_EMOTE_FAVORITES_LIMIT = 24;
