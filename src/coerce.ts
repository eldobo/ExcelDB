import type { ColumnDef } from './types.js';

/**
 * Coerce a raw Excel cell value to a JS value based on column type.
 */
export function coerceFromCell(_value: unknown, _column: ColumnDef): unknown {
  throw new Error('Not implemented');
}

/**
 * Coerce a JS value to a value suitable for an Excel cell.
 */
export function coerceToCell(_value: unknown, _column: ColumnDef): unknown {
  throw new Error('Not implemented');
}
