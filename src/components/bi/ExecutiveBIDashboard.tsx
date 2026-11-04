import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Layers,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  Users,
  BarChart3,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  UserCheck,
  Workflow,
  AlertCircle,
  Briefcase,
  Layers3,
  Flame,
  Cpu,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  BIFilterState,
  BIPeriodPreset,
  BIOverviewResponse,
  BIProductionResponse,
  BIConversionFunnelResponse,
  BIBankAnalyticsResponse,
  BIProductAnalyticsResponse,
  BIConvenioAnalyticsResponse,
  BIPartnerAnalyticsResponse,
  BIOperatorAnalyticsResponse,
  BIPendencyAnalyticsResponse,
  BIBottlenecksResponse,
  BICancellationsResponse,
  BIRefusalsResponse,
  BIIntegrationsResponse,
  BIOperationalHealthResponse,
  BIComparisonResponse,
  BIRankingsResponse,
  BIMetricDelta,
} from '../../types/bi';
import { BIApiService } from '../../services/biApiService';
import { RealtimeService } from '../../services/realtimeService';
import { formatCurrency } from '../../lib/utils';
import { BIFilterBar } from './BIFilterBar';
import { toastService } from '../ui/toastService';

type BITab =
  | 'visao-geral'
  | 'producao'
  | 'conversao'
  | 'bancos'
  | 'produtos'
  | 'parceiros'
  | 'operadores'
  | 'sla-pendencias'
  | 'gargalos'
  | 'integracoes';

const getInitialFilters = (): BIFilterState => {
  const params = new URLSearchParams(window.location.search);
  const periodPresets: BIPeriodPreset[] = [
    'HOJE', 'ONTEM', 'ULTIMOS_7_DIAS', 'ULTIMOS_30_DIAS',
    'MES_ATUAL', 'MES_ANTERIOR', 'ANO_ATUAL', 'PERSONALIZADO',
  ];
  const requestedPeriod = params.get('period');
  const requestedGroupBy = params.get('groupBy');
  const requestedStartDate = params.get('startDate') || undefined;
  const requestedEndDate = params.get('endDate') || undefined;
  const hasInvertedDateRange = Boolean(
    requestedStartDate && requestedEndDate &&
    requestedStartDate.slice(0, 10) > requestedEndDate.slice(0, 10)
  );
  const period = periodPresets.includes(requestedPeriod as BIPeriodPreset)
    ? requestedPeriod as BIPeriodPreset
    : 'MES_ATUAL';
  const groupBy = requestedGroupBy === 'week' || requestedGroupBy === 'month'
    ? requestedGroupBy
    : 'day';
  return {
    period,
    startDate: hasInvertedDateRange ? undefined : requestedStartDate,
    endDate: hasInvertedDateRange ? undefined : requestedEndDate,
    bankId: params.get('bankId') || undefined,
    partnerId: params.get('partnerId') || undefined,
    digitizerId: params.get('digitizerId') || undefined,
    assignedToId: params.get('assignedToId') || undefined,
    productId: params.get('productId') || undefined,
    convenioId: params.get('convenioId') || undefined,
    source: params.get('source') || undefined,
    proposalType: params.get('proposalType') || undefined,
    statusId: params.get('statusId') || undefined,
    standardCategory: params.get('standardCategory') || undefined,
    groupBy,
  };
};

