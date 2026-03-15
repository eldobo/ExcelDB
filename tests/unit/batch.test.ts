import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyWorkbook } from '../../src/workbook.js';
import { createTransaction } from '../../src/batch.js';
import type { WorkbookHandle, TableSchema } from '../../src/types.js';

const symptomsSchema: TableSchema = {
  columns: {
    id: { type: 'string', key: true, required: true },
    name: { type: 'string', required: true },
  },
};

let wb: WorkbookHandle;
let flushCount: number;

beforeEach(() => {
  wb = createEmptyWorkbook();
  wb.addSheet('items', ['id', 'name', '_deleted'], [
    ['1', 'First', ''],
  ]);
  flushCount = 0;
});

describe('createTransaction', () => {
  it('accumulates writes without flushing', async () => {
    const tx = createTransaction(
      wb,
      { items: symptomsSchema },
      async () => { flushCount++; },
    );

    const items = tx.table<{ id: string; name: string }>('items');
    await items.append({ id: '2', name: 'Second' });
    await items.append({ id: '3', name: 'Third' });

    // No flush yet — writes are buffered
    expect(flushCount).toBe(0);
  });

  it('flushes once on commit', async () => {
    const tx = createTransaction(
      wb,
      { items: symptomsSchema },
      async () => { flushCount++; },
    );

    const items = tx.table<{ id: string; name: string }>('items');
    await items.append({ id: '2', name: 'Second' });
    await items.append({ id: '3', name: 'Third' });
    await tx.commit();

    expect(flushCount).toBe(1);
  });

  it('data is visible within the transaction', async () => {
    const tx = createTransaction(
      wb,
      { items: symptomsSchema },
      async () => { flushCount++; },
    );

    const items = tx.table<{ id: string; name: string }>('items');
    await items.append({ id: '2', name: 'Second' });

    const all = await items.getAll();
    expect(all).toHaveLength(2); // original + appended
  });

  it('rollback discards in-memory changes', async () => {
    const tx = createTransaction(
      wb,
      { items: symptomsSchema },
      async () => { flushCount++; },
    );

    const items = tx.table<{ id: string; name: string }>('items');
    await items.append({ id: '2', name: 'Second' });
    tx.rollback();

    // After rollback, the original workbook should be unchanged
    const { rows } = wb.readSheet('items');
    expect(rows).toHaveLength(1); // only the original row
    expect(flushCount).toBe(0);
  });

  it('does not flush if callback throws', async () => {
    const tx = createTransaction(
      wb,
      { items: symptomsSchema },
      async () => { flushCount++; },
    );

    const items = tx.table<{ id: string; name: string }>('items');
    await items.append({ id: '2', name: 'Second' });

    // Simulate error before commit
    try {
      throw new Error('Something went wrong');
    } catch {
      tx.rollback();
    }

    expect(flushCount).toBe(0);
  });
});
