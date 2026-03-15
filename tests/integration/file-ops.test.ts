import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createGraphClient } from '../../src/graph-client.js';
import { findFile, createFile, downloadFile, uploadFile } from '../../src/file-ops.js';
import type { AuthProvider } from '../../src/types.js';
import { ExcelDBConflictError, ExcelDBNotFoundError } from '../../src/errors.js';

// Mock auth provider
const mockAuth: AuthProvider = {
  getAccessToken: async () => 'mock-token-123',
};

// MSW handlers
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const handlers = [
  // Find file — found
  http.get(`${GRAPH_BASE}/me/drive/root\\:/Apps/TestApp/test.xlsx`, () => {
    return HttpResponse.json({
      id: 'item-abc',
      name: 'test.xlsx',
      eTag: '"etag-v1"',
      size: 1234,
      file: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    });
  }),

  // Find file — not found
  http.get(`${GRAPH_BASE}/me/drive/root\\:/Apps/TestApp/missing.xlsx`, () => {
    return new HttpResponse(null, { status: 404 });
  }),

  // Create file
  http.put(`${GRAPH_BASE}/me/drive/root\\:/Apps/TestApp/new.xlsx\\:/content`, () => {
    return HttpResponse.json({
      id: 'item-new',
      name: 'new.xlsx',
      eTag: '"etag-new"',
      size: 500,
    }, { status: 201 });
  }),

  // Download file
  http.get(`${GRAPH_BASE}/me/drive/items/item-abc/content`, () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK header (zip/xlsx)
    return new HttpResponse(bytes, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }),

  // Get item metadata (for eTag)
  http.get(`${GRAPH_BASE}/me/drive/items/item-abc`, () => {
    return HttpResponse.json({
      id: 'item-abc',
      name: 'test.xlsx',
      eTag: '"etag-v1"',
      size: 1234,
    });
  }),

  // Upload file — success
  http.put(`${GRAPH_BASE}/me/drive/items/item-abc/content`, ({ request }) => {
    const ifMatch = request.headers.get('If-Match');
    if (ifMatch === '"etag-v1"') {
      return HttpResponse.json({
        id: 'item-abc',
        eTag: '"etag-v2"',
      });
    }
    // ETag mismatch
    return new HttpResponse(null, { status: 412 });
  }),
];

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('findFile', () => {
  it('returns file metadata when found', async () => {
    const client = createGraphClient(mockAuth);
    const result = await findFile(client, '/Apps/TestApp', 'test.xlsx');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('item-abc');
    expect(result!.eTag).toBe('"etag-v1"');
  });

  it('returns null when file not found', async () => {
    const client = createGraphClient(mockAuth);
    const result = await findFile(client, '/Apps/TestApp', 'missing.xlsx');
    expect(result).toBeNull();
  });
});

describe('createFile', () => {
  it('creates a file and returns metadata', async () => {
    const client = createGraphClient(mockAuth);
    const content = new ArrayBuffer(10);
    const result = await createFile(client, '/Apps/TestApp', 'new.xlsx', content);
    expect(result.id).toBe('item-new');
    expect(result.eTag).toBe('"etag-new"');
  });
});

describe('downloadFile', () => {
  it('downloads file content', async () => {
    const client = createGraphClient(mockAuth);
    const result = await downloadFile(client, 'item-abc');
    expect(result.data).toBeInstanceOf(ArrayBuffer);
    expect(result.eTag).toBe('"etag-v1"');
  });
});

describe('uploadFile', () => {
  it('uploads with matching eTag', async () => {
    const client = createGraphClient(mockAuth);
    const content = new ArrayBuffer(10);
    const result = await uploadFile(client, 'item-abc', content, '"etag-v1"');
    expect(result.eTag).toBe('"etag-v2"');
  });

  it('throws ExcelDBConflictError on eTag mismatch', async () => {
    const client = createGraphClient(mockAuth);
    const content = new ArrayBuffer(10);
    await expect(
      uploadFile(client, 'item-abc', content, '"stale-etag"'),
    ).rejects.toThrow(ExcelDBConflictError);
  });
});
