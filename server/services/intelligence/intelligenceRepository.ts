import {
  PrismaClient,
  IntelligenceInsightType,
  IntelligenceSeverity,
  IntelligenceStatus,
  Prisma,
} from '@prisma/client';
import {
  IntelligenceFilterOptions,
  IntelligenceInsightDTO,
  IntelligenceOverviewResponse,
  IntelligenceMetricsResponse,
  IntelligenceRuleConfigDTO,
} from './intelligenceTypes.js';
import { INTELLIGENCE_RULES_CATALOG } from './intelligenceRules.js';
import { GeneratedInsightCandidate } from './anomalyDetectionService.js';

export class IntelligenceRepository {
  /**
   * Persists or updates insight with strict deduplication key logic.
   */
  public static async upsertInsight(
    prisma: PrismaClient,
    tenantId: string,
    candidate: GeneratedInsightCandidate
  ): Promise<{ insight: IntelligenceInsightDTO; isNew: boolean }> {
    const existing = await prisma.intelligenceInsight.findFirst({
      where: {
        tenantId,
        dedupKey: candidate.dedupKey,
      },
      include: {
        resolvedBy: { select: { name: true } },
        acknowledgedBy: { select: { name: true } },
      },
    });

    if (existing) {
      // If already resolved or dismissed, do not overwrite unless significant change
      if (existing.status === 'RESOLVED' || existing.status === 'DISMISSED') {
        return { insight: this.mapToDTO(existing), isNew: false };
      }

      const updated = await prisma.intelligenceInsight.update({
        where: { id: existing.id },
        data: {
          title: candidate.title,
          summary: candidate.summary,
          explanation: candidate.explanation,
          severity: candidate.severity,
          confidence: candidate.confidence,
          metadata: candidate.metadata as any,
          evidence: candidate.evidence as any,
          suggestedActions: candidate.suggestedActions as any,
          updatedAt: new Date(),
        },
        include: {
          resolvedBy: { select: { name: true } },
          acknowledgedBy: { select: { name: true } },
        },
      });

      return { insight: this.mapToDTO(updated), isNew: false };
    }

    const created = await prisma.intelligenceInsight.create({
      data: {
        tenantId,
        type: candidate.type,
        category: candidate.category,
        severity: candidate.severity,
        title: candidate.title,
        summary: candidate.summary,
        explanation: candidate.explanation,
        status: 'NEW',
        confidence: candidate.confidence,
        periodStart: candidate.periodStart,
        periodEnd: candidate.periodEnd,
        comparisonStart: candidate.comparisonStart,
        comparisonEnd: candidate.comparisonEnd,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        entityName: candidate.entityName,
        metadata: candidate.metadata as any,
        evidence: candidate.evidence as any,
        suggestedActions: candidate.suggestedActions as any,
        dedupKey: candidate.dedupKey,
      },
      include: {
        resolvedBy: { select: { name: true } },
        acknowledgedBy: { select: { name: true } },
      },
    });

    return { insight: this.mapToDTO(created), isNew: true };
  }

