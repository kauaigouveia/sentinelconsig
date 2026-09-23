export type IntelligenceInsightType =
  | 'ANOMALY'
  | 'TREND'
  | 'CORRELATION'
  | 'BOTTLENECK'
  | 'INTEGRATION'
  | 'SLA'
  | 'CONVERSION'
  | 'PRODUCTION'
  | 'CANCELLATION'
  | 'REFUSAL'
  | 'PARTNER'
  | 'BANK'
  | 'PRODUCT'
  | 'CONVENIO'
  | 'OPERATOR';

export type IntelligenceSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IntelligenceStatus = 'NEW' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';

export type IntelligenceEntityType =
  | 'BANK'
  | 'PARTNER'
  | 'PRODUCT'
  | 'CONVENIO'
  | 'INTEGRATION'
  | 'OPERATOR'
  | 'STATUS'
  | 'PROPOSAL'
  | 'PENDENCY';

export interface IntelligenceEvidence {
  metric: string;
  label?: string;
  currentValue: number | string;
  previousValue?: number | string | null;
  variation?: number | null;
  unit: 'currency' | 'percent' | 'count' | 'ms' | 'hours' | 'days' | 'ratio' | 'text';
  source: string; // e.g. "BIService", "IntegrationHealth", "PendencyEngine", "CorrelationEngine"
  period?: string;
  entityType?: IntelligenceEntityType | string;
  entityId?: string;
  entityName?: string;
  details?: Record<string, any>;
}

export interface IntelligenceSuggestedAction {
  id: string;
  type:
    | 'OPEN_BI'
    | 'OPEN_INTEGRATION'
    | 'OPEN_PENDENCIES'
    | 'OPEN_PARTNER'
    | 'CREATE_PENDENCY'
    | 'CREATE_AUTOMATION'
    | 'NOTIFY_TEAM'
    | 'ADD_PARTNER_NOTE'
    | 'INVESTIGATE';
  label: string;
  description?: string;
  targetUrl?: string;
  isAutomated?: boolean;
  params?: Record<string, any>;
}

export interface IntelligenceInsightDTO {
  id: string;
  tenantId: string;
  type: IntelligenceInsightType;
  category: string;
  severity: IntelligenceSeverity;
  title: string;
  summary: string;
  explanation?: string | null;
  status: IntelligenceStatus;
  confidence: number; // 0.0 - 1.0
  detectedAt: string;
  periodStart: string;
  periodEnd: string;
  comparisonStart?: string | null;
  comparisonEnd?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  metadata?: Record<string, any> | null;
  evidence: IntelligenceEvidence[];
  suggestedActions: IntelligenceSuggestedAction[];
  dedupKey: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  resolvedById?: string | null;
  resolvedByName?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedById?: string | null;
  acknowledgedByName?: string | null;
}

export interface IntelligenceRuleConfigDTO {
  id?: string;
  tenantId: string;
  ruleId: string;
  name: string;
  category: string;
  description?: string | null;
  enabled: boolean;
  severity: IntelligenceSeverity;
  threshold?: number | null;
  config?: Record<string, any> | null;
}

export interface IntelligenceOverviewResponse {
  tenantId: string;
  summary: {
    totalInsights: number;
    newInsights: number;
    investigatingInsights: number;
    criticalInsights: number;
    highPriorityInsights: number;
    anomaliesCount: number;
    correlationsCount: number;
    bottlenecksCount: number;
    affectedIntegrationsCount: number;
  };
  severityDistribution: Record<IntelligenceSeverity, number>;
  categoryDistribution: Record<string, number>;
  statusDistribution: Record<IntelligenceStatus, number>;
  recentInsights: IntelligenceInsightDTO[];
  topAnomalies: IntelligenceInsightDTO[];
  topCorrelations: IntelligenceInsightDTO[];
}

export interface IntelligenceMetricsResponse {
  tenantId: string;
  totalInsightsGenerated: number;
  activeCount: number;
  resolvedCount: number;
  dismissedCount: number;
  resolutionRatePercent: number;
  avgResolutionTimeHours: number;
  pendenciesCreatedFromInsights: number;
  automationsTriggered: number;
  ruleTriggerCounts: Array<{ ruleId: string; name: string; count: number; category: string }>;
  byCategory: Array<{ category: string; count: number; activeCount: number }>;
  bySeverity: Array<{ severity: IntelligenceSeverity; count: number }>;
}

export interface IntelligenceRunResult {
  tenantId: string;
  executedAt: string;
  rulesEvaluated: number;
  insightsGenerated: number;
  insightsNew: number;
  insightsUpdated: number;
  insightsSkippedDeduplication: number;
  insights: IntelligenceInsightDTO[];
}

export interface IntelligenceTimelineItem {
  id: string;
  stage: 'DETECTADO' | 'RECONHECIDO' | 'INVESTIGANDO' | 'ACAO_EXECUTADA' | 'RESOLVIDO' | 'DESCARTADO';
  timestamp: string;
  userId?: string | null;
  userName?: string | null;
  description: string;
  metadata?: Record<string, any>;
}

export interface IntelligenceFilterOptions {
  period?: string;
  startDate?: string;
  endDate?: string;
  status?: IntelligenceStatus;
  severity?: IntelligenceSeverity;
  category?: string;
  type?: IntelligenceInsightType;
  entityType?: string;
  entityId?: string;
  search?: string;
  bankId?: string;
  partnerId?: string;
  productId?: string;
}
