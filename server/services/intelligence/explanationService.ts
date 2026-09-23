import { IntelligenceEvidence } from './intelligenceTypes.js';

export interface ExplanationContext {
  title: string;
  metricName: string;
  category: string;
  currentValue: number | string;
  previousValue?: number | string | null;
  variation?: number | null;
  periodLabel: string;
  comparisonLabel?: string | null;
  evidence: IntelligenceEvidence[];
  correlatedEvents?: string[];
  dimensionsAffected?: Array<{
    dimension: 'banco' | 'produto' | 'convenio' | 'parceiro' | 'operador' | 'status';
    name: string;
    variation: number;
    sharePercent?: number;
    detail?: string;
  }>;
}

export interface IntelligenceExplanationProvider {
  generateExplanation(context: ExplanationContext): Promise<string>;
  generateSummary(context: ExplanationContext): Promise<string>;
}

export class DeterministicExplanationProvider implements IntelligenceExplanationProvider {
  public async generateSummary(context: ExplanationContext): Promise<string> {
    const { metricName, currentValue, previousValue, variation, periodLabel, comparisonLabel } = context;

    let text = `${metricName} registrou ${typeof currentValue === 'number' ? currentValue.toLocaleString('pt-BR') : currentValue}`;

    if (previousValue !== undefined && previousValue !== null && variation !== undefined && variation !== null) {
      const direction = variation > 0 ? 'aumento de +' : 'redução de ';
      text += ` (${direction}${Math.abs(variation).toFixed(1)}% vs período anterior: ${typeof previousValue === 'number' ? previousValue.toLocaleString('pt-BR') : previousValue})`;
    }

    if (periodLabel) {
      text += ` no período avaliado (${periodLabel})`;
    }
    if (comparisonLabel) {
      text += ` em comparação a ${comparisonLabel}.`;
    } else {
      text += '.';
    }

    return text;
  }

  public async generateExplanation(context: ExplanationContext): Promise<string> {
    const lines: string[] = [];

    // 1. O que aconteceu e magnitude
    const summary = await this.generateSummary(context);
    lines.push(`• Visão Geral: ${summary}`);

    // 2. Dimensões afetadas (bancos, produtos, parceiros)
    if (context.dimensionsAffected && context.dimensionsAffected.length > 0) {
      lines.push('\n• Dimensões com Maior Impacto Identificadas:');
      for (const dim of context.dimensionsAffected) {
        const sign = dim.variation > 0 ? '+' : '';
        const shareText = dim.sharePercent ? ` (representa ${dim.sharePercent.toFixed(1)}% do impacto)` : '';
        lines.push(`  - ${dim.dimension.toUpperCase()}: ${dim.name} com variação de ${sign}${dim.variation.toFixed(1)}%${shareText}${dim.detail ? ` [${dim.detail}]` : ''}`);
      }
    }

    // 3. Evidências estruturadas
    if (context.evidence && context.evidence.length > 0) {
      lines.push('\n• Evidências Operacionais Sustentadoras:');
      for (const ev of context.evidence) {
        const varText = ev.variation !== undefined && ev.variation !== null
          ? ` (variação: ${ev.variation > 0 ? '+' : ''}${ev.variation.toFixed(1)}%)`
          : '';
        lines.push(`  - ${ev.label || ev.metric}: valor atual de ${ev.currentValue} [Fonte: ${ev.source}]${varText}`);
      }
    }

    // 4. Correlações no período
    if (context.correlatedEvents && context.correlatedEvents.length > 0) {
      lines.push('\n• Fatores Temporais Correlacionados (Mesmo Período):');
      for (const evt of context.correlatedEvents) {
        lines.push(`  - ${evt}`);
      }
      lines.push('  * Nota: As correlações indicam ocorrência concomitante no intervalo avaliado e devem ser investigadas operacionalmente.');
    }

    return lines.join('\n');
  }
}
