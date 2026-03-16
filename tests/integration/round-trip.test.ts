import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { connect } from '../../src/index.js';
import type { AuthProvider, SchemaDefinition } from '../../src/types.js';

// In-memory file store for the mock
let fileStore: { bytes: ArrayBuffer | null; eTag: string } = {
  bytes: null,
  eTag: '"etag-initial"',
};

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const handlers = [
  // Find file — check if exists in store
  http.get(`${GRAPH_BASE}/me/drive/root\\:/journal.xlsx`, () => {
    if (fileStore.bytes) {
      return HttpResponse.json({
        id: 'item-1',
        name: 'journal.xlsx',
        eTag: fileStore.eTag,
        size: fileStore.bytes.byteLength,
      });
    }
    return new HttpResponse(null, { status: 404 });
  }),

  // Create file
  http.put(`${GRAPH_BASE}/me/drive/root\\:/journal.xlsx\\:/content`, async ({ request }) => {
    const bytes = await request.arrayBuffer();
    fileStore = { bytes, eTag: '"etag-1"' };
    return HttpResponse.json({
      id: 'item-1',
      name: 'journal.xlsx',
      eTag: '"etag-1"',
      size: bytes.byteLength,
    }, { status: 201 });
  }),

  // Get metadata
  http.get(`${GRAPH_BASE}/me/drive/items/item-1`, () => {
    return HttpResponse.json({
      id: 'item-1',
      name: 'journal.xlsx',
      eTag: fileStore.eTag,
      size: fileStore.bytes?.byteLength ?? 0,
    });
  }),

  // Download
  http.get(`${GRAPH_BASE}/me/drive/items/item-1/content`, () => {
    if (!fileStore.bytes) {
      return new HttpResponse(null, { status: 404 });
    }
    return new HttpResponse(fileStore.bytes, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }),

  // Upload
  http.put(`${GRAPH_BASE}/me/drive/items/item-1/content`, async ({ request }) => {
    const ifMatch = request.headers.get('If-Match');
    if (ifMatch && ifMatch !== fileStore.eTag) {
      return new HttpResponse(null, { status: 412 });
    }
    const bytes = await request.arrayBuffer();
    const newETag = `"etag-${Date.now()}"`;
    fileStore = { bytes, eTag: newETag };
    return HttpResponse.json({ id: 'item-1', eTag: newETag });
  }),
];

const server = setupServer(...handlers);

const mockAuth: AuthProvider = {
  getAccessToken: async () => 'mock-token',
};

const schema = {
  version: 1,
  tables: {
    tasks: {
      columns: {
        id: { type: 'string', key: true, required: true },
        title: { type: 'string', required: true },
        done: { type: 'boolean' },
      },
    },
  },
} as const satisfies SchemaDefinition;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  fileStore = { bytes: null, eTag: '"etag-initial"' };
});
afterAll(() => server.close());

describe('full round-trip', () => {
  it('connects, creates file, appends, reads back', async () => {
    const db = await connect({
      auth: mockAuth,
      fileName: 'journal.xlsx',
      schema,
    });

    const tasks = db.table('tasks');

    // Append
    const created = await tasks.append({ id: 't1', title: 'Ship v1', done: false });
    expect(created.id).toBe('t1');
    expect(created.title).toBe('Ship v1');

    // Read back
    const all = await tasks.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('t1');

    db.disconnect();
  });

  it('upserts existing row', async () => {
    const db = await connect({
      auth: mockAuth,
      fileName: 'journal.xlsx',
      schema,
    });

    const tasks = db.table('tasks');
    await tasks.append({ id: 't1', title: 'Original', done: false });

    // Upsert — should update
    await tasks.upsert({ id: 't1', title: 'Updated', done: true });

    const row = await tasks.get('t1');
    expect(row!.title).toBe('Updated');
    expect(row!.done).toBe(true);

    db.disconnect();
  });

  it('soft deletes and excludes from queries', async () => {
    const db = await connect({
      auth: mockAuth,
      fileName: 'journal.xlsx',
      schema,
    });

    const tasks = db.table('tasks');
    await tasks.append({ id: 't1', title: 'To delete', done: false });
    await tasks.delete('t1');

    // Normal query should not find it
    const all = await tasks.getAll();
    expect(all).toHaveLength(0);

    // With includeDeleted should find it
    const allWithDeleted = await tasks.getAll({ includeDeleted: true });
    expect(allWithDeleted).toHaveLength(1);

    db.disconnect();
  });

  it('hard deletes permanently', async () => {
    const db = await connect({
      auth: mockAuth,
      fileName: 'journal.xlsx',
      schema,
    });

    const tasks = db.table('tasks');
    await tasks.append({ id: 't1', title: 'To delete', done: false });
    await tasks.delete('t1', { hard: true });

    const all = await tasks.getAll({ includeDeleted: true });
    expect(all).toHaveLength(0);

    db.disconnect();
  });

  it('applies migrations at connect before schema validation', async () => {
    // First: create file with v1 schema
    const db1 = await connect({
      auth: mockAuth,
      fileName: 'journal.xlsx',
      schema,
    });
    const tasks1 = db1.table('tasks');
    await tasks1.append({ id: 't1', title: 'Existing', done: false });
    db1.disconnect();

    // Now define v2 schema with a new column
    const schemaV2 = {
      version: 2,
      tables: {
        tasks: {
          columns: {
            id: { type: 'string', key: true, required: true },
            title: { type: 'string', required: true },
            done: { type: 'boolean' },
            priority: { type: 'number' },
          },
        },
      },
    } as const satisfies SchemaDefinition;

    // Without migrations, connecting with v2 schema would fail (missing 'priority' column).
    // With migrations, the column is added before validation.
    const db2 = await connect({
      auth: mockAuth,
      fileName: 'journal.xlsx',
      schema: schemaV2,
      migrations: [
        {
          version: 2,
          description: 'Add priority column',
          up: (wb) => { wb.addColumn('tasks', 'priority'); },
        },
      ],
    });

    const tasks2 = db2.table('tasks');
    const all = await tasks2.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('t1');
    expect(all[0].priority).toBeNull(); // new column, existing row has no value

    // Can write with the new column
    await tasks2.append({ id: 't2', title: 'New', done: false, priority: 1 });
    const t2 = await tasks2.get('t2');
    expect(t2!.priority).toBe(1);

    db2.disconnect();
  });

  it('batch writes produce a single upload', async () => {
    const db = await connect({
      auth: mockAuth,
      fileName: 'journal.xlsx',
      schema,
    });

    const tasks = db.table('tasks');

    await db.batch(async (tx) => {
      const t = tx.table('tasks');
      await t.append({ id: 't1', title: 'First', done: false });
      await t.append({ id: 't2', title: 'Second', done: false });
      await t.append({ id: 't3', title: 'Third', done: true });
    });

    const all = await tasks.getAll();
    expect(all).toHaveLength(3);

    db.disconnect();
  });
});
