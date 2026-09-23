import { PrismaClient } from '@prisma/client';
import {
  IntelligenceFilterOptions,
  IntelligenceInsightDTO,
  IntelligenceOverviewResponse,
  IntelligenceMetricsResponse,
  IntelligenceRunResult,
  IntelligenceTimelineItem,
  IntelligenceRuleConfigDTO,
} from './intelligenceTypes.js';
import { AnomalyDetectionService } from './anomalyDetectionService.js';
import { IntelligenceRepository } from './intelligenceRepository.js';
import { CentralEventBus } from '../eventBus.js';
import { AuditLogService } from '../auditLogService.js';
import { PendencyService } from '../pendencyService.js';
import { logger } from '../../logger.js';

export class IntelligenceService {
  private static anomalyDetector = new AnomalyDetectionService();

  /**
   * Main manual or periodic intelligence scan execution.
   */
  public static async runAnalysis(
    prisma: PrismaClient,
    tenantId: string,
    userId?: string,
    filters: { period?: any; startDate?: string; endDate?: string } = {}
  ): Promise<IntelligenceRunResult> {
    const executedAt = new Date().toISOString();
    logger.info({ tenantId, userId }, '[INTELLIGENCE] Iniciando varredura analítica de regras e anomalias...');

    // 1. Detect candidate anomalies and correlations
    const candidates = await this.anomalyDetector.detectAnomalies(prisma, tenantId, filters);

    let insightsNew = 0;
    let insightsUpdated = 0;
    let insightsSkipped = 0;
    const generatedInsights: IntelligenceInsightDTO[] = [];

    const eventBus = CentralEventBus.getInstance();

    // 2. Persist with deduplication
    for (const cand of candidates) {
      const { insight, isNew } = await IntelligenceRepository.upsertInsight(prisma, tenantId, cand);
      generatedInsights.push(insight);

      if (isNew) {
        insightsNew++;
        // Publish event to CentralEventBus
        eventBus.publish({
          tenantId,
          eventType: 'INTELLIGENCE_INSIGHT_CREATED',
          entityId: insight.id,
          entity: 'IntelligenceInsight',
          userId,
          data: {
            insightId: insight.id,
            type: insight.type,
            severity: insight.severity,
            category: insight.category,
            title: insight.title,
          },
          audit: true,
        });

        if (insight.severity === 'CRITICAL') {
          eventBus.publish({
            tenantId,
            eventType: 'INTELLIGENCE_CRITICAL',
            entityId: insight.id,
            entity: 'IntelligenceInsight',
            userId,
            data: { insightId: insight.id, title: insight.title, severity: insight.severity },
          });
        }

        if (insight.type === 'CORRELATION') {
          eventBus.publish({
            tenantId,
            eventType: 'INTELLIGENCE_CORRELATION_DETECTED',
            entityId: insight.id,
            entity: 'IntelligenceInsight',
            userId,
            data: { insightId: insight.id, title: insight.title },
          });
        } else {
          eventBus.publish({
            tenantId,
            eventType: 'INTELLIGENCE_ANOMALY_DETECTED',
            entityId: insight.id,
            entity: 'IntelligenceInsight',
            userId,
            data: { insightId: insight.id, title: insight.title, type: insight.type },
          });
        }
      } else {
        insightsUpdated++;
      }
    }

    logger.info(
      { tenantId, candidatesCount: candidates.length, insightsNew, insightsUpdated },
      '[INTELLIGENCE] Varredura analítica concluída.'
    );

    return {
      tenantId,
      executedAt,
      rulesEvaluated: 14,
      insightsGenerated: generatedInsights.length,
      insightsNew,
      insightsUpdated,
      insightsSkippedDeduplication: insightsSkipped,
      insights: generatedInsights,
    };
  }

