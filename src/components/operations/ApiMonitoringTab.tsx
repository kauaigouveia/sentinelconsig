import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  Plus,
  ShieldAlert,
  Server,
  Radio,
  SlidersHorizontal,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Megaphone,
} from 'lucide-react';
import { toastService } from '../ui/toastService';
import { StorageService } from '../../services/storageService';

export interface MonitoredService {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  endpointUrl?: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'MAINTENANCE';
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  latencyMs: number;
  uptimePercent: number;
  lastCheckedAt?: string;
  lastStatusChange?: string;
  checkIntervalSec: number;
  isActive: boolean;
  incidents?: ApiIncident[];
}

export interface ApiIncident {
  id: string;
  serviceId: string;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
  impactDetails?: string;
  identifiedAt: string;
  resolvedAt?: string;
  createdByName?: string;
  service?: {
    id: string;
    name: string;
    slug: string;
    category: string;
    status: string;
  };
}

export interface HealthOverview {
  overallStatus: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'MAINTENANCE';
  totalServices: number;
  operational: number;
  degraded: number;
  outage: number;
  maintenance: number;
  averageLatencyMs: number;
  averageUptimePercent: number;
  activeIncidentsCount: number;
  activeIncidents: ApiIncident[];
}

interface ApiMonitoringTabProps {
  onOpenAnnouncementsTabWithIncident?: (incident: ApiIncident) => void;
}

