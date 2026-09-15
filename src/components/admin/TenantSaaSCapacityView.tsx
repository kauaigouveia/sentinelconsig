import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Users,
  FileSpreadsheet,
  Activity,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  HelpCircle,
  TrendingUp,
  Mail,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';

export const TenantSaaSCapacityView: React.FC = () => {
  const activeUser = StorageService.getActiveUser();
  const tenantId = StorageService.getCurrentTenantId();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // States for backend data
  const [usage, setUsage] = useState<{
    usersCount: number;
    proposalsCount: number;
    storageUsedMb: number;
  } | null>(null);

  const [limits, setLimits] = useState<{
    plan: string;
    maxUsers: number;
    storageLimitMb: number;
    proposalsLimit: number;
    usersStatus: string;
    usersPercent: number;
    storageStatus: string;
    storagePercent: number;
    proposalsStatus: string;
    proposalsPercent: number;
  } | null>(null);

  const [health, setHealth] = useState<{
    score: number;
    status: string;
    breakdown: {
      userCapacityMultiplier: number;
      storageCapacityMultiplier: number;
      activityMultiplier: number;
    };
  } | null>(null);

  const fetchData = useCallback(async () => {
    if (!tenantId) {
      setError('Identificador de empresa não encontrado.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('cg_session_token') || sessionStorage.getItem('cg_session_token');
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-session-id'] = token;
      }

      // Fetch usage, limits, and health from server
      const [usageRes, limitsRes, healthRes] = await Promise.all([
        fetch(`/api/saas/tenants/${tenantId}/usage`, { headers }),
        fetch(`/api/saas/tenants/${tenantId}/limits`, { headers }),
        fetch(`/api/saas/tenants/${tenantId}/health`, { headers }),
      ]);

      if (!usageRes.ok || !limitsRes.ok || !healthRes.ok) {
        throw new Error('Falha ao sincronizar dados de consumo do servidor.');
      }

      const usageData = await usageRes.json();
      const limitsData = await limitsRes.json();
      const healthData = await healthRes.json();

      setUsage(usageData);
      setLimits(limitsData);
      setHealth(healthData);
    } catch (err: any) {
      console.error('[SAAS_CAPACITY_FETCH]', err);
      setError(err?.message || 'Erro ao carregar dados operacionais de consumo do SaaS.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Status helper styling
  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case 'EXCEEDED':
        return {
          bg: 'bg-rose-100 dark:bg-rose-950/80',
          text: 'text-rose-700 dark:text-rose-300',
          border: 'border-rose-200 dark:border-rose-900',
          label: 'Cota Excedida',
        };
      case 'CRITICAL':
        return {
          bg: 'bg-orange-100 dark:bg-orange-950/80',
          text: 'text-orange-700 dark:text-orange-300',
          border: 'border-orange-200 dark:border-orange-900',
          label: 'Crítico',
        };
      case 'ALERT':
        return {
          bg: 'bg-amber-100 dark:bg-amber-950/80',
          text: 'text-amber-700 dark:text-amber-300',
          border: 'border-amber-200 dark:border-amber-900',
          label: 'Alerta',
        };
      case 'WARNING':
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-950/80',
          text: 'text-yellow-700 dark:text-yellow-300',
          border: 'border-yellow-200 dark:border-yellow-900',
          label: 'Atenção',
        };
      default:
        return {
          bg: 'bg-emerald-100 dark:bg-emerald-950/80',
          text: 'text-emerald-700 dark:text-emerald-300',
          border: 'border-emerald-200 dark:border-emerald-900',
          label: 'Normal',
        };
    }
  };

  const getHealthStatusStyles = (status: string) => {
    switch (status) {
      case 'CRITICAL':
      case 'RISK':
        return {
          bg: 'bg-rose-50 dark:bg-rose-950/50',
          text: 'text-rose-700 dark:text-rose-400',
          border: 'border-rose-200 dark:border-rose-900/60',
          barColor: 'bg-rose-500',
          description: 'Ação imediata recomendada. Saturação severa de recursos ou inatividade.',
        };
      case 'ATTENTION':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/50',
          text: 'text-amber-700 dark:text-amber-400',
          border: 'border-amber-200 dark:border-amber-900/60',
          barColor: 'bg-amber-500',
          description: 'Recursos se aproximando do limite contratado. Recomenda-se acompanhamento preventivo.',
        };
      default:
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-950/50',
          text: 'text-emerald-700 dark:text-emerald-400',
          border: 'border-emerald-200 dark:border-emerald-900/60',
          barColor: 'bg-emerald-500',
          description: 'Excelente saúde operacional. Capacidade e atividade perfeitamente equilibradas.',
        };
    }
  };

  const formatStorage = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sincronizando dados de capacidade do SaaS...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <h3 className="text-xs font-black uppercase tracking-wider">Falha de Autenticação / Conectividade</h3>
        </div>
        <p className="text-xs">{error}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 bg-white dark:bg-slate-800 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-700 text-[11px] font-bold text-rose-800 dark:text-rose-300 cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Tentar Novamente</span>
        </button>
      </div>
    );
  }

  const userStyles = getStatusBadgeStyles(limits?.usersStatus || 'NORMAL');
  const storageStyles = getStatusBadgeStyles(limits?.storageStatus || 'NORMAL');
  const proposalsStyles = getStatusBadgeStyles(limits?.proposalsStatus || 'NORMAL');
  const healthStyles = getHealthStatusStyles(health?.status || 'GOOD');

  const hasAlerts = limits?.usersPercent! >= 85 || limits?.storagePercent! >= 85 || limits?.proposalsPercent! >= 85;

  return (
    <div className="space-y-6">
      {/* Upper Status & Overview Card */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">Contrato SaaS Ativo</span>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">Plano {limits?.plan}</h2>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 uppercase">
              MASTER ACCESS
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-xl">
            Sua conta de administrador (MASTER) permite acompanhar as cotas contratadas de usuários ativos, propostas e armazenamento para garantir a estabilidade do seu White Label.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors shrink-0 w-fit"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Atualizar Consumo</span>
        </button>
      </div>

      {/* Warn box if near or above capacity limits */}
      {hasAlerts && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-200">
          <h3 className="text-xs font-bold flex items-center gap-2 mb-1.5">
            <AlertTriangle className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>ALERTA DE CAPACIDADE SaaS ATIVO</span>
          </h3>
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Sua operação está se aproximando ou ultrapassou os limites contratados do plano **{limits?.plan}**. Upgrade de vagas ou de espaço é recomendado para evitar o bloqueio preventivo de novas ações. Contate o suporte para negociar as cotas.
          </p>
        </div>
      )}

      {/* Main Grid: Resource Capacities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Vagas Usuários */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-3xs flex flex-col justify-between min-h-[220px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Users className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-black uppercase tracking-wider">Vagas de Usuários</h3>
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border uppercase ${userStyles.bg} ${userStyles.text} ${userStyles.border}`}>
                {userStyles.label}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-950 dark:text-slate-50">{usage?.usersCount}</span>
                <span className="text-xs font-bold text-slate-400">/ {limits?.maxUsers || 'ilimitados'}</span>
              </div>
              <p className="text-[11px] text-slate-500">Usuários atualmente cadastrados e ativos</p>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  limits?.usersPercent! >= 95
                    ? 'bg-rose-500'
                    : limits?.usersPercent! >= 85
                    ? 'bg-amber-500'
                    : limits?.usersPercent! >= 70
                    ? 'bg-yellow-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, limits?.usersPercent || 0)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
              <span>CONSUMIDO: {limits?.usersPercent}%</span>
              <span>RESTANTE: {Math.max(0, 100 - (limits?.usersPercent || 0))}%</span>
            </div>
          </div>
        </div>

        {/* Espaço de Armazenamento */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-3xs flex flex-col justify-between min-h-[220px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <HardDrive className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-black uppercase tracking-wider">Espaço Documental</h3>
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border uppercase ${storageStyles.bg} ${storageStyles.text} ${storageStyles.border}`}>
                {storageStyles.label}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-950 dark:text-slate-50">
                  {formatStorage(usage?.storageUsedMb || 0)}
                </span>
                <span className="text-xs font-bold text-slate-400">/ {formatStorage(limits?.storageLimitMb || 0)}</span>
              </div>
              <p className="text-[11px] text-slate-500">Documentos digitalizados e anexos das propostas</p>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  limits?.storagePercent! >= 95
                    ? 'bg-rose-500'
                    : limits?.storagePercent! >= 85
                    ? 'bg-amber-500'
                    : limits?.storagePercent! >= 70
                    ? 'bg-yellow-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, limits?.storagePercent || 0)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
              <span>CONSUMIDO: {limits?.storagePercent}%</span>
              <span>RESTANTE: {Math.max(0, 100 - (limits?.storagePercent || 0))}%</span>
            </div>
          </div>
        </div>

        {/* Cota de Propostas */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-3xs flex flex-col justify-between min-h-[220px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <FileSpreadsheet className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-black uppercase tracking-wider">Cota de Propostas</h3>
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border uppercase ${proposalsStyles.bg} ${proposalsStyles.text} ${proposalsStyles.border}`}>
                {proposalsStyles.label}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-950 dark:text-slate-50">{usage?.proposalsCount}</span>
                <span className="text-xs font-bold text-slate-400">/ {limits?.proposalsLimit || 'ilimitadas'}</span>
              </div>
              <p className="text-[11px] text-slate-500">Histórico de propostas migradas e digitadas</p>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  limits?.proposalsPercent! >= 95
                    ? 'bg-rose-500'
                    : limits?.proposalsPercent! >= 85
                    ? 'bg-amber-500'
                    : limits?.proposalsPercent! >= 70
                    ? 'bg-yellow-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, limits?.proposalsPercent || 0)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
              <span>CONSUMIDO: {limits?.proposalsPercent}%</span>
              <span>RESTANTE: {Math.max(0, 100 - (limits?.proposalsPercent || 0))}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Health Index and Contact Upgrading */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Health Score Panel */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-3xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Índice de Saúde Operacional (SaaS THS)
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <span title="Fórmula baseada no balanceamento entre cota e atividade real" className="cursor-help">
                <HelpCircle className="h-4 w-4 text-slate-400" />
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative flex items-center justify-center h-28 w-28 shrink-0">
              {/* Simplified circular progress rendering via background gradient or layout */}
              <div className="absolute inset-0 rounded-full border-8 border-slate-100 dark:border-slate-850" />
              <div
                className="absolute inset-0 rounded-full border-8 border-transparent"
                style={{
                  borderTopColor: '#10b981',
                  borderRightColor: health?.score! >= 75 ? '#10b981' : 'transparent',
                  borderBottomColor: health?.score! >= 50 ? '#10b981' : 'transparent',
                  transform: 'rotate(-45deg)',
                }}
              />
              <div className="flex flex-col items-center">
                <span className="text-2xl font-black text-slate-900 dark:text-slate-50">{health?.score}</span>
                <span className="text-[9px] font-black uppercase text-emerald-600">THS Index</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className={`inline-block text-[10px] font-extrabold px-2.5 py-1 border rounded-lg uppercase ${healthStyles.bg} ${healthStyles.text} ${healthStyles.border}`}>
                {health?.status}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                {healthStyles.description}
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                O **SaaS THS** mensura o quão balanceada está sua estrutura. Valores elevados indicam que o sistema está sendo otimizado sem riscos de interrupções nas digitalizações de novos anexos ou perda de velocidade.
              </p>
            </div>
          </div>
        </div>

        {/* Upgrade / Account Manager Contact */}
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-3xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Upgrade de Plano ou Aquisição de Vagas
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Necessita de mais vagas de usuários para seus novos correspondentes bancários ou de mais limite documental?
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              Oferecemos pacotes modulares de expansão:
            </p>
            <ul className="text-xs space-y-1.5 text-slate-600 dark:text-slate-400 font-medium pl-1">
              <li className="flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-blue-500" />
                <span>+10 Vagas adicionais para digitadores</span>
              </li>
              <li className="flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-blue-500" />
                <span>+10 GB de armazenamento para digitalização de documentos</span>
              </li>
              <li className="flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-blue-500" />
                <span>Suporte premium 24/7 com gerente de contas dedicado</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <a
              href="mailto:comercial@sentinelconsig.com.br?subject=Solicitacao%20de%20Upgrade%20Sentinel%20Consig"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase cursor-pointer shadow-3xs tracking-wider transition-all"
            >
              <Mail className="h-4 w-4" />
              <span>Solicitar Upgrade</span>
            </a>
            <div className="flex items-center justify-center p-2 text-[10px] text-slate-400 font-extrabold uppercase">
              comercial@sentinelconsig.com.br
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
