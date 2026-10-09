import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ShieldCheck,
  History,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  X,
  Building2,
} from 'lucide-react';
import { Proposal, FactaSyncHistoryItem } from '../../types';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';

interface FactaProposalCardProps {
  proposal: Proposal;
  onProposalUpdated?: (updated: Proposal) => void;
  standalone?: boolean;
}

export const FactaProposalCard: React.FC<FactaProposalCardProps> = ({
  proposal,
  onProposalUpdated,
  standalone = false,
}) => {
  const activeUser = StorageService.getActiveUser();
  const canSync = hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.sync') || hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
  const canEditProposal = hasPermission(activeUser?.role, activeUser?.customPermissions, 'proposals.update') || hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  } | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<FactaSyncHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkProposalNum, setLinkProposalNum] = useState(proposal.factaProposalNumber || '');
  const [linkAfCode, setLinkAfCode] = useState(
    proposal.factaAfCode || ''
  );
  const [linkContractNum, setLinkContractNum] = useState(proposal.factaContractNumber || '');
  const [isLinking, setIsLinking] = useState(false);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/facta-history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[FACTA] Erro ao carregar histórico:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (showHistory) {
      loadHistory();
    }
  }, [showHistory, proposal.id]);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback(null);

    try {
      const res = await fetch(`/api/proposals/${proposal.id}/facta-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Erro HTTP ${res.status}`);
      }

      if (data.success) {
        if (data.statusMapped === false) {
          setSyncFeedback({
            type: 'warning',
            message: `Consulta FACTA realizada com sucesso, mas o status interno não foi atualizado. Status retornado: "${data.rawStatus || 'N/A'}" (Crivo: "${data.crivoStatus || 'N/A'}").`,
          });
        } else if (data.internalStatusUpdated) {
          setSyncFeedback({
            type: 'success',
            message: `Status FACTA e status interno atualizados com sucesso! Novo status: "${data.currentInternalStatus || 'Atualizado'}"`,
          });
        } else {
          setSyncFeedback({
            type: 'success',
            message: `Consulta executada na FACTA com sucesso. A proposta já está no status interno "${data.currentInternalStatus || 'atual'}".`,
          });
        }

        if (onProposalUpdated) {
          const updatedProposal: Proposal = {
            ...proposal,
            ...(data.statusId ? { statusId: data.statusId } : {}),
            ...(data.statusName || data.currentInternalStatus ? { status: data.statusName || data.currentInternalStatus } : {}),
            factaProposalNumber: data.factaProposalNumber || proposal.factaProposalNumber,
            factaAfCode: data.factaAfCode || proposal.factaAfCode,
            factaContractNumber: data.factaContractNumber || proposal.factaContractNumber,
            factaRawStatus: data.rawStatus || proposal.factaRawStatus,
            factaCrivoStatus: data.crivoStatus || proposal.factaCrivoStatus,
            factaLastSyncAt: new Date().toISOString(),
            factaSyncStatus: 'SYNCED',
            factaSyncError: undefined,
          };
          onProposalUpdated(updatedProposal);
        }

        if (showHistory) {
          loadHistory();
        }
      } else {
        setSyncFeedback({
          type: 'error',
          message: data.error || 'Não foi possível consultar a proposta na FACTA Financeira.',
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: err.message || 'Falha de comunicação com a FACTA Financeira. Tente novamente.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkAfCode.trim() && !linkProposalNum.trim() && !linkContractNum.trim()) return;
    setIsLinking(true);

    try {
      const res = await fetch(`/api/proposals/${proposal.id}/facta-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factaProposalNumber: linkProposalNum.trim() || undefined,
          factaAfCode: linkAfCode.trim() || undefined,
          factaContractNumber: linkContractNum.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao vincular');

      setShowLinkModal(false);
      setSyncFeedback({
        type: 'info',
        message: `Identificador FACTA vinculado. Clique em "Consultar status" para sincronizar.`,
      });

      if (onProposalUpdated) {
        onProposalUpdated({
          ...proposal,
          factaProposalNumber: linkProposalNum.trim() || proposal.factaProposalNumber,
          factaAfCode: linkAfCode.trim() || proposal.factaAfCode,
          factaContractNumber: linkContractNum.trim() || proposal.factaContractNumber,
          factaSyncStatus: 'PENDING',
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: err.message || 'Falha ao vincular identificadores FACTA.',
      });
    } finally {
      setIsLinking(false);
    }
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return 'Nunca consultada';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const syncStatus = proposal.factaSyncStatus || 'PENDING';

  return (
    <div className={`rounded-xl border transition-all ${
      standalone
        ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs'
        : 'border-orange-200 dark:border-orange-900/60 bg-orange-50/40 dark:bg-orange-950/20'
    } p-4 text-xs`}>
      {/* Header do Card FACTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-orange-600 text-white flex items-center justify-center font-black text-[11px] tracking-tighter shadow-xs">
            FAC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Integração FACTA Financeira
              </span>
              {/* Badge de Sincronização */}
              {syncStatus === 'SYNCED' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <CheckCircle2 className="h-3 w-3" />
                  Sincronizado
                </span>
              )}
              {syncStatus === 'PENDING' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <Clock className="h-3 w-3" />
                  Pendente
                </span>
              )}
              {syncStatus === 'ERROR' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                  <AlertTriangle className="h-3 w-3" />
                  Falha
                </span>
              )}
              {syncStatus === 'UNLINKED' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                  <LinkIcon className="h-3 w-3" />
                  Não Vinculado
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
              Última consulta: {formatDateTime(proposal.factaLastSyncAt)}
            </span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          {canEditProposal && <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Vincular ou alterar código AF/Proposta da FACTA"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Vincular AF / Proposta</span>
          </button>}

          {canSync && <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs text-white shadow-xs transition-all cursor-pointer ${
              isSyncing
                ? 'bg-orange-400 dark:bg-orange-600 cursor-not-allowed opacity-80'
                : 'bg-orange-600 hover:bg-orange-700 active:scale-95'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Consultando FACTA...' : 'Consultar status na FACTA'}</span>
          </button>}
        </div>
      </div>

      {/* Feedback Toast / Mensagem */}
      {syncFeedback && (
        <div
          className={`mt-3 p-2.5 rounded-lg flex items-start justify-between gap-2 text-xs border animate-in fade-in duration-150 ${
            syncFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : syncFeedback.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800'
              : syncFeedback.type === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800'
              : 'bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncFeedback.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
            {syncFeedback.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />}
            {syncFeedback.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
            {syncFeedback.type === 'info' && <ShieldCheck className="h-4 w-4 shrink-0 text-orange-600" />}
            <span>{syncFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Erro persistente anterior */}
      {proposal.factaSyncError && !syncFeedback && (
        <div className="mt-3 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border border-rose-200 dark:border-rose-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <div>
            <span className="font-bold block text-[11px]">Última sincronização FACTA com falha:</span>
            <span className="text-[11px]">{proposal.factaSyncError}</span>
          </div>
        </div>
      )}

      {/* Grid de Informações Retornadas da FACTA */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3.5 pt-1">
        <div className="bg-white/80 dark:bg-slate-900/90 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
            Código AF FACTA
          </span>
          <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 truncate block">
            {proposal.factaAfCode || '—'}
          </span>
        </div>

        <div className="bg-white/80 dark:bg-slate-900/90 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
            Nº Proposta FACTA
          </span>
          <span className="font-mono font-medium text-xs text-slate-800 dark:text-slate-200 truncate block">
            {proposal.factaProposalNumber || proposal.proposalNumber || '—'}
          </span>
        </div>

        <div className="bg-white/80 dark:bg-slate-900/90 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
            Status Proposta FACTA
          </span>
          <span className="font-bold text-xs text-orange-700 dark:text-orange-300 truncate block">
            {proposal.factaRawStatus || 'Ainda não consultada'}
          </span>
        </div>

        <div className="bg-white/80 dark:bg-slate-900/90 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
            Status Crivo
          </span>
          <span className="font-medium text-xs text-slate-800 dark:text-slate-200 truncate block">
            {proposal.factaCrivoStatus || '—'}
          </span>
        </div>

        {/* Linha com detalhes adicionais */}
        <div className="col-span-2 md:col-span-4 bg-white/80 dark:bg-slate-900/90 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
              Número de Contrato FACTA
            </span>
            <span className="font-mono font-medium text-xs text-slate-900 dark:text-slate-100">
              {proposal.factaContractNumber || 'Nenhum contrato registrado'}
            </span>
          </div>

          {proposal.factaLastMovementAt && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              Último Movimento FACTA: {formatDateTime(proposal.factaLastMovementAt)}
            </span>
          )}
        </div>
      </div>

      {/* Botão de Expansão do Histórico FACTA */}
      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowHistory((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition-colors cursor-pointer"
        >
          <History className="h-3.5 w-3.5 text-orange-500" />
          <span>Histórico de Consultas FACTA</span>
          {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Tabela do Histórico FACTA */}
      {showHistory && (
        <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 animate-in fade-in duration-150">
          {isLoadingHistory ? (
            <div className="py-6 text-center text-slate-400">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-1 text-orange-500" />
              <span>Carregando histórico FACTA...</span>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-4 text-center text-slate-400 text-xs">
              Nenhuma consulta à FACTA Financeira registrada para esta proposta até o momento.
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 sticky top-0">
                  <tr>
                    <th className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">Data / Hora</th>
                    <th className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">Status Proposta</th>
                    <th className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">Status Crivo</th>
                    <th className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">Status Interno</th>
                    <th className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">Origem</th>
                    <th className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {historyItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTime(item.queryDate)}
                      </td>
                      <td className="py-2 px-3 text-slate-900 dark:text-slate-100 font-medium">
                        {item.currentRawStatus || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                        {item.currentCrivoStatus || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                        {item.currentInternalStatus || '—'}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {item.queriedBy === 'AUTO_WORKER' ? 'Robô Automático' : 'Operador'}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {item.success ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Sucesso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400" title={item.technicalError || ''}>
                            <AlertTriangle className="h-3 w-3" /> Falha
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal para Vincular Identificadores FACTA */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 max-w-md w-full shadow-xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-orange-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Vincular Identificadores FACTA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLink} className="space-y-4 mt-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                  Código AF FACTA
                </label>
                <input
                  type="text"
                  value={linkAfCode}
                  onChange={(e) => setLinkAfCode(e.target.value)}
                  placeholder="Ex: 123456"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                  Número de Proposta FACTA
                </label>
                <input
                  type="text"
                  value={linkProposalNum}
                  onChange={(e) => setLinkProposalNum(e.target.value)}
                  placeholder="Ex: 987654"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                  Número do Contrato FACTA (Opcional)
                </label>
                <input
                  type="text"
                  value={linkContractNum}
                  onChange={(e) => setLinkContractNum(e.target.value)}
                  placeholder="Ex: CTR-554433"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLinking}
                  className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-xs font-bold text-white shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isLinking ? 'Salvando...' : 'Salvar Identificadores'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
