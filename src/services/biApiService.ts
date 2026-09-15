import {
  BIFilterOptions,
  BIOverviewResponse,
  BIProductionResponse,
  BIBankAnalyticsResponse,
  BIPartnerAnalyticsResponse,
  BIComparisonResponse,
  BIRankingsResponse,
  BIExportRequest,
} from '../types/bi';

export class BIApiService {
  private static getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    try {
      const storedToken = localStorage.getItem('cg_session_token') || sessionStorage.getItem('cg_session_token');
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
        headers['x-session-id'] = storedToken;
      }
    } catch (e) {
      // storage unavailable
    }
    return headers;
  }

  private static buildQueryString(params: BIFilterOptions): string {
    const query = new URLSearchParams();
    if (params.period) query.append('period', params.period);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.bankId) query.append('bankId', params.bankId);
    if (params.partnerId) query.append('partnerId', params.partnerId);
    if (params.digitizerId) query.append('digitizerId', params.digitizerId);
    if (params.assignedToId) query.append('assignedToId', params.assignedToId);
    if (params.productId) query.append('productId', params.productId);
    if (params.proposalType) query.append('proposalType', params.proposalType);
    if (params.statusId) query.append('statusId', params.statusId);
    if (params.standardCategory) query.append('standardCategory', params.standardCategory);
    if (params.groupBy) query.append('groupBy', params.groupBy);

    const qs = query.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * Fetches strategic overview from backend endpoint GET /api/bi/overview
   */
  public static async fetchOverview(filters: BIFilterOptions = {}): Promise<BIOverviewResponse> {
    const res = await fetch(`/api/bi/overview${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar visão geral do BI (${res.status})`);
    }

    return await res.json();
  }

  /**
   * Fetches production volume series from backend endpoint GET /api/bi/production
   */
  public static async fetchProduction(filters: BIFilterOptions = {}): Promise<BIProductionResponse> {
    const res = await fetch(`/api/bi/production${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar dados de produção do BI (${res.status})`);
    }

    return await res.json();
  }

  /**
   * Fetches bank performance ranking from backend endpoint GET /api/bi/banks
   */
  public static async fetchBanks(filters: BIFilterOptions = {}): Promise<BIBankAnalyticsResponse> {
    const res = await fetch(`/api/bi/banks${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar análise de bancos do BI (${res.status})`);
    }

    return await res.json();
  }

  /**
   * Fetches partner performance ranking from backend endpoint GET /api/bi/partners
   */
  public static async fetchPartners(filters: BIFilterOptions = {}): Promise<BIPartnerAnalyticsResponse> {
    const res = await fetch(`/api/bi/partners${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar análise de parceiros do BI (${res.status})`);
    }

    return await res.json();
  }

  /**
   * Fetches period comparison data from GET /api/bi/comparison
   */
  public static async fetchComparison(filters: BIFilterOptions = {}): Promise<BIComparisonResponse> {
    const res = await fetch(`/api/bi/comparison${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar comparativo de períodos (${res.status})`);
    }

    return await res.json();
  }

  /**
   * Fetches comprehensive rankings (banks, partners, digitizers) from GET /api/bi/rankings
   */
  public static async fetchRankings(filters: BIFilterOptions = {}): Promise<BIRankingsResponse> {
    const res = await fetch(`/api/bi/rankings${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar rankings do BI (${res.status})`);
    }

    return await res.json();
  }

  /**
   * Requests a server-side CSV export from POST /api/bi/export
   */
  public static async exportBI(request: BIExportRequest = {}): Promise<Blob> {
    const res = await fetch('/api/bi/export', {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao gerar exportação do BI (${res.status})`);
    }

    return await res.blob();
  }
}
