// ---- Column types ----

export type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'json';

export interface ColumnDef {
  readonly type: ColumnType;
  readonly key?: boolean;
  readonly required?: boolean;
  readonly default?: unknown;
}

export interface TableSchema {
  readonly columns: Record<string, ColumnDef>;
}

export interface SchemaDefinition {
  readonly version: number;
  readonly tables: Record<string, TableSchema>;
}

// ---- Row type inference ----

type InferColumnTS<C extends ColumnDef> =
  C['type'] extends 'string' ? string :
  C['type'] extends 'number' ? number :
  C['type'] extends 'boolean' ? boolean :
  C['type'] extends 'date' ? Date :
  C['type'] extends 'json' ? unknown :
  never;

export type InferRow<T extends TableSchema> = {
  [K in keyof T['columns']]:
    T['columns'][K]['required'] extends true
      ? InferColumnTS<T['columns'][K]>
      : InferColumnTS<T['columns'][K]> | null;
} & { _extra?: Record<string, unknown> };

// ---- Auth ----

export interface AuthProvider {
  getAccessToken(): Promise<string>;
  login?(): Promise<void>;
  logout?(): Promise<void>;
  isAuthenticated?(): boolean;
  isAuthenticatedAsync?(): Promise<boolean>;
}

// ---- Connect options ----

export interface ConnectOptions<S extends SchemaDefinition> {
  auth: AuthProvider;
  fileName: string;
  schema: S;
  folderPath?: string;
  appName?: string;
  migrations?: Migration[];
}

// ---- Migration ----

export interface Migration {
  version: number;
  description: string;
  destructive?: boolean;
  up: (wb: WorkbookHandle) => void;
}

// ---- Workbook handle ----

export interface WorkbookHandle {
  getSheetNames(): string[];
  hasSheet(name: string): boolean;
  readSheet(name: string): { headers: string[]; rows: unknown[][] };
  writeSheet(name: string, headers: string[], rows: unknown[][]): void;
  addSheet(name: string, headers: string[], rows?: unknown[][]): void;
  deleteSheet(name: string): void;
  addColumn(sheet: string, name: string, options?: { after?: string }): void;
  removeColumn(sheet: string, name: string): void;
  renameColumn(sheet: string, oldName: string, newName: string): void;
  renameSheet(oldName: string, newName: string): void;
  toBytes(): Uint8Array;
}

// ---- Table ----

export interface Table<T> {
  getAll(options?: { includeDeleted?: boolean }): Promise<T[]>;
  get(key: string | number): Promise<T | null>;
  query(filter: Partial<T>): Promise<T[]>;
  count(filter?: Partial<T>): Promise<number>;
  append(row: Omit<T, '_extra'>): Promise<T>;
  upsert(row: Omit<T, '_extra'>): Promise<T>;
  update(key: string | number, patch: Partial<T>): Promise<T>;
  delete(key: string | number, options?: { hard?: boolean }): Promise<void>;
}

// ---- Transaction ----

export interface Transaction {
  table<T>(name: string): Table<T>;
}

// ---- ExcelDB instance ----

export interface ExcelDBInstance<S extends SchemaDefinition> {
  table<T extends keyof S['tables'] & string>(
    name: T
  ): Table<InferRow<S['tables'][T]>>;
  batch(fn: (tx: Transaction) => Promise<void>): Promise<void>;
  migrate(migrations: Migration[]): Promise<void>;
  refresh(): Promise<void>;
  disconnect(): void;
}
