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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  space-y-4 my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex items-start justify-between bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center font-bold text-sm shrink-0 border border-[var(--field-border)] dark:border-[var(--field-border)]">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  {user.name}
                </h3>
                {user.role === 'PLATFORM_MASTER' && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
                    ⚡ MASTER OP (Global)
                  </span>
                )}
                {user.active ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--success-text)] dark:text-[var(--success-text)]">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ativo
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-[var(--danger-text)]">
                    Suspenso
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">
                {user.email} • ID: <span className="font-mono text-[11px]">{user.id}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
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
                  ? 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] border-[var(--success-border)] dark:border-[var(--success-border)] text-[var(--success-text)] dark:text-[var(--success-text)]'
                  : 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border-[var(--danger-border)] dark:border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)]'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-text)] dark:text-[var(--success-text)]" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-[var(--danger-text)] dark:text-[var(--danger-text)]" />
              )}
              <span>{feedback.text}</span>
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 space-y-5 max-h-[68vh] overflow-y-auto">
          {/* Architecture Rule Banner */}
          <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-3 text-xs text-[var(--link)] dark:text-[var(--link)]">
            <div className="flex items-center gap-2 font-bold mb-0.5">
              <Building2 className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
              <span>Arquitetura Multi-Tenant Sentinel: 1 User = 1 Identidade Global = 1 Login</span>
            </div>
            <p className="text-[11px] text-[var(--link)] dark:text-[var(--link)]">
              O operador acessa as empresas através de suas <strong>Memberships</strong>. Para cada empresa vinculada, ele possui exatamente <strong>1 perfil/role</strong> e suas permissões correspondentes.
            </p>
          </div>

          {/* Tenants / Memberships List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
                <span>Empresas Vinculadas ({memberships.length})</span>
              </h4>
              {!isAddingNew && availableTenantsToAdd.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsAddingNew(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[var(--link)] dark:text-[var(--link)] hover:text-[var(--link)] dark:hover:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] px-2.5 py-1 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] transition-colors cursor-pointer"
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
                className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-3.5 space-y-3 animate-in fade-in duration-100"
              >
                <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-2">
                  <span className="text-xs font-bold text-[var(--link)] dark:text-[var(--link)] flex items-center gap-1.5">
                    <Plus className="h-4 w-4 text-[var(--link)]" />
                    <span>Adicionar Vínculo com Empresa</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                      Empresa / Tenant *
                    </label>
                    <select
                      value={newTenantId}
                      onChange={e => setNewTenantId(e.target.value)}
                      className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-semibold focus:border-[var(--field-border)]"
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
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                      Perfil nesta Empresa *
                    </label>
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as Role)}
                      className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-semibold focus:border-[var(--field-border)]"
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
                    className="px-3 py-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newTenantId}
                    className="px-4 py-1.5 rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] text-xs font-bold text-[var(--action-ink)]  disabled:opacity-90 flex items-center gap-1.5"
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
              <div className="p-4 rounded-xl border border-dashed border-[var(--field-border)] dark:border-[var(--field-border)] text-center text-xs text-[var(--text-secondary)]">
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
                      className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] p-3.5 space-y-3 transition-colors hover:border-[var(--field-border)] dark:hover:border-[var(--field-border)]"
                    >
                      {/* Membership Row Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)] shrink-0">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                                {tenant?.name || `Empresa (${m.tenantId})`}
                              </span>
                              {tenant?.slug && (
                                <span className="font-mono text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                                  @{tenant.slug}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">
                              <span>Status:</span>
                              {m.active ? (
                                <span className="text-[var(--success-text)] dark:text-[var(--success-text)] font-bold">
                                  Ativo na empresa
                                </span>
                              ) : (
                                <span className="text-[var(--danger-text)] font-bold">Inativo</span>
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
                                className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
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
                                className="p-1.5 rounded-lg bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] shadow-2xs"
                                title="Salvar Alterações"
                              >
                                <Save className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditMembership}
                                className="p-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]"
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
                                  'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--field-border)]'
                                }`}
                              >
                                <span>{getRoleEmoji(m.role)}</span>
                                <span>{getRoleLabel(m.role)}</span>
                              </span>

                              <button
                                type="button"
                                onClick={() => startEditMembership(m)}
                                className="p-1 text-[var(--text-secondary)] hover:text-[var(--link)] rounded hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                                title="Alterar Perfil nesta Empresa"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>

                              {memberships.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMembership(m)}
                                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--danger-text)] rounded hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
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
                      <div className="pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                          <Shield className="h-3.5 w-3.5 text-[var(--link)]" />
                          <span>
                            {hasCustom ? (
                              <span className="text-[var(--warning-text)] dark:text-[var(--warning-text)] font-semibold">
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
                          className="font-bold text-[var(--link)] dark:text-[var(--link)] hover:underline flex items-center gap-1 cursor-pointer"
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
                        <div className="p-3 rounded-lg bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-2 animate-in fade-in duration-100">
                          <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-1.5">
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
                                  className="text-[10px] text-[var(--link)] hover:underline"
                                >
                                  Marcar Todas
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPermissions([])}
                                  className="text-[10px] text-[var(--danger-text)] hover:underline"
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
                                  className="p-2 rounded bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-1"
                                >
                                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[var(--text-secondary)]">
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
                                            className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={() => togglePermission(p.id)}
                                              className="rounded text-[var(--link)] h-3 w-3"
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
                                              ? 'text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium'
                                              : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] line-through'
                                          }`}
                                        >
                                          <span
                                            className={`h-1.5 w-1.5 rounded-full ${
                                              isChecked ? 'bg-[var(--success-bg)]' : 'bg-[var(--bg-surface-elevated)]'
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
        <div className="p-4 border-t border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onResetPassword && (
              <button
                type="button"
                onClick={() => {
                  onResetPassword(user);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5 text-[var(--warning-text)]" />
                <span>Redefinir Senha</span>
              </button>
            )}

            {onSwitchUser && (
              <button
                type="button"
                onClick={() => onSwitchUser(user)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer"
              >
                <UserCheck className="h-3.5 w-3.5 text-[var(--link)]" />
                <span>Assumir Perfil</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
