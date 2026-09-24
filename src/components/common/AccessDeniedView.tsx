import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { Role } from '../../types';
import { getRoleLabel } from '../../lib/roleLabels';

interface AccessDeniedViewProps {
  requiredPermission?: string | string[];
  userRole?: Role;
  tenantName?: string;
  onNavigateHome: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  requiredPermission,
  userRole,
  tenantName,
  onNavigateHome,
}) => {
  const permissionsList = Array.isArray(requiredPermission)
    ? requiredPermission
    : requiredPermission
    ? [requiredPermission]
    : [];

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center animate-fadeIn">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shadow-lg shadow-rose-500/10">
          <ShieldAlert className="w-10 h-10 text-rose-500" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shadow-sm">
          <Lock className="w-4 h-4 text-amber-400" />
        </div>
      </div>

      <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 px-3 py-1 rounded-full mb-3">
        HTTP 403 — Acesso Restrito
      </span>

      <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 mb-2">
        Acesso Não Autorizado
      </h1>

      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
        Seu usuário não possui as permissões necessárias para acessar este módulo do Sentinel Consig. Caso necessite de acesso, solicite a um administrador do seu tenant.
      </p>

      {/* Detalhes de Segurança e Contexto */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6 text-left shadow-xs">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          Contexto de Segurança RBAC
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
            <span className="text-slate-500">Perfil Atual:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {getRoleLabel(userRole)}
            </span>
          </div>
          {tenantName && (
            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Tenant:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {tenantName}
              </span>
            </div>
          )}
          {permissionsList.length > 0 && (
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500">Permissão Requerida:</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {permissionsList.map((perm) => (
                  <code
                    key={perm}
                    className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700"
                  >
                    {perm}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para o Início</span>
        </button>
      </div>
    </div>
  );
};
