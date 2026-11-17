import React, { useState } from 'react';
import { ArrowUpRight, CircleHelp, ChevronDown } from 'lucide-react';
import { APP_ROUTES, canAccessRoute, matchRoute } from '../../router/routes';
import type { Role } from '../../types';

type Guide = { purpose: string; next: {path: string; label: string}[] };
const GUIDES: Record<string, Guide> = {
  '/propostas': { purpose:'Centralize o registro, a situação e o histórico de cada operação. Use os filtros para localizar uma proposta existente antes de criar outra.', next:[
    { path:'/simulacoes',label:'Simular crédito' },{path:'/esteira',label:'Visualizar etapas'},{path:'/central-pendencias',label:'Resolver pendências'}]},
  '/simulacoes': { purpose:'Comece pelo tipo de crédito e os dados do cliente. Compare apenas as instituições habilitadas para sua empresa e encaminhe a proposta elegível.', next:[
    {path:'/roteiros',label:'Consultar roteiros'},{path:'/propostas',label:'Ver propostas'}]},
  '/esteira': { purpose:'Cada coluna representa uma etapa operacional. Abra um cartão para consultar ou atualizar a proposta conforme seu nível de acesso.',next:[
    {path:'/propostas',label:'Abrir carteira'},{path:'/central-pendencias',label:'Tratar impedimentos'}]},
  '/portabilidade': { purpose:'Acompanhe intenções, retornos de saldo e prazos da CIP. A classificação financeira considera os registros operacionais disponíveis.',next:[
    {path:'/propostas',label:'Consultar propostas'},{path:'/esteira',label:'Ver etapas'}]},
  '/central-pendencias': { purpose:'Identifique responsáveis, prioridades e prazos. Atualize uma pendência no registro correspondente, preservando seu histórico.',next:[
    {path:'/propostas',label:'Abrir propostas'},{path:'/central-atendimento',label:'Ir ao atendimento'}]},
  '/clientes': { purpose:'Pesquise pelo nome ou CPF e consulte o histórico do cliente antes de abrir uma nova operação.',next:[
    {path:'/simulacoes',label:'Simular'},{path:'/propostas',label:'Propostas'}]},
  '/crm-parceiros': { purpose:'Organize dados, acompanhamento e relacionamento com os parceiros, sem perder o histórico operacional.',next:[
    {path:'/central-atendimento',label:'Atender parceiro'},{path:'/propostas',label:'Produção'}]},
  '/central-atendimento': { purpose:'Responda às solicitações, consulte o contexto da conversa e acompanhe a resolução de cada caso.',next:[
    {path:'/crm-parceiros',label:'Ver parceiros'},{path:'/central-pendencias',label:'Ver pendências'}]},
  '/bi': { purpose:'Avalie produção, conversão e tendências. Confira o período e os filtros antes de interpretar ou exportar indicadores.',next:[
    {path:'/financeiro-geral',label:'Financeiro'},{path:'/radar-comercial',label:'Radar comercial'}]},
  '/financeiro-geral': { purpose:'Consolide indicadores e movimentações disponíveis. Confirme período e origem dos dados antes de utilizar os totais.',next:[
    {path:'/bi',label:'Indicadores'},{path:'/propostas',label:'Produção'}]},
  '/integracoes': { purpose:'Gerencie as conexões bancárias e consulte sua situação. Alterações de credenciais exigem permissões administrativas específicas.',next:[
    {path:'/saude-apis',label:'Monitorar APIs'},{path:'/bancos-promotoras',label:'Bancos e promotoras'}]},
  '/central-administracao': { purpose:'Gerencie as configurações da sua empresa, incluindo usuários, produtos, convênios, status e regras operacionais.',next:[
    {path:'/admin-usuarios',label:'Usuários e acessos'},{path:'/admin-produtos',label:'Produtos'}]},
};
/** Optional, route-driven help. It does not fetch data or change business rules. */
export function WorkspaceGuide({ pathname, role, permissions = [], navigate }: {
  pathname:string; role?:Role; permissions?:string[]; navigate:(path:string)=>void;
}) {
  const [open,setOpen]=useState(false);
  const match=matchRoute(pathname);
  const canonical=match?.route.path.startsWith('/propostas/:') ? '/propostas' : match?.route.path;
  const guide=canonical ? GUIDES[canonical] : undefined;
  // Simulações já tem título, descrição e navegação operacional próprias.
  // O aviso global duplicava esse conteúdo e ocupava toda a largura da página.
  if (canonical === '/simulacoes') return null;
  if (!guide || !match || !canAccessRoute(match.route,role,permissions)) return null;
  const links=guide.next.filter(link=>{
    const route=APP_ROUTES.find(item=>item.path===link.path);
    return route && canAccessRoute(route,role,permissions);
  });
  const follow=(event:React.MouseEvent<HTMLAnchorElement>,destination:string)=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();navigate(destination);
  };
  return <aside className="wb-guide" aria-label="Orientação da tela">
    <div><CircleHelp size={16} aria-hidden="true" /><span>Você está em {match.route.title}.</span><span>{open?'Consulte o fluxo abaixo.':'Veja como esta área funciona.'}</span></div>
    <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Como funciona <ChevronDown size={13} aria-hidden="true" /></button>
    {open && <div className="wb-guide-expanded"><p>{guide.purpose}</p>{links.length>0&&<nav className="wb-guide-actions" aria-label="Próximos passos">{links.map(link=><a href={link.path} onClick={event=>follow(event,link.path)} key={link.path}>{link.label}<ArrowUpRight size={13} aria-hidden="true" /></a>)}</nav>}</div>}
  </aside>;
}
