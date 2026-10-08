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

  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"><KeyRound className="h-5 w-5" /></span>
            <div>
              <h2 id="change-password-title" className="text-base font-bold text-slate-900 dark:text-white">Alterar senha</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Confirme sua senha atual para continuar.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {[
            { id: 'current-password', label: 'Senha atual', value: currentPassword, setValue: setCurrentPassword, autoComplete: 'current-password' },
            { id: 'new-password', label: 'Nova senha', value: newPassword, setValue: setNewPassword, autoComplete: 'new-password' },
            { id: 'confirm-password', label: 'Confirmar nova senha', value: confirmPassword, setValue: setConfirmPassword, autoComplete: 'new-password' },
          ].map(field => (
            <div key={field.id} className="space-y-1">
              <label htmlFor={field.id} className="text-xs font-semibold text-slate-700 dark:text-slate-300">{field.label}</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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

          <button type="button" onClick={() => setShowPasswords(value => !value)} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
            {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
          </button>

          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={isSaving} className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button>
            <button type="submit" disabled={isSaving} className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{isSaving ? 'Salvando…' : 'Salvar senha'}</button>
          </div>
        </form>
      </section>
    </div>
  );
};
