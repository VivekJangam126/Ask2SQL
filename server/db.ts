import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { config } from './config.ts';
import {
  resolveDatabaseConfiguration,
  ConnectionHealthStatus,
  categorizeConnectionError,
} from './db-config-resolver.ts';
import { seedDemoOrganizationsAndUsers } from './demo-seed.ts';

const { Pool } = pg;

export interface QueryResultRow {
  [column: string]: any;
}

export interface DatabaseAdapter {
  query<R extends QueryResultRow = any>(sql: string, params?: any[]): Promise<{ rows: R[]; rowCount: number; fields?: { name: string; dataTypeID?: number }[] }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  isReady(): boolean;
  getEngine(): string;
  getPool?(): pg.Pool | null;
}

let appDbInstance: DatabaseAdapter | null = null;
let analyticsReadDbInstance: DatabaseAdapter | null = null;
let pgAppPool: pg.Pool | null = null;
let pgAnalyticsReadPool: pg.Pool | null = null;
let pgliteInstance: PGlite | null = null;
let lastHealthCheck: ConnectionHealthStatus | null = null;

class PgliteAdapter implements DatabaseAdapter {
  private pglite: PGlite;
  private ready: boolean = false;

  constructor(pglite: PGlite) {
    this.pglite = pglite;
    this.ready = true;
  }

  async query<R extends QueryResultRow = any>(sql: string, params?: any[]) {
    const res = await this.pglite.query(sql, params);
    return {
      rows: (res.rows || []) as R[],
      rowCount: (res.rows || []).length,
      fields: res.fields?.map((f: any) => ({ name: f.name, dataTypeID: f.dataTypeID })) || [],
    };
  }

  async exec(sql: string) {
    await this.pglite.exec(sql);
  }

  async close() {
    this.ready = false;
    await this.pglite.close();
  }

  isReady() {
    return this.ready;
  }

  getEngine() {
    return 'PostgreSQL (PGlite embedded)';
  }
}

class PgPoolAdapter implements DatabaseAdapter {
  private pool: pg.Pool;
  private ready: boolean = false;
  private label: string;

  constructor(pool: pg.Pool, label: string = 'PostgreSQL (External Pool)') {
    this.pool = pool;
    this.ready = true;
    this.label = label;
  }

  async query<R extends QueryResultRow = any>(sql: string, params?: any[]) {
    const res = await this.pool.query(sql, params);
    return {
      rows: res.rows as R[],
      rowCount: res.rowCount || res.rows.length,
      fields: res.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
    };
  }

  async exec(sql: string) {
    await this.pool.query(sql);
  }

  async close() {
    this.ready = false;
    await this.pool.end();
  }

  isReady() {
    return this.ready;
  }

  getEngine() {
    return this.label;
  }

  getPool() {
    return this.pool;
  }
}

/**
 * Initializes and returns the primary application persistence database adapter.
 * Uses resolved role-specific URLs (APP_DATABASE_URL or DATABASE_URL).
 * If live database is configured, failures are raised instead of silently falling back to mock.
 */
