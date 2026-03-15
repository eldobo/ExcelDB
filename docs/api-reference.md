# API Reference

## `createAuth(options)`

Convenience function that wraps MSAL.js and returns an `AuthProvider`. Optional — you can provide your own token provider instead.

```typescript
import { createAuth } from 'exceldb';

const auth = createAuth({
  clientId: 'your-azure-app-client-id',
  authority: 'https://login.microsoftonline.com/consumers',  // default
  redirectUri: window.location.origin,                        // default
  scopes: ['Files.ReadWrite'],                                // default
});
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `clientId` | `string` | Yes | — | Azure app registration client ID |
| `authority` | `string` | No | `https://login.microsoftonline.com/consumers` | MSAL authority URL |
| `redirectUri` | `string` | No | `window.location.origin` | OAuth redirect URI |
| `scopes` | `string[]` | No | `['Files.ReadWrite']` | Microsoft Graph permission scopes |

### Returns: `AuthProvider`

```typescript
interface AuthProvider {
  getAccessToken(): Promise<string>;
  login(): Promise<void>;
  logout(): Promise<void>;
  isAuthenticated(): boolean;
}
```

- `getAccessToken()` — acquires a token silently from cache. If the cached token is expired, refreshes it automatically. If no cached token exists, triggers an interactive login (popup).
- `login()` — explicitly triggers the Microsoft login popup. Call this in response to a user gesture (button click) to avoid popup blockers.
- `logout()` — clears the MSAL cache and signs out.
- `isAuthenticated()` — returns `true` if a cached token or account exists.

### Bring your own token

If your app already manages MSAL or uses a different auth provider, pass any object implementing `AuthProvider`:

```typescript
const db = await connect({
  auth: {
    getAccessToken: async () => {
      const result = await myMsalInstance.acquireTokenSilent({
        scopes: ['Files.ReadWrite'],
      });
      return result.accessToken;
    },
  },
  fileName: 'journal.xlsx',
  schema,
});
```

Only `getAccessToken()` is required for `connect()`. The `login()`, `logout()`, and `isAuthenticated()` methods are only needed if the consuming app wants to manage the auth UI.

---

## `connect(options)`

Authenticates, opens or creates the Excel file, validates the schema, and returns a database instance.

```typescript
import { connect } from 'exceldb';

const db = await connect({
  auth,
  fileName: 'health_journal.xlsx',
  schema,
  folderPath: '/Apps/HealthJournal',
});
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `auth` | `AuthProvider` | Yes | — | Token provider (from `createAuth()` or custom) |
| `fileName` | `string` | Yes | — | Name of the `.xlsx` file in OneDrive |
| `schema` | `SchemaDefinition` | Yes | — | Schema definition (see [Schema Spec](./schema-spec.md)) |
| `folderPath` | `string` | No | `/` (root) | OneDrive folder path where the file lives |
| `appName` | `string` | No | — | App name stored in `_exceldb_meta` |

### Behavior

1. Calls `auth.getAccessToken()` to obtain a Bearer token
2. Searches OneDrive for the file at `{folderPath}/{fileName}`
3. If the file doesn't exist, creates a new `.xlsx` with sheets matching the schema (header rows, `_exceldb_meta`)
4. Downloads the file and parses it in memory
5. Validates the live workbook structure against the declared schema (see [Schema Spec — Validation](./schema-spec.md#schema-validation-at-connect-time))
6. Returns an `ExcelDBInstance`

### Errors

- `ExcelDBAuthError` — token acquisition failed (expired, revoked, no account)
- `ExcelDBSchemaError` — workbook structure doesn't match schema (missing sheets/columns, version mismatch)

### Returns: `ExcelDBInstance`

```typescript
interface ExcelDBInstance<S extends SchemaDefinition> {
  table<T extends keyof S['tables'] & string>(name: T): Table<InferRow<S['tables'][T]>>;
  batch(fn: (tx: Transaction) => Promise<void>): Promise<void>;
  migrate(migrations: Migration[]): Promise<void>;
  refresh(): Promise<void>;
  disconnect(): void;
}
```

---

## `db.table(name)`

Returns a typed `Table<T>` for the named table. The TypeScript type `T` is inferred from the schema definition.

```typescript
const symptoms = db.table('symptoms');
// TypeScript knows the row type based on the schema
```

---

## Table read methods

### `table.getAll(options?)`

Returns all rows from the table.

```typescript
const all = await symptoms.getAll();
const withDeleted = await symptoms.getAll({ includeDeleted: true });
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.includeDeleted` | `boolean` | `false` | Include soft-deleted rows |

Returns: `T[]` — array of typed row objects. Each row includes `_extra: Record<string, unknown>` for any user-added columns not in the schema.

### `table.get(key)`

Returns a single row by its key column value.

```typescript
const row = await symptoms.get('abc-123');
// row is T | null
```

Requires the table to have a column with `key: true` in the schema. Throws `ExcelDBError` if no key column is defined.

Returns: `T | null` — the matching row, or `null` if not found (or soft-deleted).

### `table.query(filter)`

Returns rows matching an exact-match filter on one or more fields.

```typescript
const lumbar = await symptoms.query({ region: 'Lumbar' });
const severe = await symptoms.query({ region: 'Lumbar', severity: 5 });
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `filter` | `Partial<T>` | Object of field-value pairs. All conditions must match (AND). |

