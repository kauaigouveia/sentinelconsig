import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  Layers,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  DollarSign,
  Coins,
  ShieldCheck,
  Building,
  Users,
  Activity,
  Calendar,
  AlertCircle,
  TrendingDown,
  FileSpreadsheet,
  Download,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { BIFilterState, BIOverviewResponse } from '../../types/bi';
import { AgingResponse, BottlenecksResponse } from '../../types/analytics';
import { BIApiService } from '../../services/biApiService';
import { AnalyticsApiService } from '../../services/analyticsApiService';
import { RealtimeService } from '../../services/realtimeService';
import { StorageService } from '../../services/storageService';
import { AutomationService } from '../../services/automationService';
import { formatCurrency } from '../../lib/utils';
import { BIFilterBar } from './BIFilterBar';
import { OperationalHealthCard } from './OperationalHealthCard';

interface OperationalBIDashboardProps {
  onNavigateToProductionWithFilter?: (filter: {
    statusId?: string;
    bankId?: string;
    partnerId?: string;
  }) => void;
}

export const OperationalBIDashboard: React.FC<OperationalBIDashboardProps> = ({
  onNavigateToProductionWithFilter,
}) => {
  const [filters, setFilters] = useState<BIFilterState>({
    period: 'MES_ATUAL',
  });

  const [overview, setOverview] = useState<BIOverviewResponse | null>(null);

  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/tasks').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setTasks(d);
    }).catch(e => console.error(e));
  }, []);

  const [aging, setAging] = useState<AgingResponse | null>(null);
  const [bottlenecks, setBottlenecks] = useState<BottlenecksResponse | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const debounceTimerRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewData, agingData, bottlenecksData] = await Promise.all([
        BIApiService.fetchOverview(filters),
        AnalyticsApiService.fetchAging({
          bankId: filters.bankId,
          partnerId: filters.partnerId,
          productId: filters.productId,
          statusId: filters.statusId,
        }),
        AnalyticsApiService.fetchBottlenecks({
          bankId: filters.bankId,
          partnerId: filters.partnerId,
          productId: filters.productId,
          statusId: filters.statusId,
        }),
      ]);

      setOverview(overviewData);
      setAging(agingData);
      setBottlenecks(bottlenecksData);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('[OperationalBIDashboard] Erro ao carregar dados:', err);
      setError(err?.message || 'Falha ao carregar indicadores operacionais do PostgreSQL.');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime revalidation via Pusher
  useEffect(() => {
    const unsubscribe = RealtimeService.getInstance().subscribe('*', (event) => {
      if (
        event.type === 'PROPOSAL_CREATED' ||
        event.type === 'PROPOSAL_UPDATED' ||
        event.type === 'STATUS_CHANGED' ||
        event.type === 'PROPOSAL_DELETED' ||
        event.type === 'TASK_UPDATED' ||
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

  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const blob = await BIApiService.exportBI(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-operacional-${filters.period || 'custom'}-${Date.now()}.csv`;
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

  // CIP Retention Calculation
  const proposals = StorageService.getProposals();
  const statuses = StorageService.getStatuses();
  const cipStatus = statuses.find((s) => s.code === 'AGUARDAR_RETORNO_CIP');
  const portInCip = proposals.filter((p) => p.statusId === cipStatus?.id);

  let cipAt5thDay = 0;
  let cipOverdue = 0;
  let cipRetainedDebt = 0;

  portInCip.forEach((p) => {
    cipRetainedDebt += Number(p.contractBalance || 0);
    const info = AutomationService.getPortabilitySlaInfo(p);
    if (info.statusBadge === 'URGENTE' || info.businessDays === info.targetDays) {
      cipAt5thDay++;
    }
    if (info.statusBadge === 'ESTOURADO' || info.businessDays > info.targetDays) {
      cipOverdue++;
    }
  });

  // Operational Tasks

  const pendingTasks = tasks.filter((t) => !t.completed);
  const now = new Date();
  const overdueTasks = pendingTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);

  return (
    <div className="space-y-4 pb-12 animate-fadeIn select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <span>Dashboard Operacional — Torre de Controle</span>
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Operação P1
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Monitoramento em tempo real de esteira, gargalos, retenção CIP e conformidade de SLA.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={isExporting}
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 transition shadow-xs cursor-pointer disabled:opacity-50 self-start md:self-auto"
          title="Exportar relatório operacional em CSV"
        >
          <Download className="w-4 h-4" />
          <span>{isExporting ? 'Exportando...' : 'Exportar CSV'}</span>
        </button>
      </div>

      {/* Unified Filter Bar */}
      <BIFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onRefresh={loadData}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
      />

      {/* Phase 5.3-B Managerial Intelligence Health Score Card */}
      <OperationalHealthCard filters={filters} />

      {/* Error Alert */}
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

      {/* Operational Operational Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* 1. Backlog em Aberto */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Backlog Esteira</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-slate-100 truncate">
            {overview ? formatCurrency(overview.backlog.retainedValue) : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            <span>{overview ? `${overview.backlog.count} em curso` : '...'}</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold font-mono">Retido</span>
          </div>
        </div>

        {/* 2. Propostas em Risco de SLA */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">SLA em Risco</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">
            {overview ? overview.proposalsAtRisk : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            <span>&gt; 75% do prazo</span>
            <span className="text-amber-600 dark:text-amber-400 font-semibold">Preventivo</span>
          </div>
        </div>

        {/* 3. Propostas SLA Estourado */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">SLA Estourado</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">
            {overview ? overview.proposalsOverSla : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            <span>Fora da meta</span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">Crítico</span>
          </div>
        </div>

        {/* 4. Retenção Portabilidades (CIP) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">CIP Retenção</span>
            <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-slate-100 truncate">
            {formatCurrency(cipRetainedDebt)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            <span>{portInCip.length} contratos CIP</span>
            <span className="text-violet-600 dark:text-violet-400 font-semibold">
              {cipAt5thDay + cipOverdue} urgentes
            </span>
          </div>
        </div>

        {/* 5. Tarefas Operacionais */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Tarefas Pendentes</span>
            <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-slate-100">
            {pendingTasks.length}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            <span className={overdueTasks.length > 0 ? 'text-rose-500 font-bold' : ''}>
              {overdueTasks.length} vencidas
            </span>
            <span className="text-slate-400">Backoffice</span>
          </div>
        </div>

        {/* 6. Conformidade SLA Geral */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Índice Conformidade</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-slate-100">
            {overview ? `${overview.slaCompliancePercent}%` : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            <span>Dentro do SLA</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">Meta: 90%</span>
          </div>
        </div>
      </div>

      {/* Two Columns: Gargalos de Esteira vs Aging das Propostas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gargalos de Esteira (Bottlenecks) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span>Gargalos Operacionais na Esteira</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Fases com maior tempo de retenção (dwell time médio)
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-400">
              {bottlenecks?.byStatus.length || 0} status ativos
            </span>
          </div>

          <div className="space-y-2.5">
            {bottlenecks && bottlenecks.byStatus.length > 0 ? (
              bottlenecks.byStatus.slice(0, 6).map((b) => (
                <div
                  key={b.statusId}
                  className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {b.statusName}
                      </span>
                      {b.overSlaCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                          {b.overSlaCount} estouradas
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {b.count} propostas • Volume: {formatCurrency(b.totalValue)}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                      {b.avgHours.toFixed(1)}h
                    </div>
                    <div className="text-[10px] text-slate-400">
                      SLA: {b.slaHours}h
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                {isLoading ? 'Calculando dwell times...' : 'Nenhum gargalo identificado no fluxo atual.'}
              </div>
            )}
          </div>
        </div>

        {/* Aging das Propostas em Aberto */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Aging das Propostas em Aberto</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Distribuição de idade das propostas em esteira
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-400">
              {aging?.summary.totalOpenProposals || 0} propostas
            </span>
          </div>

          {aging && aging.buckets.length > 0 ? (
            <div className="space-y-3">
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aging.buckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.15} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        name === 'count' ? `${value} propostas` : formatCurrency(Number(value)),
                        name === 'count' ? 'Quantidade' : 'Volume',
                      ]}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="count" name="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={28}>
                      {aging.buckets.map((b, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            index >= 3 ? '#ef4444' : index === 2 ? '#f59e0b' : '#3b82f6'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Bucket details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                {aging.buckets.map((b) => (
                  <div key={b.bucket} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <span className="block text-[10px] font-semibold text-slate-400 uppercase">
                      {b.label}
                    </span>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      {b.count} ({b.percentageCount}%)
                    </span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {formatCurrency(b.totalValue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-xs text-slate-400">
              {isLoading ? 'Calculando faixas de aging...' : 'Nenhuma proposta em aberto.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
