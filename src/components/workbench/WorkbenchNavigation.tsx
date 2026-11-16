import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, ChartNoAxesCombined, ChevronDown, Compass, House, Menu, Search, Settings2, Users, Workflow, X } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { AREA_SUMMARY, GROUPS, visibleNavigation } from '../redesign/navigation';
import { matchRoute } from '../../router/routes';
import type { Role } from '../../types';
import './workbench-navigation.css';
import './workspace-shell.css';

const AREA_ICONS = {
  'Início': House,
  'Operação': Workflow,
  'Relacionamento': Users,
  'Gestão': ChartNoAxesCombined,
  'Configurações': Settings2,
  'Plataforma': Building2,
} as const;

export function WorkbenchBrand({ name = 'Sentinel Consig', logo, onHome }: {
  name?: string; logo?: string | null; onHome: () => void;
}) {
  return <button type="button" className="wb-brand" onClick={onHome} aria-label={'Início — ' + name}>
    {logo && !logo.startsWith('/branding/sentinel-')
      ? <img src={logo} alt={name} />
      : <BrandLogo width={136} height={42} />}
  </button>;
}

/** Presentation-only navigation. The router and server retain authorization control. */
export function WorkbenchNavigation({ path, role, permissions = [], navigate }: {
  path: string;
  role?: Role;
  permissions?: string[];
  navigate: (path: string) => void;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const mapTrigger = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const mapPanel = useRef<HTMLElement>(null);
  const items = visibleNavigation(role, permissions);
  const matched = matchRoute(path);
  const canonical = matched?.route.isDynamic
    ? matched.route.path.split('/').filter(segment => !segment.startsWith(':')).join('/')
    : matched?.route.path;
  const current = items.find(item => item.path === canonical)
    || [...items].sort((a, b) => b.path.length - a.path.length)
      .find(item => item.path === path || (item.path !== '/' && path.startsWith(item.path + '/')));
  const activeGroup = current?.group || items[0]?.group;
  const groups = GROUPS.filter(group => items.some(item => item.group === group));
  const local = items.filter(item => item.group === activeGroup);
  const primaryLocal = local.slice(0, 7);
  if (current && !primaryLocal.includes(current)) primaryLocal.push(current);
  const remaining = local.length - primaryLocal.length;

  useEffect(() => { setMapOpen(false); setMobileOpen(false); }, [path, role, permissions.join('|')]);
  const closeMap = () => {
    setMapOpen(false);
    const compact = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1030px)').matches;
    (compact ? mobileTrigger : mapTrigger).current?.focus();
  };
  useEffect(() => {
    if (mapOpen) mapPanel.current?.querySelector<HTMLButtonElement>('button[aria-label="Fechar mapa de telas"]')?.focus();
  }, [mapOpen]);
  useEffect(() => {
    if (!mapOpen && !mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && mapOpen && mapPanel.current) {
        const controls = [...mapPanel.current.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !mapPanel.current.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
      if (event.key !== 'Escape') return;
      if (mapOpen) { closeMap(); }
      else { setMobileOpen(false); mobileTrigger.current?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mapOpen, mobileOpen]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setMobileOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [mobileOpen]);

  const link = (event: React.MouseEvent<HTMLAnchorElement>, destination: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setMapOpen(false);
    setMobileOpen(false);
    navigate(destination);
  };

  return <>
    <div className="wb-mobile-toolbar">
      <button ref={mobileTrigger} type="button" aria-expanded={mobileOpen} aria-controls="wb-sidebar" onClick={() => setMobileOpen(true)}>
        <Menu size={19} aria-hidden="true" /> Menu
      </button>
      <span aria-label="Tela atual">{current?.title || 'Sentinel Consig'}</span>
      <button type="button" aria-label="Ver todas as telas" onClick={() => { setMobileOpen(false); setMapOpen(true); }}>
        <Compass size={18} aria-hidden="true" />
      </button>
    </div>
    {mobileOpen && <button type="button" className="wb-mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
    <section id="wb-sidebar" className={'wb-navigation' + (mobileOpen ? ' wb-mobile-open' : '')} ref={root} aria-label="Navegação do Sentinel">
      <div className="wb-sidebar-heading">
        <div><span className="wb-side-eyebrow">WORKSPACE</span><strong>Seu espaço de trabalho</strong></div>
        <button type="button" className="wb-mobile-close" aria-label="Fechar menu lateral" onClick={() => setMobileOpen(false)}><X size={20} /></button>
      </div>
      <nav className="wb-areas" aria-label="Áreas do sistema">
        {groups.map(group => {
          const destination = items.find(item => item.group === group)!;
          const Icon = AREA_ICONS[group];
          return <a key={group} href={destination.path} aria-current={activeGroup === group ? 'true' : undefined}
            onClick={event => link(event, destination.path)}>
            <Icon size={17} aria-hidden="true" /><span>{group === 'Início' ? 'Meu dia' : group}</span>
            {activeGroup === group && <ChevronDown size={14} aria-hidden="true" />}
          </a>;
        })}
      </nav>
      <div className="wb-sidebar-divider" aria-hidden="true" />
      <nav className="wb-local-navigation" aria-label={'Ferramentas de ' + activeGroup}>
        <span className="wb-local-title">{activeGroup}</span>
        {primaryLocal.map(item => <a key={item.path} href={item.path}
          aria-current={current?.path === item.path ? 'page' : undefined}
          onClick={event => link(event, item.path)}>{item.title}</a>)}
        {remaining > 0 && <button type="button" className="wb-local-more" onClick={() => { setMobileOpen(false); setMapOpen(true); }}>
          Mais ferramentas ({remaining})
        </button>}
        {local.length === 1 && <p className="wb-local-description">{AREA_SUMMARY[activeGroup]}</p>}
      </nav>
      <div className="wb-sidebar-bottom">
        <button type="button" className="wb-map-trigger" ref={mapTrigger}
          aria-expanded={mapOpen} aria-controls="wb-system-map" onClick={() => setMapOpen(open => !open)}>
          <Compass size={16} aria-hidden="true" /><span>Todas as telas</span><ArrowRight size={14} aria-hidden="true" />
        </button>
        <p><Search size={13} aria-hidden="true" /> Use Ctrl+K para buscar clientes, ADEs e páginas.</p>
      </div>
    </section>
    {mapOpen && <button type="button" className="wb-map-scrim" aria-label="Fechar mapa pelo fundo" onClick={closeMap}/>}
      {mapOpen && <section id="wb-system-map" className="wb-system-map" role="dialog" aria-modal="true" ref={mapPanel} tabIndex={-1} aria-label="Mapa de telas autorizadas">
        <header className="wb-system-map-header">
          <div><strong>Encontre sua próxima ação</strong><span>Ferramentas disponíveis para o seu perfil.</span></div>
          <button type="button" aria-label="Fechar mapa de telas" onClick={closeMap}><X size={17} /></button>
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
  </>;
}
