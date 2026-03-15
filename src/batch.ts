import type { Transaction, WorkbookHandle, TableSchema } from './types.js';
import { createTable } from './table.js';
import { parseWorkbook } from './workbook.js';

/**
 * Create a transaction that accumulates writes and flushes once on commit.
 *
 * Works by snapshotting the workbook bytes before the transaction starts.
 * All table operations modify the live workbook but the onWrite callback
 * is suppressed. On commit, the flush callback is called once. On rollback,
 * the workbook is restored from the snapshot.
 */
export function createTransaction(
  workbook: WorkbookHandle,
  schemas: Record<string, TableSchema>,
  flush: () => Promise<void>,
): Transaction & { commit(): Promise<void>; rollback(): void } {
  // Snapshot the workbook state before the transaction
  const snapshot = workbook.toBytes();

  // No-op write callback — writes accumulate in memory without flushing
  const noopWrite = async () => {};

  return {
    table<T>(name: string) {
      const tableSchema = schemas[name];
      if (!tableSchema) {
        throw new Error(`Unknown table "${name}"`);
      }
      return createTable<T>(name, tableSchema, () => workbook, noopWrite);
    },

    async commit(): Promise<void> {
      await flush();
    },

    rollback(): void {
      // Restore the workbook from the snapshot
      const restored = parseWorkbook(snapshot);
      // Copy all sheets from restored back to workbook
      for (const sheetName of restored.getSheetNames()) {
        const { headers, rows } = restored.readSheet(sheetName);
        if (workbook.hasSheet(sheetName)) {
          workbook.writeSheet(sheetName, headers, rows);
        }
      }
      // Delete any sheets that were added during the transaction
      for (const sheetName of workbook.getSheetNames()) {
        if (!restored.hasSheet(sheetName)) {
          workbook.deleteSheet(sheetName);
        }
      }
    },
  };
}
