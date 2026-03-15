import type { GraphClient } from './graph-client.js';

export interface FileMetadata {
  id: string;
  name: string;
  eTag: string;
  size: number;
}

/**
 * Find a file by path in OneDrive.
 * Returns null if not found (404).
 */
export async function findFile(
  _client: GraphClient,
  _folderPath: string,
  _fileName: string,
): Promise<FileMetadata | null> {
  throw new Error('Not implemented');
}

/**
 * Create a new file in OneDrive with the given binary content.
 */
export async function createFile(
  _client: GraphClient,
  _folderPath: string,
  _fileName: string,
  _content: ArrayBuffer,
): Promise<FileMetadata> {
  throw new Error('Not implemented');
}

/**
 * Download a file's content by item ID.
 */
export async function downloadFile(
  _client: GraphClient,
  _itemId: string,
): Promise<{ data: ArrayBuffer; eTag: string }> {
  throw new Error('Not implemented');
}

/**
 * Upload file content with eTag-based conflict detection.
 * Throws ExcelDBConflictError if the file was modified since the given eTag.
 */
export async function uploadFile(
  _client: GraphClient,
  _itemId: string,
  _content: ArrayBuffer,
  _eTag: string,
): Promise<{ eTag: string }> {
  throw new Error('Not implemented');
}