  /**
   * Retrieves Intelligence Overview.
   */
  public static async getOverview(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<IntelligenceOverviewResponse> {
    return IntelligenceRepository.getOverview(prisma, tenantId);
  }

  /**
   * Lists Insights with filter options.
   */
  public static async listInsights(
    prisma: PrismaClient,
    tenantId: string,
    filters: IntelligenceFilterOptions = {}
  ): Promise<{ insights: IntelligenceInsightDTO[]; totalCount: number }> {
    return IntelligenceRepository.listInsights(prisma, tenantId, filters);
  }

  /**
   * Retrieves Insight Detail.
   */
  public static async getInsightById(
    prisma: PrismaClient,
    tenantId: string,
    id: string
  ): Promise<IntelligenceInsightDTO | null> {
    return IntelligenceRepository.getInsightById(prisma, tenantId, id);
  }

  /**
   * Acknowledges Insight.
   */
  public static async acknowledgeInsight(
    prisma: PrismaClient,
    tenantId: string,
    id: string,
    userId: string
  ): Promise<IntelligenceInsightDTO | null> {
    const updated = await IntelligenceRepository.updateInsightStatus(prisma, tenantId, id, 'ACKNOWLEDGED', userId);
    if (updated) {
      CentralEventBus.getInstance().publish({
        tenantId,
        eventType: 'INTELLIGENCE_INSIGHT_UPDATED',
        entityId: id,
        entity: 'IntelligenceInsight',
        userId,
        data: { status: 'ACKNOWLEDGED' },
        audit: true,
      });
    }
    return updated;
  }

  /**
   * Investigates Insight.
   */
  public static async investigateInsight(
    prisma: PrismaClient,
    tenantId: string,
    id: string,
    userId: string
  ): Promise<IntelligenceInsightDTO | null> {
    const updated = await IntelligenceRepository.updateInsightStatus(prisma, tenantId, id, 'INVESTIGATING', userId);
    if (updated) {
      CentralEventBus.getInstance().publish({
        tenantId,
        eventType: 'INTELLIGENCE_INSIGHT_UPDATED',
        entityId: id,
        entity: 'IntelligenceInsight',
        userId,
        data: { status: 'INVESTIGATING' },
        audit: true,
      });
    }
    return updated;
  }

  /**
   * Resolves Insight.
   */
  public static async resolveInsight(
    prisma: PrismaClient,
    tenantId: string,
    id: string,
    userId: string
  ): Promise<IntelligenceInsightDTO | null> {
    const updated = await IntelligenceRepository.updateInsightStatus(prisma, tenantId, id, 'RESOLVED', userId);
    if (updated) {
      CentralEventBus.getInstance().publish({
        tenantId,
        eventType: 'INTELLIGENCE_INSIGHT_RESOLVED',
        entityId: id,
        entity: 'IntelligenceInsight',
        userId,
        data: { status: 'RESOLVED' },
        audit: true,
      });
    }
    return updated;
  }

  /**
   * Dismisses Insight.
   */
  public static async dismissInsight(
    prisma: PrismaClient,
    tenantId: string,
    id: string,
    userId: string
  ): Promise<IntelligenceInsightDTO | null> {
    const updated = await IntelligenceRepository.updateInsightStatus(prisma, tenantId, id, 'DISMISSED', userId);
    if (updated) {
      CentralEventBus.getInstance().publish({
        tenantId,
        eventType: 'INTELLIGENCE_INSIGHT_UPDATED',
        entityId: id,
        entity: 'IntelligenceInsight',
        userId,
        data: { status: 'DISMISSED' },
        audit: true,
      });
    }
    return updated;
  }

  /**
   * Creates a formal Pendency from an Insight adhering to strict idempotency.
   */
  public static async createPendencyFromInsight(
    prisma: PrismaClient,
    tenantId: string,
    insightId: string,
    userId: string,
    params: { title?: string; priority?: string; notes?: string } = {}
  ): Promise<any> {
    const insight = await IntelligenceRepository.getInsightById(prisma, tenantId, insightId);
    if (!insight) {
      throw new Error('Insight de inteligência não encontrado.');
    }

    const priorityMap: Record<string, string> = {
      CRITICAL: 'URGENT',
      HIGH: 'HIGH',
      MEDIUM: 'NORMAL',
      LOW: 'LOW',
      INFO: 'LOW',
    };

    const pendencyPriority = params.priority || (priorityMap[insight.severity] as any) || 'HIGH';
    const pendencyTitle = params.title || `[Inteligência] ${insight.title}`;

    const { pendency } = await PendencyService.createPendency(prisma, {
      tenantId,
      title: pendencyTitle,
      type: insight.category === 'INTEGRAÇÕES' ? 'INTEGRACAO' : 'SISTEMICA',
      priority: pendencyPriority,
      description: `${insight.summary}\n\nEvidências:\n${insight.evidence.map(e => `• ${e.label || e.metric}: ${e.currentValue}`).join('\n')}`,
      source: 'INTELLIGENCE',
      sourceEventId: insight.id,
      userId,
      metadata: {
        insightId: insight.id,
        insightType: insight.type,
        severity: insight.severity,
        dedupKey: insight.dedupKey,
      },
    });

    return pendency;
  }

  /**
   * Retrieves Intelligence Metrics.
   */
  public static async getMetrics(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<IntelligenceMetricsResponse> {
    return IntelligenceRepository.getMetrics(prisma, tenantId);
  }

  /**
   * Retrieves Rules.
   */
  public static async getRules(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<IntelligenceRuleConfigDTO[]> {
    return IntelligenceRepository.getRuleConfigs(prisma, tenantId);
  }

  /**
   * Updates Rule.
   */
  public static async updateRule(
    prisma: PrismaClient,
    tenantId: string,
    ruleId: string,
    data: Partial<IntelligenceRuleConfigDTO>
  ): Promise<IntelligenceRuleConfigDTO> {
    return IntelligenceRepository.updateRuleConfig(prisma, tenantId, ruleId, data);
  }

  /**
   * Generates Insight Timeline.
   */
  public static async getInsightTimeline(
    prisma: PrismaClient,
    tenantId: string,
    id: string
  ): Promise<IntelligenceTimelineItem[]> {
    const insight = await IntelligenceRepository.getInsightById(prisma, tenantId, id);
    if (!insight) return [];

    const timeline: IntelligenceTimelineItem[] = [];

    // Stage 1: DETECTADO
    timeline.push({
      id: `${id}_detected`,
      stage: 'DETECTADO',
      timestamp: insight.detectedAt,
      description: `Insight identificado pela regra de inteligência com severidade ${insight.severity}.`,
    });

    // Stage 2: RECONHECIDO
    if (insight.acknowledgedAt) {
      timeline.push({
        id: `${id}_ack`,
        stage: 'RECONHECIDO',
        timestamp: insight.acknowledgedAt,
        userName: insight.acknowledgedByName,
        userId: insight.acknowledgedById,
        description: 'Insight reconhecido pela equipe de gestão operacional.',
      });
    }

    // Stage 3: INVESTIGANDO
    if (insight.status === 'INVESTIGATING') {
      timeline.push({
        id: `${id}_inv`,
        stage: 'INVESTIGANDO',
        timestamp: insight.updatedAt,
        description: 'Em fase de investigação e apuração de causas.',
      });
    }

    // Stage 4: RESOLVIDO / DESCARTADO
    if (insight.status === 'RESOLVED' && insight.resolvedAt) {
      timeline.push({
        id: `${id}_res`,
        stage: 'RESOLVIDO',
        timestamp: insight.resolvedAt,
        userName: insight.resolvedByName,
        userId: insight.resolvedById,
        description: 'Insight resolvido operacionalmente.',
      });
    } else if (insight.status === 'DISMISSED') {
      timeline.push({
        id: `${id}_dis`,
        stage: 'DESCARTADO',
        timestamp: insight.updatedAt,
        description: 'Insight descartado pela gestão.',
      });
    }

    return timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
}
