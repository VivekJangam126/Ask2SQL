import { URL } from 'url';
import pg from 'pg';

const { Pool } = pg;

export interface ResolvedDbConfig {
  hasConfiguredDatabase: boolean;
  appSourceVar: string | null;
  analyticsReadSourceVar: string | null;
  analyticsWriteSourceVar: string | null;
  appDatabaseUrl: string | null;
  analyticsReadDatabaseUrl: string | null;
  analyticsWriteDatabaseUrl: string | null;
  safeDiagnostics: {
    appDb: SafeDbTargetInfo;
    analyticsReadDb: SafeDbTargetInfo;
    analyticsWriteDb: SafeDbTargetInfo;
  };
}

export interface SafeDbTargetInfo {
  sourceVar: string | null;
  configured: boolean;
  validScheme: boolean;
  scheme: string | null;
  host: string | null;
  port: string | null;
  database: string | null;
  hasUser: boolean;
  hasPassword: boolean;
  sslMode: string | null;
  formatIssue?: string;
}

export interface ConnectionHealthStatus {
  status: 'connected' | 'disconnected' | 'needs_setup';
  engine: string;
  sourceVar: string | null;
  databaseName?: string;
  currentUser?: string;
  serverVersion?: string;
  latencyMs?: number;
  readPoolConfigured: boolean;
  readPoolSourceVar: string | null;
  lastCheckedAt: string;
  error?: {
    category: 'missing_configuration' | 'authentication' | 'network_tls' | 'missing_migrations' | 'insufficient_privileges' | 'unknown';
    message: string;
  };
}

function parseSafeTargetInfo(sourceVar: string | null, rawUrl: string | undefined): SafeDbTargetInfo {
  if (!rawUrl || !sourceVar) {
    return {
      sourceVar: null,
      configured: false,
      validScheme: false,
      scheme: null,
      host: null,
      port: null,
      database: null,
      hasUser: false,
      hasPassword: false,
      sslMode: null,
    };
  }

  try {
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return {
        sourceVar,
        configured: true,
        validScheme: false,
        scheme: trimmed.split('://')[0],
        host: null,
        port: null,
        database: null,
        hasUser: false,
        hasPassword: false,
        sslMode: null,
        formatIssue: 'URL appears to be an HTTPS web/dashboard endpoint instead of a PostgreSQL connection string (postgresql://user:pass@host:port/dbname).',
      };
    }

    const u = new URL(trimmed);
    const validScheme = u.protocol === 'postgresql:' || u.protocol === 'postgres:';
    return {
      sourceVar,
      configured: true,
      validScheme,
      scheme: u.protocol.replace(':', ''),
      host: u.hostname || null,
      port: u.port || '5432',
      database: u.pathname ? u.pathname.replace(/^\//, '') : null,
      hasUser: Boolean(u.username),
      hasPassword: Boolean(u.password),
      sslMode: u.searchParams.get('sslmode') || (u.searchParams.get('ssl') ? 'true' : null),
      formatIssue: validScheme ? undefined : `Unsupported scheme "${u.protocol}". Expected "postgresql:" or "postgres:".`,
    };
  } catch (err: any) {
    return {
      sourceVar,
      configured: true,
      validScheme: false,
      scheme: null,
      host: null,
      port: null,
      database: null,
      hasUser: false,
      hasPassword: false,
      sslMode: null,
      formatIssue: `Malformed connection URL: ${err.message}`,
    };
  }
}

/**
 * Resolves PostgreSQL environment variables following the hierarchy:
 * 1. Explicit APP_DATABASE_URL or base DATABASE_URL / DB_URL for application persistence.
 * 2. Explicit ANALYTICS_READ_DATABASE_URL for analytical queries (or falling back to APP_DATABASE_URL).
 * 3. Explicit ANALYTICS_WRITE_DATABASE_URL (or falling back to APP_DATABASE_URL).
 */
