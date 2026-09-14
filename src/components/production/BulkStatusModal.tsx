import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Status } from '../../types';

interface BulkStatusModalProps {
  isOpen: boolean;
  selectedProposalIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkStatusModal: React.FC<BulkStatusModalProps> = ({
  isOpen,
  selectedProposalIds,
  onClose,
  onSuccess,
}) => {
  if (!isOpen) return null;

  const statuses = StorageService.getStatuses().filter(s => s.active);
  const [targetStatusId, setTargetStatusId] = useState(statuses[0]?.id || '');
  const [observation, setObservation] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ success: boolean; text: string } | null>(null);

  const handleConfirm = () => {
    if (!targetStatusId) return;

    setIsProcessing(true);
    const res = StorageService.bulkUpdateProposalStatus(
      selectedProposalIds,
      targetStatusId,
      observation || undefined
    );

    if (res.errors.length > 0) {
      setResultMsg({
        success: false,
        text: `Atualizado parcialmente (${res.updatedCount} propostas). Erros: ${res.errors.join(', ')}`,
      });
      setIsProcessing(false);
    } else {
      setResultMsg({
        success: true,
        text: `${res.updatedCount} propostas atualizadas com sucesso com registro individual no histórico!`,
      });
      setTimeout(() => {
        setIsProcessing(false);
        onSuccess();
        onClose();
      }, 1200);
    }
  };

  const selectedStatus = statuses.find(s => s.id === targetStatusId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-950/40 rounded-t-xl">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Alterar Status em Lote</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedProposalIds.length} proposta(s) selecionada(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Novo Status para Todas as Propostas Selecionadas *
            </label>
            <select
              value={targetStatusId}
              onChange={e => setTargetStatusId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
            >
              {statuses.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.responsible})
                </option>
              ))}
            </select>
            {selectedStatus && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Alçada responsável: <strong className="text-slate-700 dark:text-slate-300">{selectedStatus.responsible}</strong>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Motivo / Observação Geral (Opcional)
            </label>
            <textarea
              rows={3}
              value={observation}
              onChange={e => setObservation(e.target.value)}
              placeholder="Ex: Atualizado após confirmação bancária em lote..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 p-3 text-[11px] text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <strong>Nota de Auditoria:</strong> Cada proposta selecionada receberá seu próprio evento na linha do tempo com origem marcada como <code>ALTERACAO_EM_LOTE</code> e usuário ativo vinculado.
          </div>

          {resultMsg && (
            <div
              className={`rounded-lg p-3 text-xs flex items-center gap-2 border ${
                resultMsg.success
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                  : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
              }`}
            >
              {resultMsg.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{resultMsg.text}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-6 py-3 bg-slate-50 dark:bg-slate-950/40 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-1.5 text-xs font-bold text-white transition-colors flex items-center gap-2 shadow-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{isProcessing ? 'Atualizando...' : 'Confirmar Alteração'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
