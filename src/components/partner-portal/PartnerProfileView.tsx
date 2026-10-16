import React, { useState } from 'react';
import { PartnerTelegramSettings } from './PartnerTelegramSettings';
import { User, Lock, Building2, Mail, Phone, Shield, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { PartnerInfo, PartnerPortalAccessInfo, PartnerPortalClient, TenantInfo } from '../../services/partnerPortalClient';

interface PartnerProfileViewProps {
  partner: PartnerInfo;
  access: PartnerPortalAccessInfo;
  tenant: TenantInfo;
  onContactUpdated?: (contact: { email: string | null; phone: string | null }) => void;
}

export const PartnerProfileView: React.FC<PartnerProfileViewProps> = ({
  partner,
  access,
  tenant,
  onContactUpdated,
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
      <PartnerTelegramSettings />
      {/* Dados Cadastrais do Parceiro */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Building2 className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Dados Cadastrais do Parceiro
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-slate-400 block">Razão Social / Nome</span>
            <p className="font-bold text-slate-900 dark:text-white text-sm">{partner.name}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-slate-400 block">Código Operacional</span>
            <p className="font-mono font-bold text-blue-600 dark:text-blue-400">{partner.code}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-slate-400 block">Documento (CPF/CNPJ)</span>
            <p className="font-mono text-slate-700 dark:text-slate-300">{partner.document || 'Não informado'}</p>
          </div>
        </div>

        <form onSubmit={handleUpdateContact} className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> E-mail Comercial</span>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <label className="space-y-1 text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Telefone / WhatsApp</span>
              <input
                type="tel"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                maxLength={30}
                autoComplete="tel"
                placeholder="DDD + número"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
          </div>

          {contactSuccess && <p role="status" className="text-emerald-600 dark:text-emerald-400">{contactSuccess}</p>}
          {contactError && <p role="alert" className="text-rose-600 dark:text-rose-400">{contactError}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[10px] text-slate-400"><Shield className="h-3.5 w-3.5" /> Nome e documento são gerenciados pela organização {tenant.name}.</p>
            <button type="submit" disabled={isSavingContact} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-blue-500 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {isSavingContact ? 'Salvando…' : 'Salvar contatos'}
            </button>
          </div>
        </form>
      </div>

      {/* Usuário de Acesso & Segurança */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <User className="h-4 w-4 text-indigo-500" />
          <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Credencial de Acesso ao Portal
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2">
          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-slate-400 block">Nome do Operador</span>
            <p className="font-bold text-slate-900 dark:text-white">{access.name}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10.5px] font-bold uppercase text-slate-400 block">E-mail de Login</span>
            <p className="font-mono text-slate-700 dark:text-slate-300">{access.email}</p>
          </div>
        </div>

        {/* Alterar Senha */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            <span>Alterar Senha de Acesso</span>
          </div>

          {successMsg && (
            <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
            {!access.mustChangePassword && (
              <div className="space-y-1">
                <label htmlFor="partner-current-password" className="font-semibold text-slate-600 dark:text-slate-400 block">Senha Atual</label>
                <input
                  id="partner-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={isUpdating}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                />
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="partner-new-password" className="font-semibold text-slate-600 dark:text-slate-400 block">Nova Senha</label>
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
                className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="partner-confirm-password" className="font-semibold text-slate-600 dark:text-slate-400 block">Confirme a Nova Senha</label>
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
                className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={isUpdating}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold transition-colors cursor-pointer shadow-2xs"
            >
              {isUpdating ? 'Atualizando...' : 'Salvar Nova Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
