import React, { useEffect, useState } from 'react';
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
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null);
  const [targetStatusId, setTargetStatusId] = useState('');
  const [observation, setObservation] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ success: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingStatuses(true);
    setStatusLoadError(null);
    fetch('/api/statuses', { credentials: 'include' })
      .then(async response => {
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || 'Não foi possível carregar os status oficiais.');
        }
        return response.json();
      })
      .then((data: Status[]) => {
        if (cancelled) return;
        const activeStatuses = Array.isArray(data) ? data.filter(status => status.active) : [];
        if (activeStatuses.length === 0) throw new Error('Nenhum status oficial ativo foi encontrado.');
        setStatuses(activeStatuses);
        setTargetStatusId(current => activeStatuses.some(status => status.id === current && status.manualChangeAllowed)
          ? current
          : activeStatuses.find(status => status.manualChangeAllowed)?.id || '');
      })
      .catch(error => {
        if (cancelled) return;
        console.error('[BulkStatusModal] Erro ao carregar status oficiais:', error);
        setStatuses([]);
        setTargetStatusId('');
        setStatusLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os status oficiais.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStatuses(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!targetStatusId || isProcessing || isLoadingStatuses || selectedProposalIds.length === 0) return;
    const targetStatus = statuses.find(status => status.id === targetStatusId);
    if (!targetStatus || !targetStatus.manualChangeAllowed) {
      setResultMsg({ success: false, text: 'Selecione um status ativo válido e tente novamente.' });
      return;
    }
    setIsProcessing(true);
    setResultMsg(null);
    let updatedCount = 0;
    let unchangedCount = 0;
    const errors: string[] = [];
    const proposalsById = new Map(StorageService.getProposals().map(proposal => [proposal.id, proposal]));
    const batchSize = 8;

    try {
      for (let offset = 0; offset < selectedProposalIds.length; offset += batchSize) {
        const batch = selectedProposalIds.slice(offset, offset + batchSize);
        const results = await Promise.all(batch.map(async proposalId => {
          const proposal = proposalsById.get(proposalId);
          if (!proposal) return { proposalId, error: 'proposta não encontrada no cache atual' };
          if (proposal.statusId === targetStatusId) return { proposalId, unchanged: true as const };
          try {
            const response = await fetch(`/api/proposals/${encodeURIComponent(proposalId)}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                statusId: targetStatusId,
                statusName: targetStatus.name,
                notes: observation.trim() || undefined,
              }),
            });
            if (!response.ok) {
              const error = await response.json().catch(() => ({}));
              throw new Error(error.error || `HTTP ${response.status}`);
            }
            try {
              StorageService.updateProposalStatus(
                proposalId,
                targetStatusId,
                observation.trim() || undefined,
                undefined,
                'ALTERACAO_EM_LOTE',
                false
              );
            } catch (cacheError) {
              console.warn('[BulkStatusModal] A API confirmou a alteração, mas o cache local não foi atualizado:', cacheError);
            }
            return { proposalId };
          } catch (error) {
            return { proposalId, error: error instanceof Error ? error.message : 'erro desconhecido' };
          }
        }));

        for (const result of results) {
          if (result.error) errors.push(`${proposalsById.get(result.proposalId)?.proposalNumber || result.proposalId}: ${result.error}`);
          else if ('unchanged' in result && result.unchanged) unchangedCount += 1;
          else updatedCount += 1;
        }
      }

      if (updatedCount > 0) {
        void StorageService.syncWithPostgreSQL();
        onSuccess();
      }
      if (errors.length > 0) {
        setResultMsg({
          success: false,
          text: `Atualizadas ${updatedCount} de ${selectedProposalIds.length}${unchangedCount ? ` (${unchangedCount} já estavam nesse status)` : ''}. Falhas: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? `; e mais ${errors.length - 5}` : ''}`,
        });
      } else {
      setResultMsg({
        success: true,
        text: updatedCount > 0
          ? `${updatedCount} propostas atualizadas e registradas individualmente no histórico${unchangedCount ? `; ${unchangedCount} já estavam nesse status` : ''}.`
          : `${unchangedCount} propostas já estavam no status selecionado; nenhuma alteração foi necessária.`,
      });
      setTimeout(() => {
        onClose();
      }, 1200);
      }
    } finally {
      setIsProcessing(false);
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
            disabled={isProcessing}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
              disabled={isProcessing || isLoadingStatuses || statuses.length === 0}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
            >
              {isLoadingStatuses && <option value="">Carregando status oficiais...</option>}
              {!isLoadingStatuses && statuses.length === 0 && <option value="">Nenhum status ativo disponível</option>}
              {statuses.map(s => (
                <option key={s.id} value={s.id} disabled={!s.manualChangeAllowed}>
                  {s.name} ({s.responsible}){!s.manualChangeAllowed ? ' (Automático)' : ''}
                </option>
              ))}
            </select>
            {statusLoadError && <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{statusLoadError} Feche e abra a janela para tentar novamente.</p>}
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
            <strong>Nota de Auditoria:</strong> Cada alteração confirmada pela API será registrada no histórico da proposta com o usuário ativo e a observação informada.
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
            disabled={isProcessing || isLoadingStatuses || !!statusLoadError || !statuses.some(status => status.manualChangeAllowed) || !targetStatusId}
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
