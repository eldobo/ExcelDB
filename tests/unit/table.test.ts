import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyWorkbook } from '../../src/workbook.js';
import { createTable } from '../../src/table.js';
import type { WorkbookHandle, TableSchema, Table } from '../../src/types.js';

// Test schema for symptoms table
const symptomsSchema: TableSchema = {
  columns: {
    id: { type: 'string', key: true, required: true },
    date: { type: 'string', required: true },
    region: { type: 'string', required: true },
    severity: { type: 'number' },
    description: { type: 'string' },
  },
};

// Row type matching the schema
interface SymptomRow {
  id: string;
  date: string;
  region: string;
  severity: number | null;
  description: string | null;
  _extra?: Record<string, unknown>;
}

let wb: WorkbookHandle;
let table: Table<SymptomRow>;
let writeCount: number;

beforeEach(() => {
  wb = createEmptyWorkbook();
  // Set up the sheet with headers + _deleted + some data
  wb.addSheet('symptoms', ['id', 'date', 'region', 'severity', 'description', '_deleted'], [
    ['s1', '2026-01-15', 'Lumbar', '3', 'Lower back pain', ''],
    ['s2', '2026-02-01', 'GI', '2', 'Nausea', ''],
    ['s3', '2026-02-10', 'Lumbar', '4', 'Sciatica', 'TRUE'],  // soft-deleted
  ]);
  writeCount = 0;
  table = createTable<SymptomRow>(
    'symptoms',
    symptomsSchema,
    () => wb,
    async () => { writeCount++; },
  );
});

describe('table.getAll', () => {
  it('returns all non-deleted rows', async () => {
    const rows = await table.getAll();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).toEqual(['s1', 's2']);
  });

  it('includes deleted rows when requested', async () => {
    const rows = await table.getAll({ includeDeleted: true });
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.id)).toEqual(['s1', 's2', 's3']);
  });
});

describe('table.get', () => {
  it('returns a row by key', async () => {
    const row = await table.get('s1');
    expect(row).not.toBeNull();
    expect(row!.id).toBe('s1');
    expect(row!.region).toBe('Lumbar');
  });

  it('returns null for non-existent key', async () => {
    const row = await table.get('nonexistent');
    expect(row).toBeNull();
  });

  it('returns null for soft-deleted rows', async () => {
    const row = await table.get('s3');
    expect(row).toBeNull();
  });
});

describe('table.query', () => {
  it('filters by a single field', async () => {
    const rows = await table.query({ region: 'Lumbar' });
    expect(rows).toHaveLength(1); // s3 is deleted, only s1 matches
    expect(rows[0].id).toBe('s1');
  });

  it('filters by multiple fields', async () => {
    const rows = await table.query({ region: 'GI', description: 'Nausea' });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('s2');
  });

  it('returns empty array when no match', async () => {
    const rows = await table.query({ region: 'Shoulder' });
    expect(rows).toEqual([]);
  });
});

describe('table.count', () => {
  it('counts all non-deleted rows', async () => {
    expect(await table.count()).toBe(2);
  });

  it('counts with filter', async () => {
    expect(await table.count({ region: 'Lumbar' })).toBe(1);
  });
});

describe('table.append', () => {
  it('adds a new row', async () => {
    await table.append({
      id: 's4',
      date: '2026-03-15',
      region: 'GI',
      severity: 1,
      description: 'Mild discomfort',
    });
    const rows = await table.getAll();
    expect(rows).toHaveLength(3);
    expect(rows.find(r => r.id === 's4')).toBeDefined();
  });

  it('triggers a write callback', async () => {
    await table.append({
      id: 's4',
      date: '2026-03-15',
      region: 'GI',
      severity: null,
      description: null,
    });
    expect(writeCount).toBe(1);
  });

  it('rejects duplicate keys', async () => {
    await expect(table.append({
      id: 's1',  // already exists
      date: '2026-03-15',
      region: 'GI',
      severity: null,
      description: null,
    })).rejects.toThrow();
  });
});

describe('table.upsert', () => {
  it('updates existing row when key matches', async () => {
    await table.upsert({
      id: 's1',
      date: '2026-01-15',
      region: 'Lumbar',
      severity: 5,
      description: 'Updated pain level',
    });
    const row = await table.get('s1');
    expect(row!.severity).toBe(5);
    expect(row!.description).toBe('Updated pain level');
  });

  it('inserts new row when key does not match', async () => {
    await table.upsert({
      id: 's4',
      date: '2026-03-15',
      region: 'Shoulder',
      severity: 2,
      description: 'New entry',
    });
    const row = await table.get('s4');
    expect(row).not.toBeNull();
    expect(row!.region).toBe('Shoulder');
  });
});

describe('table.update', () => {
  it('partially updates a row', async () => {
    await table.update('s1', { severity: 5 });
    const row = await table.get('s1');
    expect(row!.severity).toBe(5);
    expect(row!.description).toBe('Lower back pain'); // unchanged
  });

  it('throws for non-existent key', async () => {
    await expect(table.update('nonexistent', { severity: 1 })).rejects.toThrow();
  });
});

describe('table.delete', () => {
  it('soft deletes by default', async () => {
    await table.delete('s1');
    // s1 should be gone from normal queries
    const row = await table.get('s1');
    expect(row).toBeNull();
    // But still present with includeDeleted
    const all = await table.getAll({ includeDeleted: true });
    expect(all.find(r => r.id === 's1')).toBeDefined();
  });

  it('hard deletes when requested', async () => {
    await table.delete('s1', { hard: true });
    const all = await table.getAll({ includeDeleted: true });
    expect(all.find(r => r.id === 's1')).toBeUndefined();
  });

  it('throws for non-existent key', async () => {
    await expect(table.delete('nonexistent')).rejects.toThrow();
  });
});

describe('_extra field', () => {
  it('includes extra columns in _extra', async () => {
    // Add an extra column to the sheet that's not in the schema
    wb.addColumn('symptoms', 'doctor_notes');
    // Write a value in the extra column for row s1
    const { headers, rows } = wb.readSheet('symptoms');
    const noteIdx = headers.indexOf('doctor_notes');
    rows[0][noteIdx] = 'See specialist';
    wb.writeSheet('symptoms', headers, rows);

    const row = await table.get('s1');
    expect(row!._extra).toBeDefined();
    expect(row!._extra!['doctor_notes']).toBe('See specialist');
  });
});
