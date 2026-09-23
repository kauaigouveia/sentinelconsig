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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-600/20 text-violet-400 rounded-xl border border-violet-500/30">
              <Play className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Simulador de Regra de Automação</h3>
              <p className="text-xs text-slate-400">
                Teste de condições sem alterar o banco de dados nem disparar ações reais.
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Rule Preview */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-1">Regra Avaliada</div>
            <div className="font-medium text-white">{automation.name || 'Nova Regra'}</div>
            <div className="text-xs text-slate-400 mt-1 font-mono">
              Gatilho: <span className="text-violet-300">{automation.event}</span>
            </div>
          </div>

          {/* Test Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Evento Simulado
              </label>
              <input
                type="text"
                value={mockEvent}
                onChange={(e) => setMockEvent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-violet-500"
                placeholder="Ex: PROPOSAL_STATUS_CHANGED"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
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
                  className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
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
                  className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                >
                  Cenário Inválido
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Payload do Evento (JSON)
              </label>
              <span className="text-[11px] text-slate-500">Representa as propriedades recebidas pelo evento</span>
            </div>
            <textarea
              rows={6}
              value={mockPayloadStr}
              onChange={(e) => setMockPayloadStr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-emerald-400 font-mono text-xs focus:outline-none focus:border-violet-500"
            />
            {jsonError && <p className="text-xs text-rose-400 mt-1">{jsonError}</p>}
          </div>

          {/* Test Results Output */}
          {testResult && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white flex items-center gap-2 text-sm">
                  {testResult.conditionsMatched && testResult.triggerMatched ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-amber-400" />
                  )}
                  Resultado da Simulação
                </h4>
                <span
                  className={`text-xs px-2.5 py-1 rounded font-bold uppercase ${
                    testResult.conditionsMatched && testResult.triggerMatched
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {testResult.conditionsMatched && testResult.triggerMatched
                    ? 'DISPARO CONFIRMADO'
                    : 'IGNORADO (SKIPPED)'}
                </span>
              </div>

              <p className="text-xs text-slate-300 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                {testResult.summary}
              </p>

              {/* Conditions detail */}
              {testResult.evaluatedRules && testResult.evaluatedRules.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Avaliação das Condições (Modo {testResult.matchType})
                  </div>
                  <div className="space-y-1">
                    {testResult.evaluatedRules.map((rule: any, idx: number) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded text-xs border ${
                          rule.matched
                            ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-300'
                            : 'bg-rose-950/20 border-rose-800/30 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {rule.matched ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          )}
                          <span>
                            Campo <strong>{rule.field}</strong> {rule.operator} "
                            {String(rule.expectedValue ?? '')}"
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Valor Real: <span className="text-white">{JSON.stringify(rule.actualValue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Planned Actions */}
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Ações que seriam disparadas ({testResult.plannedActions?.length || 0})
                </div>
                {testResult.plannedActions?.length > 0 ? (
                  <div className="space-y-1.5">
                    {testResult.plannedActions.map((act: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-xs flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 text-violet-300 font-semibold">
                          <Layers className="w-4 h-4 text-violet-400" />
                          {act.label}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 truncate max-w-xs">
                          {JSON.stringify(act.params)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">Nenhuma ação configurada.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={isTesting}
            className="px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg shadow-lg shadow-violet-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {isTesting ? 'Simulando...' : 'Executar Simulação'}
          </button>
        </div>
      </div>
    </div>
  );
};
