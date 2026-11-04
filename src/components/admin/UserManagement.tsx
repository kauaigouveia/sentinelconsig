import { UserDetailsModal } from './UserDetailsModal';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  AlertTriangle,
  Loader2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { User, Role, Tenant } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { NewUserCredentialsModal } from './NewUserCredentialsModal';
import { getRoleEmoji, ROLE_CONFIG } from '../../lib/roleUtils';
import { getRoleLabel } from '../../lib/roleLabels';
import {
  PERMISSION_CATEGORIES,
  Permission,
  getPermissionsForRole,
  getEffectivePermissions,
  DEFAULT_ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
  hasPermission,
} from '../../lib/permissions';
import { ActionBar } from '../common/ActionBar';
import { MetricCard } from '../common/MetricCard';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const activeUser = StorageService.getActiveUser();
  const isPlatformMaster = activeUser.role === 'PLATFORM_MASTER';
  const canViewUsers = isPlatformMaster || hasPermission(activeUser.role, activeUser.customPermissions, 'users.view');
  const canCreateUsers = isPlatformMaster || hasPermission(activeUser.role, activeUser.customPermissions, 'users.create');
  const canUpdateUsers = isPlatformMaster || hasPermission(activeUser.role, activeUser.customPermissions, 'users.update');
  const canDeleteUsers = isPlatformMaster || hasPermission(activeUser.role, activeUser.customPermissions, 'users.delete');
  const canResetPasswords = isPlatformMaster || hasPermission(activeUser.role, activeUser.customPermissions, 'users.reset_password');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('TENANT_ADMIN');
  const [selectedTenantId, setSelectedTenantId] = useState<string>(activeUser?.tenantId || '');
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>(() =>
    getPermissionsForRole('TENANT_ADMIN')
  );

  const [showPermissionSelector, setShowPermissionSelector] = useState(false);
  const [extraMemberships, setExtraMemberships] = useState<{ tenantId: string; role: Role }[]>([]);
  const [newExtraTenantId, setNewExtraTenantId] = useState('');
  const [newExtraRole, setNewExtraRole] = useState<Role>('TENANT_ADMIN');
  const [detailsUser, setDetailsUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [message, setMessage] = useState<string | null>(null);

  // Multi-selection & Bulk Delete states
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteConfirmationText, setBulkDeleteConfirmationText] = useState('');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteFeedback, setBulkDeleteFeedback] = useState<{
    isOpen: boolean;
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const fetchUsers = async () => {
    if (!canViewUsers) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar usuários.');
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch (err: any) {
      console.error(err);
      setLoadError(err.message || 'Erro ao carregar usuários do servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [canViewUsers]);

  useEffect(() => {
    const handleTenantChange = () => void fetchUsers();
    window.addEventListener('tenantUpdated', handleTenantChange);
    return () => window.removeEventListener('tenantUpdated', handleTenantChange);
  }, [canViewUsers]);

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

  // Multi-selection calculations
  const canSelectUserForDeletion = useCallback((user: User) =>
    user.id !== activeUser.id && (isPlatformMaster || user.role !== 'PLATFORM_MASTER'),
  [activeUser.id, isPlatformMaster]);
  const visibleUserIds = useMemo(
    () => filteredUsers.filter(canSelectUserForDeletion).map(u => u.id),
    [filteredUsers, canSelectUserForDeletion]
  );
  const isAllVisibleSelected =
    visibleUserIds.length > 0 && visibleUserIds.every(id => selectedUserIds.has(id));
  const isSomeVisibleSelected =
    visibleUserIds.some(id => selectedUserIds.has(id)) && !isAllVisibleSelected;

  const handleToggleSelectAll = () => {
    if (isAllVisibleSelected) {
      const next = new Set(selectedUserIds);
      visibleUserIds.forEach(id => next.delete(id));
      setSelectedUserIds(next);
    } else {
      const next = new Set(selectedUserIds);
      visibleUserIds.forEach(id => next.add(id));
      setSelectedUserIds(next);
    }
  };

  const handleToggleSelectUser = (id: string) => {
    const user = users.find(item => item.id === id);
    if (!user || !canSelectUserForDeletion(user)) return;
    const next = new Set(selectedUserIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedUserIds(next);
  };

  const handleClearSelection = () => {
    setSelectedUserIds(new Set());
  };

  const selectedUsers = useMemo(
    () => users.filter(u => selectedUserIds.has(u.id)),
    [users, selectedUserIds]
  );

  useEffect(() => {
    const selectableIds = new Set(users.filter(canSelectUserForDeletion).map(user => user.id));
    setSelectedUserIds(current => {
      const next = new Set([...current].filter(id => selectableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [users, canSelectUserForDeletion]);

  const containsSelf = selectedUsers.some(u => u.id === activeUser.id);
  const containsPlatformMaster = !isPlatformMaster && selectedUsers.some(u => u.role === 'PLATFORM_MASTER');
  const containsProtectedRoot = false; // Não existe usuário root. Apenas PLATFORM_MASTER.
  const isBulkDeleteBlocked = containsSelf || containsPlatformMaster;

  const handleExecuteBulkDelete = async () => {
    if (bulkDeleteConfirmationText.trim().toUpperCase() !== 'EXCLUIR') return;
    if (isBulkDeleteBlocked) {
      alert('A seleção contém usuários protegidos (você mesmo, MASTER OP ou root). A operação foi bloqueada.');
      return;
    }

    try {
      setIsBulkDeleting(true);
      const apiRes = await fetch('/api/saas/users/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selectedUserIds) }),
      });

      if (!apiRes.ok) {
        const errorData = await apiRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao realizar exclusão em massa no servidor.');
      }

      const res = await apiRes.json();
      await fetchUsers();
      setSelectedUserIds(new Set());
      setIsBulkDeleteModalOpen(false);
      setBulkDeleteConfirmationText('');
      setBulkDeleteFeedback({
        isOpen: true,
        success: true,
        message:
          res.message ||
          `Exclusão concluída: ${res.deleted || selectedUserIds.size} usuários processados com sucesso.`,
        details: res,
      });
    } catch (err: any) {
      setBulkDeleteFeedback({
        isOpen: true,
        success: false,
        message: err.message || 'Erro ao processar exclusão em massa de usuários.',
      });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Edit user modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<Role>('DIGITADOR');
  const [editActive, setEditActive] = useState(true);
  const [editTenantId, setEditTenantId] = useState('');
  const [editPermissions, setEditPermissions] = useState<Permission[]>([]);
  const [editMemberships, setEditMemberships] = useState<any[]>([]);

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
    fetch('/api/tenants')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTenants(data);
          if (!selectedTenantId && data.length > 0) {
            setSelectedTenantId(activeUser?.tenantId || data[0].id);
          }
        }
      })
      .catch(() => {});
  }, [activeUser?.tenantId]);

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

  const availablePermissions = isPlatformMaster
    ? ALL_PERMISSIONS
    : DEFAULT_ROLE_PERMISSIONS.TENANT_ADMIN;

  const handleSelectAllPermissions = () => {
    setSelectedPermissions([...availablePermissions]);
  };

  const handleClearAllPermissions = () => {
    setSelectedPermissions([]);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    try {
      setIsSubmitting(true);
      const passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      const passwordBytes = crypto.getRandomValues(new Uint8Array(12));
      const randomPassword = `Mudar@${Array.from(passwordBytes, byte => passwordAlphabet[byte % passwordAlphabet.length]).join('')}`;

      const allMemberships = [
        ...(selectedTenantId
          ? [{
              tenantId: selectedTenantId,
              role,
              customPermissions: selectedPermissions,
              active: true,
            }]
          : []),
        ...extraMemberships.map(m => ({
          tenantId: m.tenantId,
          role: m.role,
          customPermissions: getPermissionsForRole(m.role),
          active: true,
        })),
      ];

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password: randomPassword,
          role,
          tenantId: selectedTenantId || undefined,
          customPermissions: selectedPermissions,
          memberships: allMemberships,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao cadastrar usuário no servidor.');
      }

      const created = await res.json();
      await fetchUsers();
      setName('');
      setEmail('');
      setExtraMemberships([]);
      setSelectedPermissions(getPermissionsForRole('TENANT_ADMIN'));
      setRole('TENANT_ADMIN');
      setShowPermissionSelector(false);
      setShowCreateCard(false);

      setCredentialsModal({
        isOpen: true,
        user: created,
        tempPassword: randomPassword,
        isReset: false,
      });
      setMessage(`Operador ${created.name} (${created.email}) salvo/vinculado com sucesso!`);
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit User Modal
  const handleOpenEditModal = (u: User) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditActive(u.active);
    setEditTenantId(u.tenantId || activeUser?.tenantId || '');
    setEditPermissions(getEffectivePermissions(u.role, u.customPermissions));
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

  const handleSaveEditUser = async () => {
    if (!editingUser) return;

    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          role: editRole,
          memberships: editMemberships,
          active: editActive,
          tenantId: editTenantId || undefined,
          customPermissions: editPermissions,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao atualizar usuário no servidor.');
      }

      await fetchUsers();
      setEditingUser(null);
      setMessage(`Usuário ${editName} atualizado com sucesso!`);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar usuário.');
    }
  };

  const handleResetPassword = async (u: User) => {
    try {
      const res = await fetch(`/api/users/${u.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Erro ao redefinir senha no servidor.');
      }

      const data = await res.json();
      await fetchUsers();
      setCredentialsModal({
        isOpen: true,
        user: data.user,
        tempPassword: data.tempPassword,
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

    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Usuário do Sistema',
      itemName: `${u.name} (${u.email})`,
      description: `O acesso do perfil ${getRoleLabel(u.role)} será revogado e excluído do sistema.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Erro ao excluir usuário no servidor.');
          }

          await fetchUsers();
          setMessage(`Usuário ${u.name} excluído com sucesso.`);
          setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir usuário.');
        }
      },
    });
  };

  const roleColors: Record<Role, string> = {
    PLATFORM_MASTER: 'bg-[var(--info-bg)] text-[var(--link)] border-[var(--field-border)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]',
    MASTER: 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]',
    TENANT_ADMIN: 'bg-[var(--info-bg)] text-[var(--link)] border-[var(--field-border)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]',
    GESTOR: 'bg-[var(--info-bg)] text-[var(--link)] border-[var(--field-border)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]',
    GERENTE: 'bg-[var(--info-bg)] text-[var(--link)] border-[var(--field-border)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]',
    SUPORTE: 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]',
    DIGITADOR: 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]',
    SIMULACAO: 'bg-[var(--info-bg)] text-[var(--link)] border-[var(--field-border)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]',
  };

  return (
    <div className="space-y-6">
      <ActionBar
        title="Usuários & Permissões de Acesso"
        subtitle="Gerenciamento de operadores, perfis de acesso e permissões por módulo do sistema"
        badge={`${users.length} Operadores`}
        actions={canCreateUsers ? (
          <button
            type="button"
            onClick={() => setShowCreateCard(!showCreateCard)}
            className="flex items-center gap-2 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs px-4 py-2  transition-colors cursor-pointer"
          >
            {showCreateCard ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            <span>{showCreateCard ? 'Fechar Cadastro' : 'Novo Operador'}</span>
          </button>
        ) : undefined}
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
        <div className="rounded-xl border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] p-3.5 text-xs text-[var(--success-text)] dark:text-[var(--success-text)] flex items-center gap-2.5 shadow-2xs">
          <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] dark:text-[var(--success-text)] shrink-0" />
          <span className="font-semibold">{message}</span>
        </div>
      )}

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-xs text-[var(--danger-text)] dark:border-[var(--danger-border)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void fetchUsers()} disabled={isLoading} className="shrink-0 font-bold underline underline-offset-2 disabled:opacity-50">
            {isLoading ? 'Carregando...' : 'Tentar novamente'}
          </button>
        </div>
      )}

      {/* User Creation Card (Toggleable or Expandable) */}
      {showCreateCard && canCreateUsers && (
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-5  space-y-4 animate-in fade-in duration-150">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
              <span>Cadastrar Novo Operador</span>
            </span>
            <span className="text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-normal">
              Sessão Ativa: <strong>{activeUser.email}</strong> ({activeUser.role})
            </span>
          </h3>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Carlos Oliveira"
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  E-mail Global (Login Único) *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com.br"
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Empresa / Tenant *
                </label>
                {isPlatformMaster ? (
                  <select
                    value={selectedTenantId}
                    onChange={e => setSelectedTenantId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
                  >
                    <option value="">⚡ MASTER OP Global (Sem Tenant)</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>
                        🏢 {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)] shrink-0" />
                    <span className="truncate">
                      {tenants.find(t => t.id === selectedTenantId)?.name || 'Organização Atual'}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Perfil na Empresa *
                </label>
                <select
                  value={role}
                  onChange={e => handleRoleChange(e.target.value as any)}
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
                >
                  {isPlatformMaster && !selectedTenantId && (
                    <option value="PLATFORM_MASTER">⚡ MASTER OP (Global)</option>
                  )}
                  <option value="TENANT_ADMIN">🏢 TENANT_ADMIN (Admin Empresa)</option>
                  <option value="GESTOR">🛡️ GESTOR</option>
                  <option value="GERENTE">🎯 GERENTE</option>
                  <option value="SUPORTE">🎧 SUPORTE</option>
                  <option value="DIGITADOR">⌨️ DIGITADOR</option>
                  <option value="SIMULACAO">📊 SIMULACAO</option>
                </select>
              </div>
            </div>

            {/* Extra Multi-Tenant Memberships (Opcional para MASTER OP) */}
            {isPlatformMaster && (
              <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-[var(--link)]" />
                    <span>Vincular a Mais Empresas Simultaneamente (Opcional)</span>
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={newExtraTenantId}
                      onChange={e => setNewExtraTenantId(e.target.value)}
                      className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                    >
                      <option value="">Selecione outra empresa...</option>
                      {tenants
                        .filter(t => t.id !== selectedTenantId && !extraMemberships.some(em => em.tenantId === t.id))
                        .map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>

                    <select
                      value={newExtraRole}
                      onChange={e => setNewExtraRole(e.target.value as Role)}
                      className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-semibold"
                    >
                      <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                      <option value="GESTOR">GESTOR</option>
                      <option value="GERENTE">GERENTE</option>
                      <option value="SUPORTE">SUPORTE</option>
                      <option value="DIGITADOR">DIGITADOR</option>
                      <option value="SIMULACAO">SIMULACAO</option>
                    </select>

                    <button
                      type="button"
                      disabled={!newExtraTenantId}
                      onClick={() => {
                        if (!newExtraTenantId) return;
                        setExtraMemberships(prev => [...prev, { tenantId: newExtraTenantId, role: newExtraRole }]);
                        setNewExtraTenantId('');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-lg text-xs font-bold disabled:opacity-90 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>

                {extraMemberships.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {extraMemberships.map(em => {
                      const t = tenants.find(item => item.id === em.tenantId);
                      return (
                        <span
                          key={em.tenantId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                        >
                          <Building2 className="h-3 w-3 text-[var(--link)]" />
                          <span>{t?.name || em.tenantId}</span>
                          <span className="text-[10px] text-[var(--link)] dark:text-[var(--link)] font-bold">
                            ({em.role})
                          </span>
                          <button
                            type="button"
                            onClick={() => setExtraMemberships(prev => prev.filter(x => x.tenantId !== em.tenantId))}
                            className="text-[var(--text-secondary)] hover:text-[var(--danger-text)] ml-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Opcional: Personalizar Permissões Granulares */}
            <div className="flex justify-start pt-1">
              <button
                type="button"
                onClick={() => setShowPermissionSelector(!showPermissionSelector)}
                className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--link)] dark:hover:text-[var(--link)] flex items-center gap-1.5 cursor-pointer py-1"
              >
                <Shield className="h-3.5 w-3.5 text-[var(--link)]" />
                <span>
                  Personalizar Permissões Granulares (Opcional — o perfil selecionado já atribui {selectedPermissions.length} permissões padrão)
                </span>
                {showPermissionSelector ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Granular Permission Selector Collapsible */}
            {showPermissionSelector && (
              <div className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
                      <span>Ajuste Fino de Permissões Individuais</span>
                    </h4>
                    <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                      O perfil <strong>{getRoleLabel(role)}</strong> inicia com {getPermissionsForRole(role).length} permissões padrão. Você pode personalizar abaixo.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllPermissions}
                      className="text-[11px] font-bold text-[var(--link)] dark:text-[var(--link)] hover:underline px-2 py-1 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded border border-[var(--field-border)] dark:border-[var(--field-border)] cursor-pointer"
                    >
                      Selecionar Todas
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllPermissions}
                      className="text-[11px] font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)] hover:underline px-2 py-1 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded border border-[var(--field-border)] dark:border-[var(--field-border)] cursor-pointer"
                    >
                      Limpar Todas
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(isPlatformMaster ? PERMISSION_CATEGORIES : PERMISSION_CATEGORIES.filter(c => c.category !== 'TENANTS')).map(cat => {
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
                      <div key={cat.category} className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] p-3 space-y-2">
                        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-1.5">
                          <span className="text-[11px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider">
                            {cat.label}
                          </span>
                          <button
                            type="button"
                            onClick={toggleCategory}
                            className="text-[10px] text-[var(--link)] dark:text-[var(--link)] font-bold hover:underline cursor-pointer"
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
                                className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm.id)}
                                  className="rounded border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] h-3.5 w-3.5"
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
                className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs px-5 py-2  flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Cadastrar Usuário</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User Table List */}
      <div className="overflow-hidden rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  space-y-0">
        {/* Table Filter Header */}
        <div className="p-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
            >
              <option value="ALL">Todos os Perfis</option>
              {isPlatformMaster && <option value="PLATFORM_MASTER">MASTER OP</option>}
              <option value="TENANT_ADMIN">ADMINISTRADOR</option>
              <option value="MASTER">MASTER</option>
              <option value="GESTOR">GESTOR</option>
              <option value="GERENTE">GERENTE</option>
              <option value="SUPORTE">SUPORTE</option>
              <option value="DIGITADOR">DIGITADOR</option>
              <option value="SIMULACAO">CANAL DE SIMULAÇÃO</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:outline-hidden"
            >
              <option value="ALL">Todos os Status</option>
              <option value="ACTIVE">Somente Ativos</option>
              <option value="INACTIVE">Somente Inativos</option>
            </select>

            <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] pl-1">
              {filteredUsers.length} de {users.length}
            </span>
          </div>
        </div>

        {/* Multi-selection Contextual Action Bar */}
        {canDeleteUsers && selectedUserIds.size > 0 && (
          <div className="px-4 py-2.5 bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between gap-3 animate-in fade-in duration-100">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-[var(--info-bg)] animate-pulse" />
              <span className="text-xs font-bold text-[var(--link)] dark:text-[var(--link)]">
                {selectedUserIds.size} {selectedUserIds.size === 1 ? 'usuário selecionado' : 'usuários selecionados'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] cursor-pointer"
              >
                Limpar seleção
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkDeleteConfirmationText('');
                  setIsBulkDeleteModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-[var(--danger-text)] bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] rounded-lg  cursor-pointer transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Excluir selecionados</span>
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-canvas)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  {canDeleteUsers && (
              <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    disabled={visibleUserIds.length === 0}
                    ref={el => {
                      if (el) el.indeterminate = isSomeVisibleSelected;
                    }}
                    onChange={handleToggleSelectAll}
                    className="rounded border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] h-4 w-4 cursor-pointer"
                    title={isAllVisibleSelected ? 'Desmarcar todos' : 'Selecionar todos visíveis'}
                  />
                  )}
                </th>
                <th className="px-4 py-3">Nome / Usuário</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Empresas & Perfis por Empresa</th>
                <th className="px-4 py-3">Permissões</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Alternar Perfil</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
              {isLoading && users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-xs">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Carregando usuários...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-xs">
                    Nenhum operador encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const isActive = activeUser.id === u.id;
                  const isMasterProtected = u.role === 'PLATFORM_MASTER' || u.isMasterProtected;
                  const effectivePerms = getEffectivePermissions(u.role, u.customPermissions);
                  const maxPerms = u.role === 'PLATFORM_MASTER' ? ALL_PERMISSIONS.length : DEFAULT_ROLE_PERMISSIONS.TENANT_ADMIN.length;
                  const isSelected = selectedUserIds.has(u.id);

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors ${
                        isSelected ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)]' : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        {canDeleteUsers && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectUser(u.id)}
                          disabled={!canSelectUserForDeletion(u)}
                          title={u.id === activeUser.id ? 'Não é possível excluir seu próprio usuário.' : u.role === 'PLATFORM_MASTER' && !isPlatformMaster ? 'Somente um PLATFORM_MASTER pode excluir este usuário.' : undefined}
                          className="rounded border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] h-4 w-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-90"
                        />
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailsUser(u)}
                            className="text-left font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:text-[var(--link)] dark:hover:text-[var(--link)] hover:underline cursor-pointer"
                            title="Ver detalhes e empresas vinculadas"
                          >
                            {u.name}
                          </button>
                          {isActive && (
                            <span className="text-[var(--link)] dark:text-[var(--link)] text-[10px] font-bold bg-[var(--info-bg)] dark:bg-[var(--info-bg)] px-1.5 py-0.5 rounded border border-[var(--field-border)] dark:border-[var(--field-border)]">
                              (Você)
                            </span>
                          )}
                          {isMasterProtected && (
                            <span title="Usuário Protegido">
                              <Lock className="h-3 w-3 text-[var(--warning-text)]" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-mono text-[11px]">{u.email}</td>
                      <td className="px-4 py-3">
                        {u.role === 'PLATFORM_MASTER' && (!u.memberships || u.memberships.length === 0) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] px-2 py-0.5 rounded border border-[var(--field-border)] dark:border-[var(--field-border)]">
                            ⚡ MASTER OP (Global)
                          </span>
                        ) : u.memberships && u.memberships.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            {u.memberships.map((m: any) => {
                              const tName = m.tenant?.name || tenants.find(t => t.id === m.tenantId)?.name || 'Empresa';
                              return (
                                <div key={m.id || m.tenantId} className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded border border-[var(--field-border)] dark:border-[var(--field-border)]">
                                    <Building2 className="h-3 w-3 text-[var(--link)] shrink-0" />
                                    <span className="truncate max-w-[140px]">{tName}</span>
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold text-[10px] border ${
                                      ROLE_CONFIG[m.role as Role]?.badgeClass || roleColors[m.role as Role]
                                    }`}
                                  >
                                    <span>{getRoleEmoji(m.role as Role)}</span>
                                    <span>{getRoleLabel(m.role as Role)}</span>
                                  </span>
                                  {!m.active && <span className="text-[9px] text-[var(--danger-text)] font-bold">(Inativo)</span>}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded border border-[var(--field-border)] dark:border-[var(--field-border)]">
                              <Building2 className="h-3 w-3 text-[var(--text-secondary)] shrink-0" />
                              <span className="truncate max-w-[140px]">
                                {tenants.find(t => t.id === u.tenantId)?.name || 'Empresa Principal'}
                              </span>
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold text-[10px] border ${
                                ROLE_CONFIG[u.role]?.badgeClass || roleColors[u.role]
                              }`}
                            >
                              <span>{getRoleEmoji(u.role)}</span>
                              <span>{getRoleLabel(u.role)}</span>
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-[10px] font-semibold border border-[var(--field-border)] dark:border-[var(--field-border)]">
                          <Shield className="h-3 w-3 text-[var(--link)]" />
                          {u.role === 'PLATFORM_MASTER' ? 'Global (Total)' : `${effectivePerms.length} de ${maxPerms}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {u.active ? (
                            <span className="inline-flex items-center gap-1 text-[var(--success-text)] dark:text-[var(--success-text)] font-bold text-[11px]">
                              <CheckCircle2 className="h-3 w-3" /> Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[var(--danger-text)] dark:text-[var(--danger-text)] font-bold text-[11px]">
                              Desativado
                            </span>
                          )}
                          {u.mustChangePassword && (
                            <span className="block text-[9px] text-[var(--warning-text)] dark:text-[var(--warning-text)] font-bold bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] px-1.5 py-0.5 rounded border border-[var(--warning-border)] dark:border-[var(--warning-border)] w-max">
                              🔑 1º Acesso
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!isActive && (
                          <button
                            onClick={() => handleSwitchUser(u)}
                            className="rounded border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer shadow-2xs"
                          >
                            Assumir Perfil
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setDetailsUser(u)}
                            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--link)] rounded hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] transition-colors cursor-pointer"
                            title="Ver Detalhes do Usuário & Empresas"
                          >
                            <Building2 className="h-4 w-4" />
                          </button>

                          {canUpdateUsers && <button
                            onClick={() => handleOpenEditModal(u)}
                            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--link)] rounded hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] transition-colors cursor-pointer"
                            title="Editar Usuário e Permissões"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>}

                          {canResetPasswords && <button
                            onClick={() => handleResetPassword(u)}
                            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--warning-text)] rounded hover:bg-[var(--warning-bg)] dark:hover:bg-[var(--warning-bg)] transition-colors cursor-pointer"
                            title="Redefinir Senha Temporária"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>}

                          {!isActive && canDeleteUsers && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--danger-text)] rounded hover:bg-[var(--danger-bg)] dark:hover:bg-[var(--danger-bg)] transition-colors cursor-pointer"
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
      {editingUser && canUpdateUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-[var(--link)]" />
                <h3 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Editar Usuário & Permissões Granulares
                </h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">E-mail (Inalterável)</label>
                <input
                  type="email"
                  value={editingUser.email}
                  disabled
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)] cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">Perfil na Empresa *</label>
                <select
                  value={editRole}
                  onChange={e => handleEditRoleChange(e.target.value as any)}
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                >
                  {isPlatformMaster && <option value="PLATFORM_MASTER">⚡ MASTER OP</option>}
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
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">Status da Conta</label>
                <select
                  value={editActive ? 'active' : 'inactive'}
                  onChange={e => setEditActive(e.target.value === 'active')}
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                >
                  <option value="active">✅ Ativo</option>
                  <option value="inactive">🚫 Desativado / Suspenso</option>
                </select>
              </div>
            </div>

            {/* Granular Permissions Section in Modal */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-2">
                <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-[var(--link)]" />
                  <span>Permissões Específicas do Usuário ({editPermissions.length} de {isPlatformMaster ? ALL_PERMISSIONS.length : DEFAULT_ROLE_PERMISSIONS.TENANT_ADMIN.length})</span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPermissions([...(isPlatformMaster ? ALL_PERMISSIONS : DEFAULT_ROLE_PERMISSIONS.TENANT_ADMIN)])}
                    className="text-[10px] font-bold text-[var(--link)] dark:text-[var(--link)] hover:underline"
                  >
                    Marcar Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPermissions([])}
                    className="text-[10px] font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)] hover:underline"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {(isPlatformMaster ? PERMISSION_CATEGORIES : PERMISSION_CATEGORIES.filter(c => c.category !== 'TENANTS')).map(cat => (
                  <div key={cat.category} className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] p-2.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] space-y-1.5">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider block border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-1">
                      {cat.label}
                    </span>
                    {cat.permissions.map(perm => (
                      <label key={perm.id} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editPermissions.includes(perm.id)}
                          onChange={() => toggleEditPermission(perm.id)}
                          className="rounded border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] h-3.5 w-3.5"
                        />
                        <span>{perm.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditUser}
                className="rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] px-5 py-2 text-xs font-bold text-[var(--action-ink)]  cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION MODAL */}
      {isBulkDeleteModalOpen && canDeleteUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  space-y-4 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-4">
              <div className="p-2.5 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] rounded-xl text-[var(--danger-text)] dark:text-[var(--danger-text)] shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[var(--danger-text)] dark:text-[var(--danger-text)]">
                  ATENÇÃO — Exclusão em Massa de Usuários
                </h3>
                <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">
                  Você está prestes a excluir{' '}
                  <strong className="text-[var(--danger-text)] dark:text-[var(--danger-text)] font-bold">
                    {selectedUsers.length} usuários
                  </strong>
                  . Os acessos serão revogados e os registros serão preservados conforme as regras de soft delete.
                </p>
              </div>
            </div>

            {/* Blocked Protection Warning */}
            {isBulkDeleteBlocked && (
              <div className="p-3 bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] rounded-xl text-xs text-[var(--warning-text)] dark:text-[var(--warning-text)] space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-[var(--warning-text)] shrink-0" />
                  <span>Operação Bloqueada por Proteção do Sistema</span>
                </p>
                <p className="text-[11px] text-[var(--warning-text)] dark:text-[var(--warning-text)]">
                  {containsSelf && '• A seleção inclui seu próprio usuário logado.'}
                  {containsPlatformMaster && ' • A seleção inclui usuário(s) com perfil MASTER OP.'}
                  {containsProtectedRoot && ' • A seleção inclui usuário(s) raiz/master protegidos.'}
                </p>
                <p className="text-[11px] font-semibold">
                  Remova estes usuários da seleção para poder prosseguir com a exclusão dos demais.
                </p>
              </div>
            )}

            {/* Selected Users List Preview */}
            <div className="space-y-1.5">
              <span className="text-[10.5px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] uppercase tracking-wider block">
                Usuários selecionados ({selectedUsers.length}):
              </span>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] p-2 divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] text-xs">
                {selectedUsers.slice(0, 10).map(u => (
                  <div key={u.id} className="py-1.5 px-2 flex items-center justify-between gap-2">
                    <div className="truncate flex-1">
                      <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{u.name}</span>
                      <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-[11px] ml-1.5">({u.email})</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {getRoleLabel(u.role)}
                      </span>
                      <span
                        className={`text-[9.5px] font-semibold px-1 rounded ${
                          u.active ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : 'text-[var(--danger-text)] dark:text-[var(--danger-text)]'
                        }`}
                      >
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </div>
                ))}
                {selectedUsers.length > 10 && (
                  <div className="py-1.5 px-2 text-center text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface)] rounded">
                    + {selectedUsers.length - 10} outros usuários selecionados
                  </div>
                )}
              </div>
            </div>

            {/* Confirmation typing requirement */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Para confirmar a exclusão em lote, digite <span className="text-[var(--danger-text)] dark:text-[var(--danger-text)] font-mono font-black">EXCLUIR</span> abaixo:
              </label>
              <input
                type="text"
                value={bulkDeleteConfirmationText}
                onChange={e => setBulkDeleteConfirmationText(e.target.value)}
                placeholder="Digite EXCLUIR para confirmar"
                className="w-full rounded-xl border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)] focus:outline-hidden focus:ring-2 focus:ring-[var(--danger-border)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={isBulkDeleting}
                className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer disabled:opacity-90"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkDelete}
                disabled={
                  bulkDeleteConfirmationText.trim().toUpperCase() !== 'EXCLUIR' ||
                  isBulkDeleting ||
                  isBulkDeleteBlocked
                }
                className="rounded-xl bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] text-[var(--danger-text)] font-bold text-xs px-5 py-2  flex items-center gap-2 cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed transition-colors"
              >
                {isBulkDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Confirmar Exclusão em Massa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE FEEDBACK MODAL */}
      {bulkDeleteFeedback?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  space-y-4 animate-in fade-in duration-100">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  bulkDeleteFeedback.success
                    ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                    : 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]'
                }`}
              >
                {bulkDeleteFeedback.success ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  {bulkDeleteFeedback.success ? 'Operação Concluída' : 'Falha na Operação'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
                  {bulkDeleteFeedback.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
              <button
                type="button"
                onClick={() => setBulkDeleteFeedback(null)}
                className="rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs px-4 py-2 cursor-pointer shadow-xs"
              >
                Entendido
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

      {/* User Details & Multi-Tenant Memberships Modal */}
      {detailsUser && (
        <UserDetailsModal
          user={detailsUser}
          allTenants={tenants}
          onClose={() => setDetailsUser(null)}
          onUserUpdated={fetchUsers}
          onResetPassword={handleResetPassword}
          onSwitchUser={handleSwitchUser}
          isPlatformMaster={isPlatformMaster}
        />
      )}
    </div>
  );
};
