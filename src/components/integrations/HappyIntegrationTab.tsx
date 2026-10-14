import { BankPromoterConnection, promoterApiUrl } from './BankPromoterConnection';
import React, { useState, useEffect } from 'react';
import {
  Server,
  Zap,
  Play,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  ExternalLink,
  ShieldCheck,
  Activity,
  History,
  Info,
  Copy,
  Check,
  Search,
  FileText,
  Radio,
  Send,
} from 'lucide-react';
import {
  HappyConfigState,
  HappyStatusState,
  HappySyncHistoryItem,
  HappyWebhookEventItem,
} from '../../types';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';

async function safeFetchJson<T = any>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  const trimmed = text.trim();

  const isHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head') ||
    contentType.toLowerCase().includes('text/html');

  if (isHtml) {
    if (res.status === 404) {
      throw new Error(`Rota não encontrada (HTTP 404 em ${url}).`);
    }
    if (res.status === 401 || res.status === 403 || res.status === 302) {
      throw new Error(`Sessão expirada ou não autorizada (HTTP ${res.status}).`);
    }
    throw new Error(`Resposta HTML inesperada (HTTP ${res.status}).`);
  }

  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Resposta em formato inválido (HTTP ${res.status}).`);
  }

  return { ok: res.ok, status: res.status, data };
}

const HappyIntegrationTabContent: React.FC<{ promoterId: string }> = ({ promoterId }) => {
  const activeUser = StorageService.getActiveUser();
  const canManageConfig = ['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN', 'GESTOR'].includes(activeUser?.role || '') ||
    hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
  const canSync = hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.sync') ||
    hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
  const canDiagnose = hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.diagnose') ||
    hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
  const canViewLogs = hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.logs') ||
    hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');

  // Config state
  const [config, setConfig] = useState<HappyConfigState>({
    ambiente: 'staging',
    baseUrl: 'https://sp-integracao-api.byx.capital',
    clientId: '',
    usuario: '',
    cpfDigitador: '',
    correspondenteBanqueiro: '',
    ativo: false,
    isConfigured: false,
    hasSecret: false,
    hasSenha: false,
  });

  const [secretInput, setSecretInput] = useState('');
  const [senhaInput, setSenhaInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showSenha, setShowSenha] = useState(false);

  // Status and Metrics
  const [status, setStatus] = useState<HappyStatusState | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Connection test
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    responseTimeMs?: number;
    tokenType?: string;
    expiresAt?: string;
    ambiente?: string;
  } | null>(null);

  // Batch sync
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResultMsg, setSyncResultMsg] = useState<string | null>(null);

  // Logs & Webhooks
  const [activeSubTab, setActiveSubTab] = useState<'logs' | 'webhooks' | 'diagnostic'>('logs');
  const [recentLogs, setRecentLogs] = useState<HappySyncHistoryItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [unmatchedWebhooks, setUnmatchedWebhooks] = useState<HappyWebhookEventItem[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);

  // Diagnostic Consultation
  const [consultCpf, setConsultCpf] = useState('');
  const [consultContractId, setConsultContractId] = useState('');
  const [consultProductType, setConsultProductType] = useState('CONSIGNADO');
  const [isConsulting, setIsConsulting] = useState(false);
  const [consultResult, setConsultResult] = useState<any | null>(null);

  // Selected Log for detail modal / drawer
  const [selectedLogPayload, setSelectedLogPayload] = useState<any | null>(null);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

  const webhookPublicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/happy/status`
    : '/api/webhooks/happy/status';

  // Load config & status
  const fetchConfigAndStatus = async () => {
    setIsLoadingConfig(true);
    setIsLoadingStatus(true);
    setErrorMessage(null);

    try {
      const [cfgRes, statusRes] = await Promise.all([
        safeFetchJson<HappyConfigState>(promoterApiUrl('/api/integrations/happy/config', promoterId)),
        safeFetchJson<HappyStatusState>(promoterApiUrl('/api/integrations/happy/status', promoterId)),
      ]);

      if (cfgRes.ok) setConfig(cfgRes.data);
      if (statusRes.ok) setStatus(statusRes.data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao carregar dados da integração Happy.');
    } finally {
      setIsLoadingConfig(false);
      setIsLoadingStatus(false);
    }
  };

  // Load recent sync logs
  const fetchRecentLogs = async () => {
    if (!canViewLogs) return;
    setIsLoadingLogs(true);
    try {
      const { ok, data } = await safeFetchJson<HappySyncHistoryItem[]>(promoterApiUrl('/api/integrations/happy/recent-logs?limit=30', promoterId));
      if (ok && Array.isArray(data)) {
        setRecentLogs(data);
      }
    } catch (err: any) {
      console.error('[HAPPY LOGS ERROR]', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Load unmatched webhooks
  const fetchUnmatchedWebhooks = async () => {
    if (!canViewLogs) return;
    setIsLoadingWebhooks(true);
    try {
      const { ok, data } = await safeFetchJson<HappyWebhookEventItem[]>(promoterApiUrl('/api/integrations/happy/unmatched-webhooks?limit=30', promoterId));
      if (ok && Array.isArray(data)) {
        setUnmatchedWebhooks(data);
      }
    } catch (err: any) {
      console.error('[HAPPY WEBHOOKS ERROR]', err);
    } finally {
      setIsLoadingWebhooks(false);
    }
  };

  useEffect(() => {
    fetchConfigAndStatus();
    if (canViewLogs) {
      fetchRecentLogs();
      fetchUnmatchedWebhooks();
    }
  }, [canViewLogs]);

  // Update base URL automatically when environment changes if user hasn't typed custom
  const handleEnvironmentChange = (env: 'staging' | 'production') => {
    const isDefaultUrl =
      config.baseUrl === 'https://sp-integracao-api.byx.capital' ||
      config.baseUrl === 'https://api-integracao.byx.capital' ||
      !config.baseUrl;

    setConfig((prev) => ({
      ...prev,
      ambiente: env,
      baseUrl: isDefaultUrl
        ? env === 'production'
          ? 'https://api-integracao.byx.capital'
          : 'https://sp-integracao-api.byx.capital'
        : prev.baseUrl,
    }));
  };

  // Save config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageConfig) return;
    setIsSaving(true);
    setSaveSuccessMsg(null);
    setErrorMessage(null);

    try {
      const payload: any = {
        ambiente: config.ambiente,
        baseUrl: config.baseUrl,
        clientId: config.clientId,
        usuario: config.usuario,
        cpfDigitador: config.cpfDigitador,
        correspondenteBanqueiro: config.correspondenteBanqueiro,
        ativo: config.ativo,
      };

      if (secretInput.trim()) {
        payload.secret = secretInput.trim();
      }
      if (senhaInput.trim()) {
        payload.senha = senhaInput.trim();
      }

      const { ok, data } = await safeFetchJson(promoterApiUrl('/api/integrations/happy/config', promoterId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!ok) {
        throw new Error(data?.error || 'Falha ao salvar configurações.');
      }

      setSaveSuccessMsg('Configurações da Happy / BYX Capital salvas com sucesso!');
      window.dispatchEvent(new Event('tenantUpdated'));
      setSecretInput('');
      setSenhaInput('');
      await fetchConfigAndStatus();
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao salvar configurações da Happy.');
    } finally {
      setIsSaving(false);
    }
  };

  // Test live connection & token acquisition
  const handleTestConnection = async () => {
    if (!canDiagnose) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const payload: any = {
        ambiente: config.ambiente,
        baseUrl: config.baseUrl,
        clientId: config.clientId,
        usuario: config.usuario,
      };
      if (secretInput.trim()) payload.secret = secretInput.trim();
      if (senhaInput.trim()) payload.senha = senhaInput.trim();

      const { ok, data } = await safeFetchJson(promoterApiUrl('/api/integrations/happy/test-connection', promoterId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Falha na comunicação de teste.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Trigger batch reconciliation of active proposals
  const handleRunReconciliation = async () => {
    if (!canSync) return;
    setIsSyncing(true);
    setSyncResultMsg(null);

    try {
      const { ok, data } = await safeFetchJson(promoterApiUrl('/api/integrations/happy/run-sync', promoterId), {
        method: 'POST',
      });

      if (ok) {
        setSyncResultMsg(data?.message || 'Reconciliação concluída.');
        await fetchConfigAndStatus();
        await fetchRecentLogs();
      } else {
        setSyncResultMsg(data?.error || 'Falha ao executar reconciliação.');
      }
    } catch (err: any) {
      setSyncResultMsg(err.message || 'Erro inesperado durante reconciliação.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Test contract query directly
  const handleConsultContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDiagnose) return;
    if (!consultCpf.trim() && !consultContractId.trim()) {
      alert('Informe ao menos o CPF ou o ID do Contrato para consulta.');
      return;
    }

    setIsConsulting(true);
    setConsultResult(null);

    try {
      const { ok, data } = await safeFetchJson(promoterApiUrl('/api/integrations/happy/consult-contract', promoterId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: consultCpf ? consultCpf.replace(/\D/g, '') : undefined,
          contractId: consultContractId.trim() || undefined,
          tipoProduto: consultProductType,
        }),
      });

      setConsultResult(data);
    } catch (err: any) {
      setConsultResult({
        success: false,
        error: err.message || 'Erro ao consultar contrato.',
      });
    } finally {
      setIsConsulting(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookPublicUrl);
    setCopiedWebhookUrl(true);
    setTimeout(() => setCopiedWebhookUrl(false), 2000);
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleString('pt-BR');
  };

  return (
    <div className="space-y-6" id="happy-integration-tab-container">
      {/* Banner Principal da Integração Happy / BYX Capital */}
      <div
        id="happy-banner-header"
        className="p-4 rounded-2xl bg-gradient-to-r from-pink-900 via-rose-900 to-slate-900 text-white flex flex-wrap items-center justify-between gap-4 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-white text-pink-600 flex items-center justify-center font-black text-xl tracking-tighter shadow-md">
            HP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black">Happy / BYX Capital (Código HAPPY)</h2>
              {config.isConfigured ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {config.ativo ? 'Conectado & Habilitado' : 'Configurado (Inativo)'}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Credenciais Pendentes
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-200 border border-pink-500/30">
                Ambiente: {config.ambiente === 'production' ? 'PRODUÇÃO' : 'STAGING / HOMOLOGAÇÃO'}
              </span>
            </div>
            <p className="text-xs text-pink-100/80 mt-0.5">
              API REST & Webhooks em Tempo Real — Acompanhamento de Propostas, Consulta de Contratos e Atualização de Status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="happy-btn-reconcile"
            type="button"
            onClick={handleRunReconciliation}
            disabled={isSyncing || !config.isConfigured || !canSync}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs disabled:opacity-50 transition-all shadow-xs cursor-pointer"
          >
            <Play className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Reconciliando...' : 'Reconciliar Propostas Ativas'}</span>
          </button>

          <button
            id="happy-btn-reload"
            type="button"
            onClick={() => {
              fetchConfigAndStatus();
              fetchRecentLogs();
              fetchUnmatchedWebhooks();
            }}
            disabled={isLoadingConfig}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            title="Recarregar dados"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingConfig ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alerta de Feedback de Reconciliação / Salvar */}
      {syncResultMsg && (
        <div className="p-3 rounded-xl bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800 text-pink-900 dark:text-pink-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-pink-600 shrink-0" />
            <span>{syncResultMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncResultMsg(null)}
            className="text-pink-600 hover:underline font-bold text-[11px]"
          >
            Fechar
          </button>
        </div>
      )}

      {saveSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccessMsg(null)}
            className="text-emerald-600 hover:underline font-bold text-[11px]"
          >
            Fechar
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-600 hover:underline font-bold text-[11px]"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Grid de Métricas Operacionais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="happy-metrics-grid">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estado Operacional</span>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  config.ativo && config.isConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                {config.ativo && config.isConfigured ? 'Ativo & Operacional' : 'Desativado / Pendente'}
              </span>
            </div>
            <Activity className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-[10px] text-slate-500">
            Ambiente: {config.ambiente}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Propostas Sincronizadas</span>
          <div className="flex items-center justify-between pt-1">
            <span className="font-bold text-xl text-slate-900 dark:text-slate-100">
              {status?.totalSyncedCount ?? 0}
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-[10px] text-slate-500">
            Última sync: {formatDateTime(status?.lastSyncAt)}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Webhooks em Tempo Real</span>
          <div className="flex items-center justify-between pt-1">
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-pink-500 animate-pulse" />
              Recepção Ativa
            </span>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-[10px] text-slate-500">
            Último evento: {formatDateTime(status?.lastWebhookReceivedAt)}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Eventos Não Vinculados</span>
          <div className="flex items-center justify-between pt-1">
            <span
              className={`font-bold text-xl ${
                (status?.unmatchedWebhooksCount || 0) > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {status?.unmatchedWebhooksCount ?? 0}
            </span>
            <AlertTriangle
              className={`h-4 w-4 ${
                (status?.unmatchedWebhooksCount || 0) > 0 ? 'text-amber-500' : 'text-slate-400'
              }`}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            {status?.unmatchedWebhooksCount ? 'Aguardando matching de contrato' : 'Todos vinculados com sucesso'}
          </p>
        </div>
      </div>

      {/* Grid Principal: 2 Colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna 1: Formulário de Configurações Seguras (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {!canManageConfig && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              Você pode consultar a integração, mas precisa de permissão de gestão para alterar as credenciais.
            </div>
          )}
          <form
            id="happy-config-form"
            onSubmit={handleSaveConfig}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4"
          >
            <fieldset disabled={!canManageConfig} className="contents">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-pink-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Credenciais & Parâmetros de Autenticação (Happy/BYX)
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">OAuth 2.0 Client Credentials</span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Senhas e segredos não são devolvidos pela API de configuração; os dados operacionais ficam isolados por tenant.
            </p>

            {/* Seleção de Ambiente */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Ambiente de Conexão
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleEnvironmentChange('staging')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    config.ambiente === 'staging'
                      ? 'border-pink-500 bg-pink-50/50 dark:bg-pink-950/20 text-pink-900 dark:text-pink-200 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div
                    className={`h-3 w-3 rounded-full mt-0.5 border ${
                      config.ambiente === 'staging' ? 'border-pink-600 bg-pink-600' : 'border-slate-400'
                    }`}
                  />
                  <div>
                    <span className="font-bold text-xs block">Staging / Homologação</span>
                    <span className="text-[10px] opacity-75 font-mono">sp-integracao-api.byx.capital</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleEnvironmentChange('production')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    config.ambiente === 'production'
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div
                    className={`h-3 w-3 rounded-full mt-0.5 border ${
                      config.ambiente === 'production' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-400'
                    }`}
                  />
                  <div>
                    <span className="font-bold text-xs block">Produção</span>
                    <span className="text-[10px] opacity-75 font-mono">api-integracao.byx.capital</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Base URL */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                URL Base da API (Endpoint REST)
              </label>
              <input
                id="happy-input-base-url"
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                placeholder="https://sp-integracao-api.byx.capital"
              />
            </div>

            {/* Grid 2 Cols: Client ID & Secret */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Client ID (client_id)
                </label>
                <input
                  id="happy-input-client-id"
                  type="text"
                  value={config.clientId}
                  onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
                  placeholder="Ex: d41d8cd98f00b204e9800998ecf8427e"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Client Secret (secret)
                  </label>
                  {config.hasSecret && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      ✓ Já cadastrado
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="happy-input-secret"
                    type={showSecret ? 'text' : 'password'}
                    value={secretInput}
                    onChange={(e) => setSecretInput(e.target.value)}
                    placeholder={config.hasSecret ? '••••••••••••••••••••••••' : 'Cole o client_secret aqui'}
                    className="w-full px-3 py-2 pr-9 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Grid 2 Cols: Usuário & Senha */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Usuário Operador (usuario)
                </label>
                <input
                  id="happy-input-usuario"
                  type="text"
                  value={config.usuario}
                  onChange={(e) => setConfig({ ...config, usuario: e.target.value })}
                  placeholder="Ex: operador.sentinel"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Senha (senha)
                  </label>
                  {config.hasSenha && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      ✓ Já cadastrada
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="happy-input-senha"
                    type={showSenha ? 'text' : 'password'}
                    value={senhaInput}
                    onChange={(e) => setSenhaInput(e.target.value)}
                    placeholder={config.hasSenha ? '••••••••••••••••' : 'Digite a senha de acesso'}
                    className="w-full px-3 py-2 pr-9 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha(!showSenha)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    {showSenha ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Grid 2 Cols: CPF Digitador & Corban */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  CPF do Digitador (Obrigatório para consultas)
                </label>
                <input
                  id="happy-input-cpf-digitador"
                  type="text"
                  value={config.cpfDigitador}
                  onChange={(e) => setConfig({ ...config, cpfDigitador: e.target.value })}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Correspondente Banqueiro (Código Corban)
                </label>
                <input
                  id="happy-input-corban"
                  type="text"
                  value={config.correspondenteBanqueiro}
                  onChange={(e) => setConfig({ ...config, correspondenteBanqueiro: e.target.value })}
                  placeholder="Ex: CORBAN_001"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
              </div>
            </div>

            {/* Checkbox Ativo */}
            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="happy-checkbox-ativo"
                  type="checkbox"
                  checked={config.ativo}
                  onChange={(e) => setConfig({ ...config, ativo: e.target.checked })}
                  className="h-4 w-4 rounded-sm border-slate-300 text-pink-600 focus:ring-pink-500"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Habilitar integração Happy / BYX Capital e novas simulações nesta empresa
                </span>
              </label>
            </div>

            {/* Botões Salvar e Testar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                id="happy-btn-test-connection"
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !canDiagnose}
                className="px-4 py-2 rounded-lg border border-pink-300 dark:border-pink-800 bg-pink-50 dark:bg-pink-950/40 text-pink-800 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/50 font-bold text-xs disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Validando...' : 'Testar Conexão e Token'}</span>
              </button>

              <button
                id="happy-btn-save-config"
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs disabled:opacity-50 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{isSaving ? 'Salvando...' : 'Salvar Configurações'}</span>
              </button>
            </div>

            {/* Resultado do Teste de Conexão */}
            {testResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1.5 animate-in fade-in duration-200 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
                {testResult.responseTimeMs && (
                  <p className="text-[11px] opacity-80 pl-6">
                    Tempo de resposta: <span className="font-mono font-bold">{testResult.responseTimeMs} ms</span>
                    {testResult.expiresAt && ` • Token expira em: ${formatDateTime(testResult.expiresAt)}`}
                  </p>
                )}
              </div>
            )}
            </fieldset>
          </form>
        </div>

        {/* Coluna 2: Endpoint de Webhook & Ferramenta de Diagnóstico (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Endpoint de Webhook em Tempo Real */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-pink-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Endpoint Público para Webhooks
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 dark:bg-pink-950 text-pink-800 dark:text-pink-300">
                POST Inbound
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cadastre esta URL na plataforma Happy / BYX Capital para receber notificações em tempo real sempre que uma proposta alterar de fase.
            </p>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">URL do Webhook</span>
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate select-all flex-1">
                  {webhookPublicUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyWebhookUrl}
                  className="px-2 py-1 rounded-md bg-white dark:bg-slate-850 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                >
                  {copiedWebhookUrl ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Características de Segurança e Confiabilidade
              </span>
              <ul className="space-y-1 text-[11px]">
                <li className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span><strong>Idempotência:</strong> Deduplicação automática via <code className="font-mono">request_id</code></span>
                </li>
                <li className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span><strong>Isolamento Multi-tenant:</strong> Resolução de proposta e tenant automática</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span><strong>Preservação de Estado:</strong> Payload bruto e status desconhecidos mantidos</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Card: Ferramenta de Consulta / Diagnóstico de Contratos */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-pink-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Diagnóstico: Consulta Direta de Contratos
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">/contratos/consultar</span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Teste a resposta ao vivo da API da Happy consultando por CPF do cliente ou ID do Contrato.
            </p>

            <form onSubmit={handleConsultContract} className="space-y-3">
              <fieldset disabled={!canDiagnose} className="contents">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    CPF do Cliente
                  </label>
                  <input
                    type="text"
                    value={consultCpf}
                    onChange={(e) => setConsultCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    ID do Contrato
                  </label>
                  <input
                    type="text"
                    value={consultContractId}
                    onChange={(e) => setConsultContractId(e.target.value)}
                    placeholder="Ex: 12345"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <select
                  value={consultProductType}
                  onChange={(e) => setConsultProductType(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="CONSIGNADO">Consignado (INSS/Servidores)</option>
                  <option value="PORTABILIDADE">Portabilidade</option>
                </select>

                <button
                  type="submit"
                  disabled={isConsulting || !canDiagnose}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Search className={`h-3 w-3 ${isConsulting ? 'animate-spin' : ''}`} />
                  <span>{isConsulting ? 'Consultando...' : 'Consultar na Happy'}</span>
                </button>
              </div>
              </fieldset>
            </form>

            {/* Resultado da Consulta Diagnóstica */}
            {consultResult && (
              <div className="mt-3 p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-[10px] space-y-2 overflow-x-auto max-h-56">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                  <span className="text-pink-400 font-bold">Resultado da Consulta</span>
                  <span className="text-slate-400">{new Date().toLocaleTimeString()}</span>
                </div>
                <pre className="whitespace-pre-wrap">{JSON.stringify(consultResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-abas de Auditoria e Logs */}
      {canViewLogs && <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-pink-600" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Auditoria de Sincronizações e Eventos Webhook
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('logs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'logs'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              Histórico de Sincronizações ({recentLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('webhooks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'webhooks'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              Eventos Webhook Recebidos ({unmatchedWebhooks.length})
            </button>
          </div>
        </div>

        {/* Tabela de Histórico de Sincronizações */}
        {activeSubTab === 'logs' && (
          <div className="space-y-3">
            {isLoadingLogs ? (
              <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-pink-600" />
                <span>Carregando logs de sincronização...</span>
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-1">
                <Info className="h-6 w-6 mx-auto text-slate-300 mb-1" />
                <p className="font-bold text-xs">Nenhum registro de sincronização encontrado para este tenant.</p>
                <p className="text-[11px]">As sincronizações serão registradas automaticamente quando houver eventos ou consultas.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2.5">Operação</th>
                      <th className="p-2.5">Proposta / Contrato</th>
                      <th className="p-2.5">Cliente</th>
                      <th className="p-2.5">Status Anterior → Novo</th>
                      <th className="p-2.5">Resultado</th>
                      <th className="p-2.5">Data / Hora</th>
                      <th className="p-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recentLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                        <td className="p-2.5 font-bold font-mono">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] ${
                              log.operation === 'WEBHOOK'
                                ? 'bg-pink-100 text-pink-800 dark:bg-pink-950/80 dark:text-pink-300'
                                : log.operation === 'RECONCILIATION'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {log.operation}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">
                            {log.proposal?.proposalNumber || 'Sem vínculo'}
                          </span>
                          {log.happyContractId && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Contrato: {log.happyContractId}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {log.proposal?.client?.fullName || '—'}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-[11px]">
                          {log.previousStatus || '—'} → <strong className="text-pink-600">{log.newStatus || '—'}</strong>
                        </td>
                        <td className="p-2.5">
                          {log.status === 'SUCCESS' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                              Sucesso
                            </span>
                          ) : log.status === 'UNCHANGED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                              Sem alteração
                            </span>
                          ) : log.status === 'UNMATCHED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                              Não vinculado
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300">
                              Erro
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-500 whitespace-nowrap">
                          {formatDateTime(log.startedAt)}
                        </td>
                        <td className="p-2.5 text-right">
                          {log.rawResponse && (
                            <button
                              type="button"
                              onClick={() => setSelectedLogPayload(log.rawResponse)}
                              className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                            >
                              Ver Payload
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tabela de Eventos Webhooks */}
        {activeSubTab === 'webhooks' && (
          <div className="space-y-3">
            {isLoadingWebhooks ? (
              <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-pink-600" />
                <span>Carregando eventos webhook...</span>
              </div>
            ) : unmatchedWebhooks.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-1">
                <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-400 mb-1" />
                <p className="font-bold text-xs">Nenhum evento pendente ou desvinculado no momento.</p>
                <p className="text-[11px]">Todos os webhooks recebidos foram processados e correlacionados com sucesso.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2.5">Request ID</th>
                      <th className="p-2.5">Evento</th>
                      <th className="p-2.5">Contrato / Cliente</th>
                      <th className="p-2.5">Status Recebido</th>
                      <th className="p-2.5">Processamento</th>
                      <th className="p-2.5">Recebido em</th>
                      <th className="p-2.5 text-right">Payload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {unmatchedWebhooks.map((event) => (
                      <tr key={event.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                        <td className="p-2.5 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          {event.requestId}
                        </td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300">
                            {event.eventName}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">
                            {event.contractId ? `Contrato: ${event.contractId}` : 'Sem contrato'}
                          </span>
                          {event.customerId && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Cliente ID: {event.customerId}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {event.statusName || '—'}
                          </div>
                          {event.statusDescription && (
                            <div className="text-[10px] text-slate-400">
                              {event.statusDescription}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              event.processingStatus === 'MATCHED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : event.processingStatus === 'UNMATCHED'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            }`}
                          >
                            {event.processingStatus}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-500 whitespace-nowrap">
                          {formatDateTime(event.receivedAt)}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedLogPayload(event.payload)}
                            className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                          >
                            Ver Payload
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>}

      {/* Modal / Visualizador de Payload Bruto */}
      {selectedLogPayload && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-pink-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Payload Bruto da API / Webhook (Auditoria)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogPayload(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-[11px] overflow-auto max-h-96">
              <pre className="whitespace-pre-wrap">{JSON.stringify(selectedLogPayload, null, 2)}</pre>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLogPayload(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
              >
                Fechar Visualizador
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const HappyIntegrationTab: React.FC<{ promoterId?: string }> = ({ promoterId }) => promoterId ? <HappyIntegrationTabContent promoterId={promoterId} /> : <BankPromoterConnection>{id => <HappyIntegrationTabContent promoterId={id} />}</BankPromoterConnection>;
