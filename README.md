# ExcelDB

A client-side TypeScript library that uses OneDrive-hosted Excel (.xlsx) files as a lightweight backend data store. No server, no database — your users' data lives in their own OneDrive in a format they can open, read, and edit directly in Excel.

## Quick start

```typescript
import { createAuth, connect } from 'exceldb';

const schema = {
  version: 1,
  tables: {
    tasks: {
      columns: {
        id:     { type: 'string', key: true, required: true },
        title:  { type: 'string', required: true },
        done:   { type: 'boolean' },
        due:    { type: 'date' },
      },
    },
  },
} as const;

const auth = createAuth({ clientId: 'your-azure-client-id' });
const db = await connect({ auth, fileName: 'tasks.xlsx', schema });

const tasks = db.table('tasks');
await tasks.append({ id: crypto.randomUUID(), title: 'Ship v1', done: false, due: new Date() });

const all = await tasks.getAll();
```

## How it works

1. User signs in with their Microsoft account (OAuth popup, one-time)
2. ExcelDB creates or opens a `.xlsx` file in their OneDrive
3. Your app reads and writes data through typed CRUD methods
4. The user can open the same file in Excel at any time — ExcelDB preserves their edits

## Prerequisites

- An Azure app registration (free) — see [docs/azure-setup.md](./docs/azure-setup.md)
- A Microsoft personal account (outlook.com, hotmail.com, live.com)

## Features

- Schema-defined tables with TypeScript type inference
- CRUD operations: `getAll`, `get`, `query`, `append`, `upsert`, `update`, `delete`
- Soft delete by default, hard delete when explicit
- Batch/transaction support (multiple ops, single upload)
- Explicit schema migrations with version tracking
- Resilient to direct Excel edits (column reorder, extra columns, manual entries)
- Optimistic conflict detection via ETag

## Documentation

- [Architecture](./docs/architecture.md) — system design, data flow, trade-offs
- [API Reference](./docs/api-reference.md) — full public API with examples
- [Schema Specification](./docs/schema-spec.md) — schema format, types, validation, migrations
- [Graph API Integration](./docs/graph-api-integration.md) — Microsoft Graph endpoints, auth, error handling
- [Azure Setup](./docs/azure-setup.md) — app registration guide

## Local development

```bash
npm install
npm test          # run tests
npm run build     # build library
```

## What ExcelDB does NOT do (v1)

- No formula writing or cell formatting
- No multi-file joins
- No real-time sync or subscriptions
- No query language beyond key lookup and exact-match filtering
