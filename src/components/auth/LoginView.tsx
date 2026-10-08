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
import { SYSTEM_IDENTITY } from '../../lib/branding';

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
  const [recoveryHelpVisible, setRecoveryHelpVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSuspended = branding.status === 'SUSPENDED';
  const isUnconfigured =
    branding.status === 'DOMAIN_NOT_CONFIGURED' ||
    branding.domainType === 'DOMAIN_NOT_CONFIGURED';

  // 1. Loading State
  if (isBrandingLoading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#080D18] text-slate-100 font-sans antialiased">
        <div className="h-8 w-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4" />
        <span className="text-xs text-slate-400 font-medium">Carregando ambiente...</span>
      </div>
    );
  }

  // 2. Domain Not Configured Screen (Requirement 2 & 3)
  if (isUnconfigured) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#080D18] text-slate-100 font-sans antialiased p-6 selection:bg-blue-600 selection:text-white">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800/80 rounded-2xl p-8 shadow-2xl text-center space-y-6 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

          <div className="mx-auto h-16 w-16 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-amber-400 shadow-inner">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black tracking-tight text-white">
              Domínio não configurado
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed font-normal">
              Este endereço ainda não está associado a uma organização do Sentinel Consig.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1 text-left font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Endereço acessado:</span>
              <span className="text-slate-200 font-bold">{branding.resolvedHost || window.location.hostname}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status da resolução:</span>
              <span className="text-amber-400 font-semibold">DOMAIN_NOT_CONFIGURED</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
            <span>Para registrar ou vincular este subdomínio, contate o suporte técnico.</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. Instance Suspended Screen
  if (isSuspended) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#080D18] text-slate-100 font-sans antialiased p-6 selection:bg-rose-600 selection:text-white">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800/80 rounded-2xl p-8 shadow-2xl text-center space-y-6 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-600 to-red-600" />

          <div className="mx-auto h-16 w-16 rounded-2xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400 shadow-inner">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black tracking-tight text-white">
              Acesso Temporariamente Suspenso
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed font-normal">
              A organização vinculada a este endereço está temporariamente suspensa. Entre em contato com o gestor de conta ou suporte técnico.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1 text-left font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Organização:</span>
              <span className="text-slate-200 font-bold">{branding.companyName || 'Instância Suspensa'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
      let response: Response;
      try {
        response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: password.trim(), rememberMe }),
          credentials: 'include',
        });
      } catch (fetchErr: any) {
        setErrorMsg('Não foi possível alcançar a API. Verifique se o servidor está online ou sua conexão de rede.');
        setIsSubmitting(false);
        return;
      }

      let data: any;
      try {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch (jsonErr) {
          setErrorMsg('A API de autenticação retornou uma resposta inválida (Formato não-JSON).');
          setIsSubmitting(false);
          return;
        }
      } catch (readErr: any) {
        setErrorMsg('Falha ao ler os dados retornados pelo servidor de autenticação.');
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        if (response.status === 500) {
          setErrorMsg('Erro interno do servidor de autenticação.');
        } else {
          setErrorMsg(data?.message || data?.error || `Erro de autenticação (HTTP ${response.status}).`);
        }
        setIsSubmitting(false);
        return;
      }

      if (data && data.user) {
        // P0-B: Session identifier is managed strictly via HttpOnly cookie.
        // Purge any legacy token residue if present.
        try {
          localStorage.removeItem('cg_session_token');
          sessionStorage.removeItem('cg_session_token');
        } catch {}
        StorageService.loginUser(data.user);
        setIsSubmitting(false);
        onLoginSuccess();
      } else {
        setErrorMsg('Erro inesperado na resposta de autenticação.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMsg('Erro inesperado ao tentar realizar a autenticação.');
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
                <span>{branding.companyName || SYSTEM_IDENTITY.displayName}</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  ENTERPRISE
                </span>
              </h1>
              <p className="text-xs text-slate-300 font-bold tracking-wide">
                {SYSTEM_IDENTITY.tagline}
              </p>
            </div>
          </div>
        </div>

        {/* Center Pillars */}
        <div className="relative z-10 my-auto py-10 space-y-8">
          <div className="space-y-3 max-w-lg">
            <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              <span>{SYSTEM_IDENTITY.shortTagline}</span>
            </span>
            <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
              Inteligência que antecipa.<br />Controle que transforma.
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Desenvolvido exclusivamente para correspondentes bancários, promotoras e mesas de crédito que exigem máxima velocidade, isolamento de dados e auditoria em tempo real.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <Radio className="h-3.5 w-3.5" />
                <span>Atualização Instantânea</span>
              </div>
              <p className="text-[11px] text-slate-400">Sincronização imediata de esteiras e propostas em tempo real</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                <Database className="h-3.5 w-3.5" />
                <span>Ambiente Seguro</span>
              </div>
              <p className="text-[11px] text-slate-400">Seus dados e operações protegidos com isolamento exclusivo</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 pt-6 border-t border-slate-800/60 font-mono">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
            <span>ACESSO AO SENTINEL CONSIG</span>
          </span>
          <span>AMBIENTE SEGURO</span>
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

          {/* Domain Not Configured Banner */}
          {isUnconfigured && (
            <div className="p-4 rounded-xl border border-amber-800/80 bg-amber-950/40 text-amber-200 text-xs flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Domínio Não Configurado ou Pendente de Verificação</strong>
                <span>Este endereço de acesso ainda não foi verificado para nenhuma organização ativa. Acesse pelo portal principal ou contate o administrador.</span>
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
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-300">
                E-mail Corporativo
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  id="login-email"
                  name="email"
                  autoComplete="username"
                  required
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
                <label htmlFor="login-password" className="block text-xs font-semibold text-slate-300">
                  Senha de Acesso
                </label>
                <button type="button" onClick={() => setRecoveryHelpVisible(value => !value)} aria-expanded={recoveryHelpVisible} className="text-[11px] text-blue-400 hover:text-blue-300">
                  Esqueceu a senha?
                </button>
              </div>
              {recoveryHelpVisible && (
                <p className="rounded-lg border border-blue-900/70 bg-blue-950/40 px-3 py-2 text-[11px] leading-relaxed text-blue-200">
                  Para proteger sua conta, solicite a redefinição de senha ao gestor da sua empresa.
                </p>
              )}
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  required
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
                  disabled={isSubmitting}
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
