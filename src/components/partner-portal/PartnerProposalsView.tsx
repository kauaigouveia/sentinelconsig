import React, { useState, useEffect, useRef } from 'react';
import {
  FileSpreadsheet,
  Search,
  Filter,
  RefreshCw,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { PartnerPortalClient, PartnerProposalListItem } from '../../services/partnerPortalClient';
import { formatCurrency } from '../../lib/utils';
import { PartnerProposalDetailModal } from './PartnerProposalDetailModal';
import { OperationCard, RecordWorkspace, type RecordPresentation } from '../ui/RecordWorkspace';

interface PartnerProposalsViewProps {
  initialStatusCategory?: string;
  initialWaitingReturnOnly?: boolean;
  initialProposalId?: string | null;
  onInitialProposalHandled?: () => void;
  onOpenChatForProposal: (proposalId: string, proposalNumber: string) => void;
}

export const PartnerProposalsView: React.FC<PartnerProposalsViewProps> = ({
  initialStatusCategory,
  initialWaitingReturnOnly = false,
  initialProposalId,
  onInitialProposalHandled,
  onOpenChatForProposal,
}) => {
  const [presentation, setPresentation] = useState<RecordPresentation>('cards');
  const [proposals, setProposals] = useState<PartnerProposalListItem[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [standardCategory, setStandardCategory] = useState<string>(initialStatusCategory || 'ALL');
  const [waitingReturnOnly, setWaitingReturnOnly] = useState(initialWaitingReturnOnly);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected proposal for modal
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const proposalRequestRef = useRef(0);

  const fetchProposals = async (page = 1, search = appliedSearchTerm) => {
    const requestId = ++proposalRequestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await PartnerPortalClient.getProposals({
        search: search.trim() || undefined,
        standardCategory: standardCategory !== 'ALL' ? standardCategory : undefined,
        waitingReturnOnly: waitingReturnOnly || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: 20,
      });

      if (requestId !== proposalRequestRef.current) return;
      setProposals(res.items);
      setPagination(res.pagination);
    } catch (err: any) {
      if (requestId === proposalRequestRef.current) setError(err?.message || 'Erro ao carregar propostas.');
    } finally {
      if (requestId === proposalRequestRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals(1, appliedSearchTerm);
  }, [standardCategory, waitingReturnOnly, startDate, endDate, appliedSearchTerm]);

  useEffect(() => () => {
    proposalRequestRef.current += 1;
  }, []);

  useEffect(() => {
    if (!initialProposalId) return;
    setSelectedProposalId(initialProposalId);
    onInitialProposalHandled?.();
  }, [initialProposalId, onInitialProposalHandled]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const search = searchTerm.trim();
    if (search === appliedSearchTerm) {
      void fetchProposals(1, search);
    } else {
      setAppliedSearchTerm(search);
    }
  };

  const portalFilters = <>
      {/* Top Filter & Search Bar */}
      <div className="p-4 rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[var(--link)]" />
            <div>
              <h2 className="text-sm font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-tight">
                Minhas Propostas
              </h2>
              <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                Total de {pagination.total} contratos localizados
              </span>
            </div>
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nº, cliente ou CPF..."
                className="w-full h-8.5 pl-8 pr-3 text-xs rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--field-border)]"
              />
            </div>
            <button
              type="submit"
              className="h-8.5 px-3 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs  transition-colors cursor-pointer"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => fetchProposals(pagination.page, appliedSearchTerm)}
              className="h-8.5 w-8.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center justify-center cursor-pointer transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        {/* Categories Tabs & Dates */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'Todas' },
              { id: 'ESTEIRA', label: 'Em Andamento' },
              { id: 'PAGO', label: 'Concluídas / Pagas' },
              { id: 'PENDENTE', label: 'Pendentes' },
              { id: 'RECUSADO', label: 'Recusadas' },
              { id: 'CANCELADO', label: 'Canceladas' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setStandardCategory(cat.id);
                  setWaitingReturnOnly(false);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  standardCategory === cat.id
                    ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-2xs'
                    : 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {waitingReturnOnly && (
            <span className="rounded-lg bg-[var(--info-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]">
              Filtrando: Aguardando CIP ou retorno
            </span>
          )}

          <fieldset className="w-full min-w-0 space-y-2 text-xs">
            <legend className="text-[var(--text-secondary)] font-semibold">Período</legend>
            <label className="block space-y-1">De
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Data inicial das propostas"
              className="block w-full min-w-0 h-8 px-2 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs"
            />
            </label>
            <label className="block space-y-1">Até
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Data final das propostas"
              className="block w-full min-w-0 h-8 px-2 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs"
            />
            </label>
          </fieldset>
        </div>
      </div>

  </>;
  return (
    <div className="space-y-4 select-none">
      <RecordWorkspace filters={portalFilters} count={pagination.total} mode={presentation} onMode={setPresentation}>
      {/* Proposals Table */}
      <div className="rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="h-8 w-8 border-3 border-[var(--field-border)] border-t-[var(--focus)] rounded-full animate-spin" />
            <span className="text-xs text-[var(--text-secondary)]">Carregando propostas...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-[var(--danger-text)] font-semibold">{error}</div>
        ) : proposals.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--text-secondary)] space-y-2">
            <FileSpreadsheet className="h-8 w-8 text-[var(--text-primary)] dark:text-[var(--text-secondary)] mx-auto" />
            <p className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Nenhuma proposta encontrada</p>
            <p className="text-[11px]">Tente alterar os filtros ou termo de busca.</p>
          </div>
        ) : presentation === 'cards' ? <div className="operation-card-grid p-3">{proposals.map(proposal => <OperationCard key={proposal.id} title={proposal.clientName || `ADE ${proposal.proposalNumber}`} eyebrow={proposal.bankName} status={proposal.statusName} statusColor={proposal.statusColor} amount={formatCurrency(proposal.releasedValue)} fields={[{ label: 'ADE', value: proposal.proposalNumber }, { label: 'CPF', value: proposal.clientCpfMasked }, { label: 'Produto', value: proposal.productName }, { label: 'Prazo', value: `${proposal.installmentsCount} meses` }]} onOpen={() => setSelectedProposalId(proposal.id)} actions={<button type="button" className="operation-card-action" onClick={() => onOpenChatForProposal(proposal.id, proposal.proposalNumber)}>Falar com a mesa</button>} />)}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-bold uppercase text-[10px] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                <tr>
                  <th className="py-3 px-4">Proposta</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Produto & Banco</th>
                  <th className="py-3 px-4">Valor Bruto</th>
                  <th className="py-3 px-4">Líquido Liberado</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Atualizado</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                {proposals.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedProposalId(p.id)}
                    className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-[var(--link)] dark:text-[var(--link)]">
                      #{p.proposalNumber}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate max-w-[180px]">
                        {p.clientName}
                      </p>
                      <p className="text-[10.5px] font-mono text-[var(--text-secondary)]">{p.clientCpfMasked}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold truncate max-w-[150px]">{p.productName}</p>
                      <p className="text-[10.5px] text-[var(--text-secondary)] truncate max-w-[150px]">{p.bankName}</p>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold">
                      {formatCurrency(p.contractValue)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[var(--success-text)] dark:text-[var(--success-text)]">
                      {formatCurrency(p.releasedValue)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1"
                        style={{
                          backgroundColor: `${p.statusColor}15`,
                          color: p.statusColor,
                          border: `1px solid ${p.statusColor}30`,
                        }}
                      >
                        {p.statusName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] text-[11px] font-mono">
                      {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProposalId(p.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] transition-colors cursor-pointer"
                        title="Ver Detalhes"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div className="p-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>
              Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> (
              {pagination.total} itens)
            </span>

            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchProposals(pagination.page - 1, appliedSearchTerm)}
                className="p-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] disabled:opacity-90 hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchProposals(pagination.page + 1, appliedSearchTerm)}
                className="p-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] disabled:opacity-90 hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      </RecordWorkspace>
      {/* Modal de Detalhes da Proposta */}
      {selectedProposalId && (
        <PartnerProposalDetailModal
          proposalId={selectedProposalId}
          onClose={() => setSelectedProposalId(null)}
          onOpenChatForProposal={(propId, propNumber) => {
            setSelectedProposalId(null);
            onOpenChatForProposal(propId, propNumber);
          }}
        />
      )}
    </div>
  );
};
