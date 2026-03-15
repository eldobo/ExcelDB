import type { AuthProvider } from './types.js';
import { ExcelDBAuthError, ExcelDBConflictError, ExcelDBNotFoundError } from './errors.js';

export interface GraphClient {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  getBlob(path: string): Promise<{ data: ArrayBuffer; eTag: string }>;
  put(path: string, body: ArrayBuffer, headers?: Record<string, string>): Promise<{ eTag: string; [key: string]: unknown }>;
  post<T>(path: string, body: unknown): Promise<T>;
  del(path: string): Promise<void>;
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Retry once on 429 (throttled)
    if (err instanceof GraphHttpError && err.status === 429) {
      const retryAfter = err.retryAfterMs ?? 1000;
      await new Promise(r => setTimeout(r, retryAfter));
      return fn();
    }
    throw err;
  }
}

class GraphHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

function mapError(status: number, message: string): Error {
  switch (status) {
    case 401:
      return new ExcelDBAuthError(message);
    case 404:
      return new ExcelDBNotFoundError(message);
    case 409:
    case 412:
      return new ExcelDBConflictError(message);
    default:
      return new Error(`Graph API error ${status}: ${message}`);
  }
}

/**
 * Create a Graph API client that attaches auth headers and handles errors.
 */
export function createGraphClient(auth: AuthProvider): GraphClient {
  async function request(
    method: string,
    path: string,
    body?: ArrayBuffer | string | null,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const token = await auth.getAccessToken();
    const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
    });

    if (!res.ok) {
      const retryAfter = res.headers.get('Retry-After');
      const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;

      if (res.status === 429) {
        throw new GraphHttpError(res.status, 'Rate limited', retryMs);
      }

      const text = await res.text().catch(() => '');
      throw mapError(res.status, text);
    }

    return res;
  }

  return {
    async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
      return withRetry(async () => {
        const res = await request('GET', path, null, headers);
        return res.json() as Promise<T>;
      });
    },

    async getBlob(path: string): Promise<{ data: ArrayBuffer; eTag: string }> {
      return withRetry(async () => {
        // First get metadata for eTag
        const metaPath = path.replace('/content', '');
        const metaRes = await request('GET', metaPath);
        const meta = await metaRes.json() as { eTag: string };

        // Then download content
        const res = await request('GET', path);
        const data = await res.arrayBuffer();
        return { data, eTag: meta.eTag };
      });
    },

    async put(path: string, body: ArrayBuffer, headers?: Record<string, string>): Promise<{ eTag: string; [key: string]: unknown }> {
      return withRetry(async () => {
        const res = await request('PUT', path, body, {
          'Content-Type': 'application/octet-stream',
          ...headers,
        });
        const json = await res.json() as { eTag: string; [key: string]: unknown };
        return json;
      });
    },

    async post<T>(path: string, body: unknown): Promise<T> {
      return withRetry(async () => {
        const res = await request('POST', path, JSON.stringify(body), {
          'Content-Type': 'application/json',
        });
        return res.json() as Promise<T>;
      });
    },

    async del(path: string): Promise<void> {
      await withRetry(async () => {
        await request('DELETE', path);
      });
    },
  };
}
