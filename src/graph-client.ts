import type { AuthProvider } from './types.js';

export interface GraphClient {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  getBlob(path: string): Promise<{ data: ArrayBuffer; eTag: string }>;
  put(path: string, body: ArrayBuffer, headers?: Record<string, string>): Promise<{ eTag: string }>;
  post<T>(path: string, body: unknown): Promise<T>;
  del(path: string): Promise<void>;
}

/**
 * Create a Graph API client that attaches auth headers and handles errors.
 */
export function createGraphClient(_auth: AuthProvider): GraphClient {
  throw new Error('Not implemented');
}
