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
          cltEnabled: config.cltEnabled,
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
      const payload: any = {};
      if (config.username?.trim()) payload.username = config.username.trim();
      if (password?.trim()) payload.password = password.trim();
      if (config.baseUrl?.trim()) payload.baseUrl = config.baseUrl.trim();

      const res = await fetch('/api/integrations/c6/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      const trimmed = text.trim();

      if (
        trimmed.startsWith('<!DOCTYPE') ||
        trimmed.startsWith('<html') ||
        trimmed.startsWith('<head') ||
        contentType.toLowerCase().includes('text/html')
      ) {
        if (res.status === 404) {
          throw new Error(
            `Rota da API não encontrada (HTTP 404 em /api/integrations/c6/test-connection). O servidor não possui este endpoint registrado.`
          );
        }
        if (res.status === 401 || res.status === 403 || res.status === 302) {
          throw new Error(
            `Sessão de usuário expirada ou não autorizada (HTTP ${res.status}). Recarregue a página ou renove a autenticação.`
          );
        }
        throw new Error(
          `O servidor retornou uma página HTML inesperada (HTTP ${res.status}). Verifique a rota da API ou a autenticação da sessão.`
        );
      }

      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Resposta com formato inválido recebida do servidor (HTTP ${res.status}).`);
      }

      if (!res.ok) {
        setTestResult({
          success: false,
          message: data?.error || data?.message || `Falha na requisição (HTTP ${res.status}).`,
        });
      } else {
        setTestResult(data);
      }
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
    <div className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] max-w-2xl w-full max-h-[90vh] flex flex-col  overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center font-black text-sm tracking-tighter shadow-xs">
              C6
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                Integração C6 Bank
                {config.isConfigured ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
                    Configurado
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
                    Não configurado
                  </span>
                )}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Consulta automática e manual de status de propostas e esteira C6
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {isLoadingConfig ? (
            <div className="py-12 text-center text-[var(--text-secondary)]">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-[var(--link)]" />
              <span>Carregando configurações do C6 Bank...</span>
            </div>
          ) : (
            <>
              {/* Card de Status Operacional do Worker */}
              <div className="p-4 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)]">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[var(--link)]" />
                    <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      Status do Robô Automático (Background Worker)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunBatchSync}
                    disabled={isTriggeringSync || !config.isConfigured}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs disabled:opacity-90 transition-all cursor-pointer"
                  >
                    <Play className={`h-3 w-3 ${isTriggeringSync ? 'animate-spin' : ''}`} />
                    <span>{isTriggeringSync ? 'Processando Lote...' : 'Sincronizar Lote Agora'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Sincronizador</span>
                    <span className={`font-bold ${config.autoSyncEnabled ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : 'text-[var(--text-secondary)]'}`}>
                      {config.autoSyncEnabled ? 'Ativo' : 'Desativado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Propostas Pendentes</span>
                    <span className="font-bold font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {workerStatus?.pendingProposalsCount ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Última Execução</span>
                    <span className="font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {workerStatus?.lastRunAt ? new Date(workerStatus.lastRunAt).toLocaleTimeString('pt-BR') : 'Nunca'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Falhas (24h)</span>
                    <span className={`font-bold font-mono ${workerStatus?.recentFailuresCount ? 'text-[var(--danger-text)]' : 'text-[var(--text-secondary)] dark:text-[var(--text-primary)]'}`}>
                      {workerStatus?.recentFailuresCount ?? 0}
                    </span>
                  </div>
                </div>

                {batchSyncResult && (
                  <div className="mt-3 p-2 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)] text-[11px]">
                    {batchSyncResult}
                  </div>
                )}
              </div>

              {/* Formulário de Configuração de Credenciais Seguras */}
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <Lock className="h-4 w-4 text-[var(--link)]" />
                  <h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Credenciais e Parâmetros de Acesso
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                      Usuário C6 Bank (username) *
                    </label>
                    <input
                      type="text"
                      required
                      value={config.username}
                      onChange={(e) => setConfig({ ...config, username: e.target.value })}
                      placeholder="Ex: parceiro_sentinel"
                      className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                      Senha C6 Bank (password) {config.hasPassword ? '(Já cadastrada)' : '*'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={config.hasPassword ? '•••••••• (Preencha apenas para alterar)' : 'Digite a senha C6'}
                        className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    URL Base da API (Marketplace Proposal Service)
                  </label>
                  <input
                    type="url"
                    required
                    value={config.baseUrl}
                    onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                    className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
                  />
                  <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 block">
                    Padrão de produção: https://marketplace-proposal-service-api-p.c6bank.info
                  </span>
                </div>

                <p className="text-sm text-[var(--text-secondary)]">C6 CLT temporariamente suspenso.</p>
                {/* Switch Auto-Sync e Intervalo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)]">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="autoSyncToggle"
                      checked={config.autoSyncEnabled}
                      onChange={(e) => setConfig({ ...config, autoSyncEnabled: e.target.checked })}
                      className="h-4 w-4 rounded-sm border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] cursor-pointer"
                    />
                    <label htmlFor="autoSyncToggle" className="cursor-pointer">
                      <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] block">
                        Ativar Consulta Automática Periódica
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        Varre e sincroniza propostas C6 em andamento em segundo plano.
                      </span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                      Intervalo de Consulta (minutos)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={config.syncIntervalMinutes}
                      onChange={(e) => setConfig({ ...config, syncIntervalMinutes: parseInt(e.target.value, 10) || 15 })}
                      className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
                    />
                    <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 block">
                      Mínimo recomendado: 15 minutos para evitar bloqueio por rate limit.
                    </span>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !config.username}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors disabled:opacity-90 cursor-pointer"
                  >
                    <Server className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testando Conexão...' : 'Testar Conexão com C6'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-semibold hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
                    >
                      Fechar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2 rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold  disabled:opacity-90 transition-all cursor-pointer"
                    >
                      {isSaving ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Mensagem de Sucesso ao Salvar */}
              {saveSuccessMsg && (
                <div className="p-3 rounded-lg bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)] flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-text)]" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {/* Resultado do Teste de Conexão */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                    testResult.success
                      ? 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border-[var(--success-border)] dark:border-[var(--success-border)]'
                      : 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border-[var(--danger-border)] dark:border-[var(--danger-border)]'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-text)] mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger-text)] mt-0.5" />
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
