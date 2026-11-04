import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle, AlertTriangle, X, RefreshCw, Layers } from 'lucide-react';

interface AutomationTestModalProps {
  automation: {
    name: string;
    event: string;
    conditions: any;
    actions: any;
  };
  onClose: () => void;
}

export const AutomationTestModal: React.FC<AutomationTestModalProps> = ({ automation, onClose }) => {
  const [mockEvent, setMockEvent] = useState(automation.event);
  const [mockPayloadStr, setMockPayloadStr] = useState(
    JSON.stringify(
      {
        id: 'prop_test_123',
        bank: 'C6_BANK',
        status: 'PENDING',
        priority: 'CRITICAL',
        proposalValue: 15000,
        assignedToId: '',
      },
      null,
      2
    )
  );
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const runTest = async () => {
    setJsonError(null);
    let parsedData = {};
    try {
      parsedData = JSON.parse(mockPayloadStr);
    } catch {
      setJsonError('O payload informado não é um JSON válido.');
      return;
    }

    setIsTesting(true);
    try {
      const res = await fetch('/api/automations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automation,
          mockEvent: {
            event: mockEvent,
            data: parsedData,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
      } else {
        const err = await res.json();
        setJsonError(err.error || 'Falha ao executar simulação de teste.');
      }
    } catch (err: any) {
      setJsonError(err.message || 'Erro de conexão com o servidor.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-sm">
      <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl w-full max-w-3xl overflow-hidden  flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[var(--field-border)] flex items-center justify-between bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[var(--info-bg)] text-[var(--link)] rounded-xl border border-[var(--field-border)]">
              <Play className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Simulador de Regra de Automação</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Teste de condições sem alterar o banco de dados nem disparar ações reais.
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Rule Preview */}
          <div className="bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl p-4">
            <div className="text-xs font-semibold text-[var(--link)] uppercase tracking-wider mb-1">Regra Avaliada</div>
            <div className="font-medium text-[var(--text-primary)]">{automation.name || 'Nova Regra'}</div>
            <div className="text-xs text-[var(--text-secondary)] mt-1 font-mono">
              Gatilho: <span className="text-[var(--link)]">{automation.event}</span>
            </div>
          </div>

          {/* Test Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                Evento Simulado
              </label>
              <input
                type="text"
                value={mockEvent}
                onChange={(e) => setMockEvent(e.target.value)}
                className="w-full bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono text-xs focus:outline-none focus:border-[var(--field-border)]"
                placeholder="Ex: PROPOSAL_STATUS_CHANGED"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                Predefinições Rápidas
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMockEvent(automation.event);
                    setMockPayloadStr(
                      JSON.stringify(
                        {
                          id: 'prop_test_1',
                          bank: 'C6_BANK',
                          status: 'PENDING',
                          priority: 'CRITICAL',
                          proposalValue: 20000,
                          assignedToId: '',
                        },
                        null,
                        2
                      )
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded border border-[var(--field-border)] transition-colors"
                >
                  Cenário Válido
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMockEvent(automation.event);
                    setMockPayloadStr(
                      JSON.stringify(
                        {
                          id: 'prop_test_2',
                          bank: 'OUTRO_BANCO',
                          status: 'REJECTED',
                          priority: 'LOW',
                          proposalValue: 500,
                          assignedToId: 'user_999',
                        },
                        null,
                        2
                      )
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded border border-[var(--field-border)] transition-colors"
                >
                  Cenário Inválido
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                Payload do Evento (JSON)
              </label>
              <span className="text-[11px] text-[var(--text-secondary)]">Representa as propriedades recebidas pelo evento</span>
            </div>
            <textarea
              rows={6}
              value={mockPayloadStr}
              onChange={(e) => setMockPayloadStr(e.target.value)}
              className="w-full bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-lg p-3 text-[var(--success-text)] font-mono text-xs focus:outline-none focus:border-[var(--field-border)]"
            />
            {jsonError && <p className="text-xs text-[var(--danger-text)] mt-1">{jsonError}</p>}
          </div>

          {/* Test Results Output */}
          {testResult && (
            <div className="bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-2 text-sm">
                  {testResult.conditionsMatched && testResult.triggerMatched ? (
                    <CheckCircle2 className="w-5 h-5 text-[var(--success-text)]" />
                  ) : (
                    <XCircle className="w-5 h-5 text-[var(--warning-text)]" />
                  )}
                  Resultado da Simulação
                </h4>
                <span
                  className={`text-xs px-2.5 py-1 rounded font-bold uppercase ${
                    testResult.conditionsMatched && testResult.triggerMatched
                      ? 'bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]'
                      : 'bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning-border)]'
                  }`}
                >
                  {testResult.conditionsMatched && testResult.triggerMatched
                    ? 'DISPARO CONFIRMADO'
                    : 'IGNORADO (SKIPPED)'}
                </span>
              </div>

              <p className="text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] p-3 rounded-lg border border-[var(--field-border)]">
                {testResult.summary}
              </p>

              {/* Conditions detail */}
              {testResult.evaluatedRules && testResult.evaluatedRules.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Avaliação das Condições (Modo {testResult.matchType})
                  </div>
                  <div className="space-y-1">
                    {testResult.evaluatedRules.map((rule: any, idx: number) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded text-xs border ${
                          rule.matched
                            ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]'
                            : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {rule.matched ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success-text)] shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-[var(--danger-text)] shrink-0" />
                          )}
                          <span>
                            Campo <strong>{rule.field}</strong> {rule.operator} "
                            {String(rule.expectedValue ?? '')}"
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                          Valor Real: <span className="text-[var(--text-primary)]">{JSON.stringify(rule.actualValue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Planned Actions */}
              <div>
                <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                  Ações que seriam disparadas ({testResult.plannedActions?.length || 0})
                </div>
                {testResult.plannedActions?.length > 0 ? (
                  <div className="space-y-1.5">
                    {testResult.plannedActions.map((act: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-[var(--bg-surface)] rounded-lg border border-[var(--field-border)] text-xs flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 text-[var(--link)] font-semibold">
                          <Layers className="w-4 h-4 text-[var(--link)]" />
                          {act.label}
                        </div>
                        <div className="font-mono text-[11px] text-[var(--text-secondary)] truncate max-w-xs">
                          {JSON.stringify(act.params)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--text-secondary)] italic">Nenhuma ação configurada.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[var(--field-border)] bg-[var(--bg-surface)] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] rounded-lg transition-colors"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={isTesting}
            className="px-5 py-2 text-sm font-semibold text-[var(--action-ink)] bg-[var(--action)] hover:bg-[var(--action-hover)] rounded-lg   transition-all flex items-center gap-2 disabled:opacity-90"
          >
            {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {isTesting ? 'Simulando...' : 'Executar Simulação'}
          </button>
        </div>
      </div>
    </div>
  );
};
