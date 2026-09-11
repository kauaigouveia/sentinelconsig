import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Award,
  Users,
  Building,
  CheckCircle2,
  Calendar,
  Activity,
  ArrowUpRight,
  Clock,
  Sparkles,
  Zap,
  Trophy,
  Target,
  Flame,
  UserCheck,
  Percent,
  DollarSign,
  GripVertical,
  SlidersHorizontal,
  RotateCcw,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  EyeOff,
  PieChart as PieChartIcon,
  ShieldCheck,
  AlertTriangle,
  Move,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { StorageService } from '../../services/storageService';
import { extractPartnerCode, formatCurrency } from '../../lib/utils';
import { ExecutiveWidgetConfig, ExecutiveWidgetId } from '../../types';
import { CustomizeWidgetsModal } from './CustomizeWidgetsModal';

const DEFAULT_WIDGETS: ExecutiveWidgetConfig[] = [
  {
    id: 'TREND_30_DAYS',
    title: 'Evolução do Volume de Produção (30 Dias)',
    description: 'Acompanhamento diário de novas propostas vs. pagas e médias de produtividade',
    category: 'TRENDS',
    colSpan: 2,
    enabled: true,
    minimized: false,
  },
  {
    id: 'OPERATOR_PERFORMANCE',
    title: 'Performance Individual & Gamificação dos Operadores',
    description: 'Leaderboard, ranking com pontuação, conversão e barras de produtividade por digitador',
    category: 'TEAM',
    colSpan: 2,
    enabled: true,
    minimized: false,
  },
  {
    id: 'PARTNERS_RANKING',
    title: 'Ranking de Parceiros (Top Produção)',
    description: 'Top parceiros ordenados por volume de propostas digitadas e taxa de conclusão',
    category: 'PARTNERS',
    colSpan: 1,
    enabled: true,
    minimized: false,
  },
  {
    id: 'BANKS_VOLUME',
    title: 'Volume por Banco Parceiro',
    description: 'Distribuição quantitativa de propostas entre as instituições financeiras cadastradas',
    category: 'PARTNERS',
    colSpan: 1,
    enabled: true,
    minimized: false,
  },
  {
    id: 'STATUS_DISTRIBUTION',
    title: 'Distribuição por Status Operacional',
    description: 'Visão percentual do funil de propostas entre pendentes, em andamento e pagas',
    category: 'OPERATIONS',
    colSpan: 1,
    enabled: true,
    minimized: false,
  },
  {
    id: 'BOTTLENECK_METRICS',
    title: 'Eficiência Operacional & Alçadas Responsáveis',
    description: 'Distribuição de carga de trabalho entre Nossa Equipe, Parceiro e Banco',
    category: 'OPERATIONS',
    colSpan: 1,
    enabled: true,
    minimized: false,
  },
];

