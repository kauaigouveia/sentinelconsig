import React from 'react';
import {House, LayoutGrid} from 'lucide-react';
import {visibleNavigation} from '../redesign/navigation';
import {matchRoute} from '../../router/routes';
import type {Role} from '../../types';
import './nexus-page-context.css';

type Props = {
  path:string;role?:Role;permissions?:string[];
  navigate:(path:string)=>void;onApps:()=>void;
};
export function NexusPageContext({path,role,permissions=[],navigate,onApps}:Props){
  const pages=visibleNavigation(role,permissions);
  const route=matchRoute(path)?.route;
  const canonical=route?.isDynamic?route.path.split('/').filter(x=>!x.startsWith(':')).join('/'):route?.path||path;
  const current=pages.find(page=>page.path===canonical)||pages.find(page=>page.path===path);
  if(!current)return null;
  const go=(event:React.MouseEvent<HTMLAnchorElement>,url:string)=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();navigate(url);
  };
  // The operational module already renders its own PageHeader.
  // Keep navigation context compact instead of repeating a second large title.
  return <div className="nx-page-context" aria-label="Localização no sistema">
    <nav aria-label="Caminho da tela" className="nx-context-breadcrumb">
      <a href="/" onClick={event=>go(event,'/')} aria-label="Ir para visão geral"><House size={15}/></a>
      <span aria-hidden="true">/</span><span>{current.group}</span>
      <span aria-hidden="true">/</span><strong>{current.title}</strong>
    </nav>
    <button className="nx-context-apps" type="button" onClick={onApps} aria-label="Abrir todos os aplicativos">
      <LayoutGrid size={17} aria-hidden="true"/><span>Aplicativos</span>
    </button>
  </div>;
}
