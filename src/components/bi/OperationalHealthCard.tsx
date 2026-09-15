import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Activity,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { BIFilterOptions } from '../../types/bi';
import { HealthScoreResponse, ScoreClassification } from '../../types/managerialIntelligence';
import { ManagerialIntelligenceApiService } from '../../services/managerialIntelligenceApiService';

interface OperationalHealthCardProps {
  filters: BIFilterOptions;
}

export const OperationalHealthCard: React.FC<OperationalHealthCardProps> = ({ filters }) => {
  const [data, setData] = useState<HealthScoreResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const loadHealthScores = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await ManagerialIntelligenceApiService.fetchHealthScores(filters);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar Health Score.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHealthScores();
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

  const getScoreBadge = (classification: ScoreClassification) => {
    switch (classification) {
      case 'SAUDAVEL':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" />
            OPERAÇÃO SAUDÁVEL
          </span>
        );
      case 'ATENCAO':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" />
            REQUER ATENÇÃO
          </span>
        );
      case 'CRITICO':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3.5 h-3.5" />
            ESTADO CRÍTICO
          </span>
        );
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400 border-emerald-500';
    if (score >= 60) return 'text-amber-600 dark:text-amber-400 border-amber-500';
    return 'text-rose-600 dark:text-rose-400 border-rose-500';
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
              Índice de Saúde Operacional (OHS & EHS)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pontuação determinística de eficiência e saúde da esteira
            </p>
          </div>
        </div>

        {data && getScoreBadge(data.operational.classification)}
      </div>

      {isLoading ? (
        <div className="py-8 text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
          <p className="text-xs text-slate-400 mt-2">Calculando pontuação de saúde operacional...</p>
        </div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-rose-500">{error}</div>
      ) : data ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Operational Health Score (OHS) */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Saúde Operacional (OHS)
                </span>
                <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                  {data.operational.score} <span className="text-xs font-normal text-slate-400">/ 100</span>
                </span>
              </div>
              <div
                className={`w-14 h-14 rounded-full border-4 flex items-center justify-center font-black text-lg ${getScoreColor(
                  data.operational.score
                )}`}
              >
                {data.operational.score}
              </div>
            </div>

            {/* Executive Health Score (EHS) */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Saúde Executiva (EHS)
                </span>
                <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                  {data.executive.score} <span className="text-xs font-normal text-slate-400">/ 100</span>
                </span>
              </div>
              <div
                className={`w-14 h-14 rounded-full border-4 flex items-center justify-center font-black text-lg ${getScoreColor(
                  data.executive.score
                )}`}
              >
                {data.executive.score}
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full py-2 px-3 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{showDetails ? 'Ocultar Decomposição Matemática' : 'Ver Decomposição Matemática e Fatores'}</span>
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showDetails && (
            <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-xs space-y-3 font-mono">
              <h4 className="font-sans font-bold text-slate-800 dark:text-slate-200 text-xs border-b border-slate-200 dark:border-slate-700 pb-1">
                Decomposição do OHS (Base 100):
              </h4>
              <ul className="space-y-1.5 text-slate-600 dark:text-slate-300">
                <li className="flex justify-between">
                  <span>[-] Penalidade SLA Estourado (Máx 40):</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">-{data.operational.slaPenalty} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[-] Penalidade Risco SLA (Máx 20):</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">-{data.operational.riskPenalty} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[-] Penalidade Retenção CIP (Máx 20):</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">-{data.operational.cipPenalty} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[-] Penalidade Tarefas Vencidas (Máx 20):</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">-{data.operational.overduePenalty} pts</span>
                </li>
              </ul>

              <h4 className="font-sans font-bold text-slate-800 dark:text-slate-200 text-xs border-b border-slate-200 dark:border-slate-700 pb-1 pt-2">
                Decomposição do EHS (Base 100):
              </h4>
              <ul className="space-y-1.5 text-slate-600 dark:text-slate-300">
                <li className="flex justify-between">
                  <span>[+] Pontuação de Conversão (Máx 35):</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+{data.executive.conversionScore} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[+] Pontuação de Crescimento (Máx 35):</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+{data.executive.growthScore} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[+] Contribuição Saúde Operacional (Máx 30):</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+{data.executive.operationalScore} pts</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
