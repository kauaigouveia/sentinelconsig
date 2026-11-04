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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]">
            <CheckCircle2 className="w-3.5 h-3.5" /> SUCESSO
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-border)]">
            <XCircle className="w-3.5 h-3.5" /> FALHA
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border border-[var(--field-border)]">
            IGNORADO
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning-border)]">
            <AlertTriangle className="w-3.5 h-3.5" /> PARCIAL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-sm">
      <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl w-full max-w-3xl overflow-hidden  flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--field-border)] flex items-center justify-between bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[var(--info-bg)] text-[var(--link)] rounded-xl border border-[var(--field-border)]">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Detalhes da Execução #{execution.id.slice(-8)}
                </h3>
                {getStatusBadge(execution.status)}
              </div>
              <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
                Regra: {execution.automation?.name || 'Automação'} • Evento: {execution.event}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm flex-1">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[var(--bg-canvas)] rounded-xl border border-[var(--field-border)]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Duração</span>
              <div className="text-base font-bold text-[var(--text-primary)] mt-0.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[var(--link)]" />
                {execution.durationMs} ms
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-canvas)] rounded-xl border border-[var(--field-border)]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Data/Hora</span>
              <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                {new Date(execution.createdAt).toLocaleTimeString('pt-BR')}
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-canvas)] rounded-xl border border-[var(--field-border)]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Condições</span>
              <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                {details.conditionsMatched ? (
                  <span className="text-[var(--success-text)]">Atendidas</span>
                ) : (
                  <span className="text-[var(--text-secondary)]">Não Atendidas</span>
                )}
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-canvas)] rounded-xl border border-[var(--field-border)]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Ações Executadas</span>
              <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                {details.actionsExecuted?.length || 0}
              </div>
            </div>
          </div>

          {/* Erro em destaque se houver */}
          {execution.error && (
            <div className="p-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-xl text-[var(--danger-text)] text-xs flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-[var(--danger-text)] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Mensagem de Erro:</span>
                <p className="mt-1 font-mono">{execution.error}</p>
              </div>
            </div>
          )}

          {/* Timeline de Execução */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[var(--link)]" />
              Linha do Tempo da Execução (Timeline)
            </h4>

            {timeline.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-canvas)] rounded-xl border border-[var(--field-border)]">
                Nenhum passo de timeline registrado para esta execução.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--bg-surface-elevated)]">
                {timeline.map((item, idx) => {
                  const isSuccess = item.status === 'SUCCESS';
                  const isError = item.status === 'ERROR';
                  const isWarning = item.status === 'WARNING';

                  let dotColor = 'bg-[var(--bg-surface-elevated)]';
                  if (isSuccess) dotColor = 'bg-[var(--success-bg)] ring-4 ring-[var(--success-border)]';
                  else if (isError) dotColor = 'bg-[var(--danger-bg)] ring-4 ring-[var(--danger-border)]';
                  else if (isWarning) dotColor = 'bg-[var(--warning-bg)] ring-4 ring-[var(--warning-border)]';

                  return (
                    <div key={idx} className="relative">
                      <div
                        className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ${dotColor}`}
                      />
                      <div className="bg-[var(--bg-canvas)] p-3 rounded-xl border border-[var(--field-border)]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                            {item.step}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                            {formatTime(item.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-primary)] mt-1">{item.description}</p>
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
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                Condições Avaliadas ({details.matchType === 'ANY' ? 'Modo OU' : 'Modo E'})
              </h4>
              <div className="space-y-1.5">
                {details.evaluatedConditions.map((cond, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                      cond.matched
                        ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]'
                        : 'bg-[var(--bg-canvas)] border-[var(--field-border)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {cond.matched ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success-text)] shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                      )}
                      <span>
                        Campo <strong>{cond.field}</strong> {cond.operator} "
                        {String(cond.expectedValue ?? '')}"
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                      Recebido: <span className="text-[var(--text-primary)]">{JSON.stringify(cond.actualValue)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ações Executadas */}
          {details.actionsExecuted && details.actionsExecuted.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                Ações Processadas
              </h4>
              <div className="space-y-2">
                {details.actionsExecuted.map((act, i) => (
                  <div
                    key={i}
                    className="p-3 bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--link)]">{act.type}</span>
                      <span
                        className={`font-semibold ${
                          act.success ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'
                        }`}
                      >
                        {act.success ? 'CONCLUÍDO' : 'FALHOU'}
                      </span>
                    </div>
                    {act.error && <p className="text-[var(--danger-text)] font-mono text-[11px]">{act.error}</p>}
                    {act.result && (
                      <pre className="text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-surface)] p-2 rounded overflow-x-auto">
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
        <div className="px-6 py-4 border-t border-[var(--field-border)] bg-[var(--bg-surface)] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-[var(--text-primary)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
