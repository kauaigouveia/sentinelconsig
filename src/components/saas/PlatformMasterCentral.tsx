import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Users,
  HardDrive,
  ShieldCheck,
  Server,
  Activity,
  Plus,
  Edit2,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  Layers,
  Database,
  Globe,
  Eye,
  LogOut,
  Mail,
  Palette,
  FileText,
  Search,
  Filter,
  Trash2,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { TenantPlan, TenantStatus } from '../../types';
import { formatDate } from '../../lib/utils';
import { realtimeHub } from '../../services/realtimeService';
import { ActionBar } from '../common/ActionBar';
import { MetricCard } from '../common/MetricCard';
import { DomainManagement } from '../admin/DomainManagement';

const AVAILABLE_MODULES = [
  { id: 'PROPOSALS', label: 'Esteira de Propostas' },
  { id: 'SIMULATION', label: 'Simulador Consignado' },
  { id: 'KANBAN', label: 'Quadro Kanban Operacional' },
  { id: 'CRM', label: 'Clientes 360° (CRM)' },
  { id: 'FINANCIAL', label: 'Gestão Financeira & Comissões' },
  { id: 'RADAR', label: 'Radar Comercial' },
  { id: 'TV_MONITOR', label: 'Monitor TV (Ao Vivo)' },
  { id: 'BI', label: 'Executive & Operational BI' },
  { id: 'SENTINELA_AI', label: 'Assistente Sentinela AI' },
  { id: 'DOCUMENTS', label: 'Gestão Documental Azure' },
  { id: 'PORTABILITY', label: 'Portabilidades & Refin' },
];

interface DbTenant {
  id: string;
  name: string;
  slug: string;
  customDomain?: string | null;
  cnpj?: string | null;
  tradeName?: string | null;
  plan: TenantPlan;
  status: TenantStatus;
  maxUsers: number;
  storageLimitMb: number;
  maxProposals?: number;
  enabledModules?: string[];
  createdAt: string;
  updatedAt?: string;
  whiteLabel?: {
    companyName: string;
    legalName?: string | null;
    logoUrl?: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    supportEmail?: string | null;
    supportPhone?: string | null;
    footerText?: string | null;
  } | null;
  _count?: {
    users: number;
    proposals: number;
    clients: number;
    documents?: number;
    tasks?: number;
  };
}

interface AdminContextState {
  active: boolean;
  context?: {
    targetTenantId: string;
    targetTenantName: string;
    switchedAt: string;
  } | null;
}

