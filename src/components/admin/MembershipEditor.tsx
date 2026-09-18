import React, { useState } from 'react';
import { Tenant, Role } from '../../types';
// @ts-ignore
import { Shield, Plus, Trash2 } from 'lucide-react';
import { getPermissionsForRole } from '../../lib/permissions';
// @ts-ignore

interface Membership {
  tenantId: string;
  role: string;
  customPermissions: string[];
  active: boolean;
}

interface MembershipEditorProps {
  tenants: Tenant[];
  memberships: Membership[];
  onChange: (memberships: Membership[]) => void;
}

export const MembershipEditor: React.FC<MembershipEditorProps> = ({ tenants, memberships, onChange }) => {
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('DIGITADOR');

  const addMembership = () => {
    if (!selectedTenant) return;
    if (memberships.some(m => m.tenantId === selectedTenant)) return;
    
    onChange([...memberships, {
      tenantId: selectedTenant,
      role: selectedRole,
      customPermissions: getPermissionsForRole(selectedRole),
      active: true
    }]);
    setSelectedTenant('');
  };

  const removeMembership = (tenantId: string) => {
    onChange(memberships.filter(m => m.tenantId !== tenantId));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Adicionar Empresa</label>
          <select
            value={selectedTenant}
            onChange={e => setSelectedTenant(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500"
          >
            <option value="">Selecione uma Empresa</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Perfil</label>
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value as Role)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500"
          >
            <option value="TENANT_ADMIN">🏢 TENANT_ADMIN</option>
            <option value="MASTER">👑 MASTER</option>
            <option value="GESTOR">🛡️ GESTOR</option>
            <option value="GERENTE">🎯 GERENTE</option>
            <option value="SUPORTE">🎧 SUPORTE</option>
            <option value="DIGITADOR">⌨️ DIGITADOR</option>
            <option value="SIMULACAO">📊 SIMULACAO</option>
          </select>
        </div>
        <button
          type="button"
          onClick={addMembership}
          disabled={!selectedTenant}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-2 text-white flex items-center gap-1 text-xs font-bold"
        >
          <Plus className="h-4 w-4" /> Incluir
        </button>
      </div>

      {memberships.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2 space-y-2">
          {memberships.map(m => {
            const tenant = tenants.find(t => t.id === m.tenantId);
            return (
              <div key={m.tenantId} className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded-md border border-slate-200 dark:border-slate-700">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{tenant?.name || m.tenantId}</div>
                  <div className="text-[11px] text-slate-500 uppercase flex items-center gap-1">
                    <Shield className="h-3 w-3" /> {m.role}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeMembership(m.tenantId)}
                  className="text-rose-500 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
