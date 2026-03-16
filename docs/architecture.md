# Architecture

ExcelDB is a client-side TypeScript library that uses a OneDrive-hosted `.xlsx` file as a backend data store. No server, no database — the user's data lives in their own OneDrive in a format they can open and edit directly in Excel.

## Why download-modify-upload?

Microsoft's Graph Excel workbook API (`/workbook/` endpoints with sessions, ranges, and tables) **does not support personal OneDrive accounts** — only OneDrive for Business. Since ExcelDB targets personal Microsoft accounts, we cannot use those endpoints.

Instead, ExcelDB uses the OneDrive **file storage API** (which works on all account types) combined with client-side `.xlsx` parsing:

1. **Download** the file as binary via `GET /me/drive/items/{id}/content`
2. **Parse** the `.xlsx` bytes in memory using SheetJS
3. **Modify** the in-memory workbook (add/update/delete rows)
4. **Upload** the modified file via `PUT /me/drive/items/{id}/content` with `If-Match: {eTag}`

This pattern gives us full control over the file and works identically across personal and business OneDrive accounts.

### Trade-offs

| Benefit | Cost |
|---------|------|
| Works on personal OneDrive accounts | Must download entire file to read one row |
| No session management or timeout complexity | Must upload entire file to write one row |
| Full control over file format | No row-level locking (file-level eTag only) |
| Offline-capable (operate on cached copy) | SheetJS adds ~200KB to bundle |

For the target use case (personal health journal, a few thousand rows, well under 1MB), the download/upload cost is negligible — sub-second on typical connections.

## Module decomposition

```
src/
  index.ts          Public API entry point (connect function)
  types.ts          All TypeScript type definitions
  errors.ts         Custom error classes
  auth.ts           Optional MSAL convenience wrapper + AuthProvider interface
  graph-client.ts   Thin HTTP wrapper over Microsoft Graph API
  file-ops.ts       OneDrive file operations (find, create, download, upload)
  workbook.ts       SheetJS wrapper (parse, read/write sheets, serialize)
  schema.ts         Schema validation and migration logic
  table.ts          Table class with CRUD operations
  batch.ts          Transaction support (accumulate ops, single upload)
  coerce.ts         Type coercion between Excel cells and JS values
```

### Dependency graph

```
index.ts ──→ auth.ts (AuthProvider interface)
         ──→ graph-client.ts ──→ auth.ts (getAccessToken)
         ──→ file-ops.ts ──→ graph-client.ts
         ──→ workbook.ts (standalone, wraps SheetJS)
         ──→ schema.ts ──→ workbook.ts, types.ts
         ──→ table.ts ──→ workbook.ts, coerce.ts, types.ts
         ──→ batch.ts ──→ table.ts, file-ops.ts

errors.ts ← used by all modules
types.ts  ← used by all modules
coerce.ts ← used by table.ts
```

Key boundary: **`graph-client.ts` and everything below it are the only modules that make network calls.** Everything above operates on in-memory data structures.

## Data flow

### Connect

```
ExcelDB.connect({ auth, fileName, schema, migrations? })
  │
  ├─ auth.getAccessToken()          → Bearer token
  ├─ file-ops.findFile(fileName)    → GET /me/drive/root:/{path}/{name}
  │   └─ (if 404) file-ops.createFile()  → PUT with initial .xlsx bytes
  ├─ file-ops.downloadFile(itemId)  → GET /me/drive/items/{id}/content → bytes + eTag
  ├─ workbook.parse(bytes)          → in-memory WorkbookHandle
  ├─ (if migrations) schema.applyMigrations(workbook, migrations) → upload if changed
  ├─ schema.validate(workbook, schema) → check sheets, columns, version
  │
  └─ return ExcelDBInstance { table(), batch(), migrate(), disconnect() }
```

### Read path

```
db.table('symptoms').getAll()
  │
  ├─ Check: is workbook loaded in memory?
  │   └─ (if not) download → parse → cache
  ├─ workbook.readSheet('symptoms') → headers + raw rows
  ├─ Map columns by header name (never by index)
  ├─ coerce.fromCell() each value based on column type
  ├─ Filter out rows where _deleted = true (unless includeDeleted)
  ├─ Attach _extra field for any columns not in schema
  │
  └─ return typed T[]
```

Reads are served from the in-memory cache. The workbook is re-downloaded only when:
- First access after `connect()`
- After a `ExcelDBConflictError` (eTag mismatch detected on write)
- Explicit `db.refresh()` call

### Write path

```
db.table('symptoms').append(row)
  │
  ├─ Validate row against schema (required fields, types)
  ├─ coerce.toCell() each value for Excel storage
  ├─ workbook.appendRow('symptoms', values)  → modifies in-memory workbook
  ├─ Mark workbook as dirty
  │
  └─ Flush: workbook.toBytes() → file-ops.uploadFile(bytes, eTag)
       └─ If 412 (eTag mismatch) → throw ExcelDBConflictError
```

