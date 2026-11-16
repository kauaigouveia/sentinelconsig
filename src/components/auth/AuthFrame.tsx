import React from 'react';
import { Moon, Sun, ShieldCheck, ArrowRight } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { useTheme } from '../../context/ThemeContext';
import { paletteStyle } from '../../lib/presentationPalette';

export function AuthFrame({ company, logo, portal = false, brandColor, children }: {company: string; logo?: string | null; portal?: boolean; brandColor?: string | null; children: React.ReactNode}) {
 const {isDark,toggleTheme}=useTheme();
 const customLogo=logo && !logo.startsWith('/branding/sentinel-') ? logo : null;
 return <div className="sentinel-auth wb-auth" style={paletteStyle(brandColor)}>
   <header className="wb-auth-header"><div>{customLogo ? <img src={customLogo} alt={company}/> : <BrandLogo width={152} height={48}/>}</div><button type="button" onClick={toggleTheme} aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}>{isDark ? <Sun size={18}/> : <Moon size={18}/>}</button></header>
   <main className="wb-auth-layout"><section className="wb-auth-introduction"><span className="wb-eyebrow">SEU PRÓXIMO DIA DE TRABALHO COMEÇA AQUI</span><h2>Mais espaço<br/>para o que importa.</h2><p>Clientes, propostas e atendimento.<br/>Tudo conectado em uma operação mais simples.</p><ol><li><span>01</span><div><strong>Encontre o que precisa</strong><small>Uma navegação clara para cada área.</small></div><ArrowRight size={17}/></li><li><span>02</span><div><strong>Continue seu trabalho</strong><small>Da simulação ao acompanhamento da proposta.</small></div><ArrowRight size={17}/></li><li><span>03</span><div><strong>Acompanhe a operação</strong><small>Registros e ferramentas no mesmo lugar.</small></div><ArrowRight size={17}/></li></ol></section>
   <section className="wb-auth-form"><div className="wb-auth-form-heading"><span className="wb-eyebrow">{portal ? 'PORTAL DO PARCEIRO' : 'ACESSO À PLATAFORMA'}</span><h1>Entre no seu espaço.</h1><p>{company}</p></div>{children}<footer><ShieldCheck size={14}/><span>Acesso protegido à sua conta</span></footer></section></main>
   <footer className="wb-auth-bottom">Sentinel Consig · Sua operação, mais próxima.</footer>
 </div>;
}
