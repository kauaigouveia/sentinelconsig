import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StorageService } from '../../services/storageService';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Sentinel Error Boundary] Capturou erro não tratado:', error, errorInfo);
    // A tab opened before deployment may reference a chunk that no longer exists.
    // Recover once; persistent network failures keep the manual recovery screen.
    if (/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i.test(error.message) && navigator.onLine) {
      try {
        const key = 'sentinel:chunk-recovery-at';
        const last = Number(sessionStorage.getItem(key) || 0);
        if (Date.now() - last > 5 * 60 * 1000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      } catch { /* Keep manual reload available if storage is unavailable. */ }
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleClearCacheAndReload = (): void => {
    try {
      // Limpa SOMENTE cache de dados locais descartáveis de negócio do Sentinel
      // Preserva preferências de UI (como tema escuro/claro) e NÃO executa operações no banco de dados.
      StorageService.clearBusinessCache();
    } catch (e) {
      console.warn('Erro ao limpar cache de negócio:', e);
    }
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100 p-6 selection:bg-rose-500 selection:text-white">
          <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                SENTINEL CONSIG
              </span>
              <h1 className="text-xl font-black text-white tracking-tight">
                Não foi possível carregar o Sentinel Consig
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                Veja. Antecipe. Comande.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="text-left bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-rose-300 max-h-24 overflow-y-auto break-words">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2">
              <button
                id="btn-reload-app"
                type="button"
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-md cursor-pointer"
              >
                Recarregar aplicação
              </button>

              <button
                id="btn-clear-cache-reload"
                type="button"
                onClick={this.handleClearCacheAndReload}
                className="w-full py-2.5 px-4 bg-slate-700/80 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-600 transition cursor-pointer"
              >
                Limpar cache local e recarregar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
