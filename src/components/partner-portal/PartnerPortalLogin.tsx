import React, { useState } from 'react';
import { Shield, Lock, Mail, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { SYSTEM_IDENTITY } from '../../lib/branding';
import { useTenantBranding } from '../../hooks/useTenantBranding';

interface PartnerPortalLoginProps {
  onLoginSuccess: () => void;
  tenantName?: string;
  logoUrl?: string | null;
}

export const PartnerPortalLogin: React.FC<PartnerPortalLoginProps> = ({
  onLoginSuccess,
  tenantName: propTenantName,
  logoUrl: propLogoUrl,
}) => {
  const { branding } = useTenantBranding();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prioridade de identidade do tenant:
  // 1. propTenantName se fornecido e não for o fallback genérico
  // 2. branding.companyName resolvido via TenantResolver pelo hostname
  // 3. Fallback neutro
  const resolvedCompanyName =
    branding && branding.companyName && branding.companyName !== 'Sentinel Consig'
      ? branding.companyName
      : null;

  const effectiveTenantName =
    propTenantName && propTenantName !== 'Sentinel Consig'
      ? propTenantName
      : (resolvedCompanyName || propTenantName || 'Organização');

  const effectiveLogoUrl =
    propLogoUrl ||
    branding?.logoUrl ||
    null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Informe seu e-mail e senha de acesso.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/partner-portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Credenciais inválidas ou acesso desativado nesta organização.');
      }

      onLoginSuccess();
    } catch (err: any) {
      setError(err?.message || 'Falha ao conectar ao Portal do Parceiro.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden font-sans select-none">
      {/* Dynamic Background Glow */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/90 backdrop-blur-xl p-8 shadow-2xl space-y-6">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center space-y-2.5">
            <div className="h-16 w-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-700/60 p-1.5 flex items-center justify-center shadow-xl shadow-blue-500/10 overflow-hidden">
              <img
                src={effectiveLogoUrl || SYSTEM_IDENTITY.defaultLogo}
                alt={effectiveTenantName}
                className="h-full w-full object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-black text-white tracking-tight uppercase">
                {effectiveTenantName}
              </h1>
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-sm font-bold text-blue-400">Portal do Parceiro</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  EXTERNO
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Acompanhamento de propostas e atendimento
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-300 animate-in fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">E-mail Cadastrado</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu-email@parceiro.com"
                  required
                  className="w-full h-10 pl-9 pr-3 text-xs rounded-xl border border-slate-800 bg-slate-950/70 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">Senha de Acesso</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full h-10 pl-9 pr-3 text-xs rounded-xl border border-slate-800 bg-slate-950/70 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Entrar no Portal</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer Security Badges */}
          <div className="pt-2 border-t border-slate-800/60 flex flex-col items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <div className="flex items-center justify-center gap-4">
              <span className="flex items-center gap-1">
                <Shield className="h-3.5 w-3.5 text-emerald-400" /> Acesso Criptografado
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" /> Isolamento Auditado
              </span>
            </div>
            <span className="text-[10px] text-slate-600 font-medium">
              Plataforma {SYSTEM_IDENTITY.name}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
