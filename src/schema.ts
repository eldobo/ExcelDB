import type { SchemaDefinition, WorkbookHandle, Migration } from './types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  extraColumns: Record<string, string[]>; // table -> extra column names
}

/**
 * Validate a workbook against a schema definition.
 */
export function validateSchema(
  _wb: WorkbookHandle,
  _schema: SchemaDefinition,
): ValidationResult {
  throw new Error('Not implemented');
}

/**
 * Initialize a new workbook from a schema definition.
 * Creates sheets with header rows and the _exceldb_meta sheet.
 */
export function initializeWorkbook(_schema: SchemaDefinition, _appName?: string): WorkbookHandle {
  throw new Error('Not implemented');
}

/**
 * Apply migrations to a workbook. Returns the new schema version.
 */
export function applyMigrations(
  _wb: WorkbookHandle,
  _migrations: Migration[],
  _currentVersion: number,
): number {
  throw new Error('Not implemented');
}

/**
 * Read the schema version from the _exceldb_meta sheet.
 * Returns 0 if the sheet doesn't exist or has no version.
 */
export function readSchemaVersion(_wb: WorkbookHandle): number {
  throw new Error('Not implemented');
}
