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
  Layers,
  Database,
  Radio,
  Server,
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
      setErrorMsg('Informe o e-mail corporativo de acesso.');
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
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.message || data.error || 'Credenciais de acesso inválidas.');
        setIsSubmitting(false);
        return;
      }

      if (data.user) {
        if (data.token) {
          localStorage.setItem('cg_session_token', data.token);
        }
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
    <div className="min-h-screen w-screen flex bg-[#080D18] text-slate-100 font-sans antialiased relative overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* LEFT SECTION: Enterprise Institutional Branding & Telemetry */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative border-r border-slate-800/80 bg-gradient-to-br from-[#0b1329] via-[#080D18] to-[#040810] overflow-hidden">
        {/* Background Ambient Glows */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                className="h-11 w-auto max-w-[180px] object-contain"
              />
            ) : (
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center text-white font-black shadow-lg shadow-blue-500/20">
                <Building2 className="h-6 w-6" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <span>{branding.companyName || 'SENTINEL CONSIG'}</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  ENTERPRISE
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">Plataforma Financeira & Gestão de Crédito Consignado</p>
            </div>
          </div>
        </div>

        {/* Center Pillars */}
        <div className="relative z-10 my-auto py-10 space-y-8">
          <div className="space-y-3 max-w-lg">
            <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              <span>Ambiente Corporativo de Alta Confiabilidade</span>
            </span>
            <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
              Controle absoluto de esteira, alçadas e liquidação bancária.
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Desenvolvido exclusivamente para correspondentes bancários, promotoras e mesas de crédito que exigem máxima velocidade, isolamento de dados e auditoria em tempo real.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <Radio className="h-3.5 w-3.5" />
                <span>Pusher Live Engine</span>
              </div>
              <p className="text-[11px] text-slate-400">Sincronização instantânea de propostas e status sem recarga</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                <Database className="h-3.5 w-3.5" />
                <span>PostgreSQL Isolado</span>
              </div>
              <p className="text-[11px] text-slate-400">Multi-tenant seguro com isolamento estrito de bases e regras</p>
            </div>
          </div>
        </div>

        {/* Footer Telemetry */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 pt-6 border-t border-slate-800/60 font-mono">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>SISTEMA 100% OPERACIONAL</span>
          </span>
          <span>v3.4.0 • SOC 2 COMPLIANT</span>
        </div>
      </div>

      {/* RIGHT SECTION: Access Form */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-12 md:p-16 lg:p-20 relative z-10 max-w-xl mx-auto w-full">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black shadow-md">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white">{branding.companyName || 'SENTINEL CONSIG'}</h1>
            <p className="text-xs text-slate-400">Mesa de Crédito & Gestão</p>
          </div>
        </div>

        <div className="my-auto space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-white">Acesse sua conta</h2>
            <p className="text-xs text-slate-400">
              Digite seu e-mail corporativo e senha para acessar o painel de operações.
            </p>
          </div>

          {/* Account Suspended Banner */}
          {isSuspended && (
            <div className="p-4 rounded-xl border border-rose-800/80 bg-rose-950/40 text-rose-200 text-xs flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Instância Temporariamente Suspensa</strong>
                <span>Entre em contato com o suporte ou gestor de faturamento para reativar seu acesso.</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-rose-800/80 bg-rose-950/40 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                E-mail Corporativo
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu.email@promotora.com.br"
                  disabled={isSubmitting || isSuspended}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-hidden transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">
                  Senha de Acesso
                </label>
                <span className="text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer">
                  Esqueceu a senha?
                </span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isSubmitting || isSuspended}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-hidden transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
                />
                <span className="text-xs text-slate-400">Lembrar neste navegador</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isSuspended}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs py-3 shadow-lg shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>ACESSAR PLATAFORMA</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Bottom Footer */}
        <div className="pt-6 text-center text-[11px] text-slate-500">
          <span>{branding.footerText || '© 2026 Sentinel Consig. Todos os direitos reservados.'}</span>
        </div>
      </div>
    </div>
  );
};
