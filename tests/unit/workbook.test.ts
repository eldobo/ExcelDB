import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseWorkbook, createEmptyWorkbook } from '../../src/workbook.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name)).buffer;

describe('parseWorkbook', () => {
  it('reads sheet names from a fixture', () => {
    const wb = parseWorkbook(fixture('sample.xlsx'));
    const names = wb.getSheetNames();
    expect(names).toContain('symptoms');
    expect(names).toContain('regions');
    expect(names).toContain('_exceldb_meta');
  });

  it('hasSheet returns true for existing sheets', () => {
    const wb = parseWorkbook(fixture('sample.xlsx'));
    expect(wb.hasSheet('symptoms')).toBe(true);
    expect(wb.hasSheet('nonexistent')).toBe(false);
  });

  it('reads headers from row 1', () => {
    const wb = parseWorkbook(fixture('sample.xlsx'));
    const { headers } = wb.readSheet('symptoms');
    expect(headers).toEqual(['id', 'date', 'region', 'severity', 'description', '_deleted']);
  });

  it('reads data rows (excluding header)', () => {
    const wb = parseWorkbook(fixture('sample.xlsx'));
    const { rows } = wb.readSheet('symptoms');
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe('s1'); // first row, first column = id
  });

  it('handles reordered columns by reading actual header order', () => {
    const wb = parseWorkbook(fixture('reordered-columns.xlsx'));
    const { headers, rows } = wb.readSheet('symptoms');
    // Headers are in the file's order, not schema order
    expect(headers[0]).toBe('_deleted');
    expect(headers[4]).toBe('id');
    // Data aligns with headers
    expect(rows[0][4]).toBe('s1'); // id column is at index 4
  });

  it('reads extra columns alongside declared columns', () => {
    const wb = parseWorkbook(fixture('extra-columns.xlsx'));
    const { headers } = wb.readSheet('symptoms');
    expect(headers).toContain('doctor_notes');
    expect(headers).toContain('follow_up');
  });
});

describe('createEmptyWorkbook', () => {
  it('creates a workbook with no sheets', () => {
    const wb = createEmptyWorkbook();
    expect(wb.getSheetNames()).toEqual([]);
  });
});

describe('WorkbookHandle.addSheet', () => {
  it('adds a sheet with headers', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('test', ['col1', 'col2', 'col3']);
    expect(wb.hasSheet('test')).toBe(true);
    const { headers, rows } = wb.readSheet('test');
    expect(headers).toEqual(['col1', 'col2', 'col3']);
    expect(rows).toEqual([]);
  });

  it('adds a sheet with headers and initial data', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('test', ['id', 'name'], [['1', 'Alice'], ['2', 'Bob']]);
    const { rows } = wb.readSheet('test');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['1', 'Alice']);
  });
});

describe('WorkbookHandle.writeSheet', () => {
  it('overwrites sheet content', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('test', ['a', 'b']);
    wb.writeSheet('test', ['x', 'y'], [['1', '2']]);
    const { headers, rows } = wb.readSheet('test');
    expect(headers).toEqual(['x', 'y']);
    expect(rows).toEqual([['1', '2']]);
  });
});

describe('WorkbookHandle.deleteSheet', () => {
  it('removes a sheet', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('keep', ['a']);
    wb.addSheet('remove', ['b']);
    wb.deleteSheet('remove');
    expect(wb.hasSheet('remove')).toBe(false);
    expect(wb.hasSheet('keep')).toBe(true);
  });
});

describe('WorkbookHandle.addColumn', () => {
  it('adds a column to the end by default', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('test', ['a', 'b'], [['1', '2']]);
    wb.addColumn('test', 'c');
    const { headers, rows } = wb.readSheet('test');
    expect(headers).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toHaveLength(3);
  });

  it('adds a column after a specific column', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('test', ['a', 'c'], [['1', '3']]);
    wb.addColumn('test', 'b', { after: 'a' });
    const { headers } = wb.readSheet('test');
    expect(headers).toEqual(['a', 'b', 'c']);
  });
});

describe('WorkbookHandle.removeColumn', () => {
  it('removes a column and its data', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('test', ['a', 'b', 'c'], [['1', '2', '3']]);
    wb.removeColumn('test', 'b');
    const { headers, rows } = wb.readSheet('test');
    expect(headers).toEqual(['a', 'c']);
    expect(rows[0]).toEqual(['1', '3']);
  });
});

describe('WorkbookHandle.renameColumn', () => {
  it('renames a column header without changing data', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('test', ['old_name', 'other'], [['val', 'val2']]);
    wb.renameColumn('test', 'old_name', 'new_name');
    const { headers, rows } = wb.readSheet('test');
    expect(headers).toEqual(['new_name', 'other']);
    expect(rows[0]).toEqual(['val', 'val2']);
  });
});

describe('WorkbookHandle.renameSheet', () => {
  it('renames a sheet tab', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('old', ['a']);
    wb.renameSheet('old', 'new');
    expect(wb.hasSheet('old')).toBe(false);
    expect(wb.hasSheet('new')).toBe(true);
  });
});

describe('WorkbookHandle.toBytes round-trip', () => {
  it('serializes and re-parses to produce equivalent data', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('test', ['id', 'name'], [['1', 'Alice'], ['2', 'Bob']]);
    const bytes = wb.toBytes();

    const wb2 = parseWorkbook(bytes);
    const { headers, rows } = wb2.readSheet('test');
    expect(headers).toEqual(['id', 'name']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['1', 'Alice']);
  });
});
