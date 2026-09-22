import React, { useState } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Link as LinkIcon,
  X,
  Building2,
  Send,
  Radio,
} from 'lucide-react';
import { Proposal } from '../../types';

interface HappyProposalCardProps {
  proposal: Proposal;
  onProposalUpdated?: (updated: Proposal) => void;
  standalone?: boolean;
}

export const HappyProposalCard: React.FC<HappyProposalCardProps> = ({
  proposal,
  onProposalUpdated,
  standalone = false,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  } | null>(null);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkContractId, setLinkContractId] = useState(proposal.happyContractId || '');
  const [isLinking, setIsLinking] = useState(false);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback(null);

    try {
      const res = await fetch(`/api/proposals/${proposal.id}/happy-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Erro HTTP ${res.status}`);
      }

      if (data.success) {
        if (data.statusMapped === false) {
          setSyncFeedback({
            type: 'warning',
            message: `Consulta Happy realizada, mas o status não foi alterado no Sentinel. Status retornado: "${data.statusName || 'N/A'}" (Código: ${data.statusCode ?? 'N/A'}).`,
          });
        } else if (data.hasChanged) {
          setSyncFeedback({
            type: 'success',
            message: `Status atualizado com sucesso na Happy! Novo status interno: "${data.currentInternalStatus || 'Atualizado'}"`,
          });
        } else {
          setSyncFeedback({
            type: 'info',
            message: `Consulta Happy realizada com sucesso. Status confirmado: "${data.statusName || 'Atual'}" (sem alteração necessária).`,
          });
        }

        if (onProposalUpdated) {
          onProposalUpdated({
            ...proposal,
            happyContractId: data.contractId || proposal.happyContractId,
            happyStatus: data.statusName || proposal.happyStatus,
            happyStatusCode: data.statusCode ?? proposal.happyStatusCode,
            happyStatusName: data.statusName || proposal.happyStatusName,
            happyStatusDescription: data.statusDescription || proposal.happyStatusDescription,
            happyLastSyncAt: new Date().toISOString(),
            happySyncStatus: 'SYNCED',
          });
        }
      } else {
        setSyncFeedback({
          type: 'error',
          message: data.message || data.error || 'Falha ao consultar status na Happy.',
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: err.message || 'Erro de comunicação ao sincronizar proposta.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveContractLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkContractId.trim()) return;

    setIsLinking(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          happyContractId: linkContractId.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao vincular contrato Happy.');
      }

      const updated = await res.json();
      setShowLinkModal(false);
      setSyncFeedback({
        type: 'success',
        message: `Contrato Happy "${linkContractId.trim()}" vinculado com sucesso! Você já pode sincronizar.`,
      });

      if (onProposalUpdated) {
        onProposalUpdated(updated);
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: err.message || 'Falha ao salvar identificadores.',
      });
    } finally {
      setIsLinking(false);
    }
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return 'Nunca sincronizado';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleString('pt-BR');
  };

  return (
    <div
      id={`happy-proposal-card-${proposal.id}`}
      className={`rounded-2xl border ${
        standalone
          ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs'
          : 'border-pink-200 dark:border-pink-900/50 bg-pink-50/30 dark:bg-pink-950/20 p-4'
      } space-y-4 text-xs`}
    >
      {/* Header do Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-pink-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
            HP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Esteira Digital Happy / BYX Capital
              </h4>
              {proposal.happySyncStatus === 'SYNCED' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Sincronizado
                </span>
              ) : proposal.happyContractId ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  Vínculo Ativo
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Sem Contrato
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Sincronização bidirecional via API REST & Webhooks em Tempo Real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
          >
            <LinkIcon className="h-3.5 w-3.5 text-pink-600" />
            <span>{proposal.happyContractId ? 'Alterar Contrato' : 'Vincular Contrato'}</span>
          </button>

          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-3.5 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Consultar Happy'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {syncFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between animate-in fade-in duration-150 ${
            syncFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : syncFeedback.type === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : syncFeedback.type === 'info'
              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
              : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncFeedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : syncFeedback.type === 'warning' ? (
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            )}
            <span>{syncFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="text-[11px] font-bold opacity-75 hover:opacity-100 cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid de Identificadores e Status Atual */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
            ID do Contrato Happy
          </span>
          <div className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
            {proposal.happyContractId || (
              <span className="text-slate-400 font-normal italic">Não vinculado</span>
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
            Status Retornado (Happy)
          </span>
          <div className="font-bold text-xs text-pink-700 dark:text-pink-300 truncate">
            {proposal.happyStatusName || proposal.happyStatus || (
              <span className="text-slate-400 font-normal italic">Aguardando consulta</span>
            )}
          </div>
          {proposal.happyStatusCode !== undefined && (
            <span className="text-[10px] font-mono text-slate-400 block">
              Código: {proposal.happyStatusCode}
            </span>
          )}
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
            Status de Portabilidade
          </span>
          <div className="font-bold text-xs text-slate-800 dark:text-slate-200">
            {proposal.happyPortabilityStatus || (
              <span className="text-slate-400 font-normal italic">Não aplicável</span>
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
            Última Sincronização
          </span>
          <div className="font-medium text-[11px] text-slate-700 dark:text-slate-300">
            {formatDateTime(proposal.happyLastSyncAt)}
          </div>
        </div>
      </div>

      {/* Descrição detalhada do status retornado se houver */}
      {proposal.happyStatusDescription && (
        <div className="p-2.5 rounded-lg bg-pink-50/60 dark:bg-pink-950/30 border border-pink-200/60 dark:border-pink-900/40 text-pink-950 dark:text-pink-200 text-xs">
          <strong>Mensagem da Esteira Happy:</strong> {proposal.happyStatusDescription}
        </div>
      )}

      {/* Modal de Vinculação Manual */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-pink-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Vincular Contrato Happy / BYX
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveContractLink} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  ID do Contrato na Happy (contract_id)
                </label>
                <input
                  type="text"
                  value={linkContractId}
                  onChange={(e) => setLinkContractId(e.target.value)}
                  placeholder="Ex: 894123"
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100"
                />
                <span className="text-[10px] text-slate-400">
                  O identificador de contrato é utilizado para consultar o andamento na API e processar webhooks.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLinking}
                  className="px-4 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isLinking ? 'Salvando...' : 'Salvar Vínculo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
