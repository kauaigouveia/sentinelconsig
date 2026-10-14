import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  AlertTriangle,
  Clock,
  Activity,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  Handshake,
  Zap,
  Building2,
  Bot,
  UserCheck,
  MessageSquare,
  ChevronRight,
  AlertCircle,
  Sparkles,
  BarChart3,
  Sliders,
  Eye,
  Check,
  X,
  Send,
  Layers,
  FileText,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { realtimeHub } from '../../services/realtimeService';

interface Incident {
  id: string;
  incidentNumber: string;
  title: string;
  description?: string;
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'MITIGATING' | 'MONITORING' | 'RESOLVED' | 'CLOSED';
  source: string;
  bankId?: string;
  bank?: { id: string; name: string; code: string };
  partnerId?: string;
  partner?: { id: string; name: string; code: string };
  productId?: string;
  product?: { id: string; name: string };
  convenioId?: string;
  convenio?: { id: string; name: string };
  integrationSlug?: string;
  impactProposalsCount: number;
  impactProposalsVolume: number;
  impactSimulationsCount: number;
  impactPartnersCount: number;
  impactSummary?: string;
  slaMinutesTarget: number;
  slaAcknowledgeTarget: number;
  slaDeadline?: string;
  createdAt: string;
  assignedTo?: { id: string; name: string; email: string };
  createdBy?: { id: string; name: string };
  slaMetrics?: {
    elapsedMinutes: number;
    consumedPercent: number;
    slaStatus: 'DENTRO_SLA' | 'PROXIMO_SLA' | 'SLA_ESTOURADO';
    isBreached: boolean;
    isNearBreach: boolean;
  };
  _count?: {
    incidentInsights: number;
    incidentPendencies: number;
    incidentProposals: number;
    incidentPartners: number;
    timelineEvents: number;
  };
}

interface OverviewData {
  kpis: {
    openIncidentsCount: number;
    criticalIncidentsCount: number;
    investigatingIncidentsCount: number;
    relatedPendenciesCount: number;
    activeInsightsCount: number;
    affectedIntegrationsCount: number;
    potentiallyImpactedProposalsCount: number;
    potentiallyImpactedProposalsVolume: number;
    slaAtRiskCount: number;
  };
  executiveSummary: {
    activeIncidentsText: string;
    criticalStatusText: string;
    integrationsStatusText: string;
    slaRiskText: string;
  };
  attentionItems: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    summary: string;
    entityLink?: string;
    createdAt: string;
  }>;
  recentTimelineEvents: any[];
}

