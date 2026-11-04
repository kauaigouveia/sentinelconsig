import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Sparkles,
  TrendingDown,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { BIFilterOptions } from '../../types/bi';
import { ManagerialInsight, InsightSeverity } from '../../types/managerialIntelligence';
import { ManagerialIntelligenceApiService } from '../../services/managerialIntelligenceApiService';

interface ExecutiveInsightsWidgetProps {
  filters: BIFilterOptions;
}

export const ExecutiveInsightsWidget: React.FC<ExecutiveInsightsWidgetProps> = ({ filters }) => {
  const [insights, setInsights] = useState<ManagerialInsight[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const loadInsights = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ManagerialIntelligenceApiService.fetchInsights(filters);
      setInsights(data);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar insights gerenciais.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, [
    filters.period,
    filters.startDate,
    filters.endDate,
    filters.bankId,
    filters.partnerId,
    filters.digitizerId,
    filters.assignedToId,
    filters.productId,
    filters.proposalType,
    filters.statusId,
    filters.standardCategory,
  ]);

  const getSeverityBadge = (severity: InsightSeverity) => {
    switch (severity) {
      case 'CRITICO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
            <AlertCircle className="w-3.5 h-3.5" />
            CRÍTICO
          </span>
        );
      case 'ATENCAO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
            <AlertTriangle className="w-3.5 h-3.5" />
            ATENÇÃO
          </span>
        );
      case 'INFO':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <Info className="w-3.5 h-3.5" />
            INFORMATIVO
          </span>
        );
    }
  };

  const sortedInsights = [...insights].sort((a, b) => {
    const order: Record<InsightSeverity, number> = { CRITICO: 0, ATENCAO: 1, INFO: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-2xl p-5  transition">
      <div className="flex items-center justify-between pb-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
              Insights do Sentinel
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                {insights.length}
              </span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
              Análise determinística e diagnósticos automáticos do período
            </p>
          </div>
        </div>
        <button
          onClick={loadInsights}
          disabled={isLoading}
          className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
          title="Atualizar insights"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[var(--field-border)] border-t-transparent"></div>
          <p className="text-xs text-[var(--text-secondary)] mt-2">Processando diagnósticos gerenciais...</p>
        </div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-[var(--danger-text)]">{error}</div>
      ) : sortedInsights.length === 0 ? (
        <div className="py-6 text-center text-[var(--text-secondary)] text-xs">
          Nenhuma anomalia ou alerta relevante foi identificado para os filtros aplicados.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {sortedInsights.map(insight => {
            const isExpanded = expandedCode === insight.code;
            return (
              <div
                key={insight.code}
                className={`rounded-xl border transition-all ${
                  insight.severity === 'CRITICO'
                    ? 'border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)]'
                    : insight.severity === 'ATENCAO'
                    ? 'border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)]'
                    : 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)]'
                }`}
              >
                <div
                  onClick={() => setExpandedCode(isExpanded ? null : insight.code)}
                  className="p-3.5 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 pr-2">
                    {getSeverityBadge(insight.severity)}
                    <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {insight.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {insight.deltaPercent !== null && (
                      <span
                        className={`text-xs font-extrabold flex items-center gap-1 ${
                          insight.deltaPercent < 0 ? 'text-[var(--danger-text)] dark:text-[var(--danger-text)]' : 'text-[var(--success-text)] dark:text-[var(--success-text)]'
                        }`}
                      >
                        {insight.deltaPercent < 0 ? (
                          <TrendingDown className="w-3.5 h-3.5" />
                        ) : (
                          <TrendingUp className="w-3.5 h-3.5" />
                        )}
                        {insight.deltaPercent > 0 ? `+${insight.deltaPercent}%` : `${insight.deltaPercent}%`}
                      </span>
                    )}

                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-[var(--field-border)] dark:border-[var(--field-border)] text-xs space-y-2">
                    <div>
                      <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">Constatação: </span>
                      <span className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium">{insight.explanation}</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border border-[var(--field-border)] dark:border-[var(--field-border)] flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-[var(--link)] dark:text-[var(--link)] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-[var(--link)] dark:text-[var(--link)]">Ação Recomendada: </span>
                        <span className="text-[var(--link)] dark:text-[var(--link)]">{insight.recommendation}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
