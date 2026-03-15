import type { Transaction, WorkbookHandle } from './types.js';

/**
 * Create a transaction that accumulates writes and flushes once on commit.
 */
export function createTransaction(
  _workbook: WorkbookHandle,
  _schemas: Record<string, import('./types.js').TableSchema>,
  _flush: () => Promise<void>,
): Transaction & { commit(): Promise<void>; rollback(): void } {
  throw new Error('Not implemented');
}
