import express, { Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { getDb, checkDbReadiness } from './db.ts';
import {
  AuthRequest,
  hashPassword,
  verifyPassword,
  createSession,
  revokeSession,
  requireAuth,
  getUserBySessionToken,
} from './auth.ts';
import { config } from './config.ts';
import { parseAndValidateCsv, createAndPopulateTable, sanitizeIdentifier } from './csv.ts';
import { extractSchemaMetadata } from './schema.ts';
import { understandQuestion, generateSqlWithCorrection, generateGroundedInsights } from './gemini.ts';
import { createPreview, confirmAndExecuteQuery, computePreviewDigest } from './execution.ts';
import { seedSampleCollegeDataset, KNOWN_TEST_CSVS } from './seed.ts';
import { adminRouter } from './admin-routes.ts';
import { dataRouter } from './data-routes.ts';
import { authorizeOperation, logAuditEvent } from './authorization.ts';

export const apiRouter = express.Router();

// Mount administrative and data exploration sub-routers
apiRouter.use(adminRouter);
apiRouter.use(dataRouter);

const upload = multer({
  limits: { fileSize: config.maxCsvBytes },
});

// Helper for error responses
function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  retryable: boolean = false
) {
  return res.status(status).json({
    error: {
      code,
      message,
      retryable,
      requestId: crypto.randomUUID(),
    },
  });
}

function getSessionCookieOptions(req: any) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: config.sessionTtlHours * 3600 * 1000,
    path: '/',
  };
}