  /**
   * Retrieves insights list with multi-tenant filtering.
   */
  public static async listInsights(
    prisma: PrismaClient,
    tenantId: string,
    filters: IntelligenceFilterOptions = {}
  ): Promise<{ insights: IntelligenceInsightDTO[]; totalCount: number }> {
    const where: Prisma.IntelligenceInsightWhereInput = {
      tenantId,
    };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.severity) {
      where.severity = filters.severity;
    }
    if (filters.category) {
      where.category = { contains: filters.category, mode: 'insensitive' };
    }
    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters.entityId) {
      where.entityId = filters.entityId;
    }
    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { summary: { contains: term, mode: 'insensitive' } },
        { entityName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rows, totalCount] = await Promise.all([
      prisma.intelligenceInsight.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
        include: {
          resolvedBy: { select: { name: true } },
          acknowledgedBy: { select: { name: true } },
        },
        take: 100,
      }),
      prisma.intelligenceInsight.count({ where }),
    ]);

    return {
      insights: rows.map(r => this.mapToDTO(r)),
      totalCount,
    };
  }

  /**
   * Gets single insight by ID.
   */
  public static async getInsightById(
    prisma: PrismaClient,
    tenantId: string,
    id: string
  ): Promise<IntelligenceInsightDTO | null> {
    const row = await prisma.intelligenceInsight.findFirst({
      where: { id, tenantId },
      include: {
        resolvedBy: { select: { name: true } },
        acknowledgedBy: { select: { name: true } },
      },
    });

    return row ? this.mapToDTO(row) : null;
  }

  /**
   * Updates insight status (ACKNOWLEDGE, INVESTIGATE, RESOLVE, DISMISS).
   */
  public static async updateInsightStatus(
    prisma: PrismaClient,
    tenantId: string,
    id: string,
    status: IntelligenceStatus,
    userId?: string
  ): Promise<IntelligenceInsightDTO | null> {
    const existing = await prisma.intelligenceInsight.findFirst({
      where: { id, tenantId },
    });

    if (!existing) return null;

    const data: Prisma.IntelligenceInsightUpdateInput = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'ACKNOWLEDGED') {
      data.acknowledgedAt = new Date();
      if (userId) data.acknowledgedBy = { connect: { id: userId } };
    } else if (status === 'RESOLVED') {
      data.resolvedAt = new Date();
      if (userId) data.resolvedBy = { connect: { id: userId } };
    }

    const updated = await prisma.intelligenceInsight.update({
      where: { id },
      data,
      include: {
        resolvedBy: { select: { name: true } },
        acknowledgedBy: { select: { name: true } },
      },
    });

    return this.mapToDTO(updated);
  }

  /**
   * Generates overview summary for Intelligence Dashboard.
   */
  public static async getOverview(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<IntelligenceOverviewResponse> {
    const [allInsights, recentInsights] = await Promise.all([
      prisma.intelligenceInsight.findMany({
        where: { tenantId },
        select: {
          id: true,
          status: true,
          severity: true,
          category: true,
          type: true,
          entityType: true,
        },
      }),
      prisma.intelligenceInsight.findMany({
        where: { tenantId },
        orderBy: [{ detectedAt: 'desc' }],
        take: 10,
        include: {
          resolvedBy: { select: { name: true } },
          acknowledgedBy: { select: { name: true } },
        },
      }),
    ]);

    const severityDistribution: Record<IntelligenceSeverity, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFO: 0,
    };

    const statusDistribution: Record<IntelligenceStatus, number> = {
      NEW: 0,
      ACKNOWLEDGED: 0,
      INVESTIGATING: 0,
      RESOLVED: 0,
      DISMISSED: 0,
    };

    const categoryDistribution: Record<string, number> = {};
    let anomaliesCount = 0;
    let correlationsCount = 0;
    let bottlenecksCount = 0;
    let affectedIntegrationsCount = 0;

    for (const item of allInsights) {
      severityDistribution[item.severity] = (severityDistribution[item.severity] || 0) + 1;
      statusDistribution[item.status] = (statusDistribution[item.status] || 0) + 1;
      categoryDistribution[item.category] = (categoryDistribution[item.category] || 0) + 1;

      if (item.status !== 'RESOLVED' && item.status !== 'DISMISSED') {
        if (item.type === 'ANOMALY' || item.type === 'PRODUCTION' || item.type === 'CONVERSION') anomaliesCount++;
        if (item.type === 'CORRELATION') correlationsCount++;
        if (item.type === 'BOTTLENECK' || item.type === 'SLA') bottlenecksCount++;
        if (item.type === 'INTEGRATION') affectedIntegrationsCount++;
      }
    }

    const recentDTOs = recentInsights.map(r => this.mapToDTO(r));
    const topAnomalies = recentDTOs.filter(r => r.severity === 'CRITICAL' || r.severity === 'HIGH').slice(0, 5);
    const topCorrelations = recentDTOs.filter(r => r.type === 'CORRELATION').slice(0, 5);

    return {
      tenantId,
      summary: {
        totalInsights: allInsights.length,
        newInsights: statusDistribution.NEW,
        investigatingInsights: statusDistribution.INVESTIGATING,
        criticalInsights: severityDistribution.CRITICAL,
        highPriorityInsights: severityDistribution.HIGH + severityDistribution.CRITICAL,
        anomaliesCount,
        correlationsCount,
        bottlenecksCount,
        affectedIntegrationsCount,
      },
      severityDistribution,
      categoryDistribution,
      statusDistribution,
      recentInsights: recentDTOs,
      topAnomalies,
      topCorrelations,
    };
  }

  /**
   * Calculates overall Intelligence metrics.
   */
  public static async getMetrics(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<IntelligenceMetricsResponse> {
    const insights = await prisma.intelligenceInsight.findMany({
      where: { tenantId },
      select: {
        id: true,
        category: true,
        severity: true,
        status: true,
        detectedAt: true,
        resolvedAt: true,
        metadata: true,
      },
    });

    let resolvedCount = 0;
    let dismissedCount = 0;
    let activeCount = 0;
    let totalResolutionTimeHours = 0;
    let pendenciesCreated = 0;

    const catMap = new Map<string, { count: number; active: number }>();
    const sevMap = new Map<IntelligenceSeverity, number>();

    for (const item of insights) {
      if (item.status === 'RESOLVED') {
        resolvedCount++;
        if (item.resolvedAt) {
          const diffHours = (item.resolvedAt.getTime() - item.detectedAt.getTime()) / (1000 * 3600);
          totalResolutionTimeHours += Math.max(0, diffHours);
        }
      } else if (item.status === 'DISMISSED') {
        dismissedCount++;
      } else {
        activeCount++;
      }

      const catEntry = catMap.get(item.category) || { count: 0, active: 0 };
      catEntry.count++;
      if (item.status !== 'RESOLVED' && item.status !== 'DISMISSED') catEntry.active++;
      catMap.set(item.category, catEntry);

      sevMap.set(item.severity, (sevMap.get(item.severity) || 0) + 1);
    }

    const resolutionRatePercent = insights.length > 0 ? (resolvedCount / insights.length) * 100 : 0;
    const avgResolutionTimeHours = resolvedCount > 0 ? totalResolutionTimeHours / resolvedCount : 0;

    return {
      tenantId,
      totalInsightsGenerated: insights.length,
      activeCount,
      resolvedCount,
      dismissedCount,
      resolutionRatePercent: Number(resolutionRatePercent.toFixed(1)),
      avgResolutionTimeHours: Number(avgResolutionTimeHours.toFixed(1)),
      pendenciesCreatedFromInsights: pendenciesCreated,
      automationsTriggered: 0,
      ruleTriggerCounts: INTELLIGENCE_RULES_CATALOG.map(r => ({
        ruleId: r.id,
        name: r.name,
        category: r.category,
        count: insights.filter(i => (i.metadata as any)?.ruleId === r.id || i.category === r.category).length,
      })),
      byCategory: Array.from(catMap.entries()).map(([category, d]) => ({
        category,
        count: d.count,
        activeCount: d.active,
      })),
      bySeverity: Array.from(sevMap.entries()).map(([severity, count]) => ({
        severity,
        count,
      })),
    };
  }

  /**
   * Retrieves rule configurations.
   */
  public static async getRuleConfigs(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<IntelligenceRuleConfigDTO[]> {
    const customConfigs = await prisma.intelligenceRuleConfig.findMany({
      where: { tenantId },
    });

    return INTELLIGENCE_RULES_CATALOG.map(def => {
      const custom = customConfigs.find(c => c.ruleId === def.id);
      return {
        id: custom?.id,
        tenantId,
        ruleId: def.id,
        name: def.name,
        category: def.category,
        description: def.description,
        enabled: custom ? custom.enabled : def.enabled,
        severity: (custom ? custom.severity : def.defaultSeverity) as IntelligenceSeverity,
        threshold: custom?.threshold ?? def.defaultThreshold,
        config: (custom?.config as any) ?? null,
      };
    });
  }

  /**
   * Updates rule configuration.
   */
  public static async updateRuleConfig(
    prisma: PrismaClient,
    tenantId: string,
    ruleId: string,
    data: Partial<IntelligenceRuleConfigDTO>
  ): Promise<IntelligenceRuleConfigDTO> {
    const catalogItem = INTELLIGENCE_RULES_CATALOG.find(r => r.id === ruleId);
    const name = data.name || catalogItem?.name || ruleId;
    const category = data.category || catalogItem?.category || 'GENERAL';

    const saved = await prisma.intelligenceRuleConfig.upsert({
      where: {
        tenantId_ruleId: {
          tenantId,
          ruleId,
        },
      },
      update: {
        enabled: data.enabled !== undefined ? data.enabled : undefined,
        severity: data.severity ? (data.severity as any) : undefined,
        threshold: data.threshold !== undefined ? data.threshold : undefined,
        config: data.config ? (data.config as any) : undefined,
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        ruleId,
        name,
        category,
        enabled: data.enabled !== undefined ? data.enabled : true,
        severity: (data.severity as any) || catalogItem?.defaultSeverity || 'MEDIUM',
        threshold: data.threshold ?? catalogItem?.defaultThreshold ?? null,
        config: (data.config as any) ?? null,
      },
    });

    return {
      id: saved.id,
      tenantId: saved.tenantId,
      ruleId: saved.ruleId,
      name: saved.name,
      category: saved.category,
      enabled: saved.enabled,
      severity: saved.severity as IntelligenceSeverity,
      threshold: saved.threshold,
      config: saved.config as any,
    };
  }

  /**
   * Maps Prisma database entity to safe DTO.
   */
  private static mapToDTO(item: any): IntelligenceInsightDTO {
    return {
      id: item.id,
      tenantId: item.tenantId,
      type: item.type,
      category: item.category,
      severity: item.severity,
      title: item.title,
      summary: item.summary,
      explanation: item.explanation,
      status: item.status,
      confidence: item.confidence,
      detectedAt: item.detectedAt ? item.detectedAt.toISOString() : new Date().toISOString(),
      periodStart: item.periodStart ? item.periodStart.toISOString() : new Date().toISOString(),
      periodEnd: item.periodEnd ? item.periodEnd.toISOString() : new Date().toISOString(),
      comparisonStart: item.comparisonStart ? item.comparisonStart.toISOString() : null,
      comparisonEnd: item.comparisonEnd ? item.comparisonEnd.toISOString() : null,
      entityType: item.entityType,
      entityId: item.entityId,
      entityName: item.entityName,
      metadata: item.metadata,
      evidence: Array.isArray(item.evidence) ? item.evidence : [],
      suggestedActions: Array.isArray(item.suggestedActions) ? item.suggestedActions : [],
      dedupKey: item.dedupKey,
      createdAt: item.createdAt ? item.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: item.updatedAt ? item.updatedAt.toISOString() : new Date().toISOString(),
      resolvedAt: item.resolvedAt ? item.resolvedAt.toISOString() : null,
      resolvedById: item.resolvedById,
      resolvedByName: item.resolvedBy?.name || null,
      acknowledgedAt: item.acknowledgedAt ? item.acknowledgedAt.toISOString() : null,
      acknowledgedById: item.acknowledgedById,
      acknowledgedByName: item.acknowledgedBy?.name || null,
    };
  }
}
