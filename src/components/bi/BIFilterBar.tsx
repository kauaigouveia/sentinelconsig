import React, { useState } from 'react';
import {
  Calendar,
  Filter,
  RotateCcw,
  RefreshCw,
  Building2,
  Users,
  Briefcase,
  Radio,
  ChevronDown,
} from 'lucide-react';
import { BIFilterState, BIPeriodPreset } from '../../types/bi';
import { StorageService } from '../../services/storageService';
import { RealtimeService } from '../../services/realtimeService';

interface BIFilterBarProps {
  filters: BIFilterState;
  onFilterChange: (newFilters: Partial<BIFilterState>) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  lastUpdated?: Date | null;
}

const PERIOD_LABELS: Record<BIPeriodPreset, string> = {
  HOJE: 'Hoje',
  ONTEM: 'Ontem',
  ULTIMOS_7_DIAS: '7 Dias',
  ULTIMOS_30_DIAS: '30 Dias',
  MES_ATUAL: 'Mês Atual',
  MES_ANTERIOR: 'Mês Anterior',
  PERSONALIZADO: 'Personalizado',
};

export const BIFilterBar: React.FC<BIFilterBarProps> = ({
  filters,
  onFilterChange,
  onRefresh,
  isLoading = false,
  lastUpdated,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const banks = StorageService.getBanks();
  const partners = StorageService.getPartners();
  const products = StorageService.getProducts();
  const realtimeProvider = RealtimeService.getInstance().getProviderName();

  const handlePeriodClick = (preset: BIPeriodPreset) => {
    if (preset === 'PERSONALIZADO') {
      onFilterChange({
        period: 'PERSONALIZADO',
      });
      setShowAdvanced(true);
    } else {
      onFilterChange({
        period: preset,
        startDate: undefined,
        endDate: undefined,
      });
    }
  };

  const handleReset = () => {
    onFilterChange({
      period: 'MES_ATUAL',
      startDate: undefined,
      endDate: undefined,
      bankId: undefined,
      partnerId: undefined,
      productId: undefined,
      statusId: undefined,
      standardCategory: undefined,
    });
    setShowAdvanced(false);
  };

  const hasActiveFilters = Boolean(
    filters.period !== 'MES_ATUAL' ||
    filters.bankId ||
    filters.partnerId ||
    filters.productId ||
    filters.statusId ||
    filters.startDate ||
    filters.endDate
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs transition-all space-y-3">
      {/* Top Row: Presets & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Presets Segmented Control */}
        <div className="flex items-center flex-wrap gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
          {(['HOJE', 'ONTEM', 'ULTIMOS_7_DIAS', 'ULTIMOS_30_DIAS', 'MES_ATUAL', 'MES_ANTERIOR', 'PERSONALIZADO'] as BIPeriodPreset[]).map((preset) => {
            const isActive = filters.period === preset;
            return (
              <button
                key={preset}
                id={`bi-filter-preset-${preset.toLowerCase()}`}
                type="button"
                onClick={() => handlePeriodClick(preset)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-2xs border border-slate-200/60 dark:border-slate-700/80'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {PERIOD_LABELS[preset]}
              </button>
            );
          })}
        </div>

        {/* Right side status & action buttons */}
        <div className="flex items-center gap-2">
          {/* Pusher Realtime Badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
            title={`Realtime via ${realtimeProvider}: Invalidação e revalidação instantânea do PostgreSQL`}
          >
            <Radio className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-pulse" />
            <span>{realtimeProvider} Live</span>
          </div>

          {/* Toggle Advanced Filters */}
          <button
            id="bi-filter-toggle-advanced"
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
              showAdvanced || hasActiveFilters
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200/70'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              id="bi-filter-reset-button"
              type="button"
              onClick={handleReset}
              className="p-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Limpar todos os filtros"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Manual Refresh */}
          <button
            id="bi-filter-refresh-button"
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-2xs transition-all cursor-pointer"
            title="Atualizar dados do PostgreSQL"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Collapsible Bar */}
      {showAdvanced && (
        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 animate-fadeIn">
          {/* Custom Date Pickers */}
          {filters.period === 'PERSONALIZADO' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Data Inicial
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="bi-filter-start-date"
                    type="date"
                    value={filters.startDate ? filters.startDate.split('T')[0] : ''}
                    onChange={(e) => onFilterChange({ startDate: e.target.value })}
                    className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Data Final
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="bi-filter-end-date"
                    type="date"
                    value={filters.endDate ? filters.endDate.split('T')[0] : ''}
                    onChange={(e) => onFilterChange({ endDate: e.target.value })}
                    className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </>
          )}

          {/* Bank Select */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Banco
            </label>
            <div className="relative">
              <Building2 className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                id="bi-filter-bank"
                value={filters.bankId || ''}
                onChange={(e) => onFilterChange({ bankId: e.target.value || undefined })}
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:outline-hidden appearance-none cursor-pointer"
              >
                <option value="">Todos os Bancos</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} - {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Partner Select */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Correspondente / Parceiro
            </label>
            <div className="relative">
              <Users className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                id="bi-filter-partner"
                value={filters.partnerId || ''}
                onChange={(e) => onFilterChange({ partnerId: e.target.value || undefined })}
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:outline-hidden appearance-none cursor-pointer"
              >
                <option value="">Todos os Parceiros</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Select */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Operação / Produto
            </label>
            <div className="relative">
              <Briefcase className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                id="bi-filter-product"
                value={filters.productId || ''}
                onChange={(e) => onFilterChange({ productId: e.target.value || undefined })}
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:outline-hidden appearance-none cursor-pointer"
              >
                <option value="">Todos os Produtos</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Footer info: Last Updated */}
      {lastUpdated && (
        <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-between select-none">
          <span>Fonte: PostgreSQL (Auditada)</span>
          <span>Última atualização: {lastUpdated.toLocaleTimeString('pt-BR')}</span>
        </div>
      )}
    </div>
  );
};
