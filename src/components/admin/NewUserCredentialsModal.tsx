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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  relative text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-xl bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)] flex items-center justify-center shrink-0">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black leading-tight text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              {isReset ? 'Senha Temporária Redefinida' : 'Usuário Cadastrado com Sucesso!'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
              {isReset ? 'Nova senha gerada para o operador.' : 'Envie os dados de acesso abaixo ao operador.'}
            </p>
          </div>
        </div>

        {/* User Card Info */}
        <div className="space-y-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] p-4 mb-5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center gap-1.5 font-medium">
              <UserIcon className="h-3.5 w-3.5" /> Nome:
            </span>
            <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{user.name}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center gap-1.5 font-medium">
              <Mail className="h-3.5 w-3.5" /> E-mail:
            </span>
            <span className="font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-semibold">{user.email}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-medium">Perfil:</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${roleConf?.badgeClass || ''}`}>
              {getRoleEmoji(user.role)} {user.role}
            </span>
          </div>

          <div className="pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
              Senha Temporária de Acesso
            </span>
            <div className="flex items-center justify-between bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg px-3 py-2 font-mono text-sm font-black text-[var(--link)] dark:text-[var(--link)]">
              <span>{tempPassword}</span>
              <span className="text-[10px] uppercase font-sans font-bold bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] px-2 py-0.5 rounded border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
                Aguardando 1º Acesso
              </span>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mb-6 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-3 text-xs text-[var(--link)] dark:text-[var(--link)] flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)] shrink-0 mt-0.5" />
          <p className="leading-snug">
            <strong>Troca de Senha Obrigatória:</strong> Ao fazer login pela primeira vez com esta senha temporária, o operador será forçado pelo sistema a cadastrar uma nova senha pessoal definitiva.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold px-4 py-2.5 text-xs  transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-[var(--success-text)]" />
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
            className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] font-bold px-4 py-2.5 text-xs transition-all cursor-pointer"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
};
