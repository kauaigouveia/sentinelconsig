import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, X } from 'lucide-react';
import { toastService } from '../ui/toastService';

interface ChangePasswordModalProps {
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setError('');
    if (newPassword.trim().length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Escolha uma senha diferente da atual.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || 'Não foi possível alterar a senha.');
      toastService.success('Senha alterada', 'Sua senha foi atualizada com sucesso.');
      onClose();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Não foi possível alterar a senha.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-3 py-2.5 pr-10 text-sm text-[var(--text-secondary)] focus:border-[var(--field-border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="w-full max-w-md rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-6  dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]"><KeyRound className="h-5 w-5" /></span>
            <div>
              <h2 id="change-password-title" className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Alterar senha</h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">Confirme sua senha atual para continuar.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Fechar" className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] disabled:opacity-90 dark:hover:bg-[var(--bg-surface-elevated)]"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {[
            { id: 'current-password', label: 'Senha atual', value: currentPassword, setValue: setCurrentPassword, autoComplete: 'current-password' },
            { id: 'new-password', label: 'Nova senha', value: newPassword, setValue: setNewPassword, autoComplete: 'new-password' },
            { id: 'confirm-password', label: 'Confirmar nova senha', value: confirmPassword, setValue: setConfirmPassword, autoComplete: 'new-password' },
          ].map(field => (
            <div key={field.id} className="space-y-1">
              <label htmlFor={field.id} className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{field.label}</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  id={field.id}
                  type={showPasswords ? 'text' : 'password'}
                  value={field.value}
                  onChange={event => field.setValue(event.target.value)}
                  autoComplete={field.autoComplete}
                  minLength={field.id === 'current-password' ? undefined : 6}
                  required
                  disabled={isSaving}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>
          ))}

          <button type="button" onClick={() => setShowPasswords(value => !value)} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]">
            {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
          </button>

          {error && <p role="alert" className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger-text)] dark:border-[var(--danger-border)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-[var(--field-border)] pt-4 dark:border-[var(--field-border)]">
            <button type="button" onClick={onClose} disabled={isSaving} className="rounded-lg border border-[var(--field-border)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-canvas)] disabled:opacity-90 dark:border-[var(--field-border)] dark:text-[var(--text-primary)] dark:hover:bg-[var(--bg-surface-elevated)]">Cancelar</button>
            <button type="submit" disabled={isSaving} className="rounded-lg bg-[var(--action)] px-3.5 py-2 text-xs font-semibold text-[var(--action-ink)] hover:bg-[var(--action-hover)] disabled:cursor-wait disabled:opacity-90">{isSaving ? 'Salvando…' : 'Salvar senha'}</button>
          </div>
        </form>
      </section>
    </div>
  );
};
