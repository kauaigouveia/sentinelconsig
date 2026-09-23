import { PrismaClient } from '@prisma/client';
import { BIService } from '../biService.js';
import { BIComparisonService } from '../biComparisonService.js';
import {
  IntelligenceEvidence,
  IntelligenceInsightDTO,
  IntelligenceInsightType,
  IntelligenceSeverity,
  IntelligenceSuggestedAction,
} from './intelligenceTypes.js';
import { INTELLIGENCE_RULES_CATALOG, IntelligenceRuleDefinition } from './intelligenceRules.js';
import { DeterministicExplanationProvider } from './explanationService.js';
import { CorrelationEngine } from './correlationService.js';

export interface GeneratedInsightCandidate {
  ruleId: string;
  type: IntelligenceInsightType;
  category: string;
  severity: IntelligenceSeverity;
  title: string;
  summary: string;
  explanation: string;
  confidence: number;
  periodStart: Date;
  periodEnd: Date;
  comparisonStart?: Date | null;
  comparisonEnd?: Date | null;
  entityType?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  metadata?: Record<string, any>;
  evidence: IntelligenceEvidence[];
  suggestedActions: IntelligenceSuggestedAction[];
  dedupKey: string;
}

export class AnomalyDetectionService {
  private explanationProvider = new DeterministicExplanationProvider();

  /**
   * Generates deterministic hash dedup key.
   */
  public static computeDedupKey(
    tenantId: string,
    ruleId: string,
    entityType: string = 'GLOBAL',
    entityId: string = 'ALL',
    periodStart: Date,
    periodEnd: Date
  ): string {
    const startStr = periodStart.toISOString().slice(0, 10);
    const endStr = periodEnd.toISOString().slice(0, 10);
    return `${tenantId}_${ruleId}_${entityType}_${entityId}_${startStr}_${endStr}`;
  }

