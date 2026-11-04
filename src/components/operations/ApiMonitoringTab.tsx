import React, { useState, useEffect, useRef } from 'react';
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
  status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'MAINTENANCE' | 'UNKNOWN';
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  latencyMs: number | null;
  uptimePercent: number | null;
  probeSupported?: boolean;
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
  overallStatus: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'MAINTENANCE' | 'UNKNOWN';
  totalServices: number;
  operational: number;
  degraded: number;
  outage: number;
  maintenance: number;
  averageLatencyMs: number | null;
  averageUptimePercent: number | null;
  activeIncidentsCount: number;
  activeIncidents: ApiIncident[];
  lastUpdated?: string;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testingServiceId, setTestingServiceId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const loadRequestRef = useRef(0);

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
    return () => {
      clearInterval(interval);
      loadRequestRef.current += 1;
    };
  }, []);

  const loadData = async () => {
    const requestId = ++loadRequestRef.current;
    try {
      const fetchJson = async (url: string) => {
        const response = await fetch(url, { credentials: 'include' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `Falha ao carregar dados (HTTP ${response.status}).`);
        return data;
      };
      const [healthResult, servicesResult, incidentsResult] = await Promise.allSettled([
        fetchJson('/api/monitoring/health'),
        fetchJson('/api/monitoring/services'),
        fetchJson('/api/monitoring/incidents'),
      ]);
      if (requestId !== loadRequestRef.current) return;
      const errors: string[] = [];
      if (healthResult.status === 'fulfilled') {
        setOverview(healthResult.value);
      } else {
        errors.push(`Saúde geral: ${healthResult.reason instanceof Error ? healthResult.reason.message : 'falha ao carregar.'}`);
      }
      if (servicesResult.status === 'fulfilled') {
        if (Array.isArray(servicesResult.value)) setServices(servicesResult.value);
        else errors.push('Serviços: resposta inválida do servidor.');
      } else {
        errors.push(`Serviços: ${servicesResult.reason instanceof Error ? servicesResult.reason.message : 'falha ao carregar.'}`);
      }
      if (incidentsResult.status === 'fulfilled') {
        if (Array.isArray(incidentsResult.value)) setIncidents(incidentsResult.value);
        else errors.push('Incidentes: resposta inválida do servidor.');
      } else {
        errors.push(`Incidentes: ${incidentsResult.reason instanceof Error ? incidentsResult.reason.message : 'falha ao carregar.'}`);
      }
      setLoadError(errors.length ? errors.join(' ') : null);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setLoadError(err instanceof Error ? err.message : 'Falha ao atualizar os dados de monitoramento.');
      console.error('[API MONITORING] Erro ao buscar dados:', err);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
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
        const result = await res.json();
        toastService.success(`${result.checkedCount} endpoint(s) verificado(s); ${result.unsupportedCount} sem verificação configurada.`);
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
        toastService.success(`${name}: ${result.message}`);
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
            <span className="h-2 w-2 rounded-full bg-[var(--success-bg)] animate-pulse" />
            Operacional
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
            <span className="h-2 w-2 rounded-full bg-[var(--warning-bg)]" />
            Degradado
          </span>
        );
      case 'OUTAGE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
            <span className="h-2 w-2 rounded-full bg-[var(--danger-bg)] animate-ping" />
            Fora do Ar
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="h-2 w-2 rounded-full bg-[var(--info-bg)]" />
            Manutenção
          </span>
        );
      case 'UNKNOWN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="h-2 w-2 rounded-full bg-[var(--bg-surface-elevated)]" />
            Não verificado
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
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
            Crítico
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
            Alto
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
            Médio
          </span>
        );
      case 'LOW':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            Baixo
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Geral de Status & Ações Rápidas */}
      <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                overview?.overallStatus === 'OPERATIONAL'
                  ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)]'
                  : overview?.overallStatus === 'DEGRADED'
                  ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border border-[var(--warning-border)]'
                  : overview?.overallStatus === 'UNKNOWN' || !overview
                  ? 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border border-[var(--field-border)]'
                  : 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] animate-pulse'
              }`}
            >
              {overview?.overallStatus === 'OPERATIONAL' ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : overview?.overallStatus === 'DEGRADED' ? (
                <AlertTriangle className="h-6 w-6" />
              ) : overview?.overallStatus === 'UNKNOWN' || !overview ? (
                <Clock className="h-6 w-6" />
              ) : (
                <XCircle className="h-6 w-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] tracking-tight">
                  {overview?.overallStatus === 'OPERATIONAL'
                    ? 'Todas as Integrações & APIs Operando Normalmente'
                    : overview?.overallStatus === 'DEGRADED'
                    ? 'Atenção: Instabilidade Detectada em Integrações'
                    : overview?.overallStatus === 'UNKNOWN'
                    ? 'Integrações aguardando verificação'
                    : 'Alerta Crítico: Paralisação ou Queda de Serviço Detectada'}
                </h3>
                {overview && getStatusBadge(overview.overallStatus)}
              </div>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
                O status considera apenas verificações recentes ou incidentes registrados.
                {overview?.lastUpdated && ` Atualizado às ${new Date(overview.lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`}
                {loading && ' Carregando dados...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end lg:self-center">
            {isManager && (
              <button
                onClick={() => setIsIncidentModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--danger-bg)] text-[var(--danger-text)] hover:bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)] dark:hover:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] transition-colors cursor-pointer"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Registrar Incidente
              </button>
            )}

            <button
              onClick={handlePingAll}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)]  transition-colors cursor-pointer disabled:opacity-90"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Verificar endpoints compatíveis
            </button>
          </div>
        </div>

        {/* 4 Cards de Métricas em Tempo Real */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-5 pt-4 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
          <div className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] rounded-lg p-3 border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="text-[11px] font-medium text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">
              Serviços Operacionais
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                {overview?.operational ?? 0}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">/ {overview?.totalServices ?? 0}</span>
            </div>
          </div>

          <div className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] rounded-lg p-3 border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="text-[11px] font-medium text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">
              Latência média das verificações recentes
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-[var(--link)] dark:text-[var(--link)]">
                {overview?.averageLatencyMs == null ? '—' : `${overview.averageLatencyMs} ms`}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)]">{overview?.averageLatencyMs == null ? 'Sem medições' : 'Atual'}</span>
            </div>
          </div>

          <div className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] rounded-lg p-3 border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="text-[11px] font-medium text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">
              Disponibilidade histórica
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-[var(--success-text)] dark:text-[var(--success-text)]">
                {overview?.averageUptimePercent == null ? '—' : `${overview.averageUptimePercent}%`}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)]">{overview?.averageUptimePercent == null ? 'Sem histórico' : 'Últimos 30 dias'}</span>
            </div>
          </div>

          <div className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] rounded-lg p-3 border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="text-[11px] font-medium text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">
              Incidentes Ativos
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span
                className={`text-xl font-black ${
                  (overview?.activeIncidentsCount || 0) > 0
                    ? 'text-[var(--danger-text)] dark:text-[var(--danger-text)]'
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-primary)]'
                }`}
              >
                {overview?.activeIncidentsCount ?? 0}
              </span>
              {(overview?.activeIncidentsCount || 0) > 0 && (
                <span className="text-[10px] text-[var(--danger-text)] font-bold">Ação necessária</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)] dark:border-[var(--warning-border)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] sm:flex-row sm:items-center">
          <span className="flex-1">Alguns dados podem estar desatualizados. {loadError}</span>
          <button type="button" onClick={() => void loadData()} className="shrink-0 font-bold underline">Tentar carregar novamente</button>
        </div>
      )}

      {/* Se houver incidentes ativos, exibir faixa de atenção prioritária */}
      {overview && overview.activeIncidents && overview.activeIncidents.length > 0 && (
        <div className="bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[var(--danger-text)] dark:text-[var(--danger-text)] font-bold text-sm mb-3">
            <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--danger-text)] dark:text-[var(--danger-text)]" />
            <span>Incidentes Operacionais em Andamento ({overview.activeIncidents.length})</span>
          </div>
          <div className="space-y-2">
            {overview.activeIncidents.map((inc) => (
              <div
                key={inc.id}
                className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-lg p-3.5 border border-[var(--danger-border)] dark:border-[var(--danger-border)] flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {inc.title}
                    </span>
                    {getSeverityBadge(inc.severity)}
                    <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium">
                      {inc.service?.name || 'Serviço'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">{inc.description}</p>
                  {inc.impactDetails && (
                    <p className="text-[11px] text-[var(--danger-text)] dark:text-[var(--danger-text)] font-semibold mt-0.5">
                      Impacto Operacional: {inc.impactDetails}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  {onOpenAnnouncementsTabWithIncident && (
                    <button
                      onClick={() => onOpenAnnouncementsTabWithIncident(inc)}
                      className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] hover:bg-[var(--warning-bg)] transition-colors flex items-center gap-1 cursor-pointer"
                      title="Criar um comunicado para a equipe a partir deste incidente"
                    >
                      <Megaphone className="h-3 w-3" />
                      Emitir Comunicado
                    </button>
                  )}

                  {isManager && (
                    <button
                      onClick={() => handleResolveIncident(inc.id)}
                      className="px-3 py-1.5 rounded text-xs font-bold bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] transition-colors cursor-pointer"
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
      <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-[var(--link)] animate-pulse" />
            <h4 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Serviços e APIs Integradas
            </h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold">
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
                    ? 'bg-[var(--action)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
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
          <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Serviço / Barramento</th>
                <th className="px-3 py-3">Categoria</th>
                <th className="px-3 py-3">Criticidade</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Latência</th>
                <th className="px-3 py-3">Histórico</th>
                <th className="px-3 py-3">Última Checagem</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
              {filteredServices.map((service) => {
                const isTesting = testingServiceId === service.id;
                return (
                  <tr
                    key={service.id}
                    className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div>
                        <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] block">
                          {service.name}
                        </span>
                        {service.description && (
                          <span className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] truncate max-w-sm block">
                            {service.description}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]">
                        {service.category}
                      </span>
                    </td>

                    <td className="px-3 py-3.5">{getSeverityBadge(service.criticality)}</td>

                    <td className="px-3 py-3.5">{getStatusBadge(service.status)}</td>

                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono font-bold ${
                            service.latencyMs == null ? 'text-[var(--text-secondary)]' : service.latencyMs < 100
                              ? 'text-[var(--success-text)] dark:text-[var(--success-text)]'
                              : service.latencyMs < 200
                              ? 'text-[var(--warning-text)] dark:text-[var(--warning-text)]'
                              : 'text-[var(--danger-text)] dark:text-[var(--danger-text)]'
                          }`}
                        >
                          {service.latencyMs == null ? '—' : `${service.latencyMs}ms`}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3.5">
                      <span className="text-[var(--text-secondary)]">{service.uptimePercent == null ? 'Sem histórico' : `${service.uptimePercent}%`}</span>
                    </td>

                    <td className="px-3 py-3.5 text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-[11px]">
                      {service.lastCheckedAt
                        ? new Date(service.lastCheckedAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : 'Nunca verificado'}
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-1.5">
                      <button
                        onClick={() => handlePingSingle(service.id, service.name)}
                        disabled={isTesting || !service.probeSupported}
                        className="px-2.5 py-1 rounded text-xs font-semibold bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-90"
                        title={service.probeSupported ? 'Executar verificação neste endpoint' : 'Não há verificação configurada para este serviço'}
                      >
                        {isTesting ? 'Verificando...' : service.probeSupported ? 'Verificar' : 'Sem check'}
                      </button>

                      {isManager && (
                        <button
                          onClick={() => {
                            setSelectedService(service);
                            setEditStatus(service.status === 'UNKNOWN' ? 'OPERATIONAL' : service.status);
                            setEditCriticality(service.criticality);
                            setIsEditServiceModalOpen(true);
                          }}
                          className="px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
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
      <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--text-secondary)]" />
            <h4 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Histórico Recente de Incidentes & Manutenções
            </h4>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">Últimos registros</span>
        </div>

        {incidents.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-xs">
            Nenhum incidente registrado recentemente. Todos os sistemas operam em conformidade.
          </div>
        ) : (
          <div className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
            {incidents.slice(0, 8).map((inc) => (
              <div key={inc.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {inc.title}
                    </span>
                    {getSeverityBadge(inc.severity)}
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        inc.status === 'RESOLVED'
                          ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                          : 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]'
                      }`}
                    >
                      {inc.status === 'RESOLVED' ? 'Resolvido' : 'Investigando'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">{inc.description}</p>
                  <span className="text-[10px] text-[var(--text-secondary)] mt-1 block">
                    Identificado em {new Date(inc.identifiedAt).toLocaleString('pt-BR')} por{' '}
                    {inc.createdByName || 'Sistema'}
                  </span>
                </div>

                {inc.status !== 'RESOLVED' && isManager && (
                  <button
                    onClick={() => handleResolveIncident(inc.id)}
                    className="px-2.5 py-1 text-xs font-semibold text-[var(--success-text)] dark:text-[var(--success-text)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] rounded border border-[var(--success-border)] dark:border-[var(--success-border)] hover:bg-[var(--success-bg)] transition-colors cursor-pointer shrink-0"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-xs">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl max-w-lg w-full p-5 shadow-xl">
            <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
              Registrar Novo Incidente Operacional
            </h3>
            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-4">
              Informe os dados da instabilidade ou queda para alertar a operação e atualizar as métricas.
            </p>

            <form onSubmit={handleCreateIncident} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Serviço Afetado *
                </label>
                <select
                  value={incidentServiceId}
                  onChange={(e) => setIncidentServiceId(e.target.value)}
                  className="w-full text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] p-2.5 focus:ring-2 focus:ring-[var(--focus)]"
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
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Título do Incidente *
                </label>
                <input
                  type="text"
                  value={incidentTitle}
                  onChange={(e) => setIncidentTitle(e.target.value)}
                  placeholder="Ex: Instabilidade no retorno de margem do INSS"
                  className="w-full text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] p-2.5 focus:ring-2 focus:ring-[var(--focus)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    Gravidade *
                  </label>
                  <select
                    value={incidentSeverity}
                    onChange={(e) => setIncidentSeverity(e.target.value as any)}
                    className="w-full text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] p-2.5"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="CRITICAL">Crítica (Queda Geral)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    Impacto Estimado
                  </label>
                  <input
                    type="text"
                    value={incidentImpact}
                    onChange={(e) => setIncidentImpact(e.target.value)}
                    placeholder="Ex: Digitação temporariamente suspensa"
                    className="w-full text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] p-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Descrição dos Fatos & Causa *
                </label>
                <textarea
                  rows={3}
                  value={incidentDescription}
                  onChange={(e) => setIncidentDescription(e.target.value)}
                  placeholder="Descreva o que foi observado, mensagens de erro retornadas pelo banco/barramento..."
                  className="w-full text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] p-2.5"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-announcement"
                  checked={createAnnouncementFromIncident}
                  onChange={(e) => setCreateAnnouncementFromIncident(e.target.checked)}
                  className="rounded text-[var(--link)] focus:ring-[var(--focus)] h-4 w-4"
                />
                <label
                  htmlFor="chk-announcement"
                  className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer font-medium"
                >
                  Abrir Central de Comunicados para emitir aviso oficial para a equipe
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                <button
                  type="button"
                  onClick={() => setIsIncidentModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] text-[var(--danger-text)] shadow-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-xs">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl max-w-md w-full p-5 shadow-xl">
            <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
              Ajustar Status do Serviço
            </h3>
            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-4">
              {selectedService.name}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Status Operacional
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] p-2.5"
                >
                  <option value="OPERATIONAL">OPERACIONAL (100% Funcional)</option>
                  <option value="DEGRADED">DEGRADADO (Lentidão / Instabilidade)</option>
                  <option value="OUTAGE">FORA DO AR (Queda Total)</option>
                  <option value="MAINTENANCE">MANUTENÇÃO PROGRAMADA</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Nível de Criticidade
                </label>
                <select
                  value={editCriticality}
                  onChange={(e) => setEditCriticality(e.target.value as any)}
                  className="w-full text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] p-2.5"
                >
                  <option value="LOW">Baixa</option>
                  <option value="MEDIUM">Média</option>
                  <option value="HIGH">Alta</option>
                  <option value="CRITICAL">Crítica (Bloqueia a operação)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                <button
                  type="button"
                  onClick={() => setIsEditServiceModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveServiceEdit}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] shadow-xs"
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
