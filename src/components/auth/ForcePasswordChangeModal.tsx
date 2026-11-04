import React, { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { User } from '../../types';

interface ForcePasswordChangeModalProps {
  user: User;
  onSuccess: () => void;
}

export const ForcePasswordChangeModal: React.FC<ForcePasswordChangeModalProps> = ({ user, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMinLength = newPassword.length >= 6;
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword;
  const isValid = isMinLength && isMatching;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isMinLength) {
      setErrorMsg('A nova senha deve possuir pelo menos 6 caracteres.');
      return;
    }

    if (!isMatching) {
      setErrorMsg('As senhas digitadas não coincidem.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Erro ao redefinir senha.');
      }

      // Update active user in local storage to prevent flicker before reload
      const updatedUser = { ...user, mustChangePassword: false };
      StorageService.setActiveUser(updatedUser);

      setIsSubmitting(false);
      onSuccess();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || 'Erro ao redefinir senha.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-6 md:p-8  text-[var(--text-primary)] relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning-border)] flex items-center justify-center shrink-0">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-[var(--text-primary)] leading-tight">
              Defina sua Nova Senha
            </h2>
            <p className="text-xs text-[var(--warning-text)] font-semibold mt-0.5 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Troca Obrigatória no Primeiro Acesso</span>
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-[var(--field-border)] bg-[var(--bg-surface-elevated)] p-3.5 text-xs text-[var(--text-primary)] space-y-1">
          <p className="font-bold text-[var(--text-primary)]">Olá, {user.name}!</p>
          <p className="text-[var(--text-secondary)]">
            Sua conta (<strong className="text-[var(--text-primary)]">{user.email}</strong>) possui uma senha temporária. Para sua segurança, defina uma nova senha pessoal para continuar acessando o sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Nova Senha *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
              <input
                type={showPass ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                className="w-full rounded-xl border border-[var(--field-border)] bg-[var(--bg-surface-elevated)] pl-9 pr-10 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] focus:outline-hidden focus:ring-1 focus:ring-[var(--focus)] transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Confirmar Nova Senha *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
              <input
                type={showPass ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full rounded-xl border border-[var(--field-border)] bg-[var(--bg-surface-elevated)] pl-9 pr-10 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] focus:outline-hidden focus:ring-1 focus:ring-[var(--focus)] transition-all"
                required
              />
            </div>
          </div>

          {/* Validation Checklist */}
          <div className="space-y-1.5 py-1 text-[11px]">
            <div className={`flex items-center gap-1.5 ${isMinLength ? 'text-[var(--success-text)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Mínimo de 6 caracteres</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isMatching ? 'text-[var(--success-text)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>As senhas coincidem</span>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger-text)] flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[var(--danger-text)] shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="w-full rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] disabled:opacity-90 px-4 py-3 text-xs font-bold text-[var(--action-ink)]   transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <span>Salvando nova senha...</span>
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                <span>Salvar Nova Senha & Entrar</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
