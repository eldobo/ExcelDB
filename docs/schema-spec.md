# Schema Specification

The schema system is ExcelDB's contract between the app developer's code and the user's Excel file. The developer declares the schema in code; ExcelDB enforces it against the live file.

## Schema definition format

A schema is a plain JavaScript/TypeScript object with `as const` for type inference:

```typescript
const schema = {
  version: 1,
  tables: {
    symptoms: {
      columns: {
        id:          { type: 'string', key: true, required: true },
        date:        { type: 'date', required: true },
        region:      { type: 'string', required: true },
        severity:    { type: 'number' },
        description: { type: 'string' },
        tags:        { type: 'json' },
      },
    },
    regions: {
      columns: {
        id:            { type: 'string', key: true, required: true },
        name:          { type: 'string', required: true },
        display_order: { type: 'number' },
      },
    },
  },
} as const;
```

### TypeScript types

```typescript
type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'json';

interface ColumnDef {
  type: ColumnType;
  key?: boolean;        // At most one per table. Used for get(), upsert(), delete().
  required?: boolean;   // Default: false. Required columns reject null/undefined on write.
  default?: unknown;    // Default value when cell is empty on read.
}

interface TableSchema {
  columns: Record<string, ColumnDef>;
}

interface SchemaDefinition {
  version: number;
  tables: Record<string, TableSchema>;
}
```

### Rules

- Each table maps to one Excel sheet with the same name
- Each column maps to a header cell in row 1 of that sheet
- At most one column per table may have `key: true`
- If no key column is defined, `get(key)`, `upsert()`, `update()`, and `delete()` are unavailable on that table (append-only)
- Column names must be valid Excel header strings (no formulas, no leading `=`)
- Table names must be valid Excel sheet names (max 31 chars, no `\ / ? * [ ]`)

## Column types

### `string`

- **Cell → JS:** `String(value).trim()`. Empty cell → `null` (or `default` if specified).
- **JS → Cell:** `String(value)`. `null`/`undefined` → empty cell.

### `number`

- **Cell → JS:** `parseFloat(value)`. If `NaN` → `null` (or `default`). Empty cell → `null`.
- **JS → Cell:** Number value written directly. Excel renders it as a number. `null` → empty cell.

### `boolean`

- **Cell → JS:** Truthy mapping:
  - `true`, `"true"`, `"TRUE"`, `"yes"`, `"YES"`, `"1"`, `1` → `true`
  - `false`, `"false"`, `"FALSE"`, `"no"`, `"NO"`, `"0"`, `0` → `false`
  - Empty cell → `null` (or `default`)
  - Any other value → `null` (with a warning in development mode)
- **JS → Cell:** `true` → `TRUE`, `false` → `FALSE`. `null` → empty cell.

### `date`

- **Cell → JS:** Three input formats handled:
  1. **Excel serial number** (e.g., `45001`): Converted to JS `Date` using the 1900 date system with the Lotus 1-2-3 leap year bug correction
  2. **ISO 8601 string** (e.g., `"2026-03-15"` or `"2026-03-15T10:30:00Z"`): Parsed with `new Date(value)`
  3. **JS Date object** (from SheetJS with `cellDates: true`): Passthrough
  - Empty cell → `null` (or `default`)
  - Invalid date → `null`
- **JS → Cell:** `Date` object → ISO 8601 string (`toISOString()`). Stored as a string in the cell so the value is human-readable in Excel. `null` → empty cell.

### `json`

For storing structured data (arrays, objects) in a single cell.

- **Cell → JS:** If string → `JSON.parse(value)`. If already an object → passthrough. Empty cell → `null`. Parse error → `null` (with warning).
- **JS → Cell:** `JSON.stringify(value)`. `null`/`undefined` → empty cell.

## Reserved columns

ExcelDB automatically manages these columns. They must NOT appear in the developer's schema definition.

### `_deleted`

- Added to every table sheet automatically
- Type: boolean (`TRUE` or empty)
- Used for soft delete — `delete(key)` sets `_deleted = TRUE`
- `getAll()` and `query()` filter out deleted rows by default
- `getAll({ includeDeleted: true })` includes them
- `delete(key, { hard: true })` removes the entire row instead of setting `_deleted`
- If a user manually sets `_deleted = TRUE` in Excel, the row is treated as soft-deleted

## The `_extra` field

When reading a row, any columns present in the sheet but NOT declared in the schema are collected into a `_extra` field:

```typescript
// Schema declares: id, date, region, severity
// Sheet has: id, date, region, severity, doctor_notes (user-added)

const row = await symptoms.get('abc-123');
// row._extra = { doctor_notes: 'Referred to specialist' }
```

