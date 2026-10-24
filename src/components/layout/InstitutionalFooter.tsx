import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { publicBuildMetadata, PublicBuildMetadata } from '../../lib/buildMetadata';
import './institutional-footer.css';

interface InstitutionalFooterProps {
  userName: string;
  companyName: string;
  build?: PublicBuildMetadata;
}

const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const calendar = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function InstitutionalFooter({ userName, companyName, build = publicBuildMetadata }: InstitutionalFooterProps) {
  const { isDark, toggleTheme } = useTheme();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Local clock only. Its updates never rerender the application or fetch data.
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const revision = build.revision?.match(/^([a-f0-9]{40})(-dirty)?$/i);
  const builtAt = build.builtAt ? new Date(build.builtAt) : null;
  const validBuildDate = builtAt && Number.isFinite(builtAt.getTime());
  const themeLabel = isDark ? 'Ativar tema claro' : 'Ativar tema escuro';

  return <footer className="sentinel-institutional-footer" aria-label="Informações institucionais">
    <div className="institutional-footer-identity">
      <span className="institutional-footer-brand">© 2026 Sentinel Consig.</span>
      {revision && <span className="institutional-footer-build" title={`Revisão ${build.revision}`}>
        Build {revision[1].slice(0, 8)}{revision[2] ? ' · local' : ''}
      </span>}
      {validBuildDate && <time className="institutional-footer-build-date" dateTime={builtAt.toISOString()} title={`Build: ${builtAt.toLocaleString('pt-BR')}`}>
        {calendar.format(builtAt)}
      </time>}
    </div>
    <div className="institutional-footer-context">
      <span className="institutional-footer-user" title={userName}>{userName}</span>
      <span className="institutional-footer-company" title={companyName}>{companyName}</span>
      <time className="institutional-footer-clock" dateTime={now.toISOString()} title={now.toLocaleString('pt-BR')}>
        <span className="institutional-footer-date">{calendar.format(now)} · </span>{clock.format(now)}
      </time>
      <button type="button" className="institutional-footer-theme" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
        {isDark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
      </button>
    </div>
  </footer>;
}
