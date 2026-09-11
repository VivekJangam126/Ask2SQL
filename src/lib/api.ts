import {
  User,
  Dataset,
  SchemaMetadata,
  CsvUploadInfo,
  AnalysisRecord,
  ExecutionResult,
  HistoryItem,
  NotificationItem,
} from '../types/index.ts';

const TOKEN_KEY = 'claritysql_jwt_fallback';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getStoredToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errBody: any;
    try {
      errBody = await res.json();
    } catch {
      errBody = { error: { message: res.statusText, code: 'HTTP_ERROR' } };
    }
    const err = new Error(errBody.error?.message || 'An error occurred during request');
    (err as any).code = errBody.error?.code || 'UNKNOWN_ERROR';
    (err as any).status = res.status;
    (err as any).retryable = errBody.error?.retryable;
    throw err;
  }

  return res.json();
}

export const api = {
  auth: {
    async register(name: string, email: string, password: string): Promise<{ user: User; token: string }> {
      const data = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      setStoredToken(data.token);
      return data;
    },
    async login(email: string, password: string): Promise<{ user: User; token: string }> {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setStoredToken(data.token);
      return data;
    },
    async loginDemo(email?: string): Promise<{ user: User; token: string }> {
      const data = await request('/auth/demo', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setStoredToken(data.token);
      return data;
    },
    async logout(): Promise<void> {
      try {
        await request('/auth/logout', { method: 'POST' });
      } finally {
        setStoredToken(null);
      }
    },
    async getMe(): Promise<{ user: User }> {
      return request('/auth/me');
    },
    async updateProfile(name: string): Promise<{ user: User }> {
      return request('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    },
  },

  datasets: {
    async list(): Promise<{ datasets: Dataset[] }> {
      return request('/datasets');
    },
    async seedSample(): Promise<{ success: boolean; message: string; datasetId: string; schemaName: string }> {
      return request('/datasets/seed-sample', { method: 'POST' });
    },
    async getSchema(datasetId: string): Promise<SchemaMetadata> {
      return request(`/datasets/${datasetId}/schema`);
    },
    async refreshSchema(datasetId: string): Promise<{ success: boolean; schema: SchemaMetadata }> {
      return request(`/datasets/${datasetId}/schema/refresh`, { method: 'POST' });
    },
    async reconnect(datasetId: string): Promise<{ success: boolean; engine: string; message: string }> {
      return request(`/datasets/${datasetId}/reconnect`, { method: 'POST' });
    },
  },

  uploads: {
    async uploadCsv(file: File): Promise<CsvUploadInfo> {
      const formData = new FormData();
      formData.append('file', file);
      return request('/uploads', {
        method: 'POST',
        body: formData,
      });
    },
    async getUpload(uploadId: string): Promise<CsvUploadInfo> {
      return request(`/uploads/${uploadId}`);
    },
    async deleteUpload(uploadId: string): Promise<void> {
      return request(`/uploads/${uploadId}`, { method: 'DELETE' });
    },
    async importDataset(
      uploadId: string,
      datasetName?: string,
      tableName?: string
    ): Promise<{ success: boolean; message: string; dataset: any }> {
      return request('/datasets/import', {
        method: 'POST',
        body: JSON.stringify({ uploadId, datasetName, tableName }),
      });
    },
  },

  analyses: {
    async create(datasetId: string, question: string): Promise<{ analysisId: string; status: string }> {
      return request('/analyses', {
        method: 'POST',
        body: JSON.stringify({ datasetId, question }),
      });
    },
    async prepare(analysisId: string): Promise<any> {
      return request(`/analyses/${analysisId}/prepare`, { method: 'POST' });
    },
    async get(analysisId: string): Promise<AnalysisRecord> {
      return request(`/analyses/${analysisId}`);
    },
  },

  previews: {
    async confirm(
      previewId: string,
      digest?: string,
      idempotencyKey?: string
    ): Promise<{ success: boolean; message: string; result: ExecutionResult }> {
      return request(`/previews/${previewId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ digest, idempotencyKey }),
      });
    },
  },

  executions: {
    async getResult(executionId: string): Promise<ExecutionResult> {
      return request(`/executions/${executionId}/result`);
    },
    async retryInsight(executionId: string): Promise<{ success: boolean; insight: any }> {
      return request(`/executions/${executionId}/insight/retry`, { method: 'POST' });
    },
    downloadCsvUrl(executionId: string, filterCol?: string, filterVal?: string): string {
      let url = `/api/executions/${executionId}/export.csv`;
      if (filterCol && filterVal) {
        url += `?filterCol=${encodeURIComponent(filterCol)}&filterVal=${encodeURIComponent(filterVal)}`;
      }
      return url;
    },
  },

  history: {
    async list(search?: string, status?: string): Promise<{ history: HistoryItem[] }> {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status && status !== 'all') params.set('status', status);
      return request(`/history?${params.toString()}`);
    },
  },

  notifications: {
    async list(): Promise<{ notifications: NotificationItem[]; unreadCount: number }> {
      return request('/notifications');
    },
    async markRead(id: string): Promise<void> {
      return request(`/notifications/${id}`, { method: 'PATCH' });
    },
    async markAllRead(): Promise<void> {
      return request('/notifications/read-all', { method: 'POST' });
    },
  },

  health: {
    async check(): Promise<any> {
      return request('/health');
    },
  },

  admin: {
    async listOrganizations(): Promise<{ organizations: any[] }> {
      return request('/admin/organizations');
    },
    async registerOrganization(data: { name: string; handle?: string; adminName: string; adminEmail: string; adminPassword: string }): Promise<any> {
      return request('/admin/organizations', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    async joinOrganization(data: { organizationId: string; role?: string; note?: string }): Promise<any> {
      return request('/admin/organizations/join', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    async getOrganizationDetails(orgId: string): Promise<any> {
      return request(`/admin/organizations/${orgId}`);
    },
    async updateOrganization(orgId: string, data: { name?: string }): Promise<any> {
      return request(`/admin/organizations/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    async getAuditLogs(orgId: string, filters?: { action?: string; search?: string; limit?: number; offset?: number }): Promise<any> {
      const params = new URLSearchParams();
      if (filters?.action) params.set('action', filters.action);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.offset) params.set('offset', String(filters.offset));
      return request(`/admin/organizations/${orgId}/audit-logs?${params.toString()}`);
    },
    async updateMemberStatus(membershipId: string, status: string, rejectionReason?: string): Promise<any> {
      return request(`/admin/memberships/${membershipId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, rejectionReason }),
      });
    },
    async updateMemberPermissions(membershipId: string, databaseId: string, permissions: any): Promise<any> {
      return request(`/admin/memberships/${membershipId}/permissions/${databaseId}`, {
        method: 'PUT',
        body: JSON.stringify(permissions),
      });
    },
  },

  data: {
    async getTableRecords(datasetId: string, tableName: string, params?: { limit?: number; offset?: number; search?: string; sortBy?: string; sortDir?: string }): Promise<any> {
      const query = new URLSearchParams();
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      if (params?.search) query.set('search', params.search);
      if (params?.sortBy) query.set('sortBy', params.sortBy);
      if (params?.sortDir) query.set('sortDir', params.sortDir);
      return request(`/datasets/${datasetId}/tables/${tableName}/records?${query.toString()}`);
    },
    async previewMutation(datasetId: string, tableName: string, body: { operation: 'insert' | 'update' | 'delete_records'; recordData?: any; targetCriteria?: any }): Promise<any> {
      return request(`/datasets/${datasetId}/tables/${tableName}/records/preview`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    async confirmOperation(previewId: string, digest: string, idempotencyKey?: string): Promise<any> {
      return request(`/operations/${previewId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ digest, idempotencyKey }),
      });
    },
    async appendCsv(datasetId: string, tableName: string, csvText: string): Promise<any> {
      return request(`/datasets/${datasetId}/tables/${tableName}/append-csv`, {
        method: 'POST',
        body: JSON.stringify({ csvText }),
      });
    },
    exportCsvUrl(datasetId: string, tableName: string): string {
      return `/api/datasets/${datasetId}/tables/${tableName}/export.csv`;
    },
    async createDatabase(name: string, description?: string): Promise<any> {
      return request('/datasets', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      });
    },
    async deleteDatabase(datasetId: string, confirmedName: string): Promise<any> {
      return request(`/datasets/${datasetId}/delete`, {
        method: 'POST',
        body: JSON.stringify({ confirmedName }),
      });
    },
    async createTable(datasetId: string, tableName: string, columns: { name: string; type: string; isNullable?: boolean }[]): Promise<any> {
      return request(`/datasets/${datasetId}/tables`, {
        method: 'POST',
        body: JSON.stringify({ tableName, columns }),
      });
    },
    async dropTable(datasetId: string, tableName: string, confirmedName: string): Promise<any> {
      return request(`/datasets/${datasetId}/tables/${tableName}/drop`, {
        method: 'POST',
        body: JSON.stringify({ confirmedName }),
      });
    },
  },
};
