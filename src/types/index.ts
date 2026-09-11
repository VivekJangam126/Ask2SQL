export type AppRole = 'ORG_ADMIN' | 'MEMBER';
export type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'INVITED';

export interface DatabasePermissionsSummary {
  isAdmin: boolean;
  canRead: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDeleteRecords: boolean;
  canImportCsv: boolean;
  canExport: boolean;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  handle: string;
  state: string;
  createdAt: string;
}

export interface MembershipInfo {
  id: string;
  userId: string;
  organizationId: string;
  role: AppRole;
  status: MembershipStatus;
  note?: string | null;
  rejectionReason?: string | null;
  permissionRevision: number;
  requestedAt: string;
  approvedAt?: string | null;
}

export interface DatabasePermissionGrant {
  databaseId: string;
  databaseName?: string;
  canRead: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDeleteRecords: boolean;
  canImportCsv: boolean;
  canExport: boolean;
  version: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  account_state?: string;
  organization?: OrganizationInfo | null;
  membership?: MembershipInfo | null;
  permissions?: DatabasePermissionGrant[];
  created_at: string;
  updated_at: string;
}

export interface DatasetTable {
  id: string;
  dataset_id: string;
  table_name: string;
  row_count: number;
  row_count_type: 'exact' | 'estimate';
}

export interface Dataset {
  id: string;
  organization_id?: string;
  owner_id: string;
  created_by?: string;
  updated_by?: string;
  display_name: string;
  description?: string;
  internal_schema: string;
  engine: string;
  is_active: boolean;
  lifecycle_state?: 'active' | 'deleting' | 'deleted';
  schema_revision?: number;
  data_revision?: number;
  table_count?: number;
  total_rows?: number;
  created_at: string;
  permissions?: DatabasePermissionsSummary;
}

export interface AuditEvent {
  id: string;
  organization_id: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  target_name?: string;
  summary: string;
  details_json?: string;
  affected_rows?: number;
  created_at: string;
}

export interface OperationPreview {
  previewId: string;
  digest: string;
  operation: 'insert' | 'update' | 'delete_records';
  tableName: string;
  expectedAffectedCount: number;
  sql: string;
  plan: any;
  beforeSample?: any[];
  afterSample?: any[];
  expiresAt: string;
}

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

export interface ValidationCheckResult {
  status: 'passed' | 'failed' | 'not_applicable';
  message: string;
}

export interface ValidationReport {
  isValid: boolean;
  checks: {
    syntax: ValidationCheckResult;
    readOnly: ValidationCheckResult;
    objects: ValidationCheckResult;
    functions: ValidationCheckResult;
    limits: ValidationCheckResult;
  };
  errors: string[];
  referencedTables: string[];
}

export interface SqlAttempt {
  attemptNumber: number;
  sql: string;
  report: ValidationReport;
  correctionReason?: string;
}

export interface QuestionInterpretation {
  status: 'ready' | 'needs_clarification' | 'unsupported';
  summary: string;
  measure?: string | null;
  aggregation?: string | null;
  groupBy: string[];
  filters: { field: string; op: string; val: string }[];
  sort: { field: string; direction: 'asc' | 'desc' }[];
  requestedLimit?: number | null;
  clarificationQuestion?: string | null;
}

export interface QueryPreview {
  id: string;
  sql: string;
  params: any[];
  resultLimit: number;
  digest: string;
  validationReport: ValidationReport;
  attemptsCount?: number;
  attempts?: SqlAttempt[];
  isConsumed?: boolean;
}

export interface GroundedInsight {
  summary: string;
  explanation: string;
  evidence: string[];
  chartRecommendation: {
    type: 'bar' | 'line' | 'donut' | 'scatter' | 'value_card' | 'table';
    xAxisKey?: string;
    yAxisKey?: string;
    seriesKey?: string;
    title: string;
    reasoning: string;
  };
}

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
  insight?: GroundedInsight;
}

export interface AnalysisRecord {
  id: string;
  question: string;
  status: 'draft' | 'preparing' | 'ready_for_review' | 'needs_clarification' | 'unsupported' | 'failed' | 'executed';
  summary?: string;
  measure?: string;
  aggregation?: string;
  groupBy?: string[];
  filters?: any[];
  sort?: any[];
  clarificationQuestion?: string;
  createdAt: string;
  preview?: QueryPreview | null;
  execution?: ExecutionResult | null;
  attempts?: SqlAttempt[];
}

export interface HistoryItem {
  id: string;
  question: string;
  status: string;
  summary: string;
  created_at: string;
  sql_text?: string;
  digest?: string;
  execution_id?: string;
  execution_status?: string;
  duration_ms?: number;
  started_at?: string;
  total_rows?: number;
  is_capped?: boolean;
  dataset_name?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  event_type: string;
  related_entity_type?: string;
  related_entity_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface CsvUploadInfo {
  uploadId: string;
  originalFilename: string;
  sizeBytes: number;
  checksum: string;
  totalRows: number;
  totalColumns: number;
  columns: {
    originalName: string;
    internalName: string;
    detectedType: string;
    isNullable: boolean;
    sampleValues: any[];
  }[];
  previewRows: Record<string, any>[];
  issues: { row?: number; column?: string; message: string; severity: 'warning' | 'error' }[];
}
