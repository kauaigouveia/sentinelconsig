import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { TenantPlan, TenantStatus } from '../../types';
import { formatDate } from '../../lib/utils';
import { realtimeHub } from '../../services/realtimeService';

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
  createdAt: string;
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

  // WhiteLabel edit fields
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [secondaryColor, setSecondaryColor] = useState('#1e40af');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [logoUrl, setLogoUrl] = useState('');
  const [supportEmail, setSupportEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const handleOpenCreateModal = () => {
    setEditingTenant(null);
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
    setName(t.name);
    setSlug(t.slug);
    setCustomDomain(t.customDomain || '');
    setTradeName(t.tradeName || '');
    setCnpj(t.cnpj || '');
    setPlan(t.plan);
    setMaxUsers(t.maxUsers);
    setStorageLimitMb(t.storageLimitMb);
    setMaxProposals(t.maxProposals || 10000);
    setPrimaryColor(t.whiteLabel?.primaryColor || '#2563eb');
    setSecondaryColor(t.whiteLabel?.secondaryColor || '#1e40af');
    setAccentColor(t.whiteLabel?.accentColor || '#3b82f6');
    setLogoUrl(t.whiteLabel?.logoUrl || '');
    setSupportEmail(t.whiteLabel?.supportEmail || '');
    setFormError(null);
    setIsModalOpen(true);
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white p-6 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white uppercase tracking-wider">
              PLATFORM MASTER ROOT
            </span>
            <span className="text-xs text-slate-400">PostgreSQL Cloud Database Multi-Tenant Central</span>
          </div>
          <h2 className="text-xl font-black tracking-tight">Central de Gestão SaaS, Tenants & Domínios</h2>
          <p className="text-xs text-slate-400">
            Controle oficial de instâncias, resolução de domínios, white label, cotas e suspensão imediata
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchTenants}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-700 cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Criar Nova Empresa (Tenant)</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Global Infrastructure KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Empresas (Tenants)</span>
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{totalTenants}</span>
            <span className="text-xs text-emerald-600 font-bold">{activeTenants} ativas</span>
            {suspendedTenants > 0 && <span className="text-xs text-amber-600 font-bold">({suspendedTenants} suspensas)</span>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Usuários Cadastrados</span>
            <Users className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{totalActiveUsers}</span>
            <span className="text-xs text-slate-500">de {totalUsersCapacity} vagas contratadas</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Resolução de Domínios</span>
            <Globe className="h-5 w-5 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-900">
              {tenants.filter((t) => t.customDomain).length}
            </span>
            <span className="text-xs text-slate-500">domínios customizados</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Banco Oficial</span>
            <Database className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-bold text-emerald-700">PostgreSQL (Shared Schema)</span>
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            <span>Empresas Cadastradas no PostgreSQL ({tenants.length})</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
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
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {tenants.map((t) => {
                const isActive = t.status === 'ACTIVE';
                const isCurrentInspected = adminContext.context?.targetTenantId === t.id;

                return (
                  <tr
                    key={t.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isCurrentInspected ? 'bg-purple-50/60' : ''
                    }`}
                  >
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        {t.whiteLabel?.logoUrl ? (
                          <img
                            src={t.whiteLabel.logoUrl}
                            alt={t.name}
                            className="h-7 w-7 rounded object-contain border border-slate-200"
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
                          <div className="font-bold text-slate-900">{t.name}</div>
                          <div className="text-[11px] text-slate-400">{t.cnpj || 'CNPJ não informado'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono text-[11px]">
                      <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold">
                        {t.slug}.sentinelconsig.com.br
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px]">
                      {t.customDomain ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold flex items-center gap-1 w-fit">
                          <Globe className="h-3 w-3" />
                          <span>{t.customDomain}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Nenhum</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          t.plan === 'ENTERPRISE'
                            ? 'bg-purple-100 text-purple-800'
                            : t.plan === 'PRO'
                            ? 'bg-blue-100 text-blue-800'
                            : t.plan === 'CUSTOM'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {t.plan}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        <span>{isActive ? 'Ativo' : 'Suspenso'}</span>
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-900">
                        {t._count?.users || 0} / {t.maxUsers} usuários
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {t._count?.proposals || 0} propostas cadastradas
                      </div>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800">
                      {(t.storageLimitMb / 1024).toFixed(1)} GB
                    </td>
                    <td className="p-3.5 text-right space-x-1.5">
                      {isCurrentInspected ? (
                        <button
                          onClick={handleExitContextSwitch}
                          className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded transition-all cursor-pointer"
                        >
                          Sair Inspeção
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartContextSwitch(t.id, t.name)}
                          className="px-2.5 py-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded transition-all cursor-pointer"
                          title="Inspecionar dados operacionais deste tenant"
                        >
                          Inspecionar
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEditModal(t)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded cursor-pointer"
                        title="Editar Tenant & White Label"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      {isActive ? (
                        <button
                          onClick={() => handleSuspendTenant(t.id, t.name)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded cursor-pointer"
                          title="Suspender Tenant Imediatamente"
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivateTenant(t.id)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                          title="Reativar Tenant"
                        >
                          <Unlock className="h-3.5 w-3.5" />
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

      {/* Modal Create/Edit Tenant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingTenant ? 'Editar Tenant & White Label' : 'Cadastrar Nova Empresa (Tenant)'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTenant} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nome da Empresa *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Ex: CredFácil Financeira"
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Slug (Subdomínio) *</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                    placeholder="Ex: credfacil"
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400">
                    Acesso: {slug ? `${slug.toLowerCase().trim()}.sentinelconsig.com.br` : 'slug.sentinelconsig.com.br'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Domínio Personalizado (Opcional)</label>
                  <input
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="Ex: app.credfacil.com.br"
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400">CNAME apontando para a plataforma</span>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">CNPJ</label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nome Fantasia / Comercial</label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    placeholder="Ex: CredFácil Consignados"
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Plano SaaS</label>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as TenantPlan)}
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
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
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <span className="font-bold text-slate-800 text-[11px] block uppercase tracking-wider">
                    Usuário Administrador Inicial do Tenant
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Nome do Administrador</label>
                      <input
                        type="text"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="Ex: Carlos Mendes"
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">E-mail do Administrador</label>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@empresa.com.br"
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* White Label Settings */}
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
                <span className="font-bold text-blue-900 text-[11px] flex items-center gap-1.5 uppercase tracking-wider">
                  <Palette className="h-3.5 w-3.5 text-blue-600" />
                  <span>Identidade Visual & Cores (White Label)</span>
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Cor Primária</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-slate-300 p-0"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-full rounded border border-slate-300 p-1 text-[11px] font-mono text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Cor Secundária</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-slate-300 p-0"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-full rounded border border-slate-300 p-1 text-[11px] font-mono text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Cor Destaque</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-slate-300 p-0"
                      />
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-full rounded border border-slate-300 p-1 text-[11px] font-mono text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">URL do Logotipo</label>
                    <input
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded border border-slate-300 p-1.5 text-xs text-slate-900 focus:outline-hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">E-mail de Suporte White Label</label>
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      placeholder="suporte@empresa.com.br"
                      className="w-full rounded border border-slate-300 p-1.5 text-xs text-slate-900 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Limites & Cotas */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Limite de Usuários</label>
                  <input
                    type="number"
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(Number(e.target.value))}
                    min={1}
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Armazenamento (MB)</label>
                  <input
                    type="number"
                    value={storageLimitMb}
                    onChange={(e) => setStorageLimitMb(Number(e.target.value))}
                    min={100}
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Cota Propostas</label>
                  <input
                    type="number"
                    value={maxProposals}
                    onChange={(e) => setMaxProposals(Number(e.target.value))}
                    min={100}
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar no PostgreSQL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