Matching rules:
- String comparison is case-sensitive
- Number comparison is strict equality
- Boolean comparison after coercion
- Date comparison by ISO string equality (day-level precision: `toISOString().slice(0, 10)`)
- `null` filter value matches empty cells

Soft-deleted rows are excluded. Returns: `T[]`.

### `table.count(filter?)`

Returns the count of rows matching the filter (or all rows if no filter).

```typescript
const total = await symptoms.count();
const lumbarCount = await symptoms.count({ region: 'Lumbar' });
```

Soft-deleted rows are excluded.

---

## Table write methods

### `table.append(row)`

Inserts a new row at the end of the sheet.

```typescript
const created = await symptoms.append({
  id: crypto.randomUUID(),
  date: new Date(),
  region: 'Lumbar',
  severity: 3,
  description: 'Lower back pain after lifting',
  tags: ['lifting', 'acute'],
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `row` | Row type (without `_extra`) | The row data to insert |

Behavior:
- Validates required fields (throws `ExcelDBValidationError` if missing)
- Coerces values to cell-appropriate types
- If the table has a key column, checks for uniqueness (throws `ExcelDBValidationError` if duplicate)
- Appends the row as a new Excel row after the last existing row
- Uploads the modified file to OneDrive

Returns: `T` — the inserted row (with coerced values and `_extra: {}`).

### `table.upsert(row)`

Inserts the row if the key doesn't exist, or updates the existing row if it does.

```typescript
await symptoms.upsert({
  id: 'abc-123',  // key column
  date: new Date(),
  region: 'Lumbar',
  severity: 4,     // updated from 3
  description: 'Pain worsened',
  tags: ['lifting', 'acute', 'worsening'],
});
```

Requires a key column. Throws `ExcelDBError` if no key column is defined.

Behavior:
- Finds existing row by key value
- If found: updates all fields with the new values (preserves `_extra` columns)
- If not found: appends as a new row
- Validates required fields
- Uploads the modified file

Returns: `T` — the upserted row.

### `table.update(key, patch)`

Partially updates an existing row. Only the specified fields are changed.

```typescript
await symptoms.update('abc-123', {
  severity: 5,
  description: 'Significantly worse',
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string \| number` | Value of the key column |
| `patch` | `Partial<T>` | Fields to update |

Behavior:
- Finds the row by key (throws `ExcelDBNotFoundError` if not found)
- Merges patch into existing row (only specified fields change)
- Validates that required fields are not set to `null`
- Preserves `_extra` columns
- Uploads the modified file

Returns: `T` — the full updated row.

### `table.delete(key, options?)`

Deletes a row by key.

```typescript
// Soft delete (default) — sets _deleted = TRUE
await symptoms.delete('abc-123');

// Hard delete — removes the row entirely
await symptoms.delete('abc-123', { hard: true });
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string \| number` | — | Value of the key column |
| `options.hard` | `boolean` | `false` | If `true`, removes the entire row instead of marking `_deleted` |

Behavior:
- Finds the row by key (throws `ExcelDBNotFoundError` if not found)
- Soft delete: sets the `_deleted` column to `TRUE`
- Hard delete: removes the row from the sheet (subsequent rows shift up)
- Uploads the modified file

Returns: `void`.

---

## `db.batch(fn)`

Executes multiple operations as a single file upload. Without batching, each write triggers its own upload.

```typescript
await db.batch(async (tx) => {
  const symptoms = tx.table('symptoms');
  const regions = tx.table('regions');

  await symptoms.append({ id: '1', date: new Date(), region: 'Lumbar', severity: 3, description: 'Pain', tags: null });
  await symptoms.append({ id: '2', date: new Date(), region: 'GI', severity: 2, description: 'Nausea', tags: null });
  await regions.upsert({ id: 'lumbar', name: 'Lumbar', display_order: 1 });
});
// All three operations result in a single file upload
```

### Behavior

1. Downloads fresh copy of the file (if not already cached)
2. Creates a `Transaction` — all operations within the callback modify the in-memory workbook but do NOT upload
3. On callback completion: serializes the workbook and uploads with eTag check
4. On callback error: discards all in-memory changes (rollback)
5. On upload conflict (412): throws `ExcelDBConflictError` — no changes are persisted

The `tx.table()` method returns table instances that behave identically to `db.table()` except that writes are deferred.

---

## `db.migrate(migrations)`

Applies schema migrations. See [Schema Spec — Migrations](./schema-spec.md#migrations) for full details.

```typescript
await db.migrate([
  {
    version: 2,
    description: 'Add outcome column to symptoms',
    up: (wb) => {
      wb.addColumn('symptoms', 'outcome', { after: 'description' });
    },
  },
]);
```

Behavior:
- Reads current `schema_version` from `_exceldb_meta`
- Skips migrations with `version <= current`
- Runs remaining migrations in order on the in-memory workbook
- Uploads the modified file with updated `schema_version`
- Re-validates the schema after migration

---

## `db.refresh()`

Forces a re-download of the file from OneDrive, replacing the in-memory cache.

```typescript
await db.refresh();
```

Use this after catching `ExcelDBConflictError` to get the latest version of the file before retrying.

---

## `db.disconnect()`

Cleans up the in-memory workbook and any cached state. Does not affect the file in OneDrive.

```typescript
db.disconnect();
```

After calling `disconnect()`, all table operations will throw. Call `connect()` again to re-establish the connection.

---

## Error classes

All errors extend `ExcelDBError`, which extends `Error`.

| Error | Code | When thrown |
|-------|------|------------|
| `ExcelDBError` | `EXCELDB_ERROR` | Base class for all ExcelDB errors |
| `ExcelDBAuthError` | `AUTH_ERROR` | Token acquisition failed, login required, or 401 from Graph API |
| `ExcelDBConflictError` | `CONFLICT` | ETag mismatch on upload (file modified by someone else since last read) |
| `ExcelDBSchemaError` | `SCHEMA_ERROR` | Workbook structure doesn't match schema, version mismatch, or migration error |
| `ExcelDBNotFoundError` | `NOT_FOUND` | File not found in OneDrive, or row not found by key |
| `ExcelDBValidationError` | `VALIDATION_ERROR` | Row fails validation (missing required field, duplicate key, type mismatch) |

All errors include:
- `message` — human-readable description
- `code` — machine-readable code string (see table)
- `cause` — original error, if wrapping another error (e.g., the HTTP response for Graph API errors)

---

## Full usage example

```typescript
import { createAuth, connect } from 'exceldb';

// 1. Define schema
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
  },
} as const;

