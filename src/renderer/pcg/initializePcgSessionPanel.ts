import type { TmcPcgSessionStatus } from '../../shared/pcg/TmcPcgSessionModels';
import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';

/**
 * Local placeholder controller for the PCG session hold/grace-window status.
 */
export type TmcPcgSessionPanelController = {
  readonly loadInitialStatus: () => Promise<void>;
  readonly holdActiveSession: () => Promise<void>;
  readonly activateSession: (
    profileId: string,
    channel: string,
  ) => Promise<TmcPcgSessionStatus>;
  readonly renderLoading: (profileId: string, channel: string) => void;
};

/**
 * Initializes the PCG placeholder panel.
 *
 * TODO: When the real PCG web view is added, this renderer should only display
 * status while main owns the BrowserView/WebContentsView lifetime. Held views
 * must be hidden or visually detached, not destroyed, until the grace window
 * expires.
 */
export function initializePcgSessionPanel(
  tmc: TmcRendererPreloadApi,
): TmcPcgSessionPanelController {
  const panel = document.querySelector<HTMLElement>('.tmc-pcg-panel');
  const statusElement = ensureStatusElement(panel);

  const renderStatus = (status: TmcPcgSessionStatus): void => {
    if (!statusElement) {
      return;
    }

    statusElement.textContent = formatPcgStatus(status);
  };

  return {
    loadInitialStatus: async (): Promise<void> => {
      renderStatus(await tmc.pcg.getSessionStatus());
    },

    holdActiveSession: async (): Promise<void> => {
      renderStatus(await tmc.pcg.holdActiveSession());
    },

    activateSession: async (
      profileId: string,
      channel: string,
    ): Promise<TmcPcgSessionStatus> => {
      const status = await tmc.pcg.activateSession({ profileId, channel });

      renderStatus(status);

      return status;
    },

    renderLoading: (profileId: string, channel: string): void => {
      renderStatus({
        state: 'loading',
        profileId,
        channel,
        heldCount: 0,
        message: null,
      });
    },
  };
}

function ensureStatusElement(panel: HTMLElement | null): HTMLElement | null {
  if (!panel) {
    return null;
  }

  const existingStatus = panel.querySelector<HTMLElement>('[data-tmc-pcg-status]');

  if (existingStatus) {
    return existingStatus;
  }

  const status = document.createElement('p');
  status.dataset.tmcPcgStatus = 'true';
  status.className = 'tmc-pcg-status';
  status.textContent = 'PCG: empty';

  panel.appendChild(status);

  return status;
}

function formatPcgStatus(status: TmcPcgSessionStatus): string {
  if (status.state === 'active' && status.channel) {
    return `PCG: active #${status.channel}`;
  }

  if (status.state === 'loading' && status.channel) {
    return `PCG: loading #${status.channel}`;
  }

  if (status.state === 'held') {
    return status.heldCount > 1
      ? `PCG: held (${status.heldCount})`
      : 'PCG: held';
  }

  if (status.state === 'expired') {
    return 'PCG: expired';
  }

  if (status.state === 'error') {
    return status.message || 'PCG: error';
  }

  return 'PCG: empty';
}
