import React, { useState, useEffect, useRef } from 'react';
import { ParanaProposalSyncCard } from './ParanaProposalSyncCard';
import {
  X,
  Clock,
  User,
  Building,
  CreditCard,
  FileText,
  AlertCircle,
  CheckCircle2,
  Send,
  Link2,
  Calendar,
  Layers,
  Shield,
  MessageSquare,
  Trash2,
  Edit3,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Copy,
  Phone,
  Mail,
  Loader2,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatDate, formatCpf, extractPartnerCode, formatCurrency, parseCurrency } from '../../lib/utils';
import { Proposal, Status, PendencyType, PendencyPriority } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { StatusBadge } from '../ui/StatusBadge';
import { AuthorityBadge } from '../ui/AuthorityBadge';
import { toastService } from '../ui/toastService';
import { C6ProposalCard } from './C6ProposalCard';
import { FactaProposalCard } from './FactaProposalCard';
import { BmgProposalCard } from './BmgProposalCard';
import { HappyProposalCard } from './HappyProposalCard';
import { ProviderProposalSyncCard } from './ProviderProposalSyncCard';
import { proposalProviderVisibility } from '../../lib/proposalProviders';
import { hasPermission } from '../../lib/permissions';

interface ProposalDetailModalProps {
  proposalId: string | null;
  proposalIdsList?: string[];
  onSelectProposal?: (id: string) => void;
  onClose: () => void;
  onProposalUpdated: () => void;
}

interface ProposalPendencyItem {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  createdAt: string;
  assignedTo?: { name?: string } | null;
}

export const ProposalDetailModal: React.FC<ProposalDetailModalProps> = (props) => {
  const { proposalId } = props;
  if (!proposalId) return null;
  const initialProposal = StorageService.getProposalById(proposalId);
  if (!initialProposal) return null;

  return (
    <ProposalDetailModalContent
      key={proposalId}
      {...props}
      proposalId={proposalId}
      initialProposal={initialProposal}
    />
  );
};

const ProposalDetailModalContent: React.FC<
  Omit<ProposalDetailModalProps, 'proposalId'> & { proposalId: string; initialProposal: Proposal }
