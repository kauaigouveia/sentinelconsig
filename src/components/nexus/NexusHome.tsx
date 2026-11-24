import React,{useEffect,useMemo,useState} from 'react';
import {ArrowRight,ArrowUpRight,BriefcaseBusiness,Calculator,CheckCircle2,ChevronLeft,ChevronRight,CircleAlert,ClipboardList,Clock3,FilePlus2,RefreshCw,Search,Users,Workflow,Wallet,ArrowLeftRight,X,LayoutDashboard} from 'lucide-react';
import {hasPermission} from '../../lib/permissions';
import {formatCurrency} from '../../lib/utils';
import type {PreviewRow} from '../redesign/PreviewData';
import type {Role} from '../../types';
import type {BottlenecksResponse} from '../../types/analytics';
import './nexus-home.css';

type Props={
  rows:PreviewRow[];role?:Role;permissions?:string[];name:string;
  navigate:(url:string)=>void;openProposal:(id:string)=>void;newProposal?:()=>void;
  error?:string;onRefresh?:()=>void;loading?:boolean;bottlenecks?:BottlenecksResponse|null;
  openStatus?:(id:string)=>void;openBank?:(id:string)=>void;demo?:boolean;
};
type StatusFilter='all'|'active'|'pending'|'paid'|'rejected'|'cancelled';
type SimSummary={id:string;createdAt:string;partnerId?:string;partner?:{fullName?:string;name?:string};productName?:string;product?:{name?:string};convenioName?:string;convenio?:{name?:string}};
const dateFormat=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Maceio',day:'2-digit',month:'2-digit',year:'numeric'});
const dayKey=(date:string|Date)=>{const d=new Date(date);if(!Number.isFinite(d.getTime()))return '';const parts=dateFormat.formatToParts(d);const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';return [get('year'),get('month'),get('day')].join('-');};
const labelDate=(date:string)=>dayKey(date)?dateFormat.format(new Date(date)):'—';
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const number=(n:number)=>n.toLocaleString('pt-BR');
const money=(n:number|null)=>n===null?'—':formatCurrency(n);
const sum=(rows:PreviewRow[],key:'amount'|'contract'|'debt')=>{
  if(!rows.length)return 0;
  const values=rows.map(r=>r[key]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
  return values.length?values.reduce((a,b)=>a+b,0):null;
};
const category=(r:PreviewRow)=>String(r.statusCategory||'').toUpperCase();
const rejected=(r:PreviewRow)=>category(r)==='RECUSADO'||['REPROVADO','RECUSADO'].includes(r.statusCode||'');
const cancelled=(r:PreviewRow)=>category(r)==='CANCELADO'||r.statusCode==='CANCELADO';
const inCip=(r:PreviewRow)=>r.active&&r.statusCode==='AGUARDAR_RETORNO_CIP';
const matchesStatus=(r:PreviewRow,f:StatusFilter)=>f==='all'||f==='active'&&r.active||f==='pending'&&r.active&&r.pending||f==='paid'&&r.paid||f==='rejected'&&rejected(r)||f==='cancelled'&&cancelled(r);
const partnerKey=(r:PreviewRow)=>r.partnerId||r.partner;
const options=(values:string[])=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
const PAGE_SIZE=15;

export function NexusHome({rows,role,permissions=[],navigate,openProposal,newProposal,error,onRefresh,loading,demo}:Props){
  const can=(p:string)=>hasPermission(role,permissions,p);
  const canSeeProposals=can('proposals.view'),canSeeSimulations=can('simulations.view');
  const portfolio=canSeeProposals?rows:[];
  const [start,setStart]=useState(''),[end,setEnd]=useState('');
  const [bank,setBank]=useState(''),[product,setProduct]=useState(''),[convenio,setConvenio]=useState(''),[partner,setPartner]=useState('');
  const [query,setQuery]=useState(''),[status,setStatus]=useState<StatusFilter>('all');
  const [view,setView]=useState<'partners'|'proposals'>('partners'),[page,setPage]=useState(1);
  const [revision,setRevision]=useState(0);
  const [simState,setSimState]=useState<{state:'loading'|'ready'|'error';rows:SimSummary[]}>({state:'loading',rows:[]});
  useEffect(()=>{
    if(!canSeeSimulations||demo)return;
    const controller=new AbortController();
    setSimState({state:'loading',rows:[]});
    void (async()=>{
      try{
        const res=await fetch('/api/simulations',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
        if(!res.ok)throw Error('Simulações indisponíveis');
        const data=await res.json();
        if(!Array.isArray(data))throw Error('Resposta inválida');
        // Keep only the fields necessary for the aggregate, never CPF or raw bank payloads.
        const mapped:SimSummary[]=data.map((s:any)=>({id:String(s.id||''),createdAt:String(s.createdAt||''),partnerId:s.partnerId,partner:s.partner?{fullName:s.partner.fullName,name:s.partner.name}:undefined,productName:s.productName,product:s.product?{name:s.product.name}:undefined,convenioName:s.convenioName,convenio:s.convenio?{name:s.convenio.name}:undefined})).filter(s=>s.id);
        if(!controller.signal.aborted)setSimState({state:'ready',rows:[...new Map(mapped.map(s=>[s.id,s])).values()]});
      }catch{if(!controller.signal.aborted)setSimState({state:'error',rows:[]});}
    })();
    return ()=>controller.abort();
  },[canSeeSimulations,demo,revision]);
  const invalidPeriod=!!(start&&end&&start>end);
  const dateMatches=(value:string)=>{const d=dayKey(value);return !invalidPeriod&&(!start&&!end||!!d&&(!start||d>=start)&&(!end||d<=end));};
  const scoped=useMemo(()=>portfolio.filter(r=>{
    const search=normalize(query),haystack=normalize([r.client,r.cpf,r.ade,r.partner,r.bank,r.product,r.convenio,r.status].join(' '));
    const digits=query.replace(/\D/g,'');
    return dateMatches(r.createdAt)&&(!bank||r.bank===bank)&&(!product||r.product===product)&&(!convenio||(r.convenio||'Não informado')===convenio)&&(!partner||partnerKey(r)===partner)&&(!search||haystack.includes(search)||(/^\d[\d.\-\s]+$/.test(query)&&!!digits&&r.cpf.replace(/\D/g,'').includes(digits)));
  }).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)),[portfolio,start,end,bank,product,convenio,partner,query]);
  const active=scoped.filter(r=>r.active),pending=scoped.filter(r=>r.active&&r.pending),paid=scoped.filter(r=>r.paid),refused=scoped.filter(rejected),canceled=scoped.filter(cancelled),cip=scoped.filter(inCip);
  const visible=scoped.filter(r=>matchesStatus(r,status));
  const partnerOptions=[...new Map(portfolio.map(r=>[partnerKey(r),r.partner])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
  const groups=useMemo(()=>{
    const map=new Map<string,{key:string;name:string;rows:PreviewRow[]}>();
    for(const row of visible){const key=partnerKey(row);const g=map.get(key)||{key,name:row.partner,rows:[]};g.rows.push(row);map.set(key,g);}
    return [...map.values()].sort((a,b)=>b.rows.length-a.rows.length||a.name.localeCompare(b.name,'pt-BR'));
  },[visible]);
  const simFilterUnsupported=!!(bank||query);
  const simRows=simState.state==='ready'&&!simFilterUnsupported?simState.rows.filter(s=>dateMatches(s.createdAt)&&(!partner||s.partnerId===partner)&&(!product||(s.productName||s.product?.name)===product)&&(!convenio||(s.convenioName||s.convenio?.name)===convenio)):null;
  const countRows=view==='partners'?groups.length:visible.length;
  const totalPages=Math.max(1,Math.ceil(countRows/PAGE_SIZE)),currentPage=Math.min(page,totalPages),offset=(currentPage-1)*PAGE_SIZE;
  const resetPage=()=>setPage(1);
  const clear=()=>{setStart('');setEnd('');setBank('');setProduct('');setConvenio('');setPartner('');setQuery('');setStatus('all');resetPage();};
  const changeStatus=(s:StatusFilter)=>{setStatus(old=>old===s?'all':s);resetPage();};
  const refresh=()=>{onRefresh?.();setRevision(v=>v+1);};
  const drillPartner=(key:string)=>{setPartner(key);setView('proposals');resetPage();};
  const shortcuts=[
    {title:'Simular crédito',icon:Calculator,to:'/simulacoes',allowed:canSeeSimulations},
    {title:'Propostas',icon:BriefcaseBusiness,to:'/propostas',allowed:canSeeProposals},
    {title:'Esteira',icon:Workflow,to:'/esteira',allowed:canSeeProposals},
    {title:'Clientes',icon:Users,to:'/clientes',allowed:can('clients.view')},
    {title:'Pendências',icon:ClipboardList,to:'/central-pendencias',allowed:can('support.view')},
  ].filter(s=>s.allowed);
  const mainMetrics=[
    {label:'Na carteira',value:number(scoped.length),detail:'propostas cadastradas no período',icon:LayoutDashboard,tone:'blue'},
    ...(canSeeSimulations?[{label:'Simulações salvas',value:simRows?number(simRows.length):simState.state==='loading'&&!demo&&!simFilterUnsupported?'…':'—',detail:simFilterUnsupported?'não disponível com busca ou banco':simState.state==='error'?'fonte indisponível':'solicitações registradas',icon:Calculator,tone:'cyan'}]:[]),
    {label:'Valor digitado',value:money(sum(scoped,'contract')),detail:'valor bruto informado',icon:Wallet,tone:'violet'},
    {label:'Valor liberado',value:money(sum(scoped,'amount')),detail:'valor líquido informado',icon:ArrowUpRight,tone:'cyan'},
    {label:'Saldos na CIP',value:money(sum(cip,'debt')),detail:number(cip.length)+' aguardando retorno',icon:ArrowLeftRight,tone:'amber'},
    {label:'Pagas',value:money(sum(paid,'amount')),detail:number(paid.length)+' propostas com status pago',icon:CheckCircle2,tone:'green'},
  ];
  const statusMetrics:{filter:StatusFilter;label:string;items:PreviewRow[];tone:string}[]=[
    {filter:'active',label:'Em andamento',items:active,tone:'blue'},
    {filter:'pending',label:'Com pendência',items:pending,tone:'amber'},
    {filter:'rejected',label:'Reprovadas',items:refused,tone:'red'},
    {filter:'cancelled',label:'Canceladas',items:canceled,tone:'muted'},
    {filter:'paid',label:'Pagas',items:paid,tone:'green'},
  ];
  const value=(n:string)=>loading&&!portfolio.length?'…':n;
  return <div className="nx-ops-dashboard" aria-busy={loading}>
    <header className="nx-ops-heading">
      <div><span className="nx-ops-crumb">Dashboard / Operação</span><h1>Visão geral</h1><p>SENTINEL CONSIG · INTELIGÊNCIA EM CADA OPERAÇÃO.</p></div>
      <div className="nx-ops-actions">
        {canSeeSimulations&&<button type="button" onClick={()=>navigate('/simulacoes')}><Calculator size={16}/>Simular crédito</button>}
        {newProposal&&can('proposals.create')&&<button type="button" className="nx-ops-primary" onClick={newProposal}><FilePlus2 size={16}/>Nova proposta</button>}
        <button type="button" onClick={refresh} disabled={loading} aria-label="Atualizar indicadores" title="Atualizar indicadores"><RefreshCw size={16} className={loading?'animate-spin':''}/><span>Atualizar</span></button>
      </div>
    </header>
    {error&&<div className="nx-ops-alert" role="alert">{error}<button type="button" onClick={refresh}>Tentar novamente</button></div>}
    {canSeeProposals?<><section className="nx-ops-filters" aria-label="Filtros do dashboard">
      <div className="nx-ops-filter-main">
        <label>Data inicial<input type="date" value={start} onChange={e=>{setStart(e.target.value);resetPage();}}/></label>
        <label>Data final<input type="date" value={end} onChange={e=>{setEnd(e.target.value);resetPage();}}/></label>
        <div className="nx-ops-search"><label htmlFor="nx-ops-search-input">Busca</label><div><Search size={17} aria-hidden="true"/><input id="nx-ops-search-input" aria-label="Buscar movimentação" placeholder="Buscar parceiro, cliente, CPF, ADE ou convênio" value={query} onChange={e=>{setQuery(e.target.value);resetPage();}}/>{query&&<button type="button" aria-label="Limpar busca" onClick={()=>{setQuery('');resetPage();}}><X size={16} aria-hidden="true"/></button>}</div></div>
      </div>
      <div className="nx-ops-filter-extra">
        <label>Banco<select value={bank} onChange={e=>{setBank(e.target.value);resetPage();}}><option value="">Todos os bancos</option>{options(portfolio.map(r=>r.bank)).map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Produto<select value={product} onChange={e=>{setProduct(e.target.value);resetPage();}}><option value="">Todos os produtos</option>{options(portfolio.map(r=>r.product)).map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Convênio<select value={convenio} onChange={e=>{setConvenio(e.target.value);resetPage();}}><option value="">Todos os convênios</option>{options(portfolio.map(r=>r.convenio||'Não informado')).map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Parceiro<select value={partner} onChange={e=>{setPartner(e.target.value);resetPage();}}><option value="">Todos os parceiros</option>{partnerOptions.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
        <div className="nx-ops-date-actions"><button type="button" onClick={()=>{const today=dayKey(new Date());setStart(today);setEnd(today);resetPage();}}>Hoje</button><button type="button" onClick={clear}>Limpar filtros</button></div>
      </div>
      {invalidPeriod&&<p role="alert" className="nx-ops-invalid">A data inicial não pode ser posterior à final.</p>}
    </section>
    <section className="nx-ops-metrics" aria-label="Indicadores da carteira carregada">
      {mainMetrics.map(item=><article className={'nx-ops-metric nx-ops-'+item.tone} key={item.label}><div className="nx-ops-metric-label"><span className="nx-ops-icon"><item.icon size={17}/></span><span>{item.label}</span></div><strong>{invalidPeriod?'—':value(item.value)}</strong><small>{item.detail}</small></article>)}
    </section>
    <section className="nx-ops-statuses" aria-label="Situação das propostas">
      {statusMetrics.map(item=><button type="button" key={item.filter} className={'nx-ops-status nx-ops-'+item.tone} aria-pressed={status===item.filter} onClick={()=>changeStatus(item.filter)}>
        <span>{item.label}</span><strong>{invalidPeriod?'—':value(money(sum(item.items,'amount')))}</strong><small>{number(item.items.length)} proposta(s)</small>
      </button>)}
    </section>
    <section className="nx-ops-worklist" aria-label="Carteira operacional">
      <header><div><h2>Produção operacional</h2><p>{number(visible.length)} propostas · {number(groups.length)} parceiros</p></div><div className="nx-ops-table-actions"><div role="group" aria-label="Visualização da carteira">
        <button type="button" aria-pressed={view==='partners'} onClick={()=>{setView('partners');resetPage();}}>Por parceiro</button><button type="button" aria-pressed={view==='proposals'} onClick={()=>{setView('proposals');resetPage();}}>Por proposta</button></div>
        {status!=='all'&&<button type="button" onClick={()=>changeStatus(status)}>Remover filtro de status</button>}
        <button type="button" onClick={()=>navigate('/propostas')}>Ver propostas<ArrowRight size={15}/></button></div></header>
      <div className="nx-ops-table-scroll">
        {view==='partners'?<table className="nx-ops-table"><thead><tr><th>Parceiro</th><th>Última digitação</th><th>Propostas</th><th>Valor digitado</th><th>Em andamento</th><th>Pendentes</th><th>Pagas</th><th>Convênios</th><th><span className="sr-only">Abrir</span></th></tr></thead><tbody>
          {groups.slice(offset,offset+PAGE_SIZE).map(g=><tr key={g.key}>
            <td data-label="Parceiro"><button className="nx-ops-link" type="button" onClick={()=>drillPartner(g.key)}>{g.name}</button></td><td data-label="Última digitação">{labelDate(g.rows[0].createdAt)}</td><td data-label="Propostas">{number(g.rows.length)}</td><td data-label="Valor digitado">{money(sum(g.rows,'contract'))}</td><td data-label="Em andamento">{number(g.rows.filter(r=>r.active).length)}</td><td data-label="Pendentes">{number(g.rows.filter(r=>r.active&&r.pending).length)}</td><td data-label="Pagas">{number(g.rows.filter(r=>r.paid).length)}</td><td data-label="Convênios">{options(g.rows.map(r=>r.convenio||'Não informado')).join(' · ')}</td><td><button type="button" className="nx-ops-row-action" aria-label={'Ver propostas de '+g.name} onClick={()=>drillPartner(g.key)}><ChevronRight size={17}/></button></td>
          </tr>)}
        </tbody></table>:<table className="nx-ops-table"><thead><tr><th>Cliente / ADE</th><th>Parceiro</th><th>Banco</th><th>Produto / Convênio</th><th>Data</th><th>Valor bruto</th><th>Valor liberado</th><th>Status</th><th><span className="sr-only">Abrir</span></th></tr></thead><tbody>
          {visible.slice(offset,offset+PAGE_SIZE).map(r=><tr key={r.id}><td data-label="Cliente / ADE"><button className="nx-ops-link" type="button" onClick={()=>openProposal(r.id)} aria-label={'Abrir proposta de '+r.client}>{r.client}</button><small>{r.ade||'Sem ADE'}</small></td><td data-label="Parceiro">{r.partner}</td><td data-label="Banco">{r.bank}</td><td data-label="Produto / Convênio">{r.product}<small>{r.convenio||'Não informado'}</small></td><td data-label="Data">{labelDate(r.createdAt)}</td><td data-label="Valor bruto">{money(r.contract)}</td><td data-label="Valor liberado">{money(r.amount)}</td><td data-label="Status"><span className={'nx-ops-status-pill '+(r.paid?'nx-paid':r.pending?'nx-pending':'')}>{r.status}</span></td><td><button type="button" className="nx-ops-row-action" aria-label={'Detalhes da proposta '+r.ade} onClick={()=>openProposal(r.id)}><ChevronRight size={17}/></button></td></tr>)}
        </tbody></table>}
        {!countRows&&<div className="nx-ops-empty"><ClipboardList size={24}/><strong>{loading?'Carregando registros…':'Nenhum movimento no período.'}</strong><span>Altere os filtros para consultar a carteira.</span></div>}
      </div>
      <footer><span>{countRows?offset+1:0}–{Math.min(offset+PAGE_SIZE,countRows)} de {countRows} registros carregados</span><div><button type="button" aria-label="Página anterior" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={16}/></button><span>{currentPage} / {totalPages}</span><button type="button" aria-label="Próxima página" disabled={currentPage===totalPages} onClick={()=>setPage(currentPage+1)}><ChevronRight size={16}/></button></div></footer>
    </section>
    <p className="nx-ops-footnote">Indicadores da carteira carregada, conforme a empresa e o acesso atual. O período refere-se à criação da proposta; os status são atuais. Valores somam somente campos informados. Pendências também integram o total em andamento. Simulações salvas não equivalem a todas as consultas bancárias.</p>
    </>:<section className="nx-ops-worklist"><div className="nx-ops-empty"><CheckCircle2 size={24}/><strong>Seu ambiente está pronto.</strong><span>Use os módulos disponíveis para seu perfil.</span></div></section>}
    <nav className="nx-ops-shortcuts" aria-label="Acessos rápidos">{shortcuts.map(s=><button type="button" key={s.to} onClick={()=>navigate(s.to)}><s.icon size={16}/>{s.title}<ArrowUpRight size={13}/></button>)}</nav>
  </div>;
}
