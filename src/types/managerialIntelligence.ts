export type InsightSeverity = 'INFO' | 'ATENCAO' | 'CRITICO';

export type InsightCategory =
  | 'PRODUCAO'
  | 'CONVERSAO'
  | 'GARGALO_SLA'
  | 'CONCENTRACAO'
  | 'CANCELAMENTO'
  | 'CIP';

export interface ManagerialInsight {
  code: string;
  title: string;
  severity: InsightSeverity;
  category: InsightCategory;
  metric: string;
  currentValue: number;
  previousValue: number | null;
  deltaAbsolute: number | null;
  deltaPercent: number | null;
  deltaPercentagePoints?: number | null;
  entityType?: 'BANK' | 'PARTNER' | 'STATUS' | 'PRODUCT' | 'DIGITIZER' | 'TENANT';
  entityId?: string;
  entityName?: string;
  explanation: string;
  recommendation: string;
  period: string;
  comparisonPeriod?: string;
  generatedAt: string;
}

export type ScoreClassification = 'SAUDAVEL' | 'ATENCAO' | 'CRITICO';

export interface OperationalHealthScore {
  score: number;
  classification: ScoreClassification;
  slaPenalty: number;
  riskPenalty: number;
  cipPenalty: number;
  overduePenalty: number;
  baseValues: {
    activeProposals: number;
    overSlaCount: number;
    atRiskCount: number;
    cipRetainedCount: number;
    overdueTasksCount: number;
    totalTasksCount: number;
  };
  generatedAt: string;
}

export interface ExecutiveHealthScore {
  score: number;
  classification: ScoreClassification;
  conversionScore: number;
  growthScore: number;
  operationalScore: number;
  comparisonAvailable: boolean;
  baseValues: {
    currentConversion: number;
    previousConversion: number | null;
    currentPaidValue: number;
    previousPaidValue: number | null;
    ohsScore: number;
  };
  generatedAt: string;
}

export interface HealthScoreResponse {
  executive: ExecutiveHealthScore;
  operational: OperationalHealthScore;
  generatedAt: string;
}
