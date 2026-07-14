import type {
  LoadHistoryRequest,
  LoadHistoryResult,
} from '../../shared/backend/TmcHistoryModels';
import type { HistoryProvider } from './HistoryProvider';

/**
 * Delegates each history request to the single configured provider.
 */
export class TmcHistoryLoadService {
  /**
   * Creates the service with its only history provider.
   */
  constructor(private readonly historyProvider: HistoryProvider) {}

  /**
   * Loads history once and propagates the provider result or error unchanged.
   */
  loadHistory(request: LoadHistoryRequest): Promise<LoadHistoryResult> {
    return this.historyProvider.loadHistory(request);
  }
}
