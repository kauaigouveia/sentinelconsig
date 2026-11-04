import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { Role } from '../../types';
import { getRoleLabel } from '../../lib/roleLabels';

interface AccessDeniedViewProps {
  requiredPermission?: string | string[];
  requiredRoles?: Role[];
  userRole?: Role;
  tenantName?: string;
  onNavigateHome: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  requiredPermission,
  requiredRoles,
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
        <div className="w-20 h-20 rounded-2xl bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] flex items-center justify-center  shadow-rose-500/10">
          <ShieldAlert className="w-10 h-10 text-[var(--danger-text)]" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--field-border)] flex items-center justify-center shadow-sm">
          <Lock className="w-4 h-4 text-[var(--warning-text)]" />
        </div>
      </div>

      <span className="text-xs font-bold uppercase tracking-wider text-[var(--danger-text)] dark:text-[var(--danger-text)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] px-3 py-1 rounded-full mb-3">
        HTTP 403 — Acesso Restrito
      </span>

      <h1 className="text-2xl md:text-3xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-2">
        Acesso Não Autorizado
      </h1>

      <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-secondary)] max-w-md mb-6 leading-relaxed">
        Seu usuário não atende aos requisitos de acesso deste módulo do Sentinel Consig. Caso necessite de acesso, solicite a um administrador do seu tenant.
      </p>

      {/* Detalhes de Segurança e Contexto */}
      <div className="w-full max-w-md bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 mb-6 text-left shadow-xs">
        <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          Contexto de Segurança RBAC
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="text-[var(--text-secondary)]">Perfil Atual:</span>
            <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              {getRoleLabel(userRole)}
            </span>
          </div>
          {tenantName && (
            <div className="flex items-center justify-between py-1 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <span className="text-[var(--text-secondary)]">Tenant:</span>
              <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                {tenantName}
              </span>
            </div>
          )}
          {permissionsList.length > 0 && (
            <div className="flex items-center justify-between py-1">
              <span className="text-[var(--text-secondary)]">Permissão Requerida:</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {permissionsList.map((perm) => (
                  <code
                    key={perm}
                    className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border border-[var(--field-border)] dark:border-[var(--field-border)]"
                  >
                    {perm}
                  </code>
                ))}
              </div>
            </div>
          )}
          {requiredRoles && requiredRoles.length > 0 && (
            <div className="flex items-start justify-between gap-4 py-1">
              <span className="shrink-0 text-[var(--text-secondary)]">Perfis permitidos:</span>
              <span className="text-right font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                {requiredRoles.map(getRoleLabel).join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[var(--action-ink)] bg-[var(--action)] hover:bg-[var(--action-hover)] dark:bg-[var(--action)] dark:hover:bg-[var(--action-hover)] rounded-lg  transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para o Início</span>
        </button>
      </div>
    </div>
  );
};
