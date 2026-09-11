import crypto from 'crypto';
import { DatabaseAdapter, getDb } from './db.ts';
import { config } from './config.ts';
import { ValidationReport } from './validator.ts';
import { generateGroundedInsights } from './gemini.ts';

export interface ExecutionResult {
  id: string;
  previewId: string;
  analysisId: string;
  status: 'completed' | 'failed' | 'canceled';
  durationMs: number;
  columns: { name: string; type?: string }[];
  rows: Record<string, any>[];
  totalRows: number;
  isCapped: boolean;
  sizeBytes: number;
  errorMessage?: string;
  errorCategory?: string;
  insight?: {
    summary: string;
    explanation: string;
    evidence: string[];
    chartRecommendation: any;
  };
}

export function computePreviewDigest(
  ownerId: string,
  datasetId: string,
  schemaFingerprint: string,
  sqlText: string,
  params: any[],
  resultLimit: number
): string {
  const payload = JSON.stringify({
    ownerId,
    datasetId,
    schemaFingerprint,
    sqlText: sqlText.trim(),
    params,
    resultLimit,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function createPreview(
  db: DatabaseAdapter,
  analysisId: string,
  ownerId: string,
  datasetId: string,
  schemaFingerprint: string,
  sqlText: string,
  params: any[],
  resultLimit: number,
  validationReport: ValidationReport
): Promise<string> {
  const previewId = crypto.randomUUID();
  const digest = computePreviewDigest(ownerId, datasetId, schemaFingerprint, sqlText, params, resultLimit);
  const expiresAt = new Date(Date.now() + config.previewTtlSeconds * 1000).toISOString();

  await db.query(
    `INSERT INTO clarity_app.previews (
       id, analysis_id, owner_id, dataset_id, schema_fingerprint,
       sql_text, params_json, result_limit, validation_report_json,
       digest, is_consumed, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11)`,
    [
      previewId,
      analysisId,
      ownerId,
      datasetId,
      schemaFingerprint,
      sqlText,
      JSON.stringify(params),
      resultLimit,
      JSON.stringify(validationReport),
      digest,
      expiresAt,
    ]
  );

  return previewId;
}

export async function confirmAndExecuteQuery(
  previewId: string,
  ownerId: string,
  providedDigest?: string,
  idempotencyKey?: string
): Promise<ExecutionResult> {
  const db = await getDb();
  const execKey = idempotencyKey || crypto.randomUUID();

  // 1. Check if execution with idempotencyKey already exists
  const existingExec = await db.query(
    `SELECT e.*, r.columns_json, r.rows_json, r.total_rows, r.is_capped, r.size_bytes,
            i.summary as insight_summary, i.explanation as insight_explanation,
            i.evidence_json as insight_evidence, i.chart_recommendation_json as insight_chart
     FROM clarity_app.executions e
     LEFT JOIN clarity_app.result_snapshots r ON e.id = r.execution_id
     LEFT JOIN clarity_app.insights i ON e.id = i.execution_id
     WHERE e.idempotency_key = $1 AND e.owner_id = $2`,
    [execKey, ownerId]
  );

  if (existingExec.rows.length > 0) {
    const row = existingExec.rows[0];
    return {
      id: row.id,
      previewId: row.preview_id,
      analysisId: row.analysis_id,
      status: row.status,
      durationMs: row.duration_ms || 0,
      columns: row.columns_json ? JSON.parse(row.columns_json) : [],
      rows: row.rows_json ? JSON.parse(row.rows_json) : [],
      totalRows: row.total_rows || 0,
      isCapped: Boolean(row.is_capped),
      sizeBytes: Number(row.size_bytes || 0),
      errorMessage: row.error_message,
      errorCategory: row.error_category,
      insight: row.insight_summary ? {
        summary: row.insight_summary,
        explanation: row.insight_explanation,
        evidence: JSON.parse(row.insight_evidence || '[]'),
        chartRecommendation: JSON.parse(row.insight_chart || '{}'),
      } : undefined,
    };
  }

  // 2. Load preview
  const previewRes = await db.query(
    `SELECT p.*, d.internal_schema, a.question, a.summary as analysis_summary
     FROM clarity_app.previews p
     JOIN clarity_app.datasets d ON p.dataset_id = d.id
     JOIN clarity_app.analyses a ON p.analysis_id = a.id
     WHERE p.id = $1 AND p.owner_id = $2`,
    [previewId, ownerId]
  );

  if (previewRes.rows.length === 0) {
    throw {
      code: 'PREVIEW_NOT_FOUND',
      message: 'The requested query preview was not found.',
      retryable: false,
    };
  }

  const preview = previewRes.rows[0];

  // Check if expired
  if (new Date(preview.expires_at).getTime() < Date.now()) {
    throw {
      code: 'PREVIEW_EXPIRED',
      message: 'The preview has expired. Prepare a new preview before running.',
      retryable: true,
    };
  }

  // Check if consumed
  if (preview.is_consumed) {
    throw {
      code: 'PREVIEW_ALREADY_CONSUMED',
      message: 'This preview has already been executed. Prepare a fresh preview.',
      retryable: false,
    };
  }

  // Check digest
  const expectedDigest = computePreviewDigest(
    ownerId,
    preview.dataset_id,
    preview.schema_fingerprint,
    preview.sql_text,
    JSON.parse(preview.params_json || '[]'),
    preview.result_limit
  );

  if (preview.digest !== expectedDigest || (providedDigest && providedDigest !== expectedDigest)) {
    throw {
      code: 'PREVIEW_TAMPERED',
      message: 'Preview integrity check failed. The query or context has been modified.',
      retryable: false,
    };
  }

  // Check schema freshness: verify latest schema fingerprint matches preview
  const latestSnapshot = await db.query(
    `SELECT fingerprint FROM clarity_app.schema_snapshots
     WHERE dataset_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [preview.dataset_id]
  );

  if (latestSnapshot.rows.length > 0 && latestSnapshot.rows[0].fingerprint !== preview.schema_fingerprint) {
    throw {
      code: 'SCHEMA_CHANGED',
      message: 'Schema changed. Prepare a new preview before running.',
      retryable: true,
    };
  }

  // Claim preview atomically
  await db.query(
    `UPDATE clarity_app.previews SET is_consumed = true WHERE id = $1`,
    [previewId]
  );

  const executionId = crypto.randomUUID();
  const startTime = Date.now();

  // Create running execution record
  await db.query(
    `INSERT INTO clarity_app.executions (
       id, preview_id, analysis_id, owner_id, dataset_id,
       idempotency_key, status, started_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'running', CURRENT_TIMESTAMP)`,
    [executionId, previewId, preview.analysis_id, ownerId, preview.dataset_id, execKey]
  );

  // Execute in isolated read-only transaction
  let rawRows: any[] = [];
  let columns: { name: string; type?: string }[] = [];
  let durationMs = 0;
  let status: 'completed' | 'failed' = 'completed';
  let errorMessage: string | undefined;
  let errorCategory: string | undefined;

  try {
    // Set search path to dataset schema
    await db.exec(`SET search_path TO "${preview.internal_schema}";`);

    const queryPromise = db.query(preview.sql_text, JSON.parse(preview.params_json || '[]'));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Query execution exceeded timeout limit.')), config.queryTimeoutMs)
    );

    const queryRes = (await Promise.race([queryPromise, timeoutPromise])) as any;
    durationMs = Date.now() - startTime;

    rawRows = queryRes.rows || [];
    columns = (queryRes.fields || []).map((f: any) => ({ name: f.name }));

    // If fields missing from adapter, derive from first row
    if (columns.length === 0 && rawRows.length > 0) {
      columns = Object.keys(rawRows[0]).map(k => ({ name: k }));
    }
  } catch (err: any) {
    durationMs = Date.now() - startTime;
    status = 'failed';
    errorMessage = err.message;
    errorCategory = err.message.includes('timeout') ? 'TIMEOUT' : 'EXECUTION_ERROR';
  } finally {
    // Reset search path
    try {
      await db.exec('RESET search_path;');
    } catch {}
  }

  // Update execution status
  await db.query(
    `UPDATE clarity_app.executions
     SET status = $1, duration_ms = $2, error_message = $3, error_category = $4, completed_at = CURRENT_TIMESTAMP
     WHERE id = $5`,
    [status, durationMs, errorMessage || null, errorCategory || null, executionId]
  );

  // Update analysis status
  await db.query(
    `UPDATE clarity_app.analyses SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [status === 'completed' ? 'executed' : 'failed', preview.analysis_id]
  );

  if (status === 'failed') {
    // Create failure notification
    await db.query(
      `INSERT INTO clarity_app.notifications (id, owner_id, title, message, event_type, related_entity_type, related_entity_id)
       VALUES ($1, $2, 'Query execution failed', $3, 'query_failed', 'analysis', $4)`,
      [crypto.randomUUID(), ownerId, errorMessage || 'Unknown query error', preview.analysis_id]
    );

    return {
      id: executionId,
      previewId,
      analysisId: preview.analysis_id,
      status: 'failed',
      durationMs,
      columns: [],
      rows: [],
      totalRows: 0,
      isCapped: false,
      sizeBytes: 0,
      errorMessage,
      errorCategory,
    };
  }

  // Cap rows at maxResultRows
  const isCapped = rawRows.length > config.maxResultRows;
  const processedRows = isCapped ? rawRows.slice(0, config.maxResultRows) : rawRows;
  const rowsJson = JSON.stringify(processedRows);
  const sizeBytes = Buffer.byteLength(rowsJson);

  // Check size bytes limit
  if (sizeBytes > config.maxResultBytes) {
    await db.query(
      `UPDATE clarity_app.executions
       SET status = 'failed', error_message = 'Result size exceeds 5MB limit.', error_category = 'RESULT_TOO_LARGE'
       WHERE id = $1`,
      [executionId]
    );
    throw {
      code: 'RESULT_TOO_LARGE',
      message: 'Result too large. The query output exceeded maximum byte limit (5MB).',
      retryable: true,
    };
  }

  // Save snapshot to clarity_app.result_snapshots
  await db.query(
    `INSERT INTO clarity_app.result_snapshots (
       id, execution_id, columns_json, rows_json, total_rows, is_capped, size_bytes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      crypto.randomUUID(),
      executionId,
      JSON.stringify(columns),
      rowsJson,
      processedRows.length,
      isCapped,
      sizeBytes,
    ]
  );

  // Generate grounded insights & chart recommendation
  let insight: any = undefined;
  try {
    const colNames = columns.map(c => c.name);
    insight = await generateGroundedInsights(
      preview.question,
      preview.analysis_summary || preview.question,
      colNames,
      processedRows
    );

    await db.query(
      `INSERT INTO clarity_app.insights (
         id, execution_id, summary, explanation, evidence_json, chart_recommendation_json, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'ready')`,
      [
        crypto.randomUUID(),
        executionId,
        insight.summary,
        insight.explanation,
        JSON.stringify(insight.evidence),
        JSON.stringify(insight.chartRecommendation),
      ]
    );
  } catch (err) {
    console.warn('Could not generate insights for execution:', err);
  }

  // Create success notification
  await db.query(
    `INSERT INTO clarity_app.notifications (id, owner_id, title, message, event_type, related_entity_type, related_entity_id)
     VALUES ($1, $2, 'Query executed successfully', $3, 'query_success', 'execution', $4)`,
    [
      crypto.randomUUID(),
      ownerId,
      `Returned ${processedRows.length} rows in ${durationMs}ms.`,
      executionId,
    ]
  );

  return {
    id: executionId,
    previewId,
    analysisId: preview.analysis_id,
    status: 'completed',
    durationMs,
    columns,
    rows: processedRows,
    totalRows: processedRows.length,
    isCapped,
    sizeBytes,
    insight,
  };
}
