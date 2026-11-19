import React, { useEffect, useState } from 'react';
import { Building2, Clock3, Moon, Sun, UserRound } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { publicBuildMetadata, PublicBuildMetadata } from '../../lib/buildMetadata';
import { version as appVersion } from '../../../package.json';
import './institutional-footer.css';

interface InstitutionalFooterProps {
  userName: string;
  companyName: string;
  build?: PublicBuildMetadata;
}

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const calendarFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

function sessionDateTime(now: Date) {
  const weekday = weekdayFormatter.format(now).replace(/\./g, '');
  const month = monthFormatter.format(now).replace(/\./g, '');
  return `${weekday}, ${now.getDate()} ${month} de ${now.getFullYear()} ${timeFormatter.format(now)}`;
}

export function InstitutionalFooter({ userName, companyName, build = publicBuildMetadata }: InstitutionalFooterProps) {
  const { isDark, toggleTheme } = useTheme();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Relógio local da sessão; sem requisições ou atualização da aplicação inteira.
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const revision = build.revision?.match(/^([a-f0-9]{40})(-dirty)?$/i);
  const technicalRevision = revision ? revision[1].slice(0, 8) : null;
  const validBuildDate = build.builtAt ? new Date(build.builtAt) : null;
  const buildDate = validBuildDate && Number.isFinite(validBuildDate.getTime())
    ? `${calendarFormatter.format(validBuildDate)} ${timeFormatter.format(validBuildDate)}`
    : null;
  const themeLabel = isDark ? 'Ativar tema claro' : 'Ativar tema escuro';

  return <footer className="sentinel-institutional-footer" aria-label="Informações institucionais">
    <div className="institutional-footer-identity">
      <span className="institutional-footer-copyright">© {now.getFullYear()} </span>
      <span className="institutional-footer-brand">Sentinel Consig.</span>
      <span className="institutional-footer-version" title={technicalRevision ? `Versão ${appVersion} · Revisão ${technicalRevision}` : `Versão ${appVersion}`}>
        versão: {appVersion}
      </span>
      {buildDate && <span className="institutional-footer-build-date">de {buildDate}</span>}
    </div>

    <div className="institutional-footer-context">
      <span className="institutional-footer-user" title={userName}>
        <UserRound size={12} aria-hidden="true" /><span>{userName}</span>
      </span>
      <span className="institutional-footer-company" title={companyName}>
        <Building2 size={12} aria-hidden="true" /><span>{companyName}</span>
      </span>
      <time className="institutional-footer-clock" dateTime={now.toISOString()} title={now.toLocaleString('pt-BR')}>
        <Clock3 size={12} aria-hidden="true" />
        <span className="institutional-footer-date">{sessionDateTime(now)}</span>
        <span className="institutional-footer-short-time">{timeFormatter.format(now)}</span>
      </time>
      <button type="button" className="institutional-footer-theme" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
        {isDark ? <Sun size={24} aria-hidden="true" /> : <Moon size={24} aria-hidden="true" />}
      </button>
    </div>
  </footer>;
}
