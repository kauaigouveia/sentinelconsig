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
        return 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)] border-[var(--danger-border)] dark:border-[var(--danger-border)]';
      case 'HIGH':
        return 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]';
      case 'MEDIUM':
        return 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]';
      case 'LOW':
        return 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]';
      case 'INFO':
      default:
        return 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)] border-[var(--field-border)] dark:border-[var(--field-border)]';
    }
  };

  const getStatusBadge = (status: IntelligenceStatus) => {
    switch (status) {
      case 'NEW':
        return 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]';
      case 'ACKNOWLEDGED':
        return 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]';
      case 'INVESTIGATING':
        return 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]';
      case 'RESOLVED':
        return 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]';
      case 'DISMISSED':
        return 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-secondary)]';
    }
  };

  return (
    <div className="space-y-5 p2-intelligence-workspace">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3     p-5 rounded-2xl text-[var(--text-primary)]  border border-[var(--field-border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[var(--info-bg)] rounded-xl border border-[var(--field-border)]">
              <Brain className="w-6 h-6 text-[var(--link)]" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--link)]">
                SENTINEL CONSIG
              </div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                Sentinel Intelligence
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--info-bg)] text-[var(--link)] border border-[var(--field-border)] font-medium">
                  Fase 7 Operacional
                </span>
              </h1>
              <p className="text-xs text-[var(--text-primary)] mt-0.5">
                Inteligência que antecipa. Controle que transforma.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] text-xs font-semibold rounded-xl border border-[var(--field-border)] flex items-center gap-1.5 transition shadow-sm"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <button
            onClick={handleRunAnalysis}
            disabled={runningAnalysis}
            className="px-4 py-2 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] text-xs font-bold rounded-xl   flex items-center gap-1.5 transition transform active:scale-95 border border-[var(--field-border)]"
          >
            <Sparkles className={`w-4 h-4 ${runningAnalysis ? 'animate-spin' : ''}`} />
            {runningAnalysis ? 'Analisando...' : 'Executar Varredura'}
          </button>
        </div>
      </div>

      {/* Action Toast Feedback */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center gap-2  transition animate-in fade-in slide-in-from-top-2 ${
            actionFeedback.type === 'success'
              ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)] dark:border-[var(--success-border)]'
              : 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)] dark:border-[var(--danger-border)]'
          }`}
        >
          {actionFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[var(--success-text)] dark:text-[var(--success-text)] shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-[var(--danger-text)] dark:text-[var(--danger-text)] shrink-0" />
          )}
          {actionFeedback.msg}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-[var(--field-border)] dark:border-[var(--field-border)] gap-2 p2-analytics-tabs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)]'
              : 'border-transparent text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          <Activity className="w-4 h-4" />
          Radar de Inteligência
        </button>

        <button
          onClick={() => setActiveTab('insights')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 ${
            activeTab === 'insights'
              ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)]'
              : 'border-transparent text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers className="w-4 h-4" />
          Explorador de Insights ({insights.length})
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 ${
            activeTab === 'rules'
              ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)]'
              : 'border-transparent text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Regras & Limiares ({rules.length})
        </button>

        <button
          onClick={() => setActiveTab('metrics')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 ${
            activeTab === 'metrics'
              ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)]'
              : 'border-transparent text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
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
            <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                <span>Novos Insights</span>
                <span className="p-1.5 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)]">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-2">
                {overview.summary.newInsights}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Aguardando análise da gestão</p>
            </div>

            <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                <span>Alertas Críticos</span>
                <span className="p-1.5 rounded-lg bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)]">
                  <ShieldAlert className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-[var(--danger-text)] dark:text-[var(--danger-text)] mt-2">
                {overview.summary.criticalInsights}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Exigem tratativa imediata</p>
            </div>

            <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                <span>Correlações Detectadas</span>
                <span className="p-1.5 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)]">
                  <Activity className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)] mt-2">
                {overview.summary.correlationsCount}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Eventos cruzados multissetoriais</p>
            </div>

            <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                <span>Gargalos & SLA</span>
                <span className="p-1.5 rounded-lg bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)]">
                  <Clock className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-[var(--warning-text)] dark:text-[var(--warning-text)] mt-2">
                {overview.summary.bottlenecksCount}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Pontos de retenção na esteira</p>
            </div>
          </div>

          {/* Critical Alerts & Cross-Domain Correlations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Top Anomalies Section */}
            <div className="p-5 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]  space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[var(--warning-text)]" />
                  Principais Anomalias Operacionais
                </h2>
                <span className="text-xs text-[var(--text-secondary)] font-medium">{overview.topAnomalies.length} ativas</span>
              </div>

              {overview.topAnomalies.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-secondary)] text-xs border border-dashed border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl">
                  Nenhuma anomalia crítica ou de alta severidade detectada no momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.topAnomalies.map(item => (
                    <div
                      key={item.id}
                      onClick={() => openInsightDetail(item)}
                      className="p-3.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] hover:border-[var(--field-border)] dark:hover:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] transition cursor-pointer flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(item.severity)}`}>
                            {item.severity}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            {item.category}
                          </span>
                        </div>
                        <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                          {new Date(item.detectedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] line-clamp-2">
                        {item.summary}
                      </p>

                      <div className="flex items-center justify-between text-[11px] pt-1 text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1 text-[var(--link)] dark:text-[var(--link)] font-semibold">
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
            <div className="p-5 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]  space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--link)]" />
                  Correlações Cruzadas de Causa & Efeito
                </h2>
                <span className="text-xs text-[var(--text-secondary)] font-medium">{overview.topCorrelations.length} identificadas</span>
              </div>

              {overview.topCorrelations.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-secondary)] text-xs border border-dashed border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl">
                  Nenhuma correlação entre eventos de integração, conversão ou esteira no momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.topCorrelations.map(item => (
                    <div
                      key={item.id}
                      onClick={() => openInsightDetail(item)}
                      className="p-3.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] hover:border-[var(--field-border)] dark:hover:border-[var(--field-border)] transition cursor-pointer flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]">
                          CORRELAÇÃO TEMPORAL
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                          {new Date(item.detectedAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {item.summary}
                      </p>

                      <div className="flex items-center justify-between text-[11px] pt-1 text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1 text-[var(--link)] dark:text-[var(--link)] font-semibold">
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
          <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]  flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar por título, entidade, banco, parceiro..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs focus:outline-none"
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
                className="px-2.5 py-1.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs focus:outline-none"
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
                className="px-2.5 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]"
              >
                Limpar
              </button>
            </div>
          </div>

          {/* Insights Grid / Table */}
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]  overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Severidade</th>
                    <th className="py-3 px-4">Insight & Resumo</th>
                    <th className="py-3 px-4">Categoria / Tipo</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Detectado em</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {filteredInsights.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--text-secondary)]">
                        Nenhum insight encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredInsights.map(item => (
                      <tr
                        key={item.id}
                        className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
                        onClick={() => openInsightDetail(item)}
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(item.severity)}`}>
                            {item.severity}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{item.title}</div>
                          <div className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] line-clamp-1 text-[11px] mt-0.5">
                            {item.summary}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            {item.category}
                          </span>
                          <div className="text-[10px] text-[var(--text-secondary)]">{item.type}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-[var(--text-secondary)] font-mono text-[11px]">
                          {new Date(item.detectedAt).toLocaleDateString('pt-BR')} {new Date(item.detectedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {item.status === 'NEW' && (
                              <button
                                onClick={() => handleStatusChange(item.id, 'acknowledge')}
                                className="p-1 text-[var(--link)] hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] rounded-lg transition"
                                title="Reconhecer"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {item.status !== 'RESOLVED' && item.status !== 'DISMISSED' && (
                              <button
                                onClick={() => handleStatusChange(item.id, 'resolve')}
                                className="p-1 text-[var(--success-text)] hover:bg-[var(--success-bg)] dark:hover:bg-[var(--success-bg)] rounded-lg transition"
                                title="Resolver"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => openInsightDetail(item)}
                              className="px-2 py-1 text-xs font-semibold text-[var(--link)] hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] rounded-lg transition flex items-center gap-1"
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
          <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]  flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Catálogo de Regras de Inteligência</h2>
              <p className="text-xs text-[var(--text-secondary)]">Configure os limiares de ativação e sensibilidade dos detectores operacionais</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map(rule => (
              <div
                key={rule.ruleId}
                className={`p-4 rounded-2xl border transition bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] ${
                  rule.enabled
                    ? 'border-[var(--field-border)] dark:border-[var(--field-border)]'
                    : 'border-[var(--field-border)] dark:border-[var(--field-border)] opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(rule.severity)}`}>
                        {rule.severity}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {rule.category}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1.5">{rule.name}</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{rule.description}</p>
                  </div>

                  <button
                    onClick={() => handleToggleRule(rule.ruleId, rule.enabled)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                      rule.enabled
                        ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                        : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-secondary)]'
                    }`}
                  >
                    {rule.enabled ? 'Ativa' : 'Pausada'}
                  </button>
                </div>

                <div className="mt-3 pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-mono">
                  <span>Limiar Padrão: {rule.threshold !== undefined && rule.threshold !== null ? `${rule.threshold}%` : 'Automático'}</span>
                  <span className="text-[10px] text-[var(--text-secondary)]">ID: {rule.ruleId}</span>
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
            <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Total Gerado</span>
              <div className="text-2xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">
                {metrics.totalInsightsGenerated}
              </div>
            </div>

            <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Taxa de Resolução</span>
              <div className="text-2xl font-black text-[var(--success-text)] dark:text-[var(--success-text)] mt-1">
                {metrics.resolutionRatePercent}%
              </div>
            </div>

            <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Tempo Médio Resolução</span>
              <div className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)] mt-1">
                {metrics.avgResolutionTimeHours}h
              </div>
            </div>

            <div className="p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Insights Ativos</span>
              <div className="text-2xl font-black text-[var(--warning-text)] dark:text-[var(--warning-text)] mt-1">
                {metrics.activeCount}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED INSIGHT MODAL */}
      {selectedInsight && (
        <div className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]  max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex items-start justify-between gap-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)]">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(selectedInsight.severity)}`}>
                    {selectedInsight.severity}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(selectedInsight.status)}`}>
                    {selectedInsight.status}
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                    {selectedInsight.category} • Confiança: {(selectedInsight.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <h2 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1.5">
                  {selectedInsight.title}
                </h2>
              </div>

              <button
                onClick={() => setSelectedInsight(null)}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-xl hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Summary */}
              <div className="p-3.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
                <h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">Diagnóstico Operacional</h3>
                <p className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-relaxed">{selectedInsight.summary}</p>
              </div>

              {/* Structured Evidences */}
              {selectedInsight.evidence && selectedInsight.evidence.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-[var(--link)]" />
                    Evidências Verificadas & Métricas
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedInsight.evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]"
                      >
                        <div className="text-[10px] text-[var(--text-secondary)] font-medium">{ev.label || ev.metric}</div>
                        <div className="text-sm font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-0.5">
                          {ev.currentValue}
                        </div>
                        {ev.variation !== undefined && ev.variation !== null && (
                          <div className={`text-[10px] font-bold mt-1 ${ev.variation > 0 ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}`}>
                            {ev.variation > 0 ? '+' : ''}{ev.variation.toFixed(1)}% vs anterior
                          </div>
                        )}
                        <div className="text-[9px] text-[var(--text-secondary)] mt-1">Fonte: {ev.source}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Explanation */}
              {selectedInsight.explanation && (
                <div className="space-y-1.5">
                  <h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-[var(--link)]" />
                    Raciocínio Analítico & Contribuição das Dimensões
                  </h3>
                  <div className="p-3 bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-xl font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                    {selectedInsight.explanation}
                  </div>
                </div>
              )}

              {/* Suggested Operational Actions */}
              {selectedInsight.suggestedActions && selectedInsight.suggestedActions.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Ações Recomendadas</h3>
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
                        className="px-3 py-1.5 rounded-xl bg-[var(--info-bg)] hover:bg-[var(--info-bg)] dark:bg-[var(--info-bg)] dark:hover:bg-[var(--action-hover)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)] font-bold text-xs flex items-center gap-1.5 transition"
                      >
                        {act.type === 'CREATE_PENDENCY' ? <PlusCircle className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                        {act.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit Timeline */}
              <div className="space-y-2 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                <h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  Linha do Tempo de Resolução
                </h3>
                {timelineLoading ? (
                  <div className="text-[var(--text-secondary)] text-xs">Carregando histórico...</div>
                ) : (
                  <div className="space-y-1.5">
                    {insightTimeline.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-[11px] p-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-lg">
                        <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{item.stage}</span>
                        <span className="text-[var(--text-secondary)]">{item.description}</span>
                        <span className="text-[var(--text-secondary)] font-mono text-[10px]">
                          {new Date(item.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCreatePendency(selectedInsight)}
                  className="px-3 py-1.5 bg-[var(--warning-bg)] hover:bg-[var(--warning-bg)] text-[var(--warning-text)] rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Gerar Pendência
                </button>
              </div>

              <div className="flex items-center gap-2">
                {selectedInsight.status === 'NEW' && (
                  <button
                    onClick={() => handleStatusChange(selectedInsight.id, 'acknowledge')}
                    className="px-3 py-1.5 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-xl text-xs font-bold transition"
                  >
                    Reconhecer
                  </button>
                )}
                {selectedInsight.status !== 'INVESTIGATING' && selectedInsight.status !== 'RESOLVED' && selectedInsight.status !== 'DISMISSED' && (
                  <button
                    onClick={() => handleStatusChange(selectedInsight.id, 'investigate')}
                    className="px-3 py-1.5 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-xl text-xs font-bold transition"
                  >
                    Investigar
                  </button>
                )}
                {selectedInsight.status !== 'RESOLVED' && (
                  <button
                    onClick={() => handleStatusChange(selectedInsight.id, 'resolve')}
                    className="px-3 py-1.5 bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] rounded-xl text-xs font-bold transition"
                  >
                    Marcar Resolvido
                  </button>
                )}
                {selectedInsight.status !== 'DISMISSED' && (
                  <button
                    onClick={() => handleStatusChange(selectedInsight.id, 'dismiss')}
                    className="px-3 py-1.5 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] rounded-xl text-xs font-bold transition"
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
