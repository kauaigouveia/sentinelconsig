import React, {useMemo,useState} from 'react';
import {
  ArrowRight, ArrowUpRight, BriefcaseBusiness, Calculator, CheckCircle2,
  ChevronRight, CircleAlert, ClipboardList, Clock3, FilePlus2, LayoutDashboard,
  RefreshCw, Search, TrendingUp, Users, Wallet, Workflow,
} from 'lucide-react';
import {hasPermission} from '../../lib/permissions';
import {formatCurrency} from '../../lib/utils';
import type {PreviewRow} from '../redesign/PreviewData';
import type {Role} from '../../types';
import type {BottlenecksResponse} from '../../types/analytics';
import './nexus-home.css';

type Props = {
  rows:PreviewRow[];
  role?:Role;permissions?:string[];name:string;
  navigate:(url:string)=>void;openProposal:(id:string)=>void;newProposal?:()=>void;
  error?:string;onRefresh?:()=>void;loading?:boolean;
  bottlenecks?:BottlenecksResponse|null;
  openStatus?:(id:string)=>void;openBank?:(id:string)=>void;demo?:boolean;
};
type Filter = 'all'|'active'|'pending'|'paid';
const dateText=()=>new Intl.DateTimeFormat('pt-BR',{
  weekday:'long',day:'numeric',month:'long',timeZone:'America/Maceio',
}).format(new Date());
const money=(value:number|null)=>value==null?'—':formatCurrency(value);
const initials=(value:string)=>value.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]?.toUpperCase()).join('');
export function NexusHome({rows,role,permissions=[],name,navigate,openProposal,newProposal,error,onRefresh,loading}:Props) {
  const can=(permission:string)=>hasPermission(role,permissions,permission);
  const canSeeProposals=can('proposals.view');
  const portfolio=canSeeProposals?rows:[];
  const active=portfolio.filter(row=>row.active);
  const pending=portfolio.filter(row=>row.active&&row.pending);
  const paid=portfolio.filter(row=>row.paid);
  const [filter,setFilter]=useState<Filter>('all');
  const [query,setQuery]=useState('');
  const filtered=useMemo(()=>portfolio.filter(row=>{
    const matchesFilter=filter==='all'||(filter==='active'&&row.active)||(filter==='pending'&&row.pending&&row.active)||(filter==='paid'&&row.paid);
    const term=`${row.client} ${row.ade} ${row.bank} ${row.status}`.toLocaleLowerCase('pt-BR');
    return matchesFilter&&term.includes(query.toLocaleLowerCase('pt-BR').trim());
  }).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,6),[portfolio,filter,query]);
  const grouped=useMemo(()=>{
    const counts=new Map<string,{name:string,count:number}>();
    for(const row of portfolio){
      const key=row.bank?.trim()||'Não informado';
      const item=counts.get(key)||{name:key,count:0};item.count++;counts.set(key,item);
    }
    return [...counts.values()].sort((a,b)=>b.count-a.count).slice(0,5);
  },[portfolio]);
  const shortcuts=[
    {title:'Simular crédito',description:'NOVO, portabilidade e margem',icon:Calculator,to:'/simulacoes',can:can('simulations.view')},
    {title:'Propostas',description:'Acompanhe operações em andamento',icon:BriefcaseBusiness,to:'/propostas',can:canSeeProposals},
    {title:'Esteira Kanban',description:'Fluxo por etapa operacional',icon:Workflow,to:'/esteira',can:canSeeProposals},
    {title:'Clientes',description:'Histórico e documentos',icon:Users,to:'/clientes',can:can('clients.view')},
    {title:'Pendências',description:'Pontos de atenção',icon:ClipboardList,to:'/central-pendencias',can:can('support.view')},
  ].filter(item=>item.can);
  const totals=[
    {label:'Na carteira',value:portfolio.length,icon:LayoutDashboard,description:'registros carregados',tone:'blue'},
    {label:'Em andamento',value:active.length,icon:Clock3,description:'operações ativas',tone:'violet'},
    {label:'Com pendência',value:pending.length,icon:CircleAlert,description:'exigem atenção',tone:'amber'},
    {label:'Pagas',value:paid.length,icon:CheckCircle2,description:'identificadas na carteira',tone:'green'},
  ];
  const customerFirstName=name.split(/\s+/)[0]||'equipe';
  return <div className="nx-home" aria-busy={loading}>
    <div className="nx-home-overline"><span className="nx-live-mark"/><span>VISÃO OPERACIONAL</span>
      <span className="nx-home-date">{dateText()}</span>
      <button type="button" onClick={onRefresh} disabled={loading} aria-label="Atualizar indicadores">
        <RefreshCw size={15} className={loading?'animate-spin':''}/>Atualizar
      </button>
    </div>
    <section className="nx-hero">
      <div className="nx-hero-copy">
        <span className="nx-hero-kicker">SENTINEL WORKSPACE · NEXUS</span>
        <h1>Uma visão clara do que move sua operação.</h1>
        <p>Bom trabalho, {customerFirstName}. As prioridades, simulações e propostas da sua carteira em um só lugar.</p>
        <div className="nx-hero-actions">
          {newProposal&&<button type="button" className="nx-hero-primary" onClick={newProposal}><FilePlus2 size={17}/>Nova proposta<ArrowUpRight size={16}/></button>}
          {can('simulations.view')&&<button type="button" className="nx-hero-secondary" onClick={()=>navigate('/simulacoes')}><Calculator size={17}/>Simular crédito</button>}
        </div>
      </div>
      <div className="nx-hero-visual" aria-hidden="true">
        <div className="nx-orbit nx-orbit-one"/><div className="nx-orbit nx-orbit-two"/>
        <div className="nx-core"><Workflow size={36}/></div>
        <div className="nx-orbit-caption nx-orbit-caption-a">PROPOSTAS</div>
        <div className="nx-orbit-caption nx-orbit-caption-b">INTELIGÊNCIA</div>
        <div className="nx-orbit-caption nx-orbit-caption-c">ESTEIRA</div>
      </div>
    </section>
    {error&&<div className="nx-data-error" role="alert">{error}<button type="button" onClick={onRefresh}>Tentar novamente</button></div>}
    {canSeeProposals&&<section className="nx-metrics" aria-label="Indicadores da carteira carregada">
      {totals.map(item=><article key={item.label} className={'nx-metric nx-metric-'+item.tone}>
        <div className="nx-metric-top"><span>{item.label}</span><item.icon size={20} aria-hidden="true"/></div>
        <strong>{loading&&!portfolio.length?'…':item.value.toLocaleString('pt-BR')}</strong>
        <small>{item.description}</small>
      </article>)}
    </section>}
    <div className="nx-home-grid">
      <section className="nx-home-worklist">
        <header className="nx-module-heading">
          <div><span className="nx-overline">ACOMPANHAMENTO</span><h2>Movimentação recente</h2>
            <p>Consulte operações e abra o registro diretamente.</p></div>
          {canSeeProposals&&<button type="button" className="nx-text-action" onClick={()=>navigate('/propostas')}>Ver todas<ArrowRight size={16}/></button>}
        </header>
        {canSeeProposals?<div className="nx-records">
          <div className="nx-records-toolbar">
            <div className="nx-filter-tabs" role="group" aria-label="Filtrar movimentação">
              {([['all','Todas'],['active','Em andamento'],['pending','Pendentes'],['paid','Pagas']] as const).map(([value,label])=>
                <button type="button" aria-pressed={filter===value} key={value} onClick={()=>setFilter(value)}>{label}</button>)}
            </div>
            <label className="nx-record-search"><Search size={16}/><input aria-label="Buscar movimentação" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Cliente, ADE, banco…"/></label>
          </div>
          <div className="nx-records-list">
            {filtered.map(row=><button type="button" className="nx-record" key={row.id}
              onClick={()=>openProposal(row.id)} aria-label={'Abrir proposta de '+row.client}>
              <span className="nx-avatar">{initials(row.client)}</span>
              <span className="nx-record-main"><strong>{row.client}</strong><small>{row.bank} · {row.ade||'Sem número'}</small></span>
              <span className={'nx-record-status '+(row.pending?'nx-status-pending':row.paid?'nx-status-paid':'')}>{row.status}</span>
              <span className="nx-record-amount">{money(row.amount)}</span><ChevronRight size={18} className="nx-record-arrow"/>
            </button>)}
            {!filtered.length&&<div className="nx-records-empty"><ClipboardList size={24}/><strong>{loading?'Carregando registros…':'Nenhum registro encontrado'}</strong><span>{query?'Use outro termo para buscar.':'A carteira carregada não contém propostas neste filtro.'}</span></div>}
          </div>
          <footer>Indicadores calculados exclusivamente a partir dos registros disponíveis para sua empresa e perfil.</footer>
        </div>:<div className="nx-records-empty"><CheckCircle2 size={26}/><strong>Seu ambiente está pronto.</strong><span>Use os acessos rápidos para iniciar o trabalho.</span></div>}
      </section>
      <aside className="nx-home-aside">
        <section className="nx-side-panel nx-start-panel">
          <div className="nx-module-heading"><div><span className="nx-overline">AÇÃO RÁPIDA</span><h2>Onde vamos agora?</h2></div></div>
          <div className="nx-shortcut-list">{shortcuts.map(shortcut=><button type="button" key={shortcut.to} onClick={()=>navigate(shortcut.to)}>
            <span className="nx-shortcut-icon"><shortcut.icon size={20}/></span>
            <span><strong>{shortcut.title}</strong><small>{shortcut.description}</small></span>
            <ArrowUpRight size={17} className="nx-shortcut-arrow"/>
          </button>)}</div>
          {!shortcuts.length&&<p>Não há atalhos adicionais disponíveis para este perfil.</p>}
        </section>
        {canSeeProposals&&<section className="nx-side-panel nx-bank-panel">
          <div className="nx-module-heading"><div><span className="nx-overline">CARTEIRA</span><h2>Instituições na operação</h2><p>Distribuição dos registros carregados.</p></div></div>
          {grouped.length?<div className="nx-bank-lines">{grouped.map(item=><div className="nx-bank-line" key={item.name}>
            <div><strong>{item.name}</strong><span>{item.count} {item.count===1?'registro':'registros'}</span></div>
            <div className="nx-bank-track"><span style={{width:(portfolio.length?item.count/portfolio.length*100:0)+'%'}}/></div>
          </div>)}</div>:<div className="nx-bank-empty">Os bancos com movimentação serão exibidos aqui.</div>}
          <button type="button" className="nx-side-link" onClick={()=>navigate('/propostas')}>Explorar carteira <ArrowRight size={15}/></button>
        </section>}
        {canSeeProposals&&<section className="nx-side-panel nx-attention-panel">
          <div className="nx-attention-icon"><CircleAlert size={21}/></div>
          <span className="nx-overline">PRECISA DE ATENÇÃO</span>
          <strong>{pending.length?pending.length+' operações pendentes':'Sem pendências nesta carteira'}</strong>
          <p>{pending.length?'Acesse os registros e identifique a próxima ação.':'Acompanhe novas movimentações em tempo real.'}</p>
          <button type="button" onClick={()=>navigate('/propostas')}>Examinar propostas <ArrowRight size={15}/></button>
        </section>}
      </aside>
    </div>
  </div>;
}
