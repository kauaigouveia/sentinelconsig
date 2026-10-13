import React, { useState, useEffect } from 'react';
import { SimulationBankOrderSettings } from './SimulationBankOrderSettings';
import { BmgIntegrationTab } from './BmgIntegrationTab';
import { PortRefinWorkbookSettings } from './DaycovalWorkbookSettings';
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
  Building2,
  Plug,
  Layers,
  ChevronRight,
  Sparkles,
  Search,
} from 'lucide-react';
import {
  C6ConfigState,
  C6WorkerStatusState,
  C6SyncHistoryItem,
  FactaConfigState,
  FactaWorkerStatusState,
  FactaSyncHistoryItem,
} from '../../types';
import { HappyIntegrationTab } from './HappyIntegrationTab';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';
import { toastService } from '../ui/toastService';

type BankTab = 'c6' | 'facta' | 'bmg' | 'happy' | 'outros' | 'daycoval';

interface BankMeta {
  id: BankTab;
  name: string;
  code: string;
  tagline: string;
  status: 'active' | 'configured' | 'pending' | 'coming_soon';
  products: string[];
}

const BANKS_META: BankMeta[] = [
  { id: 'daycoval', name: 'PORT + REFIN · Planilhas', code: 'XLS', tagline: 'Simulador por planilha', status: 'configured', products: ['INSS Portabilidade + Refinanciamento'] },
  {
    id: 'c6',
    name: 'C6 Bank',
    code: '336',
    tagline: 'API REST Oficial — Consulta Multiproduto (Portabilidade, Consignado, FGTS & Cartão)',
    status: 'active',
    products: [
      'Portabilidade de Crédito Consignado',
      'Empréstimo Consignado INSS / Servidores',
      'Antecipação Saque-Aniversário FGTS',
      'Cartão de Crédito Consignado / Benefício',
    ],
  },
  {
    id: 'facta',
    name: 'FACTA Financeira',
    code: '149',
    tagline: 'API REST / Esteira Digital — Consulta de Andamento de Propostas & Robô de Sincronização',
    status: 'active',
    products: [
      'FGTS Digital / Antecipação Saque-Aniversário',
      'Empréstimo Consignado INSS / Conveniados',
      'Portabilidade de Crédito Consignado',
    ],
  },
  {
    id: 'bmg',
    name: 'Banco BMG',
    code: '318',
    tagline: 'API BMG Consig & Cartão Benefício',
    status: 'coming_soon',
    products: ['Cartão de Crédito Consignado', 'Cartão Benefício', 'Empréstimo'],
  },
  {
    id: 'happy',
    name: 'Happy / BYX Capital',
    code: 'HAPPY',
    tagline: 'API REST & Webhooks em Tempo Real — Acompanhamento de Propostas e Formalização',
    status: 'active',
    products: [
      'Crédito Consignado INSS / Servidores',
      'Portabilidade de Crédito Consignado',
      'Refinanciamento de Portabilidade',
      'Webhooks de Atualização em Tempo Real',
    ],
  },
  {
    id: 'outros',
    name: 'Outros Bancos',
    code: 'EXP',
    tagline: 'Arquitetura Modular para Expansão Futura',
    status: 'coming_soon',
    products: ['Banco Pan', 'Daycoval', 'Safra', 'Master'],
  },
];

/**
 * Utilitário seguro para requisições de API no frontend:
 * - Inspeciona status HTTP
 * - Inspeciona Content-Type antes de parse
 * - Detecta se o servidor retornou HTML (<!DOCTYPE) e evita erro de sintaxe
 * - Retorna mensagens claras e estruturadas
 */
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
      throw new Error(
        `Rota da API não encontrada (HTTP 404 em ${url}). O servidor não possui este endpoint registrado.`
      );
    }
    if (res.status === 401 || res.status === 403 || res.status === 302) {
      throw new Error(
        `Sessão de usuário expirada ou não autorizada (HTTP ${res.status}). Recarregue a página ou renove a autenticação.`
      );
    }
    throw new Error(
      `O servidor retornou uma página HTML inesperada (HTTP ${res.status}). Verifique a rota da API ou a conectividade.`
    );
  }

  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `O servidor retornou uma resposta com formato inválido (HTTP ${res.status}).`
    );
  }

  return { ok: res.ok, status: res.status, data };
}

export interface BankIntegrationsViewProps {
  initialTab?: BankTab;
}

