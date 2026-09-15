import { Decimal } from '@prisma/client/runtime/library';

export interface BottlenecksResponse {
  summary: {
    totalActive: number;
    totalOverSla: number;
    totalNearSla: number;
    totalValueStuck: number;
    avgDwellHours: number;
    maxDwellHours: number;
  };
  byAlcada: Array<{
    alcada: string;
    count: number;
    overSlaCount: number;
    nearSlaCount: number;
    totalValue: number;
    avgHours: number;
  }>;
  byStatus: Array<{
    statusId: string;
    statusCode: string;
    statusName: string;
    standardCategory: string;
    alcada: string;
    slaHours: number;
    count: number;
    overSlaCount: number;
    nearSlaCount: number;
    totalValue: number;
    avgHours: number;
  }>;
  topRetainedBanks: Array<{
    bankId: string;
    bankName: string;
    count: number;
    overSlaCount: number;
    totalValue: number;
    avgHours: number;
  }>;
  topRetainedPartners: Array<{
    partnerId: string;
    partnerName: string;
    partnerLogin: string;
    count: number;
    overSlaCount: number;
    totalValue: number;
    avgHours: number;
  }>;
  stuckProposalsSample: Array<{
    id: string;
    proposalNumber: string;
    clientName: string;
    clientCpfMasked: string;
    bankName: string;
    partnerName: string;
    statusName: string;
    alcada: string;
    slaHours: number;
    dwellHours: number;
    releasedValue: number;
    contractValue: number;
    createdAt: string;
    isOverSla: boolean;
    isNearSla: boolean;
  }>;
}

export interface DwellTimeStatusStats {
  statusId: string | null;
  statusName: string;
  countTransitions: number;
  avgDurationHours: number | null;
  medianDurationHours: number | null;
  minDurationHours: number | null;
  maxDurationHours: number | null;
}

export interface DwellTimeResponse {
  summary: {
    totalTransitions: number;
    avgOverallHours: number | null;
  };
  byStatus: DwellTimeStatusStats[];
  byBank: Array<{
    bankId: string;
    bankName: string;
    countTransitions: number;
    avgDurationHours: number | null;
  }>;
  byPartner: Array<{
    partnerId: string;
    partnerName: string;
    countTransitions: number;
    avgDurationHours: number | null;
  }>;
  byAlcada: Array<{
    alcada: string;
    countTransitions: number;
    avgDurationHours: number | null;
  }>;
}

export interface AgingBucket {
  bucket: string; // '0d', '1d', '2d', '3d', '4d', '5d', '6-10d', '11-20d', '20d+'
  label: string;
  count: number;
  totalValue: number;
  percentageCount: number;
  percentageValue: number;
  statusDistribution: Array<{
    statusName: string;
    count: number;
    totalValue: number;
  }>;
}

export interface AgingResponse {
  summary: {
    totalOpenProposals: number;
    totalOpenValue: number;
    avgAgeDays: number;
    maxAgeDays: number;
  };
  buckets: AgingBucket[];
}

export interface ProductionResponse {
  summary: {
    totalProposals: number;
    totalContractValue: number;
    totalReleasedValue: number;
    paidCount: number;
    paidReleasedValue: number;
    cancelledCount: number;
    conversionRatePercent: number;
  };
  byDay: Array<{
    date: string;
    count: number;
    contractValue: number;
    releasedValue: number;
    paidCount: number;
    paidValue: number;
  }>;
  byWeek: Array<{
    week: string;
    count: number;
    contractValue: number;
    releasedValue: number;
    paidCount: number;
    paidValue: number;
  }>;
  byStatus: Array<{
    statusId: string | null;
    statusCode: string;
    statusName: string;
    standardCategory: string;
    count: number;
    contractValue: number;
    releasedValue: number;
  }>;
  byBank: Array<{
    bankId: string;
    bankName: string;
    count: number;
    contractValue: number;
    releasedValue: number;
    paidCount: number;
    paidValue: number;
    conversionRatePercent: number;
  }>;
  byPartner: Array<{
    partnerId: string;
    partnerName: string;
    partnerLogin: string;
    count: number;
    contractValue: number;
    releasedValue: number;
    paidCount: number;
    paidValue: number;
    conversionRatePercent: number;
  }>;
  byDigitizer: Array<{
    digitizerId: string;
    digitizerName: string;
    count: number;
    contractValue: number;
    releasedValue: number;
    paidCount: number;
    paidValue: number;
  }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    count: number;
    contractValue: number;
    releasedValue: number;
    paidCount: number;
    paidValue: number;
  }>;
}

export interface SlaResponse {
  summary: {
    totalEvaluated: number;
    totalWithinSla: number;
    totalNearSla: number;
    totalOverSla: number;
    complianceRatePercent: number;
  };
  portabilityCip: {
    totalInCip: number;
    normalCount: number;
    warningCount: number; // 4th day
    urgentCount: number; // 5th day
    overdueCount: number; // >5 days
    balanceRetainedTotal: number;
  };
  byStatus: Array<{
    statusId: string;
    statusName: string;
    slaHours: number;
    withinSla: number;
    nearSla: number;
    overSla: number;
    complianceRatePercent: number;
  }>;
  byBank: Array<{
    bankId: string;
    bankName: string;
    withinSla: number;
    overSla: number;
    complianceRatePercent: number;
  }>;
  byPartner: Array<{
    partnerId: string;
    partnerName: string;
    withinSla: number;
    overSla: number;
    complianceRatePercent: number;
  }>;
}