Extra columns are:
- **Never deleted** by ExcelDB — they are preserved through all read/write cycles
- **Never validated** — any value is accepted
- **Always returned as strings** — no type coercion (ExcelDB doesn't know the intended type)
- **Writable** — if you include `_extra: { doctor_notes: 'new value' }` in an `update()`, the value is written

## `_exceldb_meta` sheet

A reserved sheet that ExcelDB manages. It stores key-value metadata:

| key | value |
|-----|-------|
| `schema_version` | `1` (integer, matches the schema's `version` field) |
| `created_at` | `2026-03-15T10:00:00.000Z` (ISO 8601, set once on file creation) |
| `last_modified_by` | `ExcelDB` (string, updated on every write) |
| `app_name` | Value from connect options, if provided |

### Rules

- If the file has no `_exceldb_meta` sheet, ExcelDB creates it on first connect (this is how ExcelDB knows the file is "new")
- If `_exceldb_meta` exists but `schema_version` is missing, ExcelDB writes `schema_version = 0` and treats the file as needing migration
- The `schema_version` value must be `<=` the schema's `version` field. If it's less, migrations are needed. If it's greater, ExcelDB throws `ExcelDBSchemaError` ("file schema version is newer than the app — update your app")
- Users should not edit `_exceldb_meta` manually, but if they do, ExcelDB handles it gracefully (re-validates on next connect)

## Schema validation at connect time

When `connect()` is called, ExcelDB validates the live workbook against the declared schema:

### Checks performed

1. **Sheet existence:** Each table name in the schema must have a corresponding sheet in the workbook. Missing sheet → `ExcelDBSchemaError` with the sheet name.

2. **Column existence:** Each declared column must have a matching header in row 1 of the corresponding sheet. Missing column → `ExcelDBSchemaError` with the column name and sheet name.

3. **Key column uniqueness:** Not checked at connect time. Key uniqueness is enforced at write time — `append()` throws `ExcelDBValidationError` if a duplicate key is detected.

4. **Extra sheets:** Sheets not declared in the schema (other than `_exceldb_meta`) are ignored. They are not deleted or modified.

5. **Extra columns:** Columns in a sheet that are not declared in the schema are noted for `_extra` mapping. They are never deleted.

6. **Column order:** Not checked. ExcelDB maps by header name, not by position. Users can reorder columns freely in Excel.

7. **Schema version:** The `_exceldb_meta` sheet's `schema_version` must be `<=` the declared schema's `version`. If less, the app should provide migrations via `connect({ migrations })` (preferred — runs before validation) or call `db.migrate()` after connecting.

### First-run behavior

If the file does not exist in OneDrive:

1. ExcelDB creates a new `.xlsx` file
2. Creates one sheet per table with header rows matching the declared columns (plus `_deleted`)
3. Creates the `_exceldb_meta` sheet with initial metadata
4. Uploads the file to OneDrive

If the file exists but has no `_exceldb_meta` sheet (e.g., a pre-existing Excel file the user wants to use with ExcelDB):

1. ExcelDB creates the `_exceldb_meta` sheet
2. Runs full validation against the declared schema
3. If validation passes, writes `schema_version = <current version>` to meta

## Migrations

Schema changes are handled through explicit, versioned migrations. ExcelDB never auto-migrates.

### Migration format

```typescript
interface Migration {
  version: number;        // Must be sequential: 1, 2, 3, ...
  description: string;    // Human-readable description of the change
  destructive?: boolean;  // Required to be true for drop operations
  up: (workbook: WorkbookHandle) => void;  // Mutation function
}
```

### Running migrations

```typescript
await db.migrate([
  {
    version: 2,
    description: 'Add cause column to symptoms',
    up: (wb) => {
      wb.addColumn('symptoms', 'cause', { after: 'description' });
    },
  },
  {
    version: 3,
    description: 'Remove deprecated notes column',
    destructive: true,
    up: (wb) => {
      wb.removeColumn('symptoms', 'notes');
    },
  },
]);
```

### Migration rules

1. **Sequential versions:** Migration versions must be consecutive integers starting from 1 (or from the current schema version + 1)
2. **Idempotent execution:** `db.migrate()` only runs migrations with `version > current schema_version`. Already-applied migrations are skipped.
3. **Destructive flag:** Any migration that removes data (drop column, drop table/sheet) must have `destructive: true`. Without it, ExcelDB throws `ExcelDBSchemaError` before executing.
4. **Atomic per-migration:** Each migration runs in full or not at all. If a migration's `up()` function throws, the workbook is not uploaded and the version is not bumped.
5. **Upload after all migrations:** All applicable migrations run in sequence on the in-memory workbook, then a single upload is performed. The `schema_version` in `_exceldb_meta` is updated to the highest applied version.
6. **No rollback:** There is no `down()` function. Rolling back means restoring the file from OneDrive's version history (which OneDrive provides automatically).

### Available migration operations

The `WorkbookHandle` passed to `up()` supports:

- `addColumn(sheet, name, options?)` — add a new column header (appended or positioned with `after`)
- `removeColumn(sheet, name)` — remove a column and all its data
- `renameColumn(sheet, oldName, newName)` — rename a column header
- `addSheet(name, headers)` — add a new sheet with the given header row
- `removeSheet(name)` — remove an entire sheet
- `renameSheet(oldName, newName)` — rename a sheet tab
