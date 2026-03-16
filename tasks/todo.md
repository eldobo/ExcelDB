# ExcelDB — TODO

Implementation gaps found during docs audit (2026-03-15). Docs were updated to match current behavior; these track the originally intended behaviors.

## Query & filtering

- [ ] **Date comparison in `query()`** — Currently uses strict `!==`, so two `Date` objects for the same day never match. Intended: compare by day-level ISO string (`toISOString().slice(0, 10)`). Affects `table.ts` `query()` method.

## Error handling & resilience

- [ ] **401 retry with token refresh** — Currently throws `ExcelDBAuthError` immediately on 401. Intended: re-acquire token via `getAccessToken()`, retry once, then throw. Affects `graph-client.ts` `withRetry()`.

- [ ] **`upsert()` without key column** — Currently falls through to `append()` silently. Intended: throw `ExcelDBError` if no key column is defined. Affects `table.ts` `upsert()`.

- [ ] **Schema version > app version check** — `validateSchema()` does not check `schema_version` against the declared schema version. The check only runs inside `applyMigrations()`. Intended: `validateSchema()` should throw `ExcelDBSchemaError` if file version > app version. Affects `schema.ts`.

## Data integrity

- [ ] **`batch()` fresh download** — Currently snapshots the in-memory workbook. Intended: re-download from OneDrive before batching to reduce stale-data writes. Affects `index.ts` `batch()` and `batch.ts`.

- [ ] **`disconnect()` cleanup** — Currently a no-op. Intended: null out the workbook reference so subsequent operations throw. Affects `index.ts` `disconnect()`.

- [ ] **`_extra` writable via `update()`** — Currently extra columns are ignored on write. Intended: if `_extra` is included in a patch, write those values to the corresponding columns. Affects `table.ts` `update()`.

## Type coercion

- [ ] **`default` on invalid values** — `default` only applies when a cell is empty. For `number` (NaN), `boolean` (unrecognized), and `date` (invalid), the code returns `null` instead of the column's `default`. Intended: fall back to `default` for any unparseable value. Affects `coerce.ts` `coerceFromCell()`.
