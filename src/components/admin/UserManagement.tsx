import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  CheckCircle2,
  Shield,
  Trash2,
  KeyRound,
  Edit2,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  X,
  UserCheck,
  Building2,
  Lock,
  Search,
  UserPlus,
  Filter,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { User, Role, Tenant } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { NewUserCredentialsModal } from './NewUserCredentialsModal';
import { getRoleEmoji, ROLE_CONFIG } from '../../lib/roleUtils';
import {
  PERMISSION_CATEGORIES,
  Permission,
  getPermissionsForRole,
  ALL_PERMISSIONS,
  hasPermission,
} from '../../lib/permissions';
import { ActionBar } from '../common/ActionBar';
import { MetricCard } from '../common/MetricCard';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>(() => StorageService.getUsers());
  const activeUser = StorageService.getActiveUser();
  const isPlatformMaster = activeUser.role === 'PLATFORM_MASTER';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('DIGITADOR');
  const [selectedTenantId, setSelectedTenantId] = useState<string>(activeUser.tenantId || 'tenant_evolve');
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>(() =>
    getPermissionsForRole('DIGITADOR')
  );

  const [showPermissionSelector, setShowPermissionSelector] = useState(false);
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [message, setMessage] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch =
        !searchTerm ||
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && u.active) ||
        (statusFilter === 'INACTIVE' && !u.active);
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const activeCount = users.filter(u => u.active).length;
  const pendingFirstLoginCount = users.filter(u => u.mustChangePassword).length;
  const distinctRolesCount = new Set(users.map(u => u.role)).size;

  // Edit user modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<Role>('DIGITADOR');
  const [editActive, setEditActive] = useState(true);
  const [editTenantId, setEditTenantId] = useState('');
  const [editPermissions, setEditPermissions] = useState<Permission[]>([]);

  const [credentialsModal, setCredentialsModal] = useState<{
    isOpen: boolean;
    user: User | null;
    tempPassword: string;
    isReset?: boolean;
  }>({
    isOpen: false,
    user: null,
    tempPassword: '',
  });

  useEffect(() => {
    if (isPlatformMaster) {
      fetch('/api/tenants')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setTenants(data);
        })
        .catch(() => {});
    }
  }, [isPlatformMaster]);

  // When creation role changes, pre-populate default permissions
  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    setSelectedPermissions(getPermissionsForRole(newRole));
  };

  // Toggle single permission in creation form
  const togglePermission = (pId: Permission) => {
    setSelectedPermissions(prev =>
      prev.includes(pId) ? prev.filter(p => p !== pId) : [...prev, pId]
    );
  };

  const handleSelectAllPermissions = () => {
    setSelectedPermissions([...ALL_PERMISSIONS]);
  };

  const handleClearAllPermissions = () => {
    setSelectedPermissions([]);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    try {
      const created = StorageService.createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        active: true,
        tenantId: selectedTenantId,
        customPermissions: selectedPermissions,
      });

      setUsers(StorageService.getUsers());
      setName('');
      setEmail('');
      setSelectedPermissions(getPermissionsForRole('DIGITADOR'));
      setRole('DIGITADOR');
      setShowPermissionSelector(false);

      setCredentialsModal({
        isOpen: true,
        user: created,
        tempPassword: created.password || '',
        isReset: false,
      });
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar usuário.');
    }
  };

  // Open Edit User Modal
  const handleOpenEditModal = (u: User) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditActive(u.active);
    setEditTenantId(u.tenantId || activeUser.tenantId || 'tenant_evolve');
    setEditPermissions(
      u.customPermissions && u.customPermissions.length > 0
        ? (u.customPermissions as Permission[])
        : getPermissionsForRole(u.role)
    );
  };

  const handleEditRoleChange = (newRole: Role) => {
    setEditRole(newRole);
    setEditPermissions(getPermissionsForRole(newRole));
  };

  const toggleEditPermission = (pId: Permission) => {
    setEditPermissions(prev =>
      prev.includes(pId) ? prev.filter(p => p !== pId) : [...prev, pId]
    );
  };

  const handleSaveEditUser = () => {
    if (!editingUser) return;

    try {
      StorageService.updateUser(editingUser.id, {
        name: editName.trim(),
        role: editRole,
        active: editActive,
        tenantId: editTenantId,
        customPermissions: editPermissions,
      });

      setUsers(StorageService.getUsers());
      setEditingUser(null);
      setMessage(`Usuário ${editName} atualizado com sucesso!`);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar usuário.');
    }
  };

  const handleResetPassword = (u: User) => {
    try {
      const res = StorageService.resetUserPassword(u.id);
      setUsers(StorageService.getUsers());
      setCredentialsModal({
        isOpen: true,
        user: res.user,
        tempPassword: res.tempPassword,
        isReset: true,
      });
    } catch (err: any) {
      alert(err.message || 'Erro ao redefinir senha.');
    }
  };

  const handleSwitchUser = (u: User) => {
    StorageService.setActiveUser(u);
    window.location.reload();
  };

  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    itemType: string;
    itemName: string;
    description?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    itemType: '',
    itemName: '',
    onConfirm: () => {},
  });

  const handleDeleteUser = (u: User) => {
    if (u.id === activeUser.id) {
      alert('Você não pode excluir o seu próprio usuário logado.');
      return;
    }
    if (u.isMasterProtected || u.role === 'PLATFORM_MASTER') {
      alert('Usuários PLATFORM_MASTER protegidos não podem ser excluídos por esta ação.');
      return;
    }

    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Usuário do Sistema',
      itemName: `${u.name} (${u.email})`,
      description: `O acesso do perfil ${u.role} será revogado e excluído do sistema.`,
      onConfirm: () => {
        try {
          StorageService.deleteUser(u.id);
          setUsers(StorageService.getUsers());
          setMessage(`Usuário ${u.name} excluído com sucesso.`);
          setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir usuário.');
        }
      },
    });
  };

  const roleColors: Record<Role, string> = {
    PLATFORM_MASTER: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200',
    MASTER: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200',
    TENANT_ADMIN: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-200',
    GESTOR: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-200',
    GERENTE: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200',
    SUPORTE: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200',
    DIGITADOR: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200',
    SIMULACAO: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200',
  };

  return (
    <div className="space-y-6">
      <ActionBar
        title="Usuários & Permissões de Acesso"
        subtitle="Gerenciamento de operadores, perfis de acesso e permissões por módulo do sistema"
        badge={`${users.length} Operadores`}
        actions={
          <button
            type="button"
            onClick={() => setShowCreateCard(!showCreateCard)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 shadow-xs transition-colors cursor-pointer"
          >
            {showCreateCard ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            <span>{showCreateCard ? 'Fechar Cadastro' : 'Novo Operador'}</span>
          </button>
        }
      />

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total de Usuários"
          value={users.length}
          helperText="Base total de operadores"
        />
        <MetricCard
          label="Operadores Ativos"
          value={activeCount}
          tone="success"
          helperText={`${Math.round((activeCount / (users.length || 1)) * 100)}% com acesso liberado`}
        />
        <MetricCard
          label="1º Acesso Pendente"
          value={pendingFirstLoginCount}
          tone={pendingFirstLoginCount > 0 ? 'warning' : 'neutral'}
          helperText="Aguardando redefinição"
        />
        <MetricCard
          label="Perfis Distintos"
          value={distinctRolesCount}
          tone="primary"
          helperText="Papéis hierárquicos ativos"
        />
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5 shadow-2xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-semibold">{message}</span>
        </div>
      )}

      {/* User Creation Card (Toggleable or Expandable) */}
      {showCreateCard && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/20 p-5 shadow-2xs space-y-4 animate-in fade-in duration-150">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Cadastrar Novo Operador</span>
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
              Sessão Ativa: <strong>{activeUser.email}</strong> ({activeUser.role})
            </span>
          </h3>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Carlos Oliveira"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">E-mail *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com.br"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Perfil de Acesso *</label>
                <select
                  value={role}
                  onChange={e => handleRoleChange(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-hidden"
                >
                  {isPlatformMaster && <option value="PLATFORM_MASTER">⚡ PLATFORM_MASTER (Global)</option>}
                  <option value="TENANT_ADMIN">🏢 TENANT_ADMIN (Admin Empresa)</option>
                  <option value="MASTER">👑 MASTER (Master Operacional)</option>
                  <option value="GESTOR">🛡️ GESTOR</option>
                  <option value="GERENTE">🎯 GERENTE</option>
                  <option value="SUPORTE">🎧 SUPORTE</option>
                  <option value="DIGITADOR">⌨️ DIGITADOR</option>
                  <option value="SIMULACAO">📊 SIMULACAO</option>
                </select>
              </div>

              {isPlatformMaster ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Empresa</label>
                  <select
                    value={selectedTenantId}
                    onChange={e => setSelectedTenantId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-hidden"
                  >
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                    {tenants.length === 0 && <option value="tenant_evolve">Evolve Gestão</option>}
                  </select>
                </div>
              ) : (
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setShowPermissionSelector(!showPermissionSelector)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Permissões ({selectedPermissions.length})</span>
                    </span>
                    {showPermissionSelector ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>

            {isPlatformMaster && (
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => setShowPermissionSelector(!showPermissionSelector)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer"
                >
                  <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Ajustar Permissões Granulares ({selectedPermissions.length} selecionadas)</span>
                  {showPermissionSelector ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            )}

            {/* Granular Permission Selector Collapsible */}
            {showPermissionSelector && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span>Ajuste Fino de Permissões Individuais</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      O perfil <strong>{role}</strong> inicia com {getPermissionsForRole(role).length} permissões padrão. Você pode personalizar abaixo.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllPermissions}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      Selecionar Todas
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllPermissions}
                      className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      Limpar Todas
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {PERMISSION_CATEGORIES.map(cat => {
                    const catPermIds = cat.permissions.map(p => p.id);
                    const selectedCount = catPermIds.filter(id => selectedPermissions.includes(id)).length;
                    const allCatSelected = selectedCount === catPermIds.length;

                    const toggleCategory = () => {
                      if (allCatSelected) {
                        setSelectedPermissions(prev => prev.filter(id => !catPermIds.includes(id)));
                      } else {
                        const newSet = new Set([...selectedPermissions, ...catPermIds]);
                        setSelectedPermissions(Array.from(newSet));
                      }
                    };

                    return (
                      <div key={cat.category} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                            {cat.label}
                          </span>
                          <button
                            type="button"
                            onClick={toggleCategory}
                            className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                          >
                            {allCatSelected ? 'Desmarcar Módulo' : 'Marcar Módulo'}
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {cat.permissions.map(perm => {
                            const isChecked = selectedPermissions.includes(perm.id);
                            return (
                              <label
                                key={perm.id}
                                className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm.id)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                                />
                                <span>{perm.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateCard(false)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2 shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Cadastrar Usuário</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User Table List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-0">
        {/* Table Filter Header */}
        <div className="p-4 bg-slate-50/70 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Todos os Perfis</option>
              {isPlatformMaster && <option value="PLATFORM_MASTER">PLATFORM_MASTER</option>}
              <option value="TENANT_ADMIN">TENANT_ADMIN</option>
              <option value="MASTER">MASTER</option>
              <option value="GESTOR">GESTOR</option>
              <option value="GERENTE">GERENTE</option>
              <option value="SUPORTE">SUPORTE</option>
              <option value="DIGITADOR">DIGITADOR</option>
              <option value="SIMULACAO">SIMULACAO</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Todos os Status</option>
              <option value="ACTIVE">Somente Ativos</option>
              <option value="INACTIVE">Somente Inativos</option>
            </select>

            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 pl-1">
              {filteredUsers.length} de {users.length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100/80 dark:bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Nome / Usuário</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Perfil de Acesso</th>
                <th className="px-4 py-3">Permissões</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Alternar Perfil</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                    Nenhum operador encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const isActive = activeUser.id === u.id;
                  const isMasterProtected = u.role === 'PLATFORM_MASTER' || u.isMasterProtected;
                  const activePermsCount = u.customPermissions?.length ?? getPermissionsForRole(u.role).length;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span>{u.name}</span>
                          {isActive && (
                            <span className="text-blue-600 dark:text-blue-400 text-[10px] font-bold bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                              (Você)
                            </span>
                          )}
                          {isMasterProtected && (
                            <span title="Usuário Protegido">
                              <Lock className="h-3 w-3 text-amber-500" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold text-[10px] border ${
                            ROLE_CONFIG[u.role]?.badgeClass || roleColors[u.role]
                          }`}
                        >
                          <span>{getRoleEmoji(u.role)}</span>
                          <span>{u.role}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-semibold border border-slate-200 dark:border-slate-700">
                          <Shield className="h-3 w-3 text-blue-500" />
                          {u.role === 'PLATFORM_MASTER' ? 'Global (Total)' : `${activePermsCount} permissões`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {u.active ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">
                              <CheckCircle2 className="h-3 w-3" /> Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-bold text-[11px]">
                              Desativado
                            </span>
                          )}
                          {u.mustChangePassword && (
                            <span className="block text-[9px] text-amber-800 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/60 w-max">
                              🔑 1º Acesso
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!isActive && (
                          <button
                            onClick={() => handleSwitchUser(u)}
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shadow-2xs"
                          >
                            Assumir Perfil
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                            title="Editar Usuário e Permissões"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => handleResetPassword(u)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                            title="Redefinir Senha Temporária"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>

                          {!isActive && !isMasterProtected && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                              title="Excluir Usuário"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
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

      {/* EDIT USER & PERMISSIONS MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Editar Usuário & Permissões Granulares
                </h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">E-mail (Inalterável)</label>
                <input
                  type="email"
                  value={editingUser.email}
                  disabled
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Perfil de Acesso</label>
                <select
                  value={editRole}
                  onChange={e => handleEditRoleChange(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  {isPlatformMaster && <option value="PLATFORM_MASTER">⚡ PLATFORM_MASTER</option>}
                  <option value="TENANT_ADMIN">🏢 TENANT_ADMIN</option>
                  <option value="MASTER">👑 MASTER</option>
                  <option value="GESTOR">🛡️ GESTOR</option>
                  <option value="GERENTE">🎯 GERENTE</option>
                  <option value="SUPORTE">🎧 SUPORTE</option>
                  <option value="DIGITADOR">⌨️ DIGITADOR</option>
                  <option value="SIMULACAO">📊 SIMULACAO</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status da Conta</label>
                <select
                  value={editActive ? 'active' : 'inactive'}
                  onChange={e => setEditActive(e.target.value === 'active')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="active">✅ Ativo</option>
                  <option value="inactive">🚫 Desativado / Suspenso</option>
                </select>
              </div>
            </div>

            {/* Granular Permissions Section in Modal */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <span>Permissões Específicas do Usuário ({editPermissions.length} de {ALL_PERMISSIONS.length})</span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPermissions([...ALL_PERMISSIONS])}
                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Marcar Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPermissions([])}
                    className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {PERMISSION_CATEGORIES.map(cat => (
                  <div key={cat.category} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block border-b border-slate-200 dark:border-slate-700 pb-1">
                      {cat.label}
                    </span>
                    {cat.permissions.map(perm => (
                      <label key={perm.id} className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editPermissions.includes(perm.id)}
                          onChange={() => toggleEditPermission(perm.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                        />
                        <span>{perm.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditUser}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={deleteModalConfig.onConfirm}
        itemType={deleteModalConfig.itemType}
        itemName={deleteModalConfig.itemName}
        description={deleteModalConfig.description}
      />

      {/* New Credentials Modal */}
      {credentialsModal.isOpen && credentialsModal.user && (
        <NewUserCredentialsModal
          isOpen={credentialsModal.isOpen}
          onClose={() => setCredentialsModal(prev => ({ ...prev, isOpen: false }))}
          user={credentialsModal.user}
          tempPassword={credentialsModal.tempPassword}
          isReset={credentialsModal.isReset}
        />
      )}
    </div>
  );
};
