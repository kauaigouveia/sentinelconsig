import {
  PrismaClient,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  IncidentSource,
  Prisma,
} from '@prisma/client';
import { IncidentFilterOptions, ImpactAnalysisResult } from './commandCenterTypes';
import { IncidentLifecycleError, validateStatusTransition, getTransitionTimestampField } from './incidentLifecycle';
import { IncidentSlaService } from './incidentSlaService';
import { ImpactAnalysisService } from './impactAnalysisService';
import { CentralEventBus } from '../eventBus';
import { AuditLogService } from '../auditLogService';
import { PendencyService } from '../pendencyService';

export class IncidentService {
  /**
   * Generate next sequential incident number for tenant (e.g. INC-2026-0001)
   */
  static async generateIncidentNumber(prisma: PrismaClient, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INC-${year}-`;

    const latest = await prisma.incident.findFirst({
      where: {
        tenantId,
        incidentNumber: { startsWith: prefix },
      },
      orderBy: { incidentNumber: 'desc' },
      select: { incidentNumber: true },
    });

    let nextNum = 1;
    if (latest && latest.incidentNumber) {
      const parts = latest.incidentNumber.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
    }

    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  /**
   * Create a new Incident with deduplication, SLA calculation, initial impact snapshot, and audit
   */
  static async createIncident(
    prisma: PrismaClient,
    tenantId: string,
    data: {
      title: string;
      description?: string;
      type?: IncidentType;
      severity?: IncidentSeverity;
      source?: IncidentSource;
      dedupKey?: string;
      bankId?: string;
      productId?: string;
      convenioId?: string;
      partnerId?: string;
      integrationSlug?: string;
      assignedToId?: string;
      createdById?: string;
      metadata?: any;
      tags?: string[];
    },
    userContext?: { userId: string; userName: string; userEmail: string; role: string; reqIp?: string }
  ) {
    const type = data.type || IncidentType.OPERATIONAL;
    const severity = data.severity || IncidentSeverity.MEDIUM;
    const source = data.source || IncidentSource.MANUAL;

    // Deduplication check: if open incident with same dedupKey exists, return it
    if (data.dedupKey) {
      const existing = await prisma.incident.findFirst({
        where: {
          tenantId,
          dedupKey: data.dedupKey,
          status: { notIn: [IncidentStatus.RESOLVED, IncidentStatus.CLOSED] },
        },
      });

      if (existing) {
        // Record deduplicated timeline event
        await prisma.incidentTimelineEvent.create({
          data: {
            tenantId,
            incidentId: existing.id,
            type: 'SYSTEM_ALERT',
            title: 'Ocorrência Deduplicada Registrada',
            description: `Ocorrência duplicada suprimida pelo dedupKey (${data.dedupKey}).`,
            userId: userContext?.userId || null,
            userName: userContext?.userName || 'Sistema',
          },
        });
        return existing;
      }
    }

    const incidentNumber = await this.generateIncidentNumber(prisma, tenantId);
    const slaTargets = await IncidentSlaService.getSlaTargets(prisma, tenantId, severity, type);
    const slaDeadline = new Date(Date.now() + slaTargets.resolveMinutes * 60 * 1000);

    // Initial impact calculation
    const impact = await ImpactAnalysisService.calculateImpact(prisma, tenantId, {
      bankId: data.bankId,
      productId: data.productId,
      convenioId: data.convenioId,
      partnerId: data.partnerId,
      integrationSlug: data.integrationSlug,
    });

    const created = await prisma.incident.create({
      data: {
        tenantId,
        incidentNumber,
        title: data.title,
        description: data.description,
        type,
        severity,
        status: IncidentStatus.OPEN,
        source,
        dedupKey: data.dedupKey || null,
        bankId: data.bankId || null,
        productId: data.productId || null,
        convenioId: data.convenioId || null,
        partnerId: data.partnerId || null,
        integrationSlug: data.integrationSlug || null,
        impactProposalsCount: impact.proposalsAffectedCount,
        impactProposalsVolume: new Prisma.Decimal(impact.proposalsPotentialVolume),
        impactSimulationsCount: impact.simulationsAffectedCount,
        impactPartnersCount: impact.partnersImpactedCount,
        impactSummary: impact.summaryText,
        slaMinutesTarget: slaTargets.resolveMinutes,
        slaAcknowledgeTarget: slaTargets.acknowledgeMinutes,
        slaDeadline,
        assignedToId: data.assignedToId || null,
        assignedAt: data.assignedToId ? new Date() : null,
        createdById: data.createdById || userContext?.userId || null,
        metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        tags: data.tags || [],
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        bank: { select: { id: true, name: true, code: true } },
        partner: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true } },
        convenio: { select: { id: true, name: true } },
      },
    });

    // Create Initial Timeline Event
    await prisma.incidentTimelineEvent.create({
      data: {
        tenantId,
        incidentId: created.id,
        type: 'CREATED',
        title: `Incidente ${incidentNumber} Aberto`,
        description: `Incidente registrado com severidade ${severity} via ${source}.`,
        userId: userContext?.userId || null,
        userName: userContext?.userName || 'Sistema',
      },
    });

    // Audit Log
    if (userContext) {
      await AuditLogService.record(prisma, {
        tenantId,
        userId: userContext.userId,
        action: 'COMMAND_INCIDENT_CREATE',
        entity: 'Incident',
        entityId: created.id,
        newData: {
          incidentNumber,
          title: data.title,
          severity,
          type,
          source,
        },
        ipAddress: userContext.reqIp,
      });
    }

    // Emit Central Event
    CentralEventBus.getInstance().emit('COMMAND_INCIDENT_CREATED', {
      tenantId,
      incidentId: created.id,
      incidentNumber: created.incidentNumber,
      severity: created.severity,
      title: created.title,
    });

    if (severity === IncidentSeverity.CRITICAL) {
      CentralEventBus.getInstance().emit('COMMAND_INCIDENT_CRITICAL', {
        tenantId,
        incidentId: created.id,
        incidentNumber: created.incidentNumber,
        title: created.title,
      });
      CentralEventBus.getInstance().emit('INCIDENT_CRITICAL', {
        tenantId,
        incidentId: created.id,
        incidentNumber: created.incidentNumber,
      });
    }

    return created;
  }

  /**
   * Create Incident directly from an Intelligence Insight
   */
  static async createFromInsight(
    prisma: PrismaClient,
    tenantId: string,
    insightId: string,
    userContext?: { userId: string; userName: string; userEmail: string; role: string; reqIp?: string }
  ) {
    const insight = await prisma.intelligenceInsight.findFirst({
      where: { id: insightId, tenantId },
    });

    if (!insight) {
      throw new Error('Insight de inteligência não encontrado.');
    }

    const dedupKey = `INSIGHT_${insight.id}`;

    // Map Intelligence Severity -> Incident Severity
    let severity: IncidentSeverity = IncidentSeverity.MEDIUM;
    if (insight.severity === 'CRITICAL') severity = IncidentSeverity.CRITICAL;
    else if (insight.severity === 'HIGH') severity = IncidentSeverity.HIGH;
    else if (insight.severity === 'LOW' || insight.severity === 'INFO') severity = IncidentSeverity.LOW;

    const created = await this.createIncident(
      prisma,
      tenantId,
      {
        title: `Intelligence: ${insight.title}`,
        description: `${insight.summary}\n\nExplicação: ${insight.explanation || 'N/A'}`,
        type: IncidentType.INTELLIGENCE,
        severity,
        source: IncidentSource.INTELLIGENCE,
        dedupKey,
        metadata: {
          insightId: insight.id,
          insightType: insight.type,
          insightCategory: insight.category,
          confidence: insight.confidence,
        },
      },
      userContext
    );

    // Link Incident to Insight
    await prisma.incidentInsight.upsert({
      where: {
        incidentId_insightId: {
          incidentId: created.id,
          insightId: insight.id,
        },
      },
      create: {
        tenantId,
        incidentId: created.id,
        insightId: insight.id,
      },
      update: {},
    });

    // Update Insight status to INVESTIGATING
    await prisma.intelligenceInsight.update({
      where: { id: insight.id },
      data: {
        status: 'INVESTIGATING',
        acknowledgedAt: new Date(),
        acknowledgedById: userContext?.userId || null,
      },
    });

    // Record Timeline Event
    await prisma.incidentTimelineEvent.create({
      data: {
        tenantId,
        incidentId: created.id,
        type: 'INSIGHT_LINKED',
        title: 'Insight de Inteligência Vinculado',
        description: `Insight '${insight.title}' (${insight.type}) associado ao incidente.`,
        userId: userContext?.userId || null,
        userName: userContext?.userName || 'Sistema',
      },
    });

    return created;
  }

  /**
   * Transition Incident status with state machine enforcement and audit
   */
  static async updateStatus(
    prisma: PrismaClient,
    tenantId: string,
    incidentId: string,
    targetStatus: IncidentStatus,
    notes?: string,
    userContext?: { userId: string; userName: string; userEmail: string; role: string; reqIp?: string }
  ) {
    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId },
    });

    if (!incident) throw new Error('Incidente não encontrado.');

    if (!validateStatusTransition(incident.status, targetStatus)) {
      throw new IncidentLifecycleError(incident.status, targetStatus);
    }

    const updateData: any = {
      status: targetStatus,
    };

    const tsField = getTransitionTimestampField(targetStatus);
    if (tsField) {
      updateData[tsField] = new Date();
      if (targetStatus === IncidentStatus.ACKNOWLEDGED) {
        updateData.acknowledgedById = userContext?.userId || null;
      } else if (targetStatus === IncidentStatus.RESOLVED) {
        updateData.resolvedById = userContext?.userId || null;
        if (notes) updateData.resolutionNotes = notes;
      } else if (targetStatus === IncidentStatus.CLOSED) {
        updateData.closedById = userContext?.userId || null;
        if (notes) updateData.closureNotes = notes;
      }
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: updateData,
    });

    // Timeline Event
    await prisma.incidentTimelineEvent.create({
      data: {
        tenantId,
        incidentId,
        type: 'STATUS_CHANGED',
        title: `Status alterado para ${targetStatus}`,
        description: notes || `Incidente transicionado de ${incident.status} para ${targetStatus}.`,
        oldValue: incident.status,
        newValue: targetStatus,
        userId: userContext?.userId || null,
        userName: userContext?.userName || 'Sistema',
      },
    });

    // Audit Log
    if (userContext) {
      await AuditLogService.record(prisma, {
        tenantId,
        userId: userContext.userId,
        action: 'COMMAND_INCIDENT_STATUS_CHANGE',
        entity: 'Incident',
        entityId: incidentId,
        newData: {
          incidentNumber: incident.incidentNumber,
          oldStatus: incident.status,
          newStatus: targetStatus,
          notes,
        },
        ipAddress: userContext.reqIp,
      });
    }

    // Emit Events
    CentralEventBus.getInstance().emit('COMMAND_INCIDENT_STATUS_CHANGED', {
      tenantId,
      incidentId,
      incidentNumber: incident.incidentNumber,
      oldStatus: incident.status,
      newStatus: targetStatus,
    });

    CentralEventBus.getInstance().emit('INCIDENT_STATUS_CHANGED', {
      tenantId,
      incidentId,
      incidentNumber: incident.incidentNumber,
      status: targetStatus,
    });

    if (targetStatus === IncidentStatus.RESOLVED) {
      CentralEventBus.getInstance().emit('COMMAND_INCIDENT_RESOLVED', {
        tenantId,
        incidentId,
        incidentNumber: incident.incidentNumber,
      });
      CentralEventBus.getInstance().emit('INCIDENT_RESOLVED', {
        tenantId,
        incidentId,
        incidentNumber: incident.incidentNumber,
      });
    }

    return updated;
  }

  /**
   * Create a Pendency associated with an Incident using existing PendencyService
   */
  static async createPendencyFromIncident(
    prisma: PrismaClient,
    tenantId: string,
    incidentId: string,
    pendencyData: {
      type: string;
      title: string;
      description?: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      assignedToId?: string;
      proposalId?: string;
      partnerId?: string;
      bankId?: string;
    },
    userContext?: { userId: string; userName: string; userEmail: string; role: string; reqIp?: string }
  ) {
    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId },
    });

    if (!incident) throw new Error('Incidente não encontrado.');

    // Use existing PendencyService
    const { pendency } = await PendencyService.createPendency(prisma, {
      tenantId,
      type: pendencyData.type,
      title: pendencyData.title,
      description: pendencyData.description,
      priority: pendencyData.priority || 'MEDIUM',
      proposalId: pendencyData.proposalId,
      partnerId: pendencyData.partnerId || incident.partnerId || undefined,
      bankId: pendencyData.bankId || incident.bankId || undefined,
    });

    // Link Incident -> Pendency
    await prisma.incidentPendency.upsert({
      where: {
        incidentId_pendencyId: {
          incidentId,
          pendencyId: pendency.id,
        },
      },
      create: {
        tenantId,
        incidentId,
        pendencyId: pendency.id,
      },
      update: {},
    });

    // Timeline event
    await prisma.incidentTimelineEvent.create({
      data: {
        tenantId,
        incidentId,
        type: 'PENDENCY_CREATED',
        title: `Pendência Criada: ${pendency.title}`,
        description: `Pendência #${pendency.id} vinculada ao incidente.`,
        userId: userContext?.userId || null,
        userName: userContext?.userName || 'Sistema',
      },
    });

    // Recalculate impact snapshot
    await this.recalculateImpact(prisma, tenantId, incidentId);

    return pendency;
  }

  /**
   * Recalculate and update impact snapshot for incident
   */
  static async recalculateImpact(prisma: PrismaClient, tenantId: string, incidentId: string) {
    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId },
    });
    if (!incident) return;

    const impact = await ImpactAnalysisService.calculateImpact(prisma, tenantId, {
      incidentId,
      bankId: incident.bankId || undefined,
      productId: incident.productId || undefined,
      convenioId: incident.convenioId || undefined,
      partnerId: incident.partnerId || undefined,
      integrationSlug: incident.integrationSlug || undefined,
      windowStart: incident.createdAt,
      windowEnd: incident.resolvedAt || new Date(),
    });

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        impactProposalsCount: impact.proposalsAffectedCount,
        impactProposalsVolume: new Prisma.Decimal(impact.proposalsPotentialVolume),
        impactSimulationsCount: impact.simulationsAffectedCount,
        impactPartnersCount: impact.partnersImpactedCount,
        impactSummary: impact.summaryText,
      },
    });

    CentralEventBus.getInstance().emit('COMMAND_IMPACT_UPDATED', {
      tenantId,
      incidentId,
      incidentNumber: incident.incidentNumber,
      impactProposalsCount: impact.proposalsAffectedCount,
      impactProposalsVolume: impact.proposalsPotentialVolume,
    });

    return updated;
  }

  /**
   * Add a custom timeline comment / action
   */
  static async addTimelineComment(
    prisma: PrismaClient,
    tenantId: string,
    incidentId: string,
    title: string,
    description?: string,
    userContext?: { userId: string; userName: string; userEmail: string; role: string; reqIp?: string }
  ) {
    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId },
    });
    if (!incident) throw new Error('Incidente não encontrado.');

    const event = await prisma.incidentTimelineEvent.create({
      data: {
        tenantId,
        incidentId,
        type: 'COMMENT',
        title,
        description,
        userId: userContext?.userId || null,
        userName: userContext?.userName || 'Usuário',
      },
    });

    if (userContext) {
      await AuditLogService.record(prisma, {
        tenantId,
        userId: userContext.userId,
        action: 'COMMAND_INCIDENT_COMMENT',
        entity: 'Incident',
        entityId: incidentId,
        newData: { title, description },
        ipAddress: userContext.reqIp,
      });
    }

    return event;
  }

  /**
   * Sync Integration Hub health status changes with Incident Command Center
   */
  static async syncIntegrationStatus(
    prisma: PrismaClient,
    tenantId: string,
    bank: string,
    status: 'OFFLINE' | 'DEGRADED' | 'ONLINE',
    errorMessage?: string
  ) {
    const slug = bank.toLowerCase();
    const dedupKey = `INTEGRATION_HEALTH_${slug}`;

    if (status === 'OFFLINE' || status === 'DEGRADED') {
      const severity = status === 'OFFLINE' ? IncidentSeverity.CRITICAL : IncidentSeverity.HIGH;
      const title = `Integração ${bank}: Indisponibilidade/Degradação de Serviço`;
      const description = `O Hub de Integrações detectou status ${status} na integração ${bank}. Erro: ${errorMessage || 'Falha contínua nos health checks.'}`;

      const incident = await this.createIncident(prisma, tenantId, {
        title,
        description,
        type: IncidentType.INTEGRATION,
        severity,
        source: IncidentSource.INTEGRATION,
        integrationSlug: slug,
        dedupKey,
      });

      // Link IncidentIntegration
      await prisma.incidentIntegration.upsert({
        where: {
          incidentId_slug: {
            incidentId: incident.id,
            slug,
          },
        },
        create: {
          tenantId,
          incidentId: incident.id,
          slug,
          bankName: bank,
          status,
        },
        update: {
          status,
        },
      });

      return incident;
    } else if (status === 'ONLINE') {
      // Find open incident for this integration
      const incident = await prisma.incident.findFirst({
        where: {
          tenantId,
          dedupKey,
          status: { notIn: [IncidentStatus.RESOLVED, IncidentStatus.CLOSED] },
        },
      });

      if (incident) {
        // Record timeline event
        await prisma.incidentTimelineEvent.create({
          data: {
            tenantId,
            incidentId: incident.id,
            type: 'INTEGRATION_RECOVERY',
            title: `Integração ${bank} Recuperada`,
            description: `A integração ${bank} voltou ao status OPERACIONAL / ONLINE. Incidente movido para monitoramento.`,
            newValue: 'MONITORING',
            userName: 'Hub de Integrações',
          },
        });

        // Transition status to MONITORING if currently INVESTIGATING or MITIGATING
        if (incident.status === IncidentStatus.OPEN || incident.status === IncidentStatus.ACKNOWLEDGED || incident.status === IncidentStatus.INVESTIGATING || incident.status === IncidentStatus.MITIGATING) {
          await this.updateStatus(prisma, tenantId, incident.id, IncidentStatus.MONITORING, 'Serviço recuperado automaticamente pelo Hub. Incidente em observação.');
        }
      }
    }
  }

  /**
   * Filter and list Incidents
   */
  static async getIncidents(prisma: PrismaClient, tenantId: string, options: IncidentFilterOptions = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (options.severity) {
      if (Array.isArray(options.severity)) where.severity = { in: options.severity };
      else where.severity = options.severity;
    }

    if (options.status) {
      if (Array.isArray(options.status)) where.status = { in: options.status };
      else where.status = options.status;
    }

    if (options.type) {
      if (Array.isArray(options.type)) where.type = { in: options.type };
      else where.type = options.type;
    }

    if (options.source) {
      if (Array.isArray(options.source)) where.source = { in: options.source };
      else where.source = options.source;
    }

    if (options.assignedToId) where.assignedToId = options.assignedToId;
    if (options.bankId) where.bankId = options.bankId;
    if (options.partnerId) where.partnerId = options.partnerId;
    if (options.integrationSlug) where.integrationSlug = options.integrationSlug;

    if (options.search) {
      where.OR = [
        { incidentNumber: { contains: options.search, mode: 'insensitive' } },
        { title: { contains: options.search, mode: 'insensitive' } },
        { description: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = new Date(options.startDate);
      if (options.endDate) where.createdAt.lte = new Date(options.endDate);
    }

    const orderBy: any[] = [];
    if (options.sortBy === 'severity') {
      // Prisma default sort for enum
      orderBy.push({ severity: options.sortOrder || 'desc' });
      orderBy.push({ createdAt: 'desc' });
    } else if (options.sortBy === 'impactProposalsVolume') {
      orderBy.push({ impactProposalsVolume: options.sortOrder || 'desc' });
    } else if (options.sortBy === 'slaDeadline') {
      orderBy.push({ slaDeadline: options.sortOrder || 'asc' });
    } else {
      orderBy.push({ createdAt: options.sortOrder || 'desc' });
    }

    const [total, items] = await Promise.all([
      prisma.incident.count({ where }),
      prisma.incident.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          bank: { select: { id: true, name: true, code: true } },
          partner: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true } },
          convenio: { select: { id: true, name: true } },
          _count: {
            select: {
              incidentInsights: true,
              incidentPendencies: true,
              incidentProposals: true,
              incidentPartners: true,
              timelineEvents: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get single incident with full 360° relations
   */
  static async getIncidentById(prisma: PrismaClient, tenantId: string, incidentId: string) {
    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, avatarUrl: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        acknowledgedBy: { select: { id: true, name: true, email: true } },
        resolvedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        bank: { select: { id: true, name: true, code: true } },
        partner: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true } },
        convenio: { select: { id: true, name: true } },
        timelineEvents: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        incidentInsights: {
          include: {
            insight: true,
          },
        },
        incidentPendencies: {
          include: {
            pendency: {
              include: {
                assignedTo: { select: { id: true, name: true } },
              },
            },
          },
        },
        incidentProposals: {
          include: {
            proposal: {
              select: {
                id: true,
                proposalNumber: true,
                contractValue: true,
                releasedValue: true,
                status: { select: { name: true } },
                createdAt: true,
              },
            },
          },
          take: 50,
        },
        incidentPartners: {
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        incidentIntegrations: true,
      },
    });

    if (!incident) return null;

    // Calculate live SLA metrics
    const slaMetrics = IncidentSlaService.calculateSlaStatus(
      incident.createdAt,
      incident.resolvedAt,
      incident.slaMinutesTarget,
      incident.slaAcknowledgeTarget,
      incident.acknowledgedAt
    );

    return {
      ...incident,
      slaMetrics,
    };
  }
}
