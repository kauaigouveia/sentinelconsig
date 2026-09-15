export type BIPeriodPreset =
  | 'HOJE'
  | 'ONTEM'
  | 'ULTIMOS_7_DIAS'
  | 'ULTIMOS_30_DIAS'
  | 'MES_ATUAL'
  | 'MES_ANTERIOR'
  | 'PERSONALIZADO';

export interface BIFilterOptions {
  period?: BIPeriodPreset;
  startDate?: string;
  endDate?: string;
  bankId?: string;
  partnerId?: string;
  digitizerId?: string;
  assignedToId?: string;
  productId?: string;
  proposalType?: string;
  statusId?: string;
  standardCategory?: string;
  groupBy?: 'day' | 'week' | 'month';
}

export interface BIFilterState extends BIFilterOptions {
  period: BIPeriodPreset;
}

export interface BIOverviewResponse {
  tenantId: string;
  period: {
    preset?: BIPeriodPreset;
    startDate: string;
    endDate: string;
    label?: string;
  };
  paidProduction: {
    value: number;
    count: number;
  };
  inProgressProduction: {
    value: number;
    count: number;
  };
  conversionRatePercent: number;
  avgTicketNet: number;
  slaCompliancePercent: number;
  cancelledProduction: {
    value: number;
    count: number;
    ratePercent: number;
  };
  reprovedProduction: {
    value: number;
    count: number;
    ratePercent: number;
  };
  backlog: {
    count: number;
    retainedValue: number;
  };
  proposalsAtRisk: number;
  proposalsOverSla: number;
  totalProposals: number;
  totalGrossValue: number;
  totalNetValue: number;
}

export interface BIProductionItem {
  date: string;
  formattedDate: string;
  grossValue: number;
  netValue: number;
  paidValue: number;
  cancelledValue: number;
  reprovedValue: number;
  approvedValue: number;
  count: number;
  paidCount: number;
}

export interface BIProductionResponse {
  tenantId: string;
  groupBy: 'day' | 'week' | 'month';
  period: {
    preset?: BIPeriodPreset;
    startDate: string;
    endDate: string;
  };
  summary: {
    totalCount: number;
    totalGross: number;
    totalNet: number;
    totalPaidValue: number;
    totalPaidCount: number;
    totalCancelledValue: number;
    totalCancelledCount: number;
    conversionRatePercent: number;
  };
  series: BIProductionItem[];
}

export interface BIBankAnalyticsItem {
  bankId: string;
  bankCode: string;
  bankName: string;
  color?: string | null;
  grossValue: number;
  netValue: number;
  count: number;
  paidCount: number;
  paidValue: number;
  conversionRatePercent: number;
  avgTicketNet: number;
  slaCompliancePercent: number | null;
}

export interface BIBankAnalyticsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  banks: BIBankAnalyticsItem[];
  summary: {
    totalBanks: number;
    totalGrossValue: number;
    totalNetValue: number;
    totalPaidValue: number;
    topBankName?: string | null;
  };
}

export interface BIPartnerAnalyticsItem {
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  grossValue: number;
  netValue: number;
  count: number;
  paidCount: number;
  paidValue: number;
  conversionRatePercent: number;
  avgTicketNet: number;
  avgDwellHours?: number | null;
}

export interface BIPartnerAnalyticsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  partners: BIPartnerAnalyticsItem[];
  summary: {
    totalPartners: number;
    totalGrossValue: number;
    totalNetValue: number;
    totalPaidValue: number;
    topPartnerName?: string | null;
  };
}

// ==========================================
// P1 BI GERENCIAL EXTENSIONS
// ==========================================

export type BITrend = 'CRESCIMENTO' | 'QUEDA' | 'ESTABILIDADE';

export interface BIMetricDelta {
  current: number;
  previous: number;
  deltaAbsolute: number;
  deltaPercent: number;
  trend: BITrend;
}

export interface BIComparisonResponse {
  tenantId: string;
  period: {
    current: {
      preset?: BIPeriodPreset;
      startDate: string;
      endDate: string;
      label: string;
    };
    previous: {
      preset?: BIPeriodPreset;
      startDate: string;
      endDate: string;
      label: string;
    };
  };
  metrics: {
    paidProduction: BIMetricDelta;
    grossProduction: BIMetricDelta;
    netProduction: BIMetricDelta;
    totalProposals: BIMetricDelta;
    paidCount: BIMetricDelta;
    conversionRate: BIMetricDelta;
    avgTicketNet: BIMetricDelta;
    cancelledValue: BIMetricDelta;
    backlogCount: BIMetricDelta;
  };
}

export interface BIBankRankingItem extends BIBankAnalyticsItem {
  sharePercent: number;
  previousPaidValue?: number;
  growthPercent?: number;
  trend?: BITrend;
}

export interface BIPartnerRankingItem extends BIPartnerAnalyticsItem {
  sharePercent: number;
  previousPaidValue?: number;
  growthPercent?: number;
  trend?: BITrend;
}

export interface BIDigitizerRankingItem {
  digitizerId: string;
  digitizerName: string;
  totalCount: number;
  paidCount: number;
  grossValue: number;
  netValue: number;
  paidValue: number;
  conversionRatePercent: number;
  avgTicketNet: number;
  sharePercent: number;
  previousPaidValue?: number;
  growthPercent?: number;
  trend?: BITrend;
}

export interface BIRankingsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  banks: BIBankRankingItem[];
  partners: BIPartnerRankingItem[];
  digitizers: BIDigitizerRankingItem[];
  summary: {
    totalPaidValue: number;
    totalProposalsCount: number;
    topBankName?: string | null;
    topPartnerName?: string | null;
    topDigitizerName?: string | null;
  };
}

export interface BIExportRequest extends BIFilterOptions {
  format?: 'csv' | 'xlsx';
  fields?: string[];
}

