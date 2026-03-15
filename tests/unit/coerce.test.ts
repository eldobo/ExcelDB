import { describe, it, expect } from 'vitest';
import { coerceFromCell, coerceToCell } from '../../src/coerce.js';
import type { ColumnDef } from '../../src/types.js';

// Helper to create a ColumnDef shorthand
const col = (type: ColumnDef['type'], opts: Partial<ColumnDef> = {}): ColumnDef => ({ type, ...opts });

describe('coerceFromCell', () => {
  describe('string', () => {
    it('converts number to string', () => {
      expect(coerceFromCell(42, col('string'))).toBe('42');
    });

    it('trims whitespace', () => {
      expect(coerceFromCell('  hello  ', col('string'))).toBe('hello');
    });

    it('returns null for empty string', () => {
      expect(coerceFromCell('', col('string'))).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(coerceFromCell(undefined, col('string'))).toBeNull();
    });

    it('returns null for null', () => {
      expect(coerceFromCell(null, col('string'))).toBeNull();
    });

    it('returns default when value is empty and default is set', () => {
      expect(coerceFromCell('', col('string', { default: 'N/A' }))).toBe('N/A');
    });
  });

  describe('number', () => {
    it('passes through numbers', () => {
      expect(coerceFromCell(42, col('number'))).toBe(42);
    });

    it('parses numeric strings', () => {
      expect(coerceFromCell('3.14', col('number'))).toBeCloseTo(3.14);
    });

    it('returns null for NaN strings', () => {
      expect(coerceFromCell('not-a-number', col('number'))).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(coerceFromCell('', col('number'))).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(coerceFromCell(undefined, col('number'))).toBeNull();
    });

    it('returns default when value is empty and default is set', () => {
      expect(coerceFromCell('', col('number', { default: 0 }))).toBe(0);
    });

    it('handles zero correctly', () => {
      expect(coerceFromCell(0, col('number'))).toBe(0);
    });

    it('handles "0" string correctly', () => {
      expect(coerceFromCell('0', col('number'))).toBe(0);
    });
  });

  describe('boolean', () => {
    it('passes through true', () => {
      expect(coerceFromCell(true, col('boolean'))).toBe(true);
    });

    it('passes through false', () => {
      expect(coerceFromCell(false, col('boolean'))).toBe(false);
    });

    it.each([
      ['true', true],
      ['TRUE', true],
      ['yes', true],
      ['YES', true],
      ['1', true],
      [1, true],
      ['false', false],
      ['FALSE', false],
      ['no', false],
      ['NO', false],
      ['0', false],
      [0, false],
    ])('coerces %s to %s', (input, expected) => {
      expect(coerceFromCell(input, col('boolean'))).toBe(expected);
    });

    it('returns null for empty string', () => {
      expect(coerceFromCell('', col('boolean'))).toBeNull();
    });

    it('returns null for unrecognized values', () => {
      expect(coerceFromCell('maybe', col('boolean'))).toBeNull();
    });
  });

  describe('date', () => {
    it('parses ISO date string', () => {
      const result = coerceFromCell('2026-03-15', col('date'));
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).toISOString()).toContain('2026-03-15');
    });

    it('parses ISO datetime string', () => {
      const result = coerceFromCell('2026-03-15T10:30:00Z', col('date'));
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).toISOString()).toBe('2026-03-15T10:30:00.000Z');
    });

    it('converts Excel serial number to Date', () => {
      // Excel serial 46068 = 2026-03-15 (1900 date system)
      const result = coerceFromCell(46068, col('date'));
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).getFullYear()).toBe(2026);
    });

    it('passes through Date objects', () => {
      const d = new Date('2026-03-15T00:00:00Z');
      expect(coerceFromCell(d, col('date'))).toEqual(d);
    });

    it('returns null for empty string', () => {
      expect(coerceFromCell('', col('date'))).toBeNull();
    });

    it('returns null for invalid date string', () => {
      expect(coerceFromCell('not-a-date', col('date'))).toBeNull();
    });
  });

  describe('json', () => {
    it('parses JSON string to array', () => {
      expect(coerceFromCell('["a","b"]', col('json'))).toEqual(['a', 'b']);
    });

    it('parses JSON string to object', () => {
      expect(coerceFromCell('{"key":"value"}', col('json'))).toEqual({ key: 'value' });
    });

    it('passes through objects', () => {
      const obj = { key: 'value' };
      expect(coerceFromCell(obj, col('json'))).toEqual(obj);
    });

    it('passes through arrays', () => {
      const arr = [1, 2, 3];
      expect(coerceFromCell(arr, col('json'))).toEqual(arr);
    });

    it('returns null for empty string', () => {
      expect(coerceFromCell('', col('json'))).toBeNull();
    });

    it('returns null for invalid JSON string', () => {
      expect(coerceFromCell('invalid json{', col('json'))).toBeNull();
    });

    it('parses "null" string as null', () => {
      expect(coerceFromCell('null', col('json'))).toBeNull();
    });
  });
});

describe('coerceToCell', () => {
  describe('string', () => {
    it('converts to string', () => {
      expect(coerceToCell('hello', col('string'))).toBe('hello');
    });

    it('converts number to string', () => {
      expect(coerceToCell(42, col('string'))).toBe('42');
    });

    it('returns empty for null', () => {
      expect(coerceToCell(null, col('string'))).toBe('');
    });
  });

  describe('number', () => {
    it('passes through numbers', () => {
      expect(coerceToCell(42, col('number'))).toBe(42);
    });

    it('returns empty for null', () => {
      expect(coerceToCell(null, col('number'))).toBe('');
    });
  });

  describe('boolean', () => {
    it('converts true to TRUE', () => {
      expect(coerceToCell(true, col('boolean'))).toBe('TRUE');
    });

    it('converts false to FALSE', () => {
      expect(coerceToCell(false, col('boolean'))).toBe('FALSE');
    });

    it('returns empty for null', () => {
      expect(coerceToCell(null, col('boolean'))).toBe('');
    });
  });

  describe('date', () => {
    it('converts Date to ISO string', () => {
      const d = new Date('2026-03-15T10:30:00.000Z');
      expect(coerceToCell(d, col('date'))).toBe('2026-03-15T10:30:00.000Z');
    });

    it('returns empty for null', () => {
      expect(coerceToCell(null, col('date'))).toBe('');
    });
  });

  describe('json', () => {
    it('stringifies arrays', () => {
      expect(coerceToCell(['a', 'b'], col('json'))).toBe('["a","b"]');
    });

    it('stringifies objects', () => {
      expect(coerceToCell({ key: 'value' }, col('json'))).toBe('{"key":"value"}');
    });

    it('returns empty for null', () => {
      expect(coerceToCell(null, col('json'))).toBe('');
    });
  });
});
