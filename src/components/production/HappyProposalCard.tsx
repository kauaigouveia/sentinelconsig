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
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';

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
  const activeUser = StorageService.getActiveUser();
  const canSync = hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.sync') || hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
  const canEditProposal = hasPermission(activeUser?.role, activeUser?.customPermissions, 'proposals.update') || hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
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
          ? 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5 shadow-xs'
          : 'border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-4'
      } space-y-4 text-xs`}
    >
      {/* Header do Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[var(--danger-bg)] text-[var(--danger-text)] font-black text-xs flex items-center justify-center shadow-xs">
            HP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-sm">
                Esteira Digital Happy / BYX Capital
              </h4>
              {proposal.happySyncStatus === 'SYNCED' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]">
                  Sincronizado
                </span>
              ) : proposal.happyContractId ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]">
                  Vínculo Ativo
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]">
                  Sem Contrato
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Sincronização bidirecional via API REST & Webhooks em Tempo Real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEditProposal && <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
          >
            <LinkIcon className="h-3.5 w-3.5 text-[var(--danger-text)]" />
            <span>{proposal.happyContractId ? 'Alterar Contrato' : 'Vincular Contrato'}</span>
          </button>}

          {canSync && <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] text-[var(--danger-text)] font-bold text-xs flex items-center gap-1.5 disabled:opacity-90 transition-all  cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Consultar Happy'}</span>
          </button>}
        </div>
      </div>

      {/* Feedback Alert */}
      {syncFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between animate-in fade-in duration-150 ${
            syncFeedback.type === 'success'
              ? 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] border-[var(--success-border)] dark:border-[var(--success-border)] text-[var(--success-text)] dark:text-[var(--success-text)]'
              : syncFeedback.type === 'warning'
              ? 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border-[var(--warning-border)] dark:border-[var(--warning-border)] text-[var(--warning-text)] dark:text-[var(--warning-text)]'
              : syncFeedback.type === 'info'
              ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
              : 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border-[var(--danger-border)] dark:border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncFeedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] shrink-0" />
            ) : syncFeedback.type === 'warning' ? (
              <AlertTriangle className="h-4 w-4 text-[var(--warning-text)] shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-[var(--danger-text)] shrink-0" />
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
        <div className="p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] block">
            ID do Contrato Happy
          </span>
          <div className="font-mono font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            {proposal.happyContractId || (
              <span className="text-[var(--text-secondary)] font-normal italic">Não vinculado</span>
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] block">
            Status Retornado (Happy)
          </span>
          <div className="font-bold text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)] truncate">
            {proposal.happyStatusName || proposal.happyStatus || (
              <span className="text-[var(--text-secondary)] font-normal italic">Aguardando consulta</span>
            )}
          </div>
          {proposal.happyStatusCode !== undefined && (
            <span className="text-[10px] font-mono text-[var(--text-secondary)] block">
              Código: {proposal.happyStatusCode}
            </span>
          )}
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] block">
            Status de Portabilidade
          </span>
          <div className="font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            {proposal.happyPortabilityStatus || (
              <span className="text-[var(--text-secondary)] font-normal italic">Não aplicável</span>
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] block">
            Última Sincronização
          </span>
          <div className="font-medium text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            {formatDateTime(proposal.happyLastSyncAt)}
          </div>
        </div>
      </div>

      {/* Descrição detalhada do status retornado se houver */}
      {proposal.happyStatusDescription && (
        <div className="p-2.5 rounded-lg bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)] text-xs">
          <strong>Mensagem da Esteira Happy:</strong> {proposal.happyStatusDescription}
        </div>
      )}

      {/* Modal de Vinculação Manual */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-2xl max-w-md w-full p-5 space-y-4  animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-[var(--danger-text)]" />
                <h3 className="font-bold text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Vincular Contrato Happy / BYX
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)] text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveContractLink} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  ID do Contrato na Happy (contract_id)
                </label>
                <input
                  type="text"
                  value={linkContractId}
                  onChange={(e) => setLinkContractId(e.target.value)}
                  placeholder="Ex: 894123"
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-canvas)] font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                />
                <span className="text-[10px] text-[var(--text-secondary)]">
                  O identificador de contrato é utilizado para consultar o andamento na API e processar webhooks.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLinking}
                  className="px-4 py-1.5 rounded-lg bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] text-[var(--danger-text)] text-xs font-bold disabled:opacity-90 cursor-pointer shadow-xs"
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
