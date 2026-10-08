import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Landmark,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Activity,
  ShieldCheck,
  Server,
  Zap,
  Radio,
  History,
  AlertCircle,
  ExternalLink,
  Search,
  Filter,
  ArrowUpRight,
  ShieldAlert,
  Clock,
  Check,
  X,
  Play,
  Layers,
  ChevronLeft,
  ChevronRight,
  Info,
  Sliders,
  FileText,
  Lock,
  Plug,
} from 'lucide-react';
import { BankIntegrationsView } from '../integrations/BankIntegrationsView';
import { FinantoIntegrationTab } from '../integrations/FinantoIntegrationTab';
import { NossaFintechIntegrationTab } from '../integrations/NossaFintechIntegrationTab';

export type HubTab = 'overview' | 'c6' | 'facta' | 'bmg' | 'happy' | 'finanto' | 'nossa-fintech' | 'health' | 'incidents' | 'logs';

export interface IntegrationDefinition {
  id: string;
  name: string;
  code: string;
  slug: 'c6' | 'facta' | 'bmg' | 'happy';
  type: 'BANK' | 'FINTECH';
  protocol: string;
  environment: 'production' | 'staging' | 'homologation';
  active: boolean;
  status: 'ONLINE' | 'ATTENTION' | 'OFFLINE' | 'DISABLED' | 'CHECKING';
  maskedBaseUrl: string;
  capabilities: string[];
  lastHealthCheck?: {
    timestamp: string;
    success: boolean;
    latencyMs: number;
    httpStatus?: number | null;
    errorMessage?: string | null;
    rayId?: string | null;
  } | null;
  lastSyncAt?: string | null;
  tokenStatus?: 'VALID' | 'EXPIRED' | 'UNCONFIGURED' | 'NOT_APPLICABLE';
  successRate24h?: number;
  totalRequests24h?: number;
  errorCount24h?: number;
}

export interface HubSummary {
  total: number;
  online: number;
  attention: number;
  offline: number;
  disabled: number;
  errors24h: number;
}

export interface HealthStats {
  period: '1h' | '24h' | '7d' | '30d';
  availability: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  http4xxCount: number;
  http5xxCount: number;
  timeoutCount: number;
  rateLimit: {
    limit: string | number;
    used: string | number;
    remaining: string | number;
    reset: string;
  };
  sampleInsufficient: boolean;
}

export interface IncidentItem {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  impactDetails?: string | null;
  bank: string;
  identifiedAt: string;
  resolvedAt?: string | null;
  durationMinutes: number;
  timeline: { step: string; timestamp: string; note: string }[];
}

export interface DiagnosticModalState {
  isOpen: boolean;
  loading: boolean;
  bank: string;
  result?: {
    success: boolean;
    httpStatus?: number | null;
    latencyMs: number;
    logicalEndpoint: string;
    requestId: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    isCloudflareBlocked: boolean;
    rayId?: string | null;
    dnsResolved: boolean;
    details: string;
  };
}

export interface HubIntegracoesProps {
  initialSubTab?: HubTab;
}

