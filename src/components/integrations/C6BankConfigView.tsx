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
} from 'lucide-react';
import { C6ConfigState, C6WorkerStatusState, C6SyncHistoryItem } from '../../types';

export const C6BankConfigView: React.FC = () => {
  const [config, setConfig] = useState<C6ConfigState>({
    username: '',
    baseUrl: 'https://marketplace-proposal-service-api-p.c6bank.info',
    autoSyncEnabled: false,
    syncIntervalMinutes: 15,
    isConfigured: false,
    hasPassword: false,
  });

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const [recentLogs, setRecentLogs] = useState<C6SyncHistoryItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchConfigAndStatus = async () => {
    setIsLoadingConfig(true);
    setIsLoadingStatus(true);
    try {
      const [cfgRes, statusRes] = await Promise.all([
        fetch('/api/integrations/c6/config'),
        fetch('/api/integrations/c6/status'),
      ]);

      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        setConfig(cfgData);
      }

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setWorkerStatus(statusData);
      }
    } catch (err) {
      console.error('[C6 CONFIG] Erro ao carregar:', err);
    } finally {
      setIsLoadingConfig(false);
      setIsLoadingStatus(false);
    }
  };

  const fetchRecentLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/integrations/c6/recent-logs?limit=15');
      if (res.ok) {
        const data = await res.json();
        setRecentLogs(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('[C6 LOGS] Erro ao carregar logs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchConfigAndStatus();
    fetchRecentLogs();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccessMsg(null);
    setTestResult(null);

    try {
      const res = await fetch('/api/integrations/c6/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: config.username,
          password: password ? password : undefined,
          baseUrl: config.baseUrl,
          autoSyncEnabled: config.autoSyncEnabled,
          syncIntervalMinutes: config.syncIntervalMinutes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');

      setSaveSuccessMsg('Configurações da integração C6 Bank salvas com sucesso!');
      setPassword('');
      await fetchConfigAndStatus();
    } catch (err: any) {
      alert(err.message || 'Falha ao salvar configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/integrations/c6/test-connection', {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Falha de comunicação com o C6 Bank.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRunBatchSync = async () => {
    setIsTriggeringSync(true);
    setBatchSyncResult(null);

    try {
      const res = await fetch('/api/integrations/c6/run-sync', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setBatchSyncResult(data.message || 'Sincronização em lote finalizada.');
        await fetchConfigAndStatus();
        await fetchRecentLogs();
      } else {
        setBatchSyncResult(data.error || 'Falha ao sincronizar propostas em lote.');
      }
    } catch (err: any) {
      setBatchSyncResult(err.message || 'Erro inesperado.');
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
    <div className="p-6 space-y-6 max-w-6xl mx-auto text-xs animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-black text-white flex items-center justify-center font-black text-base tracking-tighter shadow-md">
            C6
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 dark:text-slate-100">
                Integração C6 Bank — Consulta de Status
              </h1>
              {config.isConfigured ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Operacional
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Não configurado
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sincronização automática e em tempo real das esteiras de crédito FGTS e Consignado do Banco C6
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchConfigAndStatus}
            disabled={isLoadingConfig}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingConfig ? 'animate-spin' : ''}`} />
            <span>Atualizar Painel</span>
          </button>
        </div>
      </div>

      {/* Grid de 2 Colunas: Status do Worker & Credenciais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1 & 2: Status do Robô Automático + Mapeamento de Status */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card de Monitoramento do Worker */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Robô Automático de Sincronização (Worker C6)
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Varre periodicamente propostas em andamento sem intervenção manual
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRunBatchSync}
                disabled={isTriggeringSync || !config.isConfigured}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                <Play className={`h-3.5 w-3.5 ${isTriggeringSync ? 'animate-spin' : ''}`} />
                <span>{isTriggeringSync ? 'Processando Lote...' : 'Sincronizar Lote Agora'}</span>
              </button>
            </div>

            {/* Métricas do Worker */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800/70">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Sincronizador</span>
                <span className={`font-black text-sm block mt-1 ${config.autoSyncEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                  {config.autoSyncEnabled ? 'ATIVO' : 'DESATIVADO'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  A cada {config.syncIntervalMinutes} min
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
              <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Regras de Mapeamento C6 Bank → Status Interno Sentinel
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Conforme as diretrizes oficiais do manual de integração, as situações e atividades retornadas pelo C6 Bank são convertidas automaticamente:
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

        {/* Coluna 3: Formulário de Credenciais e Conexão Segura */}
        <div className="space-y-6">
          <form onSubmit={handleSaveConfig} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Lock className="h-4 w-4 text-blue-600" />
              <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Credenciais C6 Bank
              </h2>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                Usuário C6 Bank (username) *
              </label>
              <input
                type="text"
                required
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="Ex: usuario_parceiro"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                Senha C6 Bank (password) {config.hasPassword ? '(Cadastrada)' : '*'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={config.hasPassword ? '•••••••• (Preencha para alterar)' : 'Digite a senha do C6'}
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
                value={config.baseUrl}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="autoSyncViewToggle"
                  checked={config.autoSyncEnabled}
                  onChange={(e) => setConfig({ ...config, autoSyncEnabled: e.target.checked })}
                  className="h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="autoSyncViewToggle" className="cursor-pointer font-bold text-slate-900 dark:text-slate-100">
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
                  value={config.syncIntervalMinutes}
                  onChange={(e) => setConfig({ ...config, syncIntervalMinutes: parseInt(e.target.value, 10) || 15 })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 transition-all cursor-pointer"
              >
                {isSaving ? 'Salvando Configurações...' : 'Salvar Configurações'}
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !config.username}
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
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Histórico Geral de Consultas do C6 Bank */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-blue-600" />
            <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Últimas Consultas e Auditoria C6 Bank
            </h2>
          </div>
          <button
            type="button"
            onClick={fetchRecentLogs}
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
  );
};
