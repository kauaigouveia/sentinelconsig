import {configurationColorValues} from '../../data/configurationColorValues';
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
  ShieldAlert,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { TenantPlan, TenantStatus } from '../../types';
import { formatDate } from '../../lib/utils';
import { realtimeHub } from '../../services/realtimeService';
import { ActionBar } from '../common/ActionBar';
import { MetricCard } from '../common/MetricCard';
import { DomainManagement } from '../admin/DomainManagement';
import { toastService } from '../ui/toastService';

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
  const [primaryColor, setPrimaryColor] = useState(configurationColorValues.color_2563eb);
  const [secondaryColor, setSecondaryColor] = useState(configurationColorValues.color_1e40af);
  const [accentColor, setAccentColor] = useState(configurationColorValues.color_3b82f6);
  const [logoUrl, setLogoUrl] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const handlePlatformLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetTenantId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Formato inválido. Use PNG, JPG ou WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormError('A imagem do logo deve ter no máximo 2MB.');
      return;
    }
    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = async evt => {
      if (evt.target?.result) {
        try {
          const res = await fetch('/api/upload/logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64: evt.target.result as string,
              mimeType: file.type,
              fileName: file.name,
              targetTenantId
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Falha ao enviar arquivo');
          setLogoUrl(data.logoUrl);
          setFormError(null);
        } catch (err: any) {
          setFormError(err.message);
        } finally {
          setIsSubmitting(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };


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

  // Bulk Delete State
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState('');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkResultSummary, setBulkResultSummary] = useState<{
    processed: number;
    cancelled: number;
    failed: number;
    failedDetails?: Array<{ tenantId: string; reason: string }>;
  } | null>(null);

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
          bg: 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)]',
          text: 'text-[var(--danger-text)] dark:text-[var(--danger-text)]',
          border: 'border-[var(--danger-border)] dark:border-[var(--danger-border)]',
          bar: 'bg-[var(--danger-bg)]'
        };
      case 'CRITICAL':
        return {
          bg: 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)]',
          text: 'text-[var(--danger-text)] dark:text-[var(--danger-text)]',
          border: 'border-[var(--danger-border)] dark:border-[var(--danger-border)]',
          bar: 'bg-[var(--danger-bg)]'
        };
      case 'ALERT':
        return {
          bg: 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)]',
          text: 'text-[var(--warning-text)] dark:text-[var(--warning-text)]',
          border: 'border-[var(--warning-border)] dark:border-[var(--warning-border)]',
          bar: 'bg-[var(--warning-bg)]'
        };
      case 'WARNING':
        return {
          bg: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)]',
          text: 'text-[var(--link)] dark:text-[var(--link)]',
          border: 'border-[var(--field-border)] dark:border-[var(--field-border)]',
          bar: 'bg-[var(--info-bg)]'
        };
      default: // NORMAL
        return {
          bg: 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)]',
          text: 'text-[var(--success-text)] dark:text-[var(--success-text)]',
          border: 'border-[var(--success-border)] dark:border-[var(--success-border)]',
          bar: 'bg-[var(--success-bg)]'
        };
    }
  };

  const getHealthStyles = (status: string) => {
    switch (status) {
      case 'EXCELLENT':
        return {
          bg: 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)]',
          text: 'text-[var(--success-text)] dark:text-[var(--success-text)]',
          border: 'border-[var(--success-border)] dark:border-[var(--success-border)]'
        };
      case 'GOOD':
        return {
          bg: 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)]',
          text: 'text-[var(--success-text)] dark:text-[var(--success-text)]',
          border: 'border-[var(--success-border)] dark:border-[var(--success-border)]'
        };
      case 'ATTENTION':
        return {
          bg: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)]',
          text: 'text-[var(--link)] dark:text-[var(--link)]',
          border: 'border-[var(--field-border)] dark:border-[var(--field-border)]'
        };
      case 'RISK':
        return {
          bg: 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)]',
          text: 'text-[var(--warning-text)] dark:text-[var(--warning-text)]',
          border: 'border-[var(--warning-border)] dark:border-[var(--warning-border)]'
        };
      case 'CRITICAL':
      default:
        return {
          bg: 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)]',
          text: 'text-[var(--danger-text)] dark:text-[var(--danger-text)]',
          border: 'border-[var(--danger-border)] dark:border-[var(--danger-border)]'
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
      const res = await fetch('/api/admin/context-status');
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
    setPrimaryColor(configurationColorValues.color_2563eb);
    setSecondaryColor(configurationColorValues.color_1e40af);
    setAccentColor(configurationColorValues.color_3b82f6);
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
    setPrimaryColor(t.whiteLabel?.primaryColor || configurationColorValues.color_2563eb);
    setSecondaryColor(t.whiteLabel?.secondaryColor || configurationColorValues.color_1e40af);
    setAccentColor(t.whiteLabel?.accentColor || configurationColorValues.color_3b82f6);
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
      toastService.success('Empresa suspensa', data.message || 'As sessões ativas foram encerradas.');
      await fetchTenants();
    } catch (err: any) {
      toastService.error('Não foi possível suspender a empresa', err.message || 'Tente novamente.');
    }
  };

  const handleReactivateTenant = async (tenantId: string) => {
    try {
      const res = await fetch(`/api/saas/tenants/${tenantId}/reactivate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao reativar tenant.');
      toastService.success('Empresa reativada', data.message || 'O acesso foi liberado novamente.');
      await fetchTenants();
    } catch (err: any) {
      toastService.error('Não foi possível reativar a empresa', err.message || 'Tente novamente.');
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
      const res = await fetch('/api/admin/switch-tenant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTenantId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Erro ao alternar contexto.');

      alert(`Modo de Inspeção ativado para: ${targetTenantName}`);
      StorageService.clearBusinessCache();
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Erro ao alternar contexto.');
    }
  };

  const handleExitContextSwitch = async () => {
    try {
      const res = await fetch('/api/admin/exit-context', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao sair do contexto.');

      alert('Contexto de inspeção encerrado.');
      StorageService.clearBusinessCache();
      window.location.reload();
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

  // Helper to identify root protected tenant
  const isRootTenant = useCallback((t: { id: string; slug: string }) => {
    return t.slug === "sentinel-consig";
  }, []);

  // Filtered tenants that are selectable (excluding protected root tenants)
  const selectableFilteredTenants = useMemo(() => {
    return filteredTenants.filter((t) => !isRootTenant(t));
  }, [filteredTenants, isRootTenant]);

  const isAllFilteredSelected =
    selectableFilteredTenants.length > 0 &&
    selectableFilteredTenants.every((t) => selectedTenantIds.has(t.id));

  const handleToggleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      const next = new Set(selectedTenantIds);
      selectableFilteredTenants.forEach((t) => next.delete(t.id));
      setSelectedTenantIds(next);
    } else {
      const next = new Set(selectedTenantIds);
      selectableFilteredTenants.forEach((t) => next.add(t.id));
      setSelectedTenantIds(next);
    }
  };

  const handleToggleSelectTenant = (id: string) => {
    const next = new Set(selectedTenantIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTenantIds(next);
  };

  const handleClearSelection = () => {
    setSelectedTenantIds(new Set());
  };

  const selectedTenantsList = useMemo(() => {
    return tenants.filter((t) => selectedTenantIds.has(t.id));
  }, [tenants, selectedTenantIds]);

  const handleConfirmBulkDelete = async () => {
    if (selectedTenantIds.size === 0) return;
    if (bulkConfirmText !== 'EXCLUIR') {
      setBulkDeleteError('Digite exatamente EXCLUIR para confirmar.');
      return;
    }

    setIsBulkDeleting(true);
    setBulkDeleteError(null);

    try {
      const res = await fetch('/api/saas/tenants/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantIds: Array.from(selectedTenantIds),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorText = data.message || data.error || 'Erro ao processar exclusão em massa de empresas.';
        const reasonText = data.reason ? ` (${data.reason})` : '';
        const stepText = data.step ? ` [${data.step}]` : '';
        throw new Error(`${errorText}${reasonText}${stepText}`);
      }

      // Clear business cache
      StorageService.clearBusinessCache();

      // Record result summary for modal feedback
      setBulkResultSummary({
        processed: data.processed ?? selectedTenantIds.size,
        cancelled: data.cancelled ?? 0,
        failed: data.failed ?? 0,
        failedDetails: data.failedDetails ?? [],
      });

      // Reset selection and form
      setSelectedTenantIds(new Set());
      setIsBulkDeleteModalOpen(false);
      setBulkConfirmText('');

      // Refresh list, overview and context
      await fetchTenants();
      await fetchOverviewData();
      await fetchContextStatus();
    } catch (err: any) {
      setBulkDeleteError(err.message || 'Erro ao excluir empresas em massa.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6 p2-platform-workspace">
      {/* Active Context Banner */}
      {adminContext.active && adminContext.context && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--info-bg)] text-[var(--text-primary)] border border-[var(--field-border)] shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--info-bg)] rounded-lg">
              <Eye className="h-5 w-5 text-[var(--link)]" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--link)]">Modo de Inspeção Ativo (Admin Scope)</span>
              <p className="text-sm font-black text-[var(--text-primary)]">
                Inspecionando dados operacionais de: <span className="underline">{adminContext.context.targetTenantName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleExitContextSwitch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] text-[var(--danger-text)] font-bold text-xs  transition-colors cursor-pointer"
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
        badge="MASTER OP"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTenants}
              className="flex items-center gap-1.5 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs font-semibold px-3 py-2 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] cursor-pointer transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs px-4 py-2 rounded-xl  transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Nova Empresa</span>
            </button>
          </div>
        }
      />

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)] text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--danger-text)] dark:text-[var(--danger-text)] shrink-0" />
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
      <div className="flex border-b border-[var(--field-border)] dark:border-[var(--field-border)] p2-platform-tabs">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'tenants'
              ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          <Building2 className="h-4 w-4" />
          Lista de Empresas
        </button>
        <button
          onClick={() => setActiveTab('health_consumo')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'health_consumo'
              ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          <Activity className="h-4 w-4" />
          Consumo & Saúde SaaS
        </button>
      </div>

      {activeTab === 'tenants' && (
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] overflow-hidden shadow-2xs">
          {/* Table Toolbar / Filter Header */}
          <div className="p-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, slug, CNPJ ou domínio..."
                className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
              >
                <option value="ALL">Todos os Status</option>
                <option value="ACTIVE">Somente Ativos</option>
                <option value="SUSPENDED">Somente Suspensos</option>
              </select>

              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
              >
                <option value="ALL">Todos os Planos</option>
                <option value="STARTER">STARTER</option>
                <option value="PRO">PRO</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
                <option value="CUSTOM">CUSTOM</option>
              </select>

              <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] pl-1">
                {filteredTenants.length} de {tenants.length}
              </span>
            </div>
          </div>

          {/* Contextual Bulk Action Bar */}
          {selectedTenantIds.size > 0 && (
            <div className="p-3 bg-[var(--bg-surface)] text-[var(--text-primary)] border-b border-[var(--field-border)] flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-full bg-[var(--info-bg)] text-[var(--text-primary)] font-black text-xs">
                  {selectedTenantIds.size}
                </span>
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  {selectedTenantIds.size === 1 ? 'empresa selecionada' : 'empresas selecionadas'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAllFiltered}
                  className="px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] rounded transition-colors cursor-pointer"
                >
                  {isAllFilteredSelected ? 'Desmarcar visíveis' : 'Selecionar todos'}
                </button>

                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] rounded transition-colors cursor-pointer"
                >
                  Limpar seleção
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBulkConfirmText('');
                    setBulkDeleteError(null);
                    setIsBulkDeleteModalOpen(true);
                  }}
                  className="px-3 py-1 text-xs font-bold text-[var(--danger-text)] bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] rounded-md  flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Excluir selecionadas</span>
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              <thead className="bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-canvas)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="p-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={handleToggleSelectAllFiltered}
                      disabled={selectableFilteredTenants.length === 0}
                      className="h-4 w-4 rounded border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] cursor-pointer disabled:opacity-90"
                      title="Selecionar todos os resultados visíveis do filtro atual"
                    />
                  </th>
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
              <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-xs">
                      Nenhuma empresa encontrada com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => {
                    const isActive = t.status === 'ACTIVE';
                    const isCurrentInspected = adminContext.context?.targetTenantId === t.id;
                    const isRoot = isRootTenant(t);
                    const isSelected = selectedTenantIds.has(t.id);

                    return (
                      <tr
                        key={t.id}
                        className={`hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors ${
                          isCurrentInspected ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)]' : ''
                        } ${isSelected ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)]' : ''}`}
                      >
                        <td className="p-3.5 w-10 text-center">
                          {isRoot ? (
                            <div className="flex items-center justify-center text-[var(--warning-text)] dark:text-[var(--warning-text)]" title="Empresa Raiz Protegida (Exclusão Bloqueada)">
                              <ShieldAlert className="h-4 w-4" />
                            </div>
                          ) : (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectTenant(t.id)}
                              className="h-4 w-4 rounded border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            {t.whiteLabel?.logoUrl ? (
                              <img
                                src={t.whiteLabel.logoUrl}
                                alt={t.name}
                                className="h-7 w-7 rounded object-contain border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)]"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div
                                className="h-7 w-7 rounded text-[var(--text-primary)] font-bold flex items-center justify-center text-[10px]"
                                style={{ backgroundColor: t.whiteLabel?.primaryColor || "var(--bg-surface)" }}
                              >
                                {t.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{t.name}</div>
                              <div className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">{t.cnpj || 'CNPJ não informado'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-[11px]">
                          <span className="text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border border-[var(--field-border)] dark:border-[var(--field-border)] px-2 py-0.5 rounded font-bold">
                            {t.slug}.sentinelconsig.com.br
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-[11px]">
                          {t.customDomain ? (
                            <span className="text-[var(--success-text)] dark:text-[var(--success-text)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] border border-[var(--success-border)] dark:border-[var(--success-border)] px-2 py-0.5 rounded font-bold flex items-center gap-1 w-fit">
                              <Globe className="h-3 w-3" />
                              <span>{t.customDomain}</span>
                            </span>
                          ) : (
                            <span className="text-[var(--text-secondary)] italic">Nenhum</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                              t.plan === 'ENTERPRISE'
                                ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]'
                                : t.plan === 'PRO'
                                ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]'
                                : t.plan === 'CUSTOM'
                                ? 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]'
                                : 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border-[var(--success-border)] dark:border-[var(--success-border)]'
                            }`}
                          >
                            {t.plan}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isActive
                                ? 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border-[var(--success-border)] dark:border-[var(--success-border)]'
                                : 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border-[var(--danger-border)] dark:border-[var(--danger-border)]'
                            }`}
                          >
                            {isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            <span>{isActive ? 'Ativo' : 'Suspenso'}</span>
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            {t._count?.users || 0} / {t.maxUsers} usuários
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                            {t._count?.proposals || 0} propostas cadastradas
                          </div>
                        </td>
                        <td className="p-3.5 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                          {(t.storageLimitMb / 1024).toFixed(1)} GB
                        </td>
                        <td className="p-3.5 text-right space-x-1.5">
                          {isCurrentInspected ? (
                            <button
                              onClick={handleExitContextSwitch}
                              className="px-2.5 py-1 text-[11px] font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] rounded border border-[var(--danger-border)] dark:border-[var(--danger-border)] transition-all cursor-pointer"
                            >
                              Sair Inspeção
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartContextSwitch(t.id, t.name)}
                              className="px-2.5 py-1 text-[11px] font-bold text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] rounded border border-[var(--field-border)] dark:border-[var(--field-border)] transition-all cursor-pointer"
                              title="Inspecionar dados operacionais desta empresa"
                            >
                              Inspecionar
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenEditModal(t)}
                            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] rounded cursor-pointer"
                            title="Editar Empresa & Identidade Visual"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>

                          {isActive ? (
                            <button
                              onClick={() => handleSuspendTenant(t.id, t.name)}
                              className="p-1.5 text-[var(--warning-text)] dark:text-[var(--warning-text)] hover:bg-[var(--warning-bg)] dark:hover:bg-[var(--warning-bg)] rounded cursor-pointer"
                              title="Suspender Empresa Imediatamente"
                            >
                              <Lock className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivateTenant(t.id)}
                              className="p-1.5 text-[var(--success-text)] dark:text-[var(--success-text)] hover:bg-[var(--success-bg)] dark:hover:bg-[var(--success-bg)] rounded cursor-pointer"
                              title="Reativar Empresa"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {t.id !== 'sentinel-consig' && (
                            <button
                              onClick={() => handleRequestDelete(t)}
                              className="p-1.5 text-[var(--danger-text)] dark:text-[var(--danger-text)] hover:bg-[var(--danger-bg)] dark:hover:bg-[var(--danger-bg)] rounded cursor-pointer animate-in fade-in"
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
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">Total de Empresas</span>
              <div className="text-2xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">{overviewData.length}</div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Empresas registradas</p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--success-bg)] dark:bg-[var(--success-bg)] border border-[var(--success-border)] dark:border-[var(--success-border)] shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--success-text)] dark:text-[var(--success-text)] font-bold">Empresas em Operação Normal</span>
              <div className="text-2xl font-black text-[var(--success-text)] dark:text-[var(--success-text)] mt-1">
                {overviewData.filter(d => d.healthStatus === 'EXCELLENT' || d.healthStatus === 'GOOD').length}
              </div>
              <p className="text-xs text-[var(--success-text)] dark:text-[var(--success-text)] mt-1 font-semibold">Excelente / Saudável (THS &gt;= 75)</p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)] font-bold">Empresas em Atenção</span>
              <div className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)] mt-1">
                {overviewData.filter(d => d.healthStatus === 'ATTENTION').length}
              </div>
              <p className="text-xs text-[var(--link)] dark:text-[var(--link)] mt-1 font-semibold">Acompanhamento preventivo (THS 60-74)</p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--danger-text)] dark:text-[var(--danger-text)] font-bold">Risco / Crítico</span>
              <div className="text-2xl font-black text-[var(--danger-text)] dark:text-[var(--danger-text)] mt-1">
                {overviewData.filter(d => d.healthStatus === 'CRITICAL' || d.healthStatus === 'RISK').length}
              </div>
              <p className="text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)] mt-1 font-semibold">Ação corretiva necessária (THS &lt; 60)</p>
            </div>
          </div>

          {/* Warning list */}
          {overviewData.some(d => d.users.percent >= 95 || d.storage.percent >= 95) && (
            <div className="p-4 rounded-xl bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] text-[var(--warning-text)] dark:text-[var(--warning-text)]">
              <h3 className="text-xs font-bold flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-[var(--warning-text)] dark:text-[var(--warning-text)] shrink-0" />
                <span>ALERTAS DE SATURAÇÃO DE CAPACIDADE ATIVOS</span>
              </h3>
              <p className="text-[11px] text-[var(--warning-text)] dark:text-[var(--warning-text)] mb-2">
                As seguintes empresas atingiram ou excederam 95% das cotas de recursos contratadas e necessitam de upgrade de plano:
              </p>
              <div className="flex flex-wrap gap-2">
                {overviewData.map(d => {
                  const nearLimit = d.users.percent >= 95 || d.storage.percent >= 95;
                  if (!nearLimit) return null;
                  return (
                    <span key={d.id} className="text-[10px] font-extrabold bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] px-2 py-1 rounded-lg">
                      {d.name} ({d.users.percent >= 95 ? 'Usuários ' : ''}{d.storage.percent >= 95 ? 'Espaço' : ''})
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Consolidado Overview Table */}
          <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider">Monitoramento de Capacidade & Saúde Individual</h3>
              <button
                onClick={fetchOverviewData}
                disabled={isOverviewLoading}
                className="flex items-center gap-1.5 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-[10px] font-extrabold uppercase px-2.5 py-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] cursor-pointer transition-colors"
              >
                <RefreshCw className={`h-3 w-3 ${isOverviewLoading ? 'animate-spin' : ''}`} />
                <span>Recarregar</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                <thead className="bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-canvas)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5">Empresa</th>
                    <th className="p-3.5">Plano</th>
                    <th className="p-3.5">Health Score (SaaS THS)</th>
                    <th className="p-3.5">Usuários Ativos (Cota)</th>
                    <th className="p-3.5">Propostas Totais (Cota)</th>
                    <th className="p-3.5">Espaço Utilizado (Cota)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                  {isOverviewLoading && overviewData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-xs">
                        Carregando dados de consumo do servidor...
                      </td>
                    </tr>
                  ) : overviewData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-xs">
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
                        <tr key={d.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors">
                          <td className="p-3.5 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            {d.name}
                          </td>
                          <td className="p-3.5 font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                            {d.plan}
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-3">
                              <span className={`text-[11px] font-black px-2.5 py-1 border rounded-lg ${hStyles.bg} ${hStyles.text} ${hStyles.border}`}>
                                {d.healthScore} - {d.healthStatus}
                              </span>
                              <div className="w-20 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] h-1.5 rounded-full overflow-hidden shrink-0">
                                <div
                                  className="h-full bg-[var(--info-bg)]"
                                  style={{ width: `${d.healthScore}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{d.users.active} / {d.users.limit || '∞'}</span>
                                <span className={`font-black ${uStyles.text}`}>{d.users.percent}%</span>
                              </div>
                              <div className="w-28 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] h-1.5 rounded-full overflow-hidden">
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
                                <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{d.proposals.total} / {d.proposals.limit || '∞'}</span>
                                <span className={`font-black ${pStyles.text}`}>{d.proposals.percent}%</span>
                              </div>
                              <div className="w-28 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] h-1.5 rounded-full overflow-hidden">
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
                                <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{d.storage.usedMb} MB / {d.storage.limitMb} MB</span>
                                <span className={`font-black ${sStyles.text}`}>{d.storage.percent}%</span>
                              </div>
                              <div className="w-28 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] h-1.5 rounded-full overflow-hidden">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] p-6  space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                {editingTenant ? 'Editar Empresa & Identidade Visual' : 'Cadastrar Nova Empresa'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer text-base"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)] text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[var(--danger-text)] shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {editingTenant && (
              <div className="flex border-b border-[var(--field-border)] dark:border-[var(--field-border)] mb-4">
                <button
                  type="button"
                  onClick={() => setModalTab('config')}
                  className={`px-4 py-2 border-b-2 text-xs font-bold transition-all ${
                    modalTab === 'config'
                      ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                  }`}
                >
                  Configurações Gerais
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('domains')}
                  className={`px-4 py-2 border-b-2 text-xs font-bold transition-all ${
                    modalTab === 'domains'
                      ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
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
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Nome da Empresa *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Ex: CredFácil Financeira"
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--field-border)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Slug (Subdomínio) *</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                    placeholder="Ex: credfacil"
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--field-border)]"
                  />
                  <span className="text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                    Acesso: {slug ? `${slug.toLowerCase().trim()}.sentinelconsig.com.br` : 'slug.sentinelconsig.com.br'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Domínio Personalizado (Opcional)</label>
                  <input
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="Ex: app.credfacil.com.br"
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--field-border)]"
                  />
                  <span className="text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">CNAME apontando para a plataforma</span>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">CNPJ</label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--field-border)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Nome Fantasia / Comercial</label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    placeholder="Ex: CredFácil Consignados"
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--field-border)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Plano SaaS</label>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as TenantPlan)}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--field-border)]"
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
                <div className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-3">
                  <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-[11px] block uppercase tracking-wider">
                    Usuário Administrador Inicial da Empresa
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Nome do Administrador</label>
                      <input
                        type="text"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="Ex: Carlos Mendes"
                        className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">E-mail do Administrador</label>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@empresa.com.br"
                        className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* White Label Settings */}
              <div className="p-3 bg-[var(--info-bg)] dark:bg-[var(--info-bg)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-3">
                <span className="font-bold text-[var(--link)] dark:text-[var(--link)] text-[11px] flex items-center gap-1.5 uppercase tracking-wider">
                  <Palette className="h-3.5 w-3.5 text-[var(--link)] dark:text-[var(--link)]" />
                  <span>Identidade Visual & Cores (White Label)</span>
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Cor Primária</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-[var(--field-border)] dark:border-[var(--field-border)] p-0"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-full rounded border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-1 text-[11px] font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Cor Secundária</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-[var(--field-border)] dark:border-[var(--field-border)] p-0"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-full rounded border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-1 text-[11px] font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Cor Destaque</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-[var(--field-border)] dark:border-[var(--field-border)] p-0"
                      />
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-full rounded border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-1 text-[11px] font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Logo (URL ou Arquivo)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                      />
                      <label className="px-2 py-1.5 bg-[var(--info-bg)] dark:bg-[var(--info-bg)] hover:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded text-xs font-bold flex items-center justify-center cursor-pointer transition-colors shrink-0">
                        Upload
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          onChange={(e) => editingTenant && handlePlatformLogoUpload(e, editingTenant.id)}
                          className="hidden"
                          disabled={isSubmitting}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">E-mail de Suporte White Label</label>
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      placeholder="suporte@empresa.com.br"
                      className="w-full rounded border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Limites & Cotas */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Limite de Usuários</label>
                  <input
                    type="number"
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(Number(e.target.value))}
                    min={1}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Armazenamento (MB)</label>
                  <input
                    type="number"
                    value={storageLimitMb}
                    onChange={(e) => setStorageLimitMb(Number(e.target.value))}
                    min={100}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Cota Propostas</label>
                  <input
                    type="number"
                    value={maxProposals}
                    onChange={(e) => setMaxProposals(Number(e.target.value))}
                    min={100}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Módulos Habilitados */}
              <div className="p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-[var(--link)] dark:text-[var(--link)]" />
                    <span>Módulos Habilitados para esta Empresa</span>
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setSelectedModules(AVAILABLE_MODULES.map((m) => m.id))}
                      className="text-[var(--link)] dark:text-[var(--link)] font-bold hover:underline cursor-pointer"
                    >
                      Marcar Todos
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setSelectedModules([])}
                      className="text-[var(--text-secondary)] hover:underline cursor-pointer"
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
                            ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]'
                            : 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleModule(mod.id)}
                          className="h-3.5 w-3.5 rounded text-[var(--link)] focus:ring-[var(--focus)] border-[var(--field-border)] dark:border-[var(--field-border)]"
                        />
                        <span>{mod.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer disabled:opacity-90 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-[var(--action)] text-[var(--action-ink)] font-bold hover:bg-[var(--action-hover)] cursor-pointer  disabled:opacity-90 flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Empresa'}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-1">
              <DomainManagement tenantId={editingTenant?.id} />
              <div className="flex items-center justify-end pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer transition-colors text-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-xs">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl border border-[var(--danger-border)] dark:border-[var(--danger-border)]  max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4 mb-5">
              <div className="p-3 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] rounded-lg text-[var(--danger-text)] dark:text-[var(--danger-text)]">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-[var(--danger-text)] dark:text-[var(--danger-text)]">Excluir Empresa</h3>
                <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
                  Esta ação desativa a empresa de forma permanente no ambiente operacional e encerra todas as sessões.
                </p>
              </div>
            </div>

            <div className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg p-3.5 mb-5 space-y-2 text-xs">
              <div>
                <span className="font-bold text-[var(--text-secondary)] block uppercase text-[10px]">Empresa</span>
                <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{tenantToDelete.name}</span>
              </div>
              <div>
                <span className="font-bold text-[var(--text-secondary)] block uppercase text-[10px]">Slug / Domínio</span>
                <span className="font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{tenantToDelete.slug}.sentinelconsig.com.br</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                <div>
                  <span className="font-bold text-[var(--text-secondary)] block uppercase text-[9px]">Usuários</span>
                  <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{tenantToDelete._count?.users ?? 0}</span>
                </div>
                <div>
                  <span className="font-bold text-[var(--text-secondary)] block uppercase text-[9px]">Propostas</span>
                  <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{tenantToDelete._count?.proposals ?? 0}</span>
                </div>
                <div>
                  <span className="font-bold text-[var(--text-secondary)] block uppercase text-[9px]">Documentos</span>
                  <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{tenantToDelete._count?.documents ?? 0}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1.5">
                  Para confirmar, digite o nome completo da empresa abaixo:
                </label>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={tenantToDelete.name}
                  className="w-full text-xs rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--danger-border)] focus:border-[var(--danger-border)]"
                />
              </div>

              {deleteError && (
                <p className="text-xs font-semibold text-[var(--danger-text)] dark:text-[var(--danger-text)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-2.5 rounded-lg border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
                  {deleteError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                  className="px-3.5 py-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] font-semibold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer disabled:opacity-90"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting || confirmName !== tenantToDelete.name}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] font-semibold text-xs text-[var(--danger-text)] cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
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

      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleteModalOpen && selectedTenantsList.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-xs">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl border border-[var(--danger-border)] dark:border-[var(--danger-border)]  max-w-xl w-full p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] rounded-xl text-[var(--danger-text)] dark:text-[var(--danger-text)]">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-[var(--danger-text)] dark:text-[var(--danger-text)]">
                  ATENÇÃO — Exclusão em Massa de Empresas
                </h3>
                <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">
                  Você está prestes a excluir <strong className="text-[var(--danger-text)] dark:text-[var(--danger-text)]">{selectedTenantsList.length} empresas</strong>.
                  A operação fará soft delete das empresas selecionadas e invalidará seus acessos/sessões conforme as regras existentes.
                </p>
              </div>
            </div>

            {/* List of Selected Tenants (first 10 preview) */}
            <div className="flex-1 overflow-y-auto mb-4 border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] p-3 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">
                Empresas Selecionadas para Cancelamento ({selectedTenantsList.length})
              </div>
              <div className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] text-xs">
                {selectedTenantsList.slice(0, 10).map((t) => (
                  <div key={t.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">{t.name}</div>
                      <div className="font-mono text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] truncate">
                        {t.slug}.sentinelconsig.com.br
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right text-[11px] shrink-0">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        t.status === 'ACTIVE'
                          ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)] dark:border-[var(--success-border)]'
                          : 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)] dark:border-[var(--danger-border)]'
                      }`}>
                        {t.status === 'ACTIVE' ? 'Ativo' : 'Suspenso'}
                      </span>
                      <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                        {t._count?.users ?? 0} usuários · {t._count?.proposals ?? 0} propostas · {t._count?.clients ?? 0} clientes
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {selectedTenantsList.length > 10 && (
                <div className="pt-2 text-center text-xs font-bold text-[var(--link)] dark:text-[var(--link)] border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                  + {selectedTenantsList.length - 10} outras empresas selecionadas
                </div>
              )}
            </div>

            {/* Extra Confirmation Step */}
            <div className="space-y-4 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1.5">
                  Digite <strong className="text-[var(--danger-text)] dark:text-[var(--danger-text)]">EXCLUIR</strong> para confirmar a operação em lote:
                </label>
                <input
                  type="text"
                  value={bulkConfirmText}
                  onChange={(e) => setBulkConfirmText(e.target.value)}
                  placeholder="EXCLUIR"
                  className="w-full text-xs font-mono font-bold uppercase rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-hidden focus:ring-2 focus:ring-[var(--danger-border)] focus:border-[var(--danger-border)]"
                />
              </div>

              {bulkDeleteError && (
                <p className="text-xs font-semibold text-[var(--danger-text)] dark:text-[var(--danger-text)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-2.5 rounded-lg border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
                  {bulkDeleteError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsBulkDeleteModalOpen(false);
                    setBulkConfirmText('');
                    setBulkDeleteError(null);
                  }}
                  disabled={isBulkDeleting}
                  className="px-4 py-2 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] font-semibold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer disabled:opacity-90"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkDelete}
                  disabled={isBulkDeleting || bulkConfirmText !== 'EXCLUIR'}
                  className="px-4 py-2 rounded-lg bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] font-bold text-xs text-[var(--danger-text)] cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed flex items-center gap-1.5  transition-all"
                >
                  {isBulkDeleting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Excluindo em Lote...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Excluir {selectedTenantsList.length} empresas</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Result Feedback Modal */}
      {bulkResultSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-xs">
          <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]  max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4 mb-4">
              <div className={`p-3 rounded-xl ${
                bulkResultSummary.failed === 0
                  ? 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)]'
                  : 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)]'
              }`}>
                {bulkResultSummary.failed === 0 ? (
                  <CheckCircle className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  {bulkResultSummary.failed === 0 ? 'EXCLUSÃO CONCLUÍDA' : 'EXCLUSÃO CONCLUÍDA COM RESSALVAS'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
                  Resumo detalhado da operação em lote:
                </p>
              </div>
            </div>

            <div className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg p-3.5 mb-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                <span className="text-[var(--text-secondary)]">Solicitadas / Processadas:</span>
                <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{bulkResultSummary.processed}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                <span className="text-[var(--success-text)] dark:text-[var(--success-text)] font-semibold">Canceladas com sucesso:</span>
                <span className="font-bold text-[var(--success-text)] dark:text-[var(--success-text)]">{bulkResultSummary.cancelled}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--danger-text)] dark:text-[var(--danger-text)] font-semibold">Falhas:</span>
                <span className="font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)]">{bulkResultSummary.failed}</span>
              </div>

              {bulkResultSummary.failedDetails && bulkResultSummary.failedDetails.length > 0 && (
                <div className="mt-3 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] block mb-1 text-[11px]">
                    Detalhes das falhas:
                  </span>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {bulkResultSummary.failedDetails.map((f, i) => (
                      <div key={i} className="text-[10px] text-[var(--danger-text)] dark:text-[var(--danger-text)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-1.5 rounded border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
                        <strong className="font-mono">{f.tenantId}</strong>: {f.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setBulkResultSummary(null)}
                className="px-4 py-2 rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-secondary)] font-bold text-xs hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface)] cursor-pointer transition-colors"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
