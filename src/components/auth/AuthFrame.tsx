import {BrandLogo} from '../common/BrandLogo';
import React from 'react';
import { Moon, Sun, ShieldCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import {paletteStyle} from '../../lib/presentationPalette';
import { SYSTEM_IDENTITY } from '../../lib/branding';

function SentinelLoginBrand(){return <BrandLogo width={260} height={96}/>;}

export function AuthFrame({ company, logo, portal = false, brandColor, children }: { company: string; logo?: string | null; portal?: boolean; brandColor?:string|null; children: React.ReactNode }) {
 const {isDark,toggleTheme}=useTheme();const customLogo=logo&&!logo.startsWith('/branding/sentinel-')?logo:null;
 return <div className="sentinel-auth" style={paletteStyle(brandColor)}>
  <main className="sentinel-auth-form-side"><button type="button" onClick={toggleTheme} className="sentinel-auth-theme" aria-label={isDark?'Usar tema claro':'Usar tema escuro'}>{isDark?<Sun size={18}/>:<Moon size={18}/>}</button>
   <div className="sentinel-auth-card"><div className="sentinel-auth-tenant">{customLogo?<><img src={customLogo} alt={company} referrerPolicy="no-referrer" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src='/branding/sentinel-symbol-v5.png';}}/><span>{company}</span></>:<SentinelLoginBrand/>}</div>
    <div className="sentinel-eyebrow">{portal?'Portal do parceiro':'Área de trabalho'}</div><h1>{portal?'Bem-vindo ao seu portal':'Bom trabalho começa aqui.'}</h1><p>Entre para acompanhar sua operação.</p>{children}<div className="sentinel-auth-footer"><ShieldCheck size={14}/><span>Ambiente de {company}</span></div>
   </div>
  </main>
  <aside className="sentinel-auth-story"><span className="sentinel-eyebrow">SENTINEL / OPERAÇÕES</span><div><h2>Clareza para cada<br/>decisão.</h2><p>Seu trabalho, organizado.<br/>Do primeiro contato ao contrato concluído.</p></div><ol className="sentinel-auth-flow"><li><span>01</span>Simule condições</li><li><span>02</span>Organize propostas</li><li><span>03</span>Acompanhe resultados</li></ol></aside>
 </div>;
}
