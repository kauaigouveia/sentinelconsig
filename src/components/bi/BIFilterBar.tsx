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
  Bookmark,
} from 'lucide-react';
import { BIFilterState, BIPeriodPreset } from '../../types/bi';
import { StorageService } from '../../services/storageService';

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
  ANO_ATUAL: 'Ano Atual',
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
  const convenios = StorageService.getConvenios();
  const statuses = StorageService.getStatuses();
  const users = StorageService.getUsers().filter((user) => user.active);

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
      convenioId: undefined,
      statusId: undefined,
      standardCategory: undefined,
      digitizerId: undefined,
      assignedToId: undefined,
      source: undefined,
      proposalType: undefined,
      groupBy: 'day',
    });
    setShowAdvanced(false);
  };

  const hasActiveFilters = Boolean(
    filters.period !== 'MES_ATUAL' ||
    filters.bankId ||
    filters.partnerId ||
    filters.digitizerId ||
    filters.assignedToId ||
    filters.productId ||
    filters.convenioId ||
    filters.statusId ||
    filters.standardCategory ||
    filters.source ||
    filters.proposalType ||
    filters.groupBy !== 'day' ||
    filters.startDate ||
    filters.endDate
  );

  return (
    <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5  transition-all space-y-3">
      {/* Top Row: Presets & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Presets Segmented Control */}
        <div className="flex items-center flex-wrap gap-1 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] p-1 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)]">
          {(['HOJE', 'ONTEM', 'ULTIMOS_7_DIAS', 'ULTIMOS_30_DIAS', 'MES_ATUAL', 'MES_ANTERIOR', 'ANO_ATUAL', 'PERSONALIZADO'] as BIPeriodPreset[]).map((preset) => {
            const isActive = filters.period === preset;
            return (
              <button
                key={preset}
                id={`bi-filter-preset-${preset.toLowerCase()}`}
                type="button"
                onClick={() => handlePeriodClick(preset)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--link)] dark:text-[var(--link)] font-bold  border border-[var(--field-border)] dark:border-[var(--field-border)]'
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                }`}
              >
                {PERIOD_LABELS[preset]}
              </button>
            );
          })}
        </div>

        {/* Right side status & action buttons */}
        <div className="flex items-center gap-2">
          {/* Realtime Sync Badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)]"
            title="Dados sincronizados automaticamente com a base oficial"
          >
            <Radio className="w-3 h-3 text-[var(--success-text)] dark:text-[var(--success-text)] animate-pulse" />
            <span>Atualização em Tempo Real</span>
          </div>

          {/* Toggle Advanced Filters */}
          <button
            id="bi-filter-toggle-advanced"
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
              showAdvanced || hasActiveFilters
                ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]'
                : 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros Detalhados</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              id="bi-filter-reset-button"
              type="button"
              onClick={handleReset}
              className="p-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] rounded-lg transition-colors cursor-pointer"
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
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-[var(--action-ink)] bg-[var(--action)] hover:bg-[var(--action-hover)] disabled:opacity-90 rounded-lg  transition-all cursor-pointer"
            title="Atualizar dados do painel"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Collapsible Bar */}
      {showAdvanced && (
        <div className="pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 animate-fadeIn">
          {/* Custom Date Pickers */}
          {filters.period === 'PERSONALIZADO' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">
                  Data Inicial
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                  <input
                    id="bi-filter-start-date"
                    type="date"
                    value={filters.startDate ? filters.startDate.split('T')[0] : ''}
                    max={filters.endDate ? filters.endDate.split('T')[0] : undefined}
                    onChange={(e) => onFilterChange({ startDate: e.target.value })}
                    aria-label="Data inicial do período do BI"
                    className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">
                  Data Final
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                  <input
                    id="bi-filter-end-date"
                    type="date"
                    value={filters.endDate ? filters.endDate.split('T')[0] : ''}
                    min={filters.startDate ? filters.startDate.split('T')[0] : undefined}
                    onChange={(e) => onFilterChange({ endDate: e.target.value })}
                    aria-label="Data final do período do BI"
                    className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden"
                  />
                </div>
              </div>
            </>
          )}

          {/* Bank Select */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">
              Banco
            </label>
            <div className="relative">
              <Building2 className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
              <select
                id="bi-filter-bank"
                value={filters.bankId || ''}
                onChange={(e) => onFilterChange({ bankId: e.target.value || undefined })}
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden appearance-none cursor-pointer"
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
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">
              Correspondente / Parceiro
            </label>
            <div className="relative">
              <Users className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
              <select
                id="bi-filter-partner"
                value={filters.partnerId || ''}
                onChange={(e) => onFilterChange({ partnerId: e.target.value || undefined })}
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden appearance-none cursor-pointer"
              >
                <option value="">Todos os Parceiros</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName || p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Select */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">
              Operação / Produto
            </label>
            <div className="relative">
              <Briefcase className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
              <select
                id="bi-filter-product"
                value={filters.productId || ''}
                onChange={(e) => onFilterChange({ productId: e.target.value || undefined })}
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden appearance-none cursor-pointer"
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

          {/* Convenio Select */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">Convênio</label>
            <select
              id="bi-filter-convenio"
              value={filters.convenioId || ''}
              onChange={(e) => onFilterChange({ convenioId: e.target.value || undefined })}
              className="w-full px-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden cursor-pointer"
            >
              <option value="">Todos os Convênios</option>
              {convenios.map((convenio) => <option key={convenio.id} value={convenio.id}>{convenio.name}</option>)}
            </select>
          </div>

          {/* Status Select */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">Status</label>
            <select
              id="bi-filter-status"
              value={filters.statusId || ''}
              onChange={(e) => onFilterChange({ statusId: e.target.value || undefined })}
              className="w-full px-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden cursor-pointer"
            >
              <option value="">Todos os Status</option>
              {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
            </select>
          </div>

          {/* Responsible Operator Selects */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">Digitador</label>
            <select
              id="bi-filter-digitizer"
              value={filters.digitizerId || ''}
              onChange={(e) => onFilterChange({ digitizerId: e.target.value || undefined })}
              className="w-full px-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden cursor-pointer"
            >
              <option value="">Todos os Digitadores</option>
              {users.filter((user) => user.role === 'DIGITADOR').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">Responsável atual</label>
            <select
              id="bi-filter-assigned-to"
              value={filters.assignedToId || ''}
              onChange={(e) => onFilterChange({ assignedToId: e.target.value || undefined })}
              className="w-full px-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden cursor-pointer"
            >
              <option value="">Todos os Responsáveis</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </div>

          {/* Proposal Classification */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">Tipo de operação</label>
            <select
              id="bi-filter-proposal-type"
              value={filters.proposalType || ''}
              onChange={(e) => onFilterChange({ proposalType: e.target.value || undefined })}
              className="w-full px-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden cursor-pointer"
            >
              <option value="">Todos os Tipos</option>
              <option value="NOVO">Novo</option>
              <option value="REFIN">Refinanciamento</option>
              <option value="PORTABILIDADE">Portabilidade</option>
              <option value="REFIN_PORTABILIDADE">Refinanciamento de Portabilidade</option>
              <option value="CARTAO_RMC">Cartão RMC</option>
              <option value="CARTAO_RCC">Cartão RCC</option>
              <option value="SAQUE_COMPLEMENTAR">Saque Complementar</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">Categoria do status</label>
            <select
              id="bi-filter-standard-category"
              value={filters.standardCategory || ''}
              onChange={(e) => onFilterChange({ standardCategory: e.target.value || undefined })}
              className="w-full px-2.5 py-1 text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden cursor-pointer"
            >
              <option value="">Todas as Categorias</option>
              <option value="ESTEIRA">Esteira</option>
              <option value="ANDAMENTO">Em andamento</option>
              <option value="PENDENTE">Pendente</option>
              <option value="PAGO">Pago</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="RECUSADO">Recusado</option>
            </select>
          </div>
        </div>
      )}

      {/* Footer info: Last Updated */}
      {lastUpdated && (
        <div className="text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center justify-between select-none">
          <span>Base Oficial • Isolamento Multi-Tenant</span>
          <span>Última atualização: {lastUpdated.toLocaleTimeString('pt-BR')}</span>
        </div>
      )}
    </div>
  );
};
