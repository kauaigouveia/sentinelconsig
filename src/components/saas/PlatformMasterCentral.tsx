import React, { useState } from 'react';
import {
  Building2,
  Users,
  HardDrive,
  ShieldCheck,
  Server,
  Activity,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  Layers,
  Database,
  Lock,
  Download,
  UploadCloud,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Tenant, TenantPlan, TenantStatus } from '../../types';
import { formatCurrency, formatDate } from '../../lib/utils';

export const PlatformMasterCentral: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>(StorageService.getTenants());
  const [currentTenantId, setCurrentTenantId] = useState<string>(StorageService.getCurrentTenantId());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [plan, setPlan] = useState<TenantPlan>('PRO');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [maxUsers, setMaxUsers] = useState(15);
  const [storageLimitMb, setStorageLimitMb] = useState(1500);

  // Backup state
  const [backups, setBackups] = useState(StorageService.getBackupSnapshots());
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupLabel, setBackupLabel] = useState('');

  const activeUser = StorageService.getActiveUser();

  const refreshData = () => {
    setTenants(StorageService.getTenants());
    setCurrentTenantId(StorageService.getCurrentTenantId());
    setBackups(StorageService.getBackupSnapshots());
  };

  const handleOpenCreateModal = () => {
    setEditingTenant(null);
    setName('');
    setSlug('');
    setTradeName('');
    setCnpj('');
    setPlan('PRO');
    setAdminName('');
    setAdminEmail('');
    setMaxUsers(15);
    setStorageLimitMb(1500);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (t: Tenant) => {
    setEditingTenant(t);
    setName(t.name);
    setSlug(t.slug);
    setTradeName(t.tradeName || '');
    setCnpj(t.cnpj || '');
    setPlan(t.plan);
    setAdminName(t.adminName || '');
    setAdminEmail(t.adminEmail || '');
    setMaxUsers(t.maxUsers);
    setStorageLimitMb(t.storageLimitMb);
    setIsModalOpen(true);
  };

  const handleSaveTenant = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTenant) {
        StorageService.updateTenant({
          ...editingTenant,
          name,
          tradeName,
          cnpj,
          plan,
          adminName,
          adminEmail,
          maxUsers,
          storageLimitMb,
        });
      } else {
        StorageService.createTenant({
          name,
          slug,
          tradeName,
          cnpj,
          plan,
          adminName,
          adminEmail,
          maxUsers,
          storageLimitMb,
          status: 'ACTIVE',
          modules: ['ALL'],
          whiteLabel: {
            companyName: name,
            tradeName: tradeName || name,
            cnpj: cnpj || '00.000.000/0001-00',
            logoUrl: '',
            primaryColor: '#2563eb',
            accentColor: '#4f46e5',
            supportEmail: adminEmail || 'suporte@empresa.com.br',
            supportPhone: '(11) 99999-9999',
            footerText: `${name} - Sistema de Gestão de Crédito`,
          },
        });
      }
      setIsModalOpen(false);
      refreshData();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar tenant');
    }
  };

  const handleToggleStatus = (tenantId: string, currentStatus: TenantStatus) => {
    if (currentStatus === 'ACTIVE') {
      if (confirm('Deseja realmente suspender o acesso desta empresa?')) {
        StorageService.suspendTenant(tenantId);
      }
    } else {
      StorageService.activateTenant(tenantId);
    }
    refreshData();
  };

  const handleSwitchTenant = (tenantId: string) => {
    StorageService.setCurrentTenantId(tenantId);
    refreshData();
  };

  const handleGenerateBackup = () => {
    setIsCreatingBackup(true);
    setTimeout(() => {
      StorageService.createBackupSnapshot(backupLabel || undefined);
      setBackupLabel('');
      setIsCreatingBackup(false);
      refreshData();
    }, 400);
  };

  const handleRestoreBackup = (id: string) => {
    if (confirm('Atenção: Restaurar este snapshot substituirá os dados atuais pelo estado gravado no snapshot. Continuar?')) {
      try {
        StorageService.restoreBackupSnapshot(id);
        alert('Snapshot restaurado com sucesso!');
        refreshData();
      } catch (err: any) {
        alert(err.message || 'Erro ao restaurar snapshot');
      }
    }
  };

  // Aggregates
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(t => t.status === 'ACTIVE').length;
  const totalUsersCapacity = tenants.reduce((sum, t) => sum + t.maxUsers, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white p-6 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white uppercase tracking-wider">
              PLATFORM MASTER ROOT
            </span>
            <span className="text-xs text-slate-400">Multi-Tenant Management Console</span>
          </div>
          <h2 className="text-xl font-black tracking-tight">Central de Gestão SaaS & Tenants</h2>
          <p className="text-xs text-slate-400">
            Controle global de instâncias, planos, cotas de armazenamento, alternância de tenant e backups remotos
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Criar Nova Empresa (Tenant)</span>
          </button>
        </div>
      </div>

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
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Capacidade Total de Usuários</span>
            <Users className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{totalUsersCapacity}</span>
            <span className="text-xs text-slate-500">licenças contratadas</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Status da Infraestrutura</span>
            <Server className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-bold text-emerald-700">Firestore & Storage Online</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Tenant Ativo no Console</span>
            <Activity className="h-5 w-5 text-purple-600" />
          </div>
          <div className="mt-2 truncate">
            <span className="text-xs font-bold text-purple-800 bg-purple-50 px-2 py-1 rounded-md block truncate">
              {tenants.find(t => t.id === currentTenantId)?.name || 'Evolve Master'}
            </span>
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            <span>Empresas Cadastradas no Ecossistema SaaS ({tenants.length})</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Empresa / Razão Social</th>
                <th className="p-3.5">Slug / Domínio</th>
                <th className="p-3.5">Plano</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Cota Usuários</th>
                <th className="p-3.5">Armazenamento</th>
                <th className="p-3.5">Admin Contato</th>
                <th className="p-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {tenants.map(t => {
                const isCurrent = t.id === currentTenantId;
                const isActive = t.status === 'ACTIVE';

                return (
                  <tr key={t.id} className={`hover:bg-slate-50/80 transition-colors ${isCurrent ? 'bg-blue-50/40' : ''}`}>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">{t.name}</div>
                      <div className="text-[11px] text-slate-400">{t.cnpj || 'CNPJ não informado'}</div>
                    </td>
                    <td className="p-3.5 font-mono text-[11px]">
                      <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-bold">/{t.slug}</span>
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        t.plan === 'ENTERPRISE' ? 'bg-purple-100 text-purple-800' :
                        t.plan === 'PRO' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {t.plan}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        <span>{isActive ? 'Ativo' : 'Suspenso'}</span>
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800">
                      {t.maxUsers} usuários
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800">
                      {(t.storageLimitMb / 1024).toFixed(1)} GB
                    </td>
                    <td className="p-3.5">
                      <div className="text-slate-900 font-semibold">{t.adminName || 'Admin'}</div>
                      <div className="text-[11px] text-slate-400">{t.adminEmail}</div>
                    </td>
                    <td className="p-3.5 text-right space-x-1.5">
                      {isCurrent ? (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded">
                          Tenant Ativo
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSwitchTenant(t.id)}
                          className="px-2.5 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-all cursor-pointer"
                        >
                          Trocar p/ Esta
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEditModal(t)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded cursor-pointer"
                        title="Editar Tenant"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(t.id, t.status)}
                        className={`p-1.5 rounded cursor-pointer ${
                          isActive ? 'text-rose-500 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={isActive ? 'Suspender Tenant' : 'Ativar Tenant'}
                      >
                        {isActive ? <Lock className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backup & System Snapshots Console */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-600" />
              <span>Snapshots de Backup Remoto & Integridade</span>
            </h3>
            <p className="text-xs text-slate-500">
              Geração de backups completos do banco Firestore com checksum SHA-256 e restauração em 1-clique
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={backupLabel}
              onChange={e => setBackupLabel(e.target.value)}
              placeholder="Rótulo opcional do backup..."
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden"
            />
            <button
              onClick={handleGenerateBackup}
              disabled={isCreatingBackup}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4" />
              <span>{isCreatingBackup ? 'Gerando Snapshot...' : 'Gerar Snapshot Agora'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {backups.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 text-center">
              Nenhum snapshot de backup registrado ainda.
            </p>
          ) : (
            backups.map(snap => (
              <div
                key={snap.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-white transition-all text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                    <HardDrive className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">{snap.label}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {snap.checksumSha256} • {formatDate(snap.createdAt)} • {snap.recordsCount} registros
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">
                    {(snap.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                  <button
                    onClick={() => handleRestoreBackup(snap.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Restaurar</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal Create/Edit Tenant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {editingTenant ? 'Editar Empresa (Tenant)' : 'Nova Empresa no SaaS'}
            </h3>

            <form onSubmit={handleSaveTenant} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nome da Empresa</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="Ex: CredFácil Financeira"
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Slug (Subdomínio)</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    required
                    disabled={!!editingTenant}
                    placeholder="Ex: credfacil"
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">CNPJ</label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={e => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Plano SaaS</label>
                  <select
                    value={plan}
                    onChange={e => setPlan(e.target.value as TenantPlan)}
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  >
                    <option value="BASIC">BASIC (Até 5 Usuários)</option>
                    <option value="PRO">PRO (Até 15 Usuários)</option>
                    <option value="ENTERPRISE">ENTERPRISE (Ilimitado / 50+)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nome do Administrador</label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={e => setAdminName(e.target.value)}
                    placeholder="Ex: Carlos Mendes"
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">E-mail do Administrador</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    placeholder="admin@empresa.com.br"
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Limite de Usuários</label>
                  <input
                    type="number"
                    value={maxUsers}
                    onChange={e => setMaxUsers(Number(e.target.value))}
                    min={1}
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Limite de Armazenamento (MB)</label>
                  <input
                    type="number"
                    value={storageLimitMb}
                    onChange={e => setStorageLimitMb(Number(e.target.value))}
                    min={100}
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-blue-600 text-white font-bold hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  Salvar Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