export const ExecutiveDashboard: React.FC = () => {
  const activeUser = StorageService.getActiveUser();
  const proposals = StorageService.getProposals();
  const partners = StorageService.getPartners();
  const banks = StorageService.getBanks();
  const users = StorageService.getUsers();
  const statuses = StorageService.getStatuses();

  const [trendView, setTrendView] = useState<'ALL' | 'PAID_VS_TOTAL'>('PAID_VS_TOTAL');
  const [individualPeriod, setIndividualPeriod] = useState<'ALL' | '30_DAYS' | '7_DAYS'>('30_DAYS');
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Widget arrangement state with persistent storage per user
  const storageKey = `executive_widgets_layout_${activeUser.id}`;
  const [widgets, setWidgets] = useState<ExecutiveWidgetConfig[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with defaults in case new widgets were added
          const existingIds = new Set(parsed.map(w => w.id));
          const missingDefaults = DEFAULT_WIDGETS.filter(d => !existingIds.has(d.id));
          return [...parsed, ...missingDefaults];
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_WIDGETS;
  });

  const saveWidgets = (newWidgets: ExecutiveWidgetConfig[]) => {
    setWidgets(newWidgets);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newWidgets));
    } catch {
      // Ignore quota errors
    }
  };

  const handleResetToDefault = () => {
    saveWidgets(DEFAULT_WIDGETS);
    setIsCustomizeModalOpen(false);
  };

  const handleToggleColSpan = (id: ExecutiveWidgetId) => {
    const updated = widgets.map(w =>
      w.id === id ? { ...w, colSpan: w.colSpan === 1 ? (2 as const) : (1 as const) } : w
    );
    saveWidgets(updated);
  };

  const handleToggleMinimize = (id: ExecutiveWidgetId) => {
    const updated = widgets.map(w =>
      w.id === id ? { ...w, minimized: !w.minimized } : w
    );
    saveWidgets(updated);
  };

  const handleHideWidget = (id: ExecutiveWidgetId) => {
    const updated = widgets.map(w =>
      w.id === id ? { ...w, enabled: false } : w
    );
    saveWidgets(updated);
  };

  const handleMoveWidget = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= widgets.length) return;

    const newWidgets = [...widgets];
    const [moved] = newWidgets.splice(index, 1);
    newWidgets.splice(targetIndex, 0, moved);
    saveWidgets(newWidgets);
  };

  // Drag and Drop implementation
  const [draggedWidgetIndex, setDraggedWidgetIndex] = useState<number | null>(null);
  const [dragOverWidgetIndex, setDragOverWidgetIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedWidgetIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedWidgetIndex === null || draggedWidgetIndex === index) return;
    setDragOverWidgetIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggedWidgetIndex === null || draggedWidgetIndex === index) {
      setDraggedWidgetIndex(null);
      setDragOverWidgetIndex(null);
      return;
    }
    const newWidgets = [...widgets];
    const [moved] = newWidgets.splice(draggedWidgetIndex, 1);
    newWidgets.splice(index, 0, moved);
    setDraggedWidgetIndex(null);
    setDragOverWidgetIndex(null);
    saveWidgets(newWidgets);
  };

  const handleDragEnd = () => {
    setDraggedWidgetIndex(null);
    setDragOverWidgetIndex(null);
  };

  // Compute 30-Day Production Volume Trends
  const trendData30Days = useMemo(() => {
    const data: {
      date: string;
      label: string;
      total: number;
      pagas: number;
      emAndamento: number;
    }[] = [];

    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const isoDateStr = d.toISOString().split('T')[0];
      const dayFormatted = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      const dayProposals = proposals.filter(p => {
        if (!p.createdAt) return false;
        return p.createdAt.startsWith(isoDateStr);
      });

      const pagas = dayProposals.filter(p => {
        const s = statuses.find(st => st.id === p.statusId);
        return s?.code === 'PAGO';
      }).length;

      const total = dayProposals.length;
      const emAndamento = total - pagas;

      data.push({
        date: isoDateStr,
        label: dayFormatted,
        total,
        pagas,
        emAndamento,
      });
    }

    return data;
  }, [proposals, statuses]);

  // Key metrics for 30-day KPI widget
  const metrics30Days = useMemo(() => {
    const totalVolume = trendData30Days.reduce((acc, curr) => acc + curr.total, 0);
    const totalPagas = trendData30Days.reduce((acc, curr) => acc + curr.pagas, 0);
    const dailyAvg = (totalVolume / 30).toFixed(1);
    const peakDay = trendData30Days.reduce(
      (max, curr) => (curr.total > max.total ? curr : max),
      { date: '', label: '-', total: 0, pagas: 0, emAndamento: 0 }
    );
    const paidRate = totalVolume > 0 ? Math.round((totalPagas / totalVolume) * 100) : 0;

    return {
      totalVolume,
      totalPagas,
      dailyAvg,
      peakDay,
      paidRate,
    };
  }, [trendData30Days]);

  // Individual Operator Performance & Gamification data
  const operatorPerformance = useMemo(() => {
    const now = new Date();
    const cutoffDate = new Date();
    if (individualPeriod === '7_DAYS') {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (individualPeriod === '30_DAYS') {
      cutoffDate.setDate(now.getDate() - 30);
    } else {
      cutoffDate.setFullYear(2000); // ALL time
    }

    const filteredProps = proposals.filter(p => {
      if (!p.createdAt) return true;
      return new Date(p.createdAt) >= cutoffDate;
    });

    const activeUsers = users.filter(u => u.active !== false);

    const stats = activeUsers.map(u => {
      const userProps = filteredProps.filter(p => p.digitizerId === u.id);
      const total = userProps.length;
      const pagas = userProps.filter(p => {
        const s = statuses.find(st => st.id === p.statusId);
        return s?.code === 'PAGO';
      }).length;

      const emAndamento = userProps.filter(p => {
        const s = statuses.find(st => st.id === p.statusId);
        return s?.code !== 'PAGO' && s?.code !== 'CANCELADO';
      }).length;

      const canceladas = userProps.filter(p => {
        const s = statuses.find(st => st.id === p.statusId);
        return s?.code === 'CANCELADO';
      }).length;

      const conversionRate = total > 0 ? Math.round((pagas / total) * 100) : 0;
      const points = total * 10 + pagas * 50;

      return {
        id: u.id,
        name: u.name,
        role: u.role,
        avatar: u.name
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2),
        total,
        pagas,
        emAndamento,
        canceladas,
        conversionRate,
        points,
      };
    });

    return stats.sort((a, b) => b.points - a.points);
  }, [users, proposals, statuses, individualPeriod]);

  // Individual chart data (Top operators)
  const operatorChartData = useMemo(() => {
    return operatorPerformance.slice(0, 8).map(op => ({
      name: op.name.split(' ')[0],
      fullName: op.name,
      total: op.total,
      pagas: op.pagas,
      emAndamento: op.emAndamento,
      canceladas: op.canceladas,
      taxaConversao: op.conversionRate,
    }));
  }, [operatorPerformance]);

  // Top partners by count
  const partnerCounts = useMemo(() => {
    return partners
      .map(pt => {
        const total = proposals.filter(p => p.partnerId === pt.id).length;
        const pagas = proposals.filter(p => {
          const s = statuses.find(st => st.id === p.statusId);
          return p.partnerId === pt.id && s?.code === 'PAGO';
        }).length;

        return {
          id: pt.id,
          login: pt.login,
          code: extractPartnerCode(pt.login),
          name: pt.fullName,
          total,
          pagas,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [partners, proposals, statuses]);

  // Banks performance
  const bankChartData = useMemo(() => {
    return banks.map(b => ({
      name: b.name,
      total: proposals.filter(p => p.bankId === b.id).length,
    }));
  }, [banks, proposals]);

  // Operational Status Distribution
  const statusDistributionData = useMemo(() => {
    return statuses.map(s => {
      const count = proposals.filter(p => p.statusId === s.id).length;
      return {
        name: s.name,
        code: s.code,
        count,
        color: s.color || '#3b82f6',
      };
    }).filter(s => s.count > 0);
  }, [statuses, proposals]);

  // Efficiency & Bottlenecks
  const responsibleData = useMemo(() => {
    let nossaEquipe = 0;
    let parceiro = 0;
    let banco = 0;

    proposals.forEach(p => {
      const s = statuses.find(st => st.id === p.statusId);
      const resp = s?.responsibleGroup || s?.responsible || p.currentResponsible || 'NOSSA EQUIPE';
      if (resp.includes('PARCEIRO')) parceiro++;
      else if (resp.includes('BANCO')) banco++;
      else nossaEquipe++;
    });

    return [
      { name: 'Nossa Equipe', value: nossaEquipe, color: '#3b82f6' },
      { name: 'Parceiro / Loja', value: parceiro, color: '#f59e0b' },
      { name: 'Instituição Bancária', value: banco, color: '#8b5cf6' },
    ];
  }, [proposals, statuses]);

  // Render Widget Content dispatcher
  const renderWidgetContent = (widget: ExecutiveWidgetConfig) => {
    if (widget.minimized) {
      return (
        <div className="py-2 text-center text-xs text-slate-400">
          Widget minimizado. Clique no ícone de expandir para visualizar o conteúdo.
        </div>
      );
    }

    switch (widget.id) {
      case 'TREND_30_DAYS':
        return (
          <div className="space-y-4">
            {/* 4 Summary Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-3">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">Total 30 Dias</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-black text-slate-900 dark:text-slate-100">{metrics30Days.totalVolume}</span>
                  <span className="text-[11px] font-bold text-slate-400">ADEs</span>
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 p-3">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 block">ADEs Pagas</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">{metrics30Days.totalPagas}</span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">({metrics30Days.paidRate}%)</span>
                </div>
              </div>

              <div className="rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 p-3">
                <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 block">Média Diária</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-black text-blue-700 dark:text-blue-300">{metrics30Days.dailyAvg}</span>
                  <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">propostas/dia</span>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 p-3">
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 block">Pico Diário</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-black text-amber-800 dark:text-amber-300">{metrics30Days.peakDay.total}</span>
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                    ({metrics30Days.peakDay.label})
                  </span>
                </div>
              </div>
            </div>

            {/* Recharts Area Chart */}
            <div className="h-72 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData30Days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="totalVolumeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="pagasGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    interval="preserveStartEnd"
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: 'none',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: '#fff',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    }}
                    labelStyle={{ fontWeight: 'bold', color: '#94a3b8', marginBottom: '4px' }}
                    formatter={(value: any, name: any) => {
                      if (name === 'total') return [`${value} propostas`, 'Volume Total'];
                      if (name === 'pagas') return [`${value} propostas`, 'Propostas Pagas'];
                      if (name === 'emAndamento') return [`${value} propostas`, 'Em Andamento'];
                      return [value, name];
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '8px', fontSize: '11px', fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Volume Total"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#totalVolumeGradient)"
                  />
                  {trendView === 'PAID_VS_TOTAL' && (
                    <Area
                      type="monotone"
                      dataKey="pagas"
                      name="Propostas Pagas"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#pagasGradient)"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'OPERATOR_PERFORMANCE':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Recharts Multi-Bar Productivity by Operator */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <span>Volume por Operador (Pagas vs. Em Andamento)</span>
                </span>
                <span className="text-[11px] text-slate-400">Top 8 Operadores</span>
              </div>

              <div className="h-72 border border-slate-100 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-800/40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={operatorChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: 'none',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: '#fff',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      }}
                      labelFormatter={(label) => {
                        const item = operatorChartData.find(o => o.name === label);
                        return item?.fullName || label;
                      }}
                      formatter={(val: any, name: any) => {
                        if (name === 'pagas') return [`${val} propostas`, 'Pagas / Concluídas'];
                        if (name === 'emAndamento') return [`${val} propostas`, 'Em Andamento'];
                        if (name === 'canceladas') return [`${val} propostas`, 'Canceladas'];
                        return [val, name];
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      iconType="circle"
                      wrapperStyle={{ paddingBottom: '6px', fontSize: '11px', fontWeight: 600 }}
                    />
                    <Bar
                      dataKey="pagas"
                      name="Pagas / Concluídas"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      stackId="a"
                    />
                    <Bar
                      dataKey="emAndamento"
                      name="Em Andamento"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                      stackId="a"
                    />
                    <Bar
                      dataKey="canceladas"
                      name="Canceladas"
                      fill="#f43f5e"
                      radius={[4, 4, 0, 0]}
                      stackId="a"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gamified Leaderboard Cards List */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span>Ranking de Gamificação</span>
                </span>
                <span className="text-[11px] text-slate-400">Pontos & Conversão</span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {operatorPerformance.map((op, idx) => {
                  const medalBg =
                    idx === 0
                      ? 'bg-amber-400 text-amber-950 font-black'
                      : idx === 1
                      ? 'bg-slate-300 text-slate-900 font-black'
                      : idx === 2
                      ? 'bg-amber-600 text-white font-black'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold';

                  return (
                    <div
                      key={op.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                        idx === 0
                          ? 'border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20 shadow-2xs'
                          : 'border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs shrink-0 ${medalBg}`}>
                          {idx + 1}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{op.name}</p>
                            <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                              {op.role}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              {op.pagas} pagas
                            </span>
                            <span>•</span>
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">
                              {op.conversionRate}% conv.
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold text-amber-800 dark:text-amber-300 block">
                          {op.points.toLocaleString('pt-BR')} pts
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {op.total} {op.total === 1 ? 'proposta' : 'propostas'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'PARTNERS_RANKING':
        return (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {partnerCounts.slice(0, 6).map((pt, idx) => (
              <div
                key={pt.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-xs ${
                      idx === 0
                        ? 'bg-amber-400 text-amber-900'
                        : idx === 1
                        ? 'bg-slate-300 text-slate-800'
                        : idx === 2
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{pt.login}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Código: <strong>{pt.code}</strong> • {pt.name}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 block">
                    {pt.total} ADEs
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    {pt.pagas} pagas
                  </span>
                </div>
              </div>
            ))}
          </div>
        );

      case 'BANKS_VOLUME':
        return (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bankChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="total" name="Volume Total" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'STATUS_DISTRIBUTION':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {statusDistributionData.slice(0, 6).map(st => (
                <div
                  key={st.code}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{st.name}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{st.count}</span>
                </div>
              ))}
            </div>
            <div className="h-44 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusDistributionData} layout="vertical" margin={{ left: 20, right: 20, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={90} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: 'none',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="count" name="Propostas" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                    {statusDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'BOTTLENECK_METRICS':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {responsibleData.map(r => (
                <div
                  key={r.name}
                  className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-2.5 text-center"
                >
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
                    {r.name}
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1 block">
                    {r.value}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">ADEs ativas</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-300">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span>Gestão Proativa de Alçadas & SLAs</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                As propostas em <strong>Nossa Equipe</strong> são priorizadas pelo cronômetro SLA Kanban. Pendências externas notificam automaticamente parceiros e bancos para destravamento do fluxo.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const enabledWidgets = widgets.filter(w => w.enabled);

  return (
    <div className="space-y-6">
      {/* Top Header & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Dashboard Executivo</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Widgets Customizáveis
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Indicadores estratégicos de performance, tendências em 30 dias e ranking de parceiros
          </p>
        </div>

        {/* Dashboard Customization Controls */}
        <div className="flex items-center gap-2">
          {/* Edit Mode Toggle */}
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            title="Ativar modo de reordenação visual dos widgets"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              isEditMode
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Move className="h-3.5 w-3.5" />
            <span>{isEditMode ? 'Concluir Organização' : 'Reordenar'}</span>
          </button>

          {/* Open Customize Modal */}
          <button
            onClick={() => setIsCustomizeModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-semibold transition-colors shadow-2xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>Personalizar</span>
          </button>
        </div>
      </div>

      {/* Draggable & Reorderable Grid of Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {enabledWidgets.map((widget, index) => {
          const isFullWidth = widget.colSpan === 2;
          const isFirst = index === 0;
          const isLast = index === enabledWidgets.length - 1;
          const isDragOver = dragOverWidgetIndex === index;

          return (
            <div
              key={widget.id}
              draggable={isEditMode}
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={`rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-900 shadow-2xs ${
                isFullWidth ? 'lg:col-span-2' : 'lg:col-span-1'
              } ${
                isDragOver
                  ? 'border-blue-500 ring-2 ring-blue-400/50 bg-blue-50/10 scale-[1.005]'
                  : 'border-slate-200 dark:border-slate-800'
              } ${isEditMode ? 'cursor-grab active:cursor-grabbing hover:border-amber-400 hover:shadow-md' : ''}`}
            >
              {/* Widget Header Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800 p-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Drag Handle */}
                  <div
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={e => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className="cursor-grab active:cursor-grabbing p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Arrastar e soltar para reorganizar posição deste widget"
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>

                  {/* Widget Title & Subtitle */}
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 truncate">
                      <span>{widget.title}</span>
                      {widget.id === 'TREND_30_DAYS' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <Activity className="h-3 w-3" /> Tempo Real
                        </span>
                      )}
                      {widget.id === 'OPERATOR_PERFORMANCE' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <Flame className="h-3 w-3 text-amber-600" /> Leaderboard
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {widget.description}
                    </p>
                  </div>
                </div>

                {/* Widget Controls on Right */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Specialized buttons per widget */}
                  {widget.id === 'TREND_30_DAYS' && !widget.minimized && (
                    <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 mr-1">
                      <button
                        onClick={() => setTrendView('PAID_VS_TOTAL')}
                        className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${
                          trendView === 'PAID_VS_TOTAL'
                            ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Volume vs Pagas
                      </button>
                      <button
                        onClick={() => setTrendView('ALL')}
                        className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${
                          trendView === 'ALL'
                            ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Volume Total
                      </button>
                    </div>
                  )}

                  {widget.id === 'OPERATOR_PERFORMANCE' && !widget.minimized && (
                    <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 mr-1">
                      <button
                        onClick={() => setIndividualPeriod('7_DAYS')}
                        className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${
                          individualPeriod === '7_DAYS'
                            ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-300 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        7D
                      </button>
                      <button
                        onClick={() => setIndividualPeriod('30_DAYS')}
                        className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${
                          individualPeriod === '30_DAYS'
                            ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-300 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        30D
                      </button>
                      <button
                        onClick={() => setIndividualPeriod('ALL')}
                        className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${
                          individualPeriod === 'ALL'
                            ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-300 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Geral
                      </button>
                    </div>
                  )}

                  {/* Move Up / Down */}
                  <button
                    onClick={() => handleMoveWidget(index, 'UP')}
                    disabled={isFirst}
                    title="Mover widget para cima"
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleMoveWidget(index, 'DOWN')}
                    disabled={isLast}
                    title="Mover widget para baixo"
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>

                  {/* Toggle Width Span */}
                  <button
                    onClick={() => handleToggleColSpan(widget.id)}
                    title={widget.colSpan === 2 ? 'Mudar para 50% de largura' : 'Expandir para 100% de largura'}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {widget.colSpan === 2 ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {/* Minimize / Expand */}
                  <button
                    onClick={() => handleToggleMinimize(widget.id)}
                    title={widget.minimized ? 'Expandir widget' : 'Minimizar widget'}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {widget.minimized ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {/* Hide Widget */}
                  <button
                    onClick={() => handleHideWidget(widget.id)}
                    title="Ocultar este widget (pode ser reativado em Personalizar)"
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Widget Body */}
              <div className="p-5">
                {renderWidgetContent(widget)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Personalização dos Widgets */}
      <CustomizeWidgetsModal
        isOpen={isCustomizeModalOpen}
        onClose={() => setIsCustomizeModalOpen(false)}
        widgets={widgets}
        onUpdateWidgets={saveWidgets}
        onResetToDefault={handleResetToDefault}
      />
    </div>
  );
};
