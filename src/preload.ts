import { installTmcPreloadApi } from './preload/tmcPreloadApi';

/**
 * Electron preload entrypoint.
 *
 * This file should stay small. Add new bridge functions in dedicated preload
 * modules and expose only safe, explicit APIs to the renderer.
 */
installTmcPreloadApi();
