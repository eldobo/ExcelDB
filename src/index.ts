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

import type { SchemaDefinition, ConnectOptions, ExcelDBInstance, Migration, WorkbookHandle } from './types.js';
import { createGraphClient } from './graph-client.js';
import { findFile, createFile, downloadFile, uploadFile } from './file-ops.js';
import { parseWorkbook } from './workbook.js';
import { validateSchema, initializeWorkbook, readSchemaVersion, applyMigrations } from './schema.js';
import { createTable } from './table.js';
import { createTransaction } from './batch.js';
import { ExcelDBSchemaError } from './errors.js';

/**
 * Connect to an ExcelDB-managed .xlsx file in OneDrive.
 */
export async function connect<S extends SchemaDefinition>(
  options: ConnectOptions<S>,
): Promise<ExcelDBInstance<S>> {
  const client = createGraphClient(options.auth);
  const folderPath = options.folderPath ?? '';
  const appName = options.appName;

  // State
  let workbook: WorkbookHandle;
  let fileId: string;
  let eTag: string;

  // Find or create the file
  const existing = await findFile(client, folderPath, options.fileName);

  if (existing) {
    fileId = existing.id;
    console.log('[ExcelDB] Found existing file:', { id: fileId, name: options.fileName });
    const downloaded = await downloadFile(client, fileId);
    eTag = downloaded.eTag;
    console.log('[ExcelDB] Downloaded file:', { bytes: downloaded.data.byteLength, eTag });
    workbook = parseWorkbook(downloaded.data);
    console.log('[ExcelDB] Parsed workbook sheets:', workbook.getSheetNames());

    // Apply pending migrations before schema validation
    if (options.migrations?.length) {
      const currentVersion = readSchemaVersion(workbook);
      console.log('[ExcelDB] Schema version:', currentVersion, '→ checking', options.migrations.length, 'migration(s)');
      const newVersion = applyMigrations(workbook, options.migrations, currentVersion);
      if (newVersion > currentVersion) {
        console.log('[ExcelDB] Migrated to v' + newVersion + ', sheets after migration:', workbook.getSheetNames());
        const bytes = workbook.toBytes();
        console.log('[ExcelDB] Serialized migrated workbook:', bytes.byteLength, 'bytes');
        const result = await uploadFile(client, fileId, bytes.buffer as ArrayBuffer, eTag);
        eTag = result.eTag;
        console.log('[ExcelDB] Uploaded migrated file, new eTag:', eTag);
      } else {
        console.log('[ExcelDB] No migrations needed (already at v' + currentVersion + ')');
      }
    }
  } else {
    console.log('[ExcelDB] File not found, creating new:', options.fileName);
    // Initialize a new workbook from the schema
    workbook = initializeWorkbook(options.schema, appName);
    const bytes = workbook.toBytes();
    console.log('[ExcelDB] Initialized new workbook:', workbook.getSheetNames(), bytes.byteLength, 'bytes');
    const created = await createFile(client, folderPath, options.fileName, bytes.buffer as ArrayBuffer);
    fileId = created.id;
    eTag = created.eTag;
    console.log('[ExcelDB] Created file:', { id: fileId, eTag });
  }

  // Validate schema
  const validation = validateSchema(workbook, options.schema);
  console.log('[ExcelDB] Schema validation:', validation.valid ? 'PASSED' : 'FAILED — ' + validation.errors.join('; '));
  if (!validation.valid) {
    throw new ExcelDBSchemaError(
      `Schema validation failed: ${validation.errors.join('; ')}`,
    );
  }

  // Flush: serialize + upload with eTag
  async function flush(): Promise<void> {
    const bytes = workbook.toBytes();
    const result = await uploadFile(client, fileId, bytes.buffer as ArrayBuffer, eTag);
    eTag = result.eTag;
  }

  // Write callback for individual table operations
  async function onWrite(): Promise<void> {
    await flush();
  }

  return {
    table<T extends keyof S['tables'] & string>(name: T) {
      const tableSchema = options.schema.tables[name];
      if (!tableSchema) {
        throw new ExcelDBSchemaError(`Unknown table "${name}"`);
      }
      return createTable(name, tableSchema, () => workbook, onWrite);
    },

    async batch(fn: (tx: import('./types.js').Transaction) => Promise<void>): Promise<void> {
      const tx = createTransaction(workbook, options.schema.tables as Record<string, import('./types.js').TableSchema>, flush);
      try {
        await fn(tx);
        await tx.commit();
      } catch (err) {
        tx.rollback();
        throw err;
      }
    },

    async migrate(migrations: Migration[]): Promise<void> {
      const currentVersion = readSchemaVersion(workbook);
      const newVersion = applyMigrations(workbook, migrations, currentVersion);
      if (newVersion > currentVersion) {
        await flush();
      }
    },

    async refresh(): Promise<void> {
      const downloaded = await downloadFile(client, fileId);
      eTag = downloaded.eTag;
      workbook = parseWorkbook(downloaded.data);
    },

    disconnect(): void {
      // Clean up — nothing to do for now
    },
  };
}
