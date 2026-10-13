import React, { useState } from 'react';
import { Shield, Lock, Mail, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { SYSTEM_IDENTITY } from '../../lib/branding';
import { AuthFrame } from '../auth/AuthFrame';
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
    branding?.logoUrl ||
    propLogoUrl ||
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

  return <AuthFrame company={effectiveTenantName} logo={effectiveLogoUrl} portal>
    {error && <p role="alert" className="sentinel-auth-error">{error}</p>}
    <form onSubmit={handleSubmit}>
      <label htmlFor="partner-email">E-mail cadastrado<input id="partner-email" name="email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={isLoading} placeholder="seu.email@empresa.com.br" /></label>
      <label htmlFor="partner-password">Senha de acesso<input id="partner-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={isLoading} /></label>
      <button type="submit" className="sentinel-primary-button disabled:opacity-50" disabled={isLoading}>{isLoading ? 'Entrando...' : <>Entrar no portal<ArrowRight size={16} /></>}</button>
    </form>
  </AuthFrame>;
};
