import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  RefreshCw,
  Play,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  Server,
  Zap,
} from 'lucide-react';
import { C6ConfigState, C6WorkerStatusState } from '../../types';

interface C6BankConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const C6BankConfigModal: React.FC<C6BankConfigModalProps> = ({
  isOpen,
  onClose,
}) => {
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
      console.error('[C6 CONFIG] Erro ao carregar configurações:', err);
    } finally {
      setIsLoadingConfig(false);
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConfigAndStatus();
      setTestResult(null);
      setBatchSyncResult(null);
      setSaveSuccessMsg(null);
      setPassword('');
    }
  }, [isOpen]);

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

      setSaveSuccessMsg('Configurações salvas com sucesso!');
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
        message: err.message || 'Falha ao conectar com o C6 Bank.',
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
      } else {
        setBatchSyncResult(data.error || 'Falha ao disparar sincronização em lote.');
      }
    } catch (err: any) {
      setBatchSyncResult(err.message || 'Erro inesperado.');
    } finally {
      setIsTriggeringSync(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-black text-white flex items-center justify-center font-black text-sm tracking-tighter shadow-xs">
              C6
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Integração C6 Bank
                {config.isConfigured ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    Configurado
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    Não configurado
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consulta automática e manual de status de propostas e esteira C6
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {isLoadingConfig ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
              <span>Carregando configurações do C6 Bank...</span>
            </div>
          ) : (
            <>
              {/* Card de Status Operacional do Worker */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-600" />
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      Status do Robô Automático (Background Worker)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunBatchSync}
                    disabled={isTriggeringSync || !config.isConfigured}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Play className={`h-3 w-3 ${isTriggeringSync ? 'animate-spin' : ''}`} />
                    <span>{isTriggeringSync ? 'Processando Lote...' : 'Sincronizar Lote Agora'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Sincronizador</span>
                    <span className={`font-bold ${config.autoSyncEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                      {config.autoSyncEnabled ? 'Ativo' : 'Desativado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Propostas Pendentes</span>
                    <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                      {workerStatus?.pendingProposalsCount ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Última Execução</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {workerStatus?.lastRunAt ? new Date(workerStatus.lastRunAt).toLocaleTimeString('pt-BR') : 'Nunca'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Falhas (24h)</span>
                    <span className={`font-bold font-mono ${workerStatus?.recentFailuresCount ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                      {workerStatus?.recentFailuresCount ?? 0}
                    </span>
                  </div>
                </div>

                {batchSyncResult && (
                  <div className="mt-3 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px]">
                    {batchSyncResult}
                  </div>
                )}
              </div>

              {/* Formulário de Configuração de Credenciais Seguras */}
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                  <Lock className="h-4 w-4 text-blue-600" />
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">
                    Credenciais e Parâmetros de Acesso
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Usuário C6 Bank (username) *
                    </label>
                    <input
                      type="text"
                      required
                      value={config.username}
                      onChange={(e) => setConfig({ ...config, username: e.target.value })}
                      placeholder="Ex: parceiro_sentinel"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Senha C6 Bank (password) {config.hasPassword ? '(Já cadastrada)' : '*'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={config.hasPassword ? '•••••••• (Preencha apenas para alterar)' : 'Digite a senha C6'}
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
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    URL Base da API (Marketplace Proposal Service)
                  </label>
                  <input
                    type="url"
                    required
                    value={config.baseUrl}
                    onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Padrão de produção: https://marketplace-proposal-service-api-p.c6bank.info
                  </span>
                </div>

                {/* Switch Auto-Sync e Intervalo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="autoSyncToggle"
                      checked={config.autoSyncEnabled}
                      onChange={(e) => setConfig({ ...config, autoSyncEnabled: e.target.checked })}
                      className="h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="autoSyncToggle" className="cursor-pointer">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">
                        Ativar Consulta Automática Periódica
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Varre e sincroniza propostas C6 em andamento em segundo plano.
                      </span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Intervalo de Consulta (minutos)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={config.syncIntervalMinutes}
                      onChange={(e) => setConfig({ ...config, syncIntervalMinutes: parseInt(e.target.value, 10) || 15 })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Mínimo recomendado: 15 minutos para evitar bloqueio por rate limit.
                    </span>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !config.username}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Server className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testando Conexão...' : 'Testar Conexão com C6'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Fechar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {isSaving ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Mensagem de Sucesso ao Salvar */}
              {saveSuccessMsg && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {/* Resultado do Teste de Conexão */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border flex items-start gap-2.5 ${
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
                      {testResult.success ? 'Conexão Bem-Sucedida!' : 'Falha no Teste de Conexão:'}
                    </span>
                    <span>{testResult.message}</span>
                    {testResult.responseTimeMs !== undefined && (
                      <span className="text-[10px] opacity-75 block mt-0.5">
                        Tempo de resposta: {testResult.responseTimeMs}ms
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
