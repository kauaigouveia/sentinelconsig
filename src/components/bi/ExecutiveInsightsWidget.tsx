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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3.5 h-3.5" />
            CRÍTICO
          </span>
        );
      case 'ATENCAO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" />
            ATENÇÃO
          </span>
        );
      case 'INFO':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Insights do Sentinel
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {insights.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Análise determinística e diagnósticos automáticos do período
            </p>
          </div>
        </div>
        <button
          onClick={loadInsights}
          disabled={isLoading}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title="Atualizar insights"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent"></div>
          <p className="text-xs text-slate-400 mt-2">Processando diagnósticos gerenciais...</p>
        </div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-rose-500">{error}</div>
      ) : sortedInsights.length === 0 ? (
        <div className="py-6 text-center text-slate-400 text-xs">
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
                    ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10'
                    : insight.severity === 'ATENCAO'
                    ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40'
                }`}
              >
                <div
                  onClick={() => setExpandedCode(isExpanded ? null : insight.code)}
                  className="p-3.5 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 pr-2">
                    {getSeverityBadge(insight.severity)}
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {insight.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {insight.deltaPercent !== null && (
                      <span
                        className={`text-xs font-extrabold flex items-center gap-1 ${
                          insight.deltaPercent < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
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
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 dark:border-slate-800/60 text-xs space-y-2">
                    <div>
                      <span className="font-semibold text-slate-500 dark:text-slate-400">Constatação: </span>
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{insight.explanation}</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-indigo-900 dark:text-indigo-300">Ação Recomendada: </span>
                        <span className="text-indigo-800 dark:text-indigo-200">{insight.recommendation}</span>
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
