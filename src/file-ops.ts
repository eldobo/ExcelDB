import type { GraphClient } from './graph-client.js';
import { ExcelDBConflictError } from './errors.js';

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
  client: GraphClient,
  folderPath: string,
  fileName: string,
): Promise<FileMetadata | null> {
  const path = `${folderPath}/${fileName}`.replace(/\/+/g, '/');
  try {
    return await client.get<FileMetadata>(`/me/drive/root:${path}`);
  } catch (err) {
    // 404 → file not found
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'NOT_FOUND') {
      return null;
    }
    // Also check for ExcelDBNotFoundError
    if (err instanceof Error && err.constructor.name === 'ExcelDBNotFoundError') {
      return null;
    }
    throw err;
  }
}

/**
 * Create a new file in OneDrive with the given binary content.
 */
export async function createFile(
  client: GraphClient,
  folderPath: string,
  fileName: string,
  content: ArrayBuffer,
): Promise<FileMetadata> {
  const path = `${folderPath}/${fileName}`.replace(/\/+/g, '/');
  const result = await client.put(`/me/drive/root:${path}:/content`, content);
  return result as unknown as FileMetadata;
}

/**
 * Download a file's content by item ID.
 */
export async function downloadFile(
  client: GraphClient,
  itemId: string,
): Promise<{ data: ArrayBuffer; eTag: string }> {
  return client.getBlob(`/me/drive/items/${itemId}/content`);
}

/**
 * Upload file content with eTag-based conflict detection.
 * Throws ExcelDBConflictError if the file was modified since the given eTag.
 */
export async function uploadFile(
  client: GraphClient,
  itemId: string,
  content: ArrayBuffer,
  eTag: string,
): Promise<{ eTag: string }> {
  try {
    const result = await client.put(`/me/drive/items/${itemId}/content`, content, {
      'If-Match': eTag,
    });
    return { eTag: result.eTag };
  } catch (err) {
    if (err instanceof ExcelDBConflictError) {
      throw err;
    }
    // Re-wrap 412 errors that might not have been caught
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 412) {
      throw new ExcelDBConflictError('File was modified by another client');
    }
    throw err;
  }
}
