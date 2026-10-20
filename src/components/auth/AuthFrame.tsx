import React from 'react';
import { ArrowRight, Moon, Sun, ShieldCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { SYSTEM_IDENTITY } from '../../lib/branding';

function SentinelLoginBrand() {
  return <div className="sentinel-login-brand" aria-label={SYSTEM_IDENTITY.name}>
    <img src="/branding/sentinel-icon-transparent-v3.png" alt="" aria-hidden="true" />
    <div className="sentinel-login-brand-name"><strong>SENTINEL</strong><span>CONSIG</span></div>
  </div>;
}

export function AuthFrame({ company, logo, portal = false, children }: { company: string; logo?: string | null; portal?: boolean; children: React.ReactNode }) {
  const { isDark, toggleTheme } = useTheme();
  const customLogo = logo && !logo.startsWith('/branding/sentinel-') ? logo : null;
  return <div className="sentinel-auth">
    <aside className="sentinel-auth-story">
      <SentinelLoginBrand />
      <div>
        <div className="sentinel-eyebrow !text-[#64d3b9]">{portal ? 'Portal do parceiro' : 'Gestão de crédito'}</div>
        <h2>{portal ? <>Suas propostas.<br /><em>Tudo em um só lugar.</em></> : <>Sua operação.<br /><em>Mais simples.</em></>}</h2>
        <p>{portal ? 'Simule, envie propostas e acompanhe o andamento de cada contrato.' : 'Da simulação ao pagamento, acompanhe suas propostas e organize o trabalho da equipe.'}</p>
      </div>
      <div className="sentinel-auth-flow"><span>Simular</span><ArrowRight size={14} /><span>Enviar proposta</span><ArrowRight size={14} /><span>Acompanhar</span></div>
    </aside>
    <main className="sentinel-auth-form-side">
      <button type="button" onClick={toggleTheme} className="sentinel-auth-theme" aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>
      <div className="sentinel-auth-card">
        <div className="sentinel-auth-tenant">
          {customLogo ? <><img src={customLogo} alt={company} referrerPolicy="no-referrer" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/branding/sentinel-icon-transparent-v3.png'; }} /><span>{company}</span></> : <SentinelLoginBrand />}
        </div>
        <div className="sentinel-eyebrow">{portal ? 'Portal do parceiro' : 'Acesso da equipe'}</div>
        <h1>{portal ? 'Entre no seu portal' : 'Acesse sua conta'}</h1>
        <p>Informe seu e-mail e senha para continuar.</p>
        {children}
        <div className="sentinel-auth-footer"><ShieldCheck size={14} /><span>Ambiente de {company}</span></div>
      </div>
    </main>
  </div>;
}
