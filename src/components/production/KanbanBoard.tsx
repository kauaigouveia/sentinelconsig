import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Clock,
  Link2,
  ChevronRight,
  ChevronLeft,
  Filter,
  User,
  Building,
  CheckCircle2,
  Inbox,
  FolderOpen,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Search,
  ArrowUpDown,
  Zap,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatCpf, extractPartnerCode, formatDate, formatCurrency } from '../../lib/utils';
import { Proposal, Status, ResponsibleAlçada } from '../../types';
import { ProposalDetailModal } from './ProposalDetailModal';
import { ActionBar } from '../ui/ActionBar';
import { AuthorityBadge } from '../ui/AuthorityBadge';
import { EmptyState } from '../ui/EmptyState';
import { toastService } from '../ui/toastService';
import { hasPermission } from '../../lib/permissions';
import { KanbanStageNavigator } from '../redesign/KanbanStageNavigator';

export const KanbanBoard: React.FC<{ premium?: boolean }> = ({ premium = false }) => {
  const [proposals, setProposals] = useState<Proposal[]>(() => StorageService.getProposals());
  const statuses = StorageService.getStatuses().filter(s => s.active);
  const clients = StorageService.getClients();
  const products = StorageService.getProducts();
  const banks = StorageService.getBanks();
  const promoters = StorageService.getPromoters();
  const partners = StorageService.getPartners();
  const historyList = StorageService.getHistory();

  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [updatingProposalId, setUpdatingProposalId] = useState<string | null>(null);
  const activeUser = StorageService.getActiveUser();
  const canUpdateProposals = hasPermission(activeUser?.role, activeUser?.customPermissions, 'proposals.update');
  const [productFilter, setProductFilter] = useState('');
  const [slaFilter, setSlaFilter] = useState<'ALL' | 'WARNING_AND_OVERDUE' | 'OVERDUE' | 'WARNING' | 'ON_TRACK'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'SLA_URGENCY' | 'RECENT' | 'ADE'>('SLA_URGENCY');

  const refreshData = () => {
    setProposals(StorageService.getProposals());
  };

  useEffect(() => {
    refreshData();
    window.addEventListener('credit_gestao_storage_update', refreshData);
    return () => window.removeEventListener('credit_gestao_storage_update', refreshData);
  }, []);

  const handleMoveStatus = async (proposalId: string, direction: 'PREV' | 'NEXT') => {
    if (updatingProposalId) return;
    const prop = proposals.find(p => p.id === proposalId);
    if (!prop) return;

    const currentIdx = statuses.findIndex(s => s.id === prop.statusId);
    if (currentIdx === -1) return;

    const step = direction === 'NEXT' ? 1 : -1;
    let nextIdx = currentIdx + step;
    while (nextIdx >= 0 && nextIdx < statuses.length && !statuses[nextIdx].manualChangeAllowed) {
      nextIdx += step;
    }
    if (nextIdx >= 0 && nextIdx < statuses.length) {
      const targetStatus = statuses[nextIdx];
      setUpdatingProposalId(proposalId);
      try {
        const response = await fetch(`/api/proposals/${encodeURIComponent(proposalId)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            statusId: targetStatus.id,
            statusName: targetStatus.name,
            notes: `Movido na Esteira Kanban para ${targetStatus.name}`,
          }),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || 'Não foi possível atualizar o status.');
        }
        StorageService.updateProposalStatus(
          proposalId,
          targetStatus.id,
          `Movido na Esteira Kanban para ${targetStatus.name}`,
          activeUser,
          'MANUAL',
          false
        );
        refreshData();
      } catch (error) {
        toastService.error('Falha ao mover proposta', error instanceof Error ? error.message : 'Tente novamente.');
      } finally {
        setUpdatingProposalId(null);
      }
    }
  };

  /**
   * Calculates SLA progress metrics for a proposal in its current status
   */
  const calculateSlaMetrics = (p: Proposal, status?: Status) => {
    const targetHours = status?.slaHours && status.slaHours > 0 ? status.slaHours : 24;

    // Find the latest history timestamp for this status entry, fallback to updatedAt or createdAt
    const statusHistoryEntries = historyList.filter(
      h => h.proposalId === p.id && h.newStatusId === p.statusId
    );
    const entryTimestamp =
      statusHistoryEntries.length > 0
        ? statusHistoryEntries[statusHistoryEntries.length - 1].createdAt
        : p.updatedAt || p.createdAt || new Date().toISOString();

    const entryTime = new Date(entryTimestamp).getTime();
    const now = Date.now();
    const elapsedMs = Math.max(0, now - entryTime);
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    const progressPct = Math.min(100, Math.round((elapsedHours / targetHours) * 100));
    const rawPct = Math.round((elapsedHours / targetHours) * 100);
    const remainingHours = Math.max(0, targetHours - elapsedHours);
    const overdueHours = elapsedHours > targetHours ? elapsedHours - targetHours : 0;

    let health: 'ON_TRACK' | 'WARNING' | 'OVERDUE' = 'ON_TRACK';
    if (elapsedHours >= targetHours) {
      health = 'OVERDUE';
    } else if (rawPct >= 75) {
      health = 'WARNING';
    }

    return {
      targetHours,
      elapsedHours: Math.round(elapsedHours * 10) / 10,
      remainingHours: Math.round(remainingHours * 10) / 10,
      overdueHours: Math.round(overdueHours * 10) / 10,
      progressPct,
      rawPct,
      health,
      entryDate: entryTimestamp,
    };
  };

  const filteredProposals = useMemo(() => {
    let result = proposals.filter(p => {
      if (productFilter && p.productId !== productFilter) return false;

      const client = clients.find(c => c.id === p.clientId);
      const partner = partners.find(pt => pt.id === p.partnerId);
      const partnerCode = partner?.login || '';

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matches =
          p.proposalNumber.toLowerCase().includes(term) ||
          (client?.fullName && client.fullName.toLowerCase().includes(term)) ||
          (client?.cpf && client.cpf.includes(term)) ||
          partnerCode.toLowerCase().includes(term) ||
          (partner?.login && partner.login.toLowerCase().includes(term));
        if (!matches) return false;
      }

      if (slaFilter !== 'ALL') {
        const st = statuses.find(s => s.id === p.statusId);
        const sla = calculateSlaMetrics(p, st);
        if (slaFilter === 'WARNING_AND_OVERDUE' && sla.health === 'ON_TRACK') return false;
        if (slaFilter === 'OVERDUE' && sla.health !== 'OVERDUE') return false;
        if (slaFilter === 'WARNING' && sla.health !== 'WARNING') return false;
        if (slaFilter === 'ON_TRACK' && sla.health !== 'ON_TRACK') return false;
      }

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'SLA_URGENCY') {
        const stA = statuses.find(s => s.id === a.statusId);
        const stB = statuses.find(s => s.id === b.statusId);
        const slaA = calculateSlaMetrics(a, stA);
        const slaB = calculateSlaMetrics(b, stB);
        return slaB.rawPct - slaA.rawPct; // Most urgent / most overdue first
      } else if (sortBy === 'RECENT') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else {
        return a.proposalNumber.localeCompare(b.proposalNumber);
      }
    });

    return result;
  }, [proposals, productFilter, slaFilter, searchTerm, sortBy, clients, partners, statuses, historyList]);

  // Overall SLA stats
  const slaCounts = useMemo(() => {
    let overdue = 0;
    let warning = 0;
    let onTrack = 0;

    proposals.forEach(p => {
      const st = statuses.find(s => s.id === p.statusId);
      const sla = calculateSlaMetrics(p, st);
      if (sla.health === 'OVERDUE') overdue++;
      else if (sla.health === 'WARNING') warning++;
      else onTrack++;
    });

    return { overdue, warning, onTrack, total: proposals.length };
  }, [proposals, statuses, historyList]);

  const alcadaColors: Record<ResponsibleAlçada, string> = {
    CLIENTE: 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--border-default)]',
    PARCEIRO: 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--border-default)]',
    BANCO: 'bg-[var(--info-bg)] text-[var(--info-text)] border-[var(--border-default)]',
    'NOSSA EQUIPE': 'bg-[var(--info-bg)] text-[var(--info-text)] border-[var(--border-default)]',
    SISTEMA: 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-default)]',
  };

  return (
    <div className={`space-y-3.5 h-[calc(100vh-8.5rem)] flex flex-col ${premium ? 'p2-live-module p2-live-kanban' : ''}`}>
      {/* Top Action Bar with Filters */}
      <ActionBar
        title="Etapas das propostas" subtitle="Veja onde cada proposta está e abra o cartão para continuar o trabalho."
        count={filteredProposals.length}
        rightActions={
          <div className="ui-filter-bar">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar ADE, CPF ou Parceiro..."
                className="ui-input-icon ui-input w-44 sm:w-52 h-7.5 rounded-md border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] pl-8 pr-3 text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:bg-[var(--bg-surface)] dark:focus:bg-[var(--bg-surface-elevated)] focus:border-[var(--border-default)] focus:outline-none"
              />
            </div>

            {/* Product Filter */}
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="ui-input h-7.5 rounded-md border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2 text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]"
            >
              <option value="">Todos os Produtos</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* SLA Filter */}
            <select
              value={slaFilter}
              onChange={e => setSlaFilter(e.target.value as any)}
              className={`ui-input ${`h-7.5 rounded-md border px-2 text-xs font-bold ${
                slaFilter === 'OVERDUE'
                  ? 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border-[var(--border-default)] dark:border-[var(--border-default)] text-[var(--danger-text)] dark:text-[var(--danger-text)]'
                  : slaFilter === 'WARNING' || slaFilter === 'WARNING_AND_OVERDUE'
                  ? 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border-[var(--border-default)] dark:border-[var(--border-default)] text-[var(--warning-text)] dark:text-[var(--warning-text)]'
                  : 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] border-[var(--border-default)] dark:border-[var(--border-default)] text-[var(--text-primary)] dark:text-[var(--text-primary)]'
              }`}`}
            >
              <option value="ALL">SLA: Todos ({slaCounts.total})</option>
              <option value="WARNING_AND_OVERDUE">⚠️ Críticos ({slaCounts.overdue + slaCounts.warning})</option>
              <option value="OVERDUE">🔴 Estourados ({slaCounts.overdue})</option>
              <option value="WARNING">🟠 Próximos 75% ({slaCounts.warning})</option>
              <option value="ON_TRACK">🟢 No Prazo ({slaCounts.onTrack})</option>
            </select>

            {/* Sort */}
            <div className="flex items-center gap-1 rounded-md bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-0.5 border border-[var(--border-default)] dark:border-[var(--border-default)]">
              <button
                onClick={() => setSortBy('SLA_URGENCY')}
                className={`px-2 py-1 text-xs font-bold rounded transition-transform ${
                  sortBy === 'SLA_URGENCY'
                    ? 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--info-text)] dark:text-[var(--info-text)] '
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Ordenar por maior urgência de SLA"
              >
                Urgência
              </button>
              <button
                onClick={() => setSortBy('RECENT')}
                className={`px-2 py-1 text-xs font-bold rounded transition-transform ${
                  sortBy === 'RECENT'
                    ? 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--info-text)] dark:text-[var(--info-text)] '
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Recentes
              </button>
            </div>
          </div>
        }
      />

      {premium && proposals.length > 0 && <KanbanStageNavigator stages={statuses.map(status => ({id: status.id, name: status.name, color: status.color, count: filteredProposals.filter(p => p.statusId === status.id).length}))} onJump={id => { const column = document.getElementById(`p2-stage-${id}`); column?.focus({preventScroll:true}); column?.scrollIntoView({block:'nearest',inline:'start'}); }} />}
      {proposals.length === 0 ? (
        <EmptyState
          title="Esteira Kanban sem propostas"
          description="As colunas operacionais refletirão automaticamente o fluxo de esteira assim que novas propostas forem criadas ou importadas."
        />
      ) : (
        /* Columns Container */
        <div className={`flex-1 flex gap-3 overflow-x-auto pb-2 min-h-0 ${premium ? 'p2-kanban-board' : ''}`}>
          {statuses.map((status, statusIdx) => {
            const colProps = filteredProposals.filter(p => p.statusId === status.id);

            return (
              <div
                key={status.id}
                id={premium ? `p2-stage-${status.id}` : undefined}
                tabIndex={premium ? -1 : undefined}
                aria-label={premium ? `Etapa ${status.name}` : undefined}
                className="w-80 shrink-0 flex flex-col rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--border-default)] dark:border-[var(--border-default)] overflow-hidden "
              >
                {/* Column Header */}
                <div className="p-3 border-b border-[var(--border-default)] dark:border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 "
                        style={{ backgroundColor: status.color || 'var(--info-text)' }}
                      />
                      <h3 className="text-xs font-black text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate tracking-tight" title={status.name}>
                        {status.name}
                      </h3>
                      {status.slaHours && (
                        <span className="text-[10px] text-[var(--text-secondary)] font-mono font-bold" title={`SLA padrão: ${status.slaHours} horas`}>
                          ({status.slaHours}h)
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <AuthorityBadge authority={status.responsibleGroup || status.responsible} />
                    </div>
                  </div>
                  <span className="h-5.5 min-w-5.5 px-1.5 rounded-md bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] dark:text-[var(--text-primary)] font-mono font-black text-[11px] flex items-center justify-center shrink-0 border border-[var(--border-default)] dark:border-[var(--border-default)]">
                    {colProps.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 max-h-[calc(100vh-280px)]">
                  {colProps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-3 rounded-xl border border-dashed border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-center space-y-1.5">
                      <FolderOpen className="h-5 w-5 text-[var(--text-primary)] dark:text-[var(--text-secondary)]" />
                      <p className="text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                        Nenhuma proposta nesta etapa
                      </p>
                    </div>
                  ) : (
                    colProps.map(p => {
                      const client = clients.find(c => c.id === p.clientId);
                      const prod = products.find(pr => pr.id === p.productId);
                      const bank = banks.find(b => b.id === p.bankId);
                      const promoter = promoters.find(pr => pr.id === p.promoterId);
                      const partner = partners.find(pt => pt.id === p.partnerId);
                      const sla = calculateSlaMetrics(p, status);

                      return (
                        <div
                          key={p.id}
                          className={`rounded-xl border bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-3.5   transition-transform space-y-2 cursor-pointer group relative ${
                            sla.health === 'OVERDUE'
                              ? 'border-[var(--border-default)] dark:border-[var(--border-default)] ring-1 ring-[var(--field-border)] dark:ring-[var(--field-border)]'
                              : sla.health === 'WARNING'
                              ? 'border-[var(--border-default)] dark:border-[var(--border-default)] ring-1 ring-[var(--field-border)] dark:ring-[var(--field-border)]'
                              : 'border-[var(--border-default)] dark:border-[var(--border-default)] hover:border-[var(--border-default)] dark:hover:border-[var(--border-default)]'
                          }`}
                          onClick={() => setSelectedProposalId(p.id)}
                        >
                          {/* Top: ADE + Product + SLA Status Badge */}
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-mono text-xs font-black text-[var(--text-primary)] dark:text-[var(--text-primary)] group-hover:text-[var(--info-text)] dark:group-hover:text-[var(--info-text)] truncate">
                              ADE {p.proposalNumber}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[9.5px] font-bold text-[var(--info-text)] dark:text-[var(--info-text)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border border-[var(--border-default)] dark:border-[var(--border-default)] px-1.5 py-0.5 rounded">
                                {prod?.name}
                              </span>
                            </div>
                          </div>

                          {/* Client info */}
                          <div>
                            <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate" title={client?.fullName}>
                              {client?.fullName}
                            </p>
                            <p className="text-[10.5px] font-mono font-medium text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                              {formatCpf(client?.cpf || '')}
                            </p>
                          </div>

                          {/* Bank & Promoter */}
                          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] pt-1.5 border-t border-[var(--border-default)] dark:border-[var(--border-default)]">
                            <span className="font-semibold truncate">{bank?.name}</span>
                            <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-medium shrink-0 ml-1">{promoter?.name}</span>
                          </div>

                          {/* Partner & Code */}
                          <div className="flex items-center justify-between text-[10.5px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                            <span className="font-bold text-[var(--info-text)] dark:text-[var(--info-text)] font-mono">
                              Identificador: {partner?.login || ''}
                            </span>
                            <span className="truncate max-w-[120px] font-medium" title={partner?.login}>
                              {partner?.login}
                            </span>
                          </div>

                          {/* Financial Values Pill */}
                          {(p.disbursedValue || p.contractBalance) && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[var(--border-default)] dark:border-[var(--border-default)] text-[10px]">
                              {p.disbursedValue ? (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] font-mono font-bold border border-[var(--border-default)] dark:border-[var(--border-default)]">
                                  Lib: {formatCurrency(p.disbursedValue)}
                                </span>
                              ) : null}
                              {p.contractBalance ? (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--info-text)] dark:text-[var(--info-text)] font-mono font-medium border border-[var(--border-default)] dark:border-[var(--border-default)]">
                                  Saldo: {formatCurrency(p.contractBalance)}
                                </span>
                              ) : null}
                            </div>
                          )}

                          {/* SLA Urgency Pill */}
                          <div className="pt-1 flex items-center justify-between text-[10px] font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                sla.health === 'OVERDUE'
                                  ? 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]'
                                  : sla.health === 'WARNING'
                                  ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]'
                                  : 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                              }`}
                            >
                              {sla.health === 'OVERDUE' ? `Atrasado (+${Math.round(sla.overdueHours)}h)` : `${sla.progressPct}% SLA`}
                            </span>

                            {/* Quick Next/Prev Navigation */}
                            {canUpdateProposals && <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {statuses.slice(0, statusIdx).some(status => status.manualChangeAllowed) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleMoveStatus(p.id, 'PREV');
                                  }}
                                  disabled={Boolean(updatingProposalId)}
                                  className="p-1 rounded bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer"
                                  title="Mover para etapa anterior"
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </button>
                              )}
                              {statuses.slice(statusIdx + 1).some(status => status.manualChangeAllowed) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleMoveStatus(p.id, 'NEXT');
                                  }}
                                  disabled={Boolean(updatingProposalId)}
                                  className="p-1 rounded bg-[var(--info-bg)] dark:bg-[var(--info-bg)] hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] text-[var(--info-text)] dark:text-[var(--info-text)] cursor-pointer"
                                  title="Avançar para próxima etapa"
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
                            </div>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedProposalId && (
        <ProposalDetailModal
          proposalId={selectedProposalId}
          onClose={() => setSelectedProposalId(null)}
          onProposalUpdated={refreshData}
        />
      )}
    </div>
  );
};

