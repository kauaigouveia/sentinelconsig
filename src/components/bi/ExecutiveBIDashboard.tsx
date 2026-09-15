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
  Award,
  BarChart3,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  UserCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  BIFilterState,
  BIOverviewResponse,
  BIProductionResponse,
  BIBankAnalyticsResponse,
  BIPartnerAnalyticsResponse,
  BIComparisonResponse,
  BIRankingsResponse,
  BIMetricDelta,
} from '../../types/bi';
import { BIApiService } from '../../services/biApiService';
import { RealtimeService } from '../../services/realtimeService';
import { formatCurrency } from '../../lib/utils';
import { BIFilterBar } from './BIFilterBar';
import { ExecutiveInsightsWidget } from './ExecutiveInsightsWidget';
import { OperationalHealthCard } from './OperationalHealthCard';

const getInitialFilters = (): BIFilterState => {
  const params = new URLSearchParams(window.location.search);
  const period = (params.get('period') as any) || 'MES_ATUAL';
  return {
    period,
    startDate: params.get('startDate') || undefined,
    endDate: params.get('endDate') || undefined,
    bankId: params.get('bankId') || undefined,
    partnerId: params.get('partnerId') || undefined,
    digitizerId: params.get('digitizerId') || undefined,
    assignedToId: params.get('assignedToId') || undefined,
    productId: params.get('productId') || undefined,
    proposalType: params.get('proposalType') || undefined,
    statusId: params.get('statusId') || undefined,
    standardCategory: params.get('standardCategory') || undefined,
    groupBy: (params.get('groupBy') as any) || 'day',
  };
};

