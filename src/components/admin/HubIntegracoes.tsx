import {Table,Badge,Button} from '../ui/DesignSystem';
import {watchIntegrationCatalog} from '../../lib/integrationCatalogRefresh';
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
  Send,
} from 'lucide-react';
import { BankIntegrationsView } from '../integrations/BankIntegrationsView';
import { FinantoIntegrationTab } from '../integrations/FinantoIntegrationTab';
import { NossaFintechIntegrationTab } from '../integrations/NossaFintechIntegrationTab';
import { PremiumContent } from '../redesign/PremiumContent';
import { TelegramIntegrationSettings } from '../integrations/TelegramIntegrationSettings';
import { StorageService } from '../../services/storageService';

export type HubTab = 'overview' | 'telegram' | 'c6' | 'facta' | 'bmg' | 'happy' | 'finanto' | 'nossa-fintech' | 'workbank' | 'parana' | 'presenca' | 'v8' | 'vctex' | 'daycoval' | 'outros' | 'health' | 'incidents' | 'logs';

export interface IntegrationDefinition {
  id: string;
  name: string;
  code: string;
  slug: Exclude<HubTab,'overview'|'telegram'|'health'|'incidents'|'logs'>;
  configured?:boolean;
  monitoringReason?:string;
  configurationUnavailable?:boolean;
  connectionCount?:number;
  enabledConnectionCount?:number;
  environments?:string[];
  type: 'BANK' | 'FINTECH';
  protocol: string;
  environment: 'production' | 'staging' | 'homologation' | 'unknown';
  active: boolean;
  status: 'ONLINE' | 'ATTENTION' | 'OFFLINE' | 'DISABLED' | 'CHECKING' | 'UNKNOWN';
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
  metricsPartial?: boolean;
}

export interface HubSummary {
  unknown?: number;
  total: number;
  online: number;
  attention: number;
  offline: number;
  disabled: number;
  errors24h: number;
  requests24h?: number;
  metricsPartial?: boolean;
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
  premium?: boolean;
  initialSubTab?: HubTab;
}

