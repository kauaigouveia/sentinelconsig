import React from 'react';
import {ArrowRight, ArrowUpRight, Compass, House, LayoutGrid} from 'lucide-react';
import {visibleNavigation} from '../redesign/navigation';
import {matchRoute} from '../../router/routes';
import type {Role} from '../../types';
import './nexus-page-context.css';

type Props = {
  path:string;role?:Role;permissions?:string[];
  navigate:(path:string)=>void;onApps:()=>void;
};
const shortDescription:Record<string,string>={
  '/propostas':'Produção, registros e acompanhamento da sua operação.',
  '/simulacoes':'Comparação de ofertas, margem e portabilidade por instituição.',
  '/esteira':'Visualização da operação por etapa, sem perder contexto.',
  '/central-pendencias':'Organize as prioridades que exigem atenção.',
  '/portabilidade':'Acompanhe retornos, contratos e prazos.',
  '/clientes':'Relacionamentos, consultas e histórico completo.',
  '/bi':'Indicadores e decisões com dados da sua empresa.',
  '/financeiro-geral':'Gestão de resultados e movimentações.',
  '/integracoes':'Monitoramento e configuração de integrações bancárias.',
};
export function NexusPageContext({path,role,permissions=[],navigate,onApps}:Props){
  const pages=visibleNavigation(role,permissions);
  const route=matchRoute(path)?.route;
  const canonical=route?.isDynamic?route.path.split('/').filter(x=>!x.startsWith(':')).join('/'):route?.path||path;
  const current=pages.find(page=>page.path===canonical)||pages.find(page=>page.path===path);
  if(!current)return null;
  const suggestions=pages.filter(item=>item.group===current.group&&item.path!==current.path).slice(0,3);
  const go=(event:React.MouseEvent<HTMLAnchorElement>,url:string)=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();navigate(url);
  };
  return <header className="nx-page-context">
    <div className="nx-context-content">
      <nav aria-label="Caminho da tela" className="nx-context-breadcrumb">
        <a href="/" onClick={event=>go(event,'/')} aria-label="Ir para visão geral"><House size={15}/></a>
        <span>/</span><span>{current.group}</span><span>/</span><strong>{current.title}</strong>
      </nav>
      <div className="nx-context-title-row">
        <div><span className="nx-overline">SENTINEL · {current.group.toLocaleUpperCase('pt-BR')}</span>
          <h1>{current.title}</h1>
          <p>{shortDescription[current.path]||current.description}</p>
        </div>
        <div className="nx-context-actions">
          {suggestions.slice(0,2).map(item=><a key={item.path} href={item.path}
            onClick={event=>go(event,item.path)}>{item.title}<ArrowUpRight size={14}/></a>)}
          <button type="button" onClick={onApps} aria-label="Abrir todos os aplicativos">
            <LayoutGrid size={17}/><span>Aplicativos</span>
          </button>
        </div>
      </div>
    </div>
  </header>;
}
