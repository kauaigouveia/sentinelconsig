import {
  IntelligenceEvidence,
  IntelligenceInsightDTO,
  IntelligenceSuggestedAction,
} from './intelligenceTypes.js';

export interface CorrelationCandidate {
  primaryType: string;
  primaryEntity: string;
  secondaryType: string;
  secondaryEntity: string;
  relationship: string;
  confidence: number;
  evidence: IntelligenceEvidence[];
  suggestedActions: IntelligenceSuggestedAction[];
  periodStart: Date;
  periodEnd: Date;
}

export class CorrelationEngine {
  /**
   * Evaluates potential correlations across domain metrics in the analyzed time window.
   */
  public static findCorrelations(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    integrationData: Array<{ bank: string; errorRate: number; latency: number; incidentCount: number }>,
    bankDeltas: Array<{ bankId: string; bankName: string; conversionDelta: number; productionDelta: number; currentPaid: number; previousPaid: number }>,
    pendencyData: { openCount: number; overdueCount: number; criticalCount: number },
    bottleneckData: Array<{ statusName: string; count: number; value: number; isFinal: boolean }>
  ): CorrelationCandidate[] {
    const correlations: CorrelationCandidate[] = [];

    // Correlation 1: Integration Error Spike -> Bank Conversion/Production Drop
    for (const integ of integrationData) {
      if (integ.errorRate >= 10.0 || integ.incidentCount > 0) {
        // Find corresponding bank in bankDeltas
        const matchingBank = bankDeltas.find(
          b => b.bankName.toLowerCase().includes(integ.bank.toLowerCase()) ||
               integ.bank.toLowerCase().includes(b.bankName.toLowerCase())
        );

        if (matchingBank && (matchingBank.conversionDelta <= -15.0 || matchingBank.productionDelta <= -15.0)) {
          correlations.push({
            primaryType: 'INTEGRATION_ERROR',
            primaryEntity: integ.bank,
            secondaryType: 'BANK_PERFORMANCE_DROP',
            secondaryEntity: matchingBank.bankName,
            relationship: `Aumento de erros na integração ${integ.bank} (${integ.errorRate.toFixed(1)}% de falhas) coincide temporalmente com queda na conversão/produção do ${matchingBank.bankName} (${matchingBank.conversionDelta.toFixed(1)}% de conversão, ${matchingBank.productionDelta.toFixed(1)}% de produção).`,
            confidence: integ.incidentCount > 0 ? 0.88 : 0.75,
            periodStart,
            periodEnd,
            evidence: [
              {
                metric: 'taxa_erros_integracao',
                label: `Taxa de Erros API (${integ.bank})`,
                currentValue: `${integ.errorRate.toFixed(1)}%`,
                unit: 'percent',
                source: 'Hub de Integrações',
                entityType: 'INTEGRATION',
                entityName: integ.bank,
              },
              {
                metric: 'variacao_conversao_banco',
                label: `Variação de Conversão (${matchingBank.bankName})`,
                currentValue: `${matchingBank.conversionDelta.toFixed(1)}%`,
                variation: matchingBank.conversionDelta,
                unit: 'percent',
                source: 'BIService',
                entityType: 'BANK',
                entityId: matchingBank.bankId,
                entityName: matchingBank.bankName,
              },
            ],
            suggestedActions: [
              {
                id: `act_integ_diag_${integ.bank}`,
                type: 'OPEN_INTEGRATION',
                label: `Ver Diagnóstico do Hub (${integ.bank})`,
                targetUrl: `/integrations?bank=${integ.bank}`,
              },
              {
                id: `act_bi_bank_${matchingBank.bankId}`,
                type: 'OPEN_BI',
                label: `Analisar Produção no BI (${matchingBank.bankName})`,
                targetUrl: `/bi?bank=${matchingBank.bankId}`,
              },
            ],
          });
        }
      }
    }

    // Correlation 2: Critical Overdue Pendencies -> Funnel Bottlenecks
    if (pendencyData.overdueCount > 0 && bottleneckData.length > 0) {
      const topBottleneck = bottleneckData.find(b => !b.isFinal);
      if (topBottleneck && topBottleneck.count >= 3) {
        correlations.push({
          primaryType: 'SLA_BREACH',
          primaryEntity: 'Central de Pendências',
          secondaryType: 'ESTEIRA_BOTTLENECK',
          secondaryEntity: topBottleneck.statusName,
          relationship: `Existem ${pendencyData.overdueCount} pendências operacionais estouradas concorrendo com represamento de ${topBottleneck.count} propostas no estágio "${topBottleneck.statusName}".`,
          confidence: 0.82,
          periodStart,
          periodEnd,
          evidence: [
            {
              metric: 'pendencias_estouradas',
              label: 'Pendências com SLA Vencido',
              currentValue: pendencyData.overdueCount,
              unit: 'count',
              source: 'Central de Pendências & SLA',
              entityType: 'PENDENCY',
            },
            {
              metric: 'volume_represado_status',
              label: `Volume Represado em ${topBottleneck.statusName}`,
              currentValue: `R$ ${topBottleneck.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              unit: 'currency',
              source: 'BIService',
              entityType: 'STATUS',
              entityName: topBottleneck.statusName,
            },
          ],
          suggestedActions: [
            {
              id: 'act_open_pend_sla',
              type: 'OPEN_PENDENCIES',
              label: 'Abrir Pendências Estouradas',
              targetUrl: '/pendencies?filter=overdue',
            },
            {
              id: 'act_open_bi_bottlenecks',
              type: 'OPEN_BI',
              label: 'Visualizar Gargalos na Esteira',
              targetUrl: '/bi?tab=bottlenecks',
            },
          ],
        });
      }
    }

    return correlations;
  }
}