export const ExecutiveBIDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<BITab>('visao-geral');
  const [filters, setFilters] = useState<BIFilterState>(getInitialFilters);

  // Analytical Data States
  const [overview, setOverview] = useState<BIOverviewResponse | null>(null);
  const [production, setProduction] = useState<BIProductionResponse | null>(null);
  const [conversion, setConversion] = useState<BIConversionFunnelResponse | null>(null);
  const [banks, setBanks] = useState<BIBankAnalyticsResponse | null>(null);
  const [products, setProducts] = useState<BIProductAnalyticsResponse | null>(null);
  const [convenios, setConvenios] = useState<BIConvenioAnalyticsResponse | null>(null);
  const [partners, setPartners] = useState<BIPartnerAnalyticsResponse | null>(null);
  const [operators, setOperators] = useState<BIOperatorAnalyticsResponse | null>(null);
  const [pendencies, setPendencies] = useState<BIPendencyAnalyticsResponse | null>(null);
  const [bottlenecks, setBottlenecks] = useState<BIBottlenecksResponse | null>(null);
  const [cancellations, setCancellations] = useState<BICancellationsResponse | null>(null);
  const [refusals, setRefusals] = useState<BIRefusalsResponse | null>(null);
  const [integrations, setIntegrations] = useState<BIIntegrationsResponse | null>(null);
  const [operationalHealth, setOperationalHealth] = useState<BIOperationalHealthResponse | null>(null);
  const [comparison, setComparison] = useState<BIComparisonResponse | null>(null);
  const [_rankings, setRankings] = useState<BIRankingsResponse | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const debounceTimerRef = useRef<any>(null);
  const filterRefreshTimerRef = useRef<number | null>(null);
  const dataLoadRequestRef = useRef(0);

  // Sync state to URL Query Parameters
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.period) params.set('period', filters.period);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.bankId) params.set('bankId', filters.bankId);
    if (filters.partnerId) params.set('partnerId', filters.partnerId);
    if (filters.digitizerId) params.set('digitizerId', filters.digitizerId);
    if (filters.assignedToId) params.set('assignedToId', filters.assignedToId);
    if (filters.productId) params.set('productId', filters.productId);
    if (filters.convenioId) params.set('convenioId', filters.convenioId);
    if (filters.proposalType) params.set('proposalType', filters.proposalType);
    if (filters.statusId) params.set('statusId', filters.statusId);
    if (filters.standardCategory) params.set('standardCategory', filters.standardCategory);
    if (filters.groupBy) params.set('groupBy', filters.groupBy);

    const newSearch = params.toString();
    const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [filters]);

  const loadData = useCallback(async () => {
    const requestId = ++dataLoadRequestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const [
        overviewData,
        productionData,
        conversionData,
        banksData,
        productsData,
        conveniosData,
        partnersData,
        operatorsData,
        pendenciesData,
        bottlenecksData,
        cancellationsData,
        refusalsData,
        integrationsData,
        operationalHealthData,
        comparisonData,
        rankingsData,
      ] = await Promise.all([
        BIApiService.fetchOverview(filters),
        BIApiService.fetchProduction(filters),
        BIApiService.fetchConversion(filters).catch(() => null),
        BIApiService.fetchBanks(filters).catch(() => null),
        BIApiService.fetchProducts(filters).catch(() => null),
        BIApiService.fetchConvenios(filters).catch(() => null),
        BIApiService.fetchPartners(filters).catch(() => null),
        BIApiService.fetchOperators(filters).catch(() => null),
        BIApiService.fetchPendencies(filters).catch(() => null),
        BIApiService.fetchBottlenecks(filters).catch(() => null),
        BIApiService.fetchCancellations(filters).catch(() => null),
        BIApiService.fetchRefusals(filters).catch(() => null),
        BIApiService.fetchIntegrations(filters).catch(() => null),
        BIApiService.fetchOperationalHealth(filters).catch(() => null),
        BIApiService.fetchComparison(filters).catch(() => null),
        BIApiService.fetchRankings(filters).catch(() => null),
      ]);

      if (requestId !== dataLoadRequestRef.current) return;

      setOverview(overviewData);
      setProduction(productionData);
      setConversion(conversionData);
      setBanks(banksData);
      setProducts(productsData);
      setConvenios(conveniosData);
      setPartners(partnersData);
      setOperators(operatorsData);
      setPendencies(pendenciesData);
      setBottlenecks(bottlenecksData);
      setCancellations(cancellationsData);
      setRefusals(refusalsData);
      setIntegrations(integrationsData);
      setOperationalHealth(operationalHealthData);
      setComparison(comparisonData);
      setRankings(rankingsData);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (requestId !== dataLoadRequestRef.current) return;
      console.error('[ExecutiveBIDashboard] Erro ao carregar dados do BI:', err);
      setError(err?.message || 'Falha ao carregar indicadores de BI do PostgreSQL.');
    } finally {
      if (requestId === dataLoadRequestRef.current) setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (filterRefreshTimerRef.current !== null) {
      window.clearTimeout(filterRefreshTimerRef.current);
    }
    filterRefreshTimerRef.current = window.setTimeout(() => {
      filterRefreshTimerRef.current = null;
      void loadData();
    }, 250);
    return () => {
      if (filterRefreshTimerRef.current !== null) {
        window.clearTimeout(filterRefreshTimerRef.current);
        filterRefreshTimerRef.current = null;
      }
    };
  }, [loadData]);

  const refreshImmediately = () => {
    if (filterRefreshTimerRef.current !== null) {
      window.clearTimeout(filterRefreshTimerRef.current);
      filterRefreshTimerRef.current = null;
    }
    void loadData();
  };

  // Realtime updates
  useEffect(() => {
    const unsubscribe = RealtimeService.getInstance().subscribe('*', (event) => {
      if (
        event.type === 'PROPOSAL_CREATED' ||
        event.type === 'PROPOSAL_UPDATED' ||
        event.type === 'STATUS_CHANGED' ||
        event.type === 'PROPOSAL_DELETED' ||
        event.type === 'IMPORT_COMPLETED'
      ) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          loadData();
        }, 600);
      }
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadData]);

  const handleFilterChange = (newFilters: Partial<BIFilterState>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
    }));
  };

  const handleGroupByChange = (groupBy: 'day' | 'week' | 'month') => {
    setFilters((prev) => ({
      ...prev,
      groupBy,
    }));
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const blob = await BIApiService.exportBI(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-bi-operacional-${filters.period || 'custom'}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toastService.error('Falha ao exportar relatório', err?.message || 'Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const renderDeltaBadge = (delta?: BIMetricDelta, isInverse = false) => {
    if (!delta) return null;
    const isPositive = delta.deltaPercent > 0;
    const isZero = delta.deltaPercent === 0;

    let colorClass = 'text-[var(--text-secondary)] bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)]';
    if (!isZero) {
      if (isInverse) {
        colorClass = isPositive
          ? 'text-[var(--danger-text)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]'
          : 'text-[var(--success-text)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]';
      } else {
        colorClass = isPositive
          ? 'text-[var(--success-text)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
          : 'text-[var(--danger-text)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]';
      }
    }

    return (
      <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${colorClass}`}>
        {isPositive ? (
          <ArrowUpRight className="w-3 h-3" />
        ) : !isZero ? (
          <ArrowDownRight className="w-3 h-3" />
        ) : (
          <Minus className="w-3 h-3" />
        )}
        <span>{delta.deltaPercent > 0 ? `+${delta.deltaPercent}%` : `${delta.deltaPercent}%`}</span>
      </div>
    );
  };

  const tabs: { id: BITab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'visao-geral', label: 'Visão Executiva', icon: BarChart3 },
    { id: 'producao', label: 'Produção Temporal', icon: TrendingUp },
    { id: 'conversao', label: 'Funil de Conversão', icon: Workflow },
    { id: 'bancos', label: 'Bancos', icon: Building2 },
    { id: 'produtos', label: 'Produtos & Convênios', icon: Briefcase },
    { id: 'parceiros', label: 'Parceiros (CRM)', icon: Users },
    { id: 'operadores', label: 'Operadores Internos', icon: UserCheck },
    { id: 'sla-pendencias', label: 'SLA & Pendências', icon: Clock },
    { id: 'gargalos', label: 'Gargalos & Cancelamentos', icon: Flame },
    { id: 'integracoes', label: 'Telemetria Integrações', icon: Cpu },
  ];

  return (
    <div className="space-y-4 pb-12 animate-fadeIn select-none p2-bi-workspace">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[var(--link)] dark:text-[var(--link)]" />
              <span>BI Operacional & Gerencial</span>
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
              FASE 6
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">
            Métricas descritivas e indicadores analíticos reais consolidados por tenant
          </p>
        </div>

        {/* Global Export Button */}
        <div className="flex items-center gap-2">
          <button
            id="bi-export-csv-button"
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] rounded-lg  transition-all cursor-pointer disabled:opacity-90"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Exportando...' : 'Exportar Base (CSV)'}</span>
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <BIFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onRefresh={refreshImmediately}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
      />

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] rounded-xl text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[var(--danger-text)] shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={loadData} disabled={isLoading} className="shrink-0 px-2.5 py-1 rounded-lg border border-[var(--danger-border)] dark:border-[var(--danger-border)] font-bold hover:bg-[var(--danger-bg)] dark:hover:bg-[var(--danger-bg)] disabled:opacity-90">
            {isLoading ? 'Atualizando...' : 'Tentar novamente'}
          </button>
        </div>
      )}

      {/* Analytical Tab Navigation Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-[var(--field-border)] dark:border-[var(--field-border)] p2-analytics-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`bi-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[var(--action)] text-[var(--text-primary)]  font-bold'
                  : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: VISÃO EXECUTIVA & GERAL */}
      {/* ========================================================================= */}
      {activeTab === 'visao-geral' && (
        <div className="space-y-4">
          {/* Top KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* 1. Volume Pago */}
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider">Volume Pago</span>
                <div className="w-7 h-7 rounded-lg bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
                  {overview ? formatCurrency(overview.paidProduction.value) : '...'}
                </div>
                {renderDeltaBadge(comparison?.metrics.paidProduction)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1.5">
                <span>{overview ? `${overview.paidProduction.count} contratos` : '...'}</span>
                <span className="text-[var(--success-text)] dark:text-[var(--success-text)] font-semibold font-mono">
                  {overview?.conversionRatePercent}% conv.
                </span>
              </div>
            </div>

            {/* 2. Em Andamento / Esteira */}
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider">Em Andamento</span>
                <div className="w-7 h-7 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
                  {overview ? formatCurrency(overview.inProgressProduction.value) : '...'}
                </div>
                {renderDeltaBadge(comparison?.metrics.backlogCount, true)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1.5">
                <span>{overview ? `${overview.inProgressProduction.count} propostas` : '...'}</span>
                <span className="text-[var(--link)] dark:text-[var(--link)] font-semibold">Esteira</span>
              </div>
            </div>

            {/* 3. Taxa de Conversão */}
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider">Conversão Global</span>
                <div className="w-7 h-7 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center">
                  <Percent className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  {overview ? `${overview.conversionRatePercent}%` : '...'}
                </div>
                {renderDeltaBadge(comparison?.metrics.conversionRate)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1.5">
                <span>{overview ? `${overview.paidProduction.count}/${overview.totalProposals}` : '...'}</span>
                <span className="text-[var(--link)] dark:text-[var(--link)] font-medium">Eficácia</span>
              </div>
            </div>

            {/* 4. Ticket Médio Líquido */}
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider">Ticket Médio</span>
                <div className="w-7 h-7 rounded-lg bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
                  {overview ? formatCurrency(overview.avgTicketNet) : '...'}
                </div>
                {renderDeltaBadge(comparison?.metrics.avgTicketNet)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1.5">
                <span>Líquido Liberado</span>
                <span className="text-[var(--warning-text)] dark:text-[var(--warning-text)] font-semibold font-mono">Por Pago</span>
              </div>
            </div>

            {/* 5. Cumprimento de SLA */}
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider">SLA Geral</span>
                <div className="w-7 h-7 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                {overview ? `${overview.slaCompliancePercent}%` : '...'}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1.5">
                <span className={overview && overview.proposalsOverSla > 0 ? 'text-[var(--danger-text)] font-semibold' : ''}>
                  {overview ? `${overview.proposalsOverSla} estouradas` : '...'}
                </span>
                <span className="text-[var(--warning-text)] font-medium">
                  {overview ? `${overview.proposalsAtRisk} em risco` : '...'}
                </span>
              </div>
            </div>

            {/* 6. Cancelamentos / Perdas */}
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider">Cancelamentos</span>
                <div className="w-7 h-7 rounded-lg bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <div className="text-xl font-black text-[var(--danger-text)] dark:text-[var(--danger-text)] truncate">
                  {overview ? `${overview.cancelledProduction.ratePercent}%` : '...'}
                </div>
                {renderDeltaBadge(comparison?.metrics.cancelledValue, true)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1.5">
                <span>{overview ? `${overview.cancelledProduction.count} perdas` : '...'}</span>
                <span className="text-[var(--danger-text)] dark:text-[var(--danger-text)] font-semibold">
                  {overview ? formatCurrency(overview.cancelledProduction.value) : '...'}
                </span>
              </div>
            </div>
          </div>

          {/* Operational Health Summary Card */}
          {operationalHealth && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
                <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Status da Esteira</div>
                <div className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">{operationalHealth.proposals.status}</div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                  {operationalHealth.proposals.activeInPipeline} ativas na esteira ({operationalHealth.proposals.overSlaInPipeline} fora de SLA)
                </div>
              </div>
              <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
                <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Status de Pendências</div>
                <div className="text-2xl font-black text-[var(--warning-text)] dark:text-[var(--warning-text)]">{operationalHealth.pendencies.status}</div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                  {operationalHealth.pendencies.openTotal} abertas ({operationalHealth.pendencies.compliancePercent}% no SLA)
                </div>
              </div>
              <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
                <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Saúde das Integrações</div>
                <div className="text-2xl font-black text-[var(--success-text)] dark:text-[var(--success-text)]">{operationalHealth.integrations.status}</div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                  {operationalHealth.integrations.onlineProvidersCount} de {operationalHealth.integrations.totalProvidersCount} provedores online
                </div>
              </div>
              <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
                <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Sucesso Global APIs</div>
                <div className="text-2xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{operationalHealth.integrations.overallSuccessRate}%</div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-1">Taxa média de sucesso em requisições de bancos</div>
              </div>
            </div>
          )}

          {/* Quick Production Chart & Stages */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
              <h2 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--link)]" />
                <span>Evolução de Produção (Digitado × Pago)</span>
              </h2>
              {production && production.series.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={production.series}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="formattedDate" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(val: any) => formatCurrency(Number(val) || 0)}
                        contentStyle={{ backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="netValue" name="Digitado" fill="var(--chart-series-1)" radius={[4, 4, 0, 0]} />
                      <Area type="monotone" dataKey="paidValue" name="Valor Pago" fill="var(--chart-series-2)" stroke="var(--chart-series-3)" fillOpacity={0.4} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-[var(--text-secondary)] text-xs">
                  Nenhum dado registrado para o período selecionado.
                </div>
              )}
            </div>

            {/* Quick Summary Card */}
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4  flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--link)]" />
                  <span>Resumo do Período</span>
                </h2>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                    <span className="text-[var(--text-secondary)]">Propostas Cadastradas</span>
                    <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-mono">{overview?.totalProposals || 0}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                    <span className="text-[var(--text-secondary)]">Volume Total Bruto</span>
                    <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-mono">{overview ? formatCurrency(overview.totalGrossValue) : '...'}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                    <span className="text-[var(--text-secondary)]">Volume Total Líquido</span>
                    <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-mono">{overview ? formatCurrency(overview.totalNetValue) : '...'}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                    <span className="text-[var(--text-secondary)]">Aprovadas no Período</span>
                    <strong className="text-[var(--success-text)] font-mono">{overview?.approvedProposals.count || 0} ({overview ? formatCurrency(overview.approvedProposals.value) : '...'})</strong>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-[var(--text-secondary)]">Pendências em Aberto</span>
                    <strong className="text-[var(--warning-text)] font-mono">{overview?.pendencies.totalOpen || 0}</strong>
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] text-[11px] text-[var(--text-secondary)]">
                Isolamento Multi-tenant ativo
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PRODUÇÃO & SÉRIES TEMPORAIS */}
      {/* ========================================================================= */}
      {activeTab === 'producao' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[var(--link)]" />
                  <span>Produção Detalhada por Período</span>
                </h2>
                <p className="text-[11px] text-[var(--text-secondary)]">Agrupamento temporal com valores brutos, líquidos e pagos</p>
              </div>

              {/* GroupBy Switcher */}
              <div className="flex items-center gap-1 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] p-0.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)]">
                {(['day', 'week', 'month'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => handleGroupByChange(g)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      filters.groupBy === g
                        ? 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--link)] dark:text-[var(--link)] font-bold shadow-2xs'
                        : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {g === 'day' ? 'Dia' : g === 'week' ? 'Semana' : 'Mês'}
                  </button>
                ))}
              </div>
            </div>

            {production && production.series.length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={production.series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="formattedDate" fontSize={11} />
                    <YAxis yAxisId="left" fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" fontSize={11} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      formatter={(val: any, name: any) =>
                        name === 'Propostas' ? val : formatCurrency(Number(val) || 0)
                      }
                      contentStyle={{ backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar yAxisId="left" dataKey="netValue" name="Digitado" fill="var(--chart-series-1)" radius={[4, 4, 0, 0]} />
                    <Area yAxisId="left" type="monotone" dataKey="paidValue" name="Valor Pago" fill="var(--chart-series-2)" stroke="var(--chart-series-3)" fillOpacity={0.4} />
                    <Line yAxisId="right" type="monotone" dataKey="count" name="Propostas" stroke="var(--chart-series-4)" strokeWidth={2} dot />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-[var(--text-secondary)] text-xs">
                Nenhum dado temporal encontrado.
              </div>
            )}
          </div>

          {/* Temporal Data Table */}
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Detalhamento Temporal
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <tr>
                    <th className="p-2.5">Data / Período</th>
                    <th className="p-2.5 text-right">Qtd. Propostas</th>
                    <th className="p-2.5 text-right">Valor Bruto</th>
                    <th className="p-2.5 text-right">Valor Líquido</th>
                    <th className="p-2.5 text-right">Qtd. Pagas</th>
                    <th className="p-2.5 text-right">Valor Pago</th>
                    <th className="p-2.5 text-right">Ticket Médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {production?.series.map((item, idx) => (
                    <tr key={idx} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors">
                      <td className="p-2.5 font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{item.formattedDate}</td>
                      <td className="p-2.5 text-right font-mono">{item.count}</td>
                      <td className="p-2.5 text-right font-mono">{formatCurrency(item.grossValue)}</td>
                      <td className="p-2.5 text-right font-mono">{formatCurrency(item.netValue)}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-semibold">{item.paidCount}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-bold">{formatCurrency(item.paidValue)}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--text-secondary)]">{formatCurrency(item.avgTicket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: FUNIL DE CONVERSÃO & PERDAS */}
      {/* ========================================================================= */}
      {activeTab === 'conversao' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
            <h2 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-[var(--link)]" />
              <span>Funil Operacional de Conversão</span>
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)] mb-6">
              Acompanhamento de volume e perda entre cada etapa do ciclo de concessão
            </p>

            {conversion && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {conversion.stages.map((stg, i) => (
                  <div key={i} className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 relative">
                    <div className="text-xs font-bold text-[var(--text-secondary)] uppercase">{stg.label}</div>
                    <div className="text-2xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">
                      {stg.count}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
                      {formatCurrency(stg.value)}
                    </div>
                    <div className="mt-4 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                      Conversão da Etapa: <strong className="text-[var(--link)]">{stg.conversionRateFromPrevious ?? 100}%</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: BANCOS */}
      {/* ========================================================================= */}
      {activeTab === 'bancos' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex justify-between items-center text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              <span>Performance e Produção por Instituição Financeira</span>
              <span className="text-[11px] font-normal text-[var(--text-secondary)]">Métricas descritivas reais</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <tr>
                    <th className="p-2.5">Banco</th>
                    <th className="p-2.5 text-right">Propostas</th>
                    <th className="p-2.5 text-right">Valor Bruto</th>
                    <th className="p-2.5 text-right">Valor Líquido</th>
                    <th className="p-2.5 text-right">Pagas</th>
                    <th className="p-2.5 text-right">Valor Pago</th>
                    <th className="p-2.5 text-right">Aprovação %</th>
                    <th className="p-2.5 text-right">SLA %</th>
                    <th className="p-2.5 text-right">Latência Média</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {banks?.banks.map((b) => (
                    <tr key={b.bankId} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors">
                      <td className="p-2.5 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        <span>{b.bankCode ? `${b.bankCode} - ` : ''}{b.bankName}</span>
                      </td>
                      <td className="p-2.5 text-right font-mono">{b.count}</td>
                      <td className="p-2.5 text-right font-mono">{formatCurrency(b.grossValue)}</td>
                      <td className="p-2.5 text-right font-mono">{formatCurrency(b.netValue)}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-semibold">{b.paidCount}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-bold">{formatCurrency(b.paidValue)}</td>
                      <td className="p-2.5 text-right font-mono">{b.approvalRatePercent}%</td>
                      <td className="p-2.5 text-right font-mono text-[var(--link)]">{b.slaCompliancePercent ?? '-'}%</td>
                      <td className="p-2.5 text-right font-mono text-[var(--text-secondary)]">
                        {b.avgLatencyMs ? `${b.avgLatencyMs}ms` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PRODUTOS & CONVÊNIOS */}
      {/* ========================================================================= */}
      {activeTab === 'produtos' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Products Table */}
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-[var(--link)]" />
              <span>Produção por Produto / Operação</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <tr>
                    <th className="p-2.5">Produto</th>
                    <th className="p-2.5 text-right">Propostas</th>
                    <th className="p-2.5 text-right">Valor Líquido</th>
                    <th className="p-2.5 text-right">Valor Pago</th>
                    <th className="p-2.5 text-right">Conversão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {products?.products.map((prod) => (
                    <tr key={prod.productId} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                      <td className="p-2.5 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{prod.productName}</td>
                      <td className="p-2.5 text-right font-mono">{prod.count}</td>
                      <td className="p-2.5 text-right font-mono">{formatCurrency(prod.netValue)}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-bold">{formatCurrency(prod.paidValue)}</td>
                      <td className="p-2.5 text-right font-mono">{prod.conversionRatePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Convenios Table */}
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
              <Layers3 className="w-3.5 h-3.5 text-[var(--link)]" />
              <span>Produção por Convênio / Órgão</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <tr>
                    <th className="p-2.5">Convênio</th>
                    <th className="p-2.5 text-right">Propostas</th>
                    <th className="p-2.5 text-right">Valor Bruto</th>
                    <th className="p-2.5 text-right">Valor Pago</th>
                    <th className="p-2.5 text-right">Ticket Médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {convenios?.convenios.map((c) => (
                    <tr key={c.convenioId} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                      <td className="p-2.5 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{c.convenioName}</td>
                      <td className="p-2.5 text-right font-mono">{c.count}</td>
                      <td className="p-2.5 text-right font-mono">{formatCurrency(c.grossValue)}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-bold">{formatCurrency(c.paidValue)}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--text-secondary)]">{formatCurrency(c.avgTicketNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: PARCEIROS (CRM INTEGRADO) */}
      {/* ========================================================================= */}
      {activeTab === 'parceiros' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex justify-between items-center text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[var(--link)]" />
                <span>Desempenho Comercial de Parceiros (CRM Integrado)</span>
              </div>
              <span className="text-[11px] font-normal text-[var(--text-secondary)]">
                Total: <strong>{partners?.summary.totalPartners || 0}</strong> parceiros cadastrados
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <tr>
                    <th className="p-2.5">Código / Parceiro</th>
                    <th className="p-2.5">Digitador Responsável</th>
                    <th className="p-2.5 text-right">Propostas</th>
                    <th className="p-2.5 text-right">Valor Bruto</th>
                    <th className="p-2.5 text-right">Pagas</th>
                    <th className="p-2.5 text-right">Valor Pago</th>
                    <th className="p-2.5 text-right">Conversão</th>
                    <th className="p-2.5 text-right">Pendências Abertas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {partners?.partners.map((p) => (
                    <tr key={p.partnerId} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                      <td className="p-2.5 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {p.partnerCode ? `${p.partnerCode} - ` : ''}{p.partnerName}
                      </td>
                      <td className="p-2.5 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">{p.assignedUserName || '-'}</td>
                      <td className="p-2.5 text-right font-mono">{p.count}</td>
                      <td className="p-2.5 text-right font-mono">{formatCurrency(p.grossValue)}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-semibold">{p.paidCount}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-bold">{formatCurrency(p.paidValue)}</td>
                      <td className="p-2.5 text-right font-mono">{p.conversionRatePercent}%</td>
                      <td className="p-2.5 text-right font-mono">
                        {p.openPendenciesCount > 0 ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--warning-bg)] text-[var(--warning-text)]">
                            {p.openPendenciesCount}
                          </span>
                        ) : (
                          <span className="text-[var(--text-secondary)]">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: OPERADORES INTERNOS */}
      {/* ========================================================================= */}
      {activeTab === 'operadores' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[var(--link)]" />
              <span>Desempenho da Equipe Operacional Interna (Usuários)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <tr>
                    <th className="p-2.5">Operador / Digitador</th>
                    <th className="p-2.5 text-right">Propostas Criadas</th>
                    <th className="p-2.5 text-right">Propostas Atribuídas</th>
                    <th className="p-2.5 text-right">Valor Bruto</th>
                    <th className="p-2.5 text-right">Pagas</th>
                    <th className="p-2.5 text-right">Valor Pago</th>
                    <th className="p-2.5 text-right">Conversão</th>
                    <th className="p-2.5 text-right">Pendências Abertas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {operators?.operators.map((op) => (
                    <tr key={op.userId} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                      <td className="p-2.5 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{op.userName}</td>
                      <td className="p-2.5 text-right font-mono">{op.createdProposalsCount}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--text-secondary)]">{op.assignedProposalsCount}</td>
                      <td className="p-2.5 text-right font-mono">{formatCurrency(op.grossValue)}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-semibold">{op.paidCount}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-bold">{formatCurrency(op.paidValue)}</td>
                      <td className="p-2.5 text-right font-mono">{op.conversionRatePercent}%</td>
                      <td className="p-2.5 text-right font-mono">{op.openPendenciesCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: SLA & CENTRAL DE PENDÊNCIAS */}
      {/* ========================================================================= */}
      {activeTab === 'sla-pendencias' && (
        <div className="space-y-4">
          {pendencies && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
                <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase">Total de Pendências</div>
                <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">{pendencies.summary.totalCreated}</div>
              </div>
              <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
                <div className="text-[11px] font-bold text-[var(--warning-text)] uppercase">Abertas / Em Curso</div>
                <div className="text-xl font-black text-[var(--warning-text)] mt-1">{pendencies.summary.openCount}</div>
              </div>
              <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
                <div className="text-[11px] font-bold text-[var(--success-text)] uppercase">Resolvidas</div>
                <div className="text-xl font-black text-[var(--success-text)] mt-1">{pendencies.summary.resolvedCount}</div>
              </div>
              <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
                <div className="text-[11px] font-bold text-[var(--link)] uppercase">Conformidade SLA</div>
                <div className="text-xl font-black text-[var(--link)] mt-1">{pendencies.summary.slaCompliancePercent}%</div>
              </div>
              <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
                <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase">Tempo Médio Resolução</div>
                <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">
                  {pendencies.summary.avgResolutionHours ? `${pendencies.summary.avgResolutionHours}h` : '-'}
                </div>
              </div>
            </div>
          )}

          {/* Breakdown by Category */}
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase mb-3">
              Distribuição de Pendências por Categoria
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {pendencies?.byCategory.map((cat, i) => (
                <div key={i} className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] flex justify-between items-center">
                  <span className="font-semibold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{cat.category}</span>
                  <span className="font-mono text-xs font-bold text-[var(--link)]">{cat.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 9: GARGALOS, CANCELAMENTOS & RECUSAS */}
      {/* ========================================================================= */}
      {activeTab === 'gargalos' && (
        <div className="space-y-4">
          {/* Bottlenecks Warning Card */}
          {bottlenecks && bottlenecks.bottlenecks.length > 0 && (
            <div className="p-4 bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] rounded-xl space-y-2">
              <div className="text-xs font-bold text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-[var(--warning-text)]" />
                <span>Gargalos e Concentrações Operacionais Detectados</span>
              </div>
              <ul className="space-y-1 text-xs text-[var(--warning-text)] dark:text-[var(--warning-text)]">
                {bottlenecks.bottlenecks.map((w, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning-bg)]" />
                    <span><strong>{w.title}</strong>: {w.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cancellations Breakdown */}
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
              <h3 className="text-xs font-bold text-[var(--danger-text)] uppercase mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Cancelamentos de Propostas (Total: {cancellations?.summary.totalCancelledCount || 0})</span>
              </h3>
              <div className="space-y-2">
                {cancellations?.reasons.map((r, i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-lg text-xs">
                    <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{r.reason}</span>
                    <span className="font-mono text-[var(--text-secondary)] font-bold">{r.count} ({formatCurrency(r.value)})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Refusals Breakdown */}
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
              <h3 className="text-xs font-bold text-[var(--danger-text)] uppercase mb-3 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Recusas Bancárias (Total: {refusals?.summary.totalRefusedCount || 0})</span>
              </h3>
              <div className="space-y-2">
                {refusals?.reasons.map((r, i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-lg text-xs">
                    <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{r.reason}</span>
                    <span className="font-mono text-[var(--text-secondary)] font-bold">{r.count} ({formatCurrency(r.value)})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 10: TELEMETRIA DE INTEGRAÇÕES */}
      {/* ========================================================================= */}
      {activeTab === 'integracoes' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[var(--link)]" />
              <span>Saúde e Telemetria dos Conectores Bancários (Hub de Integrações)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <tr>
                    <th className="p-2.5">Provedor / Banco</th>
                    <th className="p-2.5 text-right">Requisições</th>
                    <th className="p-2.5 text-right">Sucesso %</th>
                    <th className="p-2.5 text-right">Erros 4xx</th>
                    <th className="p-2.5 text-right">Erros 5xx</th>
                    <th className="p-2.5 text-right">Latência Média</th>
                    <th className="p-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {integrations?.providers.map((p) => (
                    <tr key={p.provider} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                      <td className="p-2.5 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{p.name || p.provider}</td>
                      <td className="p-2.5 text-right font-mono">{p.totalRequests}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--success-text)] font-bold">{p.successRatePercent}%</td>
                      <td className="p-2.5 text-right font-mono text-[var(--text-secondary)]">{p.error4xxCount}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--danger-text)]">{p.error5xxCount}</td>
                      <td className="p-2.5 text-right font-mono">{p.avgLatencyMs}ms</td>
                      <td className="p-2.5 text-right font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          p.status === 'ONLINE' ? 'bg-[var(--success-bg)] text-[var(--success-text)]' :
                          p.status === 'DEGRADED' ? 'bg-[var(--warning-bg)] text-[var(--warning-text)]' : 'bg-[var(--danger-bg)] text-[var(--danger-text)]'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
