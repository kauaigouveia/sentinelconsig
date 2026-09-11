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
import { formatCpf, extractPartnerCode, formatDate } from '../../lib/utils';
import { Proposal, Status, ResponsibleAlçada } from '../../types';
import { ProposalDetailModal } from './ProposalDetailModal';

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
      {/* Top Filter and SLA Urgency Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs shrink-0 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Esteira Kanban de Produção</h2>
              {slaCounts.overdue > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-extrabold text-rose-700 border border-rose-200 animate-pulse">
                  <AlertCircle className="h-3 w-3 text-rose-600" />
                  {slaCounts.overdue} SLA estourado(s)
                </span>
              )}
              {slaCounts.warning > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-700 border border-amber-200">
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                  {slaCounts.warning} próximo(s) do vencimento
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento de fluxo por status com alertas visuais de prazo operacional (SLA) em tempo real
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar ADE, CPF ou Parceiro..."
                className="w-48 sm:w-56 rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-1 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Product Filter */}
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden"
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
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold focus:outline-hidden ${
                slaFilter === 'OVERDUE'
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : slaFilter === 'WARNING' || slaFilter === 'WARNING_AND_OVERDUE'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              <option value="ALL">Status SLA: Todos ({slaCounts.total})</option>
              <option value="WARNING_AND_OVERDUE">⚠️ Críticos & Estourados ({slaCounts.overdue + slaCounts.warning})</option>
              <option value="OVERDUE">🔴 Somente Estourados ({slaCounts.overdue})</option>
              <option value="WARNING">🟠 Próximos do Vencimento ≥75% ({slaCounts.warning})</option>
              <option value="ON_TRACK">🟢 No Prazo ({slaCounts.onTrack})</option>
            </select>

            {/* Sort */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                onClick={() => setSortBy('SLA_URGENCY')}
                className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${
                  sortBy === 'SLA_URGENCY' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Ordenar por maior urgência de SLA"
              >
                Urgência SLA
              </button>
              <button
                onClick={() => setSortBy('RECENT')}
                className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${
                  sortBy === 'RECENT' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Recentes
              </button>
            </div>
          </div>
        </div>
      </div>

      {proposals.length === 0 ? (
        /* Global Onboarding Empty State for Kanban */
        <div className="flex-1 flex items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center shadow-2xs">
          <div className="max-w-md space-y-4">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
              <Inbox className="h-8 w-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                Esteira Kanban sem propostas
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                As colunas operacionais refletirão automaticamente o fluxo de esteira assim que novas propostas forem criadas ou importadas.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Columns Container */
        <div className="flex-1 flex gap-3 overflow-x-auto pb-2 min-h-0">
          {statuses.map((status, statusIdx) => {
            const colProps = filteredProposals.filter(p => p.statusId === status.id);

            return (
              <div
                key={status.id}
                className="w-76 shrink-0 flex flex-col rounded-xl bg-slate-100/90 border border-slate-200 overflow-hidden shadow-2xs"
              >
                {/* Column Header */}
                <div
                  className="p-3 border-b border-slate-200 flex items-center justify-between bg-white"
                  style={{ borderTop: `4px solid ${status.color}` }}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-slate-900 truncate" title={status.name}>
                        {status.name}
                      </h3>
                      {status.slaHours && (
                        <span className="text-[10px] text-slate-400 font-semibold" title={`SLA padrão: ${status.slaHours} horas`}>
                          ({status.slaHours}h)
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold border mt-0.5 ${
                        alcadaColors[status.responsible]
                      }`}
                    >
                      Alçada: {status.responsible}
                    </span>
                  </div>
                  <span className="h-5 w-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center justify-center shrink-0">
                    {colProps.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2.5">
                  {colProps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-3 rounded-lg border border-dashed border-slate-300 bg-white/60 text-center space-y-1.5">
                      <FolderOpen className="h-5 w-5 text-slate-300" />
                      <p className="text-[11px] font-medium text-slate-400">
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
                          className={`rounded-lg border bg-white p-3 shadow-2xs hover:shadow-md transition-all space-y-2 cursor-pointer group relative ${
                            sla.health === 'OVERDUE'
                              ? 'border-rose-300 ring-1 ring-rose-200'
                              : sla.health === 'WARNING'
                              ? 'border-amber-300 ring-1 ring-amber-100'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                          onClick={() => setSelectedProposalId(p.id)}
                        >
                          {/* Top: ADE + Product + SLA Status Badge */}
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-blue-600 truncate">
                              ADE {p.proposalNumber}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                {prod?.name}
                              </span>
                            </div>
                          </div>

                          {/* Client info */}
                          <div>
                            <p className="text-xs font-semibold text-slate-800 truncate" title={client?.fullName}>
                              {client?.fullName}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500">
                              {formatCpf(client?.cpf || '')}
                            </p>
                          </div>

                          {/* Bank & Promoter */}
                          <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                            <span className="truncate">{bank?.name}</span>
                            <span className="text-slate-400 font-medium shrink-0 ml-1">{promoter?.name}</span>
                          </div>

                          {/* Partner & Code */}
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span className="font-bold text-blue-800">
                              Cód: {partner ? extractPartnerCode(partner.login) : ''}
                            </span>
                            <span className="truncate max-w-[120px]" title={partner?.login}>
                              {partner?.login}
                            </span>
                          </div>

                          {/* SLA Operational Deadline Visual Progress Bar */}
                          <div className="pt-1.5 border-t border-slate-100 space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="flex items-center gap-1 text-slate-500 font-semibold">
                                <Clock className="h-3 w-3 text-slate-400" />
                                <span>SLA: {sla.elapsedHours}h / {sla.targetHours}h</span>
                              </span>

                              {sla.health === 'OVERDUE' ? (
                                <span className="font-black text-rose-600 flex items-center gap-0.5">
                                  <AlertCircle className="h-3 w-3" />
                                  +{sla.overdueHours}h estourado
                                </span>
                              ) : sla.health === 'WARNING' ? (
                                <span className="font-bold text-amber-700 flex items-center gap-0.5">
                                  <AlertTriangle className="h-3 w-3" />
                                  Restam {sla.remainingHours}h
                                </span>
                              ) : (
                                <span className="font-bold text-emerald-600">
                                  {sla.remainingHours}h restantes
                                </span>
                              )}
                            </div>

                            {/* Progress bar background & fill */}
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  sla.health === 'OVERDUE'
                                    ? 'bg-rose-500'
                                    : sla.health === 'WARNING'
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${sla.progressPct}%` }}
                              />
                            </div>
                          </div>

                          {/* Actions (Move Prev / Next) */}
                          <div
                            className="flex items-center justify-between pt-1 border-t border-slate-100"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              disabled={statusIdx === 0}
                              onClick={() => handleMoveStatus(p.id, 'PREV')}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20"
                              title="Voltar status anterior"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>

                            <span className="text-[9px] text-slate-400 font-medium">Mover etapa</span>

                            <button
                              disabled={statusIdx === statuses.length - 1}
                              onClick={() => handleMoveStatus(p.id, 'NEXT')}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20"
                              title="Avançar próximo status"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
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

