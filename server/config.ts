import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Universal origin - defaults to wildcards/request-origin dynamically
  appOrigin: process.env.APP_ORIGIN || process.env.APP_URL || '*',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== 'gemini-2.5-flash')
    ? process.env.GEMINI_MODEL
    : 'gemini-3.8-flash',
  
  // Universal Database configuration:
  // Standard PostgreSQL connection URL (e.g. Cloud SQL, Supabase, Neon, RDS, or local PG)
  databaseUrl: process.env.DATABASE_URL || process.env.APP_DATABASE_URL || '',
  
  // Embedded PGlite data directory (used seamlessly when no external database URL is provided):
  pgDataDir: path.join(process.cwd(), 'data', 'pgdata'),

  // Processing limits:
  maxCsvBytes: parseInt(process.env.MAX_CSV_BYTES || '26214400', 10), // 25MB
  maxCsvRows: parseInt(process.env.MAX_CSV_ROWS || '100000', 10),
  maxCsvColumns: parseInt(process.env.MAX_CSV_COLUMNS || '200', 10),
  maxResultRows: parseInt(process.env.MAX_RESULT_ROWS || '1000', 10),
  maxResultBytes: parseInt(process.env.MAX_RESULT_BYTES || '5242880', 10), // 5MB
  queryTimeoutMs: parseInt(process.env.QUERY_TIMEOUT_MS || '15000', 10), // 15s
  maxSqlCorrections: parseInt(process.env.MAX_SQL_CORRECTIONS || '3', 10),
  previewTtlSeconds: parseInt(process.env.PREVIEW_TTL_SECONDS || '900', 10), // 15 mins
  
  // Auth settings:
  sessionCookieName: 'claritysql_session',
  sessionTtlHours: 72,
};