  /**
   * Main scan method executing all rule detectors.
   */
  public async detectAnomalies(
    prisma: PrismaClient,
    tenantId: string,
    filters: { period?: any; startDate?: string; endDate?: string } = {}
  ): Promise<GeneratedInsightCandidate[]> {
    const candidates: GeneratedInsightCandidate[] = [];

    // Resolve date ranges
    const currentRange = BIService.resolveDateRange(filters);
    const previousRange = BIComparisonService.resolvePreviousDateRange(currentRange);

    // Fetch analytical aggregates reusing BIService & BIComparisonService
    const [
      overview,
      comparison,
      banksCurrent,
      banksPrevious,
      productsCurrent,
      productsPrevious,
      partnersCurrent,
      partnersPrevious,
      pendencies,
      bottlenecks,
      cancellations,
      refusals,
      integrations,
    ] = await Promise.all([
      BIService.getOverview(prisma, tenantId, filters),
      BIComparisonService.getComparison(prisma, tenantId, filters),
      BIService.getBanks(prisma, tenantId, filters),
      BIService.getBanks(prisma, tenantId, {
        ...filters,
        period: 'PERSONALIZADO',
        startDate: previousRange.startDate.toISOString(),
        endDate: previousRange.endDate.toISOString(),
      }),
      BIService.getProducts(prisma, tenantId, filters),
      BIService.getProducts(prisma, tenantId, {
        ...filters,
        period: 'PERSONALIZADO',
        startDate: previousRange.startDate.toISOString(),
        endDate: previousRange.endDate.toISOString(),
      }),
      BIService.getPartners(prisma, tenantId, filters),
      BIService.getPartners(prisma, tenantId, {
        ...filters,
        period: 'PERSONALIZADO',
        startDate: previousRange.startDate.toISOString(),
        endDate: previousRange.endDate.toISOString(),
      }),
      BIService.getPendencies(prisma, tenantId, filters),
      BIService.getBottlenecks(prisma, tenantId, filters),
      BIService.getCancellations(prisma, tenantId, filters),
      BIService.getRefusals(prisma, tenantId, filters),
      BIService.getIntegrations(prisma, tenantId, filters),
    ]);

    // 1. ANOMALIA: PRODUÇÃO (PRODUCTION_DROP / PRODUCTION_SPIKE)
    const paidDelta = comparison.metrics.paidProduction;
    const grossDelta = comparison.metrics.grossProduction;

    if (paidDelta.previous > 0 && paidDelta.deltaPercent <= -15.0) {
      const dropAbs = Math.abs(paidDelta.deltaAbsolute);
      const dropPct = Math.abs(paidDelta.deltaPercent);

      // Identify top dropping banks
      const droppingBanks = banksCurrent.banks
        .map(b => {
          const prev = banksPrevious.banks.find(pb => pb.bankId === b.bankId);
          const prevPaid = prev ? prev.paidValue : 0;
          const delta = prevPaid > 0 ? ((b.paidValue - prevPaid) / prevPaid) * 100 : 0;
          return { name: b.bankName, id: b.bankId, delta, diff: b.paidValue - prevPaid };
        })
        .filter(b => b.delta < -10)
        .sort((a, b) => a.diff - b.diff);

      const dimensionsAffected = droppingBanks.slice(0, 3).map(b => ({
        dimension: 'banco' as const,
        name: b.name,
        variation: b.delta,
        detail: `Redução de R$ ${Math.abs(b.diff).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      }));

      const evidence: IntelligenceEvidence[] = [
        {
          metric: 'producao_paga_atual',
          label: 'Produção Paga no Período',
          currentValue: `R$ ${paidDelta.current.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          previousValue: `R$ ${paidDelta.previous.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          variation: paidDelta.deltaPercent,
          unit: 'currency',
          source: 'BIService (Métricas Oficiais)',
          period: `${currentRange.startDate.toISOString().slice(0, 10)} até ${currentRange.endDate.toISOString().slice(0, 10)}`,
        },
        {
          metric: 'volume_propostas_pagas',
          label: 'Contratos Pagos',
          currentValue: overview.paidProduction.count,
          previousValue: comparison.metrics.paidCount.previous,
          variation: comparison.metrics.paidCount.deltaPercent,
          unit: 'count',
          source: 'BIService',
        },
      ];

      const explanation = await this.explanationProvider.generateExplanation({
        title: 'Queda de Produção Paga',
        metricName: 'Produção Líquida Paga',
        category: 'PRODUCTION',
        currentValue: `R$ ${paidDelta.current.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        previousValue: `R$ ${paidDelta.previous.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        variation: paidDelta.deltaPercent,
        periodLabel: currentRange.label,
        comparisonLabel: previousRange.label,
        evidence,
        dimensionsAffected,
      });

      candidates.push({
        ruleId: 'PRODUCTION_DROP',
        type: 'PRODUCTION',
        category: 'PRODUÇÃO',
        severity: dropPct >= 30.0 ? 'CRITICAL' : 'HIGH',
        title: `Queda de Produção Paga (-${dropPct.toFixed(1)}%)`,
        summary: `A produção líquida paga recuou ${dropPct.toFixed(1)}% (impacto de R$ ${dropAbs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) em relação a ${previousRange.label}.`,
        explanation,
        confidence: 0.95,
        periodStart: currentRange.startDate,
        periodEnd: currentRange.endDate,
        comparisonStart: previousRange.startDate,
        comparisonEnd: previousRange.endDate,
        metadata: { paidDelta, grossDelta, topDroppingBanks: droppingBanks.slice(0, 3) },
        evidence,
        suggestedActions: [
          {
            id: 'act_bi_prod',
            type: 'OPEN_BI',
            label: 'Investigar Curva de Produção no BI',
            targetUrl: '/bi?tab=production',
          },
          {
            id: 'act_bi_banks',
            type: 'OPEN_BI',
            label: 'Ver Desempenho por Banco',
            targetUrl: '/bi?tab=banks',
          },
        ],
        dedupKey: AnomalyDetectionService.computeDedupKey(
          tenantId,
          'PRODUCTION_DROP',
          'GLOBAL',
          'ALL',
          currentRange.startDate,
          currentRange.endDate
        ),
      });
    }

    // 2. ANOMALIA: CONVERSÃO (CONVERSION_DROP)
    const convDelta = comparison.metrics.conversionRate;
    if (convDelta.previous > 0 && convDelta.deltaPercent <= -20.0) {
      const evidence: IntelligenceEvidence[] = [
        {
          metric: 'taxa_conversao',
          label: 'Taxa de Conversão Efetiva',
          currentValue: `${convDelta.current.toFixed(1)}%`,
          previousValue: `${convDelta.previous.toFixed(1)}%`,
          variation: convDelta.deltaPercent,
          unit: 'percent',
          source: 'BIService (Métricas de Conversão)',
        },
      ];

      const explanation = await this.explanationProvider.generateExplanation({
        title: 'Queda de Eficiência de Conversão',
        metricName: 'Taxa de Conversão Global',
        category: 'CONVERSION',
        currentValue: `${convDelta.current.toFixed(1)}%`,
        previousValue: `${convDelta.previous.toFixed(1)}%`,
        variation: convDelta.deltaPercent,
        periodLabel: currentRange.label,
        comparisonLabel: previousRange.label,
        evidence,
      });

      candidates.push({
        ruleId: 'CONVERSION_DROP',
        type: 'CONVERSION',
        category: 'CONVERSÃO',
        severity: 'HIGH',
        title: `Queda na Taxa de Conversão (${convDelta.current.toFixed(1)}%)`,
        summary: `A taxa de conversão recuou de ${convDelta.previous.toFixed(1)}% para ${convDelta.current.toFixed(1)}% (${convDelta.deltaPercent.toFixed(1)}% de variação relativa).`,
        explanation,
        confidence: 0.90,
        periodStart: currentRange.startDate,
        periodEnd: currentRange.endDate,
        comparisonStart: previousRange.startDate,
        comparisonEnd: previousRange.endDate,
        evidence,
        suggestedActions: [
          {
            id: 'act_bi_conv',
            type: 'OPEN_BI',
            label: 'Visualizar Funil de Conversão',
            targetUrl: '/bi?tab=conversion',
          },
        ],
        dedupKey: AnomalyDetectionService.computeDedupKey(
          tenantId,
          'CONVERSION_DROP',
          'GLOBAL',
          'ALL',
          currentRange.startDate,
          currentRange.endDate
        ),
      });
    }

    // 3. ANOMALIA: SLA / PENDÊNCIAS (SLA_BREACH_SPIKE / SLA_BACKLOG)
    if (pendencies.summary.overSlaCount > 0) {
      const count = pendencies.summary.overSlaCount;
      const evidence: IntelligenceEvidence[] = [
        {
          metric: 'pendencias_vencidas',
          label: 'Pendências com SLA Vencido',
          currentValue: count,
          unit: 'count',
          source: 'Central de Pendências & SLA',
        },
        {
          metric: 'total_pendencias_abertas',
          label: 'Total de Pendências em Aberto',
          currentValue: pendencies.summary.openCount,
          unit: 'count',
          source: 'Central de Pendências & SLA',
        },
      ];

      const explanation = await this.explanationProvider.generateExplanation({
        title: 'Estouro de SLA em Pendências',
        metricName: 'Pendências Estouradas',
        category: 'SLA',
        currentValue: count,
        periodLabel: currentRange.label,
        evidence,
      });

      candidates.push({
        ruleId: 'SLA_BREACH_SPIKE',
        type: 'SLA',
        category: 'SLA & OPERAÇÃO',
        severity: count >= 3 ? 'CRITICAL' : 'HIGH',
        title: `${count} Pendência(s) com SLA Estourado`,
        summary: `Existem ${count} pendência(s) na esteira operacional que ultrapassaram o tempo regulatório de resolução.`,
        explanation,
        confidence: 0.98,
        periodStart: currentRange.startDate,
        periodEnd: currentRange.endDate,
        evidence,
        suggestedActions: [
          {
            id: 'act_open_pend_overdue',
            type: 'OPEN_PENDENCIES',
            label: 'Tratar Pendências Vencidas',
            targetUrl: '/pendencies?status=ABERTA',
          },
        ],
        dedupKey: AnomalyDetectionService.computeDedupKey(
          tenantId,
          'SLA_BREACH_SPIKE',
          'PENDENCY',
          'OVERDUE',
          currentRange.startDate,
          currentRange.endDate
        ),
      });
    }

    // 4. ANOMALIA: INTEGRAÇÕES BANCÁRIAS (INTEGRATION_ERROR_SPIKE / INTEGRATION_OFFLINE)
    for (const prov of (integrations.providers || [])) {
      const errorRate = prov.totalRequests > 0 ? 100 - prov.successRatePercent : 0;
      if (errorRate >= 10.0 || prov.status === 'OFFLINE' || prov.incidentCount > 0) {
        const severity: IntelligenceSeverity =
          prov.status === 'OFFLINE' || errorRate >= 25.0 ? 'CRITICAL' : 'HIGH';

        const evidence: IntelligenceEvidence[] = [
          {
            metric: 'taxa_erros_api',
            label: `Taxa de Erro (${prov.name})`,
            currentValue: `${errorRate.toFixed(1)}%`,
            unit: 'percent',
            source: 'Hub de Integrações Bancárias',
            entityType: 'INTEGRATION',
            entityName: prov.name,
          },
          {
            metric: 'latencia_media',
            label: 'Latência Média',
            currentValue: `${prov.avgLatencyMs}ms`,
            unit: 'ms',
            source: 'Hub de Integrações Bancárias',
          },
        ];

        candidates.push({
          ruleId: prov.status === 'OFFLINE' ? 'INTEGRATION_OFFLINE' : 'INTEGRATION_ERROR_SPIKE',
          type: 'INTEGRATION',
          category: 'INTEGRAÇÕES',
          severity,
          title: `Instabilidade na Integração ${prov.name}`,
          summary: `A integração com ${prov.name} apresentou taxa de falhas de ${errorRate.toFixed(1)}% e latência de ${prov.avgLatencyMs}ms.`,
          explanation: `A telemetria do Hub de Integrações registrou ${prov.totalRequests} requisições para ${prov.name}, com ${prov.incidentCount} incidentes ativos.`,
          confidence: 0.99,
          periodStart: currentRange.startDate,
          periodEnd: currentRange.endDate,
          entityType: 'INTEGRATION',
          entityId: prov.provider,
          entityName: prov.name,
          metadata: prov,
          evidence,
          suggestedActions: [
            {
              id: `act_integ_view_${prov.provider}`,
              type: 'OPEN_INTEGRATION',
              label: `Ver Diagnóstico (${prov.name})`,
              targetUrl: `/admin-c6-bank?bank=${prov.provider}`,
            },
            {
              id: `act_create_pend_integ_${prov.provider}`,
              type: 'CREATE_PENDENCY',
              label: 'Abrir Chamado/Pendência de TI',
              params: {
                category: 'INTEGRACAO',
                title: `Investigar Instabilidade API ${prov.name}`,
                priority: 'HIGH',
              },
            },
          ],
          dedupKey: AnomalyDetectionService.computeDedupKey(
            tenantId,
            'INTEGRATION_ERROR_SPIKE',
            'INTEGRATION',
            prov.provider,
            currentRange.startDate,
            currentRange.endDate
          ),
        });
      }
    }

    // 5. ANOMALIA: PARCEIROS (PARTNER_PRODUCTION_DROP)
    for (const partner of partnersCurrent.partners) {
      const prev = partnersPrevious.partners.find(p => p.partnerId === partner.partnerId);
      if (prev && prev.paidValue >= 5000) {
        const delta = ((partner.paidValue - prev.paidValue) / prev.paidValue) * 100;
        if (delta <= -40.0) {
          const dropAbs = prev.paidValue - partner.paidValue;
          candidates.push({
            ruleId: 'PARTNER_PRODUCTION_DROP',
            type: 'PARTNER',
            category: 'PARCEIROS',
            severity: 'HIGH',
            title: `Queda Acentuada: ${partner.partnerName} (${delta.toFixed(1)}%)`,
            summary: `O parceiro ${partner.partnerName} reduziu sua produção paga de R$ ${prev.paidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para R$ ${partner.paidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (-${Math.abs(delta).toFixed(1)}%).`,
            explanation: `Análise comparativa do CRM e BI indica desaceleração comercial do parceiro ${partner.partnerName}, gerando contração de R$ ${dropAbs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} na produção líquida.`,
            confidence: 0.90,
            periodStart: currentRange.startDate,
            periodEnd: currentRange.endDate,
            comparisonStart: previousRange.startDate,
            comparisonEnd: previousRange.endDate,
            entityType: 'PARTNER',
            entityId: partner.partnerId,
            entityName: partner.partnerName,
            evidence: [
              {
                metric: 'producao_paga_parceiro',
                label: `Produção Paga (${partner.partnerName})`,
                currentValue: `R$ ${partner.paidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                previousValue: `R$ ${prev.paidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                variation: delta,
                unit: 'currency',
                source: 'CRM de Parceiros & BI',
                entityType: 'PARTNER',
                entityId: partner.partnerId,
                entityName: partner.partnerName,
              },
            ],
            suggestedActions: [
              {
                id: `act_partner_crm_${partner.partnerId}`,
                type: 'OPEN_PARTNER',
                label: 'Acompanhar no CRM de Parceiros',
                targetUrl: `/partners?id=${partner.partnerId}`,
              },
              {
                id: `act_partner_add_task_${partner.partnerId}`,
                type: 'ADD_PARTNER_NOTE',
                label: 'Registrar Contato / Tarefa',
                targetUrl: `/partners?id=${partner.partnerId}&tab=interactions`,
              },
            ],
            dedupKey: AnomalyDetectionService.computeDedupKey(
              tenantId,
              'PARTNER_PRODUCTION_DROP',
              'PARTNER',
              partner.partnerId,
              currentRange.startDate,
              currentRange.endDate
            ),
          });
        }
      }
    }

    // 6. CORRELATION ENGINE SCAN
    const integrationSummaryForCorr = (integrations.providers || []).map(b => ({
      bank: b.name,
      errorRate: b.totalRequests > 0 ? 100 - b.successRatePercent : 0,
      latency: b.avgLatencyMs,
      incidentCount: b.incidentCount,
    }));

    const bankDeltasForCorr = banksCurrent.banks.map(b => {
      const prev = banksPrevious.banks.find(pb => pb.bankId === b.bankId);
      const prevPaid = prev ? prev.paidValue : 0;
      const prodDelta = prevPaid > 0 ? ((b.paidValue - prevPaid) / prevPaid) * 100 : 0;
      const prevConv = prev ? prev.conversionRatePercent : 0;
      const convDelta = prevConv > 0 ? ((b.conversionRatePercent - prevConv) / prevConv) * 100 : 0;
      return {
        bankId: b.bankId,
        bankName: b.bankName,
        conversionDelta: convDelta,
        productionDelta: prodDelta,
        currentPaid: b.paidValue,
        previousPaid: prevPaid,
      };
    });

    const bottleneckStages = bottlenecks.statusDistribution.map(s => ({
      statusName: s.statusName,
      count: s.count,
      value: s.value,
      isFinal: s.isFinal,
    }));

    const correlations = CorrelationEngine.findCorrelations(
      tenantId,
      currentRange.startDate,
      currentRange.endDate,
      integrationSummaryForCorr,
      bankDeltasForCorr,
      {
        openCount: pendencies.summary.openCount,
        overdueCount: pendencies.summary.overSlaCount,
        criticalCount: 0,
      },
      bottleneckStages
    );

    for (const corr of correlations) {
      candidates.push({
        ruleId: 'CROSS_DOMAIN_CORRELATION',
        type: 'CORRELATION',
        category: 'CORRELAÇÃO',
        severity: 'HIGH',
        title: `Correlação Identificada: ${corr.primaryEntity} e ${corr.secondaryEntity}`,
        summary: corr.relationship,
        explanation: `Evidências cruzadas indicam concomitância temporal entre eventos no período de ${currentRange.label}. A equipe operacional deve averiguar a relação causal.`,
        confidence: corr.confidence,
        periodStart: corr.periodStart,
        periodEnd: corr.periodEnd,
        evidence: corr.evidence,
        suggestedActions: corr.suggestedActions,
        dedupKey: AnomalyDetectionService.computeDedupKey(
          tenantId,
          'CROSS_DOMAIN_CORRELATION',
          corr.primaryType,
          corr.secondaryType,
          currentRange.startDate,
          currentRange.endDate
        ),
      });
    }

    return candidates;
  }
}
