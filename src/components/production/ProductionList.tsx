import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PartnerSearchSelect } from '../common/PartnerSearchSelect';
import {
  Search,
  Filter,
  Layers,
  Download,
  Plus,
  ArrowUpDown,
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { normalizeCpf, formatCpf, formatDate, extractPartnerCode } from '../../lib/utils';
import { Proposal, ResponsibleAlçada } from '../../types';
import { BulkStatusModal } from './BulkStatusModal';
import { ExcelExportModal } from './ExcelExportModal';
import { ProposalDetailModal } from './ProposalDetailModal';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

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

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProduct, setFilterProduct] = useState(initialFilter?.productId || '');
  const [filterBank, setFilterBank] = useState(initialFilter?.bankId || '');
  const [filterPromoter, setFilterPromoter] = useState(initialFilter?.promoterId || '');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterStatus, setFilterStatus] = useState(initialFilter?.statusId || '');
  const [filterAlçada, setFilterAlçada] = useState<ResponsibleAlçada | ''>(initialFilter?.alçada || '');
  const [filterSla, setFilterSla] = useState<'TODOS' | 'NO_PRAZO' | '5_DIA' | 'ATRASADO'>('TODOS');

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

  const refreshData = () => {
    setProposals(StorageService.getProposals());
    setSelectedIds([]);
  };

  useEffect(() => {
    refreshData();
    window.addEventListener('credit_gestao_storage_update', refreshData);
    return () => window.removeEventListener('credit_gestao_storage_update', refreshData);
  }, []);

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
          refreshData();
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir proposta.');
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
          alert(`${result.deletedCount} proposta(s) excluída(s) com sucesso.`);
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir propostas em lote.');
        }
      },
    });
  };

  // Filter logic
  const filteredProposals = useMemo(() => {
    const holidays = StorageService.getHolidays();
    const config = StorageService.getConfig();

    return proposals.filter(p => {
      const client = clients.find(c => c.id === p.clientId);
      const partner = partners.find(pt => pt.id === p.partnerId);
      const status = statuses.find(s => s.id === p.statusId);

      // Search term (CPF, Name, ADE)
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const cleanTerm = normalizeCpf(term);
        const matchCpf = cleanTerm && client?.cpf.includes(cleanTerm);
        const matchName = client?.fullName.toLowerCase().includes(term);
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
        // Check days in CIP
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
  }, [
    proposals,
    clients,
    partners,
    statuses,
    searchTerm,
    filterProduct,
    filterBank,
    filterPromoter,
    filterPartner,
    filterStatus,
    filterAlçada,
    filterSla,
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

  return (
    <div className="space-y-4">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-slate-900">Produção Geral</h2>
          <p className="text-xs text-slate-500">
            Total de {filteredProposals.length} de {proposals.length} propostas listadas
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onToggleFocusMode && (
            <button
              id="btn-production-focus-mode"
              onClick={onToggleFocusMode}
              title={isFocusMode ? 'Sair do Modo Foco (Esc)' : 'Modo Foco: Oculta barra lateral e cabeçalho (Alt+F)'}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors shadow-2xs ${
                isFocusMode
                  ? 'bg-blue-600 text-white border-blue-700 font-bold'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isFocusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5 text-blue-600" />}
              <span>{isFocusMode ? 'Sair do Foco' : 'Modo Foco'}</span>
              <kbd className={`ml-1 rounded px-1 text-[9px] font-mono ${isFocusMode ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                Alt+F
              </kbd>
            </button>
          )}

          {onOpenImportExcel && (
            <button
              id="btn-open-import-excel"
              onClick={onOpenImportExcel}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>Importar Planilha</span>
            </button>
          )}

          <button
            id="btn-open-export"
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar ({filteredProposals.length})</span>
          </button>

          <button
            id="btn-open-new-production"
            onClick={onOpenNewProduction}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Produção</span>
            <kbd className="ml-1 rounded bg-emerald-800/60 px-1 text-[9px] font-mono text-emerald-100">Ctrl+N</kbd>
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Filter Chips Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
              Filtro Rápido:
            </span>
            <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                onClick={() => setChipMode('STATUS')}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                  chipMode === 'STATUS'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Por Status</span>
              </button>
              <button
                onClick={() => setChipMode('BANK')}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                  chipMode === 'BANK'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="h-3 w-3" />
                <span>Por Banco</span>
              </button>
            </div>
          </div>

          {/* Scroll Navigation Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleScrollChips('left')}
              className="p-1 rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
              title="Rolar para a esquerda"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleScrollChips('right')}
              className="p-1 rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border ${
                  filterStatus === ''
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-slate-400/30'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <span>Todos</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    filterStatus === ''
                      ? 'bg-slate-700 text-slate-100'
                      : 'bg-slate-200 text-slate-700'
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
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all border ${
                      isSelected
                        ? 'bg-blue-50 text-blue-900 border-blue-400 shadow-xs ring-2 ring-blue-500/20'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
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
                          : 'bg-slate-100 text-slate-600'
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border ${
                  filterBank === ''
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-slate-400/30'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <span>Todos</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    filterBank === ''
                      ? 'bg-slate-700 text-slate-100'
                      : 'bg-slate-200 text-slate-700'
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
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all border ${
                      isSelected
                        ? 'bg-blue-50 text-blue-900 border-blue-400 shadow-xs ring-2 ring-blue-500/20'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <Building2
                      className={`h-3.5 w-3.5 ${
                        isSelected ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    />
                    <span className="whitespace-nowrap">{b.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
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
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {/* Quick Search */}
          <div className="relative col-span-1 sm:col-span-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar CPF, Nome, ADE ou Parceiro..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Status */}
          <div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
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
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
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
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
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
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
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
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
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
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
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
                className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 bg-rose-50 rounded border border-rose-200"
              >
                <X className="h-3 w-3" />
                <span>Limpar Filtros</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Batch Action Floating / Sticky Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-slate-900 text-white p-3 px-5 shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="h-6 w-6 rounded-full bg-blue-500 text-xs font-bold flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-medium">
              proposta(s) selecionada(s) para operação em massa
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-300 hover:text-white px-2 py-1"
            >
              Desmarcar Todas
            </button>
            <button
              id="btn-open-bulk-status"
              onClick={() => setBulkModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>ALTERAR STATUS EM LOTE</span>
            </button>
            <button
              id="btn-bulk-delete"
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs"
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
        /* Professional Onboarding Empty State */
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-2xs space-y-5">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
            <Inbox className="h-8 w-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-bold text-slate-900">
              Nenhuma proposta de crédito cadastrada
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Sua esteira de produção está pronta para receber cadastros. Comece criando uma nova
              proposta manualmente ou importando uma planilha Excel em lote.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={onOpenNewProduction}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar Primeira Proposta</span>
            </button>
            {onOpenImportExcel && (
              <button
                onClick={onOpenImportExcel}
                className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs transition-all"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Importar Planilha Excel</span>
              </button>
            )}
          </div>
        </div>
      ) : filteredProposals.length === 0 ? (
        /* Filter Mismatch Empty State */
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-2xs space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
            <SearchX className="h-6 w-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-sm font-bold text-slate-800">
              Nenhuma proposta encontrada com os filtros selecionados
            </h3>
            <p className="text-xs text-slate-500">
              Tente redefinir os parâmetros de busca, status ou banco para visualizar outras propostas.
            </p>
          </div>
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-3.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Limpar Todos os Filtros</span>
          </button>
        </div>
      ) : (
        /* Main Proposals Table */
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 w-10 text-center">
                    <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-600">
                      {selectedIds.length === filteredProposals.length && filteredProposals.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-3">ADE / Proposta</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">CPF</th>
                  <th className="px-3 py-3">Produto</th>
                  <th className="px-3 py-3">Banco / Promotora</th>
                  <th className="px-3 py-3">Parceiro</th>
                  <th className="px-3 py-3">Alçada</th>
                  <th className="px-3 py-3">Status Atual</th>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredProposals.map(p => {
                  const client = clients.find(c => c.id === p.clientId);
                  const product = products.find(pr => pr.id === p.productId);
                  const bank = banks.find(b => b.id === p.bankId);
                  const promoter = promoters.find(pr => pr.id === p.promoterId);
                  const partner = partners.find(pt => pt.id === p.partnerId);
                  const status = statuses.find(s => s.id === p.statusId);
                  const isSelected = selectedIds.includes(p.id);

                  // Alçada badge styling
                  const alcadaColors: Record<ResponsibleAlçada, string> = {
                    CLIENTE: 'bg-orange-50 text-orange-700 border-orange-200',
                    PARCEIRO: 'bg-amber-50 text-amber-700 border-amber-200',
                    BANCO: 'bg-blue-50 text-blue-700 border-blue-200',
                    'NOSSA EQUIPE': 'bg-purple-50 text-purple-700 border-purple-200',
                    SISTEMA: 'bg-slate-100 text-slate-700 border-slate-200',
                  };

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => toggleSelect(p.id)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      {/* ADE */}
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setDetailProposalId(p.id)}
                          className="font-mono font-bold text-slate-900 hover:text-blue-600 hover:underline flex items-center gap-1.5"
                        >
                          <span>{p.proposalNumber}</span>
                          {p.relatedPortabilityId && (
                            <span title="Vinculada a uma portabilidade">
                              <Link2 className="h-3 w-3 text-purple-600" />
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Cliente */}
                      <td className="px-3 py-3">
                        <span className="font-semibold text-slate-900 block max-w-[150px] truncate" title={client?.fullName}>
                          {client?.fullName}
                        </span>
                      </td>

                      {/* CPF */}
                      <td className="px-3 py-3 font-mono text-slate-600">
                        {formatCpf(client?.cpf || '')}
                      </td>

                      {/* Produto */}
                      <td className="px-3 py-3 font-semibold text-slate-800">
                        {product?.name}
                      </td>

                      {/* Banco / Promotora */}
                      <td className="px-3 py-3 text-slate-600">
                        <span className="font-semibold text-slate-800">{bank?.name}</span>
                        <span className="text-slate-400 block text-[11px]">{promoter?.name}</span>
                      </td>

                      {/* Parceiro */}
                      <td className="px-3 py-3">
                        <span className="font-mono text-blue-700 font-bold block">
                          {partner ? extractPartnerCode(partner.login) : ''}
                        </span>
                        <span className="text-slate-400 text-[10px] block truncate max-w-[110px]" title={partner?.login}>
                          {partner?.login}
                        </span>
                      </td>

                      {/* Alçada */}
                      <td className="px-3 py-3">
                        {status && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                              alcadaColors[status.responsible]
                            }`}
                          >
                            {status.responsible}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs whitespace-nowrap"
                          style={{ backgroundColor: status?.color || '#64748b' }}
                        >
                          {status?.name}
                        </span>
                      </td>

                      {/* Data */}
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap text-[11px]">
                        {formatDate(p.createdAt)}
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setDetailProposalId(p.id)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100"
                            title="Ver detalhes da proposta"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProposal(p)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                            title="Excluir proposta"
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
