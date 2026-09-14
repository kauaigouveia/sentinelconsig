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
          iconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900',
          defaultActionLabel: 'Tentar Novamente',
          actionIcon: RefreshCw,
        };
      case 'SESSION_EXPIRED':
        return {
          icon: Clock,
          defaultTitle: 'Sessão Expirada',
          defaultDesc: 'Sua sessão de segurança expirou por inatividade. Faça login novamente para continuar operando.',
          iconBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900',
          defaultActionLabel: 'Fazer Login Novamente',
          actionIcon: LogIn,
        };
      case 'PERMISSION_DENIED':
        return {
          icon: ShieldAlert,
          defaultTitle: 'Acesso Não Autorizado',
          defaultDesc: 'Seu perfil operacional não possui privilégios suficientes para acessar este recurso ou executar esta ação.',
          iconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900',
          defaultActionLabel: 'Voltar ao Início',
          actionIcon: ArrowLeft,
        };
      case 'NOT_FOUND':
        return {
          icon: SearchX,
          defaultTitle: 'Registro Não Encontrado',
          defaultDesc: 'O registro solicitado (ADE, cliente ou proposta) não existe ou foi removido da base de dados.',
          iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
          defaultActionLabel: 'Voltar',
          actionIcon: ArrowLeft,
        };
      case 'SERVER_ERROR':
      default:
        return {
          icon: ServerCrash,
          defaultTitle: 'Instabilidade Operacional',
          defaultDesc: 'Ocorreu um erro interno durante o processamento da solicitação. A equipe técnica já foi notificada.',
          iconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900',
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
      className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-8 text-center shadow-xs flex flex-col items-center justify-center max-w-lg mx-auto ${className}`}
    >
      <div
        className={`h-14 w-14 rounded-2xl border flex items-center justify-center mb-4 ${config.iconBg}`}
      >
        <Icon className="h-7 w-7" />
      </div>

      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1.5">
        {title || config.defaultTitle}
      </h3>

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mb-4">
        {description || config.defaultDesc}
      </p>

      {technicalDetails && (
        <div className="w-full text-left bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 mb-5 text-[11px] font-mono text-rose-600 dark:text-rose-400 max-h-24 overflow-y-auto break-words">
          {technicalDetails}
        </div>
      )}

      <div className="flex items-center gap-2.5">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Tentar Novamente</span>
          </button>
        )}

        {onAction && (
          <button
            onClick={onAction}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <ActionIcon className="h-3.5 w-3.5 text-slate-400" />
            <span>{actionLabel || config.defaultActionLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};
