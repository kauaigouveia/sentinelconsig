import React from 'react';
import { Moon, Sun, ShieldCheck, ArrowRight } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { useTheme } from '../../context/ThemeContext';
import { paletteStyle } from '../../lib/presentationPalette';

interface AuthFrameProps {
  company: string;
  logo?: string | null;
  portal?: boolean;
  brandColor?: string | null;
  children: React.ReactNode;
}

/**
 * Layouts de autenticação independentes em apresentação, com identidade
 * institucional compartilhada. Formulários, sessões, permissões e Turnstile
 * permanecem nos componentes específicos de cada experiência.
 */
export function AuthFrame({ company, logo, portal = false, brandColor, children }: AuthFrameProps) {
  const { isDark, toggleTheme } = useTheme();
  const customLogo = logo && !logo.startsWith('/branding/sentinel-') ? logo : null;

  return (
    <div className={`sentinel-auth wb-auth ${portal ? 'wb-auth--partner' : 'wb-auth--operations'}`} style={paletteStyle(brandColor)}>
      <header className="wb-auth-header">
        <div>{customLogo ? <img src={customLogo} alt={company}/> : <BrandLogo width={152} height={48}/>}</div>
        <button type="button" onClick={toggleTheme} aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}>
          {isDark ? <Sun size={18}/> : <Moon size={18}/>}
        </button>
      </header>
      <main className="wb-auth-layout">
        {portal ? (
          <section className="wb-auth-introduction" aria-label="Sobre o Portal do Parceiro">
            <span className="wb-eyebrow">PORTAL DO PARCEIRO</span>
            <h2>Seu negócio.<br/>Em movimento.</h2>
            <p>Inteligência em cada operação.<br/>Mais agilidade para transformar oportunidades em resultados.</p>
            <ol>
              <li><span>01</span><div><strong>Simule com confiança</strong><small>Encontre possibilidades para seus clientes.</small></div><ArrowRight size={17}/></li>
              <li><span>02</span><div><strong>Acompanhe suas propostas</strong><small>Consulte cada etapa em um só lugar.</small></div><ArrowRight size={17}/></li>
              <li><span>03</span><div><strong>Conecte-se à sua operação</strong><small>Atendimento e informações na sua rotina.</small></div><ArrowRight size={17}/></li>
            </ol>
          </section>
        ) : (
          <section className="wb-auth-introduction" aria-label="Sobre o acesso operacional">
            <span className="wb-eyebrow">CENTRAL DE OPERAÇÕES</span>
            <h2>Inteligência em<br/>cada operação.</h2>
            <p>Clientes, propostas e atendimento.<br/>Tudo conectado em uma operação mais simples.</p>
            <ol>
              <li><span>01</span><div><strong>Encontre o que precisa</strong><small>Uma navegação clara para cada área.</small></div><ArrowRight size={17}/></li>
              <li><span>02</span><div><strong>Continue seu trabalho</strong><small>Da simulação ao acompanhamento da proposta.</small></div><ArrowRight size={17}/></li>
              <li><span>03</span><div><strong>Acompanhe a operação</strong><small>Registros e ferramentas no mesmo lugar.</small></div><ArrowRight size={17}/></li>
            </ol>
          </section>
        )}
        <section className="wb-auth-form">
          <div className="wb-auth-form-heading">
            <span className="wb-eyebrow">{portal ? 'ACESSO DO PARCEIRO' : 'ACESSO À PLATAFORMA'}</span>
            <h1>{portal ? 'Acesse seu portal.' : 'Entre no seu espaço.'}</h1>
            <p>{company}</p>
          </div>
          {children}
          <footer><ShieldCheck size={14}/><span>Acesso protegido à sua conta</span></footer>
        </section>
      </main>
      <footer className="wb-auth-bottom">Sentinel Consig · Inteligência em cada operação.</footer>
    </div>
  );
}
