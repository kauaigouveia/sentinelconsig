import React, { useState } from 'react';
import {
  User,
  Tenant,
  Role,
  UserTenantMembership,
} from '../../types';
import {
  X,
  Building2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  Save,
  KeyRound,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
} from 'lucide-react';
import { getRoleLabel } from '../../lib/roleLabels';
import { getRoleEmoji, ROLE_CONFIG } from '../../lib/roleUtils';
import {
  PERMISSION_CATEGORIES,
  Permission,
  getPermissionsForRole,
  DEFAULT_ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
} from '../../lib/permissions';

interface UserDetailsModalProps {
  user: User;
  allTenants: Tenant[];
  onClose: () => void;
  onUserUpdated: () => void;
  onResetPassword?: (user: User) => void;
  onSwitchUser?: (user: User) => void;
  isPlatformMaster: boolean;
}

export const UserDetailsModal: React.FC<UserDetailsModalProps> = ({
  user,
  allTenants,
  onClose,
  onUserUpdated,
  onResetPassword,
  onSwitchUser,
  isPlatformMaster,
}) => {
  const [memberships, setMemberships] = useState<UserTenantMembership[]>(
    user.memberships || []
  );
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Role>('DIGITADOR');
  const [editingActive, setEditingActive] = useState(true);
  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
  const [showPermsAccordion, setShowPermsAccordion] = useState<string | null>(null);

  // New Membership Form
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTenantId, setNewTenantId] = useState('');
  const [newRole, setNewRole] = useState<Role>('TENANT_ADMIN');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const availableTenantsToAdd = allTenants.filter(
    t => !memberships.some(m => m.tenantId === t.id)
  );

  const startEditMembership = (m: UserTenantMembership) => {
    setEditingMembershipId(m.id);
    setEditingRole(m.role);
    setEditingActive(m.active);
    setEditingPermissions(
      m.customPermissions && m.customPermissions.length > 0
        ? m.customPermissions
        : getPermissionsForRole(m.role)
    );
  };

  const cancelEditMembership = () => {
    setEditingMembershipId(null);
  };

  const handleSaveMembership = async (membershipId: string) => {
    try {
      setIsSubmitting(true);
      setFeedback(null);
      const res = await fetch(`/api/users/${user.id}/memberships/${membershipId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: editingRole,
          active: editingActive,
          customPermissions: editingPermissions,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao atualizar vínculo empresarial.');
      }

      const data = await res.json();
      setMemberships(prev =>
        prev.map(m => (m.id === membershipId ? data.membership : m))
      );
      setEditingMembershipId(null);
      setFeedback({ type: 'success', text: 'Vínculo empresarial atualizado com sucesso!' });
      onUserUpdated();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao salvar alteração.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMembership = async (m: UserTenantMembership) => {
    const tenantName = m.tenant?.name || m.tenantId;
    if (
      !confirm(
        `Tem certeza que deseja remover o vínculo do usuário com a empresa "${tenantName}"? O operador perderá o acesso a esta organização.`
      )
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback(null);
      const res = await fetch(`/api/users/${user.id}/memberships/${m.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao remover vínculo.');
      }

      setMemberships(prev => prev.filter(item => item.id !== m.id));
      setFeedback({ type: 'success', text: `Vínculo com ${tenantName} removido com sucesso.` });
      onUserUpdated();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao remover vínculo.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNewMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantId) return;

    try {
      setIsSubmitting(true);
      setFeedback(null);
      const res = await fetch(`/api/users/${user.id}/memberships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: newTenantId,
          role: newRole,
          customPermissions: getPermissionsForRole(newRole),
          active: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao vincular nova empresa.');
      }

      const data = await res.json();
      setMemberships(prev => [...prev, data.membership]);
      setIsAddingNew(false);
      setNewTenantId('');
      setNewRole('TENANT_ADMIN');
      setFeedback({ type: 'success', text: 'Novo vínculo empresarial adicionado com sucesso!' });
      onUserUpdated();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao vincular empresa.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePermission = (permId: string) => {
    setEditingPermissions(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl space-y-4 my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/70 dark:bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-200 dark:border-blue-800">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {user.name}
                </h3>
                {user.role === 'PLATFORM_MASTER' && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    ⚡ MASTER OP (Global)
                  </span>
                )}
                {user.active ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ativo
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-rose-500">
                    Suspenso
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {user.email} • ID: <span className="font-mono text-[11px]">{user.id}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div className="px-5">
            <div
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span>{feedback.text}</span>
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 space-y-5 max-h-[68vh] overflow-y-auto">
          {/* Architecture Rule Banner */}
          <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-200">
            <div className="flex items-center gap-2 font-bold mb-0.5">
              <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Arquitetura Multi-Tenant Sentinel: 1 User = 1 Identidade Global = 1 Login</span>
            </div>
            <p className="text-[11px] text-blue-800 dark:text-blue-300">
              O operador acessa as empresas através de suas <strong>Memberships</strong>. Para cada empresa vinculada, ele possui exatamente <strong>1 perfil/role</strong> e suas permissões correspondentes.
            </p>
          </div>

          {/* Tenants / Memberships List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>Empresas Vinculadas ({memberships.length})</span>
              </h4>
              {!isAddingNew && availableTenantsToAdd.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsAddingNew(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Vincular Nova Empresa</span>
                </button>
              )}
            </div>

            {/* Add New Membership Form */}
            {isAddingNew && (
              <form
                onSubmit={handleAddNewMembership}
                className="rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/30 dark:bg-blue-950/30 p-3.5 space-y-3 animate-in fade-in duration-100"
              >
                <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/50 pb-2">
                  <span className="text-xs font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                    <Plus className="h-4 w-4 text-blue-600" />
                    <span>Adicionar Vínculo com Empresa</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Empresa / Tenant *
                    </label>
                    <select
                      value={newTenantId}
                      onChange={e => setNewTenantId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:border-blue-500"
                      required
                    >
                      <option value="">Selecione uma empresa...</option>
                      {availableTenantsToAdd.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.slug})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Perfil nesta Empresa *
                    </label>
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as Role)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:border-blue-500"
                    >
                      <option value="TENANT_ADMIN">🏢 TENANT_ADMIN (Admin da Empresa)</option>
                      <option value="GESTOR">🛡️ GESTOR</option>
                      <option value="GERENTE">🎯 GERENTE</option>
                      <option value="SUPORTE">🎧 SUPORTE</option>
                      <option value="DIGITADOR">⌨️ DIGITADOR</option>
                      <option value="SIMULACAO">📊 SIMULACAO</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newTenantId}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    <span>Salvar Vínculo</span>
                  </button>
                </div>
              </form>
            )}

            {/* Memberships Cards */}
            {memberships.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-400">
                Nenhum vínculo empresarial cadastrado para este operador.
              </div>
            ) : (
              <div className="space-y-2.5">
                {memberships.map(m => {
                  const tenant = m.tenant || allTenants.find(t => t.id === m.tenantId);
                  const isEditing = editingMembershipId === m.id;
                  const isAccordionOpen = showPermsAccordion === m.id;
                  const defaultPerms = getPermissionsForRole(m.role);
                  const effectivePerms =
                    m.customPermissions && m.customPermissions.length > 0
                      ? m.customPermissions
                      : defaultPerms;
                  const hasCustom =
                    m.customPermissions &&
                    m.customPermissions.length > 0 &&
                    JSON.stringify(m.customPermissions.slice().sort()) !==
                      JSON.stringify(defaultPerms.slice().sort());

                  return (
                    <div
                      key={m.id || m.tenantId}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 p-3.5 space-y-3 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      {/* Membership Row Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 shrink-0">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {tenant?.name || `Empresa (${m.tenantId})`}
                              </span>
                              {tenant?.slug && (
                                <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                                  @{tenant.slug}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              <span>Status:</span>
                              {m.active ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  Ativo na empresa
                                </span>
                              ) : (
                                <span className="text-rose-500 font-bold">Inativo</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Role & Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={editingRole}
                                onChange={e => {
                                  const nr = e.target.value as Role;
                                  setEditingRole(nr);
                                  setEditingPermissions(getPermissionsForRole(nr));
                                }}
                                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-900 dark:text-slate-100"
                              >
                                <option value="TENANT_ADMIN">🏢 TENANT_ADMIN</option>
                                <option value="GESTOR">🛡️ GESTOR</option>
                                <option value="GERENTE">🎯 GERENTE</option>
                                <option value="SUPORTE">🎧 SUPORTE</option>
                                <option value="DIGITADOR">⌨️ DIGITADOR</option>
                                <option value="SIMULACAO">📊 SIMULACAO</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => handleSaveMembership(m.id)}
                                disabled={isSubmitting}
                                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                                title="Salvar Alterações"
                              >
                                <Save className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditMembership}
                                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                                title="Cancelar"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-bold text-[10px] border ${
                                  ROLE_CONFIG[m.role]?.badgeClass ||
                                  'bg-slate-100 text-slate-800 border-slate-200'
                                }`}
                              >
                                <span>{getRoleEmoji(m.role)}</span>
                                <span>{getRoleLabel(m.role)}</span>
                              </span>

                              <button
                                type="button"
                                onClick={() => startEditMembership(m)}
                                className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-white dark:hover:bg-slate-800 transition-colors"
                                title="Alterar Perfil nesta Empresa"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>

                              {memberships.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMembership(m)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-white dark:hover:bg-slate-800 transition-colors"
                                  title="Remover Vínculo desta Empresa"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Permissions Summary & Accordion Toggle */}
                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <Shield className="h-3.5 w-3.5 text-blue-500" />
                          <span>
                            {hasCustom ? (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                Permissões personalizadas ({effectivePerms.length} ativas)
                              </span>
                            ) : (
                              <span>
                                Permissões padrão do perfil ({effectivePerms.length} ativas)
                              </span>
                            )}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setShowPermsAccordion(isAccordionOpen ? null : m.id)
                          }
                          className="font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{isAccordionOpen ? 'Ocultar detalhes' : 'Ver permissões'}</span>
                          {isAccordionOpen ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </div>

                      {/* Accordion Detail View */}
                      {isAccordionOpen && (
                        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 animate-in fade-in duration-100">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span>Módulos e Acessos Habilitados:</span>
                            {isEditing && (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingPermissions(
                                      DEFAULT_ROLE_PERMISSIONS.TENANT_ADMIN
                                    )
                                  }
                                  className="text-[10px] text-blue-600 hover:underline"
                                >
                                  Marcar Todas
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPermissions([])}
                                  className="text-[10px] text-rose-600 hover:underline"
                                >
                                  Limpar
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {PERMISSION_CATEGORIES.filter(c => c.category !== 'TENANTS').map(cat => {
                              const catPerms = cat.permissions;
                              const activeInCat = catPerms.filter(p =>
                                (isEditing ? editingPermissions : effectivePerms).includes(p.id)
                              );

                              return (
                                <div
                                  key={cat.category}
                                  className="p-2 rounded bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 space-y-1"
                                >
                                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                                    <span>{cat.label}</span>
                                    <span>
                                      {activeInCat.length}/{catPerms.length}
                                    </span>
                                  </div>
                                  <div className="space-y-1">
                                    {catPerms.map(p => {
                                      const isChecked = (isEditing
                                        ? editingPermissions
                                        : effectivePerms
                                      ).includes(p.id);

                                      if (isEditing) {
                                        return (
                                          <label
                                            key={p.id}
                                            className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={() => togglePermission(p.id)}
                                              className="rounded text-blue-600 h-3 w-3"
                                            />
                                            <span>{p.label}</span>
                                          </label>
                                        );
                                      }

                                      return (
                                        <div
                                          key={p.id}
                                          className={`flex items-center gap-1.5 text-[11px] ${
                                            isChecked
                                              ? 'text-slate-800 dark:text-slate-200 font-medium'
                                              : 'text-slate-400 dark:text-slate-600 line-through'
                                          }`}
                                        >
                                          <span
                                            className={`h-1.5 w-1.5 rounded-full ${
                                              isChecked ? 'bg-emerald-500' : 'bg-slate-300'
                                            }`}
                                          />
                                          <span>{p.label}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onResetPassword && (
              <button
                type="button"
                onClick={() => {
                  onResetPassword(user);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                <span>Redefinir Senha</span>
              </button>
            )}

            {onSwitchUser && (
              <button
                type="button"
                onClick={() => onSwitchUser(user)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <UserCheck className="h-3.5 w-3.5 text-blue-500" />
                <span>Assumir Perfil</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
