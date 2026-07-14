import type {
  LoadHistoryRequest,
  LoadHistoryResult,
} from '../../shared/backend/TmcHistoryModels';
import type { TmcBackendClient } from '../backend/TmcBackendClient';
import type { HistoryProvider } from './HistoryProvider';

/**
 * History provider backed exclusively by the existing TMC backend client.
 */
export class TmcBackendHistoryProvider implements HistoryProvider {
  /**
   * Creates a provider that delegates HTTP and session handling to the client.
   */
  constructor(private readonly backendClient: TmcBackendClient) {}

  /**
   * Loads normalized history without changing client errors or response data.
   */
  loadHistory(request: LoadHistoryRequest): Promise<LoadHistoryResult> {
    return this.backendClient.loadHistory(request);
  }
}
