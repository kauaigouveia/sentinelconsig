export type BIPeriodPreset =
  | 'HOJE'
  | 'ONTEM'
  | 'ULTIMOS_7_DIAS'
  | 'ULTIMOS_30_DIAS'
  | 'MES_ATUAL'
  | 'MES_ANTERIOR'
  | 'ANO_ATUAL'
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
  convenioId?: string;
  proposalType?: string;
  statusId?: string;
  standardCategory?: string;
  groupBy?: 'day' | 'week' | 'month';
  source?: string;
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
  // FASE 6 Additions
  approvedProposals: {
    count: number;
    value: number;
  };
  pendencies: {
    totalOpen: number;
    withinSla: number;
    overSla: number;
    slaCompliancePercent: number;
  };
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
  avgTicket: number;
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
    totalReprovedValue: number;
    totalReprovedCount: number;
    totalInProgressValue: number;
    totalInProgressCount: number;
    conversionRatePercent: number;
    avgTicket: number;
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
  approvedCount: number;
  cancelledCount: number;
  cancelledValue: number;
  reprovedCount: number;
  reprovedValue: number;
  conversionRatePercent: number;
  approvalRatePercent: number;
  avgTicketNet: number;
  slaCompliancePercent: number | null;
  // Integration health telemetry
  totalRequests?: number;
  successRate?: number | null;
  avgLatencyMs?: number | null;
  incidentCount?: number;
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
    totalPaidCount: number;
    topBankName?: string | null;
  };
}

export interface BIProductAnalyticsItem {
  productId: string;
  productCode: string;
  productName: string;
  productType: string;
  grossValue: number;
  netValue: number;
  count: number;
  paidCount: number;
  paidValue: number;
  approvedCount: number;
  cancelledCount: number;
  cancelledValue: number;
  reprovedCount: number;
  reprovedValue: number;
  conversionRatePercent: number;
  approvalRatePercent: number;
  avgTicketNet: number;
}

export interface BIProductAnalyticsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  products: BIProductAnalyticsItem[];
  summary: {
    totalProducts: number;
    totalGrossValue: number;
    totalNetValue: number;
    totalPaidValue: number;
    totalPaidCount: number;
  };
}

export interface BIConvenioAnalyticsItem {
  convenioId: string;
  convenioCode: string;
  convenioName: string;
  grossValue: number;
  netValue: number;
  count: number;
  paidCount: number;
  paidValue: number;
  cancelledCount: number;
  reprovedCount: number;
  avgTicketNet: number;
  conversionRatePercent: number;
}

export interface BIConvenioAnalyticsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  convenios: BIConvenioAnalyticsItem[];
  summary: {
    totalConvenios: number;
    totalGrossValue: number;
    totalPaidValue: number;
  };
}

export interface BIPartnerAnalyticsItem {
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  status: string;
  grossValue: number;
  netValue: number;
  count: number;
  paidCount: number;
  paidValue: number;
  approvedCount: number;
  cancelledCount: number;
  cancelledValue: number;
  reprovedCount: number;
  reprovedValue: number;
  conversionRatePercent: number;
  approvalRatePercent: number;
  avgTicketNet: number;
  openPendenciesCount: number;
  lastActivityDate: string | null;
  assignedUserName?: string | null;
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
    activePartnersCount: number;
    partnersWithProductionCount: number;
    partnersWithoutProductionCount: number;
    totalGrossValue: number;
    totalNetValue: number;
    totalPaidValue: number;
    topPartnerName?: string | null;
  };
}

export interface BIOperatorAnalyticsItem {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  createdProposalsCount: number;
  assignedProposalsCount: number;
  grossValue: number;
  netValue: number;
  paidCount: number;
  paidValue: number;
  approvedCount: number;
  conversionRatePercent: number;
  openPendenciesCount: number;
  openTasksCount: number;
}

export interface BIOperatorAnalyticsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  operators: BIOperatorAnalyticsItem[];
  summary: {
    totalOperators: number;
    totalProposals: number;
    totalPaidValue: number;
  };
}

export interface BIPendencyAnalyticsCategoryItem {
  category: string;
  count: number;
  openCount: number;
  resolvedCount: number;
  overSlaCount: number;
}

export interface BIPendencyAnalyticsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalCreated: number;
    openCount: number;
    inProgressCount: number;
    waitingCount: number;
    resolvedCount: number;
    cancelledCount: number;
    withinSlaCount: number;
    nearSlaCount: number;
    overSlaCount: number;
    slaCompliancePercent: number;
    avgResolutionHours: number | null;
    medianResolutionHours: number | null;
  };
  byCategory: BIPendencyAnalyticsCategoryItem[];
  byPriority: Array<{ priority: string; label: string; count: number; openCount: number; overSlaCount: number }>;
  byStatus: Array<{ status: string; count: number }>;
  evolution: Array<{ date: string; created: number; resolved: number }>;
}

