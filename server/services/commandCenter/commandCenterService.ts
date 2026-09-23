import { PrismaClient, IncidentStatus, IncidentSeverity } from '@prisma/client';
import {
  CommandCenterOverview,
  OperationalOverviewKPIs,
  OperationalAttentionItem,
  OperationalTimelineItem,
} from './commandCenterTypes';

export class CommandCenterService {
  /**
   * Get Central Command Center Overview KPIs, Executive Summary, Attention Items, and Recent Events
   */
  static async getOverview(prisma: PrismaClient, tenantId: string): Promise<CommandCenterOverview> {
    const activeStatuses = [
      IncidentStatus.OPEN,
      IncidentStatus.ACKNOWLEDGED,
      IncidentStatus.INVESTIGATING,
      IncidentStatus.MITIGATING,
      IncidentStatus.MONITORING,
    ];

    const [
      openIncidentsCount,
      criticalIncidentsCount,
      investigatingIncidentsCount,
      activeIncidents,
      activeInsightsCount,
      relatedPendenciesCount,
      lastInsight,
    ] = await Promise.all([
      prisma.incident.count({
        where: { tenantId, status: { in: activeStatuses } },
      }),
      prisma.incident.count({
        where: { tenantId, status: { in: activeStatuses }, severity: IncidentSeverity.CRITICAL },
      }),
      prisma.incident.count({
        where: { tenantId, status: IncidentStatus.INVESTIGATING },
      }),
      prisma.incident.findMany({
        where: { tenantId, status: { in: activeStatuses } },
        select: {
          id: true,
          incidentNumber: true,
          title: true,
          severity: true,
          impactProposalsCount: true,
          impactProposalsVolume: true,
          integrationSlug: true,
          slaMinutesTarget: true,
          createdAt: true,
          resolvedAt: true,
        },
      }),
      prisma.intelligenceInsight.count({
        where: { tenantId, status: { in: ['NEW', 'ACKNOWLEDGED', 'INVESTIGATING'] } },
      }),
      prisma.incidentPendency.count({
        where: { tenantId, incident: { status: { in: activeStatuses } } },
      }),
      prisma.intelligenceInsight.findFirst({
        where: { tenantId },
        orderBy: { detectedAt: 'desc' },
        select: { detectedAt: true },
      }),
    ]);

    // Calculate aggregated proposal impact volume and count
    let potentiallyImpactedProposalsCount = 0;
    let potentiallyImpactedProposalsVolume = 0;
    const affectedIntegrationsSet = new Set<string>();
    let slaAtRiskCount = 0;
    const now = new Date();

    for (const inc of activeIncidents) {
      potentiallyImpactedProposalsCount += inc.impactProposalsCount || 0;
      potentiallyImpactedProposalsVolume += Number(inc.impactProposalsVolume || 0);
      if (inc.integrationSlug) affectedIntegrationsSet.add(inc.integrationSlug);

      const elapsedMs = now.getTime() - inc.createdAt.getTime();
      const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
      const targetMinutes = inc.slaMinutesTarget || 240;
      if (targetMinutes > 0 && elapsedMinutes / targetMinutes >= 0.8) {
        slaAtRiskCount++;
      }
    }

    const kpis: OperationalOverviewKPIs = {
      openIncidentsCount,
      criticalIncidentsCount,
      investigatingIncidentsCount,
      relatedPendenciesCount,
      activeInsightsCount,
      affectedIntegrationsCount: affectedIntegrationsSet.size,
      potentiallyImpactedProposalsCount,
      potentiallyImpactedProposalsVolume,
      slaAtRiskCount,
    };

    // Build Attention Items
    const attentionItems: OperationalAttentionItem[] = [];

    // Critical incidents
    const criticalIncidents = activeIncidents.filter((i) => i.severity === IncidentSeverity.CRITICAL);
    for (const inc of criticalIncidents) {
      attentionItems.push({
        id: `att_inc_${inc.id}`,
        type: 'INCIDENT',
        severity: IncidentSeverity.CRITICAL,
        title: `${inc.incidentNumber}: ${inc.title}`,
        summary: `Incidente Crítico com ${inc.impactProposalsCount} propostas afetadas.`,
        entityLink: `/command-center?incidentId=${inc.id}`,
        createdAt: inc.createdAt,
      });
    }

    // SLA risks
    if (slaAtRiskCount > 0) {
      attentionItems.push({
        id: 'att_sla_risk',
        type: 'SLA_BREACH',
        severity: IncidentSeverity.HIGH,
        title: `${slaAtRiskCount} Incidente(s) com SLA em Risco / Estourado`,
        summary: 'Existem incidentes próximos do limite de atendimento ou com SLA ultrapassado.',
        entityLink: '/command-center?filter=sla',
        createdAt: now,
      });
    }

    // Executive Summary text
    const formattedVolume = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      potentiallyImpactedProposalsVolume
    );

    const executiveSummary = {
      activeIncidentsText: `${openIncidentsCount} incidentes ativos (${criticalIncidentsCount} críticos, ${investigatingIncidentsCount} em investigação).`,
      criticalStatusText: criticalIncidentsCount > 0 ? `${criticalIncidentsCount} incidentes críticos requerem intervenção imediata.` : 'Nenhum incidente crítico ativo no momento.',
      integrationsStatusText: affectedIntegrationsSet.size > 0 ? `${affectedIntegrationsSet.size} integração(ões) com impacto reportado (${Array.from(affectedIntegrationsSet).join(', ').toUpperCase()}).` : 'Todas as integrações operando dentro da normalidade.',
      slaRiskText: `${slaAtRiskCount} incidente(s) com SLA em risco/estourado. ${potentiallyImpactedProposalsCount} propostas (${formattedVolume}) potencialmente impactadas.`,
    };

