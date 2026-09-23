import React from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Activity,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface ExecutionDetailProps {
  execution: {
    id: string;
    event: string;
    status: string;
    result?: string | null;
    error?: string | null;
    durationMs: number;
    createdAt: string;
    automation?: { id: string; name: string; event: string };
    details?: {
      eventId?: string;
      depth?: number;
      evaluatedConditions?: Array<{
        field: string;
        operator: string;
        expectedValue: any;
        actualValue: any;
        matched: boolean;
      }>;
      matchType?: 'ALL' | 'ANY';
      conditionsMatched?: boolean;
      actionsExecuted?: Array<{
        type: string;
        success: boolean;
        result?: any;
        error?: string;
      }>;
      timeline?: Array<{
        timestamp: string;
        step: string;
        description: string;
        status: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
      }>;
    };
  };
  onClose: () => void;
}

export const AutomationExecutionTimelineModal: React.FC<ExecutionDetailProps> = ({
  execution,
  onClose,
}) => {
  const details = execution.details || {};
  const timeline = details.timeline || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> SUCESSO
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" /> FALHA
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
            IGNORADO
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> PARCIAL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('pt-BR', { hour12: false });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-600/20 text-violet-400 rounded-xl border border-violet-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Detalhes da Execução #{execution.id.slice(-8)}
                </h3>
                {getStatusBadge(execution.status)}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Regra: {execution.automation?.name || 'Automação'} • Evento: {execution.event}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm flex-1">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Duração</span>
              <div className="text-base font-bold text-white mt-0.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-violet-400" />
                {execution.durationMs} ms
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Data/Hora</span>
              <div className="text-base font-bold text-white mt-0.5">
                {new Date(execution.createdAt).toLocaleTimeString('pt-BR')}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Condições</span>
              <div className="text-base font-bold text-white mt-0.5">
                {details.conditionsMatched ? (
                  <span className="text-emerald-400">Atendidas</span>
                ) : (
                  <span className="text-slate-400">Não Atendidas</span>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ações Executadas</span>
              <div className="text-base font-bold text-white mt-0.5">
                {details.actionsExecuted?.length || 0}
              </div>
            </div>
          </div>

          {/* Erro em destaque se houver */}
          {execution.error && (
            <div className="p-4 bg-rose-950/30 border border-rose-800/40 rounded-xl text-rose-300 text-xs flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Mensagem de Erro:</span>
                <p className="mt-1 font-mono">{execution.error}</p>
              </div>
            </div>
          )}

          {/* Timeline de Execução */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-violet-400" />
              Linha do Tempo da Execução (Timeline)
            </h4>

            {timeline.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                Nenhum passo de timeline registrado para esta execução.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {timeline.map((item, idx) => {
                  const isSuccess = item.status === 'SUCCESS';
                  const isError = item.status === 'ERROR';
                  const isWarning = item.status === 'WARNING';

                  let dotColor = 'bg-slate-600';
                  if (isSuccess) dotColor = 'bg-emerald-400 ring-4 ring-emerald-500/20';
                  else if (isError) dotColor = 'bg-rose-500 ring-4 ring-rose-500/20';
                  else if (isWarning) dotColor = 'bg-amber-400 ring-4 ring-amber-500/20';

                  return (
                    <div key={idx} className="relative">
                      <div
                        className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ${dotColor}`}
                      />
                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-white flex items-center gap-1.5">
                            {item.step}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {formatTime(item.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Condições Avaliadas */}
          {details.evaluatedConditions && details.evaluatedConditions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Condições Avaliadas ({details.matchType === 'ANY' ? 'Modo OU' : 'Modo E'})
              </h4>
              <div className="space-y-1.5">
                {details.evaluatedConditions.map((cond, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                      cond.matched
                        ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {cond.matched ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      )}
                      <span>
                        Campo <strong>{cond.field}</strong> {cond.operator} "
                        {String(cond.expectedValue ?? '')}"
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Recebido: <span className="text-white">{JSON.stringify(cond.actualValue)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ações Executadas */}
          {details.actionsExecuted && details.actionsExecuted.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Ações Processadas
              </h4>
              <div className="space-y-2">
                {details.actionsExecuted.map((act, i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-violet-300">{act.type}</span>
                      <span
                        className={`font-semibold ${
                          act.success ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {act.success ? 'CONCLUÍDO' : 'FALHOU'}
                      </span>
                    </div>
                    {act.error && <p className="text-rose-400 font-mono text-[11px]">{act.error}</p>}
                    {act.result && (
                      <pre className="text-[11px] font-mono text-slate-400 bg-slate-900/60 p-2 rounded overflow-x-auto">
                        {JSON.stringify(act.result, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
