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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl rounded-xl bg-[var(--bg-surface)]  flex flex-col max-h-[90vh] border border-[var(--field-border)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--field-border)] px-6 py-4 bg-[var(--bg-canvas)] rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[var(--info-bg)] text-[var(--text-primary)] flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-secondary)]">
                Suíte de Testes e Validação de Regras de Negócio
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Verificação automatizada dos 10 pilares mandatórios especificados no projeto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-surface-elevated)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Summary Banner */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--field-border)] bg-[var(--bg-canvas)]">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Status da Suíte
              </span>
              <p className="text-lg font-extrabold text-[var(--text-secondary)] mt-0.5">
                {passedCount === totalCount ? (
                  <span className="text-[var(--success-text)] flex items-center gap-1.5">
                    <CheckCircle2 className="h-5 w-5" /> 100% APROVADO ({passedCount}/{totalCount} testes)
                  </span>
                ) : (
                  <span className="text-[var(--danger-text)] flex items-center gap-1.5">
                    <AlertTriangle className="h-5 w-5" /> {passedCount} de {totalCount} aprovados
                  </span>
                )}
              </p>
            </div>

            <button
              onClick={runTests}
              disabled={isRunning}
              className="flex items-center gap-2 rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] px-4 py-2 text-xs font-bold text-[var(--action-ink)]  transition-colors"
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
                    ? 'border-[var(--success-border)] bg-[var(--success-bg)]'
                    : 'border-[var(--danger-border)] bg-[var(--danger-bg)]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {test.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-[var(--danger-text)] shrink-0" />
                    )}
                    <span className="font-bold text-[var(--text-secondary)] text-sm">
                      #{idx + 1} {test.name}
                    </span>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                      test.passed
                        ? 'bg-[var(--success-bg)] text-[var(--success-text)]'
                        : 'bg-[var(--danger-bg)] text-[var(--danger-text)]'
                    }`}
                  >
                    {test.category} • {test.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-[var(--field-border)] font-mono text-[11px]">
                  <div>
                    <span className="text-[var(--text-secondary)] block text-[10px] font-sans uppercase">Esperado:</span>
                    <span className="text-[var(--text-secondary)]">{test.expected}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-secondary)] block text-[10px] font-sans uppercase">Resultado Obtido:</span>
                    <span className={test.passed ? 'text-[var(--success-text)] font-bold' : 'text-[var(--danger-text)] font-bold'}>
                      {test.actual}
                    </span>
                  </div>
                </div>

                {test.details && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1.5 font-sans italic">
                    {test.details}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[var(--field-border)] px-6 py-3 bg-[var(--bg-canvas)] rounded-b-xl">
          <button
            onClick={onClose}
            className="rounded-lg bg-[var(--bg-surface)] border border-[var(--field-border)] px-4 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
