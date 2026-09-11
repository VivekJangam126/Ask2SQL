import crypto from 'crypto';
import { Router, Response } from 'express';
import { getDb } from './db.ts';
import { AuthRequest, requireAuth } from './auth.ts';
import { authorizeOperation, logAuditEvent } from './authorization.ts';
import { extractSchemaMetadata } from './schema.ts';

export const dataRouter = Router();

function sendError(res: Response, status: number, code: string, message: string, retryable = false) {
  return res.status(status).json({
    error: { code, message, retryable }
  });
}

function computeDigest(parts: (string | number)[]): string {
  return crypto.createHash('sha256').update(parts.join('::')).digest('hex');
}

// ----------------------------------------------------
// Get Table Records with Permissions, Filter & Sort
// ----------------------------------------------------
dataRouter.get('/datasets/:id/tables/:table/records', requireAuth, async (req: AuthRequest, res) => {
  const { id: datasetId, table: tableName } = req.params;
  const {
    limit = '50',
    offset = '0',
    search = '',
    sortBy = '',
    sortDir = 'ASC',
  } = req.query;

  const db = await getDb();

  try {
    const dsRes = await db.query('SELECT * FROM clarity_app.datasets WHERE id = $1', [datasetId]);
    if (dsRes.rows.length === 0) {
      return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
    }

    const ds = dsRes.rows[0];
    const authCheck = authorizeOperation(
      req.user,
      {
        organizationId: ds.organization_id,
        databaseId: ds.id,
        databaseLifecycleState: ds.lifecycle_state,
      },
      'read'
    );

    if (!authCheck.authorized) {
      return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
    }

    // Load table columns from information_schema
    const colRes = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position ASC
    `, [ds.internal_schema, tableName]);

    if (colRes.rows.length === 0) {
      return sendError(res, 404, 'TABLE_NOT_FOUND', `Table "${tableName}" not found in database.`);
    }

    const columns = colRes.rows.map(c => ({
      name: c.column_name,
      type: c.data_type,
      isNullable: c.is_nullable === 'YES',
    }));

    // Find primary key column if any
    const pkRes = await db.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
    `, [ds.internal_schema, tableName]);

    const primaryKey = pkRes.rows[0]?.column_name || columns[0]?.name;

    // Build SELECT query
    let whereClause = '';
    const params: any[] = [];

    if (search && typeof search === 'string') {
      const searchConditions = columns
        .filter(c => ['text', 'character varying', 'varchar', 'char'].includes(c.type.toLowerCase()))
        .map(c => `LOWER("${c.name}"::text) LIKE $1`);

      if (searchConditions.length > 0) {
        whereClause = `WHERE (${searchConditions.join(' OR ')})`;
        params.push(`%${search.trim().toLowerCase()}%`);
      }
    }

    // Count total rows
    const countSql = `SELECT COUNT(*) as total FROM "${ds.internal_schema}"."${tableName}" ${whereClause}`;
    const countRes = await db.query<{ total: string }>(countSql, params);
    const totalRows = parseInt(countRes.rows[0]?.total || '0', 10);

    // Order clause
    let orderClause = '';
    const validSortCol = columns.find(c => c.name.toLowerCase() === String(sortBy).toLowerCase());
    if (validSortCol) {
      const dir = String(sortDir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderClause = `ORDER BY "${validSortCol.name}" ${dir}`;
    } else if (primaryKey) {
      orderClause = `ORDER BY "${primaryKey}" ASC`;
    }

    const pageLimit = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200);
    const pageOffset = Math.max(parseInt(offset as string, 10) || 0, 0);

    params.push(pageLimit, pageOffset);
    const dataSql = `
      SELECT * FROM "${ds.internal_schema}"."${tableName}"
      ${whereClause}
      ${orderClause}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const dataRes = await db.query(dataSql, params);

    // Compute current user's effective permissions on this dataset
    const isAdmin = req.user?.membership?.role === 'ORG_ADMIN';
    const grant = req.user?.permissions?.find(p => p.databaseId === ds.id);

    const permissions = {
      isAdmin,
      canRead: isAdmin || Boolean(grant?.canRead),
      canInsert: isAdmin || Boolean(grant?.canInsert),
      canUpdate: isAdmin || Boolean(grant?.canUpdate),
      canDeleteRecords: isAdmin || Boolean(grant?.canDeleteRecords),
      canImportCsv: isAdmin || Boolean(grant?.canImportCsv),
      canExport: isAdmin || Boolean(grant?.canExport),
    };

    res.json({
      columns,
      primaryKey,
      rows: dataRes.rows,
      records: dataRes.rows,
      totalRows,
      total: totalRows,
      pagination: {
        total: totalRows,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
      permissions,
      schemaRevision: ds.schema_revision || 1,
      dataRevision: ds.data_revision || 1,
    });
  } catch (err: any) {
    return sendError(res, 500, 'FETCH_RECORDS_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Preview Mutation (Insert, Update, Delete)
// ----------------------------------------------------
dataRouter.post('/datasets/:id/tables/:table/records/preview', requireAuth, async (req: AuthRequest, res) => {
  const { id: datasetId, table: tableName } = req.params;
  const { operation, recordData = {}, targetCriteria = {} } = req.body;

  if (!['insert', 'update', 'delete_records'].includes(operation)) {
    return sendError(res, 400, 'INVALID_OPERATION', 'Operation must be insert, update, or delete_records.');
  }

  const db = await getDb();

  try {
    const dsRes = await db.query('SELECT * FROM clarity_app.datasets WHERE id = $1', [datasetId]);
    if (dsRes.rows.length === 0) {
      return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
    }
    const ds = dsRes.rows[0];

    // Check permission
    const action = operation as 'insert' | 'update' | 'delete_records';
    const authCheck = authorizeOperation(
      req.user,
      {
        organizationId: ds.organization_id,
        databaseId: ds.id,
        databaseLifecycleState: ds.lifecycle_state,
      },
      action
    );

    if (!authCheck.authorized) {
      return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
    }

    // Inspect columns
    const colRes = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
    `, [ds.internal_schema, tableName]);

    if (colRes.rows.length === 0) {
      return sendError(res, 404, 'TABLE_NOT_FOUND', `Table "${tableName}" not found.`);
    }

    const columns = colRes.rows.map(c => c.column_name);

    let plan: any = {};
    let sqlText = '';
    let expectedAffectedCount = 0;
    let beforeSample: any[] = [];
    let afterSample: any[] = [];
    let targetIdentities: any[] = [];

    if (operation === 'insert') {
      const insertCols: string[] = [];
      const insertVals: any[] = [];
      const placeholders: string[] = [];

      for (const col of columns) {
        if (recordData[col] !== undefined && recordData[col] !== '') {
          insertCols.push(col);
          insertVals.push(recordData[col]);
          placeholders.push(`$${insertCols.length}`);
        }
      }

      if (insertCols.length === 0) {
        return sendError(res, 400, 'EMPTY_INSERT', 'At least one column value must be provided.');
      }

      sqlText = `INSERT INTO "${ds.internal_schema}"."${tableName}" ("${insertCols.join('", "')}") VALUES (${placeholders.join(', ')}) RETURNING *`;
      expectedAffectedCount = 1;
      afterSample = [recordData];
      plan = {
        operation: 'insert',
        targetTable: tableName,
        columns: insertCols,
        values: insertVals,
        sql: sqlText,
      };
    } else if (operation === 'update') {
      if (Object.keys(targetCriteria).length === 0) {
        return sendError(res, 400, 'MISSING_CRITERIA', 'Target criteria (such as primary key) required for update.');
      }

      // Find target row(s)
      const whereParts: string[] = [];
      const whereVals: any[] = [];
      for (const [k, v] of Object.entries(targetCriteria)) {
        if (columns.includes(k)) {
          whereVals.push(v);
          whereParts.push(`"${k}" = $${whereVals.length}`);
        }
      }

      if (whereParts.length === 0) {
        return sendError(res, 400, 'INVALID_CRITERIA', 'No valid column criteria specified.');
      }

      const existingRowsRes = await db.query(
        `SELECT * FROM "${ds.internal_schema}"."${tableName}" WHERE ${whereParts.join(' AND ')} LIMIT 10`,
        whereVals
      );

      expectedAffectedCount = existingRowsRes.rows.length;
      if (expectedAffectedCount === 0) {
        return sendError(res, 404, 'RECORD_NOT_FOUND', 'Target record to update was not found.');
      }

      beforeSample = existingRowsRes.rows;
      targetIdentities = existingRowsRes.rows.map(r => r.id || r[columns[0]]);

      const setParts: string[] = [];
      const setVals: any[] = [];
      const updatedRow = { ...existingRowsRes.rows[0] };

      for (const [k, v] of Object.entries(recordData)) {
        if (columns.includes(k) && !targetCriteria[k]) {
          setVals.push(v);
          setParts.push(`"${k}" = $${setVals.length}`);
          updatedRow[k] = v;
        }
      }

      if (setParts.length === 0) {
        return sendError(res, 400, 'NO_CHANGES', 'No column modifications provided.');
      }

      afterSample = [updatedRow];

      // Build SQL with setVals + whereVals
      const whereSqlParts: string[] = [];
      const allParams = [...setVals];
      for (const [k, v] of Object.entries(targetCriteria)) {
        allParams.push(v);
        whereSqlParts.push(`"${k}" = $${allParams.length}`);
      }

      sqlText = `UPDATE "${ds.internal_schema}"."${tableName}" SET ${setParts.join(', ')} WHERE ${whereSqlParts.join(' AND ')} RETURNING *`;
      plan = {
        operation: 'update',
        targetTable: tableName,
        targetCriteria,
        updatedFields: recordData,
        sql: sqlText,
        params: allParams,
      };
    } else if (operation === 'delete_records') {
      if (Object.keys(targetCriteria).length === 0) {
        return sendError(res, 400, 'MISSING_CRITERIA', 'Target criteria required for deletion.');
      }

      const whereParts: string[] = [];
      const whereVals: any[] = [];
      for (const [k, v] of Object.entries(targetCriteria)) {
        if (columns.includes(k)) {
          whereVals.push(v);
          whereParts.push(`"${k}" = $${whereVals.length}`);
        }
      }

      const existingRowsRes = await db.query(
        `SELECT * FROM "${ds.internal_schema}"."${tableName}" WHERE ${whereParts.join(' AND ')} LIMIT 10`,
        whereVals
      );

      expectedAffectedCount = existingRowsRes.rows.length;
      if (expectedAffectedCount === 0) {
        return sendError(res, 404, 'RECORD_NOT_FOUND', 'Target record(s) to delete not found.');
      }

      beforeSample = existingRowsRes.rows;
      targetIdentities = existingRowsRes.rows.map(r => r.id || r[columns[0]]);
      sqlText = `DELETE FROM "${ds.internal_schema}"."${tableName}" WHERE ${whereParts.join(' AND ')} RETURNING *`;
      plan = {
        operation: 'delete_records',
        targetTable: tableName,
        targetCriteria,
        sql: sqlText,
        params: whereVals,
      };
    }

    const previewId = crypto.randomUUID();
    const digest = computeDigest([
      req.user!.id,
      ds.id,
      tableName,
      operation,
      JSON.stringify(plan),
      ds.schema_revision || 1,
      ds.data_revision || 1,
    ]);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.query(`
      INSERT INTO clarity_app.operation_previews (
        id, actor_id, organization_id, database_id, table_name,
        operation, sql_text, plan_json, target_record_identities_json,
        expected_affected_count, permission_revision, schema_revision,
        data_revision, digest, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      previewId,
      req.user!.id,
      ds.organization_id,
      ds.id,
      tableName,
      operation,
      sqlText,
      JSON.stringify(plan),
      JSON.stringify(targetIdentities),
      expectedAffectedCount,
      req.user!.membership?.permissionRevision || 1,
      ds.schema_revision || 1,
      ds.data_revision || 1,
      digest,
      expiresAt,
    ]);

    const previewObj = {
      id: previewId,
      previewId,
      digest,
      operation,
      tableName,
      expectedAffectedCount,
      sql: sqlText,
      plan,
      beforeSample,
      afterSample,
      expiresAt,
    };

    res.json({
      preview: previewObj,
      ...previewObj,
    });
  } catch (err: any) {
    return sendError(res, 500, 'PREVIEW_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Confirm & Commit Mutation (Strict RBAC & Concurrency Check)
// ----------------------------------------------------
dataRouter.post('/operations/:id/confirm', requireAuth, async (req: AuthRequest, res) => {
  const previewId = req.params.id;
  const { digest, idempotencyKey } = req.body;

  const db = await getDb();

  try {
    const prevRes = await db.query('SELECT * FROM clarity_app.operation_previews WHERE id = $1', [previewId]);
    if (prevRes.rows.length === 0) {
      return sendError(res, 404, 'PREVIEW_NOT_FOUND', 'Operation preview not found or expired.');
    }

    const prev = prevRes.rows[0];

    if (prev.is_consumed) {
      return sendError(res, 409, 'PREVIEW_ALREADY_USED', 'This operation preview has already been executed.');
    }

    if (new Date(prev.expires_at) < new Date()) {
      return sendError(res, 410, 'PREVIEW_EXPIRED', 'Operation preview has expired. Please inspect and preview again.');
    }

    if (prev.digest !== digest) {
      return sendError(res, 400, 'DIGEST_MISMATCH', 'Integrity check failed: preview digest does not match.');
    }

    if (prev.actor_id !== req.user!.id) {
      return sendError(res, 403, 'ACTOR_MISMATCH', 'Operation was previewed by a different user.');
    }

    // Load dataset and verify schema/data revision
    const dsRes = await db.query('SELECT * FROM clarity_app.datasets WHERE id = $1', [prev.database_id]);
    if (dsRes.rows.length === 0) {
      return sendError(res, 404, 'DATASET_NOT_FOUND', 'Target dataset not found.');
    }
    const ds = dsRes.rows[0];

    // Authorize at execution time!
    const authCheck = authorizeOperation(
      req.user,
      {
        organizationId: ds.organization_id,
        databaseId: ds.id,
        databaseLifecycleState: ds.lifecycle_state,
      },
      prev.operation as any
    );

    if (!authCheck.authorized) {
      return sendError(res, authCheck.status, authCheck.code!, `Execution denied: ${authCheck.reason}`);
    }

    // Check concurrency revisions
    if (ds.schema_revision !== prev.schema_revision) {
      return sendError(res, 409, 'SCHEMA_CHANGED', 'Database schema was modified since this operation was previewed. Please preview again.', true);
    }

    if (ds.data_revision !== prev.data_revision) {
      // Optimistic concurrency warning if data changed
      console.warn(`[Concurrency] Data revision advanced from ${prev.data_revision} to ${ds.data_revision}`);
    }

    const plan = JSON.parse(prev.plan_json);

    // Execute mutation
    let execResult: any;
    if (prev.operation === 'insert') {
      execResult = await db.query(plan.sql, plan.values);
    } else if (prev.operation === 'update') {
      execResult = await db.query(plan.sql, plan.params);
    } else if (prev.operation === 'delete_records') {
      execResult = await db.query(plan.sql, plan.params);
    }

    const affectedCount = execResult.rows?.length ?? 1;

    // Mark preview consumed
    await db.query('UPDATE clarity_app.operation_previews SET is_consumed = true WHERE id = $1', [previewId]);

    // Increment dataset data revision
    await db.query(`
      UPDATE clarity_app.datasets
      SET data_revision = data_revision + 1, updated_by = $1
      WHERE id = $2
    `, [req.user!.id, ds.id]);

    // Update row count cache in dataset_tables
    try {
      const countRes = await db.query(`SELECT COUNT(*) as cnt FROM "${ds.internal_schema}"."${prev.table_name}"`);
      await db.query(`
        UPDATE clarity_app.dataset_tables
        SET row_count = $1
        WHERE dataset_id = $2 AND table_name = $3
      `, [countRes.rows[0]?.cnt || 0, ds.id, prev.table_name]);
    } catch (e) {
      // Ignore count cache error
    }

    // Log audit event
    const actionLabel = prev.operation === 'insert' ? 'RECORD_INSERTED' :
                        prev.operation === 'update' ? 'RECORD_UPDATED' : 'RECORD_DELETED';

    await logAuditEvent(db, {
      organizationId: ds.organization_id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: actionLabel,
      targetType: 'record',
      targetId: prev.table_name,
      targetName: `${ds.display_name} -> ${prev.table_name}`,
      summary: `Executed ${prev.operation} on table "${prev.table_name}" (${affectedCount} row(s) affected).`,
      details: {
        operation: prev.operation,
        table: prev.table_name,
        affectedCount,
        previewId,
      },
      affectedRows: affectedCount,
    });

    res.json({
      success: true,
      message: `Operation ${prev.operation} executed successfully.`,
      affectedCount,
      record: execResult.rows?.[0] || null,
      rows: execResult.rows || [],
    });
  } catch (err: any) {
    return sendError(res, 500, 'EXECUTION_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Append CSV Data into Existing Table (Preserves Schema)
// ----------------------------------------------------
dataRouter.post('/datasets/:id/tables/:table/append-csv', requireAuth, async (req: AuthRequest, res) => {
  const { id: datasetId, table: tableName } = req.params;
  const { csvText } = req.body;

  if (!csvText || !csvText.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'CSV text content is required.');
  }

  const db = await getDb();

  try {
    const dsRes = await db.query('SELECT * FROM clarity_app.datasets WHERE id = $1', [datasetId]);
    if (dsRes.rows.length === 0) {
      return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
    }
    const ds = dsRes.rows[0];

    // Requires 'import_csv' (which in turn requires both read and insert)
    const authCheck = authorizeOperation(
      req.user,
      {
        organizationId: ds.organization_id,
        databaseId: ds.id,
        databaseLifecycleState: ds.lifecycle_state,
      },
      'import_csv'
    );

    if (!authCheck.authorized) {
      return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
    }

    // Inspect table schema
    const colRes = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
    `, [ds.internal_schema, tableName]);

    if (colRes.rows.length === 0) {
      return sendError(res, 404, 'TABLE_NOT_FOUND', `Table "${tableName}" not found.`);
    }

    const existingCols = colRes.rows.map(c => c.column_name);

    // Simple robust CSV parser
    const lines = csvText.trim().split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    if (lines.length < 2) {
      return sendError(res, 400, 'EMPTY_CSV', 'CSV must contain at least a header row and one data row.');
    }

    const header = lines[0].split(',').map((h: string) => h.trim().replace(/^["']|["']$/g, ''));

    // Validate headers match table columns
    const validHeaderCols = header.filter((h: string) => existingCols.includes(h));
    if (validHeaderCols.length === 0) {
      return sendError(res, 400, 'HEADER_MISMATCH', `None of the CSV headers match columns in table "${tableName}". Existing columns: ${existingCols.join(', ')}`);
    }

    let appendedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const rowVals = lines[i].split(',').map((v: string) => v.trim().replace(/^["']|["']$/g, ''));
      const insertCols: string[] = [];
      const insertVals: any[] = [];
      const placeholders: string[] = [];

      for (let j = 0; j < header.length; j++) {
        const col = header[j];
        if (existingCols.includes(col) && rowVals[j] !== undefined) {
          insertCols.push(col);
          insertVals.push(rowVals[j]);
          placeholders.push(`$${insertCols.length}`);
        }
      }

      if (insertCols.length > 0) {
        const insertSql = `INSERT INTO "${ds.internal_schema}"."${tableName}" ("${insertCols.join('", "')}") VALUES (${placeholders.join(', ')})`;
        await db.query(insertSql, insertVals);
        appendedCount++;
      }
    }

    // Advance data revision
    await db.query('UPDATE clarity_app.datasets SET data_revision = data_revision + 1 WHERE id = $1', [ds.id]);

    // Update row count cache
    const countRes = await db.query(`SELECT COUNT(*) as cnt FROM "${ds.internal_schema}"."${tableName}"`);
    const totalRows = parseInt(countRes.rows[0]?.cnt || '0', 10);
    await db.query('UPDATE clarity_app.dataset_tables SET row_count = $1 WHERE dataset_id = $2 AND table_name = $3', [totalRows, ds.id, tableName]);

    // Log audit event
    await logAuditEvent(db, {
      organizationId: ds.organization_id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'CSV_APPENDED',
      targetType: 'table',
      targetId: tableName,
      targetName: `${ds.display_name} -> ${tableName}`,
      summary: `Appended ${appendedCount} rows to table "${tableName}" via CSV import.`,
      affectedRows: appendedCount,
    });

    res.json({
      success: true,
      message: `Successfully appended ${appendedCount} rows to table "${tableName}".`,
      appendedCount,
      totalRows,
    });
  } catch (err: any) {
    return sendError(res, 500, 'APPEND_CSV_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Export Table Records as CSV (with Formula Injection Protection)
// ----------------------------------------------------
dataRouter.get('/datasets/:id/tables/:table/export.csv', requireAuth, async (req: AuthRequest, res) => {
  const { id: datasetId, table: tableName } = req.params;
  const db = await getDb();

  try {
    const dsRes = await db.query('SELECT * FROM clarity_app.datasets WHERE id = $1', [datasetId]);
    if (dsRes.rows.length === 0) {
      return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
    }
    const ds = dsRes.rows[0];

    const authCheck = authorizeOperation(
      req.user,
      {
        organizationId: ds.organization_id,
        databaseId: ds.id,
        databaseLifecycleState: ds.lifecycle_state,
      },
      'export'
    );

    if (!authCheck.authorized) {
      return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
    }

    const dataRes = await db.query(`SELECT * FROM "${ds.internal_schema}"."${tableName}" LIMIT 10000`);
    const rows = dataRes.rows;

    const colRes = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position ASC
    `, [ds.internal_schema, tableName]);

    const columns = colRes.rows.map(c => c.column_name);

    // Formula injection protection: prepend single quote if cell starts with =, +, -, @, \t, \r
    const escapeCell = (val: any): string => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = columns.map(c => escapeCell(c)).join(',');
    const rowLines = rows.map(r => columns.map(c => escapeCell(r[c])).join(','));
    const csvContent = [headerLine, ...rowLines].join('\r\n');

    // Log audit event
    await logAuditEvent(db, {
      organizationId: ds.organization_id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'TABLE_EXPORTED',
      targetType: 'table',
      targetId: tableName,
      targetName: `${ds.display_name} -> ${tableName}`,
      summary: `Exported ${rows.length} rows from table "${tableName}" to CSV.`,
      affectedRows: rows.length,
    });

    const filename = `${tableName}_export_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(csvContent, 'utf-8'));
  } catch (err: any) {
    return sendError(res, 500, 'EXPORT_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Delete Database (with Typed Confirmation)
// ----------------------------------------------------
dataRouter.post('/datasets/:id/delete', requireAuth, async (req: AuthRequest, res) => {
  const { id: datasetId } = req.params;
  const { confirmedName } = req.body;
  const db = await getDb();

  try {
    const dsRes = await db.query('SELECT * FROM clarity_app.datasets WHERE id = $1', [datasetId]);
    if (dsRes.rows.length === 0) {
      return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
    }
    const ds = dsRes.rows[0];

    const authCheck = authorizeOperation(
      req.user,
      { organizationId: ds.organization_id },
      'admin_delete_database'
    );

    if (!authCheck.authorized) {
      return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
    }

    if (!confirmedName || confirmedName.trim().toLowerCase() !== ds.display_name.trim().toLowerCase()) {
      return sendError(res, 400, 'CONFIRMATION_MISMATCH', `Typed name "${confirmedName}" does not match database name "${ds.display_name}".`);
    }

    // Mark lifecycle state as deleting
    await db.query("UPDATE clarity_app.datasets SET lifecycle_state = 'deleting' WHERE id = $1", [datasetId]);

    // Drop internal schema and tables
    await db.exec(`DROP SCHEMA IF EXISTS "${ds.internal_schema}" CASCADE;`);

    // Mark deleted
    await db.query("UPDATE clarity_app.datasets SET lifecycle_state = 'deleted', is_active = false WHERE id = $1", [datasetId]);

    // Clean up permission records
    await db.query('DELETE FROM clarity_app.database_permissions WHERE database_id = $1', [datasetId]);

    // Log audit event
    await logAuditEvent(db, {
      organizationId: ds.organization_id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'DATABASE_DELETED',
      targetType: 'database',
      targetId: ds.id,
      targetName: ds.display_name,
      summary: `Deleted database "${ds.display_name}" and dropped schema "${ds.internal_schema}".`,
    });

    res.json({ success: true, message: `Database "${ds.display_name}" deleted successfully.` });
  } catch (err: any) {
    return sendError(res, 500, 'DELETE_DATABASE_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Create Table
// ----------------------------------------------------
dataRouter.post('/datasets/:id/tables', requireAuth, async (req: AuthRequest, res) => {
  const { id: datasetId } = req.params;
  const { tableName, columns = [] } = req.body;

  if (!tableName || !tableName.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'Table name is required.');
  }

  const cleanTableName = tableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const db = await getDb();

  try {
    const dsRes = await db.query('SELECT * FROM clarity_app.datasets WHERE id = $1', [datasetId]);
    if (dsRes.rows.length === 0) {
      return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
    }
    const ds = dsRes.rows[0];

    const authCheck = authorizeOperation(
      req.user,
      { organizationId: ds.organization_id },
      'admin_create_table'
    );

    if (!authCheck.authorized) {
      return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
    }

    // Build column definitions
    const colDefs: string[] = ['"id" TEXT PRIMARY KEY'];
    for (const c of columns) {
      if (!c.name || c.name.toLowerCase() === 'id') continue;
      const colName = c.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const type = ['numeric', 'integer', 'boolean', 'date', 'timestamptz'].includes(c.type) ? c.type : 'TEXT';
      const nullable = c.isNullable ? '' : 'NOT NULL';
      colDefs.push(`"${colName}" ${type} ${nullable}`.trim());
    }

    const createSql = `CREATE TABLE "${ds.internal_schema}"."${cleanTableName}" (${colDefs.join(', ')});`;
    await db.exec(createSql);

    // Register in dataset_tables
    await db.query(`
      INSERT INTO clarity_app.dataset_tables (id, dataset_id, table_name, row_count, row_count_type)
      VALUES ($1, $2, $3, 0, 'exact')
    `, [crypto.randomUUID(), ds.id, cleanTableName]);

    // Advance schema revision and extract snapshot
    await db.query('UPDATE clarity_app.datasets SET schema_revision = schema_revision + 1 WHERE id = $1', [ds.id]);
    await extractSchemaMetadata(db, ds.id, ds.internal_schema);

    // Log audit event
    await logAuditEvent(db, {
      organizationId: ds.organization_id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'TABLE_CREATED',
      targetType: 'table',
      targetId: cleanTableName,
      targetName: `${ds.display_name} -> ${cleanTableName}`,
      summary: `Created table "${cleanTableName}" in database "${ds.display_name}".`,
      details: { columns },
    });

    res.status(201).json({
      success: true,
      message: `Table "${cleanTableName}" created successfully.`,
      tableName: cleanTableName,
    });
  } catch (err: any) {
    return sendError(res, 500, 'CREATE_TABLE_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Drop Table
// ----------------------------------------------------
dataRouter.post('/datasets/:id/tables/:table/drop', requireAuth, async (req: AuthRequest, res) => {
  const { id: datasetId, table: tableName } = req.params;
  const { confirmedName } = req.body;
  const db = await getDb();

  try {
    const dsRes = await db.query('SELECT * FROM clarity_app.datasets WHERE id = $1', [datasetId]);
    if (dsRes.rows.length === 0) {
      return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
    }
    const ds = dsRes.rows[0];

    const authCheck = authorizeOperation(
      req.user,
      { organizationId: ds.organization_id },
      'admin_drop_table'
    );

    if (!authCheck.authorized) {
      return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
    }

    if (!confirmedName || confirmedName.trim().toLowerCase() !== tableName.trim().toLowerCase()) {
      return sendError(res, 400, 'CONFIRMATION_MISMATCH', `Typed name "${confirmedName}" does not match table name "${tableName}".`);
    }

    await db.exec(`DROP TABLE IF EXISTS "${ds.internal_schema}"."${tableName}" CASCADE;`);
    await db.query('DELETE FROM clarity_app.dataset_tables WHERE dataset_id = $1 AND table_name = $2', [ds.id, tableName]);

    await db.query('UPDATE clarity_app.datasets SET schema_revision = schema_revision + 1 WHERE id = $1', [ds.id]);
    await extractSchemaMetadata(db, ds.id, ds.internal_schema);

    await logAuditEvent(db, {
      organizationId: ds.organization_id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'TABLE_DROPPED',
      targetType: 'table',
      targetId: tableName,
      targetName: `${ds.display_name} -> ${tableName}`,
      summary: `Dropped table "${tableName}" from database "${ds.display_name}".`,
    });

    res.json({ success: true, message: `Table "${tableName}" dropped successfully.` });
  } catch (err: any) {
    return sendError(res, 500, 'DROP_TABLE_FAILED', err.message);
  }
});
