import { BIFilterOptions } from '../types/bi';
import { ManagerialInsight, HealthScoreResponse } from '../types/managerialIntelligence';

export class ManagerialIntelligenceApiService {
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
    if (params.proposalType) query.append('proposalType', params.proposalType);
    if (params.statusId) query.append('statusId', params.statusId);
    if (params.standardCategory) query.append('standardCategory', params.standardCategory);

    const qs = query.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * Fetches deterministic insights from backend endpoint GET /api/bi/insights
   */
  public static async fetchInsights(filters: BIFilterOptions = {}): Promise<ManagerialInsight[]> {
    const res = await fetch(`/api/bi/insights${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar insights gerenciais (${res.status})`);
    }

    const data = await res.json();
    return data.insights || [];
  }

  /**
   * Fetches Executive & Operational Health Scores from backend endpoint GET /api/bi/health-score
   */
  public static async fetchHealthScores(filters: BIFilterOptions = {}): Promise<HealthScoreResponse> {
    const res = await fetch(`/api/bi/health-score${this.buildQueryString(filters)}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ao carregar pontuação de saúde operacional (${res.status})`);
    }

    return await res.json();
  }
}
