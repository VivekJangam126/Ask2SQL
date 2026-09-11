import crypto from 'crypto';
import { DatabaseAdapter } from './db.ts';

export interface ColumnMetadata {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  foreignKey?: {
    targetTable: string;
    targetColumn: string;
  };
}

export interface TableMetadata {
  name: string;
  rowCount: number;
  rowCountType: 'exact' | 'estimate';
  columns: ColumnMetadata[];
  primaryKeys: string[];
}

export interface SchemaMetadata {
  datasetId: string;
  schemaName: string;
  tables: TableMetadata[];
  fingerprint: string;
  extractedAt: string;
}

export async function extractSchemaMetadata(db: DatabaseAdapter, datasetId: string, schemaName: string): Promise<SchemaMetadata> {
  // Query tables in the target schema
  const tablesRes = await db.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name;`,
    [schemaName]
  );

  const tables: TableMetadata[] = [];

  for (const t of tablesRes.rows) {
    const tableName = t.table_name;

    // Get exact row count safely
    let rowCount = 0;
    try {
      const countRes = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM "${schemaName}"."${tableName}"`
      );
      rowCount = parseInt(countRes.rows[0]?.count || '0', 10);
    } catch (err) {
      console.warn(`Could not get row count for ${schemaName}.${tableName}:`, err);
    }

    // Get columns
    const colsRes = await db.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position;`,
      [schemaName, tableName]
    );

    // Get primary keys
    const pkRes = await db.query<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = $1
         AND tc.table_name = $2;`,
      [schemaName, tableName]
    );
    const primaryKeys = pkRes.rows.map(r => r.column_name);

    // Get foreign keys
    const fkRes = await db.query<{
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>(
      `SELECT
         kcu.column_name,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = $1
         AND tc.table_name = $2;`,
      [schemaName, tableName]
    );

    const fkMap = new Map<string, { targetTable: string; targetColumn: string }>();
    for (const fk of fkRes.rows) {
      fkMap.set(fk.column_name, {
        targetTable: fk.foreign_table_name,
        targetColumn: fk.foreign_column_name,
      });
    }

    const columns: ColumnMetadata[] = colsRes.rows.map(c => ({
      name: c.column_name,
      dataType: c.data_type.toUpperCase(),
      isNullable: c.is_nullable === 'YES',
      isPrimaryKey: primaryKeys.includes(c.column_name),
      foreignKey: fkMap.get(c.column_name),
    }));

    tables.push({
      name: tableName,
      rowCount,
      rowCountType: 'exact',
      columns,
      primaryKeys,
    });
  }

  // Calculate deterministic fingerprint
  const canonicalString = JSON.stringify(
    tables.map(t => ({
      name: t.name,
      cols: t.columns.map(c => `${c.name}:${c.dataType}:${c.isNullable}:${c.isPrimaryKey}:${c.foreignKey ? c.foreignKey.targetTable + '.' + c.foreignKey.targetColumn : ''}`).sort(),
      pks: t.primaryKeys.sort(),
    })).sort((a, b) => a.name.localeCompare(b.name))
  );

  const fingerprint = crypto.createHash('sha256').update(canonicalString).digest('hex').substring(0, 16);
  const extractedAt = new Date().toISOString();

  // Save snapshot to clarity_app.schema_snapshots
  const snapshotId = crypto.randomUUID();
  await db.query(
    `INSERT INTO clarity_app.schema_snapshots (id, dataset_id, schema_json, fingerprint, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [snapshotId, datasetId, JSON.stringify(tables), fingerprint, extractedAt]
  );

  return {
    datasetId,
    schemaName,
    tables,
    fingerprint,
    extractedAt,
  };
}
