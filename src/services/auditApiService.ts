export interface AuditLogApiEntry {
  id: string;
  tenantId?: string | null;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: string | null;
  newData?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface AuditLogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface AuditLogsResponse {
  data: AuditLogApiEntry[];
  pagination: AuditLogPagination;
}

export interface AuditLogFilterParams {
  page?: number;
  limit?: number;
  action?: string;
  entity?: string;
  entityId?: string;
  userId?: string;
  tenantId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export class AuditApiService {
  private static getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    try {
      const storedToken = localStorage.getItem('cg_session_token') || sessionStorage.getItem('cg_session_token');
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
        headers['x-session-id'] = storedToken;
      }
    } catch {
      // ignore
    }
    return headers;
  }

  private static buildQueryString(params: AuditLogFilterParams): string {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    if (params.action && params.action !== 'ALL') query.append('action', params.action);
    if (params.entity && params.entity !== 'ALL') query.append('entity', params.entity);
    if (params.entityId) query.append('entityId', params.entityId);
    if (params.userId) query.append('userId', params.userId);
    if (params.tenantId) query.append('tenantId', params.tenantId);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.search) query.append('search', params.search);
    const qs = query.toString();
    return qs ? `?${qs}` : '';
  }

  public static async fetchAuditLogs(filters: AuditLogFilterParams = {}): Promise<AuditLogsResponse> {
    const qs = this.buildQueryString(filters);
    const res = await fetch(`/api/audit-logs${qs}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao consultar logs de auditoria (${res.status})`);
    }

    return await res.json();
  }
}