// ----------------------------------------------------
// Health Check
// ----------------------------------------------------
apiRouter.get('/health', async (req, res) => {
  const dbStatus = await checkDbReadiness();
  res.json({
    status: dbStatus.ready ? 'healthy' : 'degraded',
    database: dbStatus,
    aiModel: config.geminiModel,
    hasApiKey: Boolean(config.geminiApiKey),
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ----------------------------------------------------
// Authentication Endpoints
// ----------------------------------------------------
apiRouter.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return sendError(res, 400, 'INVALID_INPUT', 'Full name, email, and password are required.');
  }

  if (password.length < 8) {
    return sendError(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters long.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = await getDb();

  try {
    const existing = await db.query('SELECT id FROM clarity_app.users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return sendError(res, 409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    }

    const userId = crypto.randomUUID();
    const pwdHash = hashPassword(password);

    await db.query(
      `INSERT INTO clarity_app.users (id, name, email, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [userId, name.trim(), normalizedEmail, pwdHash]
    );

    const token = await createSession(userId);

    res.cookie(config.sessionCookieName, token, getSessionCookieOptions(req));

    // Create welcome notification
    await db.query(
      `INSERT INTO clarity_app.notifications (id, owner_id, title, message, event_type)
       VALUES ($1, $2, 'Account created.', 'Welcome to ClaritySQL! Load sample data or import your CSV to begin.', 'account_created')`,
      [crypto.randomUUID(), userId]
    );

    // Auto-seed sample college dataset for instant exploration!
    try {
      await seedSampleCollegeDataset(userId);
    } catch (seedErr) {
      console.warn('Initial seed failed:', seedErr);
    }

    res.status(201).json({
      user: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
      },
      token,
    });
  } catch (err: any) {
    return sendError(res, 500, 'REGISTRATION_FAILED', err.message);
  }
});

apiRouter.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return sendError(res, 400, 'INVALID_INPUT', 'Email and password are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = await getDb();

  try {
    const userRes = await db.query(
      'SELECT id, name, email, password_hash FROM clarity_app.users WHERE email = $1',
      [normalizedEmail]
    );

    if (userRes.rows.length === 0) {
      if (normalizedEmail === 'demo@claritysql.internal') {
        const demoId = 'demo-user-clarity-analyst';
        const demoHash = hashPassword('Password123!');
        await db.query(
          `INSERT INTO clarity_app.users (id, name, email, password_hash)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO NOTHING`,
          [demoId, 'Alex Morgan', normalizedEmail, demoHash]
        );
        try {
          await seedSampleCollegeDataset(demoId);
        } catch (e) {
          console.warn('Demo dataset auto-seed error:', e);
        }
        const token = await createSession(demoId);
        res.cookie(config.sessionCookieName, token, getSessionCookieOptions(req));
        return res.json({
          user: {
            id: demoId,
            name: 'Alex Morgan',
            email: normalizedEmail,
          },
          token,
        });
      }
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const user = userRes.rows[0];
    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const token = await createSession(user.id);
    res.cookie(config.sessionCookieName, token, getSessionCookieOptions(req));

    const fullUser = await getUserBySessionToken(token);

    res.json({
      user: fullUser || {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (err: any) {
    return sendError(res, 500, 'LOGIN_FAILED', err.message);
  }
});

// Demo login supporting synthetic role personas
apiRouter.post('/auth/demo', async (req, res) => {
  const { email } = req.body;
  const targetEmail = (email && typeof email === 'string' ? email.trim().toLowerCase() : 'admin@claritysql.internal');

  const db = await getDb();
  try {
    const userRes = await db.query('SELECT id, name, email FROM clarity_app.users WHERE email = $1', [targetEmail]);
    if (userRes.rows.length === 0) {
      return sendError(res, 404, 'DEMO_USER_NOT_FOUND', `Demo identity for ${targetEmail} not found. Please refresh the page.`);
    }

    const user = userRes.rows[0];
    const token = await createSession(user.id);
    res.cookie(config.sessionCookieName, token, getSessionCookieOptions(req));

    const fullUser = await getUserBySessionToken(token);

    res.json({
      success: true,
      message: `Signed in as ${user.name}.`,
      user: fullUser,
      token,
    });
  } catch (err: any) {
    return sendError(res, 500, 'DEMO_LOGIN_FAILED', err.message);
  }
});

apiRouter.post('/auth/logout', requireAuth, async (req: AuthRequest, res) => {
  const token = req.cookies?.[config.sessionCookieName] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (token) {
    await revokeSession(token);
  }
  const cookieOpts = getSessionCookieOptions(req);
  res.clearCookie(config.sessionCookieName, { path: '/', secure: cookieOpts.secure, sameSite: cookieOpts.sameSite });
  res.json({ success: true, message: 'Logged out successfully.' });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

apiRouter.patch('/profile', requireAuth, async (req: AuthRequest, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'Name cannot be empty.');
  }

  const db = await getDb();
  await db.query(
    'UPDATE clarity_app.users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [name.trim(), req.user!.id]
  );

  res.json({
    user: {
      ...req.user,
      name: name.trim(),
    },
  });
});

// ----------------------------------------------------
// Datasets & Seed Sample (Multi-Tenant & RBAC Aware)
// ----------------------------------------------------
apiRouter.get('/datasets', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const orgId = req.user?.organization?.id;
  const isAdmin = req.user?.membership?.role === 'ORG_ADMIN';

  let sql = `
    SELECT d.*,
           (SELECT COUNT(*) FROM clarity_app.dataset_tables dt WHERE dt.dataset_id = d.id) as table_count,
           (SELECT COALESCE(SUM(dt.row_count), 0) FROM clarity_app.dataset_tables dt WHERE dt.dataset_id = d.id) as total_rows
    FROM clarity_app.datasets d
  `;
  const params: any[] = [];

  if (isAdmin) {
    sql += ` WHERE (d.organization_id = $1 OR (d.organization_id IS NULL AND d.owner_id = $2))
             AND d.lifecycle_state != 'deleted'`;
    params.push(orgId, req.user!.id);
  } else {
    // Regular MEMBER: only datasets where member has explicit can_read permission
    sql += ` JOIN clarity_app.database_permissions p ON d.id = p.database_id
             WHERE d.organization_id = $1
               AND p.membership_id = $2
               AND p.can_read = true
               AND d.lifecycle_state != 'deleted'`;
    params.push(orgId, req.user?.membership?.id);
  }

  sql += ` ORDER BY d.created_at DESC`;

  const datasetsRes = await db.query(sql, params);

  // Attach user permissions to each dataset object
  const datasets = datasetsRes.rows.map(d => {
    const grant = req.user?.permissions?.find(p => p.databaseId === d.id);
    return {
      ...d,
      permissions: {
        isAdmin,
        canRead: isAdmin || Boolean(grant?.canRead),
        canInsert: isAdmin || Boolean(grant?.canInsert),
        canUpdate: isAdmin || Boolean(grant?.canUpdate),
        canDeleteRecords: isAdmin || Boolean(grant?.canDeleteRecords),
        canImportCsv: isAdmin || Boolean(grant?.canImportCsv),
        canExport: isAdmin || Boolean(grant?.canExport),
      }
    };
  });

  res.json({ datasets });
});

// Create new database (Admin only)
apiRouter.post('/datasets', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_create_database');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'Database name is required.');
  }

  const db = await getDb();
  const datasetId = crypto.randomUUID();
  const internalSchema = `data_${crypto.randomBytes(6).toString('hex')}`;

  try {
    await db.exec(`CREATE SCHEMA IF NOT EXISTS "${internalSchema}";`);

    await db.query(`
      INSERT INTO clarity_app.datasets (
        id, organization_id, owner_id, created_by, updated_by, display_name, description, internal_schema, engine, is_active, lifecycle_state
      ) VALUES ($1, $2, $3, $3, $3, $4, $5, $6, 'PostgreSQL', true, 'active')
    `, [
      datasetId,
      req.user!.organization!.id,
      req.user!.id,
      name.trim(),
      description ? description.trim() : null,
      internalSchema,
    ]);

    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'DATABASE_CREATED',
      targetType: 'database',
      targetId: datasetId,
      targetName: name.trim(),
      summary: `Created database "${name.trim()}" in schema "${internalSchema}".`,
    });

    res.status(201).json({
      success: true,
      message: `Database "${name.trim()}" created successfully.`,
      dataset: {
        id: datasetId,
        displayName: name.trim(),
        description: description || null,
        internalSchema,
      },
    });
  } catch (err: any) {
    return sendError(res, 500, 'CREATE_DATABASE_FAILED', err.message);
  }
});

apiRouter.post('/datasets/seed-sample', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await seedSampleCollegeDataset(req.user!.id, req.user?.organization?.id);
    res.status(201).json({
      success: true,
      message: 'Your database is ready.',
      ...result,
    });
  } catch (err: any) {
    return sendError(res, 500, 'SEED_FAILED', err.message);
  }
});

// ----------------------------------------------------
// CSV Upload & Staging
// ----------------------------------------------------
apiRouter.post('/uploads', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return sendError(res, 400, 'NO_FILE', 'No CSV file was uploaded.');
  }

  const filename = req.file.originalname || 'data.csv';

  try {
    const parseResult = parseAndValidateCsv(req.file.buffer, filename);
    const uploadId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const db = await getDb();

    await db.query(
      `INSERT INTO clarity_app.uploads (
         id, owner_id, original_filename, size_bytes, checksum,
         status, stage, parsed_rows, parsed_columns, issues_json,
         preview_rows_json, inferred_schema_json, staged_data_json, expires_at
       ) VALUES ($1, $2, $3, $4, $5, 'staged', 'ready_to_import', $6, $7, $8, $9, $10, $11, $12)`,
      [
        uploadId,
        req.user!.id,
        filename,
        req.file.size,
        parseResult.checksum,
        parseResult.totalRows,
        parseResult.totalColumns,
        JSON.stringify(parseResult.issues),
        JSON.stringify(parseResult.previewRows),
        JSON.stringify(parseResult.columns),
        JSON.stringify(parseResult.allRows),
        expiresAt,
      ]
    );

    res.status(201).json({
      uploadId,
      originalFilename: filename,
      sizeBytes: req.file.size,
      checksum: parseResult.checksum,
      totalRows: parseResult.totalRows,
      totalColumns: parseResult.totalColumns,
      columns: parseResult.columns,
      previewRows: parseResult.previewRows,
      issues: parseResult.issues,
    });
  } catch (err: any) {
    return sendError(res, 400, 'CSV_VALIDATION_FAILED', err.message);
  }
});

apiRouter.get('/uploads/:id', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const resUpload = await db.query(
    'SELECT * FROM clarity_app.uploads WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user!.id]
  );

  if (resUpload.rows.length === 0) {
    return sendError(res, 404, 'UPLOAD_NOT_FOUND', 'Upload record not found.');
  }

  const u = resUpload.rows[0];
  res.json({
    id: u.id,
    originalFilename: u.original_filename,
    sizeBytes: Number(u.size_bytes),
    checksum: u.checksum,
    status: u.status,
    stage: u.stage,
    totalRows: u.parsed_rows,
    totalColumns: u.parsed_columns,
    columns: JSON.parse(u.inferred_schema_json || '[]'),
    previewRows: JSON.parse(u.preview_rows_json || '[]'),
    issues: JSON.parse(u.issues_json || '[]'),
    errorMessage: u.error_message,
  });
});

apiRouter.delete('/uploads/:id', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  await db.query(
    'DELETE FROM clarity_app.uploads WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user!.id]
  );
  res.json({ success: true, message: 'Upload draft discarded safely.' });
});

// ----------------------------------------------------
// Import Dataset from Upload
// ----------------------------------------------------
apiRouter.post('/datasets/import', requireAuth, async (req: AuthRequest, res) => {
  const { uploadId, datasetName, tableName } = req.body;
  if (!uploadId) {
    return sendError(res, 400, 'INVALID_INPUT', 'uploadId is required.');
  }

  const db = await getDb();
  const uploadRes = await db.query(
    'SELECT * FROM clarity_app.uploads WHERE id = $1 AND owner_id = $2',
    [uploadId, req.user!.id]
  );

  if (uploadRes.rows.length === 0) {
    return sendError(res, 404, 'UPLOAD_NOT_FOUND', 'Upload record not found or expired.');
  }

  const upload = uploadRes.rows[0];
  const columns = JSON.parse(upload.inferred_schema_json || '[]');
  const allRows = JSON.parse(upload.staged_data_json || '[]');

  const finalDatasetName = datasetName?.trim() || upload.original_filename.replace(/\.[^/.]+$/, '');
  const rawTableName = tableName?.trim() || upload.original_filename.replace(/\.[^/.]+$/, '');
  const finalTableName = sanitizeIdentifier(rawTableName);

  const datasetId = crypto.randomUUID();
  const internalSchema = `data_${crypto.randomBytes(6).toString('hex')}`;

  try {
    // 1. Create dataset entry
    await db.query(
      `INSERT INTO clarity_app.datasets (
        id, organization_id, owner_id, created_by, updated_by, display_name, internal_schema, engine, is_active, lifecycle_state
      ) VALUES ($1, $2, $3, $3, $3, $4, $5, 'PostgreSQL', true, 'active')`,
      [datasetId, req.user?.organization?.id || null, req.user!.id, finalDatasetName, internalSchema]
    );

    // If org exists and creator is admin, grant default permission
    if (req.user?.membership?.id) {
      await db.query(`
        INSERT INTO clarity_app.database_permissions (
          id, membership_id, database_id, can_read, can_insert, can_update, can_delete_records, can_import_csv, can_export, granted_by
        ) VALUES ($1, $2, $3, true, true, true, true, true, true, $4)
        ON CONFLICT (membership_id, database_id) DO NOTHING
      `, [crypto.randomUUID(), req.user.membership.id, datasetId, req.user.id]);
    }

    // 2. Create and populate table
    const result = await createAndPopulateTable(db, internalSchema, finalTableName, columns, allRows);

    // 3. Register table in dataset_tables
    await db.query(
      `INSERT INTO clarity_app.dataset_tables (id, dataset_id, table_name, row_count, row_count_type)
       VALUES ($1, $2, $3, $4, 'exact')`,
      [crypto.randomUUID(), datasetId, finalTableName, result.rowCount]
    );

    // 4. Extract schema
    const schemaMeta = await extractSchemaMetadata(db, datasetId, internalSchema);

    // 5. Mark upload completed and free staging memory
    await db.query(
      `UPDATE clarity_app.uploads
       SET status = 'completed', stage = 'imported', staged_data_json = NULL
       WHERE id = $1`,
      [uploadId]
    );

    // 6. Log audit event
    if (req.user?.organization?.id) {
      await logAuditEvent(db, {
        organizationId: req.user.organization.id,
        actorId: req.user.id,
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'DATABASE_CREATED',
        targetType: 'database',
        targetId: datasetId,
        targetName: finalDatasetName,
        summary: `Imported dataset "${finalDatasetName}" with table "${finalTableName}" (${result.rowCount} rows).`,
        affectedRows: result.rowCount,
      });
    }

    // 6. Notification
    await db.query(
      `INSERT INTO clarity_app.notifications (id, owner_id, title, message, event_type, related_entity_type, related_entity_id)
       VALUES ($1, $2, 'Your database is ready.', $3, 'dataset_ready', 'dataset', $4)`,
      [
        crypto.randomUUID(),
        req.user!.id,
        `Analytical dataset "${finalDatasetName}" created with ${result.rowCount} rows.`,
        datasetId,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Your database is ready.',
      dataset: {
        id: datasetId,
        displayName: finalDatasetName,
        internalSchema,
        table: finalTableName,
        rowCount: result.rowCount,
        schema: schemaMeta,
      },
    });
  } catch (err: any) {
    return sendError(res, 500, 'IMPORT_FAILED', `Failed to create analytical dataset: ${err.message}`);
  }
});

// ----------------------------------------------------
// Schema & Connectivity
// ----------------------------------------------------
apiRouter.get('/datasets/:id/schema', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const datasetRes = await db.query(
    'SELECT * FROM clarity_app.datasets WHERE id = $1',
    [req.params.id]
  );

  if (datasetRes.rows.length === 0) {
    return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
  }

  const ds = datasetRes.rows[0];
  const authCheck = authorizeOperation(
    req.user,
    { organizationId: ds.organization_id, databaseId: ds.id, databaseLifecycleState: ds.lifecycle_state },
    'read'
  );

  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }
  const snapshotRes = await db.query(
    'SELECT * FROM clarity_app.schema_snapshots WHERE dataset_id = $1 ORDER BY created_at DESC LIMIT 1',
    [ds.id]
  );

  if (snapshotRes.rows.length === 0) {
    const meta = await extractSchemaMetadata(db, ds.id, ds.internal_schema);
    return res.json(meta);
  }

  const s = snapshotRes.rows[0];
  res.json({
    datasetId: ds.id,
    schemaName: ds.internal_schema,
    tables: JSON.parse(s.schema_json),
    fingerprint: s.fingerprint,
    extractedAt: s.created_at,
  });
});

apiRouter.post('/datasets/:id/schema/refresh', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const datasetRes = await db.query(
    'SELECT * FROM clarity_app.datasets WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user!.id]
  );

  if (datasetRes.rows.length === 0) {
    return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
  }

  const ds = datasetRes.rows[0];
  const meta = await extractSchemaMetadata(db, ds.id, ds.internal_schema);
  res.json({
    success: true,
    message: 'Schema metadata refreshed.',
    schema: meta,
  });
});

apiRouter.post('/datasets/:id/reconnect', requireAuth, async (req: AuthRequest, res) => {
  const readiness = await checkDbReadiness();
  res.json({
    success: readiness.ready,
    engine: readiness.engine,
    message: readiness.ready ? 'Database connected and verified.' : 'Database connection unavailable.',
  });
});

// ----------------------------------------------------
// Natural Language Analysis & Query Preparation
// ----------------------------------------------------
apiRouter.post('/analyses', requireAuth, async (req: AuthRequest, res) => {
  const { datasetId, question } = req.body;
  if (!datasetId || !question || !question.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'datasetId and question are required.');
  }

  const db = await getDb();
  const datasetRes = await db.query(
    'SELECT * FROM clarity_app.datasets WHERE id = $1',
    [datasetId]
  );

  if (datasetRes.rows.length === 0) {
    return sendError(res, 404, 'DATASET_NOT_FOUND', 'Dataset not found.');
  }

  const ds = datasetRes.rows[0];
  const authCheck = authorizeOperation(
    req.user,
    { organizationId: ds.organization_id, databaseId: ds.id, databaseLifecycleState: ds.lifecycle_state },
    'read'
  );

  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const analysisId = crypto.randomUUID();
  await db.query(
    `INSERT INTO clarity_app.analyses (id, owner_id, dataset_id, question, status)
     VALUES ($1, $2, $3, $4, 'draft')`,
    [analysisId, req.user!.id, datasetId, question.trim()]
  );

  res.status(201).json({ analysisId, status: 'draft' });
});

apiRouter.post('/analyses/:id/prepare', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const analysisRes = await db.query(
    `SELECT a.*, d.internal_schema
     FROM clarity_app.analyses a
     JOIN clarity_app.datasets d ON a.dataset_id = d.id
     WHERE a.id = $1 AND a.owner_id = $2`,
    [req.params.id, req.user!.id]
  );

  if (analysisRes.rows.length === 0) {
    return sendError(res, 404, 'ANALYSIS_NOT_FOUND', 'Analysis record not found.');
  }

  const analysis = analysisRes.rows[0];

  // Update status to preparing
  await db.query(`UPDATE clarity_app.analyses SET status = 'preparing' WHERE id = $1`, [analysis.id]);

  // Load schema metadata
  const schemaRes = await db.query(
    `SELECT * FROM clarity_app.schema_snapshots WHERE dataset_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [analysis.dataset_id]
  );

  let tables: any[] = [];
  let fingerprint = '';

  if (schemaRes.rows.length > 0) {
    tables = JSON.parse(schemaRes.rows[0].schema_json);
    fingerprint = schemaRes.rows[0].fingerprint;
  } else {
    const meta = await extractSchemaMetadata(db, analysis.dataset_id, analysis.internal_schema);
    tables = meta.tables;
    fingerprint = meta.fingerprint;
  }

  if (tables.length === 0) {
    return sendError(res, 400, 'EMPTY_DATASET', 'The active dataset contains no tables.');
  }

  try {
    // 1. Question understanding
    const interpretation = await understandQuestion(analysis.question, tables);

    if (interpretation.status === 'needs_clarification') {
      await db.query(
        `UPDATE clarity_app.analyses
         SET status = 'needs_clarification', summary = $1, clarification_question = $2
         WHERE id = $3`,
        [interpretation.summary, interpretation.clarificationQuestion, analysis.id]
      );
      return res.json({
        analysisId: analysis.id,
        status: 'needs_clarification',
        interpretation,
      });
    }

    if (interpretation.status === 'unsupported') {
      await db.query(
        `UPDATE clarity_app.analyses SET status = 'unsupported', summary = $1 WHERE id = $2`,
        [interpretation.summary, analysis.id]
      );
      return res.json({
        analysisId: analysis.id,
        status: 'unsupported',
        interpretation,
      });
    }

    // 2. SQL generation & bounded correction
    const genResult = await generateSqlWithCorrection(analysis.question, interpretation, tables);

    // Save attempts to clarity_app.sql_attempts
    for (const att of genResult.attempts) {
      await db.query(
        `INSERT INTO clarity_app.sql_attempts (
           id, analysis_id, attempt_number, sql_text, params_json, validation_report_json, correction_reason
         ) VALUES ($1, $2, $3, $4, '[]', $5, $6)`,
        [
          crypto.randomUUID(),
          analysis.id,
          att.attemptNumber,
          att.sql,
          JSON.stringify(att.report),
          att.correctionReason || null,
        ]
      );
    }

    if (!genResult.report.isValid) {
      await db.query(
        `UPDATE clarity_app.analyses SET status = 'failed', summary = $1 WHERE id = $2`,
        [interpretation.summary, analysis.id]
      );
      return sendError(res, 422, 'VALIDATION_FAILED', `Generated SQL failed AST validation: ${genResult.report.errors.join('; ')}`);
    }

    // 3. Create immutable preview
    const previewId = await createPreview(
      db,
      analysis.id,
      req.user!.id,
      analysis.dataset_id,
      fingerprint,
      genResult.sql,
      [],
      config.maxResultRows,
      genResult.report
    );

    const digest = computePreviewDigest(
      req.user!.id,
      analysis.dataset_id,
      fingerprint,
      genResult.sql,
      [],
      config.maxResultRows
    );

    // Update analysis status
    await db.query(
      `UPDATE clarity_app.analyses
       SET status = 'ready_for_review', summary = $1, measure = $2, aggregation = $3,
           group_by_json = $4, filters_json = $5, sort_json = $6
       WHERE id = $7`,
      [
        interpretation.summary,
        interpretation.measure || null,
        interpretation.aggregation || null,
        JSON.stringify(interpretation.groupBy),
        JSON.stringify(interpretation.filters),
        JSON.stringify(interpretation.sort),
        analysis.id,
      ]
    );

    res.json({
      analysisId: analysis.id,
      status: 'ready_for_review',
      message: 'Ready for your review. This query has not run.',
      interpretation,
      preview: {
        id: previewId,
        sql: genResult.sql,
        params: [],
        resultLimit: config.maxResultRows,
        digest,
        validationReport: genResult.report,
        attemptsCount: genResult.attempts.length,
        attempts: genResult.attempts,
      },
    });
  } catch (err: any) {
    await db.query(`UPDATE clarity_app.analyses SET status = 'failed' WHERE id = $1`, [analysis.id]);
    return sendError(res, 500, 'PREPARATION_FAILED', err.message);
  }
});

apiRouter.get('/analyses/:id', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const resAnalysis = await db.query(
    `SELECT a.*,
            p.id as preview_id, p.sql_text, p.params_json, p.digest, p.validation_report_json, p.is_consumed,
            e.id as execution_id, e.status as execution_status, e.duration_ms, e.started_at as exec_started,
            r.columns_json, r.rows_json, r.total_rows, r.is_capped,
            i.summary as insight_summary, i.explanation as insight_explanation,
            i.evidence_json, i.chart_recommendation_json
     FROM clarity_app.analyses a
     LEFT JOIN clarity_app.previews p ON a.id = p.analysis_id
     LEFT JOIN clarity_app.executions e ON p.id = e.preview_id
     LEFT JOIN clarity_app.result_snapshots r ON e.id = r.execution_id
     LEFT JOIN clarity_app.insights i ON e.id = i.execution_id
     WHERE a.id = $1 AND a.owner_id = $2
     ORDER BY p.created_at DESC LIMIT 1`,
    [req.params.id, req.user!.id]
  );

  if (resAnalysis.rows.length === 0) {
    return sendError(res, 404, 'ANALYSIS_NOT_FOUND', 'Analysis record not found.');
  }

  const a = resAnalysis.rows[0];

  // Fetch attempts
  const attemptsRes = await db.query(
    `SELECT attempt_number, sql_text, validation_report_json, correction_reason
     FROM clarity_app.sql_attempts
     WHERE analysis_id = $1 ORDER BY attempt_number ASC`,
    [a.id]
  );

  res.json({
    id: a.id,
    question: a.question,
    status: a.status,
    summary: a.summary,
    measure: a.measure,
    aggregation: a.aggregation,
    groupBy: JSON.parse(a.group_by_json || '[]'),
    filters: JSON.parse(a.filters_json || '[]'),
    sort: JSON.parse(a.sort_json || '[]'),
    clarificationQuestion: a.clarification_question,
    createdAt: a.created_at,
    attempts: attemptsRes.rows.map(att => ({
      attemptNumber: att.attempt_number,
      sql: att.sql_text,
      report: JSON.parse(att.validation_report_json),
      correctionReason: att.correction_reason,
    })),
    preview: a.preview_id ? {
      id: a.preview_id,
      sql: a.sql_text,
      params: JSON.parse(a.params_json || '[]'),
      digest: a.digest,
      validationReport: JSON.parse(a.validation_report_json || '{}'),
      isConsumed: a.is_consumed,
    } : null,
    execution: a.execution_id ? {
      id: a.execution_id,
      status: a.execution_status,
      durationMs: a.duration_ms,
      totalRows: a.total_rows || 0,
      isCapped: Boolean(a.is_capped),
      columns: a.columns_json ? JSON.parse(a.columns_json) : [],
      rows: a.rows_json ? JSON.parse(a.rows_json) : [],
      insight: a.insight_summary ? {
        summary: a.insight_summary,
        explanation: a.insight_explanation,
        evidence: JSON.parse(a.evidence_json || '[]'),
        chartRecommendation: JSON.parse(a.chart_recommendation_json || '{}'),
      } : null,
    } : null,
  });
});

// ----------------------------------------------------
// Preview Confirmation & Execution
// ----------------------------------------------------
apiRouter.post('/previews/:id/confirm', requireAuth, async (req: AuthRequest, res) => {
  const { digest, idempotencyKey } = req.body;

  try {
    const result = await confirmAndExecuteQuery(
      req.params.id,
      req.user!.id,
      digest,
      idempotencyKey
    );

    res.json({
      success: true,
      message: 'Query executed successfully.',
      result,
    });
  } catch (err: any) {
    const status = err.code === 'PREVIEW_NOT_FOUND' ? 404 :
                   err.code === 'SCHEMA_CHANGED' ? 409 :
                   err.code === 'PREVIEW_EXPIRED' ? 410 : 400;

    return sendError(res, status, err.code || 'EXECUTION_FAILED', err.message || 'Execution failed.', err.retryable);
  }
});

// ----------------------------------------------------
// Results, Grounded Insights & CSV Export
// ----------------------------------------------------
apiRouter.get('/executions/:id/result', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const execRes = await db.query(
    `SELECT e.*, r.columns_json, r.rows_json, r.total_rows, r.is_capped, r.size_bytes,
            i.summary as insight_summary, i.explanation as insight_explanation,
            i.evidence_json, i.chart_recommendation_json
     FROM clarity_app.executions e
     LEFT JOIN clarity_app.result_snapshots r ON e.id = r.execution_id
     LEFT JOIN clarity_app.insights i ON e.id = i.execution_id
     WHERE e.id = $1 AND e.owner_id = $2`,
    [req.params.id, req.user!.id]
  );

  if (execRes.rows.length === 0) {
    return sendError(res, 404, 'EXECUTION_NOT_FOUND', 'Execution result not found.');
  }

  const e = execRes.rows[0];
  res.json({
    id: e.id,
    previewId: e.preview_id,
    analysisId: e.analysis_id,
    status: e.status,
    durationMs: e.duration_ms,
    columns: e.columns_json ? JSON.parse(e.columns_json) : [],
    rows: e.rows_json ? JSON.parse(e.rows_json) : [],
    totalRows: e.total_rows || 0,
    isCapped: Boolean(e.is_capped),
    sizeBytes: Number(e.size_bytes || 0),
    insight: e.insight_summary ? {
      summary: e.insight_summary,
      explanation: e.insight_explanation,
      evidence: JSON.parse(e.evidence_json || '[]'),
      chartRecommendation: JSON.parse(e.chart_recommendation_json || '{}'),
    } : null,
  });
});

apiRouter.post('/executions/:id/insight/retry', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const execRes = await db.query(
    `SELECT e.*, a.question, a.summary as analysis_summary, r.columns_json, r.rows_json
     FROM clarity_app.executions e
     JOIN clarity_app.analyses a ON e.analysis_id = a.id
     JOIN clarity_app.result_snapshots r ON e.id = r.execution_id
     WHERE e.id = $1 AND e.owner_id = $2`,
    [req.params.id, req.user!.id]
  );

  if (execRes.rows.length === 0) {
    return sendError(res, 404, 'EXECUTION_NOT_FOUND', 'Execution result not found.');
  }

  const e = execRes.rows[0];
  const columns = (JSON.parse(e.columns_json) as any[]).map(c => c.name);
  const rows = JSON.parse(e.rows_json);

  try {
    const insight = await generateGroundedInsights(
      e.question,
      e.analysis_summary || e.question,
      columns,
      rows
    );

    // Upsert insight
    await db.query(
      `DELETE FROM clarity_app.insights WHERE execution_id = $1`,
      [e.id]
    );

    await db.query(
      `INSERT INTO clarity_app.insights (
         id, execution_id, summary, explanation, evidence_json, chart_recommendation_json, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'ready')`,
      [
        crypto.randomUUID(),
        e.id,
        insight.summary,
        insight.explanation,
        JSON.stringify(insight.evidence),
        JSON.stringify(insight.chartRecommendation),
      ]
    );

    res.json({ success: true, insight });
  } catch (err: any) {
    return sendError(res, 500, 'INSIGHT_FAILED', err.message);
  }
});

apiRouter.get('/executions/:id/export.csv', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const execRes = await db.query(
    `SELECT e.*, a.question, r.columns_json, r.rows_json
     FROM clarity_app.executions e
     JOIN clarity_app.analyses a ON e.analysis_id = a.id
     JOIN clarity_app.result_snapshots r ON e.id = r.execution_id
     WHERE e.id = $1 AND e.owner_id = $2`,
    [req.params.id, req.user!.id]
  );

  if (execRes.rows.length === 0) {
    return sendError(res, 404, 'EXECUTION_NOT_FOUND', 'Execution result not found.');
  }

  const e = execRes.rows[0];
  const columns: { name: string }[] = JSON.parse(e.columns_json);
  let rows: Record<string, any>[] = JSON.parse(e.rows_json);

  // Apply optional client filters if requested
  const filterCol = req.query.filterCol as string | undefined;
  const filterVal = req.query.filterVal as string | undefined;
  if (filterCol && filterVal) {
    rows = rows.filter(r => String(r[filterCol] ?? '').toLowerCase().includes(filterVal.toLowerCase()));
  }

  // Generate safe CSV lines with formula injection protection:
  // Prepend single quote (') if cell starts with =, +, -, @, \t, \r
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

  const headerLine = columns.map(c => escapeCell(c.name)).join(',');
  const rowLines = rows.map(r => columns.map(c => escapeCell(r[c.name])).join(','));
  const csvContent = [headerLine, ...rowLines].join('\r\n');

  const filename = `claritysql_export_${e.id.substring(0, 8)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(csvContent, 'utf-8'));
});

// ----------------------------------------------------
// History & Query Transparency
// ----------------------------------------------------
apiRouter.get('/history', requireAuth, async (req: AuthRequest, res) => {
  const { search, status, limit = '20', offset = '0' } = req.query;
  const db = await getDb();

  let sql = `
    SELECT a.id, a.question, a.status, a.summary, a.created_at,
           p.sql_text, p.digest,
           e.id as execution_id, e.status as execution_status, e.duration_ms, e.started_at,
           r.total_rows, r.is_capped,
           d.display_name as dataset_name
    FROM clarity_app.analyses a
    JOIN clarity_app.datasets d ON a.dataset_id = d.id
    LEFT JOIN clarity_app.previews p ON a.id = p.analysis_id
    LEFT JOIN clarity_app.executions e ON p.id = e.preview_id
    LEFT JOIN clarity_app.result_snapshots r ON e.id = r.execution_id
    WHERE a.owner_id = $1
  `;

  const params: any[] = [req.user!.id];

  if (search && typeof search === 'string') {
    params.push(`%${search.trim().toLowerCase()}%`);
    sql += ` AND LOWER(a.question) LIKE $${params.length}`;
  }

  if (status && typeof status === 'string' && status !== 'all') {
    params.push(status);
    sql += ` AND a.status = $${params.length}`;
  }

  sql += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  const historyRes = await db.query(sql, params);
  res.json({ history: historyRes.rows });
});

// ----------------------------------------------------
// Notifications
// ----------------------------------------------------
apiRouter.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  const notesRes = await db.query(
    `SELECT * FROM clarity_app.notifications
     WHERE owner_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [req.user!.id]
  );

  const unreadCount = notesRes.rows.filter(n => !n.is_read).length;
  res.json({ notifications: notesRes.rows, unreadCount });
});

apiRouter.patch('/notifications/:id', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  await db.query(
    `UPDATE clarity_app.notifications SET is_read = true WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user!.id]
  );
  res.json({ success: true });
});

apiRouter.post('/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  const db = await getDb();
  await db.query(
    `UPDATE clarity_app.notifications SET is_read = true WHERE owner_id = $1`,
    [req.user!.id]
  );
  res.json({ success: true });
});
