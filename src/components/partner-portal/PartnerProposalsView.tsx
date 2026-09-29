import React, { useState, useEffect } from 'react';
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

interface PartnerProposalsViewProps {
  initialStatusCategory?: string;
  onOpenChatForProposal: (proposalId: string, proposalNumber: string) => void;
}

export const PartnerProposalsView: React.FC<PartnerProposalsViewProps> = ({
  initialStatusCategory,
  onOpenChatForProposal,
}) => {
  const [proposals, setProposals] = useState<PartnerProposalListItem[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [standardCategory, setStandardCategory] = useState<string>(initialStatusCategory || 'ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected proposal for modal
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  const fetchProposals = async (page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await PartnerPortalClient.getProposals({
        search: searchTerm.trim() || undefined,
        standardCategory: standardCategory !== 'ALL' ? standardCategory : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: 20,
      });

      setProposals(res.items);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar propostas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals(1);
  }, [standardCategory, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProposals(1);
  };

  return (
    <div className="space-y-4 select-none">
      {/* Top Filter & Search Bar */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-500" />
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Minhas Propostas
              </h2>
              <span className="text-[11px] text-slate-400 font-medium">
                Total de {pagination.total} contratos localizados
              </span>
            </div>
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nº, cliente ou CPF..."
                className="w-full h-8.5 pl-8 pr-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="h-8.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => fetchProposals(pagination.page)}
              className="h-8.5 w-8.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        {/* Categories Tabs & Dates */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
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
                onClick={() => setStandardCategory(cat.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  standardCategory === cat.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px] font-semibold hidden sm:inline">Período:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-7.5 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
            />
            <span className="text-slate-400">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-7.5 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Proposals Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="h-8 w-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Carregando propostas...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-400 font-semibold">{error}</div>
        ) : proposals.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <FileSpreadsheet className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="font-bold text-slate-600 dark:text-slate-300">Nenhuma proposta encontrada</p>
            <p className="text-[11px]">Tente alterar os filtros ou termo de busca.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] border-b border-slate-100 dark:border-slate-800">
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
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-800 dark:text-slate-200">
                {proposals.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedProposalId(p.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                      #{p.proposalNumber}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900 dark:text-white truncate max-w-[180px]">
                        {p.clientName}
                      </p>
                      <p className="text-[10.5px] font-mono text-slate-400">{p.clientCpfMasked}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold truncate max-w-[150px]">{p.productName}</p>
                      <p className="text-[10.5px] text-slate-400 truncate max-w-[150px]">{p.bankName}</p>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold">
                      {formatCurrency(p.contractValue)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
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
                    <td className="py-3 px-4 text-slate-400 text-[11px] font-mono">
                      {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProposalId(p.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-colors cursor-pointer"
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
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between text-xs text-slate-500">
            <span>
              Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> (
              {pagination.total} itens)
            </span>

            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchProposals(pagination.page - 1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchProposals(pagination.page + 1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

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