export function resolveDatabaseConfiguration(): ResolvedDbConfig {
  const env = process.env;

  // 1. Resolve Application / Import Persistence URL
  let appSourceVar: string | null = null;
  let appUrl: string | null = null;

  if (env.APP_DATABASE_URL && env.APP_DATABASE_URL.trim()) {
    appSourceVar = 'APP_DATABASE_URL';
    appUrl = env.APP_DATABASE_URL.trim();
  } else if (env.DATABASE_URL && env.DATABASE_URL.trim()) {
    appSourceVar = 'DATABASE_URL';
    appUrl = env.DATABASE_URL.trim();
  } else if (env.DB_URL && env.DB_URL.trim()) {
    appSourceVar = 'DB_URL';
    appUrl = env.DB_URL.trim();
  } else if (env.POSTGRES_URL && env.POSTGRES_URL.trim()) {
    appSourceVar = 'POSTGRES_URL';
    appUrl = env.POSTGRES_URL.trim();
  }

  // 2. Resolve Analytics Read URL
  let analyticsReadSourceVar: string | null = null;
  let analyticsReadUrl: string | null = null;

  if (env.ANALYTICS_READ_DATABASE_URL && env.ANALYTICS_READ_DATABASE_URL.trim()) {
    analyticsReadSourceVar = 'ANALYTICS_READ_DATABASE_URL';
    analyticsReadUrl = env.ANALYTICS_READ_DATABASE_URL.trim();
  } else if (appUrl) {
    analyticsReadSourceVar = appSourceVar;
    analyticsReadUrl = appUrl;
  }

  // 3. Resolve Analytics Write URL
  let analyticsWriteSourceVar: string | null = null;
  let analyticsWriteUrl: string | null = null;

  if (env.ANALYTICS_WRITE_DATABASE_URL && env.ANALYTICS_WRITE_DATABASE_URL.trim()) {
    analyticsWriteSourceVar = 'ANALYTICS_WRITE_DATABASE_URL';
    analyticsWriteUrl = env.ANALYTICS_WRITE_DATABASE_URL.trim();
  } else if (appUrl) {
    analyticsWriteSourceVar = appSourceVar;
    analyticsWriteUrl = appUrl;
  }

  return {
    hasConfiguredDatabase: Boolean(appUrl),
    appSourceVar,
    analyticsReadSourceVar,
    analyticsWriteSourceVar,
    appDatabaseUrl: appUrl,
    analyticsReadDatabaseUrl: analyticsReadUrl,
    analyticsWriteDatabaseUrl: analyticsWriteUrl,
    safeDiagnostics: {
      appDb: parseSafeTargetInfo(appSourceVar, appUrl || undefined),
      analyticsReadDb: parseSafeTargetInfo(analyticsReadSourceVar, analyticsReadUrl || undefined),
      analyticsWriteDb: parseSafeTargetInfo(analyticsWriteSourceVar, analyticsWriteUrl || undefined),
    },
  };
}

/**
 * Categorize a connection error for safe, actionable administrator reporting.
 */
export function categorizeConnectionError(err: any): {
  category: 'missing_configuration' | 'authentication' | 'network_tls' | 'missing_migrations' | 'insufficient_privileges' | 'unknown';
  message: string;
} {
  const msg = err?.message || String(err);
  const code = err?.code;

  if (code === '28P01' || /password authentication failed/i.test(msg)) {
    return {
      category: 'authentication',
      message: 'Database authentication failed. Please verify credentials in the connection URL.',
    };
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || /timeout|refused|getaddrinfo/i.test(msg)) {
    return {
      category: 'network_tls',
      message: 'Unable to reach PostgreSQL server over the network. Verify hostname, port, and firewall rules.',
    };
  }
  if (/ssl|certificate|handshake|tls/i.test(msg)) {
    return {
      category: 'network_tls',
      message: 'TLS/SSL negotiation failed. Ensure SSL parameters match the provider configuration.',
    };
  }
  if (code === '42501' || /permission denied/i.test(msg)) {
    return {
      category: 'insufficient_privileges',
      message: 'PostgreSQL user lacks required schema creation or table privileges.',
    };
  }
  if (code === '3D000' || /database .* does not exist/i.test(msg)) {
    return {
      category: 'missing_configuration',
      message: 'Target database does not exist on the PostgreSQL cluster.',
    };
  }

  return {
    category: 'unknown',
    message: msg || 'An unexpected database error occurred.',
  };
}
