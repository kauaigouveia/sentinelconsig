import React, { useState, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Building2,
  Users,
  Filter,
  ArrowRight,
  Download,
  HelpCircle,
  Eye,
  Layers,
  Sparkles,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Shield,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { StorageService } from '../../services/storageService';
import { Proposal, ProposalStatus, Alcada, Bank, Promoter } from '../../types';
import { formatDate, formatCpf } from '../../lib/utils';
import { ProposalDetailModal } from '../production/ProposalDetailModal';

export const StatusBottleneckReport: React.FC = () => {
  const proposals = useMemo(() => StorageService.getProposals(), []);
  const statuses = useMemo(() => StorageService.getStatuses(), []);
  const history = useMemo(() => StorageService.getHistory(), []);
  const banks = useMemo(() => StorageService.getBanks(), []);
  const promoters = useMemo(() => StorageService.getPromoters(), []);
  const clients = useMemo(() => StorageService.getClients(), []);

  // Filter state
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [selectedPromoterId, setSelectedPromoterId] = useState<string>('');
  const [selectedAlçada, setSelectedAlçada] = useState<Alcada | ''>('');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'STATUS_LIST' | 'ALCADA' | 'STUCK_PROPOSALS'>('OVERVIEW');
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);

  // Calculate status dwell times and bottleneck stats
  const bottleneckStats = useMemo(() => {
    // Filter proposals first if bank/promoter filter is active
    const filteredProposals = proposals.filter(p => {
      if (selectedBankId && p.bankId !== selectedBankId) return false;
      if (selectedPromoterId && p.promoterId !== selectedPromoterId) return false;
      return true;
    });

    const now = Date.now();

    // Group history entries by proposal
    const historyByProposal = new Map<string, typeof history>();
    history.forEach(h => {
      const list = historyByProposal.get(h.proposalId) || [];
      list.push(h);
      historyByProposal.set(h.proposalId, list);
    });

    // Per-status accumulated time (in hours) and sample counts
    const statusDurations: Record<string, { totalHours: number; count: number; activeStuckCount: number }> = {};
    statuses.forEach(s => {
      statusDurations[s.id] = { totalHours: 0, count: 0, activeStuckCount: 0 };
    });

    // 1. Calculate from historical transitions
    historyByProposal.forEach((pHistory, propId) => {
      const sorted = [...pHistory].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].createdAt).getTime() : null;
        const startTime = new Date(current.createdAt).getTime();

        if (nextTime && statusDurations[current.newStatusId]) {
          const durationHours = Math.max(0.1, (nextTime - startTime) / (1000 * 3600));
          statusDurations[current.newStatusId].totalHours += durationHours;
          statusDurations[current.newStatusId].count += 1;
        }
      }
    });

    // 2. Add current dwell time for proposals actively sitting in statuses
    filteredProposals.forEach(p => {
      const st = statuses.find(s => s.id === p.statusId);
      if (!st) return;

      const pHistory = historyByProposal.get(p.id) || [];
      const lastEntry = pHistory.length > 0 ? pHistory[pHistory.length - 1] : null;
      const startTime = lastEntry ? new Date(lastEntry.createdAt).getTime() : new Date(p.createdAt).getTime();
      const currentDwellHours = Math.max(0.1, (now - startTime) / (1000 * 3600));

      if (statusDurations[p.statusId]) {
        statusDurations[p.statusId].totalHours += currentDwellHours;
        statusDurations[p.statusId].count += 1;

        // If sitting longer than SLA hours, consider stuck
        if (currentDwellHours > (st.slaHours || 24)) {
          statusDurations[p.statusId].activeStuckCount += 1;
        }
      }
    });

    // Build rich status records
    const statusResults = statuses.map(status => {
      const stat = statusDurations[status.id] || { totalHours: 0, count: 0, activeStuckCount: 0 };
      const avgHours = stat.count > 0 ? Math.round((stat.totalHours / stat.count) * 10) / 10 : status.slaHours || 24;
      const slaHours = status.slaHours || 24;
      const ratio = slaHours > 0 ? avgHours / slaHours : 1;

      let severity: 'CRITICO' | 'ATENCAO' | 'FLUIDO' = 'FLUIDO';
      if (ratio > 1.5 || (avgHours > 48 && ratio > 1.2)) {
        severity = 'CRITICO';
      } else if (ratio > 1.0) {
        severity = 'ATENCAO';
      }

      const activeProposalsInStatus = filteredProposals.filter(p => p.statusId === status.id);

      return {
        status,
        avgHours,
        avgDays: Math.round((avgHours / 24) * 10) / 10,
        slaHours,
        ratio,
        severity,
        activeCount: activeProposalsInStatus.length,
        stuckCount: stat.activeStuckCount,
        responsibleGroup: status.responsibleGroup || 'NOSSA EQUIPE',
      };
    });

    // Group by Alçada
    const alcadaMap: Record<Alcada, { totalHours: number; count: number; statusesCount: number }> = {
      'CLIENTE': { totalHours: 0, count: 0, statusesCount: 0 },
      'PARCEIRO': { totalHours: 0, count: 0, statusesCount: 0 },
      'BANCO': { totalHours: 0, count: 0, statusesCount: 0 },
      'NOSSA EQUIPE': { totalHours: 0, count: 0, statusesCount: 0 },
      'SISTEMA': { totalHours: 0, count: 0, statusesCount: 0 },
    };

    statusResults.forEach(res => {
      const group = res.responsibleGroup as Alcada;
      if (alcadaMap[group]) {
        alcadaMap[group].totalHours += res.avgHours;
        alcadaMap[group].count += 1;
        alcadaMap[group].statusesCount += res.activeCount;
      }
    });

    const alcadaList = (Object.keys(alcadaMap) as Alcada[]).map(key => ({
      alçada: key,
      avgHours: alcadaMap[key].count > 0 ? Math.round((alcadaMap[key].totalHours / alcadaMap[key].count) * 10) / 10 : 0,
      activeProposals: alcadaMap[key].statusesCount,
    }));

    // Find stuck proposals
    const stuckProposals = filteredProposals
      .map(p => {
        const st = statuses.find(s => s.id === p.statusId);
        const pHistory = historyByProposal.get(p.id) || [];
        const lastEntry = pHistory.length > 0 ? pHistory[pHistory.length - 1] : null;
        const startTime = lastEntry ? new Date(lastEntry.createdAt).getTime() : new Date(p.createdAt).getTime();
        const dwellHours = Math.round(((now - startTime) / (1000 * 3600)) * 10) / 10;
        const sla = st?.slaHours || 24;
        const exceededHours = dwellHours - sla;

        return {
          proposal: p,
          status: st,
          dwellHours,
          slaHours: sla,
          exceededHours,
          isStuck: exceededHours > 0,
          enteredAt: new Date(startTime).toISOString(),
        };
      })
      .filter(p => p.isStuck)
      .sort((a, b) => b.exceededHours - a.exceededHours);

    return {
      statusResults,
      alcadaList,
      stuckProposals,
      criticalBottlenecks: statusResults.filter(s => s.severity === 'CRITICO'),
      warningBottlenecks: statusResults.filter(s => s.severity === 'ATENCAO'),
    };
  }, [proposals, statuses, history, selectedBankId, selectedPromoterId]);

  // Chart data for Bar Chart (Top 7 slowest stages)
  const chartData = useMemo(() => {
    return bottleneckStats.statusResults
      .slice(0, 8)
      .map(item => ({
        name: item.status.name.length > 18 ? item.status.name.substring(0, 16) + '...' : item.status.name,
        fullName: item.status.name,
        'Tempo Médio (h)': item.avgHours,
        'Meta SLA (h)': item.slaHours,
        severity: item.severity,
      }));
  }, [bottleneckStats]);

  // Chart data for Alçada Pie Chart
  const pieChartData = useMemo(() => {
    const colors: Record<Alcada, string> = {
      'BANCO': '#ef4444',
      'CLIENTE': '#f59e0b',
      'PARCEIRO': '#8b5cf6',
      'NOSSA EQUIPE': '#3b82f6',
      'SISTEMA': '#10b981',
    };

    return bottleneckStats.alcadaList.map(a => ({
      name: a.alçada,
      value: a.avgHours,
      proposals: a.activeProposals,
      color: colors[a.alçada] || '#64748b',
    }));
  }, [bottleneckStats]);

  // Export as CSV
  const handleExportCSV = () => {
    const rows = [
      ['Status', 'Alçada', 'Tempo Médio (h)', 'Tempo Médio (dias)', 'SLA Configurado (h)', 'Status SLA', 'Propostas Ativas', 'Propostas Travadas'],
      ...bottleneckStats.statusResults.map(r => [
        `"${r.status.name}"`,
        `"${r.responsibleGroup}"`,
        r.avgHours,
        r.avgDays,
        r.slaHours,
        r.severity,
        r.activeCount,
        r.stuckCount,
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_gargalos_sla_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Relatório de Gargalos & Tempo Médio por Status</span>
              <span className="rounded-md bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 px-2 py-0.5 text-[10px] font-extrabold border border-rose-200 dark:border-rose-800">
                {bottleneckStats.criticalBottlenecks.length} GARGALOS CRÍTICOS
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Diagnóstico operacional de permanência, estouro de SLA e tempo médio por alçada
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar Relatório CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
          <Filter className="h-3.5 w-3.5" />
          <span>Filtrar Análise:</span>
        </div>

        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <select
            value={selectedBankId}
            onChange={e => setSelectedBankId(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            <option value="">Todos os Bancos</option>
            {banks.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={selectedPromoterId}
            onChange={e => setSelectedPromoterId(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            <option value="">Todas as Promotoras</option>
            {promoters.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {(selectedBankId || selectedPromoterId) && (
            <button
              onClick={() => {
                setSelectedBankId('');
                setSelectedPromoterId('');
              }}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-rose-200 dark:border-rose-900/50 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Gargalos Críticos</span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
            {bottleneckStats.criticalBottlenecks.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Status com tempo &gt; 150% do SLA estimado
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-amber-200 dark:border-amber-900/50 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Em Atenção</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {bottleneckStats.warningBottlenecks.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Etapas acima de 100% da meta de horas
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-blue-200 dark:border-blue-900/50 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Propostas Travadas</span>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-2">
            {bottleneckStats.stuckProposals.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            ADEs excedendo o prazo atual do status
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-emerald-200 dark:border-emerald-900/50 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Alçada Mais Lenta</span>
            <Shield className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-2 truncate">
            {pieChartData.sort((a, b) => b.value - a.value)[0]?.name || 'BANCO'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Média de {pieChartData.sort((a, b) => b.value - a.value)[0]?.value || 0}h por proposta
          </p>
        </div>
      </div>

      {/* Visual Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bar Chart: Tempo Real vs SLA */}
        <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <span>Comparativo: Tempo Médio de Permanência vs SLA (Horas)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Identificação visual dos estágios mais demorados da esteira
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  angle={-15}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '0.75rem',
                    color: '#fff',
                    fontSize: '11px',
                  }}
                  formatter={(val: any) => [`${val} horas`, '']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Tempo Médio (h)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Meta SLA (h)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart: Tempo Médio por Alçada */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-purple-600" />
              <span>Tempo por Alçada de Responsabilidade</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Distribuição média de horas gastas por alçada
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '0.75rem',
                    color: '#fff',
                    fontSize: '11px',
                  }}
                  formatter={(val: any) => [`${val}h médias`, 'Alçada']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 mt-2">
            {pieChartData.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{item.name}:</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {item.value}h ({item.proposals} ativas)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeTab === 'OVERVIEW'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Diagnóstico de Gargalos ({bottleneckStats.statusResults.length})
        </button>

        <button
          onClick={() => setActiveTab('STUCK_PROPOSALS')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'STUCK_PROPOSALS'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>Propostas Excedendo SLA</span>
          <span className="rounded-full bg-rose-500 text-white text-[10px] px-1.5 py-0.2">
            {bottleneckStats.stuckProposals.length}
          </span>
        </button>
      </div>

      {/* Tab: Overview / Status List */}
      {activeTab === 'OVERVIEW' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3.5">Status da Esteira</th>
                <th className="px-4 py-3.5">Alçada</th>
                <th className="px-4 py-3.5 text-center">Tempo Médio Real</th>
                <th className="px-4 py-3.5 text-center">Meta SLA</th>
                <th className="px-4 py-3.5 text-center">Desvio / Gargalo</th>
                <th className="px-4 py-3.5 text-center">Propostas Ativas</th>
                <th className="px-4 py-3.5 text-center">Ações Recomendadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {bottleneckStats.statusResults.map(res => (
                <tr
                  key={res.status.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: res.status.color || '#3b82f6' }}
                      />
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {res.status.name}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                      {res.responsibleGroup}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 text-center">
                    <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {res.avgHours}h ({res.avgDays} dias)
                    </span>
                  </td>

                  <td className="px-4 py-3.5 text-center font-mono text-slate-600 dark:text-slate-400">
                    {res.slaHours}h
                  </td>

                  <td className="px-4 py-3.5 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase border ${
                        res.severity === 'CRITICO'
                          ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                          : res.severity === 'ATENCAO'
                          ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      }`}
                    >
                      {res.severity === 'CRITICO' && <AlertTriangle className="h-3 w-3" />}
                      {res.severity === 'ATENCAO' && <Clock className="h-3 w-3" />}
                      {res.severity === 'FLUIDO' && <CheckCircle2 className="h-3 w-3" />}
                      <span>{res.severity}</span>
                    </span>
                  </td>

                  <td className="px-4 py-3.5 text-center">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {res.activeCount}
                    </span>
                    {res.stuckCount > 0 && (
                      <span className="block text-[10px] text-rose-500 font-bold">
                        ({res.stuckCount} atrasadas)
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300 max-w-[200px]">
                    {res.severity === 'CRITICO' ? (
                      <span className="text-rose-700 dark:text-rose-300 font-semibold">
                        Priorizar contato com {res.responsibleGroup} e escalonar mesa.
                      </span>
                    ) : res.severity === 'ATENCAO' ? (
                      <span className="text-amber-700 dark:text-amber-300">
                        Monitorar rotinas de retorno CIP e anexos.
                      </span>
                    ) : (
                      <span className="text-slate-400">Fluxo operacional saudável.</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Stuck Proposals */}
      {activeTab === 'STUCK_PROPOSALS' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          {bottleneckStats.stuckProposals.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Nenhuma proposta excedendo o SLA no momento!
              </p>
              <p className="text-[11px] text-slate-500">Todas as operações estão dentro do prazo estipulado.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3.5">ADE / Proposta</th>
                  <th className="px-4 py-3.5">Cliente</th>
                  <th className="px-4 py-3.5">Status Atual</th>
                  <th className="px-4 py-3.5">Alçada</th>
                  <th className="px-4 py-3.5 text-center">Tempo no Status</th>
                  <th className="px-4 py-3.5 text-center">Excedido (Atraso)</th>
                  <th className="px-4 py-3.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {bottleneckStats.stuckProposals.map(item => {
                  const client = clients.find(c => c.id === item.proposal.clientId);
                  return (
                    <tr
                      key={item.proposal.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-bold font-mono text-slate-900 dark:text-slate-100">
                        {item.proposal.proposalNumber}
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="font-bold text-slate-900 dark:text-slate-100">{client?.fullName || 'Cliente'}</p>
                        <p className="text-[11px] text-slate-500">{formatCpf(client?.cpf || '')}</p>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {item.status?.name}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold">
                          {item.status?.responsibleGroup}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-900 dark:text-slate-100">
                        {item.dwellHours}h
                      </td>

                      <td className="px-4 py-3.5 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                        +{item.exceededHours}h além do SLA ({item.slaHours}h)
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => setDetailProposalId(item.proposal.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-300 hover:bg-blue-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Ver ADE</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal for detail view */}
      {detailProposalId && (
        <ProposalDetailModal
          proposalId={detailProposalId}
          onClose={() => setDetailProposalId(null)}
          onProposalUpdated={() => {}}
        />
      )}
    </div>
  );
};