export const ApiMonitoringTab: React.FC<ApiMonitoringTabProps> = ({
  onOpenAnnouncementsTabWithIncident,
}) => {
  const [services, setServices] = useState<MonitoredService[]>([]);
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testingServiceId, setTestingServiceId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Modais de Gestão
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [isEditServiceModalOpen, setIsEditServiceModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<MonitoredService | null>(null);

  // Form de Incidente
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentServiceId, setIncidentServiceId] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentImpact, setIncidentImpact] = useState('');
  const [createAnnouncementFromIncident, setCreateAnnouncementFromIncident] = useState(true);

  // Form de Edição de Status de Serviço
  const [editStatus, setEditStatus] = useState<'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'MAINTENANCE'>('OPERATIONAL');
  const [editCriticality, setEditCriticality] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');

  const activeUser = StorageService.getActiveUser();
  const isManager =
    activeUser?.role === 'MASTER' ||
    activeUser?.role === 'PLATFORM_MASTER' ||
    activeUser?.role === 'GESTOR' ||
    activeUser?.role === 'GERENTE';

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 45000); // Polling suave a cada 45s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [resHealth, resServices, resIncidents] = await Promise.all([
        fetch('/api/monitoring/health', { credentials: 'include' }),
        fetch('/api/monitoring/services', { credentials: 'include' }),
        fetch('/api/monitoring/incidents', { credentials: 'include' }),
      ]);

      if (resHealth.ok) {
        const hData = await resHealth.json();
        setOverview(hData);
      }
      if (resServices.ok) {
        const sData = await resServices.json();
        setServices(sData);
      }
      if (resIncidents.ok) {
        const iData = await resIncidents.json();
        setIncidents(iData);
      }
    } catch (err) {
      console.error('[API MONITORING] Erro ao buscar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePingAll = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/monitoring/ping-all', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toastService.success('Verificação de conectividade concluída para todas as APIs.');
        await loadData();
      } else {
        toastService.error('Erro ao executar ping em lote.');
      }
    } catch (e) {
      toastService.error('Erro de conexão ao testar APIs.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePingSingle = async (serviceId: string, name: string) => {
    setTestingServiceId(serviceId);
    try {
      const res = await fetch(`/api/monitoring/services/${serviceId}/ping`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const result = await res.json();
        toastService.success(`${name}: Conexão ativa (${result.latencyMs}ms)`);
        await loadData();
      } else {
        toastService.error(`Falha ao testar conectividade de ${name}`);
      }
    } catch {
      toastService.error('Erro de rede.');
    } finally {
      setTestingServiceId(null);
    }
  };

  const handleSaveServiceEdit = async () => {
    if (!selectedService) return;
    try {
      const res = await fetch(`/api/monitoring/services/${selectedService.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: editStatus,
          criticality: editCriticality,
        }),
      });

      if (res.ok) {
        toastService.success(`Status de ${selectedService.name} atualizado.`);
        setIsEditServiceModalOpen(false);
        await loadData();
      } else {
        const err = await res.json();
        toastService.error(err.error || 'Erro ao atualizar status.');
      }
    } catch {
      toastService.error('Erro ao comunicar com o servidor.');
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentTitle || !incidentServiceId || !incidentDescription) {
      toastService.error('Preencha os campos obrigatórios do incidente.');
      return;
    }

    try {
      const res = await fetch('/api/monitoring/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          serviceId: incidentServiceId,
          title: incidentTitle,
          description: incidentDescription,
          severity: incidentSeverity,
          impactDetails: incidentImpact,
        }),
      });

      if (res.ok) {
        const createdIncident: ApiIncident = await res.json();
        toastService.success('Incidente registrado com sucesso.');

        // Se o usuário optou por criar um comunicado para a equipe
        if (createAnnouncementFromIncident && onOpenAnnouncementsTabWithIncident) {
          onOpenAnnouncementsTabWithIncident(createdIncident);
        }

        setIsIncidentModalOpen(false);
        resetIncidentForm();
        await loadData();
      } else {
        const err = await res.json();
        toastService.error(err.error || 'Erro ao registrar incidente.');
      }
    } catch {
      toastService.error('Erro de conexão ao salvar incidente.');
    }
  };

  const handleResolveIncident = async (incidentId: string) => {
    try {
      const res = await fetch(`/api/monitoring/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'RESOLVED' }),
      });

      if (res.ok) {
        toastService.success('Incidente marcado como resolvido.');
        await loadData();
      } else {
        toastService.error('Erro ao resolver incidente.');
      }
    } catch {
      toastService.error('Erro de conexão.');
    }
  };

  const resetIncidentForm = () => {
    setIncidentTitle('');
    setIncidentServiceId('');
    setIncidentSeverity('HIGH');
    setIncidentDescription('');
    setIncidentImpact('');
    setCreateAnnouncementFromIncident(true);
  };

  const filteredServices = services.filter((s) => {
    if (categoryFilter === 'ALL') return true;
    return s.category === categoryFilter;
  });

  const getStatusBadge = (status: MonitoredService['status']) => {
    switch (status) {
      case 'OPERATIONAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Operacional
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Degradado
          </span>
        );
      case 'OUTAGE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800/60">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
            Fora do Ar
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-300 dark:border-blue-800/60">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Manutenção
          </span>
        );
      default:
        return null;
    }
  };

  const getSeverityBadge = (severity: ApiIncident['severity']) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            Crítico
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
            Alto
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            Médio
          </span>
        );
      case 'LOW':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            Baixo
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Geral de Status & Ações Rápidas */}
      <div className="bg-white dark:bg-[#080d18] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                overview?.overallStatus === 'OPERATIONAL'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : overview?.overallStatus === 'DEGRADED'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse'
              }`}
            >
              {overview?.overallStatus === 'OPERATIONAL' ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : overview?.overallStatus === 'DEGRADED' ? (
                <AlertTriangle className="h-6 w-6" />
              ) : (
                <XCircle className="h-6 w-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {overview?.overallStatus === 'OPERATIONAL'
                    ? 'Todas as Integrações & APIs Operando Normalmente'
                    : overview?.overallStatus === 'DEGRADED'
                    ? 'Atenção: Instabilidade Detectada em Integrações'
                    : 'Alerta Crítico: Paralisação ou Queda de Serviço Detectada'}
                </h3>
                {overview && getStatusBadge(overview.overallStatus)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Monitoramento contínuo de esteiras bancárias, Dataprev INSS, CIP Portabilidades, Barramentos e mensageria em tempo real.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end lg:self-center">
            {isManager && (
              <button
                onClick={() => setIsIncidentModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/60 transition-colors cursor-pointer"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Registrar Incidente
              </button>
            )}

            <button
              onClick={handlePingAll}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Verificar Conectividade (Ping Geral)
            </button>
          </div>
        </div>

        {/* 4 Cards de Métricas em Tempo Real */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/60">
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/60 dark:border-slate-800/50">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Serviços Operacionais
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-slate-900 dark:text-slate-100">
                {overview?.operational ?? 0}
              </span>
              <span className="text-xs text-slate-400">/ {overview?.totalServices ?? 0}</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/60 dark:border-slate-800/50">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Latência Média Global
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-blue-600 dark:text-blue-400">
                {overview?.averageLatencyMs ?? 0} ms
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Excelente</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/60 dark:border-slate-800/50">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Uptime Global
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                {overview?.averageUptimePercent ?? 99.9}%
              </span>
              <span className="text-[10px] text-slate-400">Últimos 30 dias</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/60 dark:border-slate-800/50">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Incidentes Ativos
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span
                className={`text-xl font-black ${
                  (overview?.activeIncidentsCount || 0) > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {overview?.activeIncidentsCount ?? 0}
              </span>
              {(overview?.activeIncidentsCount || 0) > 0 && (
                <span className="text-[10px] text-rose-500 font-bold">Ação necessária</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Se houver incidentes ativos, exibir faixa de atenção prioritária */}
      {overview && overview.activeIncidents && overview.activeIncidents.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl p-4">
          <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-sm mb-3">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>Incidentes Operacionais em Andamento ({overview.activeIncidents.length})</span>
          </div>
          <div className="space-y-2">
            {overview.activeIncidents.map((inc) => (
              <div
                key={inc.id}
                className="bg-white dark:bg-slate-900 rounded-lg p-3.5 border border-rose-200/80 dark:border-rose-900/50 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {inc.title}
                    </span>
                    {getSeverityBadge(inc.severity)}
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                      {inc.service?.name || 'Serviço'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{inc.description}</p>
                  {inc.impactDetails && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                      Impacto Operacional: {inc.impactDetails}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  {onOpenAnnouncementsTabWithIncident && (
                    <button
                      onClick={() => onOpenAnnouncementsTabWithIncident(inc)}
                      className="px-2.5 py-1.5 rounded text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Criar um comunicado para a equipe a partir deste incidente"
                    >
                      <Megaphone className="h-3 w-3" />
                      Emitir Comunicado
                    </button>
                  )}

                  {isManager && (
                    <button
                      onClick={() => handleResolveIncident(inc.id)}
                      className="px-3 py-1.5 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                    >
                      Marcar Resolvido
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Serviços Monitorados */}
      <div className="bg-white dark:bg-[#080d18] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-blue-500 animate-pulse" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Serviços e APIs Integradas
            </h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
              {filteredServices.length} ativos
            </span>
          </div>

          {/* Filtro por Categoria */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
            {['ALL', 'BANK', 'GOVERNMENT', 'INTERNAL', 'STORAGE', 'AI'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {cat === 'ALL'
                  ? 'Todas'
                  : cat === 'BANK'
                  ? 'Bancos'
                  : cat === 'GOVERNMENT'
                  ? 'Governo/INSS'
                  : cat === 'INTERNAL'
                  ? 'Mensageria'
                  : cat === 'STORAGE'
                  ? 'Storage'
                  : 'Inteligência'}
              </button>
            ))}
          </div>
        </div>

        {/* Tabela de Serviços */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Serviço / Barramento</th>
                <th className="px-3 py-3">Categoria</th>
                <th className="px-3 py-3">Criticidade</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Latência</th>
                <th className="px-3 py-3">Disponibilidade</th>
                <th className="px-3 py-3">Última Checagem</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredServices.map((service) => {
                const isTesting = testingServiceId === service.id;
                return (
                  <tr
                    key={service.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">
                          {service.name}
                        </span>
                        {service.description && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-sm block">
                            {service.description}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {service.category}
                      </span>
                    </td>

                    <td className="px-3 py-3.5">{getSeverityBadge(service.criticality)}</td>

                    <td className="px-3 py-3.5">{getStatusBadge(service.status)}</td>

                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono font-bold ${
                            service.latencyMs < 100
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : service.latencyMs < 200
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {service.latencyMs}ms
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, service.uptimePercent)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          {service.uptimePercent}%
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3.5 text-slate-500 dark:text-slate-400 text-[11px]">
                      {service.lastCheckedAt
                        ? new Date(service.lastCheckedAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : 'Recente'}
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-1.5">
                      <button
                        onClick={() => handlePingSingle(service.id, service.name)}
                        disabled={isTesting}
                        className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
                        title="Executar ping de teste nesta API"
                      >
                        {isTesting ? 'Testando...' : 'Testar'}
                      </button>

                      {isManager && (
                        <button
                          onClick={() => {
                            setSelectedService(service);
                            setEditStatus(service.status);
                            setEditCriticality(service.criticality);
                            setIsEditServiceModalOpen(true);
                          }}
                          className="px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Ajustar status ou criticidade"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Histórico Geral de Incidentes */}
      <div className="bg-white dark:bg-[#080d18] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Histórico Recente de Incidentes & Manutenções
            </h4>
          </div>
          <span className="text-xs text-slate-500">Últimos registros</span>
        </div>

        {incidents.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-xs">
            Nenhum incidente registrado recentemente. Todos os sistemas operam em conformidade.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {incidents.slice(0, 8).map((inc) => (
              <div key={inc.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                      {inc.title}
                    </span>
                    {getSeverityBadge(inc.severity)}
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        inc.status === 'RESOLVED'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {inc.status === 'RESOLVED' ? 'Resolvido' : 'Investigando'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{inc.description}</p>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Identificado em {new Date(inc.identifiedAt).toLocaleString('pt-BR')} por{' '}
                    {inc.createdByName || 'Sistema'}
                  </span>
                </div>

                {inc.status !== 'RESOLVED' && isManager && (
                  <button
                    onClick={() => handleResolveIncident(inc.id)}
                    className="px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer shrink-0"
                  >
                    Resolver
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: Registrar Incidente */}
      {isIncidentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
              Registrar Novo Incidente Operacional
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Informe os dados da instabilidade ou queda para alertar a operação e atualizar as métricas.
            </p>

            <form onSubmit={handleCreateIncident} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Serviço Afetado *
                </label>
                <select
                  value={incidentServiceId}
                  onChange={(e) => setIncidentServiceId(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecione o serviço...</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Título do Incidente *
                </label>
                <input
                  type="text"
                  value={incidentTitle}
                  onChange={(e) => setIncidentTitle(e.target.value)}
                  placeholder="Ex: Instabilidade no retorno de margem do INSS"
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Gravidade *
                  </label>
                  <select
                    value={incidentSeverity}
                    onChange={(e) => setIncidentSeverity(e.target.value as any)}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="CRITICAL">Crítica (Queda Geral)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Impacto Estimado
                  </label>
                  <input
                    type="text"
                    value={incidentImpact}
                    onChange={(e) => setIncidentImpact(e.target.value)}
                    placeholder="Ex: Digitação temporariamente suspensa"
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição dos Fatos & Causa *
                </label>
                <textarea
                  rows={3}
                  value={incidentDescription}
                  onChange={(e) => setIncidentDescription(e.target.value)}
                  placeholder="Descreva o que foi observado, mensagens de erro retornadas pelo banco/barramento..."
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-announcement"
                  checked={createAnnouncementFromIncident}
                  onChange={(e) => setCreateAnnouncementFromIncident(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label
                  htmlFor="chk-announcement"
                  className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer font-medium"
                >
                  Abrir Central de Comunicados para emitir aviso oficial para a equipe
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsIncidentModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                >
                  Salvar Incidente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ajustar Status de Serviço */}
      {isEditServiceModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
              Ajustar Status do Serviço
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {selectedService.name}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Status Operacional
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5"
                >
                  <option value="OPERATIONAL">OPERACIONAL (100% Funcional)</option>
                  <option value="DEGRADED">DEGRADADO (Lentidão / Instabilidade)</option>
                  <option value="OUTAGE">FORA DO AR (Queda Total)</option>
                  <option value="MAINTENANCE">MANUTENÇÃO PROGRAMADA</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nível de Criticidade
                </label>
                <select
                  value={editCriticality}
                  onChange={(e) => setEditCriticality(e.target.value as any)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5"
                >
                  <option value="LOW">Baixa</option>
                  <option value="MEDIUM">Média</option>
                  <option value="HIGH">Alta</option>
                  <option value="CRITICAL">Crítica (Bloqueia a operação)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditServiceModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveServiceEdit}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
