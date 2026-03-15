/**
 * Run with: npx tsx tests/fixtures/generate.ts
 * Generates test .xlsx fixtures used by unit tests.
 */
import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function write(name: string, wb: XLSX.WorkBook) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(join(__dirname, name), buf);
  console.log(`  wrote ${name}`);
}

// ---- sample.xlsx ----
// Normal data with two tables + _exceldb_meta
{
  const wb = XLSX.utils.book_new();

  const symptoms = XLSX.utils.aoa_to_sheet([
    ['id', 'date', 'region', 'severity', 'description', '_deleted'],
    ['s1', '2026-01-15', 'Lumbar', 3, 'Lower back pain', ''],
    ['s2', '2026-02-01', 'GI', 2, 'Nausea after meal', ''],
    ['s3', '2026-02-10', 'Lumbar', 4, 'Sciatica flare', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, symptoms, 'symptoms');

  const regions = XLSX.utils.aoa_to_sheet([
    ['id', 'name', 'display_order', '_deleted'],
    ['lumbar', 'Lumbar', 1, ''],
    ['gi', 'GI', 2, ''],
    ['shoulder', 'Scapular/shoulder', 3, ''],
  ]);
  XLSX.utils.book_append_sheet(wb, regions, 'regions');

  const meta = XLSX.utils.aoa_to_sheet([
    ['key', 'value'],
    ['schema_version', '1'],
    ['created_at', '2026-01-01T00:00:00.000Z'],
    ['last_modified_by', 'ExcelDB'],
    ['app_name', 'TestApp'],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, '_exceldb_meta');

  write('sample.xlsx', wb);
}

// ---- extra-columns.xlsx ----
// Has user-added columns not in the schema
{
  const wb = XLSX.utils.book_new();

  const symptoms = XLSX.utils.aoa_to_sheet([
    ['id', 'date', 'region', 'severity', 'description', 'doctor_notes', 'follow_up', '_deleted'],
    ['s1', '2026-01-15', 'Lumbar', 3, 'Lower back pain', 'Referred to physio', '2026-02-01', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, symptoms, 'symptoms');

  const meta = XLSX.utils.aoa_to_sheet([
    ['key', 'value'],
    ['schema_version', '1'],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, '_exceldb_meta');

  write('extra-columns.xlsx', wb);
}

// ---- missing-columns.xlsx ----
// Missing the 'severity' column from symptoms
{
  const wb = XLSX.utils.book_new();

  const symptoms = XLSX.utils.aoa_to_sheet([
    ['id', 'date', 'region', 'description', '_deleted'],
    ['s1', '2026-01-15', 'Lumbar', 'Lower back pain', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, symptoms, 'symptoms');

  const meta = XLSX.utils.aoa_to_sheet([
    ['key', 'value'],
    ['schema_version', '1'],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, '_exceldb_meta');

  write('missing-columns.xlsx', wb);
}

// ---- reordered-columns.xlsx ----
// Same columns as sample.xlsx but in different order
{
  const wb = XLSX.utils.book_new();

  const symptoms = XLSX.utils.aoa_to_sheet([
    ['_deleted', 'severity', 'description', 'date', 'id', 'region'],
    ['', 3, 'Lower back pain', '2026-01-15', 's1', 'Lumbar'],
    ['', 2, 'Nausea', '2026-02-01', 's2', 'GI'],
  ]);
  XLSX.utils.book_append_sheet(wb, symptoms, 'symptoms');

  const meta = XLSX.utils.aoa_to_sheet([
    ['key', 'value'],
    ['schema_version', '1'],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, '_exceldb_meta');

  write('reordered-columns.xlsx', wb);
}

// ---- manual-edits.xlsx ----
// Hand-typed values that test coercion edge cases
{
  const wb = XLSX.utils.book_new();

  const symptoms = XLSX.utils.aoa_to_sheet([
    ['id', 'date', 'region', 'severity', 'active', 'tags', '_deleted'],
    ['s1', '2026-01-15', 'Lumbar', '3', 'yes', '["tag1","tag2"]', ''],       // number as string, boolean as "yes", json as string
    ['s2', '2026-02-01', 'GI', 'not-a-number', 'TRUE', '', ''],               // invalid number, boolean as TRUE
    ['s3', 46068, 'Lumbar', 4, 'false', '{"key":"value"}', ''],               // date as Excel serial number
    ['s4', '2026-03-01', 'GI', '', 'no', 'invalid json{', ''],                // empty number, boolean as "no", invalid JSON
    ['s5', '2026-03-15', 'Lumbar', 5, '1', 'null', 'TRUE'],                   // boolean as "1", json "null", soft-deleted
  ]);
  XLSX.utils.book_append_sheet(wb, symptoms, 'symptoms');

  const meta = XLSX.utils.aoa_to_sheet([
    ['key', 'value'],
    ['schema_version', '1'],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, '_exceldb_meta');

  write('manual-edits.xlsx', wb);
}

console.log('All fixtures generated.');
