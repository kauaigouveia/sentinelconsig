import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Users,
  CheckCircle,
  XCircle,
  Info,
  Lock,
  Search,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  PERMISSION_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
} from '../../lib/permissions';
import { Role } from '../../types';
import { getRoleLabel } from '../../lib/roleLabels';

interface RoleInfo {
  role: Role;
  label: string;
  scope: 'GLOBAL' | 'TENANT';
  description: string;
}

export const PerfisPermissoesView: React.FC = () => {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [usersByRole, setUsersByRole] = useState<Record<string, number>>({});
  const [selectedRole, setSelectedRole] = useState<Role>('TENANT_ADMIN');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/roles-permissions')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setRoles(data.roles || []);
          setUsersByRole(data.usersByRole || {});
        }
      })
      .catch((err) => console.error('Erro ao buscar perfis e permissões:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[selectedRole] || [];

  const filteredCategories = PERMISSION_CATEGORIES.map((cat) => {
    const filteredPerms = cat.permissions.filter(
      (p) =>
        p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cat.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { ...cat, permissions: filteredPerms };
  }).filter((cat) => cat.permissions.length > 0);

  return (
    <div className="space-y-6">
      {/* Header Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Matriz de Perfis & Permissões RBAC</h2>
            <p className="text-sm text-slate-400">
              Controle granular de autorizações baseado no modelo de identidade única e memberships multi-tenant.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-full flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            Controle Granular Ativo
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Roles list */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
            Perfis de Acesso ({roles.length})
          </h3>
          <div className="space-y-2">
            {roles.map((r) => {
              const isSelected = selectedRole === r.role;
              const count = usersByRole[r.role] || 0;
              return (
                <button
                  key={r.role}
                  onClick={() => setSelectedRole(r.role)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20'
                      : 'bg-slate-900/60 hover:bg-slate-800 text-slate-200 border-slate-800'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-sm truncate flex items-center gap-2">
                      {r.label}
                      {r.scope === 'GLOBAL' && (
                        <span className="text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                          Global
                        </span>
                      )}
                    </div>
                    <div className="text-xs opacity-75 truncate">{r.description}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count} {count === 1 ? 'user' : 'users'}
                    </span>
                    <ChevronRight className="w-4 h-4 opacity-50" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Permissions Matrix */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  Permissões do Perfil: <span className="text-indigo-400">{getRoleLabel(selectedRole)}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {rolePermissions.length} permissões concedidas por padrão neste perfil.
                </p>
              </div>

              {/* Search filter */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrar permissões..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Categories & items */}
            <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
              {filteredCategories.map((category) => (
                <div key={category.category} className="space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    {category.label}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {category.permissions.map((perm) => {
                      const isGranted =
                        selectedRole === 'PLATFORM_MASTER' ||
                        rolePermissions.includes(perm.id as Permission);
                      return (
                        <div
                          key={perm.id}
                          className={`p-3 rounded-lg border text-sm flex items-center justify-between ${
                            isGranted
                              ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                              : 'bg-slate-950/40 border-slate-800 text-slate-500'
                          }`}
                        >
                          <div>
                            <div className="font-medium">{perm.label}</div>
                            <div className="text-xs opacity-60 font-mono">{perm.id}</div>
                          </div>
                          {isGranted ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">
                              <CheckCircle className="w-3.5 h-3.5" /> Concedida
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-900 px-2 py-0.5 rounded">
                              <XCircle className="w-3.5 h-3.5" /> Negada
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