export async function getDb(): Promise<DatabaseAdapter> {
  if (appDbInstance && appDbInstance.isReady()) {
    return appDbInstance;
  }

  const resolved = resolveDatabaseConfiguration();

  if (resolved.hasConfiguredDatabase && resolved.appDatabaseUrl) {
    const startTime = Date.now();
    try {
      console.log(`[Database] Connecting to PostgreSQL via resolved source: ${resolved.appSourceVar}...`);
      
      pgAppPool = new Pool({
        connectionString: resolved.appDatabaseUrl,
        max: 15,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 8000,
      });

      // Verify connection and database identity
      const verifyRes = await pgAppPool.query('SELECT current_database() as db, current_user as usr, version() as ver');
      const latencyMs = Date.now() - startTime;
      const dbInfo = verifyRes.rows[0];

      appDbInstance = new PgPoolAdapter(pgAppPool, 'PostgreSQL (Live Server)');
      console.log(`[Database] Connected to PostgreSQL "${dbInfo.db}" as user "${dbInfo.usr}" (${latencyMs}ms).`);

      // Initialize analytics read pool if separate URL is configured
      if (resolved.analyticsReadDatabaseUrl && resolved.analyticsReadDatabaseUrl !== resolved.appDatabaseUrl) {
        try {
          console.log(`[Database] Initializing dedicated analytics read pool via ${resolved.analyticsReadSourceVar}...`);
          pgAnalyticsReadPool = new Pool({
            connectionString: resolved.analyticsReadDatabaseUrl,
            max: 15,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 8000,
          });
          await pgAnalyticsReadPool.query('SELECT 1');
          analyticsReadDbInstance = new PgPoolAdapter(pgAnalyticsReadPool, 'PostgreSQL (Analytics Read Pool)');
          console.log('[Database] Dedicated analytics read pool initialized.');
        } catch (readErr: any) {
          console.warn('[Database] Dedicated analytics read pool failed to connect, falling back to main pool:', readErr.message);
          analyticsReadDbInstance = appDbInstance;
        }
      } else {
        analyticsReadDbInstance = appDbInstance;
      }

      // Record successful health status
      lastHealthCheck = {
        status: 'connected',
        engine: 'PostgreSQL (Live Server)',
        sourceVar: resolved.appSourceVar,
        databaseName: dbInfo.db,
        currentUser: dbInfo.usr,
        serverVersion: dbInfo.ver?.split(' ')[1] || '16+',
        latencyMs,
        readPoolConfigured: Boolean(resolved.analyticsReadSourceVar && resolved.analyticsReadSourceVar !== resolved.appSourceVar),
        readPoolSourceVar: resolved.analyticsReadSourceVar,
        lastCheckedAt: new Date().toISOString(),
      };

      // Run migrations on external database
      await initMigrations(appDbInstance);
      return appDbInstance;
    } catch (err: any) {
      const categorized = categorizeConnectionError(err);
      console.error(`[Database Error] Failed to connect to PostgreSQL (${categorized.category}):`, categorized.message);
      
      lastHealthCheck = {
        status: 'disconnected',
        engine: 'PostgreSQL (Live Server - Disconnected)',
        sourceVar: resolved.appSourceVar,
        readPoolConfigured: Boolean(resolved.analyticsReadSourceVar),
        readPoolSourceVar: resolved.analyticsReadSourceVar,
        lastCheckedAt: new Date().toISOString(),
        error: categorized,
      };

      // In live mode with a configured database URL, DO NOT silently fall back to mock success!
      throw new Error(`Database connection failed (${categorized.category}): ${categorized.message}`);
    }
  }

  // Fallback ONLY when no external database URL has been configured at all
  console.log('[Database] No external PostgreSQL URL configured. Bootstrapping embedded PGlite for local development...');
  if (!fs.existsSync(config.pgDataDir)) {
    fs.mkdirSync(config.pgDataDir, { recursive: true });
  }

  pgliteInstance = new PGlite(config.pgDataDir);
  await pgliteInstance.waitReady;
  appDbInstance = new PgliteAdapter(pgliteInstance);
  analyticsReadDbInstance = appDbInstance;

  lastHealthCheck = {
    status: 'needs_setup',
    engine: 'PostgreSQL (PGlite embedded)',
    sourceVar: null,
    databaseName: 'pgdata_embedded',
    currentUser: 'postgres_local',
    latencyMs: 1,
    readPoolConfigured: false,
    readPoolSourceVar: null,
    lastCheckedAt: new Date().toISOString(),
  };

  await initMigrations(appDbInstance);
  return appDbInstance;
}

/**
 * Returns database adapter for analytical read queries.
 * Employs dedicated ANALYTICS_READ_DATABASE_URL if available, or app database pool.
 */
export async function getAnalyticsReadDb(): Promise<DatabaseAdapter> {
  if (analyticsReadDbInstance && analyticsReadDbInstance.isReady()) {
    return analyticsReadDbInstance;
  }
  await getDb();
  return analyticsReadDbInstance || appDbInstance!;
}

/**
 * Live connection readiness check for administrators and monitoring.
 */
