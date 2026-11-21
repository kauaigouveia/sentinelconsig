import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, BriefcaseBusiness, ChartNoAxesCombined, ChevronRight,
  ClipboardList, Compass, House, LayoutGrid,
  LockKeyhole, Settings2, Users, Workflow, X,
  type LucideIcon,
} from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { AREA_SUMMARY, GROUPS, visibleNavigation, type NavigationGroup } from '../redesign/navigation';
import { matchRoute } from '../../router/routes';
import type { Role } from '../../types';
import './nexus-navigation.css';

type Props = {
  path: string;
  role?: Role;
  permissions?: string[];
  navigate: (path: string) => void;
  onSearch: () => void;
};
const ICONS: Record<NavigationGroup, LucideIcon> = {
  'Início': House,
  'Operação': Workflow,
  'Relacionamento': Users,
  'Gestão': ChartNoAxesCombined,
  'Configurações': Settings2,
  'Plataforma': LockKeyhole,
};
const QUICK: { path:string; title:string; icon:LucideIcon }[] = [
  {path:'/',title:'Visão geral',icon:House},
  {path:'/propostas',title:'Propostas',icon:BriefcaseBusiness},
  {path:'/simulacoes',title:'Simular crédito',icon:Compass},
  {path:'/central-pendencias',title:'Pendências',icon:ClipboardList},
  {path:'/clientes',title:'Clientes',icon:Users},
  {path:'/bi',title:'Indicadores',icon:ChartNoAxesCombined},
];
const BOTTOM: {path:string; title:string; icon:LucideIcon}[] = QUICK.slice(0,4);

