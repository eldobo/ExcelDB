import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseWorkbook, createEmptyWorkbook } from '../../src/workbook.js';
import { validateSchema, initializeWorkbook, applyMigrations, readSchemaVersion } from '../../src/schema.js';
import type { SchemaDefinition, Migration } from '../../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name)).buffer;

const testSchema: SchemaDefinition = {
  version: 1,
  tables: {
    symptoms: {
      columns: {
        id: { type: 'string', key: true, required: true },
        date: { type: 'date', required: true },
        region: { type: 'string', required: true },
        severity: { type: 'number' },
        description: { type: 'string' },
      },
    },
    regions: {
      columns: {
        id: { type: 'string', key: true, required: true },
        name: { type: 'string', required: true },
        display_order: { type: 'number' },
      },
    },
  },
};

describe('validateSchema', () => {
  it('validates a well-formed workbook', () => {
    const wb = parseWorkbook(fixture('sample.xlsx'));
    const result = validateSchema(wb, testSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports missing columns', () => {
    const wb = parseWorkbook(fixture('missing-columns.xlsx'));
    // missing-columns.xlsx lacks the 'severity' column in symptoms
    const schemaWithSeverity: SchemaDefinition = {
      version: 1,
      tables: {
        symptoms: {
          columns: {
            id: { type: 'string', key: true, required: true },
            date: { type: 'date', required: true },
            region: { type: 'string', required: true },
            severity: { type: 'number' },
            description: { type: 'string' },
          },
        },
      },
    };
    const result = validateSchema(wb, schemaWithSeverity);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('severity'))).toBe(true);
  });

  it('reports missing sheets', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('symptoms', ['id', 'date', 'region', 'severity', 'description', '_deleted']);
    // 'regions' sheet is missing
    const result = validateSchema(wb, testSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('regions'))).toBe(true);
  });

  it('tracks extra columns', () => {
    const wb = parseWorkbook(fixture('extra-columns.xlsx'));
    const schemaMinimal: SchemaDefinition = {
      version: 1,
      tables: {
        symptoms: {
          columns: {
            id: { type: 'string', key: true, required: true },
            date: { type: 'date', required: true },
            region: { type: 'string', required: true },
            severity: { type: 'number' },
            description: { type: 'string' },
          },
        },
      },
    };
    const result = validateSchema(wb, schemaMinimal);
    expect(result.valid).toBe(true);
    expect(result.extraColumns['symptoms']).toContain('doctor_notes');
    expect(result.extraColumns['symptoms']).toContain('follow_up');
  });

  it('accepts reordered columns', () => {
    const wb = parseWorkbook(fixture('reordered-columns.xlsx'));
    const schemaMinimal: SchemaDefinition = {
      version: 1,
      tables: {
        symptoms: {
          columns: {
            id: { type: 'string', key: true, required: true },
            date: { type: 'date', required: true },
            region: { type: 'string', required: true },
            severity: { type: 'number' },
            description: { type: 'string' },
          },
        },
      },
    };
    const result = validateSchema(wb, schemaMinimal);
    expect(result.valid).toBe(true);
  });
});

describe('initializeWorkbook', () => {
  it('creates sheets for each table', () => {
    const wb = initializeWorkbook(testSchema, 'TestApp');
    expect(wb.hasSheet('symptoms')).toBe(true);
    expect(wb.hasSheet('regions')).toBe(true);
  });

  it('creates the _exceldb_meta sheet', () => {
    const wb = initializeWorkbook(testSchema, 'TestApp');
    expect(wb.hasSheet('_exceldb_meta')).toBe(true);
  });

  it('sets header rows with schema columns plus _deleted', () => {
    const wb = initializeWorkbook(testSchema);
    const { headers } = wb.readSheet('symptoms');
    expect(headers).toContain('id');
    expect(headers).toContain('date');
    expect(headers).toContain('region');
    expect(headers).toContain('severity');
    expect(headers).toContain('description');
    expect(headers).toContain('_deleted');
  });

  it('writes schema version to meta', () => {
    const wb = initializeWorkbook(testSchema);
    const version = readSchemaVersion(wb);
    expect(version).toBe(1);
  });
});

describe('readSchemaVersion', () => {
  it('reads version from sample fixture', () => {
    const wb = parseWorkbook(fixture('sample.xlsx'));
    expect(readSchemaVersion(wb)).toBe(1);
  });

  it('returns 0 if _exceldb_meta sheet is missing', () => {
    const wb = createEmptyWorkbook();
    wb.addSheet('symptoms', ['id']);
    expect(readSchemaVersion(wb)).toBe(0);
  });
});

describe('applyMigrations', () => {
  it('skips migrations already applied', () => {
    const wb = initializeWorkbook(testSchema);
    const migrations: Migration[] = [
      {
        version: 1,
        description: 'Already applied',
        up: () => { throw new Error('Should not run'); },
      },
    ];
    // Schema version is 1, migration version is 1 — should be skipped
    const newVersion = applyMigrations(wb, migrations, 1);
    expect(newVersion).toBe(1);
  });

  it('applies new migrations in order', () => {
    const wb = initializeWorkbook(testSchema);
    const applied: number[] = [];
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Add cause column',
        up: (w) => {
          w.addColumn('symptoms', 'cause');
          applied.push(2);
        },
      },
      {
        version: 3,
        description: 'Add outcome column',
        up: (w) => {
          w.addColumn('symptoms', 'outcome');
          applied.push(3);
        },
      },
    ];
    const newVersion = applyMigrations(wb, migrations, 1);
    expect(newVersion).toBe(3);
    expect(applied).toEqual([2, 3]);
    const { headers } = wb.readSheet('symptoms');
    expect(headers).toContain('cause');
    expect(headers).toContain('outcome');
  });

  it('rejects destructive migrations without the flag', () => {
    const wb = initializeWorkbook(testSchema);
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Drop column without destructive flag',
        // destructive is not set
        up: (w) => { w.removeColumn('symptoms', 'description'); },
      },
    ];
    expect(() => applyMigrations(wb, migrations, 1)).toThrow();
  });

  it('allows destructive migrations with the flag', () => {
    const wb = initializeWorkbook(testSchema);
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Drop description column',
        destructive: true,
        up: (w) => { w.removeColumn('symptoms', 'description'); },
      },
    ];
    const newVersion = applyMigrations(wb, migrations, 1);
    expect(newVersion).toBe(2);
    const { headers } = wb.readSheet('symptoms');
    expect(headers).not.toContain('description');
  });
});
