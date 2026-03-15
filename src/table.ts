import type { Table as ITable, TableSchema, WorkbookHandle, ColumnDef } from './types.js';
import { coerceFromCell, coerceToCell } from './coerce.js';
import { ExcelDBNotFoundError, ExcelDBValidationError } from './errors.js';

/**
 * Create a Table instance that operates on an in-memory workbook.
 */
export function createTable<T>(
  sheetName: string,
  schema: TableSchema,
  getWorkbook: () => WorkbookHandle,
  onWrite: () => Promise<void>,
): ITable<T> {
  const declaredColumns = Object.keys(schema.columns);

  function findKeyColumn(): string | null {
    for (const [name, def] of Object.entries(schema.columns)) {
      if (def.key) return name;
    }
    return null;
  }

  const keyColumn = findKeyColumn();

  /** Read all rows from the sheet, coercing declared columns and collecting extras. */
  function readRows(includeDeleted: boolean): T[] {
    const wb = getWorkbook();
    const { headers, rows } = wb.readSheet(sheetName);
    const deletedIdx = headers.indexOf('_deleted');
    const results: T[] = [];

    for (const row of rows) {
      // Check soft-delete
      if (!includeDeleted && deletedIdx !== -1) {
        const deletedVal = row[deletedIdx];
        if (deletedVal && String(deletedVal).toUpperCase() === 'TRUE') {
          continue;
        }
      }

      const obj: Record<string, unknown> = {};

      // Coerce declared columns
      for (const colName of declaredColumns) {
        const idx = headers.indexOf(colName);
        const def = schema.columns[colName];
        if (idx !== -1) {
          obj[colName] = coerceFromCell(row[idx], def);
        } else {
          obj[colName] = null;
        }
      }

      // Collect extra columns
      const knownColumns = new Set([...declaredColumns, '_deleted']);
      const extras: Record<string, unknown> = {};
      let hasExtras = false;
      for (let i = 0; i < headers.length; i++) {
        if (!knownColumns.has(headers[i])) {
          const val = row[i];
          if (val !== '' && val !== null && val !== undefined) {
            extras[headers[i]] = val;
            hasExtras = true;
          }
        }
      }
      if (hasExtras) {
        obj._extra = extras;
      }

      results.push(obj as T);
    }

    return results;
  }

  /** Find the raw row index (in the rows array, 0-based) for a given key value. */
  function findRowIndex(keyValue: string | number): number {
    if (!keyColumn) return -1;
    const wb = getWorkbook();
    const { headers, rows } = wb.readSheet(sheetName);
    const keyIdx = headers.indexOf(keyColumn);
    if (keyIdx === -1) return -1;

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][keyIdx]) === String(keyValue)) {
        return i;
      }
    }
    return -1;
  }

  /** Convert a row object to cell values array. */
  function rowToArray(rowObj: Record<string, unknown>, headers: string[]): unknown[] {
    const arr: unknown[] = new Array(headers.length).fill('');
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (h === '_deleted') {
        arr[i] = '';
        continue;
      }
      const def = schema.columns[h];
      if (def && h in rowObj) {
        arr[i] = coerceToCell(rowObj[h], def);
      }
    }
    return arr;
  }

  return {
    async getAll(options?: { includeDeleted?: boolean }): Promise<T[]> {
      return readRows(options?.includeDeleted ?? false);
    },

    async get(key: string | number): Promise<T | null> {
      const rows = readRows(false);
      if (!keyColumn) return null;
      for (const row of rows) {
        if (String((row as Record<string, unknown>)[keyColumn]) === String(key)) {
          return row;
        }
      }
      return null;
    },

    async query(filter: Partial<T>): Promise<T[]> {
      const rows = readRows(false);
      return rows.filter(row => {
        for (const [k, v] of Object.entries(filter as Record<string, unknown>)) {
          if ((row as Record<string, unknown>)[k] !== v) return false;
        }
        return true;
      });
    },

    async count(filter?: Partial<T>): Promise<number> {
      if (!filter) return readRows(false).length;
      const filtered = await this.query(filter);
      return filtered.length;
    },

    async append(row: Omit<T, '_extra'>): Promise<T> {
      const rowObj = row as Record<string, unknown>;

      // Check for duplicate key
      if (keyColumn && keyColumn in rowObj) {
        const existingIdx = findRowIndex(rowObj[keyColumn] as string | number);
        if (existingIdx !== -1) {
          throw new ExcelDBValidationError(
            `Duplicate key "${rowObj[keyColumn]}" in table "${sheetName}"`,
          );
        }
      }

      const wb = getWorkbook();
      const { headers, rows } = wb.readSheet(sheetName);
      const newRow = rowToArray(rowObj, headers);
      rows.push(newRow);
      wb.writeSheet(sheetName, headers, rows);
      await onWrite();

      // Return the coerced version
      const result: Record<string, unknown> = {};
      for (const colName of declaredColumns) {
        const def = schema.columns[colName];
        result[colName] = colName in rowObj ? coerceFromCell(coerceToCell(rowObj[colName], def), def) : null;
      }
      return result as T;
    },

    async upsert(row: Omit<T, '_extra'>): Promise<T> {
      const rowObj = row as Record<string, unknown>;

      if (keyColumn && keyColumn in rowObj) {
        const wb = getWorkbook();
        const { headers, rows } = wb.readSheet(sheetName);
        const keyIdx = headers.indexOf(keyColumn);

        // Find existing row (including deleted)
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i][keyIdx]) === String(rowObj[keyColumn])) {
            // Update existing row
            for (const colName of declaredColumns) {
              const colIdx = headers.indexOf(colName);
              if (colIdx !== -1 && colName in rowObj) {
                const def = schema.columns[colName];
                rows[i][colIdx] = coerceToCell(rowObj[colName], def);
              }
            }
            // Clear _deleted flag
            const deletedIdx = headers.indexOf('_deleted');
            if (deletedIdx !== -1) {
              rows[i][deletedIdx] = '';
            }
            wb.writeSheet(sheetName, headers, rows);
            await onWrite();

            const result: Record<string, unknown> = {};
            for (const colName of declaredColumns) {
              const colIdx = headers.indexOf(colName);
              const def = schema.columns[colName];
              result[colName] = colIdx !== -1 ? coerceFromCell(rows[i][colIdx], def) : null;
            }
            return result as T;
          }
        }
      }

      // Key not found — insert
      return this.append(row);
    },

    async update(key: string | number, patch: Partial<T>): Promise<T> {
      if (!keyColumn) {
        throw new ExcelDBNotFoundError(`No key column defined for table "${sheetName}"`);
      }

      const wb = getWorkbook();
      const { headers, rows } = wb.readSheet(sheetName);
      const keyIdx = headers.indexOf(keyColumn);
      const deletedIdx = headers.indexOf('_deleted');

      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][keyIdx]) !== String(key)) continue;

        // Skip deleted rows
        if (deletedIdx !== -1) {
          const deletedVal = rows[i][deletedIdx];
          if (deletedVal && String(deletedVal).toUpperCase() === 'TRUE') continue;
        }

        // Apply patch
        const patchObj = patch as Record<string, unknown>;
        for (const [colName, val] of Object.entries(patchObj)) {
          const colIdx = headers.indexOf(colName);
          const def = schema.columns[colName];
          if (colIdx !== -1 && def) {
            rows[i][colIdx] = coerceToCell(val, def);
          }
        }

        wb.writeSheet(sheetName, headers, rows);
        await onWrite();

        // Return full updated row
        const result: Record<string, unknown> = {};
        for (const colName of declaredColumns) {
          const colIdx = headers.indexOf(colName);
          const def = schema.columns[colName];
          result[colName] = colIdx !== -1 ? coerceFromCell(rows[i][colIdx], def) : null;
        }
        return result as T;
      }

      throw new ExcelDBNotFoundError(`Row with key "${key}" not found in table "${sheetName}"`);
    },

    async delete(key: string | number, options?: { hard?: boolean }): Promise<void> {
      if (!keyColumn) {
        throw new ExcelDBNotFoundError(`No key column defined for table "${sheetName}"`);
      }

      const wb = getWorkbook();
      const { headers, rows } = wb.readSheet(sheetName);
      const keyIdx = headers.indexOf(keyColumn);

      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][keyIdx]) !== String(key)) continue;

        if (options?.hard) {
          // Hard delete — remove row entirely
          rows.splice(i, 1);
        } else {
          // Soft delete — set _deleted to TRUE
          const deletedIdx = headers.indexOf('_deleted');
          if (deletedIdx !== -1) {
            rows[i][deletedIdx] = 'TRUE';
          }
        }

        wb.writeSheet(sheetName, headers, rows);
        await onWrite();
        return;
      }

      throw new ExcelDBNotFoundError(`Row with key "${key}" not found in table "${sheetName}"`);
    },
  };
}

// Re-export for convenience
export type { ITable as Table, ColumnDef };
