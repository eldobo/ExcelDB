import * as XLSX from 'xlsx';
import type { WorkbookHandle } from './types.js';

function createHandle(wb: XLSX.WorkBook): WorkbookHandle {
  return {
    getSheetNames() {
      return wb.SheetNames.slice();
    },

    hasSheet(name: string) {
      return wb.SheetNames.includes(name);
    },

    readSheet(name: string) {
      const ws = wb.Sheets[name];
      if (!ws) throw new Error(`Sheet "${name}" not found`);
      const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      if (aoa.length === 0) return { headers: [], rows: [] };
      const headers = aoa[0].map(String);
      const rows = aoa.slice(1);
      return { headers, rows };
    },

    writeSheet(name: string, headers: string[], rows: unknown[][]) {
      const aoa = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      wb.Sheets[name] = ws;
    },

    addSheet(name: string, headers: string[], rows?: unknown[][]) {
      const aoa = rows ? [headers, ...rows] : [headers];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, name);
    },

    deleteSheet(name: string) {
      const idx = wb.SheetNames.indexOf(name);
      if (idx === -1) throw new Error(`Sheet "${name}" not found`);
      wb.SheetNames.splice(idx, 1);
      delete wb.Sheets[name];
    },

    addColumn(sheet: string, name: string, options?: { after?: string }) {
      const { headers, rows } = this.readSheet(sheet);
      let insertIdx = headers.length;
      if (options?.after) {
        const afterIdx = headers.indexOf(options.after);
        if (afterIdx !== -1) insertIdx = afterIdx + 1;
      }
      headers.splice(insertIdx, 0, name);
      for (const row of rows) {
        row.splice(insertIdx, 0, '');
      }
      this.writeSheet(sheet, headers, rows);
    },

    removeColumn(sheet: string, name: string) {
      const { headers, rows } = this.readSheet(sheet);
      const idx = headers.indexOf(name);
      if (idx === -1) throw new Error(`Column "${name}" not found in sheet "${sheet}"`);
      headers.splice(idx, 1);
      for (const row of rows) {
        row.splice(idx, 1);
      }
      this.writeSheet(sheet, headers, rows);
    },

    renameColumn(sheet: string, oldName: string, newName: string) {
      const { headers, rows } = this.readSheet(sheet);
      const idx = headers.indexOf(oldName);
      if (idx === -1) throw new Error(`Column "${oldName}" not found in sheet "${sheet}"`);
      headers[idx] = newName;
      this.writeSheet(sheet, headers, rows);
    },

    renameSheet(oldName: string, newName: string) {
      const idx = wb.SheetNames.indexOf(oldName);
      if (idx === -1) throw new Error(`Sheet "${oldName}" not found`);
      wb.SheetNames[idx] = newName;
      wb.Sheets[newName] = wb.Sheets[oldName];
      delete wb.Sheets[oldName];
    },

    toBytes(): Uint8Array {
      return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
    },
  };
}

/**
 * Parse raw .xlsx bytes into a WorkbookHandle.
 */
export function parseWorkbook(bytes: ArrayBuffer | Uint8Array): WorkbookHandle {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const wb = XLSX.read(arr, { type: 'array' });
  return createHandle(wb);
}

/**
 * Create a new empty workbook.
 */
export function createEmptyWorkbook(): WorkbookHandle {
  const wb = XLSX.utils.book_new();
  return createHandle(wb);
}
