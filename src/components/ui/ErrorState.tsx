import React from 'react';
import {
  WifiOff,
  Clock,
  ShieldAlert,
  SearchX,
  ServerCrash,
  RefreshCw,
  LogIn,
  ArrowLeft,
  Trash2,
} from 'lucide-react';

export type ErrorStateType =
  | 'NETWORK_ERROR'
  | 'SESSION_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'SERVER_ERROR';

interface ErrorStateProps {
  type: ErrorStateType;
  title?: string;
  description?: string;
  technicalDetails?: string;
  onRetry?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  type,
  title,
  description,
  technicalDetails,
  onRetry,
  onAction,
  actionLabel,
  className = '',
}) => {
  const getErrorConfig = () => {
    switch (type) {
      case 'NETWORK_ERROR':
        return {
          icon: WifiOff,
          defaultTitle: 'Falha de Conexão com o Servidor',
          defaultDesc: 'Não foi possível estabelecer comunicação com os servidores. Verifique sua conexão com a internet e tente novamente.',
          iconBg: 'bg-[var(--bg-surface-elevated)] bg-[var(--bg-surface-elevated)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border-[var(--danger-border)] dark:border-[var(--danger-border)]',
          defaultActionLabel: 'Tentar Novamente',
          actionIcon: RefreshCw,
        };
      case 'SESSION_EXPIRED':
        return {
          icon: Clock,
          defaultTitle: 'Sessão Expirada',
          defaultDesc: 'Sua sessão de segurança expirou por inatividade. Faça login novamente para continuar operando.',
          iconBg: 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]',
          defaultActionLabel: 'Fazer Login Novamente',
          actionIcon: LogIn,
        };
      case 'PERMISSION_DENIED':
        return {
          icon: ShieldAlert,
          defaultTitle: 'Acesso Não Autorizado',
          defaultDesc: 'Seu perfil operacional não possui privilégios suficientes para acessar este recurso ou executar esta ação.',
          iconBg: 'bg-[var(--bg-surface-elevated)] bg-[var(--bg-surface-elevated)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border-[var(--danger-border)] dark:border-[var(--danger-border)]',
          defaultActionLabel: 'Voltar ao Início',
          actionIcon: ArrowLeft,
        };
      case 'NOT_FOUND':
        return {
          icon: SearchX,
          defaultTitle: 'Registro Não Encontrado',
          defaultDesc: 'O registro solicitado (ADE, cliente ou proposta) não existe ou foi removido da base de dados.',
          iconBg: 'bg-[var(--bg-surface-elevated)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] text-[var(--text-secondary)] border-[var(--border-default)] border-[var(--border-default)]',
          defaultActionLabel: 'Voltar',
          actionIcon: ArrowLeft,
        };
      case 'SERVER_ERROR':
      default:
        return {
          icon: ServerCrash,
          defaultTitle: 'Instabilidade Operacional',
          defaultDesc: 'Ocorreu um erro interno durante o processamento da solicitação. A equipe técnica já foi notificada.',
          iconBg: 'bg-[var(--bg-surface-elevated)] bg-[var(--bg-surface-elevated)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border-[var(--danger-border)] dark:border-[var(--danger-border)]',
          defaultActionLabel: 'Recarregar Página',
          actionIcon: RefreshCw,
        };
    }
  };

  const config = getErrorConfig();
  const Icon = config.icon;
  const ActionIcon = config.actionIcon;

  return (
    <div
      className={`rounded-2xl border border-[var(--border-default)] border-[var(--border-default)] bg-[var(--bg-surface)] bg-[var(--bg-surface-elevated)] p-8 text-center  flex flex-col items-center justify-center max-w-lg mx-auto ${className}`}
    >
      <div
        className={`h-14 w-14 rounded-2xl border flex items-center justify-center mb-4 ${config.iconBg}`}
      >
        <Icon className="h-7 w-7" />
      </div>

      <h3 className="text-base font-bold text-[var(--text-secondary)] text-[var(--text-secondary)] mb-1.5">
        {title || config.defaultTitle}
      </h3>

      <p className="text-xs text-[var(--text-secondary)] text-[var(--text-secondary)] leading-relaxed max-w-sm mb-4">
        {description || config.defaultDesc}
      </p>

      {technicalDetails && (
        <div className="w-full text-left bg-[var(--bg-surface-elevated)] bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] border-[var(--border-default)] rounded-lg p-2.5 mb-5 text-[11px] font-mono text-[var(--danger-text)] dark:text-[var(--danger-text)] max-h-24 overflow-y-auto break-words">
          {technicalDetails}
        </div>
      )}

      <div className="flex items-center gap-2.5">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-bold text-[var(--text-primary)]  transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Tentar Novamente</span>
          </button>
        )}

        {onAction && (
          <button
            onClick={onAction}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] border-[var(--border-default)] bg-[var(--bg-surface)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            <ActionIcon className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
            <span>{actionLabel || config.defaultActionLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};