In normal (non-batch) mode, each write operation triggers an immediate flush. In batch mode, the flush is deferred until all operations complete.

## Conflict detection

ExcelDB uses **optimistic concurrency** via the OneDrive eTag mechanism:

1. On download, the file's eTag is recorded
2. On upload, the eTag is sent in the `If-Match` header
3. If someone else modified the file since our last download, the upload returns `412 Precondition Failed`
4. ExcelDB surfaces this as `ExcelDBConflictError`

This is file-level, not row-level. For a single-user health journal, conflicts are extremely unlikely — they would only occur if the user edits the file in Excel at the exact same time the app writes to it.

The consuming app is responsible for handling conflicts (re-read and retry, or prompt the user). ExcelDB does not attempt automatic merge.

## File layout

Each schema table maps to one Excel sheet. A reserved `_exceldb_meta` sheet tracks metadata.

```
health_journal.xlsx
  ├─ symptoms          (one sheet per table)
  │    Row 1: id | date | region | severity | description | _deleted
  │    Row 2+: data rows
  ├─ regions           (another table)
  │    Row 1: id | name | display_order | _deleted
  │    Row 2+: data rows
  └─ _exceldb_meta     (reserved, managed by library)
       Row 1: key | value
       Row 2: schema_version | 1
       Row 3: created_at | 2026-03-15T10:00:00Z
       Row 4: last_modified_by | ExcelDB
       Row 5: app_name | HealthJournal
```

Row 1 of each table sheet is always the header row. Column mapping is by header name, never by position — users can reorder columns in Excel freely.

The `_deleted` column is automatically added to every table for soft delete support. It is not declared in the schema; ExcelDB manages it internally.

## Caching strategy

The parsed workbook is held in memory for the lifetime of the connection:

- **First read** triggers a download + parse
- **Subsequent reads** serve from cache (no network)
- **Writes** modify the in-memory workbook, then upload the full file
- **eTag** is updated after each successful upload
- **Conflict** (412 on upload) invalidates the cache; next operation re-downloads

This means the library is not suitable for scenarios where multiple clients write to the same file simultaneously. It is designed for single-user or small-team use where one client is active at a time.

## Auth architecture

ExcelDB core never imports MSAL. It depends on an `AuthProvider` interface:

```typescript
interface AuthProvider {
  getAccessToken(): Promise<string>;       // Required — used by connect() for all Graph API calls
  login?(): Promise<void>;                 // Optional — trigger interactive login
  logout?(): Promise<void>;                // Optional — clear auth state
  isAuthenticated?(): boolean;             // Optional — sync check (unreliable before MSAL init)
  isAuthenticatedAsync?(): Promise<boolean>; // Optional — async check (reliable for SSO)
}
```

The library provides an optional `createAuth()` convenience function that wraps MSAL.js:

```typescript
// Simple: let ExcelDB handle auth
import { createAuth, connect } from 'exceldb';

const auth = createAuth({
  clientId: 'your-azure-app-client-id',
  // authority defaults to 'https://login.microsoftonline.com/consumers'
  // redirectUri defaults to window.location.origin
  // scopes defaults to ['Files.ReadWrite', 'User.Read']
});

const db = await connect({ auth, fileName: 'journal.xlsx', schema });
```

```typescript
// Advanced: bring your own token
const db = await connect({
  auth: { getAccessToken: () => myExistingMsalInstance.acquireTokenSilent(...).then(r => r.accessToken) },
  fileName: 'journal.xlsx',
  schema,
});
```

This separation means:
- Core library has **zero** MSAL dependency
- `createAuth()` is a standalone module that imports `@azure/msal-browser`
- Consuming apps that already have MSAL can pass their own token provider
- The auth module can be swapped for other OAuth providers if needed

## Platform considerations

The library is platform-agnostic. It requires:
- A JavaScript runtime with `fetch` (browser, Node 18+, React Native, Tauri, Capacitor)
- The SheetJS library (bundled, no external dependency for consumers)

For the consuming Health Journal app (separate repo):
- **Desktop (Windows, macOS):** React + Vite in browser, or wrapped with Tauri for a native window
- **iPhone:** React + Vite wrapped with Capacitor as a native iOS app
- **Auth:** MSAL.js via `createAuth()` works in all contexts (browser, Capacitor WebView, Tauri WebView)

## Explicit v1 non-goals

These are intentionally out of scope for the first version:

- **No formula writing** — ExcelDB reads and writes cell values only
- **No cell formatting** — colors, fonts, borders are not touched (but are preserved by SheetJS during round-trip)
- **No multi-file joins** — one file, one schema
- **No real-time sync/subscriptions** — poll or refresh manually
- **No query language** — only key lookup and exact-match field filtering
- **No streaming/pagination** — entire sheet is loaded into memory
- **No multi-user conflict resolution** — file-level eTag only, no merge