> = ({
  proposalId,
  proposalIdsList = [],
  onSelectProposal,
  onClose,
  onProposalUpdated,
  initialProposal,
}) => {
  const [liveProposal, setLiveProposal] = useState<Proposal | null>(initialProposal || null);

  useEffect(() => {
    const fresh = StorageService.getProposalById(proposalId);
    setLiveProposal(fresh || null);
  }, [proposalId]);

  const proposal = liveProposal || initialProposal;
  const activeUser = StorageService.getActiveUser();
  const canUpdateProposal = hasPermission(activeUser?.role, activeUser?.customPermissions, 'proposals.update');
  const canDeleteProposal = hasPermission(activeUser?.role, activeUser?.customPermissions, 'proposals.delete');
  const canViewPendencies = hasPermission(activeUser?.role, activeUser?.customPermissions, 'pendencies.view');
  const canCreatePendency = hasPermission(activeUser?.role, activeUser?.customPermissions, 'pendencies.create');
  const canResolvePendency = hasPermission(activeUser?.role, activeUser?.customPermissions, 'pendencies.resolve');
  const canDeletePendency = hasPermission(activeUser?.role, activeUser?.customPermissions, 'pendencies.delete');

  const allClients = StorageService.getClients();
  const matchedClient =
    allClients.find(c => c.id === proposal.clientId) ||
    (proposal.clientId ? allClients.find(c => c.id?.toLowerCase() === proposal.clientId?.toLowerCase()) : undefined) ||
    ((proposal as any).clientCpf ? allClients.find(c => c.cpf?.replace(/\D/g, '') === (proposal as any).clientCpf?.replace(/\D/g, '')) : undefined) ||
    ((proposal as any).client || null);

  const client = matchedClient;
  const clientFullName =
    matchedClient?.fullName ||
    matchedClient?.name ||
    (proposal as any).clientName ||
    (proposal as any).client?.fullName ||
    (proposal as any).client?.name ||
    'Cliente não informado';

  const clientCpf =
    matchedClient?.cpf ||
    (proposal as any).clientCpf ||
    (proposal as any).client?.cpf ||
    '';

  const product = StorageService.getProducts().find(p => p.id === proposal.productId || p.code === (proposal as any).productCode) || (proposal as any).product;
  const bank =
    StorageService.getBanks().find(
      b =>
        b.id === proposal.bankId ||
        b.code === proposal.bankId ||
        b.code === (proposal as any).bankCode ||
        (proposal as any).bank?.id === b.id ||
        (proposal as any).bank?.code === b.code ||
        b.id === `bank-${proposal.bankId?.toLowerCase()}`
    ) || (proposal as any).bank;
  const promoter = StorageService.getPromoters().find(p => p.id === proposal.promoterId) || (proposal as any).promoter;
  const partner = StorageService.getPartners().find(p => p.id === proposal.partnerId) || (proposal as any).partner;
  const digitizer = StorageService.getUsers().find(u => u.id === proposal.digitizerId);

  const bankCode = (bank?.code || '').toUpperCase();
  const bankName = (bank?.name || '').toUpperCase();

  const isC6Bank = !proposal.workbankSource && (bankCode === '336' || bankName.includes('C6'));

  const isFactaBank = !proposal.workbankSource && (bankCode === '149' || bankName.includes('FACTA'));
  const providerVisibility = proposalProviderVisibility(proposal, bank);
  const hasProviderIntegration = providerVisibility.finanto || providerVisibility.nossa;

  const isHappyBank =
    !proposal.workbankSource && (bankCode === 'HAPPY' ||
    bankName.includes('HAPPY') ||
    bankName.includes('BYX'));

  // Status reais sincronizados do PostgreSQL
  const [dbStatuses, setDbStatuses] = useState<any[]>([]);
  const [statusesLoading, setStatusesLoading] = useState<boolean>(true);
  const [statusesError, setStatusesError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const fetchOfficialStatuses = () => {
    setStatusesLoading(true);
    setStatusesError(null);
    fetch('/api/statuses', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!isMountedRef.current) return;
        if (Array.isArray(data) && data.length > 0) {
          setDbStatuses(data);
          setStatusesError(null);
        } else {
          setDbStatuses([]);
          setStatusesError('Não foi possível carregar os status oficiais. Atualize a página ou tente novamente.');
        }
      })
      .catch(err => {
        if (!isMountedRef.current) return;
        console.error('[ProposalDetailModal] Erro ao buscar status do PostgreSQL:', err);
        setDbStatuses([]);
        setStatusesError('Não foi possível carregar os status oficiais. Atualize a página ou tente novamente.');
      })
      .finally(() => {
        if (isMountedRef.current) {
          setStatusesLoading(false);
        }
      });
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchOfficialStatuses();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Catálogo estritamente oficial do PostgreSQL — NENHUM fallback para INITIAL_STATUSES / StorageService
  const allStatuses = dbStatuses;

  const currentStatus = allStatuses.find(s => s.id === proposal.statusId);

  // Navigation Index
  const currentIndex = proposalIdsList.indexOf(proposalId);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < proposalIdsList.length - 1;

  const handleGoPrevious = () => {
    if (hasPrevious && onSelectProposal) {
      onSelectProposal(proposalIdsList[currentIndex - 1]);
    }
  };

  const handleGoNext = () => {
    if (hasNext && onSelectProposal) {
      onSelectProposal(proposalIdsList[currentIndex + 1]);
    }
  };

  // Keyboard navigation Alt + Left / Alt + Right and ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handleGoPrevious();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handleGoNext();
      } else if (e.key === 'Escape' && !isInput) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, proposalIdsList, hasPrevious, hasNext, onSelectProposal, onClose]);

  // Related proposals of this client
  const otherClientProposals = StorageService.getProposalsByClientId(proposal.clientId).filter(
    p => p.id !== proposal.id
  );

  // Related Refin / Portability
  const relatedPort = proposal.relatedPortabilityId
    ? StorageService.getProposalById(proposal.relatedPortabilityId)
    : null;

  // Active tab in modal
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  useEffect(() => {
    if (proposalId) {
      setLoadingTimeline(true);
      fetch(`/api/proposals/${proposalId}/timeline`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          const items = Array.isArray(data) ? data : (data?.items || []);
          setTimeline(items);
          setLoadingTimeline(false);
        })
        .catch(err => {
          console.error('[ProposalDetailModal] Erro ao buscar timeline:', err);
          setTimeline([]);
          setLoadingTimeline(false);
        });
    }
  }, [proposalId]);

  const [activeTab, setActiveTab] = useState<'HISTORICO' | 'PENDENCIAS' | 'COMENTARIOS' | 'CLIENTE' | 'C6_BANK' | 'FACTA' | 'HAPPY' | 'INTEGRACOES'>('HISTORICO');

  // Status update form
  const [selectedStatusId, setSelectedStatusId] = useState(proposal.statusId);
  const [statusObservation, setStatusObservation] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState(false);

  // Sincronizar status selecionado com a proposta e a lista de status do PostgreSQL
  useEffect(() => {
    if (allStatuses.length > 0) {
      const match = allStatuses.find(s => s.id === proposal.statusId);
      if (match) {
        setSelectedStatusId(match.id);
      } else if (!selectedStatusId || !allStatuses.some(s => s.id === selectedStatusId)) {
        setSelectedStatusId(allStatuses[0].id);
      }
    } else {
      setSelectedStatusId('');
    }
    setStatusObservation('');
    setIsEditingFinancials(false);
    setEditDisbursedStr(proposal.disbursedValue !== undefined ? String(proposal.disbursedValue) : '');
    setEditBalanceStr(proposal.contractBalance !== undefined ? String(proposal.contractBalance) : '');
  }, [proposalId, proposal.statusId, dbStatuses]);

  // New Pendency Form
  const [pendencyType, setPendencyType] = useState<PendencyType>('DOCUMENTACAO');
  const [pendencyDesc, setPendencyDesc] = useState('');
  const [pendencyPriority, setPendencyPriority] = useState<PendencyPriority>('NORMAL');
  const [proposalPendencies, setProposalPendencies] = useState<ProposalPendencyItem[]>([]);
  const [isLoadingPendencies, setIsLoadingPendencies] = useState(false);
  const [isSavingPendency, setIsSavingPendency] = useState(false);

  const refreshProposalPendencies = async () => {
    if (!canViewPendencies) {
      setProposalPendencies([]);
      return;
    }
    setIsLoadingPendencies(true);
    try {
      const response = await fetch(`/api/pendencies?proposalId=${encodeURIComponent(proposalId)}&limit=100`, { credentials: 'include' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível carregar as pendências da proposta.');
      }
      const result = await response.json();
      setProposalPendencies(Array.isArray(result?.items) ? result.items : []);
    } catch (error) {
      console.error('[ProposalDetailModal] Erro ao carregar pendências:', error);
      toastService.error('Erro ao carregar pendências', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setIsLoadingPendencies(false);
    }
  };

  useEffect(() => {
    void refreshProposalPendencies();
  }, [proposalId, canViewPendencies]);

  // New Comment Form
  const [commentText, setCommentText] = useState('');

  // Financial values editing
  const [isEditingFinancials, setIsEditingFinancials] = useState(false);
  const [editDisbursedStr, setEditDisbursedStr] = useState(
    proposal.disbursedValue !== undefined ? String(proposal.disbursedValue) : ''
  );
  const [editBalanceStr, setEditBalanceStr] = useState(
    proposal.contractBalance !== undefined ? String(proposal.contractBalance) : ''
  );
  const [financialsSuccess, setFinancialsSuccess] = useState(false);
  const [financialsSaving, setFinancialsSaving] = useState(false);

  const handleSaveFinancials = async () => {
    if (financialsSaving) return;
    const parsedDisbursed = editDisbursedStr.trim() ? parseCurrency(editDisbursedStr) : undefined;
    const parsedBalance = editBalanceStr.trim() ? parseCurrency(editBalanceStr) : undefined;

    setFinancialsSaving(true);
    try {
      await StorageService.updateProposalAsync(proposal.id, {
        disbursedValue: parsedDisbursed,
        contractBalance: parsedBalance,
      }, 'Atualização de valores financeiros');

      setFinancialsSuccess(true);
      toastService.success('Valores Atualizados', 'Informações financeiras registradas com sucesso.');
      setTimeout(() => {
        setFinancialsSuccess(false);
        setIsEditingFinancials(false);
        onProposalUpdated();
      }, 800);
    } catch (err: any) {
      toastService.error('Erro ao Atualizar', err.message || 'Erro ao atualizar valores da proposta.');
    } finally {
      setFinancialsSaving(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (statusesLoading || allStatuses.length === 0 || !selectedStatusId) {
      toastService.error('Operação Bloqueada', 'Catálogo oficial de status indisponível. Aguarde o carregamento ou tente novamente.');
      return;
    }
    if (selectedStatusId.startsWith('st-')) {
      toastService.error('Status Inválido', 'Status legado não permitido. Recarregue os status oficiais.');
      return;
    }
    if (selectedStatusId === proposal.statusId && !statusObservation) return;
    setStatusUpdating(true);
    try {
      const targetStatus = allStatuses.find(s => s.id === selectedStatusId);
      await StorageService.updateProposalAsync(proposal.id, {
        statusId: selectedStatusId,
      }, statusObservation || `Status alterado para ${targetStatus?.name || 'novo status'}`);

      setStatusSuccess(true);
      setStatusObservation('');
      toastService.success('Status Atualizado', `Status alterado para ${targetStatus?.name || 'novo status'}.`);

      // Refresh timeline de forma desacoplada
      fetch(`/api/proposals/${proposal.id}/timeline`)
        .then(r => r.json())
        .then(d => {
          const items = Array.isArray(d) ? d : (d?.items || []);
          setTimeline(items);
        })
        .catch(err => {
          console.warn('[ProposalDetailModal] Erro secundário ao atualizar timeline pós-status:', err);
        });

      setTimeout(() => {
        setStatusSuccess(false);
        setStatusUpdating(false);
        onProposalUpdated();
      }, 1000);
    } catch (err: any) {
      setStatusUpdating(false);
      toastService.error('Erro de Status', err.message || 'Erro ao atualizar status da proposta.');
    }
  };

  const handleAddPendency = async () => {
    if (!pendencyDesc.trim() || isSavingPendency) return;
    setIsSavingPendency(true);
    try {
      const priority = pendencyPriority === 'URGENTE' ? 'URGENT' : pendencyPriority === 'ALTA' ? 'HIGH' : 'MEDIUM';
      const response = await fetch('/api/pendencies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          title: `${pendencyType}: ${pendencyDesc.trim()}`,
          description: pendencyDesc.trim(),
          type: pendencyType,
          priority,
          source: 'MANUAL',
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível registrar a pendência.');
      }
      setPendencyDesc('');
      await refreshProposalPendencies();
      window.dispatchEvent(new Event('credit_gestao_storage_update'));
      toastService.success('Pendência Aberta', 'Pendência salva e disponível na Central de Pendências.');
      onProposalUpdated();
    } catch (error) {
      toastService.error('Erro ao abrir pendência', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setIsSavingPendency(false);
    }
  };

  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    itemType: string;
    itemName: string;
    description?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    itemType: '',
    itemName: '',
    onConfirm: () => {},
  });

  const handleResolvePendency = async (pendencyId: string) => {
    try {
      const response = await fetch(`/api/pendencies/${encodeURIComponent(pendencyId)}/resolve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: 'Resolvido pelo operador da proposta.' }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível resolver a pendência.');
      }
      await refreshProposalPendencies();
      window.dispatchEvent(new Event('credit_gestao_storage_update'));
      toastService.success('Pendência Resolvida', 'Status atualizado na Central de Pendências.');
      onProposalUpdated();
    } catch (error) {
      toastService.error('Erro ao resolver pendência', error instanceof Error ? error.message : 'Tente novamente.');
    }
  };

  const handleDeletePendency = (pen: { id: string; type: string; title?: string; description?: string | null }) => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Pendência Operacional',
      itemName: `${pen.type}: ${pen.description || pen.title || 'Pendência'}`,
      description: 'A pendência será removida da proposta definitivamente.',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/pendencies/${encodeURIComponent(pen.id)}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Não foi possível excluir a pendência.');
          }
          setDeleteModalConfig(prev => ({ ...prev, isOpen: false }));
          await refreshProposalPendencies();
          window.dispatchEvent(new Event('credit_gestao_storage_update'));
          toastService.success('Pendência Removida', 'Pendência excluída da Central de Pendências.');
          onProposalUpdated();
        } catch (error) {
          toastService.error('Erro ao Excluir', error instanceof Error ? error.message : 'Erro ao excluir pendência.');
        }
      },
    });
  };

  const handleDeleteProposal = () => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Proposta de Crédito',
      itemName: `ADE ${proposal.proposalNumber}`,
      description: 'A exclusão removerá o registro e todos os históricos, pendências e comentários vinculados.',
      onConfirm: async () => {
        try {
          await StorageService.deleteProposal(proposal.id);
          toastService.success('Proposta Excluída', `ADE ${proposal.proposalNumber} removida com sucesso.`);
          onProposalUpdated();
          onClose();
        } catch (err: any) {
          toastService.error('Erro ao Excluir', err.message || 'Erro ao excluir proposta.');
        }
      },
    });
  };

  const handleAddComment = async () => {
    const textToSubmit = commentText.trim();
    if (!textToSubmit) return;

    // 1. Gravar comentário no PostgreSQL (Operação Primária)
    let commentSaved = false;
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSubmit })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Erro ao salvar comentário no servidor.');
      }
      commentSaved = true;
      setCommentText('');
      toastService.success('Comentário Gravado');
      onProposalUpdated();
    } catch (err: any) {
      toastService.error('Erro ao Salvar Comentário', err.message || 'Erro ao salvar comentário.');
      return;
    }

    // 2. Atualizar timeline (Operação Secundária Desacoplada)
    if (commentSaved) {
      try {
        const timelineRes = await fetch(`/api/proposals/${proposal.id}/timeline`);
        if (timelineRes.ok) {
          const fresh = await timelineRes.json();
          const items = Array.isArray(fresh) ? fresh : (fresh?.items || []);
          setTimeline(items);
        } else {
          console.warn('[ProposalDetailModal] Falha secundária ao sincronizar timeline pós-comentário:', timelineRes.status);
        }
      } catch (timelineErr) {
        console.warn('[ProposalDetailModal] Erro secundário ao buscar timeline pós-comentário:', timelineErr);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-5xl rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  flex flex-col max-h-[92vh] border border-[var(--field-border)] dark:border-[var(--field-border)] overflow-hidden">
        {/* Header with Navigation and Copy Buttons */}
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] px-5 py-3.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center text-[var(--text-primary)] font-bold shrink-0 shadow-xs"
              style={{ backgroundColor: currentStatus?.color || "var(--bg-surface)" }}
            >
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-mono tracking-tight">
                    ADE {proposal.proposalNumber}
                  </h2>
                  <button
                    onClick={() => toastService.copyToClipboard(proposal.proposalNumber, 'ADE')}
                    title="Copiar número da ADE"
                    aria-label="Copiar número da ADE"
                    className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <StatusBadge status={currentStatus} />
                <AuthorityBadge responsible={proposal?.currentResponsible || currentStatus?.responsibleGroup || currentStatus?.responsible} />
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] truncate mt-0.5">
                <span>Cliente:</span>
                <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate font-semibold">
                  {clientFullName}
                </strong>
                {clientCpf && (
                  <button
                    onClick={() => toastService.copyToClipboard(clientCpf, 'CPF')}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[var(--link)] dark:text-[var(--link)] hover:underline cursor-pointer"
                    title="Clique para copiar CPF"
                  >
                    <span>({formatCpf(clientCpf)})</span>
                    <Copy className="h-3 w-3 inline" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Sequential Proposals Navigator */}
            {proposalIdsList.length > 1 && onSelectProposal && (
              <div className="flex items-center rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-0.5 shadow-2xs">
                <button
                  onClick={handleGoPrevious}
                  disabled={!hasPrevious}
                  title="Proposta Anterior (Alt + ←)"
                  aria-label="Proposta Anterior"
                  className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] disabled:opacity-90 disabled:hover:bg-transparent transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline text-[11px]">Anterior</span>
                </button>
                <div className="px-1.5 text-[10.5px] font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                  {currentIndex + 1}/{proposalIdsList.length}
                </div>
                <button
                  onClick={handleGoNext}
                  disabled={!hasNext}
                  title="Próxima Proposta (Alt + →)"
                  aria-label="Próxima Proposta"
                  className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] disabled:opacity-90 disabled:hover:bg-transparent transition-colors cursor-pointer"
                >
                  <span className="hidden sm:inline text-[11px]">Próxima</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              aria-label="Fechar Detalhes da Proposta"
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Quick Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-3 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Produto</span>
            <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{product?.name || '—'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Banco × Promotora</span>
            <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate block">
              {bank?.name || '—'} / {promoter?.name || '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Parceiro</span>
            <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate block">
              {partner?.login || '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Digitador / Cadastro</span>
            <span className="font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate block">
              {digitizer?.name || 'Operador'} • {formatDate(proposal.createdAt)}
            </span>
          </div>
        </div>

        {/* Financial Information Bar */}
        <div className="px-6 py-2.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Valor Liberado Cliente:
              </span>
              <span className="font-mono font-bold text-xs text-[var(--success-text)] dark:text-[var(--success-text)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] px-2 py-0.5 rounded border border-[var(--success-border)] dark:border-[var(--success-border)]">
                {proposal.disbursedValue !== undefined ? formatCurrency(proposal.disbursedValue) : 'Não informado'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Saldo Contrato (Portabilidade):
              </span>
              <span className="font-mono font-bold text-xs text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] px-2 py-0.5 rounded border border-[var(--field-border)] dark:border-[var(--field-border)]">
                {proposal.contractBalance !== undefined ? formatCurrency(proposal.contractBalance) : 'Não informado'}
              </span>
            </div>
          </div>

          {canUpdateProposal && <button
            onClick={() => setIsEditingFinancials(prev => !prev)}
            className="flex items-center gap-1 text-[11px] font-bold text-[var(--link)] dark:text-[var(--link)] hover:text-[var(--link)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] hover:border-[var(--field-border)] px-2.5 py-1 rounded-md transition-colors cursor-pointer"
          >
            <Edit3 className="h-3 w-3" />
            <span>{isEditingFinancials ? 'Cancelar Edição' : 'Ajustar Valores'}</span>
          </button>}
        </div>

        {/* Financial Inline Form */}
        {canUpdateProposal && isEditingFinancials && (
          <div className="px-6 py-3 bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex flex-wrap items-end gap-3 text-xs animate-in fade-in duration-100">
            <div>
              <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                Valor Liberado para Cliente (R$)
              </label>
              <input
                type="text"
                value={editDisbursedStr}
                onChange={e => setEditDisbursedStr(e.target.value)}
                placeholder="Ex: 1.250,00"
                className="w-36 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                Saldo do Contrato / Quitação (R$)
              </label>
              <input
                type="text"
                value={editBalanceStr}
                onChange={e => setEditBalanceStr(e.target.value)}
                placeholder="Ex: 15.420,00"
                className="w-36 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
              />
            </div>
            <button
              onClick={handleSaveFinancials}
              disabled={financialsSaving}
              aria-busy={financialsSaving}
              className="rounded-lg bg-[var(--success-bg)] hover:bg-[var(--success-bg)] disabled:opacity-90 disabled:cursor-wait px-3.5 py-1.5 text-xs font-bold text-[var(--success-text)]  flex items-center gap-1.5 cursor-pointer"
            >
              {financialsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              <span>{financialsSaving ? 'Salvando...' : 'Salvar Valores'}</span>
            </button>
            {financialsSuccess && (
              <span className="text-[var(--success-text)] dark:text-[var(--success-text)] font-bold text-xs py-1">
                Valores atualizados com sucesso!
              </span>
            )}
          </div>
        )}

        {/* Related Portability Banner if exists */}
        {relatedPort && (
          <div className="px-6 py-2 bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between text-xs text-[var(--link)] dark:text-[var(--link)]">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
              <span>
                Esta proposta é um <strong>REFIN DA PORTABILIDADE</strong> vinculado à Portabilidade ADE: <strong>{relatedPort.proposalNumber}</strong>
              </span>
            </div>
            <span className="bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] font-bold px-2 py-0.5 rounded text-[10px]">
              VÍNCULO ATIVO
            </span>
          </div>
        )}

        {/* Status Update Action Bar */}
        {canUpdateProposal ? <div className="px-6 py-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1.5">
            Alterar Status da Proposta
          </label>

          {statusesLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-[var(--field-border)] border-r-transparent"></span>
              <span>Carregando status disponíveis...</span>
            </div>
          ) : statusesError || allStatuses.length === 0 ? (
            <div className="flex items-center justify-between rounded-lg bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] px-3 py-2 text-xs text-[var(--warning-text)] dark:text-[var(--warning-text)]">
              <span>{statusesError || 'Não foi possível carregar os status oficiais. Atualize a página ou tente novamente.'}</span>
              <button
                type="button"
                onClick={fetchOfficialStatuses}
                className="underline hover:text-[var(--warning-text)] dark:hover:text-[var(--warning-text)] font-semibold ml-3 cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedStatusId}
                onChange={e => setSelectedStatusId(e.target.value)}
                disabled={statusesLoading || allStatuses.length === 0 || statusUpdating}
                className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden disabled:opacity-90 disabled:cursor-not-allowed"
              >
                {allStatuses.map(s => {
                  const badge = s.responsible
                    ? `(${s.responsible})`
                    : (s.standardCategory ? `(${s.standardCategory})` : '');
                  return (
                    <option key={s.id} value={s.id} disabled={!s.manualChangeAllowed && s.id !== proposal.statusId}>
                      {s.name} {badge}{!s.manualChangeAllowed && s.id !== proposal.statusId ? ' (Automático)' : ''}
                    </option>
                  );
                })}
              </select>

              <input
                type="text"
                value={statusObservation}
                onChange={e => setStatusObservation(e.target.value)}
                placeholder="Motivo / Observação da alteração..."
                disabled={statusesLoading || allStatuses.length === 0 || statusUpdating}
                className="flex-1 min-w-[200px] rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] focus:outline-hidden disabled:opacity-90"
              />

              <button
                onClick={handleUpdateStatus}
                disabled={statusesLoading || allStatuses.length === 0 || statusUpdating || !selectedStatusId || (selectedStatusId === proposal.statusId && !statusObservation)}
                className="rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] px-4 py-1.5 text-xs font-bold text-[var(--action-ink)] transition-colors flex items-center gap-1.5  cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{statusUpdating ? 'Gravando...' : 'Gravar Novo Status'}</span>
              </button>
            </div>
          )}
          {statusSuccess && (
            <p className="text-[11px] text-[var(--success-text)] dark:text-[var(--success-text)] font-semibold mt-1">
              Status atualizado com sucesso e registrado na linha do tempo!
            </p>
          )}
        </div> : <div className="px-6 py-3 bg-[var(--bg-canvas)] text-xs text-[var(--text-secondary)] dark:bg-[var(--bg-canvas)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">Seu perfil pode consultar a proposta, mas não possui permissão para alterar status ou valores.</div>}

        {proposal.workbankSource && <div className="px-6 py-3 text-sm border-b border-[var(--field-border)] bg-[var(--info-bg)]">Origem: WorkBank. Atualize pelo período na aba WorkBank da promotora vinculada. As APIs diretas dos bancos não são utilizadas nesta proposta.</div>}
        {!proposal.workbankSource && !proposal.finantoSimulationId && !proposal.nossaFintechDebtKey && (bankCode === '254' || /PARAN[AÁ]/.test(bankName)) && <ParanaProposalSyncCard key={proposal.id} proposalId={proposal.id} onUpdated={onProposalUpdated} />}
        {/* Integração C6 Bank Status Bar */}
        {isC6Bank && (
          <div className="px-6 py-2.5 bg-[var(--bg-surface)] text-[var(--text-primary)] dark:bg-[var(--bg-canvas)] border-b border-[var(--field-border)] flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--warning-bg)] animate-pulse"></span>
                <span className="font-bold uppercase tracking-wider text-[10.5px] text-[var(--warning-text)]">C6 Bank</span>
              </div>
              <div className="flex items-center gap-1 text-[var(--text-primary)] text-[11px]">
                <span className="text-[var(--text-secondary)]">Nº C6:</span>
                <span className="font-mono font-bold text-[var(--text-primary)] bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 rounded border border-[var(--field-border)]">
                  {proposal.c6ProposalNumber || 'Não vinculado'}
                </span>
              </div>
              {proposal.c6RawSituation && (
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-[var(--text-secondary)]">Situação:</span>
                  <span className="font-semibold text-[var(--success-text)]">{proposal.c6RawSituation}</span>
                </div>
              )}
              {proposal.c6CurrentActivity && (
                <div className="flex items-center gap-1 text-[11px] text-[var(--text-primary)]">
                  <span className="text-[var(--text-secondary)]">Atividade:</span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {proposal.c6CurrentActivity} {proposal.c6ActivityDescription ? `— ${proposal.c6ActivityDescription}` : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('C6_BANK')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'C6_BANK'
                    ? 'bg-[var(--warning-bg)] text-[var(--text-secondary)] shadow-xs'
                    : 'bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--warning-text)] border border-[var(--warning-border)]'
                }`}
              >
                <span>Ver Esteira C6 Completa</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Integração FACTA Status Bar */}
        {isFactaBank && (
          <div className="px-6 py-2.5     text-[var(--text-primary)] border-b border-[var(--warning-border)] flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--warning-bg)] animate-pulse"></span>
                <span className="font-bold uppercase tracking-wider text-[10.5px] text-[var(--warning-text)]">FACTA Financeira</span>
              </div>
              {proposal.factaAfCode && (
                <div className="flex items-center gap-1 text-[var(--text-primary)] text-[11px]">
                  <span className="text-[var(--text-secondary)]">Código AF:</span>
                  <span className="font-mono font-bold text-[var(--text-primary)] bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 rounded border border-[var(--field-border)]">
                    {proposal.factaAfCode}
                  </span>
                </div>
              )}
              {proposal.factaProposalNumber && (
                <div className="flex items-center gap-1 text-[var(--text-primary)] text-[11px]">
                  <span className="text-[var(--text-secondary)]">Nº FACTA:</span>
                  <span className="font-mono font-bold text-[var(--text-primary)] bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 rounded border border-[var(--field-border)]">
                    {proposal.factaProposalNumber}
                  </span>
                </div>
              )}
              {proposal.factaRawStatus && (
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-[var(--text-secondary)]">Status:</span>
                  <span className="font-semibold text-[var(--warning-text)]">{proposal.factaRawStatus}</span>
                </div>
              )}
              {proposal.factaCrivoStatus && (
                <div className="flex items-center gap-1 text-[11px] text-[var(--text-primary)]">
                  <span className="text-[var(--text-secondary)]">Crivo:</span>
                  <span className="font-medium text-[var(--text-primary)]">{proposal.factaCrivoStatus}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('FACTA')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'FACTA'
                    ? 'bg-[var(--warning-bg)] text-[var(--text-primary)] shadow-xs'
                    : 'bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--warning-text)] border border-[var(--warning-border)]'
                }`}
              >
                <span>Ver Esteira FACTA Completa</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Integração Happy / BYX Capital Status Bar */}
        {isHappyBank && (
          <div className="px-6 py-2.5     text-[var(--text-primary)] border-b border-[var(--danger-border)] flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--danger-bg)] animate-pulse"></span>
                <span className="font-bold uppercase tracking-wider text-[10.5px] text-[var(--danger-text)]">Happy / BYX Capital</span>
              </div>
              {proposal.happyContractId && (
                <div className="flex items-center gap-1 text-[var(--text-primary)] text-[11px]">
                  <span className="text-[var(--text-secondary)]">Contrato:</span>
                  <span className="font-mono font-bold text-[var(--text-primary)] bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 rounded border border-[var(--field-border)]">
                    {proposal.happyContractId}
                  </span>
                </div>
              )}
              {proposal.happyStatusName && (
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-[var(--text-secondary)]">Status Happy:</span>
                  <span className="font-semibold text-[var(--danger-text)]">{proposal.happyStatusName}</span>
                </div>
              )}
              {proposal.happyLastSyncAt && (
                <div className="flex items-center gap-1 text-[11px] text-[var(--text-primary)]">
                  <span className="text-[var(--text-secondary)]">Última Sync:</span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {new Date(proposal.happyLastSyncAt).toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('HAPPY')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'HAPPY'
                    ? 'bg-[var(--danger-bg)] text-[var(--text-primary)] shadow-xs'
                    : 'bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--danger-text)] border border-[var(--danger-border)]'
                }`}
              >
                <span>Ver Esteira Happy Completa</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--field-border)] dark:border-[var(--field-border)] px-6 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] shrink-0">
          <button
            onClick={() => setActiveTab('HISTORICO')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'HISTORICO'
                ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Linha do Tempo / Histórico ({timeline.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('PENDENCIAS')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'PENDENCIAS'
                ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Pendências ({proposalPendencies.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('COMENTARIOS')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'COMENTARIOS'
                ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Comentários ({timeline.filter(t => t.type === 'COMMENT').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('CLIENTE')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'CLIENTE'
                ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            <span>Cliente 360 ({otherClientProposals.length} outras)</span>
          </button>

          {hasProviderIntegration && <button
            onClick={() => setActiveTab('INTEGRACOES')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'INTEGRACOES'
                ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>{providerVisibility.finanto && providerVisibility.nossa ? 'APIs FINANTO / Nossa Fintech' : providerVisibility.finanto ? 'API FINANTO' : 'API Nossa Fintech'}</span>
          </button>}

          {isC6Bank && (
            <button
              onClick={() => setActiveTab('C6_BANK')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'C6_BANK'
                  ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
              }`}
            >
              <div className="h-3.5 w-3.5 rounded-xs bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center font-black text-[8px] leading-none">
                C6
              </div>
              <span>Esteira C6 Bank</span>
            </button>
          )}

          {isFactaBank && (
            <button
              onClick={() => setActiveTab('FACTA')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'FACTA'
                  ? 'border-[var(--warning-border)] text-[var(--warning-text)] dark:text-[var(--warning-text)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
              }`}
            >
              <div className="h-3.5 w-3.5 rounded-xs bg-[var(--warning-bg)] text-[var(--warning-text)] flex items-center justify-center font-black text-[7px] leading-none">
                FAC
              </div>
              <span>Esteira FACTA</span>
            </button>
          )}

          {isHappyBank && (
            <button
              onClick={() => setActiveTab('HAPPY')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'HAPPY'
                  ? 'border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
              }`}
            >
              <div className="h-3.5 w-3.5 rounded-xs bg-[var(--danger-bg)] text-[var(--danger-text)] flex items-center justify-center font-black text-[7px] leading-none">
                HP
              </div>
              <span>Esteira Happy</span>
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] min-h-[360px]">
          {bankCode === '318' && <BmgProposalCard key={proposal.id} proposalId={proposal.id} proposalNumber={proposal.proposalNumber} />}
          {/* TAB 1: HISTÓRICO */}
          {activeTab === 'HISTORICO' && (
            <div className="space-y-4">
                            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--bg-surface-elevated)] dark:before:bg-[var(--bg-surface-elevated)]">
                {timeline
                  .map((t, i) => {
                    const isStatus = t.type === 'STATUS';
                    const isComment = t.type === 'COMMENT';
                    const isTask = t.type === 'TASK';
                    const isNotification = t.type === 'NOTIFICATION';

                    if (isStatus) {
                      const h = t.data;
                      const toSt = allStatuses.find(s => s.name === h.newStatusName);
                      return (
                        <div key={h.id || i} className="relative group">
                          <div
                            className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--field-border)] dark:border-[var(--field-border)] shadow-xs"
                            style={{ backgroundColor: toSt?.color || "var(--bg-surface)" }}
                          />
                          <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] p-3.5 text-xs shadow-2xs">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                              <div className="flex items-center gap-2">
                                {h.previousStatusName && (
                                  <>
                                    <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                                      {h.previousStatusName}
                                    </span>
                                    <span className="text-[var(--text-secondary)]">→</span>
                                  </>
                                )}
                                <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                                  {h.newStatusName || 'Status Inicial'}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                                {formatDate(h.createdAt)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                              <span>Operador: <strong>{h.user?.name || h.userName || 'Sistema'}</strong> ({h.origin || 'N/A'})</span>
                              {h.observation && (
                                <span className="italic text-[var(--text-secondary)] dark:text-[var(--text-primary)]">"{h.observation}"</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    } else if (isComment) {
                      const c = t.data;
                      return (
                        <div key={c.id || i} className="relative group">
                          <div
                            className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--field-border)] dark:border-[var(--field-border)]  bg-[var(--success-bg)]"
                          />
                          <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] p-3 text-xs">
                            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">
                              <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Comentário: {c.author?.name || c.userName || 'Sistema'}</span>
                              <span className="font-mono text-[10px]">{formatDate(c.createdAt)}</span>
                            </div>
                            <p className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-relaxed">{c.content || c.comment}</p>
                          </div>
                        </div>
                      );
                    } else if (isTask) {
                      const tk = t.data;
                      return (
                        <div key={tk.id || i} className="relative group">
                          <div
                            className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--field-border)] dark:border-[var(--field-border)]  bg-[var(--warning-bg)]"
                          />
                          <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] p-3 text-xs">
                            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">
                              <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Tarefa: {tk.title}</span>
                              <span className="font-mono text-[10px]">{formatDate(tk.createdAt)}</span>
                            </div>
                            <p className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-relaxed">{tk.description}</p>
                          </div>
                        </div>
                      );
                    } else {
                      return null; // Notifications can be skipped or added if needed
                    }
                  })}
              </div>
            </div>
          )}

          {/* TAB 2: PENDÊNCIAS */}
          {activeTab === 'PENDENCIAS' && (
            <div className="space-y-4">
              {!canViewPendencies && (
                <p className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)] dark:border-[var(--warning-border)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]">
                  Seu perfil não possui permissão para consultar as pendências desta proposta.
                </p>
              )}
              {canCreatePendency && (
              <div className="p-4 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] space-y-3">
                <h4 className="text-xs font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Cadastrar Nova Pendência
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <select
                    value={pendencyType}
                    onChange={e => setPendencyType(e.target.value as PendencyType)}
                    className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                  >
                    <option value="DOCUMENTACAO">Documentação Incompleta</option>
                    <option value="BANCO">Banco / Formalização</option>
                    <option value="PARCEIRO">Parceiro / Corban</option>
                    <option value="CLIENTE">Cliente</option>
                    <option value="CIP">CIP / Retorno de Saldo</option>
                    <option value="OUTROS">Outros Motivos</option>
                  </select>

                  <select
                    value={pendencyPriority}
                    onChange={e => setPendencyPriority(e.target.value as PendencyPriority)}
                    className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                  >
                    <option value="NORMAL">Prioridade Normal</option>
                    <option value="ALTA">Prioridade Alta</option>
                    <option value="URGENTE">Prioridade Urgente</option>
                  </select>

                  <button
                    onClick={handleAddPendency}
                    disabled={isSavingPendency || !pendencyDesc.trim()}
                    className="rounded-lg bg-[var(--warning-bg)] hover:bg-[var(--warning-bg)] text-[var(--warning-text)] font-bold text-xs py-1.5 px-3 flex items-center justify-center gap-1.5  cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{isSavingPendency ? 'Salvando...' : 'Adicionar Pendência'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={pendencyDesc}
                  onChange={e => setPendencyDesc(e.target.value)}
                  placeholder="Descreva a pendência com detalhes operacionais..."
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                />
              </div>
              )}

              <div className="space-y-2">
                {isLoadingPendencies ? (
                  <p className="text-xs text-[var(--text-secondary)] italic text-center py-6">Carregando pendências...</p>
                ) : proposalPendencies.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] italic text-center py-6">
                    Nenhuma pendência ativa nesta proposta.
                  </p>
                ) : (
                  proposalPendencies.map(pen => (
                    <div
                      key={pen.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border text-xs ${
                        pen.status === 'RESOLVIDA'
                          ? 'bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] border-[var(--field-border)] dark:border-[var(--field-border)] opacity-70'
                          : 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border-[var(--warning-border)] dark:border-[var(--warning-border)]'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{pen.type}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              pen.status === 'RESOLVIDA'
                                ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                                : 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]'
                            }`}
                          >
                            {pen.status}
                          </span>
                        </div>
                        <p className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{pen.description || pen.title}</p>
                        <span className="text-[10px] text-[var(--text-secondary)] block">
                          Aberta em {formatDate(pen.createdAt)} • Responsável: {pen.assignedTo?.name || 'Não atribuído'} • Prioridade: {pen.priority}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {canResolvePendency && ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'].includes(pen.status) && (
                          <button
                            onClick={() => handleResolvePendency(pen.id)}
                            className="px-2.5 py-1 rounded bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] font-bold text-xs flex items-center gap-1  cursor-pointer"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Resolver</span>
                          </button>
                        )}
                        {canDeletePendency && <button
                          onClick={() => handleDeletePendency(pen)}
                          className="p-1 text-[var(--text-secondary)] hover:text-[var(--danger-text)] transition-colors"
                          title="Excluir pendência"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COMENTÁRIOS */}
          {activeTab === 'COMENTARIOS' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Escreva um comentário interno (visível para a equipe)..."
                  className="flex-1 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)]"
                />
                <button
                  onClick={handleAddComment}
                  className="rounded-lg bg-[var(--action)] px-4 py-2 text-xs font-bold text-[var(--action-ink)] hover:bg-[var(--action-hover)] flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar</span>
                </button>
              </div>

              <div className="space-y-2">
                                {timeline.filter(t => t.type === 'COMMENT').length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] italic text-center py-6">
                    Nenhum comentário registrado ainda.
                  </p>
                ) : (
                  timeline.filter(t => t.type === 'COMMENT').map((t, i) => {
                    const c = t.data;
                    return (
                    <div
                      key={c.id || i}
                      className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">
                        <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{c.author?.name || c.userName || 'Usuário'}</span>
                        <span className="font-mono text-[10px]">{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-relaxed">{c.content || c.comment}</p>
                    </div>
                  )})
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CLIENTE 360 */}
          {activeTab === 'CLIENTE' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] p-4 text-xs">
                <h4 className="text-xs font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-2">
                  Dados do Cliente
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[var(--text-secondary)] block text-[10.5px]">Nome Completo:</span>
                    <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{clientFullName}</strong>
                  </div>
                  <div>
                    <span className="text-[var(--text-secondary)] block text-[10.5px]">CPF:</span>
                    {clientCpf ? (
                      <button
                        onClick={() => toastService.copyToClipboard(clientCpf, 'CPF')}
                        className="text-left font-mono font-bold text-[var(--link)] dark:text-[var(--link)] hover:underline flex items-center gap-1 cursor-pointer"
                        title="Copiar CPF"
                      >
                        <span>{formatCpf(clientCpf)}</span>
                        <Copy className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="text-[var(--text-secondary)]">—</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[var(--text-secondary)] block text-[10.5px]">Telefone:</span>
                    <span className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{client?.phone || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-secondary)] block text-[10.5px]">E-mail:</span>
                    <span className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate block">
                      {client?.email || 'Não informado'}
                    </span>
                  </div>
                </div>
              </div>

              <h4 className="text-xs font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Demais Propostas Cadastradas para este CPF ({otherClientProposals.length})
              </h4>

              {otherClientProposals.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] italic">
                  Este cliente possui apenas esta proposta cadastrada.
                </p>
              ) : (
                <div className="space-y-2">
                  {otherClientProposals.map(p => {
                    const st = StorageService.getStatusById(p.statusId);
                    const prod = StorageService.getProducts().find(pr => pr.id === p.productId);
                    const bk = StorageService.getBanks().find(b => b.id === p.bankId);
                    const pt = StorageService.getPartners().find(pt => pt.id === p.partnerId);

                    return (
                      <div
                        key={p.id}
                        onClick={() => onSelectProposal && onSelectProposal(p.id)}
                        className="flex items-center justify-between rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-3 text-xs  hover:border-[var(--field-border)] transition-colors cursor-pointer"
                      >
                        <div>
                          <div className="flex items-center gap-2 font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            <span>ADE {p.proposalNumber}</span>
                            <span className="font-sans text-[11px] font-semibold text-[var(--link)] dark:text-[var(--link)]">
                              • {prod?.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                            Banco: {bk?.name} | Parceiro: {pt?.login}
                          </p>
                        </div>

                        <span
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-primary)] shadow-2xs"
                          style={{ backgroundColor: st?.color || "var(--bg-surface)" }}
                        >
                          {st?.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ESTEIRA C6 BANK */}
          {activeTab === 'C6_BANK' && isC6Bank && (
            <div className="space-y-4">
              <C6ProposalCard
                proposal={proposal}
                standalone
                onProposalUpdated={(updated) => {
                  setLiveProposal(updated);
                  if (updated.statusId && updated.statusId !== proposal.statusId) {
                    try {
                      StorageService.updateProposalStatus(
                        updated.id,
                        updated.statusId,
                        `Sincronização C6 Bank: Situação "${updated.c6RawSituation || ''}" - Atividade "${updated.c6ActivityDescription || ''}"`,
                        undefined,
                        'SISTEMA',
                        false
                      );
                    } catch (e) {
                      console.warn('[C6 SYNC] Status local não alterado:', e);
                    }
                  }
                  StorageService.updateProposal(updated.id, updated, 'Consulta C6 Bank', false);
                  if (onProposalUpdated) onProposalUpdated();
                }}
              />
            </div>
          )}

          {/* TAB 6: ESTEIRA FACTA */}
          {activeTab === 'FACTA' && isFactaBank && (
            <div className="space-y-4">
              <FactaProposalCard
                proposal={proposal}
                standalone
                onProposalUpdated={(updated) => {
                  setLiveProposal(updated);
                  if (updated.statusId && updated.statusId !== proposal.statusId) {
                    try {
                      StorageService.updateProposalStatus(
                        updated.id,
                        updated.statusId,
                        `Sincronização FACTA: Status "${updated.factaRawStatus || ''}" - Crivo "${updated.factaCrivoStatus || ''}"`,
                        undefined,
                        'SISTEMA',
                        false
                      );
                    } catch (e) {
                      console.warn('[FACTA SYNC] Status local não alterado:', e);
                    }
                  }
                  StorageService.updateProposal(updated.id, updated, 'Consulta FACTA Financeira', false);
                  if (onProposalUpdated) onProposalUpdated();
                }}
              />
            </div>
          )}

          {/* TAB 7: ESTEIRA HAPPY */}
          {activeTab === 'HAPPY' && isHappyBank && (
            <div className="space-y-4">
              <HappyProposalCard
                proposal={proposal}
                standalone
                onProposalUpdated={(updated) => {
                  setLiveProposal(updated);
                  if (updated.statusId && updated.statusId !== proposal.statusId) {
                    try {
                      StorageService.updateProposalStatus(
                        updated.id,
                        updated.statusId,
                        `Sincronização Happy: Status "${updated.happyStatusName || updated.happyStatus || ''}"`,
                        undefined,
                        'SISTEMA',
                        false
                      );
                    } catch (e) {
                      console.warn('[HAPPY SYNC] Status local não alterado:', e);
                    }
                  }
                  StorageService.updateProposal(updated.id, updated, 'Consulta Happy / BYX Capital', false);
                  if (onProposalUpdated) onProposalUpdated();
                }}
              />
            </div>
          )}

          {activeTab === 'INTEGRACOES' && hasProviderIntegration && (
            <ProviderProposalSyncCard
              showFinanto={providerVisibility.finanto}
              showNossa={providerVisibility.nossa}
              proposal={proposal}
              onProposalUpdated={(updated) => {
                setLiveProposal(updated);
                StorageService.updateProposal(updated.id, updated, 'Sincronização FINANTO / Nossa Fintech', false);
                onProposalUpdated();
              }}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[var(--field-border)] dark:border-[var(--field-border)] px-6 py-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] rounded-b-2xl shrink-0">
          {canDeleteProposal && <button
            onClick={handleDeleteProposal}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] px-3 py-1.5 text-xs font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)] hover:bg-[var(--danger-bg)] dark:hover:bg-[var(--danger-bg)] transition-colors cursor-pointer"
            title="Excluir proposta permanentemente"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Excluir Proposta</span>
          </button>}
          <button
            onClick={onClose}
            className="rounded-lg bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] px-4 py-1.5 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={deleteModalConfig.onConfirm}
        itemType={deleteModalConfig.itemType}
        itemName={deleteModalConfig.itemName}
        description={deleteModalConfig.description}
      />
    </div>
  );
};
