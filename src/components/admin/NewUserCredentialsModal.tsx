import React, { useState } from 'react';
import { KeyRound, Copy, Check, ShieldCheck, Mail, User as UserIcon, X } from 'lucide-react';
import { User } from '../../types';
import { StorageService } from '../../services/storageService';
import { getRoleEmoji, ROLE_CONFIG } from '../../lib/roleUtils';

interface NewUserCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  tempPassword: string;
  isReset?: boolean;
}

export const NewUserCredentialsModal: React.FC<NewUserCredentialsModalProps> = ({
  isOpen,
  onClose,
  user,
  tempPassword,
  isReset = false,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const roleConf = ROLE_CONFIG[user.role];

  const handleCopy = () => {
    const wl = StorageService.getWhiteLabel();
    const textToCopy = `📌 DADOS DE ACESSO AO ${wl.companyName}\n\nOperador: ${user.name}\nE-mail: ${user.email}\nPerfil: ${user.role}\nSenha Temporária: ${tempPassword}\n\n* Observação: No seu primeiro acesso, o sistema exigirá a redefinição desta senha.`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl relative text-slate-900 dark:text-slate-100">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black leading-tight text-slate-900 dark:text-white">
              {isReset ? 'Senha Temporária Redefinida' : 'Usuário Cadastrado com Sucesso!'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isReset ? 'Nova senha gerada para o operador.' : 'Envie os dados de acesso abaixo ao operador.'}
            </p>
          </div>
        </div>

        {/* User Card Info */}
        <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 mb-5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <UserIcon className="h-3.5 w-3.5" /> Nome:
            </span>
            <span className="font-bold text-slate-900 dark:text-white">{user.name}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <Mail className="h-3.5 w-3.5" /> E-mail:
            </span>
            <span className="font-mono text-slate-900 dark:text-slate-200 font-semibold">{user.email}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Perfil:</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${roleConf?.badgeClass || ''}`}>
              {getRoleEmoji(user.role)} {user.role}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Senha Temporária de Acesso
            </span>
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 font-mono text-sm font-black text-blue-600 dark:text-blue-400">
              <span>{tempPassword}</span>
              <span className="text-[10px] uppercase font-sans font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                Aguardando 1º Acesso
              </span>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mb-6 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/40 p-3 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="leading-snug">
            <strong>Troca de Senha Obrigatória:</strong> Ao fazer login pela primeira vez com esta senha temporária, o operador será forçado pelo sistema a cadastrar uma nova senha pessoal definitiva.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-300" />
                <span>Dados Copiados!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copiar Dados de Acesso</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold px-4 py-2.5 text-xs transition-all cursor-pointer"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
};