// 2. Authenticate
const auth = createAuth({ clientId: 'your-client-id' });

// 3. Connect
const db = await connect({
  auth,
  fileName: 'health_journal.xlsx',
  folderPath: '/Apps/HealthJournal',
  schema,
  appName: 'HealthJournal',
});

// 4. Use typed table
const symptoms = db.table('symptoms');

// Append
const entry = await symptoms.append({
  id: crypto.randomUUID(),
  date: new Date(),
  region: 'Lumbar',
  severity: 3,
  description: 'Lower back pain after lifting',
  tags: ['lifting', 'acute'],
});

// Read
const all = await symptoms.getAll();
const one = await symptoms.get(entry.id);
const lumbar = await symptoms.query({ region: 'Lumbar' });

// Update
await symptoms.update(entry.id, { severity: 4 });

// Delete
await symptoms.delete(entry.id);           // soft
await symptoms.delete(entry.id, { hard: true }); // hard

// Batch
await db.batch(async (tx) => {
  const t = tx.table('symptoms');
  await t.append({ id: crypto.randomUUID(), date: new Date(), region: 'GI', severity: 2, description: 'Nausea', tags: null });
  await t.append({ id: crypto.randomUUID(), date: new Date(), region: 'GI', severity: 1, description: 'Bloating', tags: null });
});

// Handle conflicts
try {
  await symptoms.append({ /* ... */ });
} catch (e) {
  if (e instanceof ExcelDBConflictError) {
    await db.refresh();
    // Retry the operation
  }
}

// Disconnect
db.disconnect();
```

---

## Type inference

When the schema is declared with `as const`, TypeScript infers the row types automatically:

```typescript
const schema = {
  version: 1,
  tables: {
    symptoms: {
      columns: {
        id:       { type: 'string', key: true, required: true },
        severity: { type: 'number' },
        active:   { type: 'boolean', required: true },
      },
    },
  },
} as const;

const db = await connect({ auth, fileName: 'f.xlsx', schema });
const symptoms = db.table('symptoms');

// TypeScript infers:
// symptoms.getAll() → Promise<{
//   id: string;            // required string → string (not null)
//   severity: number | null;  // optional number → number | null
//   active: boolean;        // required boolean → boolean (not null)
//   _extra?: Record<string, unknown>;
// }[]>
```

The generic magic: `InferRow<TableSchema>` maps each column definition to its TypeScript type. `required: true` removes `null` from the union. `_extra` is always optional.

Without `as const`, TypeScript widens `'string'` to `string`, and the generic inference breaks. The `as const` assertion is required.