export const ExecutiveBIDashboard: React.FC = () => {
  const [filters, setFilters] = useState<BIFilterState>(getInitialFilters);

  const [overview, setOverview] = useState<BIOverviewResponse | null>(null);
  const [production, setProduction] = useState<BIProductionResponse | null>(null);
  const [banks, setBanks] = useState<BIBankAnalyticsResponse | null>(null);
  const [partners, setPartners] = useState<BIPartnerAnalyticsResponse | null>(null);
  const [comparison, setComparison] = useState<BIComparisonResponse | null>(null);
  const [rankings, setRankings] = useState<BIRankingsResponse | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const debounceTimerRef = useRef<any>(null);

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
    if (filters.proposalType) params.set('proposalType', filters.proposalType);
    if (filters.statusId) params.set('statusId', filters.statusId);
    if (filters.standardCategory) params.set('standardCategory', filters.standardCategory);
    if (filters.groupBy) params.set('groupBy', filters.groupBy);

    const newSearch = params.toString();
    const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [filters]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewData, productionData, banksData, partnersData, comparisonData, rankingsData] = await Promise.all([
        BIApiService.fetchOverview(filters),
        BIApiService.fetchProduction(filters),
        BIApiService.fetchBanks(filters),
        BIApiService.fetchPartners(filters),
        BIApiService.fetchComparison(filters).catch((e) => {
          console.warn('[ExecutiveBIDashboard] Falha ao carregar comparativo:', e);
          return null;
        }),
        BIApiService.fetchRankings(filters).catch((e) => {
          console.warn('[ExecutiveBIDashboard] Falha ao carregar rankings P1:', e);
          return null;
        }),
      ]);

      setOverview(overviewData);
      setProduction(productionData);
      setBanks(banksData);
      setPartners(partnersData);
      setComparison(comparisonData);
      setRankings(rankingsData);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('[ExecutiveBIDashboard] Erro ao carregar dados do BI:', err);
      setError(err?.message || 'Falha ao carregar indicadores de BI do PostgreSQL.');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime updates via Pusher
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
      a.download = `relatorio-bi-gerencial-${filters.period || 'custom'}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err?.message || 'Falha ao gerar exportação CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  const renderDeltaBadge = (delta?: BIMetricDelta, isInverse = false) => {
    if (!delta) return null;
    const isPositive = delta.deltaPercent > 0;
    const isZero = delta.deltaPercent === 0;

    let colorClass = 'text-slate-500 bg-slate-100 dark:bg-slate-800';
    if (!isZero) {
      if (isInverse) {
        colorClass = isPositive
          ? 'text-rose-700 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300'
          : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300';
      } else {
        colorClass = isPositive
          ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300'
          : 'text-rose-700 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300';
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

  return (
    <div className="space-y-4 pb-12 animate-fadeIn select-none">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              <span>Dashboard Executivo</span>
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
              BI P1
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Métricas estratégicas, comparativo de períodos e rankings gerenciais em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Exportar dados consolidados do filtro atual em CSV"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Exportando...' : 'Exportar CSV'}</span>
          </button>
        </div>
      </div>

      {/* Unified Filter Bar */}
      <BIFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onRefresh={loadData}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
      />

      {/* Phase 5.3-B Managerial Intelligence Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OperationalHealthCard filters={filters} />
        <ExecutiveInsightsWidget filters={filters} />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="px-2 py-1 font-semibold text-rose-700 dark:text-rose-300 hover:underline cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Executive Strategic KPI Cards with Comparison Delta Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* 1. Produção Paga */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Volume Pago</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <div className="text-xl font-black text-slate-900 dark:text-slate-100 truncate">
              {overview ? formatCurrency(overview.paidProduction.value) : '...'}
            </div>
            {renderDeltaBadge(comparison?.metrics.paidProduction)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            <span>{overview ? `${overview.paidProduction.count} contratos` : '...'}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
              {overview?.conversionRatePercent}% conv.
            </span>
          </div>
        </div>

        {/* 2. Em Andamento / Esteira */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Em Andamento</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <div className="text-xl font-black text-slate-900 dark:text-slate-100 truncate">
              {overview ? formatCurrency(overview.inProgressProduction.value) : '...'}
            </div>
            {renderDeltaBadge(comparison?.metrics.backlogCount, true)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            <span>{overview ? `${overview.inProgressProduction.count} propostas` : '...'}</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">Esteira</span>
          </div>
        </div>

        {/* 3. Taxa de Conversão */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Conversão Global</span>
            <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <div className="text-xl font-black text-slate-900 dark:text-slate-100">
              {overview ? `${overview.conversionRatePercent}%` : '...'}
            </div>
            {renderDeltaBadge(comparison?.metrics.conversionRate)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            <span>{overview ? `${overview.paidProduction.count}/${overview.totalProposals}` : '...'}</span>
            <span className="text-violet-600 dark:text-violet-400 font-medium">Eficácia</span>
          </div>
        </div>

        {/* 4. Ticket Médio Líquido */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ticket Médio</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <div className="text-xl font-black text-slate-900 dark:text-slate-100 truncate">
              {overview ? formatCurrency(overview.avgTicketNet) : '...'}
            </div>
            {renderDeltaBadge(comparison?.metrics.avgTicketNet)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            <span>Líquido Liberado</span>
            <span className="text-amber-600 dark:text-amber-400 font-semibold font-mono">Por Pago</span>
          </div>
        </div>

        {/* 5. Cumprimento de SLA */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">SLA Geral</span>
            <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-slate-100">
            {overview ? `${overview.slaCompliancePercent}%` : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            <span className={overview && overview.proposalsOverSla > 0 ? 'text-rose-500 font-semibold' : ''}>
              {overview ? `${overview.proposalsOverSla} estouradas` : '...'}
            </span>
            <span className="text-amber-500 font-medium">
              {overview ? `${overview.proposalsAtRisk} em risco` : '...'}
            </span>
          </div>
        </div>

        {/* 6. Cancelamentos / Perdas */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Cancelamentos</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 truncate">
              {overview ? `${overview.cancelledProduction.ratePercent}%` : '...'}
            </div>
            {renderDeltaBadge(comparison?.metrics.cancelledValue, true)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            <span>{overview ? `${overview.cancelledProduction.count} perdas` : '...'}</span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">
              {overview ? formatCurrency(overview.cancelledProduction.value) : '...'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Chart Section: Production Volume Over Time */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Evolução da Produção no Período</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Volumes brutos, líquidos e pagos consolidados por série temporal
            </p>
          </div>

          {/* GroupBy Selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700">
            {(['day', 'week', 'month'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => handleGroupByChange(g)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  filters.groupBy === g
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {g === 'day' ? 'Diário' : g === 'week' ? 'Semanal' : 'Mensal'}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-[280px] w-full">
          {production && production.series.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={production.series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.15} />
                <XAxis
                  dataKey="formattedDate"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1', strokeOpacity: 0.3 }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1', strokeOpacity: 0.3 }}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1', strokeOpacity: 0.3 }}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                          <p className="font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1">
                            {label}
                          </p>
                          {payload.map((item: any) => (
                            <div key={item.name} className="flex justify-between gap-4">
                              <span style={{ color: item.color }} className="font-medium">
                                {item.name}:
                              </span>
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {item.name === 'Qtd Propostas'
                                  ? item.value
                                  : formatCurrency(Number(item.value))}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={30}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, paddingTop: -10 }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="netValue"
                  name="Volume Líquido"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Bar
                  yAxisId="left"
                  dataKey="paidValue"
                  name="Volume Pago"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  barSize={18}
                />
                <Bar
                  yAxisId="right"
                  dataKey="count"
                  name="Qtd Propostas"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  barSize={8}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              {isLoading ? 'Carregando dados agregados...' : 'Nenhum dado de produção encontrado para este filtro.'}
            </div>
          )}
        </div>
      </div>

      {/* Extended Rankings Section: Banks, Partners, Digitizers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Top Banks Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Ranking por Banco</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Participação e variação por instituição
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500">
              {rankings?.banks.length || banks?.banks.length || 0} bancos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-2">Banco</th>
                  <th className="pb-2 text-right">Vol. Pago</th>
                  <th className="pb-2 text-right">Share %</th>
                  <th className="pb-2 text-right">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {(rankings?.banks && rankings.banks.length > 0
                  ? rankings.banks
                  : banks?.banks || []
                )
                  .slice(0, 8)
                  .map((b: any) => (
                    <tr key={b.bankId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: b.color || '#3b82f6' }}
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                          {b.bankName}
                        </span>
                      </td>
                      <td className="py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(b.paidValue)}
                      </td>
                      <td className="py-2 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {b.sharePercent !== undefined ? `${b.sharePercent}%` : '-'}
                      </td>
                      <td className="py-2 text-right font-mono text-violet-600 dark:text-violet-400">
                        {b.conversionRatePercent}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Top Partners Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span>Ranking por Parceiro</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Produção comercial e participação
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500">
              {rankings?.partners.length || partners?.partners.length || 0} parceiros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-2">Parceiro</th>
                  <th className="pb-2 text-right">Vol. Pago</th>
                  <th className="pb-2 text-right">Share %</th>
                  <th className="pb-2 text-right">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {(rankings?.partners && rankings.partners.length > 0
                  ? rankings.partners
                  : partners?.partners || []
                )
                  .slice(0, 8)
                  .map((p: any, idx: number) => (
                    <tr key={p.partnerId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center shrink-0 ${
                            idx === 0
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                              : idx === 1
                              ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                              : idx === 2
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                          {p.partnerName}
                        </span>
                      </td>
                      <td className="py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.paidValue)}
                      </td>
                      <td className="py-2 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {p.sharePercent !== undefined ? `${p.sharePercent}%` : '-'}
                      </td>
                      <td className="py-2 text-right font-mono text-violet-600 dark:text-violet-400">
                        {p.conversionRatePercent}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Top Digitizers Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Ranking por Digitador</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Produtividade da equipe de digitação
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500">
              {rankings?.digitizers.length || 0} digitadores
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-2">Digitador</th>
                  <th className="pb-2 text-right">Propostas</th>
                  <th className="pb-2 text-right">Vol. Pago</th>
                  <th className="pb-2 text-right">Share %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rankings && rankings.digitizers.length > 0 ? (
                  rankings.digitizers.slice(0, 8).map((d, idx) => (
                    <tr key={d.digitizerId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[10px] w-3 shrink-0">#{idx + 1}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                          {d.digitizerName}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono text-slate-500 dark:text-slate-400">
                        {d.totalCount}
                      </td>
                      <td className="py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(d.paidValue)}
                      </td>
                      <td className="py-2 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {d.sharePercent}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      Nenhum digitador com produção no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
