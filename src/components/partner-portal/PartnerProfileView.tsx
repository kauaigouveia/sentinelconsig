import React, { useState } from 'react';
import { PartnerTelegramSettings } from './PartnerTelegramSettings';
import { User, Lock, Building2, Mail, Phone, Shield, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { PartnerInfo, PartnerPortalAccessInfo, PartnerPortalClient, TenantInfo } from '../../services/partnerPortalClient';

interface PartnerProfileViewProps {
  partner: PartnerInfo;
  access: PartnerPortalAccessInfo;
  tenant: TenantInfo;
  onContactUpdated?: (contact: { email: string | null; phone: string | null }) => void;
  onPasswordChanged?: () => void;
}

export const PartnerProfileView: React.FC<PartnerProfileViewProps> = ({
  partner,
  access,
  tenant,
  onContactUpdated,
  onPasswordChanged,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [email, setEmail] = useState(partner.email || '');
  const [phone, setPhone] = useState(partner.phone || '');
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('A confirmação de senha não confere.');
      return;
    }
    if (!access.mustChangePassword && !currentPassword) {
      setErrorMsg('Informe sua senha atual.');
      return;
    }

    setIsUpdating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await PartnerPortalClient.changePassword(newPassword, currentPassword);
      setSuccessMsg(res.message || 'Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onPasswordChanged?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Falha ao alterar senha.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingContact) return;
    setIsSavingContact(true);
    setContactError(null);
    setContactSuccess(null);
    try {
      const updated = await PartnerPortalClient.updateContact({ email, phone });
      setEmail(updated.email || '');
      setPhone(updated.phone || '');
      onContactUpdated?.(updated);
      setContactSuccess('E-mail e telefone atualizados com sucesso.');
    } catch (err: any) {
      setContactError(err?.message || 'Não foi possível atualizar seus contatos.');
    } finally {
      setIsSavingContact(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 select-none animate-in fade-in duration-150 text-xs">
      <PartnerTelegramSettings key={`${tenant.id}:${partner.id}:${access.mustChangePassword}`} />
      {/* Dados Cadastrais do Parceiro */}
      <div className="rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <Building2 className="h-4 w-4 text-[var(--link)]" />
          <h2 className="text-sm font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-tight">
            Dados Cadastrais do Parceiro
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-[var(--text-secondary)] block">Razão Social / Nome</span>
            <p className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-sm">{partner.name}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-[var(--text-secondary)] block">Código Operacional</span>
            <p className="font-mono font-bold text-[var(--link)] dark:text-[var(--link)]">{partner.code}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-[var(--text-secondary)] block">Documento (CPF/CNPJ)</span>
            <p className="font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{partner.document || 'Não informado'}</p>
          </div>
        </div>

        <form onSubmit={handleUpdateContact} className="border-t border-[var(--field-border)] dark:border-[var(--field-border)] pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-[10.5px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> E-mail Comercial</span>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                className="w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-normal text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]"
              />
            </label>
            <label className="space-y-1 text-[10.5px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Telefone / WhatsApp</span>
              <input
                type="tel"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                maxLength={30}
                autoComplete="tel"
                placeholder="DDD + número"
                className="w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-normal text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]"
              />
            </label>
          </div>

          {contactSuccess && <p role="status" className="text-[var(--success-text)] dark:text-[var(--success-text)]">{contactSuccess}</p>}
          {contactError && <p role="alert" className="text-[var(--danger-text)] dark:text-[var(--danger-text)]">{contactError}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]"><Shield className="h-3.5 w-3.5" /> Nome e documento são gerenciados pela organização {tenant.name}.</p>
            <button type="submit" disabled={isSavingContact} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--action)] px-3 py-2 text-[11px] font-bold text-[var(--action-ink)] hover:bg-[var(--action-hover)] disabled:opacity-90">
              <Save className="h-3.5 w-3.5" /> {isSavingContact ? 'Salvando…' : 'Salvar contatos'}
            </button>
          </div>
        </form>
      </div>

      {/* Usuário de Acesso & Segurança */}
      <div className="rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <User className="h-4 w-4 text-[var(--link)]" />
          <h2 className="text-sm font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-tight">
            Credencial de Acesso ao Portal
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2">
          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-[var(--text-secondary)] block">Nome do Operador</span>
            <p className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{access.name}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-[var(--text-secondary)] block">E-mail de Login</span>
            <p className="font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{access.email}</p>
          </div>
        </div>

        {/* Alterar Senha */}
        <div className="pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] space-y-3">
          <div className="flex items-center gap-1.5 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <Lock className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
            <span>Alterar Senha de Acesso</span>
          </div>

          {successMsg && (
            <div className="p-3 rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)] flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
            {!access.mustChangePassword && (
              <div className="space-y-1">
                <label htmlFor="partner-current-password" className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">Senha Atual</label>
                <input
                  id="partner-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={isUpdating}
                  className="w-full h-9 px-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs"
                />
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="partner-new-password" className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">Nova Senha</label>
              <input
                id="partner-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                autoComplete="new-password"
                disabled={isUpdating}
                className="w-full h-9 px-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="partner-confirm-password" className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">Confirme a Nova Senha</label>
              <input
                id="partner-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                required
                minLength={6}
                autoComplete="new-password"
                disabled={isUpdating}
                className="w-full h-9 px-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={isUpdating}
              className="px-4 py-2 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] disabled:opacity-90 text-[var(--action-ink)] font-bold transition-colors cursor-pointer shadow-2xs"
            >
              {isUpdating ? 'Atualizando...' : 'Salvar Nova Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