export async function checkDbReadiness(): Promise<ConnectionHealthStatus> {
  const resolved = resolveDatabaseConfiguration();

  if (!resolved.hasConfiguredDatabase) {
    return {
      status: 'needs_setup',
      engine: 'PostgreSQL (Embedded Fallback)',
      sourceVar: null,
      readPoolConfigured: false,
      readPoolSourceVar: null,
      lastCheckedAt: new Date().toISOString(),
      error: {
        category: 'missing_configuration',
        message: 'No DATABASE_URL or APP_DATABASE_URL environment variable has been configured.',
      },
    };
  }

  try {
    const db = await getDb();
    const t0 = Date.now();
    const res = await db.query('SELECT current_database() as db, current_user as usr, version() as ver');
    const latencyMs = Date.now() - t0;
    const dbInfo = res.rows[0];

    return {
      status: 'connected',
      engine: db.getEngine(),
      sourceVar: resolved.appSourceVar,
      databaseName: dbInfo.db,
      currentUser: dbInfo.usr,
      serverVersion: dbInfo.ver?.split(' ')[1] || '16+',
      latencyMs,
      readPoolConfigured: Boolean(resolved.analyticsReadSourceVar && resolved.analyticsReadSourceVar !== resolved.appSourceVar),
      readPoolSourceVar: resolved.analyticsReadSourceVar,
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const categorized = categorizeConnectionError(err);
    return {
      status: 'disconnected',
      engine: 'PostgreSQL (Configured - Unreachable)',
      sourceVar: resolved.appSourceVar,
      readPoolConfigured: Boolean(resolved.analyticsReadSourceVar),
      readPoolSourceVar: resolved.analyticsReadSourceVar,
      lastCheckedAt: new Date().toISOString(),
      error: categorized,
    };
  }
}

export async function initMigrations(db: DatabaseAdapter) {
  console.log('[Migrations] Checking and running schema migrations for clarity_app...');
  
  // 1. Application control schema & core tables
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS clarity_app;

    CREATE TABLE IF NOT EXISTS clarity_app.organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      handle TEXT UNIQUE NOT NULL,
      state TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      account_state TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.organization_memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES clarity_app.organizations(id) ON DELETE CASCADE,
      role TEXT NOT NULL, -- 'ORG_ADMIN' | 'MEMBER'
      status TEXT NOT NULL, -- 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'INVITED'
      note TEXT,
      rejection_reason TEXT,
      permission_revision INTEGER NOT NULL DEFAULT 1,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMPTZ,
      approved_by TEXT REFERENCES clarity_app.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    );

    CREATE TABLE IF NOT EXISTS clarity_app.database_permissions (
      id TEXT PRIMARY KEY,
      membership_id TEXT NOT NULL REFERENCES clarity_app.organization_memberships(id) ON DELETE CASCADE,
      database_id TEXT NOT NULL,
      can_read BOOLEAN NOT NULL DEFAULT true,
      can_insert BOOLEAN NOT NULL DEFAULT false,
      can_update BOOLEAN NOT NULL DEFAULT false,
      can_delete_records BOOLEAN NOT NULL DEFAULT false,
      can_import_csv BOOLEAN NOT NULL DEFAULT false,
      can_export BOOLEAN NOT NULL DEFAULT false,
      version INTEGER NOT NULL DEFAULT 1,
      granted_by TEXT REFERENCES clarity_app.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(membership_id, database_id)
    );

    CREATE TABLE IF NOT EXISTS clarity_app.invitations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES clarity_app.organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      invited_by TEXT NOT NULL REFERENCES clarity_app.users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.datasets (
      id TEXT PRIMARY KEY,
      organization_id TEXT REFERENCES clarity_app.organizations(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      created_by TEXT REFERENCES clarity_app.users(id),
      updated_by TEXT REFERENCES clarity_app.users(id),
      display_name TEXT NOT NULL,
      description TEXT,
      internal_schema TEXT NOT NULL UNIQUE,
      engine TEXT NOT NULL DEFAULT 'PostgreSQL',
      access_policy TEXT NOT NULL DEFAULT 'ALL_MEMBERS', -- 'ADMIN_ONLY' | 'ALL_MEMBERS'
      is_active BOOLEAN NOT NULL DEFAULT true,
      lifecycle_state TEXT NOT NULL DEFAULT 'active',
      schema_revision INTEGER NOT NULL DEFAULT 1,
      data_revision INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.dataset_tables (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES clarity_app.datasets(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      row_count BIGINT NOT NULL DEFAULT 0,
      row_count_type TEXT NOT NULL DEFAULT 'exact',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.schema_snapshots (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES clarity_app.datasets(id) ON DELETE CASCADE,
      schema_json TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.uploads (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES clarity_app.datasets(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      size_bytes BIGINT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.analyses (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES clarity_app.datasets(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      intent_json TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.sql_proposals (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES clarity_app.analyses(id) ON DELETE CASCADE,
      sql_text TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '[]',
      validation_report_json TEXT NOT NULL,
      correction_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.previews (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES clarity_app.analyses(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      dataset_id TEXT NOT NULL REFERENCES clarity_app.datasets(id) ON DELETE CASCADE,
      schema_fingerprint TEXT NOT NULL,
      sql_text TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '[]',
      result_limit INTEGER NOT NULL DEFAULT 1000,
      validation_report_json TEXT NOT NULL,
      digest TEXT NOT NULL,
      is_consumed BOOLEAN NOT NULL DEFAULT false,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.executions (
      id TEXT PRIMARY KEY,
      preview_id TEXT NOT NULL REFERENCES clarity_app.previews(id) ON DELETE CASCADE,
      analysis_id TEXT NOT NULL REFERENCES clarity_app.analyses(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      dataset_id TEXT NOT NULL REFERENCES clarity_app.datasets(id) ON DELETE CASCADE,
      idempotency_key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      duration_ms INTEGER,
      error_message TEXT,
      error_category TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS clarity_app.result_snapshots (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL UNIQUE REFERENCES clarity_app.executions(id) ON DELETE CASCADE,
      columns_json TEXT NOT NULL,
      rows_json TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      is_capped BOOLEAN NOT NULL DEFAULT false,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.insights (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL UNIQUE REFERENCES clarity_app.executions(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      explanation TEXT NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      chart_recommendation_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.notifications (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      event_type TEXT NOT NULL,
      related_entity_type TEXT,
      related_entity_id TEXT,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.audit_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES clarity_app.organizations(id) ON DELETE CASCADE,
      actor_id TEXT REFERENCES clarity_app.users(id),
      actor_name TEXT,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_name TEXT,
      summary TEXT NOT NULL,
      details_json TEXT DEFAULT '{}',
      outcome TEXT NOT NULL DEFAULT 'success',
      affected_rows INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.operation_previews (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES clarity_app.organizations(id) ON DELETE CASCADE,
      database_id TEXT NOT NULL REFERENCES clarity_app.datasets(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      sql_text TEXT,
      plan_json TEXT NOT NULL,
      target_record_identities_json TEXT DEFAULT '[]',
      expected_affected_count INTEGER NOT NULL DEFAULT 0,
      permission_revision INTEGER NOT NULL DEFAULT 1,
      schema_revision INTEGER NOT NULL DEFAULT 1,
      data_revision INTEGER NOT NULL DEFAULT 1,
      digest TEXT NOT NULL,
      is_consumed BOOLEAN NOT NULL DEFAULT false,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.operations (
      id TEXT PRIMARY KEY,
      preview_id TEXT,
      actor_id TEXT NOT NULL REFERENCES clarity_app.users(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES clarity_app.organizations(id) ON DELETE CASCADE,
      database_id TEXT NOT NULL REFERENCES clarity_app.datasets(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      affected_count INTEGER DEFAULT 0,
      result_json TEXT DEFAULT '{}',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ
    );

    -- 2. Multi-Format Ingestion Jobs & Staging Tables (Section 5 & 6)
    CREATE TABLE IF NOT EXISTS clarity_app.ingestion_jobs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES clarity_app.organizations(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES clarity_app.users(id),
      source_file_name TEXT NOT NULL,
      source_file_type TEXT NOT NULL,
      source_file_size BIGINT NOT NULL,
      source_hash TEXT NOT NULL,
      format TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      extraction_status TEXT NOT NULL,
      source_coverage JSONB DEFAULT '{}',
      candidate_tables JSONB DEFAULT '[]',
      selected_tables JSONB DEFAULT '[]',
      column_mappings JSONB DEFAULT '{}',
      inferred_types JSONB DEFAULT '{}',
      total_rows_per_table JSONB DEFAULT '{}',
      issues JSONB DEFAULT '[]',
      transformations JSONB DEFAULT '[]',
      source_references JSONB DEFAULT '{}',
      proposed_relationships JSONB DEFAULT '[]',
      plan_revision INTEGER NOT NULL DEFAULT 1,
      plan_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      confirmed_at TIMESTAMPTZ,
      created_database_id TEXT,
      lifecycle_status TEXT NOT NULL DEFAULT 'staged', -- 'staged' | 'confirmed' | 'canceled' | 'expired'
      raw_file_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clarity_app.staged_rows (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES clarity_app.ingestion_jobs(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      data_json JSONB NOT NULL,
      raw_source_ref JSONB,
      is_excluded BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_staged_rows_job_table ON clarity_app.staged_rows(job_id, table_name, row_index);
    CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_org ON clarity_app.ingestion_jobs(organization_id, lifecycle_status);

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON clarity_app.sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_datasets_owner ON clarity_app.datasets(owner_id);
    CREATE INDEX IF NOT EXISTS idx_datasets_org ON clarity_app.datasets(organization_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON clarity_app.organization_memberships(user_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_org ON clarity_app.organization_memberships(organization_id);
    CREATE INDEX IF NOT EXISTS idx_db_perms_membership ON clarity_app.database_permissions(membership_id);
    CREATE INDEX IF NOT EXISTS idx_db_perms_db ON clarity_app.database_permissions(database_id);
    CREATE INDEX IF NOT EXISTS idx_audit_org ON clarity_app.audit_events(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analyses_owner ON clarity_app.analyses(owner_id);
    CREATE INDEX IF NOT EXISTS idx_analyses_dataset ON clarity_app.analyses(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_executions_owner ON clarity_app.executions(owner_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_owner ON clarity_app.notifications(owner_id, is_read);
  `);

  // Ensure columns exist on datasets table if previously created
  try {
    await db.exec(`
      ALTER TABLE clarity_app.datasets ADD COLUMN IF NOT EXISTS access_policy TEXT DEFAULT 'ALL_MEMBERS';
      ALTER TABLE clarity_app.datasets ADD COLUMN IF NOT EXISTS organization_id TEXT;
      ALTER TABLE clarity_app.datasets ADD COLUMN IF NOT EXISTS created_by TEXT;
      ALTER TABLE clarity_app.datasets ADD COLUMN IF NOT EXISTS updated_by TEXT;
      ALTER TABLE clarity_app.datasets ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE clarity_app.datasets ADD COLUMN IF NOT EXISTS lifecycle_state TEXT DEFAULT 'active';
      ALTER TABLE clarity_app.datasets ADD COLUMN IF NOT EXISTS schema_revision INTEGER DEFAULT 1;
      ALTER TABLE clarity_app.datasets ADD COLUMN IF NOT EXISTS data_revision INTEGER DEFAULT 1;
      ALTER TABLE clarity_app.users ADD COLUMN IF NOT EXISTS account_state TEXT DEFAULT 'active';
    `);
  } catch (err) {
    // Ignore if unsupported or already added
  }

  // Migrate legacy records: ensure all users and datasets belong to an organization
  await migrateLegacyData(db);

  // Initialize synthetic demo personas and organizations for demo mode
  await seedDemoOrganizationsAndUsers();

  console.log('[Migrations] Database migrations completed successfully.');
}

async function migrateLegacyData(db: DatabaseAdapter) {
  try {
    // Find users with no organization membership
    const usersWithoutOrg = await db.query<{ id: string; name: string; email: string }>(`
      SELECT u.id, u.name, u.email
      FROM clarity_app.users u
      LEFT JOIN clarity_app.organization_memberships m ON u.id = m.user_id
      WHERE m.id IS NULL
    `);

    for (const u of usersWithoutOrg.rows) {
      const orgId = `org-${u.id.slice(0, 8)}`;
      const baseHandle = u.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'org';
      const handle = `${baseHandle}-${u.id.slice(0, 4)}`;
      const orgName = `${u.name}'s Organization`;

      await db.query(`
        INSERT INTO clarity_app.organizations (id, name, handle, state)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (id) DO NOTHING
      `, [orgId, orgName, handle]);

      const membershipId = `mem-${u.id.slice(0, 8)}`;
      await db.query(`
        INSERT INTO clarity_app.organization_memberships (
          id, user_id, organization_id, role, status, permission_revision
        ) VALUES ($1, $2, $3, 'ORG_ADMIN', 'APPROVED', 1)
        ON CONFLICT (user_id) DO NOTHING
      `, [membershipId, u.id, orgId]);

      // Assign orphaned datasets owned by this user to their organization
      await db.query(`
        UPDATE clarity_app.datasets
        SET organization_id = $1, created_by = $2, updated_by = $2
        WHERE owner_id = $2 AND (organization_id IS NULL OR organization_id = '')
      `, [orgId, u.id]);
    }
  } catch (err) {
    console.warn('[Migrations] Legacy data migration warning:', err);
  }
}
