export type {
  ColumnType,
  ColumnDef,
  TableSchema,
  SchemaDefinition,
  AuthProvider,
  ConnectOptions,
  Migration,
  WorkbookHandle,
  Table,
  Transaction,
  ExcelDBInstance,
  InferRow,
} from './types.js';

export {
  ExcelDBError,
  ExcelDBAuthError,
  ExcelDBConflictError,
  ExcelDBSchemaError,
  ExcelDBNotFoundError,
  ExcelDBValidationError,
} from './errors.js';

export { createAuth } from './auth.js';
export type { CreateAuthOptions } from './auth.js';

import type { SchemaDefinition, ConnectOptions, ExcelDBInstance } from './types.js';

/**
 * Connect to an ExcelDB-managed .xlsx file in OneDrive.
 */
export async function connect<S extends SchemaDefinition>(
  _options: ConnectOptions<S>,
): Promise<ExcelDBInstance<S>> {
  throw new Error('Not implemented');
}