export const BankIntegrationsView: React.FC<BankIntegrationsViewProps> = ({ initialTab = 'c6' }) => {
  const [activeTab, setActiveTab] = useState<BankTab>(initialTab);
  const activeUser = StorageService.getActiveUser();
  const canSync = hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.sync') || hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
  const canDiagnose = hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.diagnose') || hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
  const canManageConfig = ['PLATFORM_MASTER', 'MASTER', 'ADMIN', 'GESTOR'].includes(activeUser?.role || '') || hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // --- Estado do C6 Bank ---
  const [c6Config, setC6Config] = useState<C6ConfigState>({
    username: '',
    baseUrl: 'https://marketplace-proposal-service-api-p.c6bank.info',
    autoSyncEnabled: false,
    syncIntervalMinutes: 15,
    isConfigured: false,
    hasPassword: false,
  });

  const [c6Password, setC6Password] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const [workerStatus, setWorkerStatus] = useState<C6WorkerStatusState | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    responseTimeMs?: number;
  } | null>(null);

  const [isTriggeringSync, setIsTriggeringSync] = useState(false);
  const [batchSyncResult, setBatchSyncResult] = useState<string | null>(null);

  const [recentLogs, setRecentLogs] = useState<C6SyncHistoryItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // --- Estado da FACTA Financeira ---
  const [factaConfig, setFactaConfig] = useState<FactaConfigState>({
    environment: 'homologation',
    username: '',
    baseUrl: 'https://desenvolvimento.facta.com.br/sistemaPropostas/api',
    autoSyncEnabled: false,
    syncIntervalMinutes: 15,
    pageSize: 50,
    dateQueryType: 'data_movimento',
    consultaSub: 'N',
    isConfigured: false,
    hasPassword: false,
  });

  const [factaPassword, setFactaPassword] = useState('');
  const [showFactaPassword, setShowFactaPassword] = useState(false);
  const [isLoadingFactaConfig, setIsLoadingFactaConfig] = useState(false);
  const [isSavingFactaConfig, setIsSavingFactaConfig] = useState(false);
  const [factaSaveSuccessMsg, setFactaSaveSuccessMsg] = useState<string | null>(null);

  const [factaWorkerStatus, setFactaWorkerStatus] = useState<FactaWorkerStatusState | null>(null);
  const [isLoadingFactaStatus, setIsLoadingFactaStatus] = useState(false);

  const [isTestingFacta, setIsTestingFacta] = useState(false);
  const [factaTestResult, setFactaTestResult] = useState<{
    success: boolean;
    message: string;
    responseTimeMs?: number;
    isHomologation?: boolean;
  } | null>(null);

  const [isTriggeringFactaSync, setIsTriggeringFactaSync] = useState(false);
  const [factaBatchSyncResult, setFactaBatchSyncResult] = useState<string | null>(null);

  const [factaRecentLogs, setFactaRecentLogs] = useState<FactaSyncHistoryItem[]>([]);
  const [isLoadingFactaLogs, setIsLoadingFactaLogs] = useState(false);

  // Busca configurações e status do C6
  const fetchC6ConfigAndStatus = async () => {
    setIsLoadingConfig(true);
    setIsLoadingStatus(true);
    try {
      const [cfgRes, statusRes] = await Promise.all([
        safeFetchJson<C6ConfigState>('/api/integrations/c6/config'),
        safeFetchJson<C6WorkerStatusState>('/api/integrations/c6/status'),
      ]);

      if (cfgRes.ok) setC6Config(cfgRes.data);
      if (statusRes.ok) setWorkerStatus(statusRes.data);
    } catch (err: any) {
      console.error('[C6 CONFIG] Erro ao carregar configurações:', err);
    } finally {
      setIsLoadingConfig(false);
      setIsLoadingStatus(false);
    }
  };

  // Busca logs recentes de sincronização do C6
  const fetchC6Logs = async () => {
    setIsLoadingLogs(true);
    try {
      const { ok, data } = await safeFetchJson<C6SyncHistoryItem[]>('/api/integrations/c6/recent-logs?limit=15');
      if (ok && Array.isArray(data)) {
        setRecentLogs(data);
      }
    } catch (err) {
      console.error('[C6 LOGS] Erro ao carregar logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchC6ConfigAndStatus();
    fetchC6Logs();
    fetchFactaConfigAndStatus();
    fetchFactaLogs();
  }, []);

  // Busca configurações e status da FACTA
  const fetchFactaConfigAndStatus = async () => {
    setIsLoadingFactaConfig(true);
    setIsLoadingFactaStatus(true);
    try {
      const [cfgRes, statusRes] = await Promise.all([
        safeFetchJson<FactaConfigState>('/api/integrations/facta/config'),
        safeFetchJson<FactaWorkerStatusState>('/api/integrations/facta/status'),
      ]);

      if (cfgRes.ok) setFactaConfig(cfgRes.data);
      if (statusRes.ok) setFactaWorkerStatus(statusRes.data);
    } catch (err: any) {
      console.error('[FACTA CONFIG] Erro ao carregar configurações:', err);
    } finally {
      setIsLoadingFactaConfig(false);
      setIsLoadingFactaStatus(false);
    }
  };

  // Busca logs recentes de sincronização da FACTA
  const fetchFactaLogs = async () => {
    setIsLoadingFactaLogs(true);
    try {
      const { ok, data } = await safeFetchJson<FactaSyncHistoryItem[]>('/api/integrations/facta/recent-logs?limit=15');
      if (ok && Array.isArray(data)) {
        setFactaRecentLogs(data);
      }
    } catch (err) {
      console.error('[FACTA LOGS] Erro ao carregar logs:', err);
    } finally {
      setIsLoadingFactaLogs(false);
    }
  };

  // Salvar configurações FACTA
  const handleSaveFactaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingFactaConfig(true);
    setFactaSaveSuccessMsg(null);
    setFactaTestResult(null);

    try {
      const { ok, data } = await safeFetchJson('/api/integrations/facta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment: factaConfig.environment,
          username: factaConfig.username,
          password: factaPassword ? factaPassword : undefined,
          baseUrl: factaConfig.baseUrl,
          autoSyncEnabled: factaConfig.autoSyncEnabled,
          simulationEnabled: Boolean(factaConfig.simulationEnabled),
          syncIntervalMinutes: factaConfig.syncIntervalMinutes,
          pageSize: factaConfig.pageSize,
          dateQueryType: factaConfig.dateQueryType,
          convenio: factaConfig.convenio,
          averbador: factaConfig.averbador,
          codigoAf: factaConfig.codigoAf,
          consultaSub: factaConfig.consultaSub,
          codigoSub: factaConfig.codigoSub,
        }),
      });

      if (!ok) {
        throw new Error(data?.error || 'Falha ao salvar as configurações.');
      }

      setFactaSaveSuccessMsg('Configurações da FACTA Financeira salvas com sucesso!');
      setFactaPassword('');
      await fetchFactaConfigAndStatus();
    } catch (err: any) {
      toastService.error('Não foi possível salvar a FACTA', err.message || 'Falha ao salvar as configurações da FACTA Financeira.');
    } finally {
      setIsSavingFactaConfig(false);
    }
  };

  // Testar conexão FACTA
  const handleTestFactaConnection = async () => {
    setIsTestingFacta(true);
    setFactaTestResult(null);

    try {
      const payload: any = {};
      if (factaConfig.username?.trim()) payload.username = factaConfig.username.trim();
      if (factaPassword?.trim()) payload.password = factaPassword.trim();
      if (factaConfig.baseUrl?.trim()) payload.baseUrl = factaConfig.baseUrl.trim();

      const { ok, data } = await safeFetchJson('/api/integrations/facta/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
      });

      if (!ok) {
        setFactaTestResult({
          success: false,
          message: data?.error || data?.message || 'Falha ao testar conexão com a FACTA Financeira.',
        });
      } else {
        setFactaTestResult(data);
      }
    } catch (err: any) {
      setFactaTestResult({
        success: false,
        message: err.message || 'Falha de comunicação com a FACTA Financeira.',
      });
    } finally {
      setIsTestingFacta(false);
    }
  };

  // Disparar sincronização manual FACTA
  const handleRunFactaBatchSync = async () => {
    setIsTriggeringFactaSync(true);
    setFactaBatchSyncResult(null);

    try {
      const { ok, data } = await safeFetchJson('/api/integrations/facta/run-sync', {
        method: 'POST',
      });

      if (ok) {
        setFactaBatchSyncResult(data?.message || 'Sincronização FACTA em lote finalizada.');
        await fetchFactaConfigAndStatus();
        await fetchFactaLogs();
      } else {
        setFactaBatchSyncResult(data?.error || 'Falha ao sincronizar propostas FACTA em lote.');
      }
    } catch (err: any) {
      setFactaBatchSyncResult(err.message || 'Erro inesperado durante a sincronização FACTA.');
    } finally {
      setIsTriggeringFactaSync(false);
    }
  };

  // Salvar configurações C6
  const handleSaveC6Config = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setSaveSuccessMsg(null);
    setTestResult(null);

    try {
      const { ok, data } = await safeFetchJson('/api/integrations/c6/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: c6Config.username,
          promoterCode: c6Config.promoterCode,
          typistCode: c6Config.typistCode,
          certifiedAgentCpf: c6Config.certifiedAgentCpf,
          simulationEnabled: c6Config.simulationEnabled,
          password: c6Password ? c6Password : undefined,
          baseUrl: c6Config.baseUrl,
          autoSyncEnabled: c6Config.autoSyncEnabled,
          syncIntervalMinutes: c6Config.syncIntervalMinutes,
        }),
      });

      if (!ok) {
        throw new Error(data?.error || 'Falha ao salvar as configurações.');
      }

      setSaveSuccessMsg('Configurações do C6 Bank salvas com sucesso!');
      setC6Password('');
      await fetchC6ConfigAndStatus();
    } catch (err: any) {
      toastService.error('Não foi possível salvar o C6 Bank', err.message || 'Falha ao salvar as configurações do C6 Bank.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Testar conexão C6 Bank (executa via backend e valida resposta real)
  const handleTestC6Connection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // Passa as credenciais informadas no form se existirem, permitindo testar antes de salvar
      const payload: any = {};
      if (c6Config.username?.trim()) payload.username = c6Config.username.trim();
      if (c6Password?.trim()) payload.password = c6Password.trim();
      if (c6Config.baseUrl?.trim()) payload.baseUrl = c6Config.baseUrl.trim();

      const { ok, data } = await safeFetchJson('/api/integrations/c6/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
      });

      if (!ok) {
        setTestResult({
          success: false,
          message: data?.error || data?.message || 'Falha ao testar conexão com o C6 Bank.',
        });
      } else {
        setTestResult(data);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Falha de comunicação com o C6 Bank.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Disparar sincronização manual em lote
  const handleRunBatchSync = async () => {
    setIsTriggeringSync(true);
    setBatchSyncResult(null);

    try {
      const { ok, data } = await safeFetchJson('/api/integrations/c6/run-sync', {
        method: 'POST',
      });

      if (ok) {
        setBatchSyncResult(data?.message || 'Sincronização em lote finalizada.');
        await fetchC6ConfigAndStatus();
        await fetchC6Logs();
      } else {
        setBatchSyncResult(data?.error || 'Falha ao sincronizar propostas em lote.');
      }
    } catch (err: any) {
      setBatchSyncResult(err.message || 'Erro inesperado durante a sincronização.');
    } finally {
      setIsTriggeringSync(false);
    }
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleString('pt-BR');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs animate-in fade-in duration-150">
      {/* Cabeçalho da Central de Integrações */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-black shadow-md">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 dark:text-slate-100">
                Integração Bancos
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                APIs & Esteiras
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gerenciamento centralizado de conectividade, credenciais, robôs de background e esteiras de crédito.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              fetchC6ConfigAndStatus();
              fetchC6Logs();
              fetchFactaConfigAndStatus();
              fetchFactaLogs();
            }}
            disabled={isLoadingConfig || isLoadingFactaConfig}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingConfig || isLoadingFactaConfig ? 'animate-spin' : ''}`} />
            <span>Atualizar Painel</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas Gerais de Conectividade */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider">Bancos configurados</span>
            <Building2 className="h-4 w-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {[c6Config.isConfigured, factaConfig.isConfigured].filter(Boolean).length}
            </span>
            <span className="text-[11px] text-slate-500">de 2 integrações com configuração disponível</span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium block mt-1">
            C6: {c6Config.isConfigured ? 'configurado' : 'pendente'} · FACTA: {factaConfig.isConfigured ? 'configurada' : 'pendente'}
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider">Worker de Background</span>
            <Zap className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-base font-black ${c6Config.autoSyncEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
              {c6Config.autoSyncEnabled ? 'ATIVO' : 'DESATIVADO'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Ciclo a cada {c6Config.syncIntervalMinutes} minutos
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider">Propostas em Monitoramento</span>
            <Activity className="h-4 w-4 text-purple-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
              {workerStatus?.pendingProposalsCount ?? 0}
            </span>
            <span className="text-[11px] text-slate-500">em andamento</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Aguardando próxima varredura C6
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider">Autenticação & Segurança</span>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-black text-slate-900 dark:text-slate-100">
              access_token
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Header oficial C6 sem prefixo Bearer
          </span>
        </div>
      </div>

      {/* Navegação por Abas dos Bancos */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-px">
        {BANKS_META.map((b) => {
          const isActive = activeTab === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveTab(b.id)}
              className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                  {b.code}
                </span>
                <span>{b.name}</span>
              </div>

              {b.id === 'c6' ? (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {c6Config.isConfigured ? 'Ativo' : 'Pendente'}
                </span>
              ) : b.id === 'facta' ? (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold border ${
                  factaConfig.isConfigured
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                }`}>
                  {factaConfig.isConfigured ? 'Ativo' : 'Pendente'}
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  {b.id === 'daycoval' ? 'Planilha INSS' : b.id === 'bmg' ? 'Configurar' : 'Em breve'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* CONTEÚDO DA ABA ATIVA */}
      {canManageConfig && <SimulationBankOrderSettings />}
      {activeTab === 'daycoval' && <PortRefinWorkbookSettings />}

      {/* ABA C6 BANK: Integração Completa */}
      {activeTab === 'c6' && (
        <div className="space-y-6">
          {/* Banner de Identificação do C6 Bank */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-black text-white flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white text-black flex items-center justify-center font-black text-xl tracking-tighter shadow-md">
                C6
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black">Banco C6 S.A. (Código 336)</h2>
                  {c6Config.isConfigured ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Conectado & Habilitado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Credenciais Pendentes
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Integração oficial via API Marketplace Proposal Service — Consulta automática de esteira e formalização
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {canSync && <button
                type="button"
                onClick={handleRunBatchSync}
                disabled={isTriggeringSync || !c6Config.isConfigured}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                <Play className={`h-3.5 w-3.5 ${isTriggeringSync ? 'animate-spin' : ''}`} />
                <span>{isTriggeringSync ? 'Sincronizando...' : 'Sincronizar Lote Agora'}</span>
              </button>}
            </div>
          </div>

          {/* Grid de 2 Colunas: Worker / Status e Formulário de Credenciais */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna 1 & 2: Painel Operacional do Worker e Mapeamento de Status */}
            <div className="lg:col-span-2 space-y-6">
              {/* Card de Monitoramento do Worker */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        Robô Automático de Sincronização (Worker C6)
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Varre periodicamente as propostas em andamento do C6 Bank
                      </p>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    c6Config.autoSyncEnabled
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {c6Config.autoSyncEnabled ? 'Robô Ativo' : 'Robô Desativado'}
                  </span>
                </div>

                {/* Métricas do Worker */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800/70">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Sincronizador</span>
                    <span className={`font-black text-sm block mt-1 ${c6Config.autoSyncEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                      {c6Config.autoSyncEnabled ? 'ATIVO' : 'DESATIVADO'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      A cada {c6Config.syncIntervalMinutes} min
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800/70">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Propostas Pendentes</span>
                    <span className="font-black text-sm font-mono text-slate-900 dark:text-slate-100 block mt-1">
                      {workerStatus?.pendingProposalsCount ?? '0'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Aguardando ciclo
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800/70">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Última Execução</span>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block mt-1 truncate">
                      {workerStatus?.lastRunAt ? new Date(workerStatus.lastRunAt).toLocaleTimeString('pt-BR') : 'Nunca executou'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {workerStatus?.lastRunItemCount ? `${workerStatus.lastRunItemCount} consultadas` : 'Sem lote anterior'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800/70">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Falhas de Conexão</span>
                    <span className={`font-black text-sm font-mono block mt-1 ${workerStatus?.recentFailuresCount ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {workerStatus?.recentFailuresCount ?? 0}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Nas últimas 24 horas
                    </span>
                  </div>
                </div>

                {batchSyncResult && (
                  <div className="mt-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800 flex items-center gap-2">
                    <Info className="h-4 w-4 shrink-0 text-blue-600" />
                    <span>{batchSyncResult}</span>
                  </div>
                )}
              </div>

              {/* Mapeamento de Status da Esteira C6 */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <Activity className="h-4 w-4 text-purple-600" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Regras de Mapeamento C6 Bank → Status Interno Sentinel
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  Conforme documentação oficial, situações e atividades retornadas pela API C6 são convertidas preservando o status interno se desconhecido:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30">
                    <div className="font-bold text-slate-900 dark:text-slate-100">APROVADA / PAGA / LIBERADA</div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                      → Status: PAGO / CONCLUIDO
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Marca a data de pagamento e finaliza o ciclo de produção.
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30">
                    <div className="font-bold text-slate-900 dark:text-slate-100">PENDENCIA / FORMALIZAÇÃO PENDENTE</div>
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                      → Status: PENDENTE
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Exibe pendência documental ou assinatura do cliente pendente.
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30">
                    <div className="font-bold text-slate-900 dark:text-slate-100">CANCELADA / RECUSADA / REPROVADA</div>
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                      → Status: CANCELADO / REPROVADO
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Registra motivo do cancelamento e encerra o acompanhamento.
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30">
                    <div className="font-bold text-slate-900 dark:text-slate-100">AGUARDANDO MARGEM / CIP / RETORNO</div>
                    <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                      → Status: AGUARDAR RETORNO CIP / SALDO
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Atualiza o SLA de portabilidade e acompanha o saldo devedor.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna 3: Formulário de Credenciais e Teste Seguro */}
            <div className="space-y-6">
              {canManageConfig ? <form
                onSubmit={handleSaveC6Config}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4"
              >
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <Lock className="h-4 w-4 text-blue-600" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Credenciais C6 Bank
                  </h3>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Usuário C6 Bank (username) *
                  </label>
                  <input
                    type="text"
                    required
                    value={c6Config.username}
                    onChange={(e) => setC6Config({ ...c6Config, username: e.target.value })}
                    placeholder="Ex: usuario_parceiro"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Senha C6 Bank (password) {c6Config.hasPassword ? '(Cadastrada)' : '*'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={c6Password}
                      onChange={(e) => setC6Password(e.target.value)}
                      placeholder={c6Config.hasPassword ? '•••••••• (Preencha para alterar)' : 'Digite a senha do C6'}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    As credenciais são armazenadas de forma segura e protegidas no servidor.
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    URL da API C6
                  </label>
                  <input
                    type="url"
                    required
                    value={c6Config.baseUrl}
                    onChange={(e) => setC6Config({ ...c6Config, baseUrl: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                    Endpoint oficial: POST /auth/token & GET /marketplace/proposal
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {([['promoterCode', 'Código da promotora C6'], ['typistCode', 'Código do digitador C6'], ['certifiedAgentCpf', 'CPF do agente certificado']] as const).map(([key, label]) => <label key={key} className="text-xs font-semibold">{label}<input value={c6Config[key] || ''} onChange={event => setC6Config({ ...c6Config, [key]: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800" /></label>)}
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={!!c6Config.simulationEnabled} onChange={event => setC6Config({ ...c6Config, simulationEnabled: event.target.checked })} />Habilitar C6 nas simulações INSS</label>
                <p className="text-xs text-slate-500">Preencha os dados da empresa atual. A simulação requer código de promotora e renda mensal do cliente; digitador e agente certificado serão usados na inclusão de propostas.</p>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="c6AutoSyncToggle"
                      checked={c6Config.autoSyncEnabled}
                      onChange={(e) => setC6Config({ ...c6Config, autoSyncEnabled: e.target.checked })}
                      className="h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="c6AutoSyncToggle" className="cursor-pointer font-bold text-slate-900 dark:text-slate-100">
                      Consulta Periódica em Background
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Intervalo (Minutos)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={c6Config.syncIntervalMinutes}
                      onChange={(e) => setC6Config({ ...c6Config, syncIntervalMinutes: parseInt(e.target.value, 10) || 15 })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    type="submit"
                    disabled={isSavingConfig}
                    className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isSavingConfig ? 'Salvando Configurações...' : 'Salvar Configurações'}
                  </button>

                  {canDiagnose && <button
                    type="button"
                    onClick={handleTestC6Connection}
                    disabled={isTesting || !c6Config.username}
                    className="w-full py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Server className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testando Conexão...' : 'Testar Conexão com C6'}</span>
                  </button>}
                </div>

                {saveSuccessMsg && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{saveSuccessMsg}</span>
                  </div>
                )}

                {testResult && (
                  <div
                    className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                      testResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                    )}
                    <div>
                      <span className="font-bold block">
                        {testResult.success ? 'Conexão Estabelecida!' : 'Falha na Conexão'}
                      </span>
                      <span className="text-[11px]">{testResult.message}</span>
                      {testResult.responseTimeMs !== undefined && (
                        <span className="text-[10px] block opacity-75 mt-0.5">
                          Tempo de resposta: {testResult.responseTimeMs}ms
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </form> : <div className="p-5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Você pode consultar o status da integração, mas não tem permissão para alterar credenciais ou configurações.</div>}
            </div>
          </div>

          {/* Histórico e Auditoria C6 */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Últimas Consultas e Auditoria C6 Bank
                </h3>
              </div>
              <button
                type="button"
                onClick={fetchC6Logs}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
              >
                Atualizar logs
              </button>
            </div>

            {isLoadingLogs ? (
              <div className="py-8 text-center text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-1 text-blue-500" />
                <span>Carregando logs de auditoria...</span>
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">
                Nenhuma consulta ao C6 Bank registrada recentemente no sistema.
              </div>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Data / Hora</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Nº Proposta C6</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Situação C6</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Atividade Esteira</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Status Interno</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Executor</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recentLogs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatDateTime(item.queryDate)}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {item.c6ProposalNumber}
                        </td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium">
                          {item.currentRawSituation || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={item.currentActivity || ''}>
                          {item.currentActivity || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {item.currentInternalStatus || '—'}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {item.queriedBy === 'AUTO_WORKER' ? 'Robô Automático' : 'Manual'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {item.success ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Sucesso
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400" title={item.technicalError || ''}>
                              <AlertTriangle className="h-3 w-3" /> Falha
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA FACTA FINANCEIRA */}
      {activeTab === 'facta' && (
        <div className="space-y-6">
          {/* Banner de Identificação da FACTA Financeira */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-900 via-orange-800 to-slate-900 text-white flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white text-orange-600 flex items-center justify-center font-black text-xl tracking-tighter shadow-md">
                FAC
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black">FACTA Financeira (Código 149)</h2>
                  {factaConfig.isConfigured ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Conectado & Habilitado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Credenciais Pendentes
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-200 border border-orange-500/30">
                    Ambiente: {factaConfig.environment === 'production' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}
                  </span>
                </div>
                <p className="text-xs text-orange-100/80 mt-0.5">
                  Integração via API /proposta/andamento-propostas — Autenticação de Corban e Sincronização de Esteira
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {canSync && <button
                type="button"
                onClick={handleRunFactaBatchSync}
                disabled={isTriggeringFactaSync || !factaConfig.isConfigured}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                <Play className={`h-3.5 w-3.5 ${isTriggeringFactaSync ? 'animate-spin' : ''}`} />
                <span>{isTriggeringFactaSync ? 'Sincronizando...' : 'Sincronizar Lote Agora'}</span>
              </button>}
            </div>
          </div>

          {/* Grid de 2 Colunas: Status do Worker & Formulário de Credenciais */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna Esquerda: Worker Status & Mapeamento */}
            <div className="space-y-6 lg:col-span-1">
              {/* Card de Status do Worker FACTA */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-500" />
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Robô Automático de Sincronização (Worker FACTA)
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-400">Varredura automática</span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Varre periodicamente o andamento de propostas da FACTA e atualiza o status interno do Sentinel Consig.
                </p>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Estado do Robô</span>
                    <span className={`font-bold flex items-center gap-1 ${
                      factaConfig.autoSyncEnabled
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}>
                      <div className={`h-2 w-2 rounded-full ${
                        factaConfig.autoSyncEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                      }`} />
                      {factaConfig.autoSyncEnabled ? 'Ativo (Rodando)' : 'Desativado'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Intervalo de Busca</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {factaConfig.syncIntervalMinutes} minutos
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Propostas Pendentes</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {factaWorkerStatus?.pendingProposalsCount ?? 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Última Execução</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {formatDateTime(factaWorkerStatus?.lastRunAt)}
                    </span>
                  </div>
                </div>

                {factaBatchSyncResult && (
                  <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200 border border-orange-200 dark:border-orange-800 text-xs">
                    <span className="font-bold block mb-0.5">Resultado da Varredura:</span>
                    <span>{factaBatchSyncResult}</span>
                  </div>
                )}
              </div>

              {/* Mapeamento de Status FACTA */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <ShieldCheck className="h-4 w-4 text-orange-600" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Regras de Mapeamento FACTA → Status Interno
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Conforme regras da FACTA, o status e o crivo são convertidos preservando a integridade dos registros:
                </p>

                <div className="space-y-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-mono">
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 flex justify-between">
                    <span>Aprovado / Pago</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">PAGA / LIQUIDADA</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 flex justify-between">
                    <span>Reprovado / Recusado / Cancelado</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">REPROVADA</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 flex justify-between">
                    <span>Aguardando Digitação / Assinatura</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">AGUARDAR FORMALIZAÇÃO</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 flex justify-between">
                    <span>Em Análise / Pendente</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">EM ANÁLISE CORBAN</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna Direita: Formulário de Credenciais e Configurações */}
            <div className="lg:col-span-2">
              {canManageConfig ? <form onSubmit={handleSaveFactaConfig} className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-orange-600" />
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Credenciais e Parâmetros FACTA Financeira
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {factaConfig.hasPassword ? '✓ Senha cadastrada no cofre' : '⚠️ Senha não informada'}
                  </span>
                </div>

                {factaSaveSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{factaSaveSuccessMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Ambiente */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Ambiente da API *
                    </label>
                    <select
                      value={factaConfig.environment}
                      onChange={(e) => {
                        const env = e.target.value as 'homologation' | 'production';
                        const defaultUrl = env === 'production'
                          ? 'https://proposta.facta.com.br/sistemaPropostas/api'
                          : 'https://desenvolvimento.facta.com.br/sistemaPropostas/api';
                        setFactaConfig({ ...factaConfig, environment: env, baseUrl: defaultUrl });
                      }}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-medium text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden cursor-pointer"
                    >
                      <option value="homologation">Homologação (desenvolvimento.facta.com.br)</option>
                      <option value="production">Produção (proposta.facta.com.br)</option>
                    </select>
                  </div>

                  {/* Usuário */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Usuário Corban FACTA (username) *
                    </label>
                    <input
                      type="text"
                      required
                      value={factaConfig.username}
                      onChange={(e) => setFactaConfig({ ...factaConfig, username: e.target.value })}
                      placeholder="Ex: CORBAN_SUL"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Senha */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Senha FACTA (password) {factaConfig.hasPassword ? '(Cadastrada)' : '*'}
                    </label>
                    <div className="relative">
                      <input
                        type={showFactaPassword ? 'text' : 'password'}
                        value={factaPassword}
                        onChange={(e) => setFactaPassword(e.target.value)}
                        placeholder={factaConfig.hasPassword ? '•••••••• (Preencha para alterar)' : 'Digite a senha da FACTA'}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowFactaPassword(!showFactaPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showFactaPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Tipo de Filtro por Data */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Filtro Temporal de Busca
                    </label>
                    <select
                      value={factaConfig.dateQueryType || 'data_movimento'}
                      onChange={(e) => setFactaConfig({ ...factaConfig, dateQueryType: e.target.value as any })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-medium text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden cursor-pointer"
                    >
                      <option value="data_movimento">Data de Movimento (Recomendado)</option>
                      <option value="data_alteracao">Data de Alteração da Esteira</option>
                    </select>
                  </div>

                  {/* URL Base */}
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      URL Base da API FACTA
                    </label>
                    <input
                      type="url"
                      required
                      value={factaConfig.baseUrl}
                      onChange={(e) => setFactaConfig({ ...factaConfig, baseUrl: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Parâmetros Opcionais FACTA */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Convênio (Opcional)
                    </label>
                    <input
                      type="text"
                      value={factaConfig.convenio || ''}
                      onChange={(e) => setFactaConfig({ ...factaConfig, convenio: e.target.value })}
                      placeholder="Ex: INSS"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Código AF Padrão (Opcional)
                    </label>
                    <input
                      type="text"
                      value={factaConfig.codigoAf || ''}
                      onChange={(e) => setFactaConfig({ ...factaConfig, codigoAf: e.target.value })}
                      placeholder="Ex: 12345"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Opções de Automação */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                    <input type="checkbox" checked={Boolean(factaConfig.simulationEnabled)} onChange={e => setFactaConfig({ ...factaConfig, simulationEnabled: e.target.checked })} />
                    <span><strong className="block">Habilitar nas simulações</strong><span className="text-xs text-slate-500">Consultar condições de INSS, CLT e FGTS junto às demais integrações.</span></span>
                  </label>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/80 dark:border-orange-900/60">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">
                        Ativar Varredura Automática (Background Worker)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        O robô consulta a FACTA periodicamente sem intervenção humana.
                      </span>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={factaConfig.autoSyncEnabled}
                        onChange={(e) => setFactaConfig({ ...factaConfig, autoSyncEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-orange-600"></div>
                    </label>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Intervalo entre Varreduras (Minutos)
                    </label>
                    <select
                      value={factaConfig.syncIntervalMinutes}
                      onChange={(e) => setFactaConfig({ ...factaConfig, syncIntervalMinutes: parseInt(e.target.value, 10) || 15 })}
                      className="w-full sm:w-64 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-medium text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden cursor-pointer"
                    >
                      <option value={5}>A cada 5 minutos</option>
                      <option value={10}>A cada 10 minutos</option>
                      <option value={15}>A cada 15 minutos (Padrão)</option>
                      <option value={30}>A cada 30 minutos</option>
                      <option value={60}>A cada 60 minutos (1 hora)</option>
                    </select>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  {canDiagnose && <button
                    type="button"
                    onClick={handleTestFactaConnection}
                    disabled={isTestingFacta}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-orange-600 ${isTestingFacta ? 'animate-spin' : ''}`} />
                    <span>{isTestingFacta ? 'Testando Conexão...' : 'Testar Conexão com FACTA'}</span>
                  </button>}

                  <button
                    type="submit"
                    disabled={isSavingFactaConfig}
                    className="flex items-center gap-1.5 px-6 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isSavingFactaConfig ? 'Salvando...' : 'Salvar Configurações FACTA'}</span>
                  </button>
                </div>

                {/* Resultado do Teste de Conexão */}
                {factaTestResult && (
                  <div
                    className={`p-3.5 rounded-xl text-xs border flex items-start gap-2.5 animate-in fade-in duration-150 ${
                      factaTestResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    {factaTestResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-bold block text-sm">
                        {factaTestResult.success ? 'Conexão Estabelecida com Sucesso!' : 'Falha na Conexão com a FACTA'}
                      </span>
                      <span className="block mt-0.5">{factaTestResult.message}</span>
                      {factaTestResult.responseTimeMs && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1 font-mono">
                          Tempo de resposta do endpoint /gera-token: {factaTestResult.responseTimeMs} ms
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </form> : <div className="p-5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Você pode consultar o status da integração, mas não tem permissão para alterar credenciais ou configurações.</div>}
            </div>
          </div>

          {/* Histórico e Auditoria FACTA */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-orange-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Últimas Consultas e Auditoria FACTA Financeira
                </h3>
              </div>
              <button
                type="button"
                onClick={fetchFactaLogs}
                className="text-xs text-orange-600 dark:text-orange-400 font-semibold hover:underline cursor-pointer"
              >
                Atualizar logs
              </button>
            </div>

            {isLoadingFactaLogs ? (
              <div className="py-8 text-center text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-1 text-orange-500" />
                <span>Carregando logs de auditoria FACTA...</span>
              </div>
            ) : factaRecentLogs.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">
                Nenhuma consulta à FACTA Financeira registrada recentemente no sistema.
              </div>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Data / Hora</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Código AF</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Nº Proposta FACTA</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Status Proposta</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Status Crivo</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Status Interno</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Executor</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {factaRecentLogs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatDateTime(item.queryDate)}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {item.factaAfCode || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200">
                          {item.factaProposalNumber || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium">
                          {item.currentRawStatus || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                          {item.currentCrivoStatus || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {item.currentInternalStatus || '—'}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {item.queriedBy === 'AUTO_WORKER' ? 'Robô Automático' : 'Manual'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {item.success ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Sucesso
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400" title={item.technicalError || ''}>
                              <AlertTriangle className="h-3 w-3" /> Falha
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'bmg' && <BmgIntegrationTab canManage={canManageConfig} />}

      {/* ABA HAPPY / BYX CAPITAL */}
      {activeTab === 'happy' && <HappyIntegrationTab />}

      {/* ABA OUTROS BANCOS / EXPANSÃO */}
      {activeTab === 'outros' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center font-bold text-2xl">
            <Layers className="h-7 w-7" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Expansão Modular de Bancos
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                Preparado para Novas APIs
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A arquitetura do Sentinel Consig foi desenhada com isolamento multi-tenant e adaptadores independentes para cada instituição bancária.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl mx-auto mt-4 text-left">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">Banco Pan</span>
              <span className="text-[10px] text-slate-400">Código 623 • Em homologação</span>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">Banco Daycoval</span>
              <span className="text-[10px] text-slate-400">Código 707 • Em homologação</span>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">Banco Safra</span>
              <span className="text-[10px] text-slate-400">Código 422 • Em homologação</span>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">Banco Master</span>
              <span className="text-[10px] text-slate-400">Código 243 • Em homologação</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
