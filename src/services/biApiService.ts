import {
  BIFilterOptions,
  BIOverviewResponse,
  BIProductionResponse,
  BIConversionFunnelResponse,
  BIBankAnalyticsResponse,
  BIProductAnalyticsResponse,
  BIConvenioAnalyticsResponse,
  BIPartnerAnalyticsResponse,
  BIOperatorAnalyticsResponse,
  BIPendencyAnalyticsResponse,
  BIBottlenecksResponse,
  BICancellationsResponse,
  BIRefusalsResponse,
  BIIntegrationsResponse,
  BIOperationalHealthResponse,
  BIComparisonResponse,
  BIRankingsResponse,
  BIExportRequest,
} from '../types/bi';

export class BIApiService {
  private static getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
    };
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
    if (params.convenioId) query.append('convenioId', params.convenioId);
    if (params.source) query.append('source', params.source);
    if (params.proposalType) query.append('proposalType', params.proposalType);
    if (params.statusId) query.append('statusId', params.statusId);
    if (params.standardCategory) query.append('standardCategory', params.standardCategory);
    if (params.groupBy) query.append('groupBy', params.groupBy);

    const qs = query.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * 1. Strategic Overview
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
   * 2. Production Time Series
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
   * 3. Operational Conversion Funnel
   */
  public static async fetchConversion(filters: BIFilterOptions = {}): Promise<BIConversionFunnelResponse> {
    const res = await fetch(`/api/bi/conversion${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar funil de conversão (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 4. Banks Analytics
   */
  public static async fetchBanks(filters: BIFilterOptions = {}): Promise<BIBankAnalyticsResponse> {
    const res = await fetch(`/api/bi/banks${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar análise de bancos (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 5. Products Analytics
   */
  public static async fetchProducts(filters: BIFilterOptions = {}): Promise<BIProductAnalyticsResponse> {
    const res = await fetch(`/api/bi/products${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar análise de produtos (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 6. Agreements / Convênios Analytics
   */
  public static async fetchConvenios(filters: BIFilterOptions = {}): Promise<BIConvenioAnalyticsResponse> {
    const res = await fetch(`/api/bi/convenios${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar análise de convênios (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 7. Partners CRM Analytics
   */
  public static async fetchPartners(filters: BIFilterOptions = {}): Promise<BIPartnerAnalyticsResponse> {
    const res = await fetch(`/api/bi/partners${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar análise de parceiros (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 8. Operators / Internal Users Analytics
   */
  public static async fetchOperators(filters: BIFilterOptions = {}): Promise<BIOperatorAnalyticsResponse> {
    const res = await fetch(`/api/bi/operators${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar análise de operadores (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 9. Pendencies & SLA Analytics
   */
  public static async fetchPendencies(filters: BIFilterOptions = {}): Promise<BIPendencyAnalyticsResponse> {
    const res = await fetch(`/api/bi/pendencies${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar análise de pendências (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 10. Operational Bottlenecks
   */
  public static async fetchBottlenecks(filters: BIFilterOptions = {}): Promise<BIBottlenecksResponse> {
    const res = await fetch(`/api/bi/bottlenecks${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar gargalos operacionais (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 11. Cancellations Breakdown
   */
  public static async fetchCancellations(filters: BIFilterOptions = {}): Promise<BICancellationsResponse> {
    const res = await fetch(`/api/bi/cancellations${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar cancelamentos (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 12. Refusals / Recusas Breakdown
   */
  public static async fetchRefusals(filters: BIFilterOptions = {}): Promise<BIRefusalsResponse> {
    const res = await fetch(`/api/bi/refusals${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar recusas (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 13. Integration Health & Telemetry
   */
  public static async fetchIntegrations(filters: BIFilterOptions = {}): Promise<BIIntegrationsResponse> {
    const res = await fetch(`/api/bi/integrations${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar telemetria de integrações (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 14. Operational Health Summary
   */
  public static async fetchOperationalHealth(filters: BIFilterOptions = {}): Promise<BIOperationalHealthResponse> {
    const res = await fetch(`/api/bi/operational-health${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar saúde operacional (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 15. Period Comparison
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
   * 16. Rankings
   */
  public static async fetchRankings(filters: BIFilterOptions = {}): Promise<BIRankingsResponse> {
    const res = await fetch(`/api/bi/rankings${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar rankings (${res.status})`);
    }
    return await res.json();
  }

  /**
   * 17. CSV Export
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