    // Recent Timeline Events
    const recentEvents = await prisma.incidentTimelineEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        incident: {
          select: { id: true, incidentNumber: true, title: true, severity: true },
        },
      },
    });

    return {
      kpis,
      executiveSummary,
      attentionItems,
      recentTimelineEvents: recentEvents,
      realtimeConnected: true,
      lastIntelligenceRun: lastInsight?.detectedAt || undefined,
    };
  }

  /**
   * Get Unified Operational Timeline combining events from Incidents, Intelligence, Integrations, and Pendencies
   */
  static async getOperationalTimeline(
    prisma: PrismaClient,
    tenantId: string,
    limit: number = 50
  ): Promise<OperationalTimelineItem[]> {
    const items: OperationalTimelineItem[] = [];

    const [incidentEvents, insights, healthLogs] = await Promise.all([
      prisma.incidentTimelineEvent.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          incident: { select: { id: true, incidentNumber: true } },
        },
      }),
      prisma.intelligenceInsight.findMany({
        where: { tenantId },
        orderBy: { detectedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          title: true,
          summary: true,
          severity: true,
          type: true,
          detectedAt: true,
        },
      }),
      prisma.integrationHealthLog.findMany({
        where: { tenantId, success: false },
        orderBy: { timestamp: 'desc' },
        take: 30,
        select: {
          id: true,
          bank: true,
          endpoint: true,
          errorMessage: true,
          timestamp: true,
        },
      }),
    ]);

    for (const ev of incidentEvents) {
      items.push({
        id: `ev_${ev.id}`,
        source: 'INCIDENT',
        type: ev.type,
        title: ev.title,
        description: ev.description,
        timestamp: ev.createdAt,
        actorName: ev.userName,
        incidentId: ev.incidentId,
        incidentNumber: ev.incident?.incidentNumber,
        metadata: ev.metadata,
      });
    }

    for (const ins of insights) {
      items.push({
        id: `ins_${ins.id}`,
        source: 'INTELLIGENCE',
        type: ins.type,
        title: `Intelligence: ${ins.title}`,
        description: ins.summary,
        severity: ins.severity,
        timestamp: ins.detectedAt,
      });
    }

    for (const log of healthLogs) {
      items.push({
        id: `log_${log.id}`,
        source: 'INTEGRATION',
        type: 'HEALTH_ERROR',
        title: `Falha na Integração ${log.bank}`,
        description: `Erro na rota ${log.endpoint}: ${log.errorMessage || 'Timeout/HTTP Error'}`,
        severity: 'HIGH',
        timestamp: log.timestamp,
      });
    }

    // Sort all combined items by timestamp descending
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return items.slice(0, limit);
  }

  /**
   * Unified Operational Search across Incidents, Insights, Proposals, Partners, Banks, Products, Convenios, Pendencies
   */
  static async globalSearch(prisma: PrismaClient, tenantId: string, query: string) {
    if (!query || query.trim().length < 2) return [];

    const q = query.trim();

    const [incidents, insights, proposals, partners, banks, pendencies] = await Promise.all([
      prisma.incident.findMany({
        where: {
          tenantId,
          OR: [
            { incidentNumber: { contains: q, mode: 'insensitive' } },
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, incidentNumber: true, title: true, severity: true, status: true },
      }),
      prisma.intelligenceInsight.findMany({
        where: {
          tenantId,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { summary: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, title: true, severity: true, type: true },
      }),
      prisma.proposal.findMany({
        where: {
          tenantId,
          proposalNumber: { contains: q, mode: 'insensitive' },
        },
        take: 5,
        select: { id: true, proposalNumber: true, contractValue: true, status: { select: { name: true } } },
      }),
      prisma.partner.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, name: true, code: true },
      }),
      prisma.bank.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, name: true, code: true },
      }),
      prisma.pendency.findMany({
        where: {
          tenantId,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, title: true, status: true, priority: true },
      }),
    ]);

    const results: any[] = [];

    for (const inc of incidents) {
      results.push({
        type: 'INCIDENT',
        id: inc.id,
        label: `${inc.incidentNumber}: ${inc.title}`,
        sublabel: `Severidade: ${inc.severity} | Status: ${inc.status}`,
        link: `/command-center?incidentId=${inc.id}`,
      });
    }

    for (const ins of insights) {
      results.push({
        type: 'INSIGHT',
        id: ins.id,
        label: `Intelligence: ${ins.title}`,
        sublabel: `Tipo: ${ins.type} | Severidade: ${ins.severity}`,
        link: `/intelligence?insightId=${ins.id}`,
      });
    }

    for (const p of proposals) {
      results.push({
        type: 'PROPOSAL',
        id: p.id,
        label: `Proposta #${p.proposalNumber}`,
        sublabel: `Status: ${p.status?.name || 'EM_ANDAMENTO'}`,
        link: `/proposals/${p.id}`,
      });
    }

    for (const part of partners) {
      results.push({
        type: 'PARTNER',
        id: part.id,
        label: `Parceiro: ${part.name} (${part.code})`,
        sublabel: 'CRM de Parceiros',
        link: `/partners/${part.id}`,
      });
    }

    for (const b of banks) {
      results.push({
        type: 'BANK',
        id: b.id,
        label: `Banco: ${b.name} (${b.code})`,
        sublabel: 'Hub de Integrações',
        link: `/integrations?bank=${b.code}`,
      });
    }

    for (const pend of pendencies) {
      results.push({
        type: 'PENDENCY',
        id: pend.id,
        label: `Pendência: ${pend.title}`,
        sublabel: `Prioridade: ${pend.priority} | Status: ${pend.status}`,
        link: `/pendencies?id=${pend.id}`,
      });
    }

    return results;
  }
}
