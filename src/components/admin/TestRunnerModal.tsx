import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ShieldCheck,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { TestRunnerService, TestResult } from '../../services/testRunnerService';

interface TestRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({ isOpen, onClose }) => {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runTests = useCallback(() => {
    setIsRunning(true);
    const timeout = window.setTimeout(() => {
      const results = TestRunnerService.runAllTests();
      setTests(results);
      setIsRunning(false);
    }, 200);
    return () => {
      window.clearTimeout(timeout);
      setIsRunning(false);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    return runTests();
  }, [isOpen, runTests]);

  if (!isOpen) return null;

  const passedCount = tests.filter(t => t.passed).length;
  const totalCount = tests.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh] border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Suíte de Testes e Validação de Regras de Negócio
              </h3>
              <p className="text-xs text-slate-500">
                Verificação automatizada dos 10 pilares mandatórios especificados no projeto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Summary Banner */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Status da Suíte
              </span>
              <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                {passedCount === totalCount ? (
                  <span className="text-emerald-600 flex items-center gap-1.5">
                    <CheckCircle2 className="h-5 w-5" /> 100% APROVADO ({passedCount}/{totalCount} testes)
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center gap-1.5">
                    <AlertTriangle className="h-5 w-5" /> {passedCount} de {totalCount} aprovados
                  </span>
                )}
              </p>
            </div>

            <button
              onClick={runTests}
              disabled={isRunning}
              className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>Reexecutar Testes</span>
            </button>
          </div>

          {/* Test Cards List */}
          <div className="space-y-2.5">
            {tests.map((test, idx) => (
              <div
                key={test.id}
                className={`p-4 rounded-xl border text-xs transition-all ${
                  test.passed
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-rose-200 bg-rose-50/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {test.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span className="font-bold text-slate-900 text-sm">
                      #{idx + 1} {test.name}
                    </span>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                      test.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {test.category} • {test.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200/60 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-sans uppercase">Esperado:</span>
                    <span className="text-slate-700">{test.expected}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-sans uppercase">Resultado Obtido:</span>
                    <span className={test.passed ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                      {test.actual}
                    </span>
                  </div>
                </div>

                {test.details && (
                  <p className="text-[11px] text-slate-500 mt-1.5 font-sans italic">
                    {test.details}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="rounded-lg bg-white border border-slate-300 px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
