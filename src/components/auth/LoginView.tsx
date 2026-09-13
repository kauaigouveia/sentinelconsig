import React, { useState } from 'react';
import {
  Building2,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Phone,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { useTenantBranding } from '../../hooks/useTenantBranding';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const { branding, isLoading: isBrandingLoading } = useTenantBranding();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSuspended = branding.status === 'SUSPENDED';
  const isUnconfigured = branding.status === 'DOMAIN_NOT_CONFIGURED';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuspended || isUnconfigured) return;
    setErrorMsg(null);

    if (!email.trim()) {
      setErrorMsg('Informe o e-mail de acesso.');
      return;
    }

    if (!password.trim()) {
      setErrorMsg('Informe a senha de acesso.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: password.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.message || data.error || 'Credenciais inválidas.');
        setIsSubmitting(false);
        return;
      }

      if (data.user) {
        StorageService.loginUser(data.user);
        setIsSubmitting(false);
        onLoginSuccess();
      } else {
        setErrorMsg('Erro inesperado na resposta de autenticação.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMsg('Não foi possível conectar ao servidor de autenticação. Verifique sua conexão.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col justify-between bg-slate-900 text-slate-100 font-sans antialiased relative overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Dynamic Background Glow Effect */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 blur-3xl pointer-events-none opacity-25"
        style={{
          background: `radial-gradient(ellipse at top, ${branding.primaryColor || '#2563eb'}, transparent 70%)`,
        }}
      />

      {/* Top Brand Header */}
      <header className="p-6 md:p-8 flex items-center justify-between z-10 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center shrink-0">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                className="h-full w-full object-contain filter drop-shadow-md rounded-lg"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="h-10 w-10 rounded-xl text-white font-black text-sm flex items-center justify-center shadow-sm"
                style={{ backgroundColor: branding.primaryColor || '#2563eb' }}
              >
                {branding.companyName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white leading-tight">
              {branding.companyName}
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              {branding.legalName || 'Central Integrada de Consignados & Esteira de Produção'}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/80 text-xs text-slate-400 backdrop-blur-md">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Ambiente Seguro & Auditado</span>
        </div>
      </header>

      {/* Main Login Card Area */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-6 z-10 my-auto">
        <div className="w-full max-w-md">
          {/* Suspended Alert Banner */}
          {isSuspended && (
            <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 backdrop-blur-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-amber-300">Acesso Temporariamente Suspenso</h4>
                  <p className="text-xs text-amber-200/90 mt-1">
                    Esta organização está com o acesso temporariamente indisponível. Entre em contato com o suporte ou gestor da conta.
                  </p>
                  {branding.supportEmail && (
                    <div className="mt-2 text-xs font-semibold flex items-center gap-1.5 text-amber-100">
                      <Mail className="h-3.5 w-3.5" />
                      <span>{branding.supportEmail}</span>
                    </div>
                  )}
                  {branding.supportPhone && (
                    <div className="mt-1 text-xs font-semibold flex items-center gap-1.5 text-amber-100">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{branding.supportPhone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Domain Not Configured Banner */}
          {isUnconfigured && (
            <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200 backdrop-blur-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-rose-300">Domínio Não Mapeado</h4>
                  <p className="text-xs text-rose-200/90 mt-1">
                    Este domínio ou subdomínio ainda não foi vinculado a nenhum tenant ativo no Sentinel Consig.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 md:p-8 shadow-2xl backdrop-blur-xl relative">
            <div className="mb-6 text-center">
              <div className="h-16 w-16 mx-auto mb-3 flex items-center justify-center">
                {branding.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt={branding.companyName}
                    className="h-full w-full object-contain filter drop-shadow-lg rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="h-16 w-16 rounded-2xl text-white font-black text-xl flex items-center justify-center shadow-lg"
                    style={{ backgroundColor: branding.primaryColor || '#2563eb' }}
                  >
                    {branding.companyName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <h3 className="text-xl font-extrabold text-white">Acesso ao Sistema</h3>
              <p className="text-xs text-slate-400 mt-1">Entre com seu e-mail corporativo e senha cadastrados</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  E-mail de Acesso *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    disabled={isSuspended || isUnconfigured || isSubmitting}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={`seu.email@${branding.companyName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'promotora'}.com.br`}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Senha *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    disabled={isSuspended || isUnconfigured || isSubmitting}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    required
                  />
                  <button
                    type="button"
                    disabled={isSuspended || isUnconfigured}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer disabled:opacity-40"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-200">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    disabled={isSuspended || isUnconfigured}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  <span>Lembrar sessão neste navegador</span>
                </label>
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || isSuspended || isUnconfigured || isBrandingLoading}
                className="w-full rounded-xl px-4 py-3 text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isSuspended || isUnconfigured ? '#475569' : branding.primaryColor || '#2563eb',
                }}
              >
                {isSubmitting ? (
                  <span>Autenticando...</span>
                ) : (
                  <>
                    <span>Entrar no Sistema</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-slate-800 text-center text-xs text-slate-500 z-10 max-w-7xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center gap-2">
        <p>{branding.footerText || `© 2026 ${branding.companyName}. Todos os direitos reservados.`}</p>
        <p className="flex items-center gap-1 text-[11px]">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>SLA e Portabilidades monitoradas em tempo real (24/7)</span>
        </p>
      </footer>
    </div>
  );
};

