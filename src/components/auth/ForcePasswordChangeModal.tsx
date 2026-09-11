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

  const handleSubmit = (e: React.FormEvent) => {
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
    setTimeout(() => {
      try {
        StorageService.updateUserPassword(user.id, newPassword);
        setIsSubmitting(false);
        onSuccess();
      } catch (err: any) {
        setIsSubmitting(false);
        setErrorMsg(err.message || 'Erro ao redefinir senha.');
      }
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 md:p-8 shadow-2xl text-slate-100 relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white leading-tight">
              Defina sua Nova Senha
            </h2>
            <p className="text-xs text-amber-400 font-semibold mt-0.5 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Troca Obrigatória no Primeiro Acesso</span>
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-800/50 p-3.5 text-xs text-slate-300 space-y-1">
          <p className="font-bold text-white">Olá, {user.name}!</p>
          <p className="text-slate-400">
            Sua conta (<strong className="text-slate-200">{user.email}</strong>) possui uma senha temporária. Para sua segurança, defina uma nova senha pessoal para continuar acessando o sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nova Senha *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type={showPass ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Confirmar Nova Senha *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type={showPass ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all"
                required
              />
            </div>
          </div>

          {/* Validation Checklist */}
          <div className="space-y-1.5 py-1 text-[11px]">
            <div className={`flex items-center gap-1.5 ${isMinLength ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Mínimo de 6 caracteres</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isMatching ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>As senhas coincidem</span>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
