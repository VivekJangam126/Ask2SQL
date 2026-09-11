import { parse } from 'csv-parse/sync';
import crypto from 'crypto';
import { DatabaseAdapter } from './db.ts';

export interface ColumnInference {
  originalName: string;
  internalName: string;
  detectedType: 'BIGINT' | 'NUMERIC' | 'BOOLEAN' | 'DATE' | 'TIMESTAMPTZ' | 'TEXT';
  isNullable: boolean;
  sampleValues: any[];
}

export interface CsvParseResult {
  checksum: string;
  totalRows: number;
  totalColumns: number;
  columns: ColumnInference[];
  previewRows: Record<string, any>[];
  allRows: Record<string, any>[];
  issues: { row?: number; column?: string; message: string; severity: 'warning' | 'error' }[];
}

export function sanitizeIdentifier(name: string): string {
  let cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (!cleaned || /^[0-9]/.test(cleaned)) {
    cleaned = 'col_' + cleaned;
  }
  return cleaned.substring(0, 60);
}

export function parseAndValidateCsv(buffer: Buffer, originalFilename: string): CsvParseResult {
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const issues: { row?: number; column?: string; message: string; severity: 'warning' | 'error' }[] = [];

  // Parse CSV records
  let rawRecords: string[][];
  try {
    rawRecords = parse(buffer, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    });
  } catch (err: any) {
    throw new Error(`CSV parsing error: ${err.message}`);
  }

  if (!rawRecords || rawRecords.length === 0) {
    throw new Error('The uploaded CSV file is empty.');
  }

  const rawHeaders = rawRecords[0];
  const dataRows = rawRecords.slice(1);

  if (rawHeaders.length === 0) {
    throw new Error('The uploaded CSV file has no columns or headers.');
  }

  if (rawHeaders.length > 200) {
    throw new Error(`CSV exceeds maximum column limit of 200 (found ${rawHeaders.length}).`);
  }

  if (dataRows.length > 100000) {
    throw new Error(`CSV exceeds maximum row limit of 100,000 (found ${dataRows.length}).`);
  }

  // Sanitize headers and detect duplicate headers
  const seenHeaders = new Map<string, number>();
  const columns: ColumnInference[] = rawHeaders.map((header, idx) => {
    let raw = (header || '').trim();
    if (!raw) {
      raw = `column_${idx + 1}`;
      issues.push({ column: raw, message: `Header at position ${idx + 1} was blank; assigned '${raw}'.`, severity: 'warning' });
    }

    let internal = sanitizeIdentifier(raw);
    const count = seenHeaders.get(internal) || 0;
    seenHeaders.set(internal, count + 1);
    if (count > 0) {
      const uniqueName = `${internal}_${count + 1}`;
      issues.push({ column: raw, message: `Duplicate header '${raw}'; renamed to '${uniqueName}'.`, severity: 'warning' });
      internal = uniqueName;
    }

    return {
      originalName: raw,
      internalName: internal,
      detectedType: 'TEXT',
      isNullable: false,
      sampleValues: [],
    };
  });

  // Analyze columns across rows
  const colTypes: ('BIGINT' | 'NUMERIC' | 'BOOLEAN' | 'DATE' | 'TIMESTAMPTZ' | 'TEXT')[] = columns.map(() => 'BIGINT');
  const hasNulls = columns.map(() => false);
  const sampleValues: any[][] = columns.map(() => []);

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    for (let c = 0; c < columns.length; c++) {
      const val = row[c] !== undefined ? String(row[c]).trim() : '';
      if (val === '' || val.toLowerCase() === 'null' || val.toLowerCase() === 'n/a') {
        hasNulls[c] = true;
        continue;
      }

      if (sampleValues[c].length < 5) {
        sampleValues[c].push(val);
      }

      // Check current inferred type for column
      const currentType = colTypes[c];
      if (currentType === 'TEXT') continue;

      // Leading zero strings (e.g. "0123", "005", "0987654321") should be preserved as TEXT unless "0"
      if (/^0[0-9]+/.test(val)) {
        colTypes[c] = 'TEXT';
        continue;
      }

      // Check BIGINT
      if (currentType === 'BIGINT') {
        if (/^-?[0-9]+$/.test(val)) {
          continue;
        } else {
          colTypes[c] = 'NUMERIC'; // degrade to numeric
        }
      }

      // Check NUMERIC
      if (colTypes[c] === 'NUMERIC') {
        if (/^-?[0-9]+(\.[0-9]+)?$/.test(val) && !isNaN(Number(val))) {
          continue;
        } else {
          colTypes[c] = 'BOOLEAN'; // test boolean next
        }
      }

      // Check BOOLEAN
      if (colTypes[c] === 'BOOLEAN') {
        if (/^(true|false|t|f|yes|no)$/i.test(val)) {
          continue;
        } else {
          colTypes[c] = 'DATE';
        }
      }

      // Check DATE (YYYY-MM-DD)
      if (colTypes[c] === 'DATE') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
          continue;
        } else {
          colTypes[c] = 'TIMESTAMPTZ';
        }
      }

      // Check TIMESTAMPTZ
      if (colTypes[c] === 'TIMESTAMPTZ') {
        const d = Date.parse(val);
        if (!isNaN(d) && val.length >= 10 && /\d/.test(val)) {
          continue;
        } else {
          colTypes[c] = 'TEXT';
        }
      }
    }
  }

  // Update inferred column types
  columns.forEach((col, idx) => {
    col.detectedType = colTypes[idx];
    col.isNullable = hasNulls[idx];
    col.sampleValues = sampleValues[idx];
  });

  // Convert parsed data rows to objects
  const allRows: Record<string, any>[] = [];
  const previewRows: Record<string, any>[] = [];

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const rowObj: Record<string, any> = {};
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const val = row[c] !== undefined ? String(row[c]).trim() : '';
      if (val === '' || val.toLowerCase() === 'null' || val.toLowerCase() === 'n/a') {
        rowObj[col.internalName] = null;
      } else if (col.detectedType === 'BIGINT') {
        const n = parseInt(val, 10);
        rowObj[col.internalName] = isNaN(n) ? null : n;
      } else if (col.detectedType === 'NUMERIC') {
        const n = parseFloat(val);
        rowObj[col.internalName] = isNaN(n) ? null : n;
      } else if (col.detectedType === 'BOOLEAN') {
        rowObj[col.internalName] = /^(true|t|yes|1)$/i.test(val);
      } else {
        rowObj[col.internalName] = val;
      }
    }
    allRows.push(rowObj);
    if (previewRows.length < 20) {
      previewRows.push(rowObj);
    }
  }

  return {
    checksum,
    totalRows: allRows.length,
    totalColumns: columns.length,
    columns,
    previewRows,
    allRows,
    issues,
  };
}

export async function createAndPopulateTable(
  db: DatabaseAdapter,
  schema: string,
  tableName: string,
  columns: ColumnInference[],
  rows: Record<string, any>[]
): Promise<{ rowCount: number }> {
  // Ensure schema exists
  await db.exec(`CREATE SCHEMA IF NOT EXISTS "${schema}";`);

  // Drop table if exists
  await db.exec(`DROP TABLE IF EXISTS "${schema}"."${tableName}" CASCADE;`);

  // Build column definitions
  const colDefs = columns
    .map(c => `"${c.internalName}" ${c.detectedType}${c.isNullable ? '' : ' NULL'}`)
    .join(', ');

  const createTableSql = `CREATE TABLE "${schema}"."${tableName}" (${colDefs});`;
  await db.exec(createTableSql);

  if (rows.length === 0) {
    return { rowCount: 0 };
  }

  // Insert rows in batches of 200
  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    for (const row of batch) {
      const colNames = columns.map(c => `"${c.internalName}"`).join(', ');
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
      const values = columns.map(c => row[c.internalName] ?? null);

      await db.query(
        `INSERT INTO "${schema}"."${tableName}" (${colNames}) VALUES (${placeholders})`,
        values
      );
    }
  }

  return { rowCount: rows.length };
}