export function CommandCenterView() {
  const [realtimeStatus, setRealtimeStatus] = useState(() => realtimeHub.getStatus());
  const [activeTab, setActiveTab] = useState<'VISAO_GERAL' | 'INCIDENTES' | 'TIMELINE_UNIFICADA' | 'SLA_MATRIZ'>('VISAO_GERAL');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Filters state
  const [searchFilter, setSearchFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('TODOS');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [typeFilter, setTypeFilter] = useState<string>('TODOS');
  const [sourceFilter, setSourceFilter] = useState<string>('TODOS');

  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSlaModalOpen, setIsSlaModalOpen] = useState(false);
  const [isPendencyModalOpen, setIsPendencyModalOpen] = useState(false);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSeverity, setNewSeverity] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [newType, setNewType] = useState('OPERATIONAL');
  const [newSource, setNewSource] = useState('MANUAL');
  const [newIntegrationSlug, setNewIntegrationSlug] = useState('');

  // Pendency Form
  const [pendencyTitle, setPendencyTitle] = useState('');
  const [pendencyDesc, setPendencyDesc] = useState('');
  const [pendencyPriority, setPendencyPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('HIGH');

  // Timeline Comment Form
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Status transition notes modal
  const [statusModalTarget, setStatusModalTarget] = useState<string | null>(null);
  const [statusNotes, setStatusNotes] = useState('');

  // Unified timeline items
  const [timelineItems, setTimelineItems] = useState<any[]>([]);

  // SLA Configs
  const [slaConfigs, setSlaConfigs] = useState<any[]>([]);

  // Search Results
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => realtimeHub.onStatusChange((status) => setRealtimeStatus(status)), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, incRes, timeRes, slaRes] = await Promise.all([
        fetch('/api/command-center/overview'),
        fetch(`/api/command-center/incidents?limit=50&severity=${severityFilter !== 'TODOS' ? severityFilter : ''}&status=${statusFilter !== 'TODOS' ? statusFilter : ''}&type=${typeFilter !== 'TODOS' ? typeFilter : ''}&source=${sourceFilter !== 'TODOS' ? sourceFilter : ''}&search=${searchFilter}`),
        fetch('/api/command-center/timeline?limit=50'),
        fetch('/api/command-center/sla-configs'),
      ]);

      if (ovRes.ok) setOverview(await ovRes.json());
      if (incRes.ok) {
        const data = await incRes.json();
        setIncidents(data.items || []);
      }
      if (timeRes.ok) setTimelineItems(await timeRes.json());
      if (slaRes.ok) setSlaConfigs(await slaRes.json());
    } catch (err) {
      console.error('[COMMAND CENTER FETCH ERROR]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [severityFilter, statusFilter, typeFilter, sourceFilter, searchFilter]);

  useEffect(() => {
    fetchData();

    // Subscribe to Realtime SSE events
    const unsub = realtimeHub.subscribe('*', (event: any) => {
      if (
        event?.type?.includes('COMMAND') ||
        event?.type?.includes('INCIDENT') ||
        event?.type?.includes('INTEGRATION')
      ) {
        fetchData();
      }
    });

    return () => unsub();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleOpenDetail = async (incidentId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/command-center/incidents/${incidentId}`);
      if (res.ok) {
        setSelectedIncident(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch('/api/command-center/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription,
          severity: newSeverity,
          type: newType,
          source: newSource,
          integrationSlug: newIntegrationSlug || undefined,
        }),
      });

      if (res.ok) {
        setIsNewModalOpen(false);
        setNewTitle('');
        setNewDescription('');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (targetStatus: string) => {
    if (!selectedIncident) return;

    try {
      const res = await fetch(`/api/command-center/incidents/${selectedIncident.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          notes: statusNotes,
        }),
      });

      if (res.ok) {
        setStatusModalTarget(null);
        setStatusNotes('');
        handleOpenDetail(selectedIncident.id);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !commentText.trim()) return;

    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/command-center/incidents/${selectedIncident.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Anotação Operacional',
          description: commentText.trim(),
        }),
      });

      if (res.ok) {
        setCommentText('');
        handleOpenDetail(selectedIncident.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCreatePendency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !pendencyTitle.trim()) return;

    try {
      const res = await fetch(`/api/command-center/incidents/${selectedIncident.id}/pendency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: pendencyTitle.trim(),
          description: pendencyDesc,
          priority: pendencyPriority,
        }),
      });

      if (res.ok) {
        setIsPendencyModalOpen(false);
        setPendencyTitle('');
        setPendencyDesc('');
        handleOpenDetail(selectedIncident.id);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSlaConfig = async (severity: string, ackMin: number, resMin: number) => {
    try {
      const res = await fetch('/api/command-center/sla-configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity,
          acknowledgeMinutes: ackMin,
          resolveMinutes: resMin,
        }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleGlobalSearch = async (query: string) => {
    setGlobalSearchQuery(query);
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/command-center/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        setSearchResults(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-600 text-white tracking-wide animate-pulse">CRÍTICO</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">ALTA</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">MÉDIA</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-500/20 text-slate-600 dark:text-slate-400 border border-slate-500/30">BAIXA</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">ABERTO</span>;
      case 'ACKNOWLEDGED':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">RECONHECIDO</span>;
      case 'INVESTIGATING':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">INVESTIGANDO</span>;
      case 'MITIGATING':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">MITIGANDO</span>;
      case 'MONITORING':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">MONITORANDO</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">RESOLVIDO</span>;
      case 'CLOSED':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">ENCERRADO</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 text-slate-700">{status}</span>;
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  return (
    <div className="flex flex-col h-full space-y-4 min-w-0 p2-command-workspace">
      {/* 1. Header Superior de Comando Operacional */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                SENTINEL CONSIG — COMMAND CENTER
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${realtimeStatus === 'CONNECTED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20'}`}>
                <span className={`h-2 w-2 rounded-full ${realtimeStatus === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                {realtimeStatus === 'CONNECTED' ? 'AO VIVO' : realtimeStatus === 'CONNECTING' ? 'CONECTANDO' : 'SEM TEMPO REAL'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inteligência que antecipa. Controle que transforma.
            </p>
          </div>
        </div>

        {/* Universal Search & Main Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Global Operational Search Input */}
          <div className="relative min-w-[240px] flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar incidente, CPF, proposta, parceiro..."
              value={globalSearchQuery}
              onChange={(e) => handleGlobalSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            {/* Search Dropdown Results */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (item.type === 'INCIDENT') handleOpenDetail(item.id);
                      setSearchResults([]);
                      setGlobalSearchQuery('');
                    }}
                    className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-100 dark:border-slate-800/50 last:border-none"
                  >
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{item.label}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.sublabel}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Incidente</span>
          </button>

          <button
            onClick={() => setIsSlaModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Sliders className="h-4 w-4" />
            <span>Matriz SLA</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Atualizar Dados"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Top Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg px-2 pt-1 shadow-xs p2-command-tabs">
        <button
          onClick={() => setActiveTab('VISAO_GERAL')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'VISAO_GERAL'
              ? 'border-rose-600 text-rose-600 dark:text-rose-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Visão Geral Operacional</span>
        </button>

        <button
          onClick={() => setActiveTab('INCIDENTES')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'INCIDENTES'
              ? 'border-rose-600 text-rose-600 dark:text-rose-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>Central de Incidentes ({incidents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('TIMELINE_UNIFICADA')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'TIMELINE_UNIFICADA'
              ? 'border-rose-600 text-rose-600 dark:text-rose-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Linha do Tempo Unificada</span>
        </button>
      </div>

      {/* TAB 1: VISÃO GERAL OPERACIONAL */}
      {activeTab === 'VISAO_GERAL' && (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* KPI 1 */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Incidentes Abertos</span>
                <Shield className="h-4 w-4 text-rose-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {overview?.kpis.openIncidentsCount || 0}
                </span>
                {overview?.kpis.criticalIncidentsCount ? (
                  <span className="text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-md">
                    {overview.kpis.criticalIncidentsCount} Crítico(s)
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                {overview?.kpis.investigatingIncidentsCount || 0} em investigação ativa
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Volume Potencialmente Afetado</span>
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2 text-xl font-black text-slate-900 dark:text-white">
                {formatCurrency(overview?.kpis.potentiallyImpactedProposalsVolume || 0)}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                {overview?.kpis.potentiallyImpactedProposalsCount || 0} propostas em janelas de indisponibilidade
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Pendências e Insights</span>
                <AlertTriangle className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {overview?.kpis.relatedPendenciesCount || 0}
                </span>
                <span className="text-xs text-slate-500">pendências geradas</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                {overview?.kpis.activeInsightsCount || 0} insights do Sentinel Intelligence ativas
              </div>
            </div>

            {/* KPI 4 */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Integrações & SLA</span>
                <Zap className="h-4 w-4 text-cyan-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {overview?.kpis.affectedIntegrationsCount || 0}
                </span>
                <span className="text-xs text-slate-500">APIs com impacto</span>
              </div>
              <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                {overview?.kpis.slaAtRiskCount || 0} incidente(s) com SLA em risco
              </div>
            </div>
          </div>

          {/* Resumo Executivo Operacional */}
          <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="h-4 w-4" />
              <span>Resumo Executivo da Mesa de Crédito</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/50">
                <span className="font-bold text-white block mb-1">Status de Incidentes:</span>
                {overview?.executiveSummary.activeIncidentsText} {overview?.executiveSummary.criticalStatusText}
              </div>
              <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/50">
                <span className="font-bold text-white block mb-1">Integrações & Volume:</span>
                {overview?.executiveSummary.integrationsStatusText} {overview?.executiveSummary.slaRiskText}
              </div>
            </div>
          </div>

          {/* Itens de Atenção Imediata */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500" />
              <span>Itens de Atenção Operacional Imediata</span>
            </h3>

            {overview?.attentionItems && overview.attentionItems.length > 0 ? (
              <div className="space-y-2">
                {overview.attentionItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex items-start gap-2.5">
                      {getSeverityBadge(item.severity)}
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</div>
                        <div className="text-[11px] text-slate-500">{item.summary}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab('INCIDENTES');
                      }}
                      className="px-2.5 py-1 text-xs font-bold bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 rounded-md shrink-0 cursor-pointer"
                    >
                      Ver na Central
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                Nenhum item de atenção crítica pendente. Todos os indicadores estão normais.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CENTRAL DE INCIDENTES (MAIN DATA TABLE & FILTERS) */}
      {activeTab === 'INCIDENTES' && (
        <div className="space-y-3">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold">Severidade:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs font-medium"
              >
                <option value="TODOS">Todas</option>
                <option value="CRITICAL">Crítica</option>
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Média</option>
                <option value="LOW">Baixa</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs font-medium"
              >
                <option value="TODOS">Todos</option>
                <option value="OPEN">Aberto</option>
                <option value="ACKNOWLEDGED">Reconhecido</option>
                <option value="INVESTIGATING">Investigando</option>
                <option value="MITIGATING">Mitigando</option>
                <option value="MONITORING">Monitorando</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="CLOSED">Encerrado</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold">Tipo:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs font-medium"
              >
                <option value="TODOS">Todos</option>
                <option value="INTEGRATION">Integração</option>
                <option value="PRODUCTION">Produção</option>
                <option value="CONVERSION">Conversão</option>
                <option value="SLA">SLA</option>
                <option value="PARTNER">Parceiro</option>
                <option value="INTELLIGENCE">Intelligence</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold">Fonte:</span>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs font-medium"
              >
                <option value="TODOS">Todas</option>
                <option value="INTELLIGENCE">Intelligence</option>
                <option value="INTEGRATION">Integração</option>
                <option value="BI">BI Operacional</option>
                <option value="PENDENCY">Pendência</option>
                <option value="MANUAL">Manual</option>
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Filtrar por código ou título..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none"
              />
            </div>
          </div>

          {/* Incident Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50">
                  <th className="p-3">Incidente / Título</th>
                  <th className="p-3">Severidade / Tipo</th>
                  <th className="p-3">Status Operacional</th>
                  <th className="p-3">Impacto Potencial</th>
                  <th className="p-3">SLA / Prazo</th>
                  <th className="p-3">Abertura</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {incidents.length > 0 ? (
                  incidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-bold text-rose-600 dark:text-rose-400">{inc.incidentNumber}</div>
                        <div className="font-bold text-slate-900 dark:text-white line-clamp-1">{inc.title}</div>
                        {inc.integrationSlug ? (
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">
                            API: {inc.integrationSlug}
                          </span>
                        ) : null}
                      </td>

                      <td className="p-3">
                        <div className="flex flex-col gap-1 items-start">
                          {getSeverityBadge(inc.severity)}
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">{inc.type}</span>
                        </div>
                      </td>

                      <td className="p-3">{getStatusBadge(inc.status)}</td>

                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {formatCurrency(inc.impactProposalsVolume)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {inc.impactProposalsCount} propostas afetadas
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>{inc.slaMinutesTarget} min meta</span>
                        </div>
                      </td>

                      <td className="p-3 text-slate-500 text-[11px]">
                        {new Date(inc.createdAt).toLocaleString('pt-BR')}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenDetail(inc.id)}
                          className="px-2.5 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Investigar 360°
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                      Nenhum incidente cadastrado ou compatível com os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LINHA DO TEMPO UNIFICADA */}
      {activeTab === 'TIMELINE_UNIFICADA' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4 text-rose-500" />
            <span>Linha do Tempo Cronológica Unificada da Mesa Operacional</span>
          </h3>

          <div className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 space-y-4">
            {timelineItems.map((item) => (
              <div key={item.id} className="relative group">
                <div className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-rose-500 border-2 border-white dark:border-slate-900" />
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800/80">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                      [{item.source}] {item.type}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.timestamp).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{item.title}</div>
                  {item.description && (
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{item.description}</div>
                  )}
                  {item.actorName && (
                    <div className="text-[10px] text-slate-400 mt-1">Ator: {item.actorName}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. MODAL DETALHE 360° DO INCIDENTE */}
      {selectedIncident && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Incident Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-rose-600 text-sm">{selectedIncident.incidentNumber}</span>
                  {getSeverityBadge(selectedIncident.severity)}
                  {getStatusBadge(selectedIncident.status)}
                </div>
                <h2 className="text-base font-black text-slate-900 dark:text-white mt-1">{selectedIncident.title}</h2>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* State Transition Actions */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500 uppercase mr-1">Transicionar Fase:</span>
              <button
                onClick={() => handleUpdateStatus('ACKNOWLEDGED')}
                className="px-2.5 py-1 text-xs font-bold bg-amber-500 text-white rounded-md hover:bg-amber-600 cursor-pointer"
              >
                Reconhecer
              </button>
              <button
                onClick={() => handleUpdateStatus('INVESTIGATING')}
                className="px-2.5 py-1 text-xs font-bold bg-purple-600 text-white rounded-md hover:bg-purple-700 cursor-pointer"
              >
                Investigar
              </button>
              <button
                onClick={() => handleUpdateStatus('MITIGATING')}
                className="px-2.5 py-1 text-xs font-bold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 cursor-pointer"
              >
                Mitigar
              </button>
              <button
                onClick={() => handleUpdateStatus('MONITORING')}
                className="px-2.5 py-1 text-xs font-bold bg-cyan-600 text-white rounded-md hover:bg-cyan-700 cursor-pointer"
              >
                Monitorar
              </button>
              <button
                onClick={() => handleUpdateStatus('RESOLVED')}
                className="px-2.5 py-1 text-xs font-bold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 cursor-pointer"
              >
                Resolver
              </button>
              <button
                onClick={() => handleUpdateStatus('CLOSED')}
                className="px-2.5 py-1 text-xs font-bold bg-slate-700 text-white rounded-md hover:bg-slate-800 cursor-pointer"
              >
                Encerrar
              </button>

              <button
                onClick={() => setIsPendencyModalOpen(true)}
                className="ml-auto px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-md cursor-pointer flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Gerar Pendência</span>
              </button>
            </div>

            {/* Impact Analysis Card */}
            <div className="bg-rose-500/5 dark:bg-rose-950/20 p-4 rounded-xl border border-rose-500/20 space-y-2">
              <h4 className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                Análise de Impacto Operacional Calculada
              </h4>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                {selectedIncident.impactSummary || 'Sem resumo detalhado de impacto.'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs font-semibold">
                <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Volume Potencial:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatCurrency(selectedIncident.impactProposalsVolume)}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Propostas Afetadas:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedIncident.impactProposalsCount}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Simulações Afetadas:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedIncident.impactSimulationsCount}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Parceiros Impactados:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedIncident.impactPartnersCount}</span>
                </div>
              </div>
            </div>

            {/* Linked Entities Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Insights Vinculados */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <span>Insights de Inteligência Vinculados</span>
                </h5>
                {selectedIncident.incidentInsights && selectedIncident.incidentInsights.length > 0 ? (
                  selectedIncident.incidentInsights.map((ii: any) => (
                    <div key={ii.id} className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                      <div className="font-bold text-slate-900 dark:text-white">{ii.insight?.title}</div>
                      <div className="text-[10px] text-slate-500">{ii.insight?.summary}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-400 italic">Nenhum insight vinculado.</div>
                )}
              </div>

              {/* Pendências Vinculadas */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>Pendências Geradas</span>
                </h5>
                {selectedIncident.incidentPendencies && selectedIncident.incidentPendencies.length > 0 ? (
                  selectedIncident.incidentPendencies.map((ip: any) => (
                    <div key={ip.id} className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{ip.pendency?.title}</div>
                        <div className="text-[10px] text-slate-500">Status: {ip.pendency?.status}</div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                        {ip.pendency?.priority}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-400 italic">Nenhuma pendência vinculada.</div>
                )}
              </div>
            </div>

            {/* Timeline & Comments Section */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wide">
                Trilha de Eventos e Anotações de Investigação
              </h4>

              {/* Add Comment Box */}
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Adicionar anotação operacional à linha do tempo..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submittingComment || !commentText.trim()}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs rounded-lg hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>

              {/* Event Stream */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {selectedIncident.timelineEvents && selectedIncident.timelineEvents.map((ev: any) => (
                  <div key={ev.id} className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg text-xs space-y-0.5 border border-slate-200/60 dark:border-slate-800/60">
                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                      <span className="font-bold text-rose-600">{ev.type}</span>
                      <span>{new Date(ev.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white">{ev.title}</div>
                    {ev.description && <div className="text-slate-600 dark:text-slate-300">{ev.description}</div>}
                    <div className="text-[10px] text-slate-400">Por: {ev.userName || 'Sistema'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL NOVO INCIDENTE MANUAL */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wide">
                Registrar Novo Incidente Operacional
              </h3>
              <button onClick={() => setIsNewModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Título do Incidente *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: C6 — Indisponibilidade de API de simulação"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Descrição Detalhada</label>
                <textarea
                  rows={3}
                  placeholder="Descreva a ocorrência, impacto e contexto inicial..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Severidade</label>
                  <select
                    value={newSeverity}
                    onChange={(e: any) => setNewSeverity(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="CRITICAL">Crítica</option>
                    <option value="HIGH">Alta</option>
                    <option value="MEDIUM">Média</option>
                    <option value="LOW">Baixa</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Tipo</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="INTEGRATION">Integração</option>
                    <option value="PRODUCTION">Produção</option>
                    <option value="CONVERSION">Conversão</option>
                    <option value="SLA">SLA</option>
                    <option value="PARTNER">Parceiro</option>
                    <option value="OPERATIONAL">Operacional</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Slug da Integração (Opcional)</label>
                <input
                  type="text"
                  placeholder="c6, facta, bmg, happy"
                  value={newIntegrationSlug}
                  onChange={(e) => setNewIntegrationSlug(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer"
                >
                  Criar Incidente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL GERAR PENDÊNCIA DO INCIDENTE */}
      {isPendencyModalOpen && selectedIncident && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wide">
                Gerar Pendência para Incidente
              </h3>
              <button onClick={() => setIsPendencyModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePendency} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Título da Pendência *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Verificar contratos com a mesa C6 Bank"
                  value={pendencyTitle}
                  onChange={(e) => setPendencyTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Descrição</label>
                <textarea
                  rows={2}
                  placeholder="Ação específica requerida..."
                  value={pendencyDesc}
                  onChange={(e) => setPendencyDesc(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Prioridade</label>
                <select
                  value={pendencyPriority}
                  onChange={(e: any) => setPendencyPriority(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="URGENT">Urgente</option>
                  <option value="HIGH">Alta</option>
                  <option value="MEDIUM">Média</option>
                  <option value="LOW">Baixa</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPendencyModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer"
                >
                  Criar Pendência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL MATRIZ DE SLA */}
      {isSlaModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wide">
                Matriz de Prazos e SLA por Severidade
              </h3>
              <button onClick={() => setIsSlaModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {slaConfigs.map((cfg) => (
                <div key={cfg.severity} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    {getSeverityBadge(cfg.severity)}
                    <span className="text-[10px] text-slate-500">{cfg.isCustom ? 'Personalizado' : 'Padrão'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block">Ack (minutos)</label>
                      <input
                        type="number"
                        value={cfg.acknowledgeMinutes}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setSlaConfigs((prev) =>
                            prev.map((c) => (c.severity === cfg.severity ? { ...c, acknowledgeMinutes: val } : c))
                          );
                        }}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-bold text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Resolução (minutos)</label>
                      <input
                        type="number"
                        value={cfg.resolveMinutes}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setSlaConfigs((prev) =>
                            prev.map((c) => (c.severity === cfg.severity ? { ...c, resolveMinutes: val } : c))
                          );
                        }}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-bold text-center"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleSaveSlaConfig(cfg.severity, cfg.acknowledgeMinutes, cfg.resolveMinutes)}
                    className="w-full py-1 text-[11px] font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md cursor-pointer"
                  >
                    Salvar Alterações
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
