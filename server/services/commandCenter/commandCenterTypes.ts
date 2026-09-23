import { IncidentSeverity, IncidentStatus, IncidentType, IncidentSource } from '@prisma/client';

export interface IncidentFilterOptions {
  severity?: IncidentSeverity | IncidentSeverity[];
  status?: IncidentStatus | IncidentStatus[];
  type?: IncidentType | IncidentType[];
  source?: IncidentSource | IncidentSource[];
  assignedToId?: string;
  bankId?: string;
  partnerId?: string;
  integrationSlug?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'severity' | 'createdAt' | 'updatedAt' | 'impactProposalsVolume' | 'slaDeadline';
  sortOrder?: 'asc' | 'desc';
}

export interface ImpactAnalysisResult {
  proposalsAffectedCount: number;
  proposalsPotentialVolume: number;
  simulationsAffectedCount: number;
  partnersImpactedCount: number;
  pendenciesCount: number;
  productsImpacted: string[];
  conveniosImpacted: string[];
  bankCode?: string;
  integrationSlug?: string;
  windowStart: Date;
  windowEnd: Date;
  summaryText: string;
}

export interface SlaStatusResult {
  severity: IncidentSeverity;
  type?: IncidentType | null;
  targetMinutes: number;
  acknowledgeMinutesTarget: number;
  elapsedMinutes: number;
  consumedPercent: number;
  slaStatus: 'DENTRO_SLA' | 'PROXIMO_SLA' | 'SLA_ESTOURADO';
  deadline: Date;
  isBreached: boolean;
  isNearBreach: boolean; // >80%
}

export interface OperationalOverviewKPIs {
  openIncidentsCount: number;
  criticalIncidentsCount: number;
  investigatingIncidentsCount: number;
  relatedPendenciesCount: number;
  activeInsightsCount: number;
  affectedIntegrationsCount: number;
  potentiallyImpactedProposalsCount: number;
  potentiallyImpactedProposalsVolume: number;
  slaAtRiskCount: number;
}

export interface OperationalAttentionItem {
  id: string;
  type: 'INCIDENT' | 'INSIGHT' | 'INTEGRATION' | 'SLA_BREACH';
  severity: IncidentSeverity;
  title: string;
  summary: string;
  entityLink?: string;
  createdAt: Date;
}

export interface CommandCenterOverview {
  kpis: OperationalOverviewKPIs;
  executiveSummary: {
    activeIncidentsText: string;
    criticalStatusText: string;
    integrationsStatusText: string;
    slaRiskText: string;
  };
  attentionItems: OperationalAttentionItem[];
  recentTimelineEvents: any[];
  realtimeConnected: boolean;
  lastIntelligenceRun?: Date;
}

export interface OperationalTimelineItem {
  id: string;
  source: 'INCIDENT' | 'INTELLIGENCE' | 'INTEGRATION' | 'PENDENCY' | 'AUTOMATION';
  type: string;
  title: string;
  description?: string | null;
  severity?: string;
  timestamp: Date;
  actorName?: string | null;
  incidentId?: string | null;
  incidentNumber?: string | null;
  metadata?: any;
}
