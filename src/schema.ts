import type { SchemaDefinition, WorkbookHandle, Migration } from './types.js';
import { createEmptyWorkbook } from './workbook.js';
import { ExcelDBSchemaError } from './errors.js';

const META_SHEET = '_exceldb_meta';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  extraColumns: Record<string, string[]>;
}

/**
 * Validate a workbook against a schema definition.
 */
export function validateSchema(
  wb: WorkbookHandle,
  schema: SchemaDefinition,
): ValidationResult {
  const errors: string[] = [];
  const extraColumns: Record<string, string[]> = {};

  for (const [tableName, tableSchema] of Object.entries(schema.tables)) {
    if (!wb.hasSheet(tableName)) {
      errors.push(`Missing sheet "${tableName}"`);
      continue;
    }

    const { headers } = wb.readSheet(tableName);
    const declaredColumns = Object.keys(tableSchema.columns);

    // Check for missing declared columns
    for (const col of declaredColumns) {
      if (!headers.includes(col)) {
        errors.push(`Missing column "${col}" in sheet "${tableName}"`);
      }
    }

    // Track extra columns (excluding _deleted which is managed by ExcelDB)
    const knownColumns = new Set([...declaredColumns, '_deleted']);
    const extras = headers.filter(h => !knownColumns.has(h));
    if (extras.length > 0) {
      extraColumns[tableName] = extras;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    extraColumns,
  };
}

/**
 * Initialize a new workbook from a schema definition.
 */
export function initializeWorkbook(schema: SchemaDefinition, appName?: string): WorkbookHandle {
  const wb = createEmptyWorkbook();

  for (const [tableName, tableSchema] of Object.entries(schema.tables)) {
    const headers = [...Object.keys(tableSchema.columns), '_deleted'];
    wb.addSheet(tableName, headers);
  }

  // Create _exceldb_meta sheet
  wb.addSheet(META_SHEET, ['key', 'value'], [
    ['schema_version', String(schema.version)],
    ['created_at', new Date().toISOString()],
    ['last_modified_by', 'ExcelDB'],
    ...(appName ? [['app_name', appName]] : []),
  ]);

  return wb;
}

/**
 * Read the schema version from the _exceldb_meta sheet.
 */
export function readSchemaVersion(wb: WorkbookHandle): number {
  if (!wb.hasSheet(META_SHEET)) return 0;

  const { headers, rows } = wb.readSheet(META_SHEET);
  const keyIdx = headers.indexOf('key');
  const valIdx = headers.indexOf('value');
  if (keyIdx === -1 || valIdx === -1) return 0;

  for (const row of rows) {
    if (row[keyIdx] === 'schema_version') {
      const v = parseInt(String(row[valIdx]), 10);
      return Number.isNaN(v) ? 0 : v;
    }
  }
  return 0;
}

function writeSchemaVersion(wb: WorkbookHandle, version: number): void {
  if (!wb.hasSheet(META_SHEET)) return;

  const { headers, rows } = wb.readSheet(META_SHEET);
  const keyIdx = headers.indexOf('key');
  const valIdx = headers.indexOf('value');

  let found = false;
  for (const row of rows) {
    if (row[keyIdx] === 'schema_version') {
      row[valIdx] = String(version);
      found = true;
      break;
    }
  }
  if (!found) {
    rows.push(Array.from({ length: headers.length }, (_, i) =>
      i === keyIdx ? 'schema_version' : i === valIdx ? String(version) : '',
    ));
  }
  wb.writeSheet(META_SHEET, headers, rows);
}

/**
 * Apply migrations to a workbook. Returns the new schema version.
 */
export function applyMigrations(
  wb: WorkbookHandle,
  migrations: Migration[],
  currentVersion: number,
): number {
  // Sort migrations by version
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  let version = currentVersion;

  for (const migration of sorted) {
    if (migration.version <= currentVersion) continue;

    // Wrap the workbook to detect destructive operations at call time
    const wrapped: WorkbookHandle = Object.create(wb);
    wrapped.removeColumn = (...args: Parameters<WorkbookHandle['removeColumn']>) => {
      if (!migration.destructive) {
        throw new ExcelDBSchemaError(
          `Migration v${migration.version} ("${migration.description}") calls removeColumn but does not have destructive: true`,
        );
      }
      return wb.removeColumn(...args);
    };
    wrapped.deleteSheet = (...args: Parameters<WorkbookHandle['deleteSheet']>) => {
      if (!migration.destructive) {
        throw new ExcelDBSchemaError(
          `Migration v${migration.version} ("${migration.description}") calls deleteSheet but does not have destructive: true`,
        );
      }
      return wb.deleteSheet(...args);
    };

    migration.up(wrapped);
    version = migration.version;
  }

  if (version > currentVersion) {
    writeSchemaVersion(wb, version);
  }

  return version;
}