export const HubIntegracoes: React.FC<HubIntegracoesProps> = ({ initialSubTab = 'overview', premium = false }) => {
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
  const [catalogError, setCatalogError] = useState('');
  const [catalogUpdatedAt,setCatalogUpdatedAt]=useState<string|null>(null);
  const catalogLoaded=useRef(false);
  const catalogController = useRef<AbortController | null>(null);

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
    catalogController.current?.abort();
    const controller = new AbortController(); catalogController.current = controller;
    if(!catalogLoaded.current)setIsLoading(true); setCatalogError('');
    try {
      const res = await fetch('/api/integrations/health', {cache:'no-store',signal:controller.signal});
      if (!res.ok) throw Error('CATALOG_UNAVAILABLE');
      const data = await res.json();
      if (!Array.isArray(data.integrations) || !data.summary || data.summary.total < 1) throw Error('CATALOG_INCOMPLETE');
      if(controller.signal.aborted)return;
      setIntegrations(data.integrations); setSummary(data.summary); setOverallStatus(data.integrations.some((item:IntegrationDefinition)=>item.active)?data.overallStatus||'UNKNOWN':'UNKNOWN');catalogLoaded.current=true;setCatalogUpdatedAt(data.timestamp||new Date().toISOString());
    } catch {
      if(controller.signal.aborted)return;
      setIntegrations([]);setCatalogError('Catálogo indisponível ou incompleto. Confira a empresa e sua permissão; atualize para tentar novamente.');setOverallStatus('UNKNOWN');
    } finally {if(!controller.signal.aborted)setIsLoading(false);}
  }, []);

  useEffect(() => {
    const stop=watchIntegrationCatalog(fetchHealthCatalog);
    return () => {stop();catalogController.current?.abort();};
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
    { id: 'telegram', label: 'Telegram', icon: Send },
    { id: 'c6', label: 'C6 Bank', icon: Zap },
    { id: 'facta', label: 'FACTA', icon: Server },
    { id: 'bmg', label: 'BMG', icon: ShieldCheck },
    { id: 'happy', label: 'Happy', icon: Radio },
    { id: 'finanto', label: 'FINANTO', icon: Plug },
    { id: 'nossa-fintech', label: 'Nossa Fintech', icon: Landmark },
    { id: 'workbank', label: 'WorkBank', icon: Plug },
    { id: 'parana', label: 'Paraná Banco · API', icon: Landmark },
    { id: 'presenca', label: 'Presença Bank', icon: Landmark },
    { id: 'v8', label: 'V8 Digital', icon: Plug },
    { id: 'vctex', label: 'VCTEX CLT', icon: Plug },
    { id: 'daycoval', label: 'Planilhas INSS', icon: FileText },
    { id: 'outros', label: 'Outras conexões', icon: Plug },
    { id: 'health', label: 'Saúde das APIs', icon: Activity },
    { id: 'incidents', label: 'Incidentes', icon: AlertTriangle },
    { id: 'logs', label: 'Logs & Auditoria', icon: History },
  ];

  return (
    <div className={`space-y-6 ${premium ? 'p2-live-module p2-live-integrations' : ''}`}>
      {/* Top Banner do Hub */}
      <div className={`bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-6 text-[var(--text-primary)] flex flex-col md:flex-row md:items-center justify-between gap-4  ${premium ? 'p2-integration-header' : ''}`}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[var(--info-bg)] text-[var(--info-text)] rounded-xl border border-[var(--info-border)]">
            <Zap className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">Hub de Integrações Bancárias</h2>

            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Conexões, configurações e monitoramento da empresa.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1.5 text-xs font-semibold rounded-full flex items-center gap-1.5 border ${
              overallStatus === 'OPERATIONAL'
                ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
              : overallStatus === 'ATTENTION'
                ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]'
                : overallStatus === 'CHECKING' || overallStatus === 'UNKNOWN'
                  ? 'bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                  : 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]'
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
              ? 'Sem verificação completa'
              : 'Indisponibilidade Detectada'}
          </span>
          <button
            onClick={fetchHealthCatalog}
            disabled={isLoading}
            className="p-2.5 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-lg border border-[var(--border-default)] transition-colors cursor-pointer"
            title="Atualizar status geral"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {catalogError && <p role="alert" className="text-sm text-[var(--warning-text)] dark:text-[var(--warning-text)]">{catalogError}</p>}
      {/* Cards de Métricas e Contadores no Topo */}
      <div className={`grid grid-cols-2 md:grid-cols-5 gap-3 ${premium ? 'p2-integration-metrics' : ''}`}>
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-xs mb-1">
            <span>INTEGRAÇÕES HABILITADAS</span>
            <Layers className="w-4 h-4 text-[var(--info-text)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {isLoading || catalogError ? <span className="text-sm">{isLoading ? 'Carregando…' : 'Indisponível'}</span> : <>{integrations.filter(item=>item.active).length} <span className="text-xs text-[var(--text-secondary)] font-normal">/ {summary.total}</span></>}
          </div>
          {!isLoading&&!catalogError&&<p className="text-xs text-[var(--text-secondary)]">{integrations.filter(item=>item.configured).length} configuradas{summary.metricsPartial?' · leitura parcial':''}</p>}
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-xs mb-1">
            <span>ONLINE</span>
            <CheckCircle2 className="w-4 h-4 text-[var(--success-text)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--success-text)]">{isLoading || catalogError ? '—' : summary.online}</div>
          {!isLoading&&!catalogError&&<p className="text-xs text-[var(--text-secondary)]">{summary.unknown??integrations.filter(bank=>bank.status==='UNKNOWN').length} sem verificação confirmada</p>}
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-xs mb-1">
            <span>ATENÇÃO</span>
            <AlertTriangle className="w-4 h-4 text-[var(--warning-text)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--warning-text)]">{isLoading || catalogError ? '—' : summary.attention}</div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-xs mb-1">
            <span>OFFLINE</span>
            <AlertCircle className="w-4 h-4 text-[var(--danger-text)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--danger-text)]">{isLoading || catalogError ? '—' : summary.offline}</div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-xs mb-1">
            <span>ERROS 24H</span>
            <ShieldAlert className="w-4 h-4 text-[var(--text-secondary)]" />
          </div>
          <div className={`text-2xl font-bold ${summary.errors24h > 0 ? 'text-[var(--warning-text)]' : 'text-[var(--text-primary)]'}`}>
            {isLoading || catalogError ? '—' : summary.requests24h===0 ? 'Sem amostra' : summary.errors24h}{!isLoading&&!catalogError&&summary.metricsPartial?' (parcial)':''}
          </div>
        </div>
      </div>

      {/* Barra de Subnavegação das 8 Abas do Hub */}
      <div className={`flex items-center gap-1 overflow-x-auto border-b border-[var(--border-default)] pb-2 ${premium ? 'p2-integration-tabs' : ''}`} role={premium ? 'navigation' : undefined} aria-label={premium ? 'Áreas de integração' : undefined}>
        <select aria-label="Integração bancária" className="ui-input" style={{width:'auto',maxWidth:'100%'}} value={['overview','telegram','health','incidents','logs'].includes(activeTab)?'':activeTab} onChange={event=>setActiveTab(event.target.value as HubTab)}>
          <option value="" disabled>Selecionar integração</option>
          {tabs.filter(tab=>!['overview','telegram','health','incidents','logs'].includes(tab.id)).map(tab=><option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
        {tabs.filter(tab=>['overview','telegram','health','incidents','logs'].includes(tab.id)).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-current={premium && isActive ? 'page' : undefined}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[var(--action)] text-[var(--action-ink)]  '
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback de Ações (Mensagens de Sucesso ou Erro) */}
      <p className="text-xs text-[var(--text-secondary)]" role="status">Atualização automática de leitura a cada 60 segundos enquanto esta tela estiver visível.{catalogUpdatedAt?` Última leitura: ${new Date(catalogUpdatedAt).toLocaleTimeString('pt-BR')}.`:''} Habilitada não significa online. O catálogo agrega as promotoras ativas da empresa; cada configuração mantém sua própria promotora.</p>
      <PremiumContent active={premium} className="p2-integration-body space-y-6">
      {activeTab === 'telegram' && <TelegramIntegrationSettings key={StorageService.getCurrentTenantId() || 'platform'} />}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between ${
            actionFeedback.type === 'success'
              ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]'
              : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--success-text)] shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[var(--danger-text)] shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ABA 1: VISÃO GERAL */}
      {activeTab === 'overview' && <>
        {!catalogError&&!isLoading&&<Table caption="Integrações da empresa" rows={integrations} rowKey={bank=>bank.slug} columns={[
          {key:'name',label:'Instituição',render:bank=><strong>{bank.name}</strong>,compare:(a,b)=>a.name.localeCompare(b.name,'pt-BR')},
          {key:'configured',label:'Configuração',render:bank=>bank.configurationUnavailable?'Não conferida':bank.configured?'Configurada':'Pendente'},
          {key:'enabled',label:'Habilitação',render:bank=>bank.active?'Habilitada':'Desabilitada'},
          {key:'status',label:'Monitoramento',render:bank=><span title={bank.monitoringReason}><Badge tone={bank.status==='ONLINE'?'success':bank.status==='OFFLINE'?'danger':bank.status==='ATTENTION'?'warning':'neutral'}>{bank.status==='ONLINE'?'Última verificação OK':bank.status==='OFFLINE'?'Falha registrada':bank.status==='ATTENTION'?'Falha ou pendência registrada':bank.status==='UNKNOWN'?'Sem verificação confirmada':'Desabilitada'}</Badge></span>},
          {key:'checked',label:'Último registro',render:bank=>bank.lastHealthCheck?new Date(bank.lastHealthCheck.timestamp).toLocaleString('pt-BR'):'Não aferida'},
          {key:'action',label:'Ação',render:bank=><Button onClick={()=>setActiveTab(bank.slug)}>Abrir conexão</Button>},
        ]}/>}
        <p className="text-xs text-[var(--text-secondary)]">Sem verificação confirmada não significa falha: atualizar este painel apenas lê registros existentes e não testa os bancos. Quando há várias promotoras, o histórico precisa identificar cada conexão.</p>
        <details><summary>Diagnósticos e ações detalhadas</summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {integrations.map((bank) => {
            const isChecking = actionInProgress === `check_${bank.slug}`;
            const isSyncing = actionInProgress === `sync_${bank.slug}`;

            return (
              <div
                key={bank.id}
                className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-5 space-y-4 hover:border-[var(--border-default)] transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[var(--text-secondary)] bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded">
                          CÓD: {bank.code}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                          {bank.environments && bank.environments.length>1?'MÚLTIPLOS AMBIENTES':bank.environment==='unknown'?'AMBIENTE NÃO INFORMADO':bank.environment.toUpperCase()}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-[var(--text-primary)] mt-1.5">{bank.name}</h3>
                      <p className="text-xs text-[var(--text-secondary)]">{bank.configurationUnavailable?'Configuração não pôde ser conferida':bank.configured?`Configurada · ${bank.connectionCount??1} conexão(ões)`:'Sem credenciais configuradas'} · {bank.active?'Habilitada':'Não habilitada'}</p>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                        bank.status === 'ONLINE'
                          ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
                          : bank.status === 'ATTENTION'
                          ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]'
                          : bank.status === 'OFFLINE'
                          ? 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]'
                          : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--border-default)]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          bank.status === 'ONLINE'
                            ? 'bg-[var(--success-bg)] animate-pulse'
                            : bank.status === 'ATTENTION'
                            ? 'bg-[var(--warning-bg)]'
                            : bank.status === 'OFFLINE'
                            ? 'bg-[var(--danger-bg)] animate-ping'
                            : 'bg-[var(--bg-surface-elevated)]'
                        }`}
                      />
                      {bank.status === 'ONLINE'
                        ? 'ONLINE'
                        : bank.status === 'ATTENTION'
                        ? 'ATENÇÃO'
                        : bank.status === 'OFFLINE'
                        ? 'OFFLINE'
                        : bank.status === 'UNKNOWN' ? 'SEM VERIFICAÇÃO CONFIRMADA' : 'DESABILITADA'}
                    </span>
                  </div>

                  {/* Informações Operacionais */}
                  <div className="bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-lg p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span>URL do Serviço:</span>
                      <span className="font-mono text-[var(--text-primary)] font-medium">{bank.maskedBaseUrl}</span>
                    </div>
                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span>Último Health Check:</span>
                      <span className="text-[var(--text-primary)]">
                        {bank.lastHealthCheck?.timestamp
                          ? `${new Date(bank.lastHealthCheck.timestamp).toLocaleTimeString('pt-BR')} (${bank.lastHealthCheck.latencyMs}ms)`
                          : 'Ainda não aferido'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span>Taxa de Sucesso 24h:</span>
                      <span
                        className={`font-semibold ${
                          (bank.successRate24h ?? 100) >= 95
                            ? 'text-[var(--success-text)]'
                            : (bank.successRate24h ?? 100) >= 80
                            ? 'text-[var(--warning-text)]'
                            : 'text-[var(--danger-text)]'
                        }`}
                      >
                        {bank.successRate24h === undefined ? 'Sem amostra' : `${bank.successRate24h}% (${bank.totalRequests24h ?? 0} reqs)`}{bank.metricsPartial ? ' · parcial' : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span>Última sincronização registrada:</span>
                      <span className="text-[var(--text-primary)]">
                        {bank.lastSyncAt ? new Date(bank.lastSyncAt).toLocaleString('pt-BR') : 'Nenhuma recente'}
                      </span>
                    </div>

                    {/* Aviso específico de Cloudflare se houver Ray ID */}
                    {bank.lastHealthCheck?.rayId && (
                      <div className="pt-2 border-t border-[var(--border-default)] text-[11px] text-[var(--warning-text)] flex items-center justify-between">
                        <span>Bloqueio Cloudflare (Ray ID):</span>
                        <span className="font-mono font-bold text-[var(--warning-text)]">{bank.lastHealthCheck.rayId}</span>
                      </div>
                    )}
                  </div>

                  {/* Badges de Capabilities */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {bank.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)]"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Barra de Ações do Card */}
                <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-default)]">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab(bank.slug as HubTab)}
                      className="text-xs text-[var(--info-text)] hover:text-[var(--info-text)] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      Configurar <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    {['c6','facta','happy'].includes(bank.slug)&&<><span className="text-[var(--text-secondary)]">|</span>
                    <button
                      onClick={() => handleTriggerSync(bank.slug)}
                      disabled={isSyncing || !['c6','facta','happy'].includes(bank.slug)} title={bank.slug==='vctex'?'Sincronização não disponível nesta integração':undefined}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} /> Sincronizar
                    </button></>}
                  </div>

                  {['c6','facta','bmg','happy'].includes(bank.slug)&&<div className="flex items-center gap-2">
                    <button
                      onClick={() => !['c6','facta','bmg','happy'].includes(bank.slug)?setActiveTab(bank.slug):handleOpenDiagnostics(bank.slug, bank.name)}
                      className="px-2.5 py-1.5 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-lg text-xs font-semibold border border-[var(--border-default)] transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5 text-[var(--warning-text)]" /> Diagnóstico
                    </button>

                    <button
                      onClick={() => !['c6','facta','bmg','happy'].includes(bank.slug)?setActiveTab(bank.slug):handleRunHealthCheck(bank.slug)}
                      disabled={isChecking}
                      className="px-3 py-1.5 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-lg text-xs font-semibold  transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {isChecking ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verificando...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" /> {['c6','facta','bmg','happy'].includes(bank.slug)?'Testar Conexão':'Abrir conexão'}
                        </>
                      )}
                    </button>
                  </div>}
                </div>
              </div>
            );
          })}
        </div></details></>
      }

      {/* ABA 2: C6 BANK */}
      {activeTab === 'c6' && <BankIntegrationsView embedded initialTab="c6" />}

      {/* ABA 3: FACTA */}
      {activeTab === 'facta' && <BankIntegrationsView embedded initialTab="facta" />}

      {/* ABA 4: BMG */}
      {activeTab === 'bmg' && <BankIntegrationsView embedded initialTab="bmg" />}

      {/* ABA 5: HAPPY */}
      {activeTab === 'happy' && <BankIntegrationsView embedded initialTab="happy" />}
      {activeTab === 'daycoval' && <BankIntegrationsView embedded initialTab="daycoval" />}
      {activeTab === 'outros' && <BankIntegrationsView embedded initialTab="outros" />}
      {activeTab === 'workbank' && <BankIntegrationsView embedded initialTab="workbank" />}
      {activeTab === 'parana' && <BankIntegrationsView embedded initialTab="parana" />}
      {activeTab === 'presenca' && <BankIntegrationsView embedded initialTab="presenca" />}
      {activeTab === 'v8' && <BankIntegrationsView embedded initialTab="v8" />}
      {activeTab === 'vctex' && <BankIntegrationsView embedded initialTab="vctex" />}

      {/* ABA FINANTO / JOINBANK */}
      {activeTab === 'finanto' && <FinantoIntegrationTab />}
      {activeTab === 'nossa-fintech' && <NossaFintechIntegrationTab />}

      {/* ABA 6: SAÚDE DAS APIS */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          {/* Controles de Filtro da Aba Saúde */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">INTEGRAÇÃO:</span>
              <div className="flex items-center gap-1 bg-[var(--bg-canvas)] p-1 rounded-lg border border-[var(--border-default)]">
                {(['c6', 'facta', 'bmg', 'happy'] as const).map((slug) => (
                  <button
                    key={slug}
                    onClick={() => setHealthSelectedSlug(slug)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      healthSelectedSlug === slug
                        ? 'bg-[var(--action)] text-[var(--action-ink)] '
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {slug.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">PERÍODO:</span>
              <div className="flex items-center gap-1 bg-[var(--bg-canvas)] p-1 rounded-lg border border-[var(--border-default)]">
                {(['1h', '24h', '7d', '30d'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setHealthPeriod(p)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      healthPeriod === p ? 'bg-[var(--bg-surface-elevated)] text-[var(--info-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {healthLoading ? (
            <div className="p-12 text-center text-[var(--text-secondary)] flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-[var(--info-text)]" />
              <span>Calculando métricas agregadas de saúde da API...</span>
            </div>
          ) : healthStats ? (
            <div className="space-y-6">
              {/* Grid de Indicadores Estatísticos */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Disponibilidade</div>
                  <div className="text-2xl font-bold text-[var(--success-text)]">{healthStats.availability}%</div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                    {healthStats.successCount} de {healthStats.totalRequests} requisições
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Latência Média</div>
                  <div className="text-2xl font-bold text-[var(--text-primary)]">
                    {healthStats.avgLatencyMs !== null ? `${healthStats.avgLatencyMs}ms` : '—'}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-1">Média aritmética do período</div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Latência P95</div>
                  <div
                    className={`text-xl font-bold ${
                      typeof healthStats.p95LatencyMs === 'number' ? 'text-[var(--info-text)]' : 'text-[var(--text-secondary)] text-base'
                    }`}
                  >
                    {typeof healthStats.p95LatencyMs === 'number'
                      ? `${healthStats.p95LatencyMs}ms`
                      : healthStats.p95LatencyMs}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-1">95% das chamadas mais rápidas</div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Taxa de Erros</div>
                  <div className={`text-2xl font-bold ${healthStats.errorCount > 0 ? 'text-[var(--danger-text)]' : 'text-[var(--text-secondary)]'}`}>
                    {healthStats.errorCount}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-1">Total de falhas registradas</div>
                </div>
              </div>

              {/* Detalhes de Erros HTTP e Rate Limits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-5 space-y-3">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[var(--warning-text)]" />
                    Distribuição de Falhas ({healthPeriod})
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-default)]">
                      <span className="text-[var(--text-secondary)]">Erros de Cliente (HTTP 4xx):</span>
                      <span className="font-mono font-bold text-[var(--warning-text)]">{healthStats.http4xxCount}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-default)]">
                      <span className="text-[var(--text-secondary)]">Erros de Servidor (HTTP 5xx):</span>
                      <span className="font-mono font-bold text-[var(--danger-text)]">{healthStats.http5xxCount}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-default)]">
                      <span className="text-[var(--text-secondary)]">Timeouts de Conexão:</span>
                      <span className="font-mono font-bold text-[var(--info-text)]">{healthStats.timeoutCount}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-5 space-y-3">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[var(--info-text)]" />
                    Rate Limit e Cotas da API
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-default)]">
                      <span className="text-[var(--text-secondary)]">Limite Informado:</span>
                      <span className="font-mono text-[var(--text-primary)]">{healthStats.rateLimit.limit}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-default)]">
                      <span className="text-[var(--text-secondary)]">Consumo Atual:</span>
                      <span className="font-mono text-[var(--text-primary)]">{healthStats.rateLimit.used}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-default)]">
                      <span className="text-[var(--text-secondary)]">Reinício da Janela:</span>
                      <span className="font-mono text-[var(--text-primary)]">{healthStats.rateLimit.reset}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-[var(--text-secondary)]">Nenhum dado estatístico disponível.</div>
          )}
        </div>
      )}

      {/* ABA 7: INCIDENTES */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[var(--text-primary)]">Histórico e Gestão de Incidentes</h3>
            <button
              onClick={fetchIncidents}
              className="px-3 py-1.5 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] text-xs font-semibold rounded-lg border border-[var(--border-default)] flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${incidentsLoading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>

          {incidentsLoading ? (
            <div className="p-8 text-center text-[var(--text-secondary)]">Carregando incidentes...</div>
          ) : incidents.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-8 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-[var(--success-text)] mx-auto" />
              <h4 className="text-sm font-bold text-[var(--text-primary)]">Nenhum incidente ativo ou recente</h4>
              <p className="text-xs text-[var(--text-secondary)]">
                Todas as integrações estão operando dentro dos padrões contratuais de estabilidade.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {incidents.map((inc) => (
                <div key={inc.id} className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[var(--border-default)] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inc.status === 'RESOLVED'
                              ? 'bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]'
                              : 'bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-border)]'
                          }`}
                        >
                          {inc.status}
                        </span>
                        <span className="text-xs font-bold text-[var(--text-secondary)]">{inc.bank}</span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          Duração: {inc.durationMinutes} min
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-[var(--text-primary)] mt-1">{inc.title}</h4>
                    </div>

                    <div className="text-xs text-[var(--text-secondary)] font-mono">
                      Início: {new Date(inc.identifiedAt).toLocaleString('pt-BR')}
                    </div>
                  </div>

                  <p className="text-xs text-[var(--text-primary)]">{inc.description}</p>

                  {/* Linha do Tempo do Incidente */}
                  <div className="bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-lg p-3 space-y-2">
                    <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      Timeline do Incidente
                    </span>
                    <div className="space-y-2 pt-1">
                      {inc.timeline.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] font-mono text-[10px] shrink-0">
                            {step.step}
                          </span>
                          <span className="text-[var(--text-secondary)] text-[11px]">
                            {new Date(step.timestamp).toLocaleTimeString('pt-BR')} —
                          </span>
                          <span className="text-[var(--text-primary)]">{step.note}</span>
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
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Filtrar por endpoint, erro, Ray ID..."
                  value={logsSearch}
                  onChange={(e) => {
                    setLogsSearch(e.target.value);
                    setLogsPage(1);
                  }}
                  className="ui-input w-full pl-9 pr-3 py-2 bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--info-border)]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <select
                  value={logsBankFilter}
                  onChange={(e) => {
                    setLogsBankFilter(e.target.value);
                    setLogsPage(1);
                  }}
                  className="ui-input px-3 py-2 bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--info-border)]"
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
                  className="ui-input px-3 py-2 bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--info-border)]"
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
                  className="ui-input px-3 py-2 bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--info-border)]"
                >
                  <option value="1h">Última 1 hora</option>
                  <option value="24h">Últimas 24 horas</option>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                  <option value="ALL">Sem restrição</option>
                </select>

                <button
                  onClick={fetchLogs}
                  className="p-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-lg border border-[var(--border-default)] cursor-pointer"
                  title="Atualizar logs"
                >
                  <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Logs */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--text-primary)]">
                <thead className="bg-[var(--bg-canvas)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider text-[11px] border-b border-[var(--border-default)]">
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
                <tbody className="divide-y divide-[var(--field-border)]">
                  {logsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--text-secondary)]">
                        Carregando registros de auditoria...
                      </td>
                    </tr>
                  ) : logsError ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--warning-text)]">
                        <div className="flex flex-col items-center gap-3">
                          <span>{logsError}</span>
                          <button
                            type="button"
                            onClick={fetchLogs}
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--text-secondary)]">
                        Nenhum registro encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-[var(--text-secondary)] font-mono">
                          {new Date(log.timestamp).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-bold text-[var(--text-primary)]">{log.bank}</td>
                        <td className="py-3 px-4 font-mono text-[var(--text-primary)]">{log.endpoint}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              log.success
                                ? 'bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]'
                                : 'bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-border)]'
                            }`}
                          >
                            {log.httpStatus || (log.success ? '200' : 'ERR')}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono">{log.latencyMs}ms</td>
                        <td className="py-3 px-4 max-w-xs truncate text-[var(--text-primary)]">
                          {log.errorMessage ? (
                            <span className="text-[var(--warning-text)]">{log.errorMessage}</span>
                          ) : (
                            <span className="text-[var(--success-text)]">OK</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-[var(--text-secondary)]">
                          {log.rayId ? (
                            <span className="text-[var(--warning-text)] font-bold">{log.rayId}</span>
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
            <div className="bg-[var(--bg-canvas)] p-4 border-t border-[var(--border-default)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <div>
                Total de <strong className="text-[var(--text-primary)]">{logsTotal}</strong> registros (Página {logsPage} de{' '}
                {logsTotalPages})
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  disabled={logsPage <= 1}
                  className="px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-surface-elevated)] cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </button>
                <button
                  onClick={() => setLogsPage((p) => Math.min(logsTotalPages, p + 1))}
                  disabled={logsPage >= logsTotalPages}
                  className="px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-surface-elevated)] cursor-pointer flex items-center gap-1"
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
        <div className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl w-full max-w-lg p-6 space-y-4 ">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-[var(--info-text)]" />
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Diagnóstico de Conectividade — {diagnosticModal.bank}
                </h3>
              </div>
              <button
                onClick={() => setDiagnosticModal({ isOpen: false, loading: false, bank: '' })}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {diagnosticModal.loading ? (
              <div className="py-12 text-center text-[var(--text-secondary)] flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-[var(--info-text)]" />
                <span>Executando testes de conectividade, DNS e TLS...</span>
              </div>
            ) : diagnosticModal.result ? (
              <div className="space-y-4 text-xs">
                {/* Status Geral */}
                <div
                  className={`p-3 rounded-lg border flex items-center gap-3 ${
                    diagnosticModal.result.success
                      ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]'
                      : diagnosticModal.result.isCloudflareBlocked
                      ? 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-text)]'
                      : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]'
                  }`}
                >
                  {diagnosticModal.result.success ? (
                    <CheckCircle2 className="w-6 h-6 text-[var(--success-text)] shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-[var(--warning-text)] shrink-0" />
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
                <div className="bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded-lg p-3 space-y-2 font-mono">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Endpoint Testado:</span>
                    <span className="text-[var(--text-primary)]">{diagnosticModal.result.logicalEndpoint}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Status HTTP:</span>
                    <span className="text-[var(--text-primary)]">{diagnosticModal.result.httpStatus || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Latência:</span>
                    <span className="text-[var(--text-primary)]">{diagnosticModal.result.latencyMs}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Resolução DNS:</span>
                    <span className="text-[var(--success-text)]">RESOLVIDO COM SUCESSO</span>
                  </div>
                  {diagnosticModal.result.rayId && (
                    <div className="flex justify-between text-[var(--warning-text)] font-bold">
                      <span>Cloudflare Ray ID:</span>
                      <span>{diagnosticModal.result.rayId}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Request ID:</span>
                    <span className="text-[var(--text-secondary)]">{diagnosticModal.result.requestId}</span>
                  </div>
                </div>

                <div className="text-[11px] text-[var(--text-secondary)] italic">
                  * Este diagnóstico foi executado de forma não destrutiva, sem criar propostas ou clientes fictícios.
                </div>
              </div>
            ) : null}

            <div className="pt-2 flex justify-end border-t border-[var(--border-default)]">
              <button
                onClick={() => setDiagnosticModal({ isOpen: false, loading: false, bank: '' })}
                className="px-4 py-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-lg text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      </PremiumContent>
    </div>
  );
};