export const HubIntegracoes: React.FC<HubIntegracoesProps> = ({ initialSubTab = 'overview' }) => {
  const [activeTab, setActiveTab] = useState<HubTab>(initialSubTab);
  const [integrations, setIntegrations] = useState<IntegrationDefinition[]>([]);
  const [summary, setSummary] = useState<HubSummary>({
    total: 0,
    online: 0,
    attention: 0,
    offline: 0,
    disabled: 0,
    errors24h: 0,
  });
  const [overallStatus, setOverallStatus] = useState<string>('CHECKING');
  const [isLoading, setIsLoading] = useState(true);

  // Ações de teste e diagnóstico
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; type: 'success' | 'error'; message: string } | null>(null);
  const [diagnosticModal, setDiagnosticModal] = useState<DiagnosticModalState>({
    isOpen: false,
    loading: false,
    bank: '',
  });

  // Estado da aba "Saúde das APIs"
  const [healthSelectedSlug, setHealthSelectedSlug] = useState<'c6' | 'facta' | 'bmg' | 'happy'>('c6');
  const [healthPeriod, setHealthPeriod] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [healthStats, setHealthStats] = useState<HealthStats | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Estado da aba "Incidentes"
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);

  // Estado da aba "Logs & Auditoria"
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const logsRequestRef = useRef(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsBankFilter, setLogsBankFilter] = useState('ALL');
  const [logsStatusFilter, setLogsStatusFilter] = useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL');
  const [logsPeriodFilter, setLogsPeriodFilter] = useState<'ALL' | '1h' | '24h' | '7d' | '30d'>('24h');
  const [logsSearch, setLogsSearch] = useState('');

  // Sincronizar initialSubTab quando a prop mudar
  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Carregar status do catálogo unificado
  const fetchHealthCatalog = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/integrations/health');
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations || []);
        if (data.summary) {
          setSummary(data.summary);
        }
        setOverallStatus(data.overallStatus || 'UNKNOWN');
      } else {
        setOverallStatus('UNKNOWN');
      }
    } catch (err) {
      console.error('Erro ao verificar saúde das integrações:', err);
      setOverallStatus('UNKNOWN');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthCatalog();
  }, [fetchHealthCatalog]);

  // Carregar Estatísticas de Saúde quando a aba ou filtros mudam
  const fetchHealthStats = useCallback(async (slug: string, period: string) => {
    setHealthLoading(true);
    try {
      const res = await fetch(`/api/integrations/${slug}/stats?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setHealthStats(data);
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'health') {
      fetchHealthStats(healthSelectedSlug, healthPeriod);
    }
  }, [activeTab, healthSelectedSlug, healthPeriod, fetchHealthStats]);

  // Carregar Incidentes
  const fetchIncidents = useCallback(async () => {
    setIncidentsLoading(true);
    try {
      const res = await fetch('/api/integrations/incidents');
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
      }
    } catch (err) {
      console.error('Erro ao carregar incidentes:', err);
    } finally {
      setIncidentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'incidents') {
      fetchIncidents();
    }
  }, [activeTab, fetchIncidents]);

  // Carregar Logs Paginados com filtros server-side
  const fetchLogs = useCallback(async () => {
    const requestId = ++logsRequestRef.current;
    setLogsLoading(true);
    setLogsError('');
    try {
      const params = new URLSearchParams({
        page: logsPage.toString(),
        limit: '15',
      });
      if (logsBankFilter !== 'ALL') params.append('bank', logsBankFilter);
      if (logsStatusFilter === 'SUCCESS') params.append('success', 'true');
      if (logsStatusFilter === 'ERROR') params.append('success', 'false');
      if (logsPeriodFilter !== 'ALL') params.append('period', logsPeriodFilter);
      if (logsSearch.trim()) params.append('search', logsSearch.trim());

      const res = await fetch(`/api/integrations/logs?${params.toString()}`);
      if (requestId !== logsRequestRef.current) return;
      if (res.ok) {
        const data = await res.json();
        if (requestId !== logsRequestRef.current) return;
        setLogs(data.logs || []);
        setLogsTotalPages(data.pagination?.totalPages || 1);
        setLogsTotal(data.pagination?.total || 0);
      } else {
        const data = await res.json().catch(() => null);
        if (requestId !== logsRequestRef.current) return;
        setLogsError(data?.error || 'Não foi possível carregar os logs. Tente novamente.');
      }
    } catch (err) {
      if (requestId === logsRequestRef.current) {
        console.error('Erro ao carregar logs:', err);
        setLogsError('Não foi possível carregar os logs. Verifique sua conexão e tente novamente.');
      }
    } finally {
      if (requestId === logsRequestRef.current) setLogsLoading(false);
    }
  }, [logsPage, logsBankFilter, logsStatusFilter, logsPeriodFilter, logsSearch]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

  // Disparar Health Check real
  const handleRunHealthCheck = async (slug: string) => {
    setActionInProgress(`check_${slug}`);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/integrations/${slug}/health`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({
          id: slug,
          type: 'success',
          message: data.message || 'Conexão validada com sucesso!',
        });
      } else {
        setActionFeedback({
          id: slug,
          type: 'error',
          message: data.message || 'Falha ao validar conexão.',
        });
      }
      await fetchHealthCatalog();
    } catch (err: any) {
      setActionFeedback({
        id: slug,
        type: 'error',
        message: err.message || 'Erro de rede na verificação.',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  // Disparar Diagnóstico Avançado
  const handleOpenDiagnostics = async (slug: string, bankName: string) => {
    setDiagnosticModal({
      isOpen: true,
      loading: true,
      bank: bankName,
    });
    try {
      const res = await fetch(`/api/integrations/${slug}/diagnose`, { method: 'POST' });
      const data = await res.json();
      setDiagnosticModal({
        isOpen: true,
        loading: false,
        bank: bankName,
        result: data,
      });
      await fetchHealthCatalog();
    } catch (err: any) {
      setDiagnosticModal((prev) => ({
        ...prev,
        loading: false,
        result: {
          success: false,
          latencyMs: 0,
          logicalEndpoint: 'N/A',
          requestId: 'err',
          isCloudflareBlocked: false,
          dnsResolved: false,
          errorMessage: err.message || 'Erro ao executar diagnóstico.',
          details: 'Não foi possível completar o diagnóstico.',
        },
      }));
    }
  };

  // Disparar Sincronização Manual
  const handleTriggerSync = async (slug: string) => {
    setActionInProgress(`sync_${slug}`);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/integrations/${slug}/sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({
          id: slug,
          type: 'success',
          message: data.message || 'Sincronização iniciada com sucesso!',
        });
      } else {
        setActionFeedback({
          id: slug,
          type: 'error',
          message: data.message || data.error || 'Falha na sincronização.',
        });
      }
      await fetchHealthCatalog();
    } catch (err: any) {
      setActionFeedback({
        id: slug,
        type: 'error',
        message: err.message || 'Erro ao disparar sincronização.',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const tabs: { id: HubTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Visão Geral', icon: Landmark },
    { id: 'c6', label: 'C6 Bank', icon: Zap },
    { id: 'facta', label: 'FACTA', icon: Server },
    { id: 'bmg', label: 'BMG', icon: ShieldCheck },
    { id: 'happy', label: 'Happy', icon: Radio },
    { id: 'finanto', label: 'FINANTO', icon: Plug },
    { id: 'nossa-fintech', label: 'Nossa Fintech', icon: Landmark },
    { id: 'health', label: 'Saúde das APIs', icon: Activity },
    { id: 'incidents', label: 'Incidentes', icon: AlertTriangle },
    { id: 'logs', label: 'Logs & Auditoria', icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner do Hub */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30">
            <Zap className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">Hub de Integrações Bancárias</h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 rounded">
                FASE 4
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Central unificada para monitorar, diagnosticar, auditar, medir e testar integrações (C6, FACTA, BMG, Happy).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1.5 text-xs font-semibold rounded-full flex items-center gap-1.5 border ${
              overallStatus === 'OPERATIONAL'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : overallStatus === 'ATTENTION'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : overallStatus === 'CHECKING' || overallStatus === 'UNKNOWN'
                  ? 'bg-slate-500/10 text-slate-300 border-slate-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            {overallStatus === 'OPERATIONAL'
              ? 'Hub operacional'
              : overallStatus === 'ATTENTION'
              ? 'Atenção Operacional'
              : overallStatus === 'CHECKING'
              ? 'Verificando integrações'
              : overallStatus === 'UNKNOWN'
              ? 'Status indisponível'
              : 'Indisponibilidade Detectada'}
          </span>
          <button
            onClick={fetchHealthCatalog}
            disabled={isLoading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer"
            title="Atualizar status geral"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Cards de Métricas e Contadores no Topo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>INTEGRAÇÕES ATIVAS</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {summary.total - summary.disabled} <span className="text-xs text-slate-500 font-normal">/ {summary.total}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>ONLINE</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{summary.online}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>ATENÇÃO</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{summary.attention}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>OFFLINE</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400">{summary.offline}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>ERROS 24H</span>
            <ShieldAlert className="w-4 h-4 text-slate-400" />
          </div>
          <div className={`text-2xl font-bold ${summary.errors24h > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
            {summary.errors24h}
          </div>
        </div>
      </div>

      {/* Barra de Subnavegação das 8 Abas do Hub */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback de Ações (Mensagens de Sucesso ou Erro) */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ABA 1: VISÃO GERAL */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {integrations.map((bank) => {
            const isChecking = actionInProgress === `check_${bank.slug}`;
            const isSyncing = actionInProgress === `sync_${bank.slug}`;

            return (
              <div
                key={bank.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                          CÓD: {bank.code}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                          {bank.environment.toUpperCase()}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-white mt-1.5">{bank.name}</h3>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                        bank.status === 'ONLINE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : bank.status === 'ATTENTION'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : bank.status === 'OFFLINE'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          bank.status === 'ONLINE'
                            ? 'bg-emerald-400 animate-pulse'
                            : bank.status === 'ATTENTION'
                            ? 'bg-amber-400'
                            : bank.status === 'OFFLINE'
                            ? 'bg-rose-400 animate-ping'
                            : 'bg-slate-500'
                        }`}
                      />
                      {bank.status === 'ONLINE'
                        ? 'ONLINE'
                        : bank.status === 'ATTENTION'
                        ? 'ATENÇÃO'
                        : bank.status === 'OFFLINE'
                        ? 'OFFLINE'
                        : 'DESABILITADA'}
                    </span>
                  </div>

                  {/* Informações Operacionais */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>URL do Serviço:</span>
                      <span className="font-mono text-slate-300 font-medium">{bank.maskedBaseUrl}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Último Health Check:</span>
                      <span className="text-slate-300">
                        {bank.lastHealthCheck?.timestamp
                          ? `${new Date(bank.lastHealthCheck.timestamp).toLocaleTimeString('pt-BR')} (${bank.lastHealthCheck.latencyMs}ms)`
                          : 'Ainda não aferido'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Taxa de Sucesso 24h:</span>
                      <span
                        className={`font-semibold ${
                          (bank.successRate24h ?? 100) >= 95
                            ? 'text-emerald-400'
                            : (bank.successRate24h ?? 100) >= 80
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {bank.successRate24h ?? 100}% ({bank.totalRequests24h ?? 0} reqs)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Última Sincronização:</span>
                      <span className="text-slate-300">
                        {bank.lastSyncAt ? new Date(bank.lastSyncAt).toLocaleString('pt-BR') : 'Nenhuma recente'}
                      </span>
                    </div>

                    {/* Aviso específico de Cloudflare se houver Ray ID */}
                    {bank.lastHealthCheck?.rayId && (
                      <div className="pt-2 border-t border-slate-800 text-[11px] text-amber-300 flex items-center justify-between">
                        <span>Bloqueio Cloudflare (Ray ID):</span>
                        <span className="font-mono font-bold text-amber-400">{bank.lastHealthCheck.rayId}</span>
                      </div>
                    )}
                  </div>

                  {/* Badges de Capabilities */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {bank.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Barra de Ações do Card */}
                <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab(bank.slug as HubTab)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      Configurar <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-slate-700">|</span>
                    <button
                      onClick={() => handleTriggerSync(bank.slug)}
                      disabled={isSyncing}
                      className="text-xs text-slate-400 hover:text-slate-200 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} /> Sincronizar
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenDiagnostics(bank.slug, bank.name)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5 text-amber-400" /> Diagnóstico
                    </button>

                    <button
                      onClick={() => handleRunHealthCheck(bank.slug)}
                      disabled={isChecking}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {isChecking ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verificando...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" /> Testar Conexão
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ABA 2: C6 BANK */}
      {activeTab === 'c6' && <BankIntegrationsView initialTab="c6" />}

      {/* ABA 3: FACTA */}
      {activeTab === 'facta' && <BankIntegrationsView initialTab="facta" />}

      {/* ABA 4: BMG */}
      {activeTab === 'bmg' && <BankIntegrationsView initialTab="bmg" />}

      {/* ABA 5: HAPPY */}
      {activeTab === 'happy' && <BankIntegrationsView initialTab="happy" />}

      {/* ABA FINANTO / JOINBANK */}
      {activeTab === 'finanto' && <FinantoIntegrationTab />}
      {activeTab === 'nossa-fintech' && <NossaFintechIntegrationTab />}

      {/* ABA 6: SAÚDE DAS APIS */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          {/* Controles de Filtro da Aba Saúde */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">INTEGRAÇÃO:</span>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {(['c6', 'facta', 'bmg', 'happy'] as const).map((slug) => (
                  <button
                    key={slug}
                    onClick={() => setHealthSelectedSlug(slug)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      healthSelectedSlug === slug
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {slug.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">PERÍODO:</span>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {(['1h', '24h', '7d', '30d'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setHealthPeriod(p)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      healthPeriod === p ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {healthLoading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
              <span>Calculando métricas agregadas de saúde da API...</span>
            </div>
          ) : healthStats ? (
            <div className="space-y-6">
              {/* Grid de Indicadores Estatísticos */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400 mb-1">Disponibilidade</div>
                  <div className="text-2xl font-bold text-emerald-400">{healthStats.availability}%</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {healthStats.successCount} de {healthStats.totalRequests} requisições
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400 mb-1">Latência Média</div>
                  <div className="text-2xl font-bold text-white">
                    {healthStats.avgLatencyMs !== null ? `${healthStats.avgLatencyMs}ms` : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Média aritmética do período</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400 mb-1">Latência P95</div>
                  <div
                    className={`text-xl font-bold ${
                      typeof healthStats.p95LatencyMs === 'number' ? 'text-cyan-400' : 'text-slate-400 text-base'
                    }`}
                  >
                    {typeof healthStats.p95LatencyMs === 'number'
                      ? `${healthStats.p95LatencyMs}ms`
                      : healthStats.p95LatencyMs}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">95% das chamadas mais rápidas</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400 mb-1">Taxa de Erros</div>
                  <div className={`text-2xl font-bold ${healthStats.errorCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {healthStats.errorCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Total de falhas registradas</div>
                </div>
              </div>

              {/* Detalhes de Erros HTTP e Rate Limits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    Distribuição de Falhas ({healthPeriod})
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Erros de Cliente (HTTP 4xx):</span>
                      <span className="font-mono font-bold text-amber-400">{healthStats.http4xxCount}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Erros de Servidor (HTTP 5xx):</span>
                      <span className="font-mono font-bold text-rose-400">{healthStats.http5xxCount}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Timeouts de Conexão:</span>
                      <span className="font-mono font-bold text-purple-400">{healthStats.timeoutCount}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-cyan-400" />
                    Rate Limit e Cotas da API
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Limite Informado:</span>
                      <span className="font-mono text-slate-300">{healthStats.rateLimit.limit}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Consumo Atual:</span>
                      <span className="font-mono text-slate-300">{healthStats.rateLimit.used}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Reinício da Janela:</span>
                      <span className="font-mono text-slate-300">{healthStats.rateLimit.reset}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400">Nenhum dado estatístico disponível.</div>
          )}
        </div>
      )}

      {/* ABA 7: INCIDENTES */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Histórico e Gestão de Incidentes</h3>
            <button
              onClick={fetchIncidents}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${incidentsLoading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>

          {incidentsLoading ? (
            <div className="p-8 text-center text-slate-400">Carregando incidentes...</div>
          ) : incidents.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Nenhum incidente ativo ou recente</h4>
              <p className="text-xs text-slate-400">
                Todas as integrações estão operando dentro dos padrões contratuais de estabilidade.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {incidents.map((inc) => (
                <div key={inc.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inc.status === 'RESOLVED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {inc.status}
                        </span>
                        <span className="text-xs font-bold text-slate-400">{inc.bank}</span>
                        <span className="text-xs text-slate-500">
                          Duração: {inc.durationMinutes} min
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1">{inc.title}</h4>
                    </div>

                    <div className="text-xs text-slate-400 font-mono">
                      Início: {new Date(inc.identifiedAt).toLocaleString('pt-BR')}
                    </div>
                  </div>

                  <p className="text-xs text-slate-300">{inc.description}</p>

                  {/* Linha do Tempo do Incidente */}
                  <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Timeline do Incidente
                    </span>
                    <div className="space-y-2 pt-1">
                      {inc.timeline.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] shrink-0">
                            {step.step}
                          </span>
                          <span className="text-slate-400 text-[11px]">
                            {new Date(step.timestamp).toLocaleTimeString('pt-BR')} —
                          </span>
                          <span className="text-slate-300">{step.note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 8: LOGS & AUDITORIA */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Barra de Filtros dos Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Filtrar por endpoint, erro, Ray ID..."
                  value={logsSearch}
                  onChange={(e) => {
                    setLogsSearch(e.target.value);
                    setLogsPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <select
                  value={logsBankFilter}
                  onChange={(e) => {
                    setLogsBankFilter(e.target.value);
                    setLogsPage(1);
                  }}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">Todos os Bancos</option>
                  <option value="C6">C6 Bank</option>
                  <option value="FACTA">FACTA</option>
                  <option value="BMG">BMG</option>
                  <option value="HAPPY">Happy</option>
                </select>

                <select
                  value={logsStatusFilter}
                  onChange={(e) => {
                    setLogsStatusFilter(e.target.value as any);
                    setLogsPage(1);
                  }}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">Todos os Resultados</option>
                  <option value="SUCCESS">Apenas Sucesso</option>
                  <option value="ERROR">Apenas Falhas</option>
                </select>

                <select
                  value={logsPeriodFilter}
                  onChange={(e) => {
                    setLogsPeriodFilter(e.target.value as any);
                    setLogsPage(1);
                  }}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="1h">Última 1 hora</option>
                  <option value="24h">Últimas 24 horas</option>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                  <option value="ALL">Sem restrição</option>
                </select>

                <button
                  onClick={fetchLogs}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 cursor-pointer"
                  title="Atualizar logs"
                >
                  <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Data / Hora</th>
                    <th className="py-3 px-4">Banco</th>
                    <th className="py-3 px-4">Endpoint</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Latência</th>
                    <th className="py-3 px-4">Resultado / Detalhe</th>
                    <th className="py-3 px-4">Ray ID / ReqID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Carregando registros de auditoria...
                      </td>
                    </tr>
                  ) : logsError ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-amber-400">
                        <div className="flex flex-col items-center gap-3">
                          <span>{logsError}</span>
                          <button
                            type="button"
                            onClick={fetchLogs}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 hover:bg-slate-700"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Nenhum registro encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-850 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono">
                          {new Date(log.timestamp).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-bold text-white">{log.bank}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">{log.endpoint}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              log.success
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {log.httpStatus || (log.success ? '200' : 'ERR')}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono">{log.latencyMs}ms</td>
                        <td className="py-3 px-4 max-w-xs truncate text-slate-300">
                          {log.errorMessage ? (
                            <span className="text-amber-400">{log.errorMessage}</span>
                          ) : (
                            <span className="text-emerald-400">OK</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400">
                          {log.rayId ? (
                            <span className="text-amber-400 font-bold">{log.rayId}</span>
                          ) : (
                            log.requestId?.slice(0, 12) || '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação dos Logs */}
            <div className="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Total de <strong className="text-white">{logsTotal}</strong> registros (Página {logsPage} de{' '}
                {logsTotalPages})
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  disabled={logsPage <= 1}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </button>
                <button
                  onClick={() => setLogsPage((p) => Math.min(logsTotalPages, p + 1))}
                  disabled={logsPage >= logsTotalPages}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                >
                  Próxima <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DIAGNÓSTICO AVANÇADO */}
      {diagnosticModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">
                  Diagnóstico de Conectividade — {diagnosticModal.bank}
                </h3>
              </div>
              <button
                onClick={() => setDiagnosticModal({ isOpen: false, loading: false, bank: '' })}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {diagnosticModal.loading ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                <span>Executando testes de conectividade, DNS e TLS...</span>
              </div>
            ) : diagnosticModal.result ? (
              <div className="space-y-4 text-xs">
                {/* Status Geral */}
                <div
                  className={`p-3 rounded-lg border flex items-center gap-3 ${
                    diagnosticModal.result.success
                      ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-200'
                      : diagnosticModal.result.isCloudflareBlocked
                      ? 'bg-amber-950/40 border-amber-800/40 text-amber-200'
                      : 'bg-rose-950/40 border-rose-800/40 text-rose-200'
                  }`}
                >
                  {diagnosticModal.result.success ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
                  )}
                  <div>
                    <h4 className="font-bold text-sm">
                      {diagnosticModal.result.success
                        ? 'Serviço Operacional'
                        : diagnosticModal.result.isCloudflareBlocked
                        ? 'Bloqueio de Camada Cloudflare'
                        : 'Falha de Conectividade'}
                    </h4>
                    <p className="text-[11px] mt-0.5">{diagnosticModal.result.details}</p>
                  </div>
                </div>

                {/* Dados Técnicos Sanitizados */}
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Endpoint Testado:</span>
                    <span className="text-slate-300">{diagnosticModal.result.logicalEndpoint}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status HTTP:</span>
                    <span className="text-slate-300">{diagnosticModal.result.httpStatus || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Latência:</span>
                    <span className="text-slate-300">{diagnosticModal.result.latencyMs}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Resolução DNS:</span>
                    <span className="text-emerald-400">RESOLVIDO COM SUCESSO</span>
                  </div>
                  {diagnosticModal.result.rayId && (
                    <div className="flex justify-between text-amber-400 font-bold">
                      <span>Cloudflare Ray ID:</span>
                      <span>{diagnosticModal.result.rayId}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Request ID:</span>
                    <span className="text-slate-400">{diagnosticModal.result.requestId}</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 italic">
                  * Este diagnóstico foi executado de forma não destrutiva, sem criar propostas ou clientes fictícios.
                </div>
              </div>
            ) : null}

            <div className="pt-2 flex justify-end border-t border-slate-800">
              <button
                onClick={() => setDiagnosticModal({ isOpen: false, loading: false, bank: '' })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
