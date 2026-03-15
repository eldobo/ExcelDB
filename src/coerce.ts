import type { ColumnDef } from './types.js';

// Excel epoch: Jan 1, 1900 (with Lotus 1-2-3 leap year bug — serial 60 = Feb 29, 1900 which didn't exist)
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // Dec 30, 1899
const MS_PER_DAY = 86400000;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function excelSerialToDate(serial: number): Date {
  // Adjust for the Lotus 1-2-3 leap year bug (serial 60 = fake Feb 29, 1900)
  const adjusted = serial > 60 ? serial - 1 : serial;
  return new Date(EXCEL_EPOCH_MS + adjusted * MS_PER_DAY);
}

/**
 * Coerce a raw Excel cell value to a JS value based on column type.
 */
export function coerceFromCell(value: unknown, column: ColumnDef): unknown {
  if (isEmpty(value)) {
    return column.default !== undefined ? column.default : null;
  }

  switch (column.type) {
    case 'string': {
      const s = String(value).trim();
      if (s === '') return column.default !== undefined ? column.default : null;
      return s;
    }

    case 'number': {
      if (typeof value === 'number') return value;
      const n = parseFloat(String(value));
      if (Number.isNaN(n)) return null;
      return n;
    }

    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const s = String(value).toLowerCase().trim();
      if (['true', 'yes', '1'].includes(s)) return true;
      if (typeof value === 'number' && value === 1) return true;
      if (['false', 'no', '0'].includes(s)) return false;
      if (typeof value === 'number' && value === 0) return false;
      return null;
    }

    case 'date': {
      if (value instanceof Date) return value;
      if (typeof value === 'number') return excelSerialToDate(value);
      if (typeof value === 'string') {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        return d;
      }
      return null;
    }

    case 'json': {
      if (typeof value === 'object') return value;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Coerce a JS value to a value suitable for an Excel cell.
 */
export function coerceToCell(value: unknown, column: ColumnDef): unknown {
  if (isEmpty(value)) return '';

  switch (column.type) {
    case 'string':
      return String(value);

    case 'number':
      return typeof value === 'number' ? value : '';

    case 'boolean':
      return value === true ? 'TRUE' : value === false ? 'FALSE' : '';

    case 'date':
      return value instanceof Date ? value.toISOString() : '';

    case 'json':
      return JSON.stringify(value);

    default:
      return String(value);
  }
}
