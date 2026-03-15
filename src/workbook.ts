import type { WorkbookHandle } from './types.js';

/**
 * Parse raw .xlsx bytes into a WorkbookHandle.
 */
export function parseWorkbook(_bytes: ArrayBuffer): WorkbookHandle {
  throw new Error('Not implemented');
}

/**
 * Create a new empty workbook.
 */
export function createEmptyWorkbook(): WorkbookHandle {
  throw new Error('Not implemented');
}
