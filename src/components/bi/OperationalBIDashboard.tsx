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
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-[var(--link)] dark:text-[var(--link)]" />
              <span>Dashboard Operacional — Torre de Controle</span>
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
              Operação P1
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">
            Monitoramento em tempo real de esteira, gargalos, retenção CIP e conformidade de SLA.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={isExporting}
          className="px-3.5 py-2 rounded-xl bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] font-bold text-xs flex items-center gap-2 transition  cursor-pointer disabled:opacity-90 self-start md:self-auto"
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
        <div className="p-3.5 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] rounded-xl flex items-center justify-between text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--danger-text)] dark:text-[var(--danger-text)]" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="px-2 py-1 font-semibold text-[var(--danger-text)] dark:text-[var(--danger-text)] hover:underline cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Operational Operational Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* 1. Backlog em Aberto */}
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">VALORES NA ESTEIRA</span>
            <div className="w-7 h-7 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
            {overview ? formatCurrency(overview.backlog.retainedValue) : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
            <span>{overview ? `${overview.backlog.count} em curso` : '...'}</span>
            <span className="text-[var(--link)] dark:text-[var(--link)] font-semibold font-mono">Retido</span>
          </div>
        </div>

        {/* 2. Propostas em Risco de SLA */}
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">SLA em Risco</span>
            <div className="w-7 h-7 rounded-lg bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-[var(--warning-text)] dark:text-[var(--warning-text)]">
            {overview ? overview.proposalsAtRisk : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
            <span>&gt; 75% do prazo</span>
            <span className="text-[var(--warning-text)] dark:text-[var(--warning-text)] font-semibold">Preventivo</span>
          </div>
        </div>

        {/* 3. Propostas SLA Estourado */}
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">SLA Estourado</span>
            <div className="w-7 h-7 rounded-lg bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-[var(--danger-text)] dark:text-[var(--danger-text)]">
            {overview ? overview.proposalsOverSla : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
            <span>Fora da meta</span>
            <span className="text-[var(--danger-text)] dark:text-[var(--danger-text)] font-semibold">Crítico</span>
          </div>
        </div>

        {/* 4. Retenção Portabilidades (CIP) */}
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Saldo na CIP</span>
            <div className="w-7 h-7 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
            {formatCurrency(cipRetainedDebt)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
            <span>{portInCip.length} contratos CIP</span>
            <span className="text-[var(--link)] dark:text-[var(--link)] font-semibold">
              {cipAt5thDay + cipOverdue} urgentes
            </span>
          </div>
        </div>

        {/* 5. Tarefas Operacionais */}
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Tarefas Pendentes</span>
            <div className="w-7 h-7 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            {pendingTasks.length}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
            <span className={overdueTasks.length > 0 ? 'text-[var(--danger-text)] font-bold' : ''}>
              {overdueTasks.length} vencidas
            </span>
            <span className="text-[var(--text-secondary)]">Backoffice</span>
          </div>
        </div>

        {/* 6. Conformidade SLA Geral */}
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Índice Conformidade</span>
            <div className="w-7 h-7 rounded-lg bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            {overview ? `${overview.slaCompliancePercent}%` : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
            <span>Dentro do SLA</span>
            <span className="text-[var(--success-text)] dark:text-[var(--success-text)] font-semibold font-mono">Meta: 90%</span>
          </div>
        </div>
      </div>

      {/* Two Columns: Gargalos de Esteira vs Aging das Propostas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gargalos de Esteira (Bottlenecks) */}
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[var(--warning-text)]" />
                <span>Gargalos Operacionais na Esteira</span>
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Fases com maior tempo de retenção (dwell time médio)
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-[var(--text-secondary)]">
              {bottlenecks?.byStatus.length || 0} status ativos
            </span>
          </div>

          <div className="space-y-2.5">
            {bottlenecks && bottlenecks.byStatus.length > 0 ? (
              bottlenecks.byStatus.slice(0, 6).map((b) => (
                <div
                  key={b.statusId}
                  className="p-2.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] flex items-center justify-between hover:border-[var(--field-border)] dark:hover:border-[var(--field-border)] transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
                        {b.statusName}
                      </span>
                      {b.overSlaCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)]">
                          {b.overSlaCount} estouradas
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">
                      {b.count} propostas • Volume: {formatCurrency(b.totalValue)}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {b.avgHours.toFixed(1)}h
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      SLA: {b.slaHours}h
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
                {isLoading ? 'Calculando dwell times...' : 'Nenhum gargalo identificado no fluxo atual.'}
              </div>
            )}
          </div>
        </div>

        {/* Aging das Propostas em Aberto */}
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--link)] dark:text-[var(--link)]" />
                <span>Aging das Propostas em Aberto</span>
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Distribuição de idade das propostas em esteira
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-[var(--text-secondary)]">
              {aging?.summary.totalOpenProposals || 0} propostas
            </span>
          </div>

          {aging && aging.buckets.length > 0 ? (
            <div className="space-y-3">
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aging.buckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" strokeOpacity={0.15} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--text-secondary)" }} tickLine={false} />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        name === 'count' ? `${value} propostas` : formatCurrency(Number(value)),
                        name === 'count' ? 'Quantidade' : 'Volume',
                      ]}
                      contentStyle={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--field-border)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "var(--text-primary)",
                      }}
                    />
                    <Bar dataKey="count" name="count" fill="var(--chart-series-1)" radius={[4, 4, 0, 0]} barSize={28}>
                      {aging.buckets.map((b, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            index >= 3 ? "var(--chart-series-2)" : index === 2 ? "var(--chart-series-3)" : "var(--chart-series-1)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Bucket details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] text-center">
                {aging.buckets.map((b) => (
                  <div key={b.bucket} className="p-1.5 rounded-lg bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)]">
                    <span className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase">
                      {b.label}
                    </span>
                    <span className="text-xs font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {b.count} ({b.percentageCount}%)
                    </span>
                    <span className="block text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] truncate">
                      {formatCurrency(b.totalValue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-xs text-[var(--text-secondary)]">
              {isLoading ? 'Calculando faixas de aging...' : 'Nenhuma proposta em aberto.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
