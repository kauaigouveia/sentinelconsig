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
      <div className="w-20 h-20 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/10">
        <Compass className="w-10 h-10 text-amber-500 animate-pulse" />
      </div>

      <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/50 px-3 py-1 rounded-full mb-3">
        HTTP 404 — Rota Não Encontrada
      </span>

      <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 mb-2">
        Página Não Encontrada
      </h1>

      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mb-4 leading-relaxed">
        O endereço <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200">{pathname}</code> não corresponde a nenhuma rota ou módulo ativo no Sentinel Consig.
      </p>

      <p className="text-xs text-slate-500 dark:text-slate-500 max-w-sm mb-6">
        Verifique se o link foi digitado corretamente ou utilize os itens do menu lateral para navegar pelo sistema.
      </p>

      <button
        onClick={onNavigateHome}
        className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-colors cursor-pointer"
      >
        <Home className="w-4 h-4" />
        <span>Ir para o Dashboard</span>
      </button>
    </div>
  );
};