export interface BIConversionStage {
  stageId: 'SIMULACOES' | 'PROPOSTAS' | 'APROVADAS' | 'PAGAS';
  label: string;
  count: number;
  value: number;
  conversionRateFromPrevious: number | null;
  conversionRateFromStart: number | null;
  dropCount: number;
}

export interface BIConversionFunnelResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
    label: string;
  };
  stages: BIConversionStage[];
  summary: {
    simulationsToProposalsPercent: number | null;
    proposalsToApprovalPercent: number | null;
    approvalToPaymentPercent: number | null;
    overallFunnelConversionPercent: number | null;
  };
}

export interface BIBottleneckItem {
  type: 'STATUS_CONCENTRATION' | 'OVER_SLA_PENDENCIES' | 'INTEGRATION_ERRORS' | 'HIGH_CANCEL_RATE' | 'HIGH_REPROVE_RATE';
  title: string;
  severity: 'INFO' | 'ATENCAO' | 'CRITICO';
  metricValue: string | number;
  description: string;
  evidence: {
    entityType?: string;
    entityId?: string;
    entityName?: string;
    count?: number;
    value?: number;
    percentage?: number;
    durationHours?: number;
  };
}

export interface BIBottlenecksResponse {
  tenantId: string;
  generatedAt: string;
  bottlenecks: BIBottleneckItem[];
  statusDistribution: Array<{
    statusId: string;
    statusCode: string;
    statusName: string;
    standardCategory: string;
    count: number;
    value: number;
    percentageOfTotal: number;
    isFinal: boolean;
  }>;
}

export interface BICancellationReasonItem {
  reason: string;
  count: number;
  value: number;
  percentage: number;
}

export interface BICancellationsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalCancelledCount: number;
    totalCancelledValue: number;
    rateOverProposalsPercent: number;
  };
  reasons: BICancellationReasonItem[];
  byBank: Array<{ bankId: string; bankName: string; count: number; value: number }>;
  byProduct: Array<{ productId: string; productName: string; count: number; value: number }>;
  byPartner: Array<{ partnerId: string; partnerName: string; count: number; value: number }>;
  evolution: Array<{ date: string; count: number; value: number }>;
}

export interface BIRefusalsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalRefusedCount: number;
    totalRefusedValue: number;
    rateOverProposalsPercent: number;
  };
  reasons: Array<{ reason: string; count: number; value: number; percentage: number }>;
  byBank: Array<{ bankId: string; bankName: string; count: number; value: number }>;
  byProduct: Array<{ productId: string; productName: string; count: number; value: number }>;
  byPartner: Array<{ partnerId: string; partnerName: string; count: number; value: number }>;
  evolution: Array<{ date: string; count: number; value: number }>;
}

export interface BIIntegrationProviderItem {
  provider: string; // 'C6' | 'FACTA' | 'BMG' | 'HAPPY'
  name: string;
  totalRequests: number;
  successCount: number;
  error4xxCount: number;
  error5xxCount: number;
  timeoutCount: number;
  successRatePercent: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  incidentCount: number;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
}

export interface BIIntegrationsResponse {
  tenantId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalRequests: number;
    totalSuccess: number;
    totalErrors: number;
    globalSuccessRatePercent: number;
    globalAvgLatencyMs: number;
    activeIncidentsCount: number;
  };
  providers: BIIntegrationProviderItem[];
}

export interface BIOperationalHealthResponse {
  tenantId: string;
  evaluatedAt: string;
  proposals: {
    activeInPipeline: number;
    paidInPeriod: number;
    overSlaInPipeline: number;
    status: 'SAUDAVEL' | 'ATENCAO' | 'CRITICO';
  };
  pendencies: {
    openTotal: number;
    overSlaTotal: number;
    compliancePercent: number;
    status: 'SAUDAVEL' | 'ATENCAO' | 'CRITICO';
  };
  integrations: {
    onlineProvidersCount: number;
    totalProvidersCount: number;
    overallSuccessRate: number;
    status: 'SAUDAVEL' | 'ATENCAO' | 'CRITICO';
  };
}

// ==========================================
// COMPARISON & DELTA TYPES
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
    approvedCount: BIMetricDelta;
    conversionRate: BIMetricDelta;
    avgTicketNet: BIMetricDelta;
    cancelledValue: BIMetricDelta;
    cancelledCount: BIMetricDelta;
    reprovedValue: BIMetricDelta;
    reprovedCount: BIMetricDelta;
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