export const PlatformMasterCentral: React.FC = () => {
  const [tenants, setTenants] = useState<DbTenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminContext, setAdminContext] = useState<AdminContextState>({ active: false });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<DbTenant | null>(null);
  const [modalTab, setModalTab] = useState<'config' | 'domains'>('config');

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [plan, setPlan] = useState<TenantPlan>('PRO');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [maxUsers, setMaxUsers] = useState(15);
  const [storageLimitMb, setStorageLimitMb] = useState(5000);
  const [maxProposals, setMaxProposals] = useState(10000);
  const [selectedModules, setSelectedModules] = useState<string[]>(
    AVAILABLE_MODULES.map((m) => m.id)
  );

  // WhiteLabel edit fields
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [secondaryColor, setSecondaryColor] = useState('#1e40af');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [logoUrl, setLogoUrl] = useState('');
  const [supportEmail, setSupportEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [planFilter, setPlanFilter] = useState<string>('ALL');

  // Soft Delete State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<any>(null);
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Active Tab for SaaS Admin
  const [activeTab, setActiveTab] = useState<'tenants' | 'health_consumo'>('tenants');
  const [overviewData, setOverviewData] = useState<any[]>([]);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);

  const fetchOverviewData = useCallback(async () => {
    setIsOverviewLoading(true);
    try {
      const res = await fetch('/api/saas/usage/overview');
      if (res.ok) {
        const data = await res.json();
        setOverviewData(data);
      }
    } catch (err) {
      console.error('Erro ao buscar dados de visão global', err);
    } finally {
      setIsOverviewLoading(false);
    }
  }, []);

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'EXCEEDED':
        return {
          bg: 'bg-red-100 dark:bg-red-950/40',
          text: 'text-red-800 dark:text-red-300',
          border: 'border-red-200 dark:border-red-900/50',
          bar: 'bg-red-600'
        };
      case 'CRITICAL':
        return {
          bg: 'bg-rose-100 dark:bg-rose-950/40',
          text: 'text-rose-800 dark:text-rose-300',
          border: 'border-rose-200 dark:border-rose-900/50',
          bar: 'bg-rose-600'
        };
      case 'ALERT':
        return {
          bg: 'bg-amber-100 dark:bg-amber-950/40',
          text: 'text-amber-800 dark:text-amber-300',
          border: 'border-amber-200 dark:border-amber-900/50',
          bar: 'bg-amber-500'
        };
      case 'WARNING':
        return {
          bg: 'bg-blue-100 dark:bg-blue-950/40',
          text: 'text-blue-800 dark:text-blue-300',
          border: 'border-blue-200 dark:border-blue-900/50',
          bar: 'bg-blue-500'
        };
      default: // NORMAL
        return {
          bg: 'bg-emerald-100 dark:bg-emerald-950/40',
          text: 'text-emerald-800 dark:text-emerald-300',
          border: 'border-emerald-200 dark:border-emerald-900/50',
          bar: 'bg-emerald-500'
        };
    }
  };

  const getHealthStyles = (status: string) => {
    switch (status) {
      case 'EXCELLENT':
        return {
          bg: 'bg-emerald-100 dark:bg-emerald-950/40',
          text: 'text-emerald-800 dark:text-emerald-300',
          border: 'border-emerald-200 dark:border-emerald-900/50'
        };
      case 'GOOD':
        return {
          bg: 'bg-teal-100 dark:bg-teal-950/40',
          text: 'text-teal-800 dark:text-teal-300',
          border: 'border-teal-200 dark:border-teal-900/50'
        };
      case 'ATTENTION':
        return {
          bg: 'bg-blue-100 dark:bg-blue-950/40',
          text: 'text-blue-800 dark:text-blue-300',
          border: 'border-blue-200 dark:border-blue-900/50'
        };
      case 'RISK':
        return {
          bg: 'bg-amber-100 dark:bg-amber-950/40',
          text: 'text-amber-800 dark:text-amber-300',
          border: 'border-amber-200 dark:border-amber-900/50'
        };
      case 'CRITICAL':
      default:
        return {
          bg: 'bg-rose-100 dark:bg-rose-950/40',
          text: 'text-rose-800 dark:text-rose-300',
          border: 'border-rose-200 dark:border-rose-900/50'
        };
    }
  };

  // Fetch tenants from PostgreSQL API
  const fetchTenants = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/saas/tenants');
      if (!res.ok) {
        throw new Error('Falha ao carregar lista de tenants do servidor.');
      }
      const data: DbTenant[] = await res.json();
      setTenants(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao conectar ao PostgreSQL.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch admin context switch status
  const fetchContextStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/saas/context-switch/status');
      if (res.ok) {
        const data = await res.json();
        setAdminContext(data);
      }
    } catch {
      // safe fallback
    }
  }, []);

  useEffect(() => {
    fetchTenants();
    fetchContextStatus();

    // Listen for realtime tenant updates
    const unsubscribe = realtimeHub.subscribe('*', (event) => {
      if (event && event.type && event.type.startsWith('TENANT_')) {
        fetchTenants();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchTenants, fetchContextStatus]);

  useEffect(() => {
    if (activeTab === 'health_consumo') {
      fetchOverviewData();
    }
  }, [activeTab, fetchOverviewData]);

  const handleOpenCreateModal = () => {
    setEditingTenant(null);
    setModalTab('config');
    setName('');
    setSlug('');
    setCustomDomain('');
    setTradeName('');
    setCnpj('');
    setPlan('PRO');
    setAdminName('');
    setAdminEmail('');
    setMaxUsers(15);
    setStorageLimitMb(5000);
    setMaxProposals(10000);
    setSelectedModules(AVAILABLE_MODULES.map((m) => m.id));
    setPrimaryColor('#2563eb');
    setSecondaryColor('#1e40af');
    setAccentColor('#3b82f6');
    setLogoUrl('');
    setSupportEmail('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (t: DbTenant) => {
    setEditingTenant(t);
    setModalTab('config');
    setName(t.name);
    setSlug(t.slug);
    setCustomDomain(t.customDomain || '');
    setTradeName(t.tradeName || '');
    setCnpj(t.cnpj || '');
    setPlan(t.plan);
    setMaxUsers(t.maxUsers);
    setStorageLimitMb(t.storageLimitMb);
    setMaxProposals(t.maxProposals || 10000);
    setSelectedModules(
      t.enabledModules && t.enabledModules.length > 0
        ? t.enabledModules
        : AVAILABLE_MODULES.map((m) => m.id)
    );
    setPrimaryColor(t.whiteLabel?.primaryColor || '#2563eb');
    setSecondaryColor(t.whiteLabel?.secondaryColor || '#1e40af');
    setAccentColor(t.whiteLabel?.accentColor || '#3b82f6');
    setLogoUrl(t.whiteLabel?.logoUrl || '');
    setSupportEmail(t.whiteLabel?.supportEmail || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const toggleModule = (modId: string) => {
    setSelectedModules((prev) =>
      prev.includes(modId) ? prev.filter((id) => id !== modId) : [...prev, modId]
    );
  };

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (editingTenant) {
        // PUT /api/saas/tenants/:id
        const res = await fetch(`/api/saas/tenants/${editingTenant.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            slug,
            customDomain: customDomain.trim() || null,
            cnpj: cnpj.trim() || null,
            tradeName: tradeName.trim() || null,
            plan,
            maxUsers,
            storageLimitMb,
            maxProposals,
            enabledModules: selectedModules,
            whiteLabel: {
              companyName: name,
              primaryColor,
              secondaryColor,
              accentColor,
              logoUrl: logoUrl.trim() || null,
              supportEmail: supportEmail.trim() || null,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao atualizar tenant.');
        }
      } else {
        // POST /api/saas/tenants
        const res = await fetch('/api/saas/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            slug,
            customDomain: customDomain.trim() || null,
            cnpj: cnpj.trim() || null,
            tradeName: tradeName.trim() || null,
            plan,
            adminName,
            adminEmail,
            maxUsers,
            storageLimitMb,
            maxProposals,
            enabledModules: selectedModules,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao criar tenant.');
        }
      }

      setIsModalOpen(false);
      await fetchTenants();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar tenant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuspendTenant = async (tenantId: string, tenantName: string) => {
    if (
      !confirm(
        `ATENÇÃO: Suspender o tenant '${tenantName}' irá desconectar imediatamente todas as sessões e conexões ativas de seus usuários. Deseja continuar?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/saas/tenants/${tenantId}/suspend`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao suspender tenant.');
      await fetchTenants();
    } catch (err: any) {
      alert(err.message || 'Erro ao suspender tenant.');
    }
  };

  const handleReactivateTenant = async (tenantId: string) => {
    try {
      const res = await fetch(`/api/saas/tenants/${tenantId}/reactivate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao reativar tenant.');
      await fetchTenants();
    } catch (err: any) {
      alert(err.message || 'Erro ao reativar tenant.');
    }
  };

  const handleRequestDelete = async (t: any) => {
    if (t.id === 'sentinel-consig') {
      alert('Atenção: Não é permitido excluir o tenant raiz (sentinel-consig).');
      return;
    }
    setDeleteError(null);
    setConfirmName('');
    setTenantToDelete(t);
    setIsDeleteModalOpen(true);

    // Fetch details to get all counts
    try {
      const res = await fetch(`/api/saas/tenants/${t.id}`);
      if (res.ok) {
        const detail = await res.json();
        setTenantToDelete(detail);
      }
    } catch (e) {
      console.warn('Erro ao carregar detalhes para exclusão:', e);
    }
  };

  const handleConfirmDelete = async () => {
    if (!tenantToDelete) return;
    if (confirmName !== tenantToDelete.name) {
      setDeleteError('O nome digitado não corresponde ao nome da empresa.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/saas/tenants/${tenantToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir a empresa.');
      }
      setIsDeleteModalOpen(false);
      setTenantToDelete(null);
      alert('Empresa excluída com sucesso.');
      await fetchTenants();
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir a empresa.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Context Switch (Inspection Mode)
  const handleStartContextSwitch = async (targetTenantId: string, targetTenantName: string) => {
    try {
      const res = await fetch('/api/saas/context-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTenantId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao alternar contexto.');

      await fetchContextStatus();
      // Synchronize business cache for the target tenant
      await StorageService.syncWithPostgreSQL();
      alert(`Modo de Inspeção ativado para: ${targetTenantName}`);
    } catch (err: any) {
      alert(err.message || 'Erro ao alternar contexto.');
    }
  };

  const handleExitContextSwitch = async () => {
    try {
      const res = await fetch('/api/saas/context-switch/exit', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao sair do contexto.');

      await fetchContextStatus();
      await StorageService.syncWithPostgreSQL();
      alert('Contexto de inspeção encerrado.');
    } catch (err: any) {
      alert(err.message || 'Erro ao sair do contexto.');
    }
  };

  // Aggregates
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((t) => t.status === 'ACTIVE').length;
  const suspendedTenants = tenants.filter((t) => t.status === 'SUSPENDED').length;
  const totalUsersCapacity = tenants.reduce((sum, t) => sum + t.maxUsers, 0);
  const totalActiveUsers = tenants.reduce((sum, t) => sum + (t._count?.users || 0), 0);

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchSearch =
        !searchTerm ||
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.customDomain && t.customDomain.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.cnpj && t.cnpj.includes(searchTerm));
      const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchPlan = planFilter === 'ALL' || t.plan === planFilter;
      return matchSearch && matchStatus && matchPlan;
    });
  }, [tenants, searchTerm, statusFilter, planFilter]);

  return (
    <div className="space-y-6">
      {/* Active Context Banner */}
      {adminContext.active && adminContext.context && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-purple-900 text-white border border-purple-500 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-800 rounded-lg">
              <Eye className="h-5 w-5 text-purple-300" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-purple-300">Modo de Inspeção Ativo (Admin Scope)</span>
              <p className="text-sm font-black text-white">
                Inspecionando dados operacionais de: <span className="underline">{adminContext.context.targetTenantName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleExitContextSwitch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sair da Inspeção</span>
          </button>
        </div>
      )}

      {/* Header with Standardized ActionBar */}
      <ActionBar
        title="Central de Empresas & Assinaturas"
        subtitle="Controle corporativo de empresas, planos, domínios e personalização da plataforma"
        badge="PLATFORM MASTER"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTenants}
              className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Nova Empresa</span>
            </button>
          </div>
        }
      />

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Global Infrastructure KPIs via MetricCard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Empresas Cadastradas"
          value={totalTenants}
          helperText={`${activeTenants} ativas${suspendedTenants > 0 ? ` · ${suspendedTenants} suspensas` : ''}`}
          tone="primary"
        />
        <MetricCard
          label="Usuários Cadastrados"
          value={totalActiveUsers}
          helperText={`de ${totalUsersCapacity} vagas contratadas`}
          tone="neutral"
        />
        <MetricCard
          label="Domínios Customizados"
          value={tenants.filter((t) => t.customDomain).length}
          helperText="Endereços personalizados ativos"
          tone="warning"
        />
        <MetricCard
          label="Segurança de Dados"
          value="Ambiente Seguro"
          helperText="Isolamento total por empresa"
          tone="success"
        />
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'tenants'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="h-4 w-4" />
          Lista de Empresas
        </button>
        <button
          onClick={() => setActiveTab('health_consumo')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'health_consumo'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Activity className="h-4 w-4" />
          Consumo & Saúde SaaS
        </button>
      </div>

      {activeTab === 'tenants' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
          {/* Table Toolbar / Filter Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, slug, CNPJ ou domínio..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="ALL">Todos os Status</option>
                <option value="ACTIVE">Somente Ativos</option>
                <option value="SUSPENDED">Somente Suspensos</option>
              </select>

              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="ALL">Todos os Planos</option>
                <option value="STARTER">STARTER</option>
                <option value="PRO">PRO</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
                <option value="CUSTOM">CUSTOM</option>
              </select>

              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 pl-1">
                {filteredTenants.length} de {tenants.length}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100/80 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Empresa / White Label</th>
                  <th className="p-3.5">Slug & Subdomínio</th>
                  <th className="p-3.5">Domínio Personalizado</th>
                  <th className="p-3.5">Plano</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Usuários & Propostas</th>
                  <th className="p-3.5">Armazenamento</th>
                  <th className="p-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                      Nenhuma empresa encontrada com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => {
                    const isActive = t.status === 'ACTIVE';
                    const isCurrentInspected = adminContext.context?.targetTenantId === t.id;

                    return (
                      <tr
                        key={t.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                          isCurrentInspected ? 'bg-purple-50/60 dark:bg-purple-950/30' : ''
                        }`}
                      >
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            {t.whiteLabel?.logoUrl ? (
                              <img
                                src={t.whiteLabel.logoUrl}
                                alt={t.name}
                                className="h-7 w-7 rounded object-contain border border-slate-200 dark:border-slate-700 bg-white"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div
                                className="h-7 w-7 rounded text-white font-bold flex items-center justify-center text-[10px]"
                                style={{ backgroundColor: t.whiteLabel?.primaryColor || '#2563eb' }}
                              >
                                {t.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-slate-900 dark:text-slate-100">{t.name}</div>
                              <div className="text-[11px] text-slate-400 dark:text-slate-500">{t.cnpj || 'CNPJ não informado'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-[11px]">
                          <span className="text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-900/60 px-2 py-0.5 rounded font-bold">
                            {t.slug}.sentinelconsig.com.br
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-[11px]">
                          {t.customDomain ? (
                            <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded font-bold flex items-center gap-1 w-fit">
                              <Globe className="h-3 w-3" />
                              <span>{t.customDomain}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Nenhum</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                              t.plan === 'ENTERPRISE'
                                ? 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                                : t.plan === 'PRO'
                                ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                                : t.plan === 'CUSTOM'
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                            }`}
                          >
                            {t.plan}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isActive
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                            }`}
                          >
                            {isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            <span>{isActive ? 'Ativo' : 'Suspenso'}</span>
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {t._count?.users || 0} / {t.maxUsers} usuários
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500">
                            {t._count?.proposals || 0} propostas cadastradas
                          </div>
                        </td>
                        <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                          {(t.storageLimitMb / 1024).toFixed(1)} GB
                        </td>
                        <td className="p-3.5 text-right space-x-1.5">
                          {isCurrentInspected ? (
                            <button
                              onClick={handleExitContextSwitch}
                              className="px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/80 hover:bg-rose-200 rounded border border-rose-300 dark:border-rose-800 transition-all cursor-pointer"
                            >
                              Sair Inspeção
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartContextSwitch(t.id, t.name)}
                              className="px-2.5 py-1 text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/70 hover:bg-purple-100 dark:hover:bg-purple-900/60 rounded border border-purple-200 dark:border-purple-800 transition-all cursor-pointer"
                              title="Inspecionar dados operacionais desta empresa"
                            >
                              Inspecionar
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenEditModal(t)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                            title="Editar Empresa & Identidade Visual"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>

                          {isActive ? (
                            <button
                              onClick={() => handleSuspendTenant(t.id, t.name)}
                              className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded cursor-pointer"
                              title="Suspender Empresa Imediatamente"
                            >
                              <Lock className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivateTenant(t.id)}
                              className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded cursor-pointer"
                              title="Reativar Empresa"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {t.id !== 'sentinel-consig' && (
                            <button
                              onClick={() => handleRequestDelete(t)}
                              className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded cursor-pointer animate-in fade-in"
                              title="Excluir Empresa (Soft-Delete)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'health_consumo' && (
        <div className="space-y-6">
          {/* Health Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total de Empresas</span>
              <div className="text-2xl font-black text-slate-950 dark:text-slate-50 mt-1">{overviewData.length}</div>
              <p className="text-xs text-slate-500 mt-1">Empresas registradas</p>
            </div>
            
            <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/60 shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-500 font-bold">Empresas em Operação Normal</span>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                {overviewData.filter(d => d.healthStatus === 'EXCELLENT' || d.healthStatus === 'GOOD').length}
              </div>
              <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1 font-semibold">Excelente / Saudável (THS &gt;= 75)</p>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/60 shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-500 font-bold">Empresas em Atenção</span>
              <div className="text-2xl font-black text-blue-700 dark:text-blue-400 mt-1">
                {overviewData.filter(d => d.healthStatus === 'ATTENTION').length}
              </div>
              <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-1 font-semibold">Acompanhamento preventivo (THS 60-74)</p>
            </div>

            <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/60 shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-500 font-bold">Risco / Crítico</span>
              <div className="text-2xl font-black text-rose-700 dark:text-rose-400 mt-1">
                {overviewData.filter(d => d.healthStatus === 'CRITICAL' || d.healthStatus === 'RISK').length}
              </div>
              <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1 font-semibold">Ação corretiva necessária (THS &lt; 60)</p>
            </div>
          </div>

          {/* Warning list */}
          {overviewData.some(d => d.users.percent >= 95 || d.storage.percent >= 95) && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-200">
              <h3 className="text-xs font-bold flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>ALERTAS DE SATURAÇÃO DE CAPACIDADE ATIVOS</span>
              </h3>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-2">
                As seguintes empresas atingiram ou excederam 95% das cotas de recursos contratadas e necessitam de upgrade de plano:
              </p>
              <div className="flex flex-wrap gap-2">
                {overviewData.map(d => {
                  const nearLimit = d.users.percent >= 95 || d.storage.percent >= 95;
                  if (!nearLimit) return null;
                  return (
                    <span key={d.id} className="text-[10px] font-extrabold bg-amber-100 dark:bg-amber-900/80 border border-amber-200 dark:border-amber-800 px-2 py-1 rounded-lg">
                      {d.name} ({d.users.percent >= 95 ? 'Usuários ' : ''}{d.storage.percent >= 95 ? 'Espaço' : ''})
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Consolidado Overview Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Monitoramento de Capacidade & Saúde Individual</h3>
              <button
                onClick={fetchOverviewData}
                disabled={isOverviewLoading}
                className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-extrabold uppercase px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
              >
                <RefreshCw className={`h-3 w-3 ${isOverviewLoading ? 'animate-spin' : ''}`} />
                <span>Recarregar</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100/80 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5">Empresa</th>
                    <th className="p-3.5">Plano</th>
                    <th className="p-3.5">Health Score (SaaS THS)</th>
                    <th className="p-3.5">Usuários Ativos (Cota)</th>
                    <th className="p-3.5">Propostas Totais (Cota)</th>
                    <th className="p-3.5">Espaço Utilizado (Cota)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isOverviewLoading && overviewData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                        Carregando dados de consumo do servidor...
                      </td>
                    </tr>
                  ) : overviewData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                        Nenhum dado consolidado disponível.
                      </td>
                    </tr>
                  ) : (
                    overviewData.map((d) => {
                      const hStyles = getHealthStyles(d.healthStatus);
                      const uStyles = getStatusStyles(d.users.status);
                      const pStyles = getStatusStyles(d.proposals.status);
                      const sStyles = getStatusStyles(d.storage.status);

                      return (
                        <tr key={d.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                            {d.name}
                          </td>
                          <td className="p-3.5 font-bold text-slate-500 dark:text-slate-400">
                            {d.plan}
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-3">
                              <span className={`text-[11px] font-black px-2.5 py-1 border rounded-lg ${hStyles.bg} ${hStyles.text} ${hStyles.border}`}>
                                {d.healthScore} - {d.healthStatus}
                              </span>
                              <div className="w-20 bg-slate-100 dark:bg-slate-850 h-1.5 rounded-full overflow-hidden shrink-0">
                                <div
                                  className="h-full bg-blue-600"
                                  style={{ width: `${d.healthScore}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{d.users.active} / {d.users.limit || '∞'}</span>
                                <span className={`font-black ${uStyles.text}`}>{d.users.percent}%</span>
                              </div>
                              <div className="w-28 bg-slate-100 dark:bg-slate-850 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${uStyles.bar}`}
                                  style={{ width: `${Math.min(100, d.users.percent)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{d.proposals.total} / {d.proposals.limit || '∞'}</span>
                                <span className={`font-black ${pStyles.text}`}>{d.proposals.percent}%</span>
                              </div>
                              <div className="w-28 bg-slate-100 dark:bg-slate-850 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${pStyles.bar}`}
                                  style={{ width: `${Math.min(100, d.proposals.percent)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{d.storage.usedMb} MB / {d.storage.limitMb} MB</span>
                                <span className={`font-black ${sStyles.text}`}>{d.storage.percent}%</span>
                              </div>
                              <div className="w-28 bg-slate-100 dark:bg-slate-850 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${sStyles.bar}`}
                                  style={{ width: `${Math.min(100, d.storage.percent)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Create/Edit Tenant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingTenant ? 'Editar Empresa & Identidade Visual' : 'Cadastrar Nova Empresa'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer text-base"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {editingTenant && (
              <div className="flex border-b border-slate-100 dark:border-slate-800 mb-4">
                <button
                  type="button"
                  onClick={() => setModalTab('config')}
                  className={`px-4 py-2 border-b-2 text-xs font-bold transition-all ${
                    modalTab === 'config'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Configurações Gerais
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('domains')}
                  className={`px-4 py-2 border-b-2 text-xs font-bold transition-all ${
                    modalTab === 'domains'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Domínios da Empresa
                </button>
              </div>
            )}

            {modalTab === 'config' ? (
              <form onSubmit={handleSaveTenant} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Nome da Empresa *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Ex: CredFácil Financeira"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Slug (Subdomínio) *</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                    placeholder="Ex: credfacil"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    Acesso: {slug ? `${slug.toLowerCase().trim()}.sentinelconsig.com.br` : 'slug.sentinelconsig.com.br'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Domínio Personalizado (Opcional)</label>
                  <input
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="Ex: app.credfacil.com.br"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">CNAME apontando para a plataforma</span>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">CNPJ</label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Nome Fantasia / Comercial</label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    placeholder="Ex: CredFácil Consignados"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Plano SaaS</label>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as TenantPlan)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="STARTER">STARTER (Até 5 Usuários)</option>
                    <option value="PRO">PRO (Até 15 Usuários)</option>
                    <option value="ENTERPRISE">ENTERPRISE (Ilimitado / 50+)</option>
                    <option value="CUSTOM">CUSTOM (Personalizado)</option>
                  </select>
                </div>
              </div>

              {/* Se for criação, solicita dados do admin do tenant */}
              {!editingTenant && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] block uppercase tracking-wider">
                    Usuário Administrador Inicial da Empresa
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Nome do Administrador</label>
                      <input
                        type="text"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="Ex: Carlos Mendes"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">E-mail do Administrador</label>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@empresa.com.br"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* White Label Settings */}
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/50 space-y-3">
                <span className="font-bold text-blue-900 dark:text-blue-300 text-[11px] flex items-center gap-1.5 uppercase tracking-wider">
                  <Palette className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Identidade Visual & Cores (White Label)</span>
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Cor Primária</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-slate-300 dark:border-slate-700 p-0"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 text-[11px] font-mono text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Cor Secundária</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-slate-300 dark:border-slate-700 p-0"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 text-[11px] font-mono text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Cor Destaque</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-slate-300 dark:border-slate-700 p-0"
                      />
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 text-[11px] font-mono text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">URL do Logotipo</label>
                    <input
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">E-mail de Suporte White Label</label>
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      placeholder="suporte@empresa.com.br"
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Limites & Cotas */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Limite de Usuários</label>
                  <input
                    type="number"
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(Number(e.target.value))}
                    min={1}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Armazenamento (MB)</label>
                  <input
                    type="number"
                    value={storageLimitMb}
                    onChange={(e) => setStorageLimitMb(Number(e.target.value))}
                    min={100}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Cota Propostas</label>
                  <input
                    type="number"
                    value={maxProposals}
                    onChange={(e) => setMaxProposals(Number(e.target.value))}
                    min={100}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Módulos Habilitados */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Módulos Habilitados para esta Empresa</span>
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setSelectedModules(AVAILABLE_MODULES.map((m) => m.id))}
                      className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                    >
                      Marcar Todos
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setSelectedModules([])}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {AVAILABLE_MODULES.map((mod) => {
                    const isChecked = selectedModules.includes(mod.id);
                    return (
                      <label
                        key={mod.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer select-none ${
                          isChecked
                            ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-slate-900 dark:text-slate-100'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleModule(mod.id)}
                          className="h-3.5 w-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
                        />
                        <span>{mod.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Empresa'}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-1">
              <DomainManagement tenantId={editingTenant?.id} />
              <div className="flex items-center justify-end pt-3 border-t border-slate-200 dark:border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors text-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Soft Delete Confirmation Modal */}
      {isDeleteModalOpen && tenantToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-rose-100 dark:border-rose-950/60 shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4 mb-5">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-lg text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-rose-950 dark:text-rose-300">Excluir Empresa</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Esta ação desativa a empresa de forma permanente no ambiente operacional e encerra todas as sessões.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-lg p-3.5 mb-5 space-y-2 text-xs">
              <div>
                <span className="font-bold text-slate-400 block uppercase text-[10px]">Empresa</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{tenantToDelete.name}</span>
              </div>
              <div>
                <span className="font-bold text-slate-400 block uppercase text-[10px]">Slug / Domínio</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{tenantToDelete.slug}.sentinelconsig.com.br</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                <div>
                  <span className="font-bold text-slate-400 block uppercase text-[9px]">Usuários</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{tenantToDelete._count?.users ?? 0}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-400 block uppercase text-[9px]">Propostas</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{tenantToDelete._count?.proposals ?? 0}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-400 block uppercase text-[9px]">Documentos</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{tenantToDelete._count?.documents ?? 0}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Para confirmar, digite o nome completo da empresa abaixo:
                </label>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={tenantToDelete.name}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
                />
              </div>

              {deleteError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 p-2.5 rounded-lg border border-rose-100 dark:border-rose-900/30">
                  {deleteError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting || confirmName !== tenantToDelete.name}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 font-semibold text-xs text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <span>Confirmar Exclusão</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
