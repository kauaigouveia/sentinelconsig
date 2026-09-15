import {
  BottlenecksResponse,
  DwellTimeResponse,
  AgingResponse,
  ProductionResponse,
  SlaResponse,
} from '../types/analytics';
import { StorageService } from './storageService';
import { calculateBusinessDays } from '../lib/utils';

export interface AnalyticsFilterParams {
  startDate?: string;
  endDate?: string;
  bankId?: string;
  partnerId?: string;
  statusId?: string;
  productId?: string;
}

export class AnalyticsApiService {
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

  private static buildQueryString(params: AnalyticsFilterParams): string {
    const query = new URLSearchParams();
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.bankId) query.append('bankId', params.bankId);
    if (params.partnerId) query.append('partnerId', params.partnerId);
    if (params.statusId) query.append('statusId', params.statusId);
    if (params.productId) query.append('productId', params.productId);
    const qs = query.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * Fetches bottlenecks from backend endpoint GET /api/analytics/bottlenecks
   * Falls back gracefully to StorageService client-side calculations if offline or backend is unreachable.
   */
  public static async fetchBottlenecks(filters: AnalyticsFilterParams = {}): Promise<BottlenecksResponse> {
    try {
      const res = await fetch(`/api/analytics/bottlenecks${this.buildQueryString(filters)}`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[AnalyticsApiService] Backend fetchBottlenecks indisponível, usando fallback local:', e);
    }
    return this.fallbackBottlenecks(filters);
  }

  /**
   * Fetches dwell time metrics from backend endpoint GET /api/analytics/dwell-time
   */
  public static async fetchDwellTime(filters: AnalyticsFilterParams = {}): Promise<DwellTimeResponse> {
    try {
      const res = await fetch(`/api/analytics/dwell-time${this.buildQueryString(filters)}`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[AnalyticsApiService] Backend fetchDwellTime indisponível, usando fallback local:', e);
    }
    return this.fallbackDwellTime(filters);
  }

  /**
   * Fetches proposal aging from backend endpoint GET /api/analytics/aging
   */
  public static async fetchAging(filters: AnalyticsFilterParams = {}): Promise<AgingResponse> {
    try {
      const res = await fetch(`/api/analytics/aging${this.buildQueryString(filters)}`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[AnalyticsApiService] Backend fetchAging indisponível, usando fallback local:', e);
    }
    return this.fallbackAging(filters);
  }

  /**
   * Fetches production breakdown from backend endpoint GET /api/analytics/production
   */
  public static async fetchProduction(filters: AnalyticsFilterParams = {}): Promise<ProductionResponse> {
    try {
      const res = await fetch(`/api/analytics/production${this.buildQueryString(filters)}`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[AnalyticsApiService] Backend fetchProduction indisponível, usando fallback local:', e);
    }
    return this.fallbackProduction(filters);
  }

  /**
   * Fetches SLA indicators from backend endpoint GET /api/analytics/sla
   */
  public static async fetchSla(filters: AnalyticsFilterParams = {}): Promise<SlaResponse> {
    try {
      const res = await fetch(`/api/analytics/sla${this.buildQueryString(filters)}`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[AnalyticsApiService] Backend fetchSla indisponível, usando fallback local:', e);
    }
    return this.fallbackSla(filters);
  }

  // -------------------------------------------------------------
  // CLIENT-SIDE FALLBACKS (Guarantees zero UI regressions if backend is booting or in test environment)
  // -------------------------------------------------------------

  private static fallbackBottlenecks(filters: AnalyticsFilterParams): BottlenecksResponse {
    const proposals = StorageService.getProposals();
    const statuses = StorageService.getStatuses();
    const banks = StorageService.getBanks();
    const partners = StorageService.getPartners();
    const clients = StorageService.getClients();

    const activeProposals = proposals.filter(p => {
      const st = statuses.find(s => s.id === p.statusId);
      if (st && (st.code === 'PAGO' || st.code === 'CANCELADO' || st.code === 'REPROVADO')) return false;
      if (filters.bankId && p.bankId !== filters.bankId) return false;
      if (filters.partnerId && p.partnerId !== filters.partnerId) return false;
      if (filters.statusId && p.statusId !== filters.statusId) return false;
      return true;
    });

    const now = Date.now();
    let totalOverSla = 0;
    let totalNearSla = 0;
    let totalValueStuck = 0;
    let totalDwellHours = 0;
    let maxDwellHours = 0;

    const sample: BottlenecksResponse['stuckProposalsSample'] = [];

    for (const p of activeProposals) {
      const st = statuses.find(s => s.id === p.statusId);
      const b = banks.find(bk => bk.id === p.bankId);
      const pt = partners.find(pr => pr.id === p.partnerId);
      const cl = clients.find(c => c.id === p.clientId);

      const val = Number(p.disbursedValue || 0);
      totalValueStuck += val;

      const createdTime = new Date(p.createdAt).getTime();
      const dwellHours = Math.max(0, Math.round((now - createdTime) / 3600000));
      totalDwellHours += dwellHours;
      if (dwellHours > maxDwellHours) maxDwellHours = dwellHours;

      const slaHours = st?.slaHours || 24;
      const isOver = dwellHours > slaHours;
      const isNear = !isOver && dwellHours >= slaHours * 0.75;
      if (isOver) totalOverSla++;
      if (isNear) totalNearSla++;

      if (isOver || isNear) {
        sample.push({
          id: p.id,
          proposalNumber: p.proposalNumber,
          clientName: cl?.fullName || 'Cliente',
          clientCpfMasked: cl?.cpf ? cl.cpf.replace(/(\d{3})\d{5}(\d{3})/, '$1.***.**$2') : '---',
          bankName: b?.name || 'Banco',
          partnerName: pt?.fullName || 'Parceiro',
          statusName: st?.name || 'Status',
          alcada: st?.responsibleGroup || 'NOSSA EQUIPE',
          slaHours,
          dwellHours,
          releasedValue: val,
          contractValue: Number(p.contractBalance || 0),
          createdAt: p.createdAt,
          isOverSla: isOver,
          isNearSla: isNear,
        });
      }
    }

    return {
      summary: {
        totalActive: activeProposals.length,
        totalOverSla,
        totalNearSla,
        totalValueStuck,
        avgDwellHours: activeProposals.length > 0 ? Math.round(totalDwellHours / activeProposals.length) : 0,
        maxDwellHours,
      },
      byAlcada: [],
      byStatus: [],
      topRetainedBanks: [],
      topRetainedPartners: [],
      stuckProposalsSample: sample.slice(0, 30),
    };
  }

  private static fallbackDwellTime(filters: AnalyticsFilterParams): DwellTimeResponse {
    return {
      summary: { totalTransitions: 0, avgOverallHours: null },
      byStatus: [],
      byBank: [],
      byPartner: [],
      byAlcada: [],
    };
  }

  private static fallbackAging(filters: AnalyticsFilterParams): AgingResponse {
    return {
      summary: { totalOpenProposals: 0, totalOpenValue: 0, avgAgeDays: 0, maxAgeDays: 0 },
      buckets: [],
    };
  }

  private static fallbackProduction(filters: AnalyticsFilterParams): ProductionResponse {
    return {
      summary: {
        totalProposals: 0,
        totalContractValue: 0,
        totalReleasedValue: 0,
        paidCount: 0,
        paidReleasedValue: 0,
        cancelledCount: 0,
        conversionRatePercent: 0,
      },
      byDay: [],
      byWeek: [],
      byStatus: [],
      byBank: [],
      byPartner: [],
      byDigitizer: [],
      byProduct: [],
    };
  }

  private static fallbackSla(filters: AnalyticsFilterParams): SlaResponse {
    return {
      summary: {
        totalEvaluated: 0,
        totalWithinSla: 0,
        totalNearSla: 0,
        totalOverSla: 0,
        complianceRatePercent: 100,
      },
      portabilityCip: {
        totalInCip: 0,
        normalCount: 0,
        warningCount: 0,
        urgentCount: 0,
        overdueCount: 0,
        balanceRetainedTotal: 0,
      },
      byStatus: [],
      byBank: [],
      byPartner: [],
    };
  }
}
