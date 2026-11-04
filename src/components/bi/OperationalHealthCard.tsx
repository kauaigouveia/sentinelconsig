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
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            OPERAÇÃO SAUDÁVEL
          </span>
        );
      case 'ATENCAO':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
            <AlertTriangle className="w-3.5 h-3.5" />
            REQUER ATENÇÃO
          </span>
        );
      case 'CRITICO':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
            <AlertCircle className="w-3.5 h-3.5" />
            ESTADO CRÍTICO
          </span>
        );
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[var(--success-text)] dark:text-[var(--success-text)] border-[var(--success-border)]';
    if (score >= 60) return 'text-[var(--warning-text)] dark:text-[var(--warning-text)] border-[var(--warning-border)]';
    return 'text-[var(--danger-text)] dark:text-[var(--danger-text)] border-[var(--danger-border)]';
  };

  return (
    <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-2xl p-5  transition">
      <div className="flex items-center justify-between pb-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Índice de Saúde Operacional (OHS & EHS)
            </h3>
            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
              Pontuação determinística de eficiência e saúde da esteira
            </p>
          </div>
        </div>

        {data && getScoreBadge(data.operational.classification)}
      </div>

      {isLoading ? (
        <div className="py-8 text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[var(--field-border)] border-t-transparent"></div>
          <p className="text-xs text-[var(--text-secondary)] mt-2">Calculando pontuação de saúde operacional...</p>
        </div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-[var(--danger-text)]">{error}</div>
      ) : data ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Operational Health Score (OHS) */}
            <div className="p-4 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] uppercase tracking-wider block">
                  Saúde Operacional (OHS)
                </span>
                <span className="text-2xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  {data.operational.score} <span className="text-xs font-normal text-[var(--text-secondary)]">/ 100</span>
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
            <div className="p-4 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] uppercase tracking-wider block">
                  Saúde Executiva (EHS)
                </span>
                <span className="text-2xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  {data.executive.score} <span className="text-xs font-normal text-[var(--text-secondary)]">/ 100</span>
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
            className="w-full py-2 px-3 rounded-lg text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{showDetails ? 'Ocultar Decomposição Matemática' : 'Ver Decomposição Matemática e Fatores'}</span>
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showDetails && (
            <div className="p-4 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] text-xs space-y-3 font-mono">
              <h4 className="font-sans font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-1">
                Decomposição do OHS (Base 100):
              </h4>
              <ul className="space-y-1.5 text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                <li className="flex justify-between">
                  <span>[-] Penalidade SLA Estourado (Máx 40):</span>
                  <span className="font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)]">-{data.operational.slaPenalty} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[-] Penalidade Risco SLA (Máx 20):</span>
                  <span className="font-bold text-[var(--warning-text)] dark:text-[var(--warning-text)]">-{data.operational.riskPenalty} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[-] Penalidade Retenção CIP (Máx 20):</span>
                  <span className="font-bold text-[var(--warning-text)] dark:text-[var(--warning-text)]">-{data.operational.cipPenalty} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[-] Penalidade Tarefas Vencidas (Máx 20):</span>
                  <span className="font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)]">-{data.operational.overduePenalty} pts</span>
                </li>
              </ul>

              <h4 className="font-sans font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-1 pt-2">
                Decomposição do EHS (Base 100):
              </h4>
              <ul className="space-y-1.5 text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                <li className="flex justify-between">
                  <span>[+] Pontuação de Conversão (Máx 35):</span>
                  <span className="font-bold text-[var(--success-text)] dark:text-[var(--success-text)]">+{data.executive.conversionScore} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[+] Pontuação de Crescimento (Máx 35):</span>
                  <span className="font-bold text-[var(--success-text)] dark:text-[var(--success-text)]">+{data.executive.growthScore} pts</span>
                </li>
                <li className="flex justify-between">
                  <span>[+] Contribuição Saúde Operacional (Máx 30):</span>
                  <span className="font-bold text-[var(--success-text)] dark:text-[var(--success-text)]">+{data.executive.operationalScore} pts</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