export function NexusNavigation({path,role,permissions = [],navigate}:Props) {
  const permissionSignature = permissions.join('|');
  const items = useMemo(() => visibleNavigation(role,permissions), [role,permissionSignature]);
  const [launcherOpen,setLauncherOpen] = useState(false);
  const launcher = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const active = matchRoute(path)?.route;
  const canonical = active?.isDynamic ? active.path.split('/').filter(segment=>!segment.startsWith(':')).join('/') : active?.path || path;
  const current = items.find(item => item.path === canonical) || items.find(item => item.path === path);
  const currentGroup = current?.group ?? 'Início';
  // Expand secondary modules only when visiting one of their destinations.
  // The main dashboard no longer opens a redundant “Início” group.
  const activeIsShortcut = QUICK.some(item=>item.path===canonical);
  const [expandedGroup,setExpandedGroup] = useState<NavigationGroup|null>(activeIsShortcut?null:currentGroup);
  const quick = QUICK.map(item=>({...item,route:items.find(route=>route.path===item.path)}))
    .filter(item=>item.route);
  // An operational destination appears only once in the desktop sidebar.
  // The full launcher remains the canonical list of all authorized routes.
  const shortcuts = new Set(quick.map(item=>item.path));
  const additionalGroups = GROUPS.map(group=>({
    group, pages:items.filter(item=>item.group===group&&!shortcuts.has(item.path)),
  })).filter(({pages})=>pages.length>0);
  const bottom = BOTTOM.map(item=>({...item,route:items.find(route=>route.path===item.path)}))
    .filter(item=>item.route).slice(0,4);
  const isCurrent = (url:string) => url === canonical || url === path;
  const go = (url:string) => {setLauncherOpen(false);navigate(url);};
  const link = (event:React.MouseEvent<HTMLAnchorElement>,url:string) => {
    if(event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    event.preventDefault();go(url);
  };
  useEffect(()=>setLauncherOpen(false),[path,role,permissionSignature]);
  useEffect(()=>setExpandedGroup(activeIsShortcut?null:currentGroup),[currentGroup,activeIsShortcut]);
  useEffect(()=>{
    const open=()=>setLauncherOpen(true);
    window.addEventListener('sentinel:nexus-apps',open);
    return ()=>window.removeEventListener('sentinel:nexus-apps',open);
  },[]);
  useEffect(()=>{
    if(!launcherOpen)return;
    const old = document.body.style.overflow;
    const dialog = launcher.current;
    dialog?.querySelector<HTMLButtonElement>('button[aria-label="Fechar aplicativos"]')?.focus();
    const key = (event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setLauncherOpen(false);moreButton.current?.focus();return;}
      if(event.key!=='Tab'||!dialog)return;
      const controls=[...dialog.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')];
      if(!controls.length)return;
      if(event.shiftKey && document.activeElement===controls[0]) {event.preventDefault();controls.at(-1)?.focus();}
      else if(!event.shiftKey && document.activeElement===controls.at(-1)) {event.preventDefault();controls[0].focus();}
    };
    document.body.style.overflow='hidden';
    document.addEventListener('keydown',key);
    return ()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);};
  },[launcherOpen]);

  return <>
    <aside className="nx-sidebar" aria-label="Navegação principal">
      <button className="nx-sidebar-brand" type="button" aria-label="Sentinel Consig — página inicial"
        onClick={()=>go(items.find(i=>i.path==='/')?.path || items[0]?.path || '/')}>
        <BrandLogo width={151} height={43}/>
        <span className="nx-sidebar-tagline">Inteligência em cada operação.</span>
      </button>
      <span className="nx-section-caption">PRINCIPAIS</span>
      <nav className="nx-quick-nav" aria-label="Acesso rápido">
        {quick.map(({path:url,title,icon:Icon})=><a key={url} href={url}
          aria-current={isCurrent(url)?'page':undefined} onClick={event=>link(event,url)}>
          <Icon size={19} aria-hidden="true"/><span>{title}</span><ChevronRight size={15} className="nx-chevron" aria-hidden="true"/>
        </a>)}
      </nav>
      <div className="nx-sidebar-rule"/>
      <span className="nx-section-caption">OUTRAS FERRAMENTAS</span>
      <nav className="nx-group-nav" aria-label="Módulos do sistema">
        {additionalGroups.map(({group,pages:groupItems})=>{
          const Icon=ICONS[group];
          return <section key={group} className={'nx-group'+(expandedGroup===group?' nx-group-open':'')}>
            <button type="button" aria-expanded={expandedGroup===group} onClick={()=>setExpandedGroup(old=>old===group?null:group)}>
              <Icon size={17} aria-hidden="true"/><span>{group}</span><ChevronRight size={16} className="nx-group-arrow" aria-hidden="true"/>
            </button>
            {expandedGroup===group&&<div className="nx-group-links">{groupItems.map(item=><a key={item.path} href={item.path}
              aria-current={isCurrent(item.path)?'page':undefined}
              onClick={event=>link(event,item.path)} title={item.description}>{item.title}</a>)}</div>}
          </section>;
        })}
      </nav>
      <button className="nx-sidebar-all-apps" type="button"
        onClick={()=>setLauncherOpen(true)} aria-label="Ver todos os aplicativos">
        <LayoutGrid size={18} aria-hidden="true"/><span>Todos os módulos</span><ArrowRight size={17} aria-hidden="true"/>
      </button>
    </aside>

    <nav className="nx-mobile-bottom" aria-label="Navegação inferior">
      {bottom.map(({path:url,title,icon:Icon})=><a key={url} href={url} onClick={event=>link(event,url)}
        aria-current={isCurrent(url)?'page':undefined}>
        <Icon size={21} aria-hidden="true"/><span>{title}</span></a>)}
      <button type="button" ref={moreButton} aria-haspopup="dialog" aria-expanded={launcherOpen}
        aria-label="Todos os aplicativos" onClick={()=>setLauncherOpen(true)}>
        <LayoutGrid size={21} aria-hidden="true"/><span>Mais</span>
      </button>
    </nav>
    {launcherOpen && <div className="nx-launcher-backdrop" role="presentation"
      onMouseDown={event=>{if(event.target===event.currentTarget)setLauncherOpen(false);}}>
      <div className="nx-launcher" ref={launcher} role="dialog" aria-modal="true" aria-labelledby="nx-launcher-title">
        <header className="nx-launcher-header">
          <div><span className="nx-overline">SENTINEL CONSIG</span><h2 id="nx-launcher-title">Todos os aplicativos</h2>
            <p>Escolha uma área. Você vê apenas os recursos liberados para seu acesso.</p></div>
          <button type="button" aria-label="Fechar aplicativos" onClick={()=>{setLauncherOpen(false);moreButton.current?.focus();}}><X size={21}/></button>
        </header>
        <div className="nx-launcher-groups">
          {GROUPS.filter(group=>items.some(item=>item.group===group)).map(group=>{
            const Icon=ICONS[group];
            return <section key={group}>
              <h3><Icon size={18} aria-hidden="true"/>{group}</h3><p>{AREA_SUMMARY[group]}</p>
              <div className="nx-launcher-links">
                {items.filter(item=>item.group===group).map(item=><a key={item.path} href={item.path}
                  aria-current={isCurrent(item.path)?'page':undefined}
                  onClick={event=>link(event,item.path)}>
                  <span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRight size={15} aria-hidden="true"/>
                </a>)}
              </div>
            </section>;
          })}
        </div>
      </div>
    </div>}
  </>;
}
