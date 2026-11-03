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
import { AuthFrame } from './AuthFrame';

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
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[var(--bg-surface)] text-[var(--text-primary)] font-sans antialiased">
        <div className="h-8 w-8 border-2 border-[var(--field-border)] border-t-blue-500 rounded-full animate-spin mb-4" />
        <span className="text-xs text-[var(--text-secondary)] font-medium">Carregando ambiente...</span>
      </div>
    );
  }

  // 2. Domain Not Configured Screen (Requirement 2 & 3)
  if (isUnconfigured) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[var(--bg-surface)] text-[var(--text-primary)] font-sans antialiased p-6 selection:bg-[var(--action)] selection:text-[var(--text-primary)]">
        <div className="max-w-md w-full bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] rounded-2xl p-8  text-center space-y-6 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1    " />

          <div className="mx-auto h-16 w-16 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] flex items-center justify-center text-[var(--warning-text)] ">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black tracking-tight text-[var(--text-primary)]">
              Domínio não configurado
            </h1>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-normal">
              Este endereço ainda não está associado a uma organização do Sentinel Consig.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] text-[11px] text-[var(--text-secondary)] space-y-1 text-left font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Endereço acessado:</span>
              <span className="text-[var(--text-primary)] font-bold">{branding.resolvedHost || window.location.hostname}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Status da resolução:</span>
              <span className="text-[var(--warning-text)] font-semibold">DOMAIN_NOT_CONFIGURED</span>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--field-border)] text-[11px] text-[var(--text-secondary)]">
            <span>Para registrar ou vincular este subdomínio, contate o suporte técnico.</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. Instance Suspended Screen
  if (isSuspended) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[var(--bg-surface)] text-[var(--text-primary)] font-sans antialiased p-6 selection:bg-[var(--action)] selection:text-[var(--text-primary)]">
        <div className="max-w-md w-full bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] rounded-2xl p-8  text-center space-y-6 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1   " />

          <div className="mx-auto h-16 w-16 rounded-2xl bg-[var(--action)] border border-[var(--field-border)] flex items-center justify-center text-[var(--action-ink)] ">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black tracking-tight text-[var(--text-primary)]">
              Acesso Temporariamente Suspenso
            </h1>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-normal">
              A organização vinculada a este endereço está temporariamente suspensa. Entre em contato com o gestor de conta ou suporte técnico.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] text-[11px] text-[var(--text-secondary)] space-y-1 text-left font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Organização:</span>
              <span className="text-[var(--text-primary)] font-bold">{branding.companyName || 'Instância Suspensa'}</span>
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

  return <AuthFrame company={branding.companyName || SYSTEM_IDENTITY.name} logo={branding.logoUrl} brandColor={branding.status==='ACTIVE'?branding.primaryColor:null}>
    {isSuspended && <p role="alert" className="sentinel-auth-error">O acesso desta empresa está suspenso. Entre em contato com o gestor.</p>}
    {errorMsg && <p role="alert" className="sentinel-auth-error">{errorMsg}</p>}
    <form onSubmit={handleSubmit}>
      <label htmlFor="login-email">E-mail corporativo<input className="ui-input" id="login-email" type="email" name="email" autoComplete="username" placeholder="seu.email@empresa.com.br" required value={email} onChange={event => setEmail(event.target.value)} disabled={isSubmitting || isSuspended} /></label>
      <div><div className="flex items-center justify-between"><label htmlFor="login-password">Senha de acesso</label><button type="button" className="text-xs text-[var(--success-text)] dark:text-[var(--success-text)]" aria-expanded={recoveryHelpVisible} onClick={() => setRecoveryHelpVisible(value => !value)}>Esqueceu a senha?</button></div><div className="relative"><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={isSubmitting || isSuspended} className="ui-input sentinel-password-input" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 bottom-3.5">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
      {recoveryHelpVisible && <p className="sentinel-auth-notice">Solicite a redefinição de senha ao gestor da sua empresa.</p>}
      <label className="sentinel-remember"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} disabled={isSubmitting} />Manter conectado neste navegador</label>
      <button type="submit" className="sentinel-primary-button disabled:cursor-not-allowed" disabled={isSubmitting || isSuspended}>{isSubmitting ? 'Entrando...' : <>Entrar no Sentinel<ArrowRight size={16} /></>}</button>
    </form>
  </AuthFrame>;
};
