import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Compass, X } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { AREA_SUMMARY, GROUPS, visibleNavigation } from '../redesign/navigation';
import { matchRoute } from '../../router/routes';
import type { Role } from '../../types';
import './workbench-navigation.css';

export function WorkbenchBrand({ name = 'Sentinel Consig', logo, onHome }: { name?: string; logo?: string | null; onHome: () => void }) {
  return <button type="button" className="wb-brand" onClick={onHome} aria-label={'Início — ' + name}>
    {logo && !logo.startsWith('/branding/sentinel-') ? <img src={logo} alt={name} /> : <BrandLogo width={136} height={42} />}
  </button>;
}

/**
 * Task-oriented navigation with a compact local toolbar and a complete,
 * permission-filtered map. No route, view or API is removed.
 */
export function WorkbenchNavigation({ path, role, permissions = [], navigate }: {
  path: string;
  role?: Role;
  permissions?: string[];
  navigate: (path: string) => void;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const mapTrigger = useRef<HTMLButtonElement>(null);
  const items = visibleNavigation(role, permissions);
  const matched = matchRoute(path);
  const canonical = matched?.route.isDynamic
    ? matched.route.path.replace(/\/:[^/]+/g, '')
    : matched?.route.path;
  const current = items.find(item => item.path === canonical) ||
    [...items].sort((a, b) => b.path.length - a.path.length)
      .find(item => item.path === path || (item.path !== '/' && path.startsWith(item.path + '/')));
  const activeGroup = current?.group || items[0]?.group;
  const groups = GROUPS.filter(group => items.some(item => item.group === group));
  const local = items.filter(item => item.group === activeGroup);
  const primaryLocal = local.slice(0, 6);
  if (current && local.indexOf(current) >= 6) primaryLocal.push(current);

  useEffect(() => { setMapOpen(false); }, [path, role, permissions.join('|')]);
  useEffect(() => {
    if (!mapOpen) return;
    const onOutsideClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setMapOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMapOpen(false);
        mapTrigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mapOpen]);

  const link = (event: React.MouseEvent<HTMLAnchorElement>, target: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setMapOpen(false);
    navigate(target);
  };

  return <section className="wb-navigation" ref={root} aria-label="Navegação do Sentinel">
    <div className="wb-navigation-top">
      <nav className="wb-areas" aria-label="Áreas do sistema">
        {groups.map(group => {
          const destination = items.find(item => item.group === group)!;
          return <a key={group} href={destination.path} aria-current={activeGroup === group ? 'true' : undefined}
            onClick={event => link(event, destination.path)}>{group === 'Início' ? 'Meu dia' : group}</a>;
        })}
      </nav>
      <button type="button" className="wb-map-trigger" ref={mapTrigger}
        aria-expanded={mapOpen} aria-controls="wb-system-map" onClick={() => setMapOpen(open => !open)}>
        <Compass size={16} /><span>Todas as telas</span><ChevronDown size={14} aria-hidden="true" />
      </button>
    </div>
    {local.length > 1 && <nav className="wb-local-navigation" aria-label={'Ferramentas de ' + activeGroup}>
      <span>{activeGroup}<ArrowRight size={12} /></span>
      {primaryLocal.map(item => <a key={item.path} href={item.path}
        aria-current={current?.path === item.path ? 'page' : undefined}
        onClick={event => link(event, item.path)}>{item.title}</a>)}
      {local.length > primaryLocal.length && <button type="button" className="wb-local-more"
        onClick={() => setMapOpen(true)}>Mais ferramentas ({local.length - primaryLocal.length})</button>}
    </nav>}
    {mapOpen && <section id="wb-system-map" className="wb-system-map" role="region" aria-label="Mapa de telas autorizadas">
      <header className="wb-system-map-header">
        <div><strong>Encontre sua próxima ação</strong><span>Escolha uma área ou uma ferramenta. As opções respeitam seu perfil de acesso.</span></div>
        <button type="button" aria-label="Fechar mapa de telas" onClick={() => { setMapOpen(false); mapTrigger.current?.focus(); }}><X size={17} /></button>
      </header>
      <div className="wb-system-map-grid">
        {groups.map(group => <section key={group} className="wb-system-map-group">
          <h2>{group === 'Início' ? 'Meu dia' : group}</h2>
          <p>{AREA_SUMMARY[group]}</p>
          <nav aria-label={'Telas de ' + group}>
            {items.filter(item => item.group === group).map(item =>
              <a key={item.path} href={item.path} aria-label={item.title}
                aria-current={current?.path === item.path ? 'page' : undefined}
                onClick={event => link(event, item.path)}>
                <strong>{item.title}</strong><small>{item.description}</small>
              </a>)}
          </nav>
        </section>)}
      </div>
    </section>}
  </section>;
}
