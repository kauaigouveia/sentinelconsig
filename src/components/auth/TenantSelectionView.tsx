import React, { useState } from 'react';
import { User } from '../../types';
import { Building2, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { StorageService } from '../../services/storageService';

interface TenantSelectionViewProps {
  user: User;
  onSuccess: () => void;
}

export const TenantSelectionView: React.FC<TenantSelectionViewProps> = ({ user, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const memberships = user.availableMemberships || [];

  const handleSelect = async (membershipId: string, tenantId: string) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/switch-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, membershipId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao selecionar empresa.');
      }
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de conexão.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex bg-[#080D18] text-slate-100 font-sans items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center mb-6">
            <Building2 className="h-8 w-8" />
          </div>
          
          <h2 className="text-2xl font-black text-white mb-2">Bem-vindo, {user.name.split(' ')[0]}</h2>
          <p className="text-sm text-slate-400 mb-8">
            Você possui acesso a múltiplas empresas. Selecione o ambiente que deseja acessar.
          </p>

          {errorMsg && (
            <div className="mb-6 w-full rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-center gap-3 text-left">
              <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="w-full space-y-3">
            {memberships.map((m: any) => (
              <button
                key={m.id}
                disabled={isSubmitting}
                onClick={() => handleSelect(m.id, m.tenantId)}
                className="w-full group flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 p-4 hover:border-blue-500/50 hover:bg-slate-800 transition-all cursor-pointer text-left disabled:opacity-50"
              >
                <div>
                  <h3 className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors">
                    {m.tenantName || 'Empresa sem nome'}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5 uppercase tracking-wide">
                    {m.role}
                  </p>
                </div>
                <div className="h-8 w-8 rounded-full bg-slate-700/50 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white text-slate-400 transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
          
          {isSubmitting && (
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-2xl">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-4" />
              <span className="text-xs font-bold text-blue-400 tracking-wide">Preparando ambiente...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
