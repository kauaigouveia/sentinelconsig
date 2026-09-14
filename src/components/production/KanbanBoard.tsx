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

export const KanbanBoard: React.FC = () => {
  const [proposals, setProposals] = useState<Proposal[]>(() => StorageService.getProposals());
  const statuses = StorageService.getStatuses().filter(s => s.active);
  const clients = StorageService.getClients();
  const products = StorageService.getProducts();
  const banks = StorageService.getBanks();
  const promoters = StorageService.getPromoters();
  const partners = StorageService.getPartners();
  const historyList = StorageService.getHistory();

  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
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

  const handleMoveStatus = (proposalId: string, direction: 'PREV' | 'NEXT') => {
    const prop = proposals.find(p => p.id === proposalId);
    if (!prop) return;

    const currentIdx = statuses.findIndex(s => s.id === prop.statusId);
    if (currentIdx === -1) return;

    const nextIdx = direction === 'NEXT' ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx >= 0 && nextIdx < statuses.length) {
      const targetStatus = statuses[nextIdx];
      StorageService.updateProposalStatus(
        proposalId,
        targetStatus.id,
        `Movido na Esteira Kanban para ${targetStatus.name}`,
        undefined,
        'MANUAL'
      );
      refreshData();
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
      const partnerCode = partner ? extractPartnerCode(partner.login) : '';

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
    CLIENTE: 'bg-orange-50 text-orange-700 border-orange-200',
    PARCEIRO: 'bg-amber-50 text-amber-700 border-amber-200',
    BANCO: 'bg-blue-50 text-blue-700 border-blue-200',
    'NOSSA EQUIPE': 'bg-purple-50 text-purple-700 border-purple-200',
    SISTEMA: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className="space-y-3.5 h-[calc(100vh-8.5rem)] flex flex-col">
      {/* Top Action Bar with Filters */}
      <ActionBar
        title="Esteira Kanban"
        count={filteredProposals.length}
        rightActions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar ADE, CPF ou Parceiro..."
                className="w-44 sm:w-52 h-7.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 pl-8 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Product Filter */}
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="h-7.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
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
              className={`h-7.5 rounded-md border px-2 text-xs font-bold ${
                slaFilter === 'OVERDUE'
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                  : slaFilter === 'WARNING' || slaFilter === 'WARNING_AND_OVERDUE'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <option value="ALL">SLA: Todos ({slaCounts.total})</option>
              <option value="WARNING_AND_OVERDUE">⚠️ Críticos ({slaCounts.overdue + slaCounts.warning})</option>
              <option value="OVERDUE">🔴 Estourados ({slaCounts.overdue})</option>
              <option value="WARNING">🟠 Próximos 75% ({slaCounts.warning})</option>
              <option value="ON_TRACK">🟢 No Prazo ({slaCounts.onTrack})</option>
            </select>

            {/* Sort */}
            <div className="flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setSortBy('SLA_URGENCY')}
                className={`px-2 py-1 text-xs font-bold rounded transition-all ${
                  sortBy === 'SLA_URGENCY'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Ordenar por maior urgência de SLA"
              >
                Urgência
              </button>
              <button
                onClick={() => setSortBy('RECENT')}
                className={`px-2 py-1 text-xs font-bold rounded transition-all ${
                  sortBy === 'RECENT'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Recentes
              </button>
            </div>
          </div>
        }
      />

      {proposals.length === 0 ? (
        <EmptyState
          title="Esteira Kanban sem propostas"
          description="As colunas operacionais refletirão automaticamente o fluxo de esteira assim que novas propostas forem criadas ou importadas."
        />
      ) : (
        /* Columns Container */
        <div className="flex-1 flex gap-3 overflow-x-auto pb-2 min-h-0">
          {statuses.map((status, statusIdx) => {
            const colProps = filteredProposals.filter(p => p.statusId === status.id);

            return (
              <div
                key={status.id}
                className="w-80 shrink-0 flex flex-col rounded-xl bg-slate-100/80 dark:bg-[#0c1220] border border-slate-200/90 dark:border-slate-800/80 overflow-hidden shadow-xs"
              >
                {/* Column Header */}
                <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-[#0e1626]">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: status.color || '#3b82f6' }}
                      />
                      <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 truncate tracking-tight" title={status.name}>
                        {status.name}
                      </h3>
                      {status.slaHours && (
                        <span className="text-[10px] text-slate-400 font-mono font-bold" title={`SLA padrão: ${status.slaHours} horas`}>
                          ({status.slaHours}h)
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <AuthorityBadge authority={status.responsible} />
                    </div>
                  </div>
                  <span className="h-5.5 min-w-5.5 px-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-black text-[11px] flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                    {colProps.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 max-h-[calc(100vh-280px)]">
                  {colProps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/20 text-center space-y-1.5">
                      <FolderOpen className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
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
                          className={`rounded-xl border bg-white dark:bg-[#11192a] p-3.5 shadow-2xs hover:shadow-md transition-all space-y-2 cursor-pointer group relative ${
                            sla.health === 'OVERDUE'
                              ? 'border-rose-400 dark:border-rose-500/70 ring-1 ring-rose-300 dark:ring-rose-500/30'
                              : sla.health === 'WARNING'
                              ? 'border-amber-400 dark:border-amber-500/70 ring-1 ring-amber-300 dark:ring-amber-500/30'
                              : 'border-slate-200 dark:border-slate-800/90 hover:border-blue-400 dark:hover:border-blue-500/50'
                          }`}
                          onClick={() => setSelectedProposalId(p.id)}
                        >
                          {/* Top: ADE + Product + SLA Status Badge */}
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-mono text-xs font-black text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                              ADE {p.proposalNumber}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[9.5px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded">
                                {prod?.name}
                              </span>
                            </div>
                          </div>

                          {/* Client info */}
                          <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={client?.fullName}>
                              {client?.fullName}
                            </p>
                            <p className="text-[10.5px] font-mono font-medium text-slate-400 dark:text-slate-500">
                              {formatCpf(client?.cpf || '')}
                            </p>
                          </div>

                          {/* Bank & Promoter */}
                          <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                            <span className="font-semibold truncate">{bank?.name}</span>
                            <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0 ml-1">{promoter?.name}</span>
                          </div>

                          {/* Partner & Code */}
                          <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-blue-700 dark:text-blue-400 font-mono">
                              Cód: {partner ? extractPartnerCode(partner.login) : ''}
                            </span>
                            <span className="truncate max-w-[120px] font-medium" title={partner?.login}>
                              {partner?.login}
                            </span>
                          </div>

                          {/* Financial Values Pill */}
                          {(p.disbursedValue || p.contractBalance) && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-[10px]">
                              {p.disbursedValue ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-mono font-bold border border-emerald-200 dark:border-emerald-800/50">
                                  Lib: {formatCurrency(p.disbursedValue)}
                                </span>
                              ) : null}
                              {p.contractBalance ? (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono font-medium border border-indigo-200 dark:border-indigo-800/50">
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
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : sla.health === 'WARNING'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              }`}
                            >
                              {sla.health === 'OVERDUE' ? `Atrasado (+${Math.round(sla.overdueHours)}h)` : `${sla.progressPct}% SLA`}
                            </span>

                            {/* Quick Next/Prev Navigation */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {statusIdx > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveStatus(p.id, 'PREV');
                                  }}
                                  className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                                  title="Mover para etapa anterior"
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </button>
                              )}
                              {statusIdx < statuses.length - 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveStatus(p.id, 'NEXT');
                                  }}
                                  className="p-1 rounded bg-blue-50 dark:bg-blue-900/60 hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 cursor-pointer"
                                  title="Avançar para próxima etapa"
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
                            </div>
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

