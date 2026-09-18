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
  Building2,
  Plug,
  Layers,
  ChevronRight,
  Sparkles,
  Search,
} from 'lucide-react';
import { C6ConfigState, C6WorkerStatusState, C6SyncHistoryItem } from '../../types';

type BankTab = 'c6' | 'facta' | 'bmg' | 'happy' | 'outros';

interface BankMeta {
  id: BankTab;
  name: string;
  code: string;
  tagline: string;
  status: 'active' | 'configured' | 'pending' | 'coming_soon';
  products: string[];
}

const BANKS_META: BankMeta[] = [
  {
    id: 'c6',
    name: 'C6 Bank',
    code: '336',
    tagline: 'API REST Oficial — Consulta de Status FGTS & Consignado',
    status: 'active',
    products: ['Antecipação Saque-Aniversário FGTS', 'Consignado INSS / Servidores'],
  },
  {
    id: 'facta',
    name: 'FACTA Financeira',
    code: '149',
    tagline: 'Esteira Digital / Barramento Corban',
    status: 'coming_soon',
    products: ['FGTS Digital', 'Crédito Consignado'],
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
    name: 'Happy API',
    code: 'HAPPY',
    tagline: 'Hub de Distribuição e Esteiras Digitais',
    status: 'coming_soon',
    products: ['Hub Multibanco', 'Esteiras Digitais Integradas'],
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

export const BankIntegrationsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<BankTab>('c6');

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
  }, []);

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
      alert(err.message || 'Falha ao salvar configurações do C6 Bank.');
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
            }}
            disabled={isLoadingConfig}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingConfig ? 'animate-spin' : ''}`} />
            <span>Atualizar Painel</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas Gerais de Conectividade */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider">APIs Bancárias</span>
            <Building2 className="h-4 w-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100">1</span>
            <span className="text-[11px] text-slate-500">ativa / 4 em homologação</span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium block mt-1">
            C6 Bank operacional
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
              ) : (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Em breve
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* CONTEÚDO DA ABA ATIVA */}

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
              <button
                type="button"
                onClick={handleRunBatchSync}
                disabled={isTriggeringSync || !c6Config.isConfigured}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                <Play className={`h-3.5 w-3.5 ${isTriggeringSync ? 'animate-spin' : ''}`} />
                <span>{isTriggeringSync ? 'Sincronizando...' : 'Sincronizar Lote Agora'}</span>
              </button>
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
              <form
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

                  <button
                    type="button"
                    onClick={handleTestC6Connection}
                    disabled={isTesting || !c6Config.username}
                    className="w-full py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Server className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testando Conexão...' : 'Testar Conexão com C6'}</span>
                  </button>
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
              </form>
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center font-bold text-2xl">
            149
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                FACTA Financeira (Código 149)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                Não configurado / Em breve
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A integração oficial da esteira FACTA (FGTS Digital e Crédito Consignado) está em fase de homologação técnica.
            </p>
          </div>

          <div className="max-w-lg mx-auto p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-left space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Especificações Técnicas Futuras
            </span>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span>Autenticação via Token de Corban / Certificado Digital FACTA.</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span>Consulta de status de propostas de Antecipação Saque-Aniversário FGTS.</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span>Acompanhamento da formalização biométrica e assinatura digital.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ABA BANCO BMG */}
      {activeTab === 'bmg' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center font-bold text-2xl">
            318
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Banco BMG (Código 318)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
                Não configurado / Em breve
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Barramento de APIs BMG para esteira de crédito consignado, cartão de crédito consignado e cartão benefício.
            </p>
          </div>

          <div className="max-w-lg mx-auto p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-left space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Especificações Técnicas Futuras
            </span>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <span>Integração BMG Consig com credenciais dedicadas de parceiro.</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <span>Consulta de ADE, reserva de margem e esteira de emissão de cartão.</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <span>Isolamento total de credenciais e auditoria de consultas.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ABA HAPPY API */}
      {activeTab === 'happy' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-pink-50 dark:bg-pink-950/40 text-pink-600 flex items-center justify-center font-bold text-2xl">
            HP
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Happy API (Hub de Crédito)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 dark:bg-pink-950 text-pink-800 dark:text-pink-300 border border-pink-300 dark:border-pink-800">
                Não configurado / Em breve
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Conexão com a plataforma Happy para roteamento inteligente de esteiras digitais e correspondentes.
            </p>
          </div>

          <div className="max-w-lg mx-auto p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-left space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Especificações Técnicas Futuras
            </span>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-pink-500" />
                <span>Webhooks em tempo real para recebimento de atualizações de status.</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-pink-500" />
                <span>Consulta unificada para múltiplos parceiros bancários conveniados.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

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
