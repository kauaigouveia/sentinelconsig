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
        ? 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] shadow-xs'
        : 'border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)]'
    } p-4 text-xs`}>
      {/* Header do Card FACTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-[var(--warning-bg)] text-[var(--warning-text)] flex items-center justify-center font-black text-[11px] tracking-tighter shadow-xs">
            FAC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Integração FACTA Financeira
              </span>
              {/* Badge de Sincronização */}
              {syncStatus === 'SYNCED' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
                  <CheckCircle2 className="h-3 w-3" />
                  Sincronizado
                </span>
              )}
              {syncStatus === 'PENDING' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
                  <Clock className="h-3 w-3" />
                  Pendente
                </span>
              )}
              {syncStatus === 'ERROR' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
                  <AlertTriangle className="h-3 w-3" />
                  Falha
                </span>
              )}
              {syncStatus === 'UNLINKED' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <LinkIcon className="h-3 w-3" />
                  Não Vinculado
                </span>
              )}
            </div>
            <span className="text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block mt-0.5">
              Última consulta: {formatDateTime(proposal.factaLastSyncAt)}
            </span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          {canEditProposal && <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
            title="Vincular ou alterar código AF/Proposta da FACTA"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Corrigir AF / ADE</span>
          </button>}

          {canSync && <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs text-[var(--text-primary)]  transition-all cursor-pointer ${
              isSyncing
                ? 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] cursor-not-allowed opacity-80'
                : 'bg-[var(--warning-bg)] hover:bg-[var(--warning-bg)] active:scale-95'
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
              ? 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border-[var(--success-border)] dark:border-[var(--success-border)]'
              : syncFeedback.type === 'error'
              ? 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border-[var(--danger-border)] dark:border-[var(--danger-border)]'
              : syncFeedback.type === 'warning'
              ? 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]'
              : 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncFeedback.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-text)]" />}
            {syncFeedback.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger-text)]" />}
            {syncFeedback.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warning-text)]" />}
            {syncFeedback.type === 'info' && <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--warning-text)]" />}
            <span>{syncFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Erro persistente anterior */}
      {proposal.factaSyncError && !syncFeedback && (
        <div className="mt-3 p-2.5 rounded-lg bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger-text)] mt-0.5" />
          <div>
            <span className="font-bold block text-[11px]">Última sincronização FACTA com falha:</span>
            <span className="text-[11px]">{proposal.factaSyncError}</span>
          </div>
        </div>
      )}

      {/* Grid de Informações Retornadas da FACTA */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3.5 pt-1">
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)]">
          <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">
            Código AF FACTA
          </span>
          <span className="font-mono font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate block">
            {proposal.factaAfCode || '—'}
          </span>
        </div>

        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)]">
          <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">
            Nº Proposta FACTA
          </span>
          <span className="font-mono font-medium text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate block">
            {proposal.factaProposalNumber || proposal.proposalNumber || '—'}
          </span>
        </div>

        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)]">
          <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">
            Status Proposta FACTA
          </span>
          <span className="font-bold text-xs text-[var(--warning-text)] dark:text-[var(--warning-text)] truncate block">
            {proposal.factaRawStatus || 'Ainda não consultada'}
          </span>
        </div>

        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)]">
          <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">
            Status Crivo
          </span>
          <span className="font-medium text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate block">
            {proposal.factaCrivoStatus || '—'}
          </span>
        </div>

        {/* Linha com detalhes adicionais */}
        <div className="col-span-2 md:col-span-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">
              Número de Contrato FACTA
            </span>
            <span className="font-mono font-medium text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              {proposal.factaContractNumber || 'Nenhum contrato registrado'}
            </span>
          </div>

          {proposal.factaLastMovementAt && (
            <span className="text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-mono">
              Último Movimento FACTA: {formatDateTime(proposal.factaLastMovementAt)}
            </span>
          )}
        </div>
      </div>

      {/* Botão de Expansão do Histórico FACTA */}
      <div className="mt-3 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowHistory((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:text-[var(--warning-text)] dark:hover:text-[var(--warning-text)] transition-colors cursor-pointer"
        >
          <History className="h-3.5 w-3.5 text-[var(--warning-text)]" />
          <span>Histórico de Consultas FACTA</span>
          {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Tabela do Histórico FACTA */}
      {showHistory && (
        <div className="mt-3 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] animate-in fade-in duration-150">
          {isLoadingHistory ? (
            <div className="py-6 text-center text-[var(--text-secondary)]">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-1 text-[var(--warning-text)]" />
              <span>Carregando histórico FACTA...</span>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-4 text-center text-[var(--text-secondary)] text-xs">
              Nenhuma consulta à FACTA Financeira registrada para esta proposta até o momento.
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] sticky top-0">
                  <tr>
                    <th className="py-2 px-3 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Data / Hora</th>
                    <th className="py-2 px-3 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Status Proposta</th>
                    <th className="py-2 px-3 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Status Crivo</th>
                    <th className="py-2 px-3 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Status Interno</th>
                    <th className="py-2 px-3 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Origem</th>
                    <th className="py-2 px-3 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {historyItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] whitespace-nowrap">
                        {formatDateTime(item.queryDate)}
                      </td>
                      <td className="py-2 px-3 text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium">
                        {item.currentRawStatus || '—'}
                      </td>
                      <td className="py-2 px-3 text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {item.currentCrivoStatus || '—'}
                      </td>
                      <td className="py-2 px-3 text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {item.currentInternalStatus || '—'}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] whitespace-nowrap">
                        {item.queriedBy === 'AUTO_WORKER' ? 'Robô Automático' : 'Operador'}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {item.success ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--success-text)] dark:text-[var(--success-text)]">
                            <CheckCircle2 className="h-3 w-3" /> Sucesso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)]" title={item.technicalError || ''}>
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
        <div className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] p-5 max-w-md w-full  animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-[var(--warning-text)]" />
                <h3 className="font-bold text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Vincular Identificadores FACTA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLink} className="space-y-4 mt-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Código AF FACTA
                </label>
                <input
                  type="text"
                  value={linkAfCode}
                  onChange={(e) => setLinkAfCode(e.target.value)}
                  placeholder="Ex: 123456"
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--warning-border)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Número de Proposta FACTA
                </label>
                <input
                  type="text"
                  value={linkProposalNum}
                  onChange={(e) => setLinkProposalNum(e.target.value)}
                  placeholder="Ex: 987654"
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--warning-border)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Número do Contrato FACTA (Opcional)
                </label>
                <input
                  type="text"
                  value={linkContractNum}
                  onChange={(e) => setLinkContractNum(e.target.value)}
                  placeholder="Ex: CTR-554433"
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--warning-border)] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLinking}
                  className="px-4 py-1.5 rounded-lg bg-[var(--warning-bg)] hover:bg-[var(--warning-bg)] text-xs font-bold text-[var(--warning-text)]  disabled:opacity-90 cursor-pointer"
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
