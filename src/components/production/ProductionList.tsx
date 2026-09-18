import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { PartnerSearchSelect } from '../common/PartnerSearchSelect';
import {
  Search,
  Filter,
  Layers,
  Download,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  Eye,
  AlertCircle,
  Clock,
  Link2,
  Calendar,
  X,
  Trash2,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  FileSpreadsheet,
  RotateCcw,
  SearchX,
  Maximize2,
  Minimize2,
  Copy,
  SlidersHorizontal,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { normalizeCpf, formatCpf, formatDate, extractPartnerCode, formatCurrency } from '../../lib/utils';
import { Proposal, ResponsibleAlçada } from '../../types';
import { BulkStatusModal } from './BulkStatusModal';
import { ExcelExportModal } from './ExcelExportModal';
import { ProposalDetailModal } from './ProposalDetailModal';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { StatusBadge } from '../ui/StatusBadge';
import { AuthorityBadge } from '../ui/AuthorityBadge';
import { ActionBar } from '../ui/ActionBar';
import { EmptyState } from '../ui/EmptyState';
import { toastService } from '../ui/toastService';

interface ProductionListProps {
  onOpenNewProduction: () => void;
  onOpenImportExcel?: () => void;
  onToggleFocusMode?: () => void;
  isFocusMode?: boolean;
  initialFilter?: {
    statusId?: string;
    alçada?: ResponsibleAlçada;
    productId?: string;
    bankId?: string;
    promoterId?: string;
    digitizerId?: string;
  };
}

type SortField = 'proposalNumber' | 'clientName' | 'cpf' | 'bank' | 'disbursedValue' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export const ProductionList: React.FC<ProductionListProps> = ({
  onOpenNewProduction,
  onOpenImportExcel,
  onToggleFocusMode,
  isFocusMode = false,
  initialFilter,
}) => {
  const [proposals, setProposals] = useState<Proposal[]>(() => StorageService.getProposals());
  const clients = StorageService.getClients();
  const products = StorageService.getProducts();
  const banks = StorageService.getBanks();
  const promoters = StorageService.getPromoters();
  const partners = StorageService.getPartners();
  const statuses = StorageService.getStatuses();
  const users = StorageService.getUsers();

  // Load initial filters from sessionStorage if available
  const savedFilters = useMemo(() => {
    try {
      const item = sessionStorage.getItem('cg_production_filters');
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  }, []);

  // Filters State
  const [searchTerm, setSearchTerm] = useState(savedFilters?.searchTerm || '');
  const [filterProduct, setFilterProduct] = useState(initialFilter?.productId || savedFilters?.filterProduct || '');
  const [filterBank, setFilterBank] = useState(initialFilter?.bankId || savedFilters?.filterBank || '');
  const [filterPromoter, setFilterPromoter] = useState(initialFilter?.promoterId || savedFilters?.filterPromoter || '');
  const [filterPartner, setFilterPartner] = useState(savedFilters?.filterPartner || '');
  const [filterStatus, setFilterStatus] = useState(initialFilter?.statusId || savedFilters?.filterStatus || '');
  const [filterAlçada, setFilterAlçada] = useState<ResponsibleAlçada | ''>(
    initialFilter?.alçada || savedFilters?.filterAlçada || ''
  );
  const [filterSla, setFilterSla] = useState<'TODOS' | 'NO_PRAZO' | '5_DIA' | 'ATRASADO'>(
    savedFilters?.filterSla || 'TODOS'
  );

  // Table Density: 'COMPACTA' | 'CONFORTAVEL'
  const [tableDensity, setTableDensity] = useState<'COMPACTA' | 'CONFORTAVEL'>(() => {
    try {
      return (sessionStorage.getItem('cg_table_density') as 'COMPACTA' | 'CONFORTAVEL') || 'COMPACTA';
    } catch {
      return 'COMPACTA';
    }
  });

  const toggleDensity = () => {
    const next = tableDensity === 'COMPACTA' ? 'CONFORTAVEL' : 'COMPACTA';
    setTableDensity(next);
    try {
      sessionStorage.setItem('cg_table_density', next);
    } catch {}
  };

  // Sorting
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Persist filters to sessionStorage on change
  useEffect(() => {
    try {
      sessionStorage.setItem(
        'cg_production_filters',
        JSON.stringify({
          searchTerm,
          filterProduct,
          filterBank,
          filterPromoter,
          filterPartner,
          filterStatus,
          filterAlçada,
          filterSla,
        })
      );
    } catch {}
  }, [searchTerm, filterProduct, filterBank, filterPromoter, filterPartner, filterStatus, filterAlçada, filterSla]);

  // Chip bar mode: 'STATUS' or 'BANK'
  const [chipMode, setChipMode] = useState<'STATUS' | 'BANK'>('STATUS');
  const chipScrollRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);

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

  const refreshData = useCallback(() => {
    setProposals(StorageService.getProposals());
    setSelectedIds([]);
  }, []);

  useEffect(() => {
    refreshData();
    window.addEventListener('credit_gestao_storage_update', refreshData);
    return () => window.removeEventListener('credit_gestao_storage_update', refreshData);
  }, [refreshData]);

  const handleScrollChips = (direction: 'left' | 'right') => {
    if (chipScrollRef.current) {
      const scrollAmount = direction === 'left' ? -220 : 220;
      chipScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Pre-calculate counts per status and bank
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    statuses.forEach(s => {
      counts[s.id] = proposals.filter(p => p.statusId === s.id).length;
    });
    return counts;
  }, [statuses, proposals]);

  const bankCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    banks.forEach(b => {
      counts[b.id] = proposals.filter(p => p.bankId === b.id).length;
    });
    return counts;
  }, [banks, proposals]);

  const handleDeleteProposal = (proposal: Proposal) => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Proposta de Crédito',
      itemName: `ADE ${proposal.proposalNumber}`,
      description: 'Esta ação excluirá permanentemente a proposta e seus históricos, pendências e comentários vinculados.',
      onConfirm: () => {
        try {
          StorageService.deleteProposal(proposal.id);
          toastService.success('Proposta Excluída', `ADE ${proposal.proposalNumber} foi excluída.`);
          refreshData();
        } catch (err: any) {
          toastService.error('Erro ao Excluir', err.message || 'Erro ao excluir proposta.');
        }
      },
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Exclusão em Lote',
      itemName: `${selectedIds.length} proposta(s) selecionada(s)`,
      description: `Serão permanentemente excluídas as ${selectedIds.length} propostas selecionadas, bem como todos os vínculos e pendências associadas.`,
      onConfirm: () => {
        try {
          const result = StorageService.deleteProposals(selectedIds);
          refreshData();
          toastService.success('Exclusão Concluída', `${result.deletedCount} proposta(s) excluída(s) com sucesso.`);
        } catch (err: any) {
          toastService.error('Erro na Operação', err.message || 'Erro ao excluir propostas em lote.');
        }
      },
    });
  };

  // Helper to safely resolve client information from ID, CPF, or attached object
  const getProposalClientInfo = useCallback(
    (p: Proposal) => {
      const matched =
        clients.find(c => c.id === p.clientId) ||
        (p.clientId ? clients.find(c => c.id.toLowerCase() === p.clientId.toLowerCase()) : undefined) ||
        ((p as any).clientCpf ? clients.find(c => c.cpf?.replace(/\D/g, '') === (p as any).clientCpf?.replace(/\D/g, '')) : undefined) ||
        ((p as any).client || null);

      const fullName =
        matched?.fullName ||
        matched?.name ||
        (p as any).clientName ||
        (p as any).client?.fullName ||
        (p as any).client?.name ||
        '';

      const cpf =
        matched?.cpf ||
        (p as any).clientCpf ||
        (p as any).client?.cpf ||
        '';

      return { fullName, cpf, client: matched };
    },
    [clients]
  );

  // Filter & Sorting logic
  const filteredProposals = useMemo(() => {
    const filtered = proposals.filter(p => {
      const clientInfo = getProposalClientInfo(p);
      const partner = partners.find(pt => pt.id === p.partnerId);
      const status = statuses.find(s => s.id === p.statusId);

      // Search term (CPF, Name, ADE, Partner)
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const cleanTerm = normalizeCpf(term);
        const matchCpf = cleanTerm && clientInfo.cpf.includes(cleanTerm);
        const matchName = clientInfo.fullName.toLowerCase().includes(term);
        const matchAde = p.proposalNumber.toLowerCase().includes(term);
        const matchPartner = partner?.login.toLowerCase().includes(term);

        if (!matchCpf && !matchName && !matchAde && !matchPartner) {
          return false;
        }
      }

      if (filterProduct && p.productId !== filterProduct) return false;
      if (filterBank && p.bankId !== filterBank) return false;
      if (filterPromoter && p.promoterId !== filterPromoter) return false;
      if (filterPartner && p.partnerId !== filterPartner) return false;
      if (filterStatus && p.statusId !== filterStatus) return false;
      if (filterAlçada && status?.responsible !== filterAlçada) return false;

      // SLA filter for portability
      if (filterSla !== 'TODOS') {
        if (p.productId !== 'prod-port') return false;
        const isCip = status?.code === 'AGUARDAR_RETORNO_CIP';
        if (!isCip) return false;

        const start = p.portabilitySlaStartedAt || p.createdAt;
        const diffDays = Math.floor((new Date().getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));

        if (filterSla === 'NO_PRAZO' && diffDays >= 5) return false;
        if (filterSla === '5_DIA' && diffDays !== 4 && diffDays !== 5) return false;
        if (filterSla === 'ATRASADO' && diffDays < 6) return false;
      }

      return true;
    });

    // Sort
    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'proposalNumber') {
        comparison = a.proposalNumber.localeCompare(b.proposalNumber);
      } else if (sortField === 'clientName') {
        const nameA = getProposalClientInfo(a).fullName;
        const nameB = getProposalClientInfo(b).fullName;
        comparison = nameA.localeCompare(nameB);
      } else if (sortField === 'cpf') {
        const cpfA = getProposalClientInfo(a).cpf;
        const cpfB = getProposalClientInfo(b).cpf;
        comparison = cpfA.localeCompare(cpfB);
      } else if (sortField === 'bank') {
        const bankA = banks.find(bk => bk.id === a.bankId)?.name || '';
        const bankB = banks.find(bk => bk.id === b.bankId)?.name || '';
        comparison = bankA.localeCompare(bankB);
      } else if (sortField === 'disbursedValue') {
        const valA = a.disbursedValue || 0;
        const valB = b.disbursedValue || 0;
        comparison = valA - valB;
      } else {
        // createdAt
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [
    proposals,
    getProposalClientInfo,
    partners,
    statuses,
    banks,
    searchTerm,
    filterProduct,
    filterBank,
    filterPromoter,
    filterPartner,
    filterStatus,
    filterAlçada,
    filterSla,
    sortField,
    sortDirection,
  ]);

  // Selection helpers
  const handleSelectAll = () => {
    if (selectedIds.length === filteredProposals.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProposals.map(p => p.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterProduct('');
    setFilterBank('');
    setFilterPromoter('');
    setFilterPartner('');
    setFilterStatus('');
    setFilterAlçada('');
    setFilterSla('TODOS');
    try {
      sessionStorage.removeItem('cg_production_filters');
    } catch {}
    toastService.info('Filtros Limpos', 'Exibindo todas as propostas.');
  };

  const hasActiveFilters =
    searchTerm ||
    filterProduct ||
    filterBank ||
    filterPromoter ||
    filterPartner ||
    filterStatus ||
    filterAlçada ||
    filterSla !== 'TODOS';

  const totalDisbursedFiltered = useMemo(() => {
    return formatCurrency(filteredProposals.reduce((sum, p) => sum + (p.disbursedValue || 0), 0));
  }, [filteredProposals]);

  const proposalIdsList = useMemo(() => filteredProposals.map(p => p.id), [filteredProposals]);

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-60" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-blue-600 dark:text-blue-400 font-bold" />
    ) : (
      <ArrowDown className="h-3 w-3 text-blue-600 dark:text-blue-400 font-bold" />
    );
  };

  const cellPadding = tableDensity === 'COMPACTA' ? 'py-2 px-3' : 'py-3.5 px-3';

  return (
    <div className="space-y-3.5">
      {/* Contextual Action Bar */}
      <ActionBar
        title="Todas as Propostas"
        count={filteredProposals.length}
        financialTotal={totalDisbursedFiltered}
        rightActions={
          <>
            {/* Table Density Switcher */}
            <button
              onClick={toggleDensity}
              title={`Densidade: ${tableDensity} (clique para alternar)`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline text-[11px]">{tableDensity === 'COMPACTA' ? 'Compacta' : 'Confortável'}</span>
            </button>

            {onToggleFocusMode && (
              <button
                id="btn-production-focus-mode"
                onClick={onToggleFocusMode}
                title={isFocusMode ? 'Sair do Modo Foco (Esc)' : 'Modo Foco: Oculta barra lateral e cabeçalho (Alt+F)'}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  isFocusMode
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {isFocusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5 text-blue-500" />}
                <span>{isFocusMode ? 'Sair do Foco' : 'Modo Foco'}</span>
                <kbd className={`ml-1 rounded px-1 text-[9px] font-mono ${isFocusMode ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                  Alt+F
                </kbd>
              </button>
            )}

            {onOpenImportExcel && (
              <button
                id="btn-open-import-excel"
                onClick={onOpenImportExcel}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                <span>Importar</span>
              </button>
            )}

            <button
              id="btn-open-export"
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Exportar</span>
            </button>

            <button
              id="btn-open-new-production"
              onClick={onOpenNewProduction}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nova Proposta</span>
              <kbd className="ml-1 rounded bg-blue-700/60 px-1 text-[9px] font-mono text-blue-100">Ctrl+N</kbd>
            </button>
          </>
        }
      />

      {/* Horizontal Scrollable Filter Chips Bar */}
      <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800/80 p-3 shadow-2xs space-y-2">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400 mr-1">
              Filtro Rápido:
            </span>
            <div className="flex rounded-lg bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setChipMode('STATUS')}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                  chipMode === 'STATUS'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span>Por Status</span>
              </button>
              <button
                onClick={() => setChipMode('BANK')}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                  chipMode === 'BANK'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Building2 className="h-3 w-3 text-indigo-500" />
                <span>Por Banco</span>
              </button>
            </div>
          </div>

          {/* Scroll Navigation Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleScrollChips('left')}
              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Rolar para a esquerda"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleScrollChips('right')}
              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Rolar para a direita"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Chips List */}
        <div
          ref={chipScrollRef}
          className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {chipMode === 'STATUS' ? (
            <>
              {/* All Statuses Chip */}
              <button
                onClick={() => setFilterStatus('')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border cursor-pointer ${
                  filterStatus === ''
                    ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white border-transparent shadow-xs ring-2 ring-blue-500/30'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>Todos</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    filterStatus === ''
                      ? 'bg-slate-700 dark:bg-blue-800 text-slate-100'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {proposals.length}
                </span>
              </button>

              {/* Status Chips */}
              {statuses.map(s => {
                const isSelected = filterStatus === s.id;
                const count = statusCounts[s.id] || 0;
                return (
                  <button
                    key={s.id}
                    onClick={() => setFilterStatus(isSelected ? '' : s.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 border-blue-400 dark:border-blue-500/60 shadow-xs ring-2 ring-blue-500/20'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: s.color || '#3b82f6' }}
                    />
                    <span className="whitespace-nowrap">{s.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {/* All Banks Chip */}
              <button
                onClick={() => setFilterBank('')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border cursor-pointer ${
                  filterBank === ''
                    ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white border-transparent shadow-xs ring-2 ring-blue-500/30'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>Todos</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    filterBank === ''
                      ? 'bg-slate-700 dark:bg-blue-800 text-slate-100'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {proposals.length}
                </span>
              </button>

              {/* Bank Chips */}
              {banks.map(b => {
                const isSelected = filterBank === b.id;
                const count = bankCounts[b.id] || 0;
                return (
                  <button
                    key={b.id}
                    onClick={() => setFilterBank(isSelected ? '' : b.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 border-blue-400 dark:border-blue-500/60 shadow-xs ring-2 ring-blue-500/20'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Building2
                      className={`h-3.5 w-3.5 ${
                        isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                      }`}
                    />
                    <span className="whitespace-nowrap">{b.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#0c1220] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {/* Quick Search */}
          <div className="relative col-span-1 sm:col-span-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar CPF, Nome, ADE ou Parceiro..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:outline-hidden transition-colors"
            />
          </div>

          {/* Status */}
          <div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="">Todos os Status</option>
              {statuses.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Alçada */}
          <div>
            <select
              value={filterAlçada}
              onChange={e => setFilterAlçada(e.target.value as any)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="">Todas as Alçadas</option>
              <option value="CLIENTE">CLIENTE</option>
              <option value="PARCEIRO">PARCEIRO</option>
              <option value="BANCO">BANCO</option>
              <option value="NOSSA EQUIPE">NOSSA EQUIPE</option>
              <option value="SISTEMA">SISTEMA</option>
            </select>
          </div>

          {/* Banco */}
          <div>
            <select
              value={filterBank}
              onChange={e => setFilterBank(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="">Todos os Bancos</option>
              {banks.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Promotora */}
          <div>
            <select
              value={filterPromoter}
              onChange={e => setFilterPromoter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="">Todas Promotoras</option>
              {promoters.map(pr => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>
          </div>

          {/* Produto */}
          <div>
            <select
              value={filterProduct}
              onChange={e => setFilterProduct(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="">Todos os Produtos</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Parceiro */}
          <div>
            <PartnerSearchSelect
              partners={partners}
              selectedPartnerId={filterPartner}
              onSelectPartner={setFilterPartner}
              label=""
              placeholder="Filtrar por Agente..."
              allowAll
              allLabel="Todos os Parceiros"
            />
          </div>

          {/* SLA Portabilidade */}
          <div>
            <select
              value={filterSla}
              onChange={e => setFilterSla(e.target.value as any)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="TODOS">SLA: Todas</option>
              <option value="NO_PRAZO">SLA: No Prazo</option>
              <option value="5_DIA">SLA: No 5º Dia</option>
              <option value="ATRASADO">SLA: Atrasadas</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <div className="flex items-center">
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-bold px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-800/60 transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Limpar Filtros</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Batch Action Floating / Sticky Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-slate-900 dark:bg-[#070c17] text-white p-3 px-5 shadow-xl border border-blue-500/30 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="h-6 w-6 rounded-full bg-blue-500 text-xs font-black flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold">
              proposta(s) selecionada(s) para operação em lote
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-300 hover:text-white px-2 py-1 cursor-pointer"
            >
              Desmarcar Todas
            </button>
            <button
              id="btn-open-bulk-status"
              onClick={() => setBulkModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>ALTERAR STATUS EM LOTE</span>
            </button>
            <button
              id="btn-bulk-delete"
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs cursor-pointer"
              title="Excluir propostas selecionadas"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>EXCLUIR SELECIONADAS</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty State vs Main Proposals Table */}
      {proposals.length === 0 ? (
        <EmptyState
          title="Nenhuma proposta de crédito cadastrada"
          description="Sua esteira de produção está pronta para receber cadastros. Comece criando uma nova proposta manualmente ou importando uma planilha Excel."
          actionLabel="+ Nova Proposta"
          onAction={onOpenNewProduction}
          secondaryActionLabel={onOpenImportExcel ? 'Importar Planilha' : undefined}
          onSecondaryAction={onOpenImportExcel}
        />
      ) : filteredProposals.length === 0 ? (
        <EmptyState
          title="Nenhuma proposta encontrada com os filtros selecionados"
          description="Tente redefinir os parâmetros de busca, status ou banco para visualizar outras propostas."
          actionLabel="Limpar Todos os Filtros"
          onAction={clearFilters}
        />
      ) : (
        /* Main Proposals Table */
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          <div className="overflow-x-auto max-h-[calc(100vh-270px)]">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">
                    <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer" aria-label="Selecionar todas">
                      {selectedIds.length === filteredProposals.length && filteredProposals.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('proposalNumber')}>
                    <div className="flex items-center gap-1">
                      <span>ADE / Proposta</span>
                      {getSortIcon('proposalNumber')}
                    </div>
                  </th>
                  <th className="px-3 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('clientName')}>
                    <div className="flex items-center gap-1">
                      <span>Cliente</span>
                      {getSortIcon('clientName')}
                    </div>
                  </th>
                  <th className="px-3 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('cpf')}>
                    <div className="flex items-center gap-1">
                      <span>CPF</span>
                      {getSortIcon('cpf')}
                    </div>
                  </th>
                  <th className="px-3 py-2.5">Produto</th>
                  <th className="px-3 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('bank')}>
                    <div className="flex items-center gap-1">
                      <span>Banco / Promotora</span>
                      {getSortIcon('bank')}
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('disbursedValue')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Valores (R$)</span>
                      {getSortIcon('disbursedValue')}
                    </div>
                  </th>
                  <th className="px-3 py-2.5">Parceiro</th>
                  <th className="px-3 py-2.5">Alçada</th>
                  <th className="px-3 py-2.5">Status Atual</th>
                  <th className="px-3 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('createdAt')}>
                    <div className="flex items-center gap-1">
                      <span>Data</span>
                      {getSortIcon('createdAt')}
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                {filteredProposals.map(p => {
                  const clientInfo = getProposalClientInfo(p);
                  const client = clientInfo.client;
                  const clientFullName = clientInfo.fullName;
                  const clientCpf = clientInfo.cpf;
                  const product = products.find(pr => pr.id === p.productId);
                  const bank = banks.find(b => b.id === p.bankId);
                  const promoter = promoters.find(pr => pr.id === p.promoterId);
                  const partner = partners.find(pt => pt.id === p.partnerId);
                  const status = statuses.find(s => s.id === p.statusId);
                  const isSelected = selectedIds.includes(p.id);

                  return (
                    <tr
                      key={p.id}
                      onDoubleClick={() => setDetailProposalId(p.id)}
                      className={`hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none ${
                        isSelected ? 'bg-blue-50/50 dark:bg-blue-950/40' : ''
                      }`}
                      title="Clique duas vezes para abrir detalhes completos"
                    >
                      <td className={`${cellPadding} text-center`} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => toggleSelect(p.id)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      {/* ADE */}
                      <td className={cellPadding}>
                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 dark:text-slate-100">
                          <button
                            onClick={() => setDetailProposalId(p.id)}
                            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>{p.proposalNumber}</span>
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              toastService.copyToClipboard(p.proposalNumber, 'ADE');
                            }}
                            className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                            title="Copiar ADE"
                            aria-label="Copiar ADE"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          {p.relatedPortabilityId && (
                            <span title="Vinculada a uma portabilidade">
                              <Link2 className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className={cellPadding}>
                        <span
                          className="font-semibold text-slate-900 dark:text-slate-100 block max-w-[150px] truncate"
                          title={clientFullName}
                        >
                          {clientFullName || '—'}
                        </span>
                      </td>

                      {/* CPF */}
                      <td className={cellPadding}>
                        {clientCpf ? (
                          <div className="flex items-center gap-1 font-mono text-slate-600 dark:text-slate-400">
                            <span>{formatCpf(clientCpf)}</span>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                toastService.copyToClipboard(clientCpf, 'CPF');
                              }}
                              className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                              title="Copiar CPF"
                              aria-label="Copiar CPF"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      {/* Produto */}
                      <td className={`${cellPadding} font-semibold text-slate-800 dark:text-slate-200`}>
                        {product?.name || '—'}
                      </td>

                      {/* Banco / Promotora */}
                      <td className={cellPadding}>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate max-w-[140px]" title={bank?.name}>
                          {bank?.name || '—'}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 block text-[10.5px] truncate max-w-[140px]" title={promoter?.name}>
                          {promoter?.name || '—'}
                        </span>
                      </td>

                      {/* Valores Financeiros (Right aligned, Mono) */}
                      <td className={`${cellPadding} text-right whitespace-nowrap`}>
                        <div className="flex flex-col text-[11px] font-mono">
                          {p.disbursedValue !== undefined ? (
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(p.disbursedValue)}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                          {p.contractBalance !== undefined ? (
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400 text-[10px]">
                              Saldo: {formatCurrency(p.contractBalance)}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Parceiro */}
                      <td className={cellPadding}>
                        <span className="font-mono text-blue-700 dark:text-blue-400 font-bold block">
                          {partner?.login || '—'}
                        </span>
                        <span
                          className="text-slate-400 dark:text-slate-500 text-[10px] block truncate max-w-[110px]"
                          title={partner?.login}
                        >
                          {partner?.login || '—'}
                        </span>
                      </td>

                      {/* Alçada */}
                      <td className={cellPadding}>
                        <AuthorityBadge responsible={status?.responsible} />
                      </td>

                      {/* Status */}
                      <td className={cellPadding}>
                        <StatusBadge status={status} />
                      </td>

                      {/* Data */}
                      <td className={`${cellPadding} text-slate-500 dark:text-slate-400 whitespace-nowrap text-[11px] font-mono`}>
                        {formatDate(p.createdAt)}
                      </td>

                      {/* Action */}
                      <td className={`${cellPadding} text-center`} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setDetailProposalId(p.id)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Ver detalhes da proposta"
                            aria-label="Ver detalhes da proposta"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProposal(p)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Excluir proposta"
                            aria-label="Excluir proposta"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {bulkModalOpen && (
        <BulkStatusModal
          isOpen={bulkModalOpen}
          selectedProposalIds={selectedIds}
          onClose={() => setBulkModalOpen(false)}
          onSuccess={refreshData}
        />
      )}

      {exportModalOpen && (
        <ExcelExportModal
          isOpen={exportModalOpen}
          proposals={filteredProposals}
          onClose={() => setExportModalOpen(false)}
        />
      )}

      {detailProposalId && (
        <ProposalDetailModal
          proposalId={detailProposalId}
          proposalIdsList={proposalIdsList}
          onSelectProposal={setDetailProposalId}
          onClose={() => setDetailProposalId(null)}
          onProposalUpdated={refreshData}
        />
      )}

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
