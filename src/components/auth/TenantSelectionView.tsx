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
    <div className="min-h-screen w-screen flex bg-[var(--bg-surface)] text-[var(--text-primary)] font-sans items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-8  relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-[var(--info-bg)] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-[var(--info-bg)] text-[var(--link)] border border-[var(--field-border)] flex items-center justify-center mb-6">
            <Building2 className="h-8 w-8" />
          </div>

          <h2 className="text-2xl font-black text-[var(--text-primary)] mb-2">Bem-vindo, {user.name.split(' ')[0]}</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-8">
            Você possui acesso a múltiplas empresas. Selecione o ambiente que deseja acessar.
          </p>

          {errorMsg && (
            <div className="mb-6 w-full rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-xs text-[var(--danger-text)] flex items-center gap-3 text-left">
              <AlertCircle className="h-5 w-5 text-[var(--danger-text)] shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="w-full space-y-3">
            {memberships.map((m: any) => (
              <button
                key={m.id}
                disabled={isSubmitting}
                onClick={() => handleSelect(m.id, m.tenantId)}
                className="w-full group flex items-center justify-between rounded-xl border border-[var(--field-border)] bg-[var(--bg-surface-elevated)] p-4 hover:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)] transition-all cursor-pointer text-left disabled:opacity-90"
              >
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] group-hover:text-[var(--link)] transition-colors">
                    {m.tenantName || 'Empresa sem nome'}
                  </h3>
                  <p className="text-xs font-semibold text-[var(--text-secondary)] mt-0.5 uppercase tracking-wide">
                    {m.role}
                  </p>
                </div>
                <div className="h-8 w-8 rounded-full bg-[var(--bg-surface-elevated)] flex items-center justify-center group-hover:bg-[var(--info-bg)] group-hover:text-[var(--text-primary)] text-[var(--text-secondary)] transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>

          {isSubmitting && (
            <div className="absolute inset-0 bg-[var(--bg-surface)] backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-2xl">
              <Loader2 className="h-8 w-8 text-[var(--link)] animate-spin mb-4" />
              <span className="text-xs font-bold text-[var(--link)] tracking-wide">Preparando ambiente...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
