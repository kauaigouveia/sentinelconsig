import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Sparkles,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Activity,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Database,
  BarChart3,
  ListFilter,
  Check,
  X,
  PlusCircle,
  HelpCircle,
  Info,
  Calendar,
  Building2,
  Users,
} from 'lucide-react';
import {
  IntelligenceInsightDTO,
  IntelligenceOverviewResponse,
  IntelligenceMetricsResponse,
  IntelligenceRuleConfigDTO,
  IntelligenceStatus,
  IntelligenceSeverity,
  IntelligenceInsightType,
  IntelligenceTimelineItem,
} from '../../types/intelligence';

interface Props {
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
}

export const SentinelIntelligenceDashboard: React.FC<Props> = ({ onNavigateToView }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'insights' | 'rules' | 'metrics'>('overview');
  const [loading, setLoading] = useState(false);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [overview, setOverview] = useState<IntelligenceOverviewResponse | null>(null);
  const [insights, setInsights] = useState<IntelligenceInsightDTO[]>([]);
  const [metrics, setMetrics] = useState<IntelligenceMetricsResponse | null>(null);
  const [rules, setRules] = useState<IntelligenceRuleConfigDTO[]>([]);
  const [selectedInsight, setSelectedInsight] = useState<IntelligenceInsightDTO | null>(null);
  const [insightTimeline, setInsightTimeline] = useState<IntelligenceTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Action status feedback
  const [actionFeedback, setActionFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
    setActionFeedback({ msg, type });
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, insightsRes, metricsRes, rulesRes] = await Promise.all([
        fetch('/api/intelligence/overview'),
        fetch('/api/intelligence/insights'),
        fetch('/api/intelligence/metrics'),
        fetch('/api/intelligence/rules'),
      ]);

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setOverview(data);
      }
      if (insightsRes.ok) {
        const data = await insightsRes.json();
        setInsights(data.insights || []);
      }
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data);
      }
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules || []);
      }
    } catch (err) {
      console.error('[INTELLIGENCE] Erro ao carregar dados:', err);
      showFeedback('Erro ao conectar com a Central de Inteligência.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunAnalysis = async () => {
    setRunningAnalysis(true);
    try {
      const res = await fetch('/api/intelligence/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const result = await res.json();
        showFeedback(
          `Varredura concluída! ${result.insightsNew} novos insights identificados (${result.rulesEvaluated} regras avaliadas).`,
          'success'
        );
        await loadData();
      } else {
        const err = await res.json();
        showFeedback(err.error || 'Erro ao executar varredura analítica.', 'error');
      }
    } catch (err) {
      showFeedback('Falha na comunicação com o servidor.', 'error');
    } finally {
      setRunningAnalysis(false);
    }
  };

  const handleStatusChange = async (id: string, action: 'acknowledge' | 'investigate' | 'resolve' | 'dismiss') => {
    try {
      const res = await fetch(`/api/intelligence/insights/${id}/${action}`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated = await res.json();
        showFeedback(`Insight atualizado para status: ${updated.status}`, 'success');
        if (selectedInsight?.id === id) {
          setSelectedInsight(updated);
          loadInsightTimeline(id);
        }
        await loadData();
      } else {
        const err = await res.json();
        showFeedback(err.error || 'Erro ao atualizar insight.', 'error');
      }
    } catch (err) {
      showFeedback('Erro de conexão ao atualizar status.', 'error');
    }
  };

  const handleCreatePendency = async (insight: IntelligenceInsightDTO) => {
    try {
      const res = await fetch(`/api/intelligence/insights/${insight.id}/create-pendency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const pendency = await res.json();
        showFeedback(`Pendência operacional criada com sucesso: #${pendency.id.slice(0, 8)}`, 'success');
      } else {
        const err = await res.json();
        showFeedback(err.error || 'Erro ao gerar pendência.', 'error');
      }
    } catch (err) {
      showFeedback('Falha ao acionar Central de Pendências.', 'error');
    }
  };

  const loadInsightTimeline = async (id: string) => {
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/intelligence/insights/${id}/timeline`);
      if (res.ok) {
        const data = await res.json();
        setInsightTimeline(data.timeline || []);
      }
    } catch (err) {
      console.error('Erro ao carregar timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  const openInsightDetail = (insight: IntelligenceInsightDTO) => {
    setSelectedInsight(insight);
    loadInsightTimeline(insight.id);
  };

  const handleToggleRule = async (ruleId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/intelligence/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (res.ok) {
        showFeedback(`Regra ${!currentEnabled ? 'ativada' : 'pausada'} com sucesso!`, 'success');
        await loadData();
      }
    } catch (err) {
      showFeedback('Erro ao atualizar regra.', 'error');
    }
  };

  // Filtered insights
  const filteredInsights = insights.filter(item => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (severityFilter !== 'ALL' && item.severity !== severityFilter) return false;
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        (item.entityName && item.entityName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getSeverityBadge = (severity: IntelligenceSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-300 dark:border-red-800';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300 dark:border-orange-800';
      case 'MEDIUM':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'LOW':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'INFO':
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    }
  };

  const getStatusBadge = (status: IntelligenceStatus) => {
    switch (status) {
      case 'NEW':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300';
      case 'ACKNOWLEDGED':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
      case 'INVESTIGATING':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
      case 'RESOLVED':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
      case 'DISMISSED':
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 rounded-2xl text-white shadow-xl border border-indigo-500/20">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-400/30">
              <Brain className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-indigo-300">
                SENTINEL CONSIG
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Sentinel Intelligence
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-medium">
                  Fase 7 Operacional
                </span>
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                Inteligência que antecipa. Controle que transforma.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition shadow-sm"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <button
            onClick={handleRunAnalysis}
            disabled={runningAnalysis}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition transform active:scale-95 border border-indigo-400/40"
          >
            <Sparkles className={`w-4 h-4 ${runningAnalysis ? 'animate-spin' : ''}`} />
            {runningAnalysis ? 'Analisando...' : 'Executar Varredura'}
          </button>
        </div>
      </div>

      {/* Action Toast Feedback */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center gap-2 shadow-lg transition animate-in fade-in slide-in-from-top-2 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/70 dark:text-red-200 dark:border-red-800'
          }`}
        >
          {actionFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          )}
          {actionFeedback.msg}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Radar de Inteligência
        </button>

        <button
          onClick={() => setActiveTab('insights')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 ${
            activeTab === 'insights'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Explorador de Insights ({insights.length})
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 ${
            activeTab === 'rules'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Regras & Limiares ({rules.length})
        </button>

        <button
          onClick={() => setActiveTab('metrics')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 ${
            activeTab === 'metrics'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Métricas de Eficácia
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-5">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Novos Insights</span>
                <span className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                {overview.summary.newInsights}
              </div>
              <p className="text-xs text-slate-500 mt-1">Aguardando análise da gestão</p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Alertas Críticos</span>
                <span className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600">
                  <ShieldAlert className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-2">
                {overview.summary.criticalInsights}
              </div>
              <p className="text-xs text-slate-500 mt-1">Exigem tratativa imediata</p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Correlações Detectadas</span>
                <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
                  <Activity className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
                {overview.summary.correlationsCount}
              </div>
              <p className="text-xs text-slate-500 mt-1">Eventos cruzados multissetoriais</p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Gargalos & SLA</span>
                <span className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600">
                  <Clock className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
                {overview.summary.bottlenecksCount}
              </div>
              <p className="text-xs text-slate-500 mt-1">Pontos de retenção na esteira</p>
            </div>
          </div>

          {/* Critical Alerts & Cross-Domain Correlations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Top Anomalies Section */}
            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  Principais Anomalias Operacionais
                </h2>
                <span className="text-xs text-slate-500 font-medium">{overview.topAnomalies.length} ativas</span>
              </div>

              {overview.topAnomalies.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Nenhuma anomalia crítica ou de alta severidade detectada no momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.topAnomalies.map(item => (
                    <div
                      key={item.id}
                      onClick={() => openInsightDetail(item)}
                      className="p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 bg-slate-50/50 dark:bg-slate-800/40 transition cursor-pointer flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(item.severity)}`}>
                            {item.severity}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {item.category}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(item.detectedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {item.summary}
                      </p>

                      <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500">
                        <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold">
                          Investigar Evidências <ChevronRight className="w-3 h-3" />
                        </span>
                        <span className="font-mono text-[10px]">Confiança: {(item.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Cross-Domain Correlations */}
            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  Correlações Cruzadas de Causa & Efeito
                </h2>
                <span className="text-xs text-slate-500 font-medium">{overview.topCorrelations.length} identificadas</span>
              </div>

              {overview.topCorrelations.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Nenhuma correlação entre eventos de integração, conversão ou esteira no momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.topCorrelations.map(item => (
                    <div
                      key={item.id}
                      onClick={() => openInsightDetail(item)}
                      className="p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-950/60 bg-indigo-50/30 dark:bg-indigo-950/20 hover:border-indigo-300 dark:hover:border-indigo-700 transition cursor-pointer flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200">
                          CORRELAÇÃO TEMPORAL
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(item.detectedAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        {item.summary}
                      </p>

                      <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500">
                        <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold">
                          Ver Relacionamentos <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INSIGHTS EXPLORER */}
      {activeTab === 'insights' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar por título, entidade, banco, parceiro..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs focus:outline-none"
              >
                <option value="ALL">Status: Todos</option>
                <option value="NEW">Novos</option>
                <option value="ACKNOWLEDGED">Reconhecidos</option>
                <option value="INVESTIGATING">Investigando</option>
                <option value="RESOLVED">Resolvidos</option>
                <option value="DISMISSED">Descartados</option>
              </select>

              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs focus:outline-none"
              >
                <option value="ALL">Severidade: Todas</option>
                <option value="CRITICAL">Crítica</option>
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Média</option>
                <option value="LOW">Baixa</option>
              </select>

              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setSeverityFilter('ALL');
                  setCategoryFilter('ALL');
                  setSearchTerm('');
                }}
                className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Limpar
              </button>
            </div>
          </div>

          {/* Insights Grid / Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Severidade</th>
                    <th className="py-3 px-4">Insight & Resumo</th>
                    <th className="py-3 px-4">Categoria / Tipo</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Detectado em</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredInsights.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Nenhum insight encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredInsights.map(item => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition cursor-pointer"
                        onClick={() => openInsightDetail(item)}
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(item.severity)}`}>
                            {item.severity}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{item.title}</div>
                          <div className="text-slate-500 dark:text-slate-400 line-clamp-1 text-[11px] mt-0.5">
                            {item.summary}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {item.category}
                          </span>
                          <div className="text-[10px] text-slate-400">{item.type}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {new Date(item.detectedAt).toLocaleDateString('pt-BR')} {new Date(item.detectedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {item.status === 'NEW' && (
                              <button
                                onClick={() => handleStatusChange(item.id, 'acknowledge')}
                                className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg transition"
                                title="Reconhecer"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {item.status !== 'RESOLVED' && item.status !== 'DISMISSED' && (
                              <button
                                onClick={() => handleStatusChange(item.id, 'resolve')}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg transition"
                                title="Resolver"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => openInsightDetail(item)}
                              className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition flex items-center gap-1"
                            >
                              Ver <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: RULES & THRESHOLDS */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Catálogo de Regras de Inteligência</h2>
              <p className="text-xs text-slate-500">Configure os limiares de ativação e sensibilidade dos detectores operacionais</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map(rule => (
              <div
                key={rule.ruleId}
                className={`p-4 rounded-2xl border transition bg-white dark:bg-slate-900 ${
                  rule.enabled
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-slate-200/50 dark:border-slate-800/50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(rule.severity)}`}>
                        {rule.severity}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {rule.category}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white mt-1.5">{rule.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>
                  </div>

                  <button
                    onClick={() => handleToggleRule(rule.ruleId, rule.enabled)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                      rule.enabled
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {rule.enabled ? 'Ativa' : 'Pausada'}
                  </button>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-mono">
                  <span>Limiar Padrão: {rule.threshold !== undefined && rule.threshold !== null ? `${rule.threshold}%` : 'Automático'}</span>
                  <span className="text-[10px] text-slate-400">ID: {rule.ruleId}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: METRICS & KPI */}
      {activeTab === 'metrics' && metrics && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 font-medium">Total Gerado</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {metrics.totalInsightsGenerated}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 font-medium">Taxa de Resolução</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {metrics.resolutionRatePercent}%
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 font-medium">Tempo Médio Resolução</span>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {metrics.avgResolutionTimeHours}h
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 font-medium">Insights Ativos</span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                {metrics.activeCount}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED INSIGHT MODAL */}
      {selectedInsight && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(selectedInsight.severity)}`}>
                    {selectedInsight.severity}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(selectedInsight.status)}`}>
                    {selectedInsight.status}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    {selectedInsight.category} • Confiança: {(selectedInsight.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1.5">
                  {selectedInsight.title}
                </h2>
              </div>

              <button
                onClick={() => setSelectedInsight(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Summary */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white mb-1">Diagnóstico Operacional</h3>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{selectedInsight.summary}</p>
              </div>

              {/* Structured Evidences */}
              {selectedInsight.evidence && selectedInsight.evidence.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-indigo-500" />
                    Evidências Verificadas & Métricas
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedInsight.evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
                      >
                        <div className="text-[10px] text-slate-400 font-medium">{ev.label || ev.metric}</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                          {ev.currentValue}
                        </div>
                        {ev.variation !== undefined && ev.variation !== null && (
                          <div className={`text-[10px] font-bold mt-1 ${ev.variation > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {ev.variation > 0 ? '+' : ''}{ev.variation.toFixed(1)}% vs anterior
                          </div>
                        )}
                        <div className="text-[9px] text-slate-400 mt-1">Fonte: {ev.source}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Explanation */}
              {selectedInsight.explanation && (
                <div className="space-y-1.5">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-indigo-500" />
                    Raciocínio Analítico & Contribuição das Dimensões
                  </h3>
                  <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                    {selectedInsight.explanation}
                  </div>
                </div>
              )}

              {/* Suggested Operational Actions */}
              {selectedInsight.suggestedActions && selectedInsight.suggestedActions.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h3 className="font-bold text-slate-900 dark:text-white">Ações Recomendadas</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedInsight.suggestedActions.map(act => (
                      <button
                        key={act.id}
                        onClick={() => {
                          if (act.type === 'CREATE_PENDENCY') {
                            handleCreatePendency(selectedInsight);
                          } else if (act.targetUrl && onNavigateToView) {
                            // Extract view from url
                            const view = act.targetUrl.replace('/', '').split('?')[0];
                            onNavigateToView(view);
                            setSelectedInsight(null);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold text-xs flex items-center gap-1.5 transition"
                      >
                        {act.type === 'CREATE_PENDENCY' ? <PlusCircle className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                        {act.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit Timeline */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Linha do Tempo de Resolução
                </h3>
                {timelineLoading ? (
                  <div className="text-slate-400 text-xs">Carregando histórico...</div>
                ) : (
                  <div className="space-y-1.5">
                    {insightTimeline.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-[11px] p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                        <span className="font-bold text-slate-700 dark:text-slate-300">{item.stage}</span>
                        <span className="text-slate-500">{item.description}</span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          {new Date(item.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCreatePendency(selectedInsight)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Gerar Pendência
                </button>
              </div>

              <div className="flex items-center gap-2">
                {selectedInsight.status === 'NEW' && (
                  <button
                    onClick={() => handleStatusChange(selectedInsight.id, 'acknowledge')}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition"
                  >
                    Reconhecer
                  </button>
                )}
                {selectedInsight.status !== 'INVESTIGATING' && selectedInsight.status !== 'RESOLVED' && selectedInsight.status !== 'DISMISSED' && (
                  <button
                    onClick={() => handleStatusChange(selectedInsight.id, 'investigate')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
                  >
                    Investigar
                  </button>
                )}
                {selectedInsight.status !== 'RESOLVED' && (
                  <button
                    onClick={() => handleStatusChange(selectedInsight.id, 'resolve')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition"
                  >
                    Marcar Resolvido
                  </button>
                )}
                {selectedInsight.status !== 'DISMISSED' && (
                  <button
                    onClick={() => handleStatusChange(selectedInsight.id, 'dismiss')}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition"
                  >
                    Descartar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
