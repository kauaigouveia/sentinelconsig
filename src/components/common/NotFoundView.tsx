import React from 'react';
import { Compass, ArrowLeft, Home } from 'lucide-react';

interface NotFoundViewProps {
  pathname: string;
  onNavigateHome: () => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({
  pathname,
  onNavigateHome,
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center animate-fadeIn">
      <div className="w-20 h-20 rounded-2xl bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] flex items-center justify-center mb-6  shadow-amber-500/10">
        <Compass className="w-10 h-10 text-[var(--warning-text)] animate-pulse" />
      </div>

      <span className="text-xs font-bold uppercase tracking-wider text-[var(--warning-text)] dark:text-[var(--warning-text)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] px-3 py-1 rounded-full mb-3">
        HTTP 404 — Rota Não Encontrada
      </span>

      <h1 className="text-2xl md:text-3xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-2">
        Página Não Encontrada
      </h1>

      <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-secondary)] max-w-md mb-4 leading-relaxed">
        O endereço <code className="px-1.5 py-0.5 rounded bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] font-mono text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{pathname}</code> não corresponde a nenhuma rota ou módulo ativo no Sentinel Consig.
      </p>

      <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] max-w-sm mb-6">
        Verifique se o link foi digitado corretamente ou utilize os itens do menu lateral para navegar pelo sistema.
      </p>

      <button
        onClick={onNavigateHome}
        className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-[var(--action-ink)] bg-[var(--action)] hover:bg-[var(--action-hover)] rounded-lg  transition-colors cursor-pointer"
      >
        <Home className="w-4 h-4" />
        <span>Ir para o Dashboard</span>
      </button>
    </div>
  );
};
