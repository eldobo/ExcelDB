import type { Table as ITable, TableSchema, WorkbookHandle, ColumnDef } from './types.js';

/**
 * Create a Table instance that operates on an in-memory workbook.
 */
export function createTable<T>(
  _sheetName: string,
  _schema: TableSchema,
  _getWorkbook: () => WorkbookHandle,
  _onWrite: () => Promise<void>,
): ITable<T> {
  throw new Error('Not implemented');
}

// Re-export for convenience
export type { ITable as Table, ColumnDef };
