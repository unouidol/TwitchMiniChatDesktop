import type {
  LoadHistoryRequest,
  LoadHistoryResult,
} from '../../shared/backend/TmcHistoryModels';

/**
 * Loads normalized chat history from one main-process history source.
 */
export interface HistoryProvider {
  /**
   * Loads history using the existing shared request and result models.
   */
  loadHistory(request: LoadHistoryRequest): Promise<LoadHistoryResult>;
}
