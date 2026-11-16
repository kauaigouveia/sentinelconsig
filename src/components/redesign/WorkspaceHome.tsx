import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight, Calculator, FilePlus2, FileText, ListChecks, RefreshCw, Search, CalendarDays, CircleCheck, Clock3 } from 'lucide-react';
import { hasPermission } from '../../lib/permissions';
import { formatCurrency } from '../../lib/utils';
import type { PreviewRow } from './PreviewData';
import type { Role } from '../../types';
import type { BottlenecksResponse } from '../../types/analytics';
interface Props {
 rows: PreviewRow[]; role?: Role; permissions?: string[]; name: string;
 navigate: (path: string) => void; openProposal: (id: string) => void; newProposal?: () => void;
 error?: string; onRefresh?: () => void; loading?: boolean;
 bottlenecks?: BottlenecksResponse | null; openStatus?: (id: string) => void; openBank?: (id: string) => void; demo?: boolean;
}

export function WorkspaceHome({ rows, role, permissions = [], name, navigate, openProposal, newProposal, error, onRefresh, loading }: Props) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const can = (permission: string) => hasPermission(role, permissions, permission);
  const portfolio = can('proposals.view') ? rows : [];
  const active = portfolio.filter(row => row.active);
  const pending = active.filter(row => row.pending);
  const paid = portfolio.filter(row => row.paid);
  const date = new Intl.DateTimeFormat('pt-BR', {weekday:'long', day:'numeric', month:'long', timeZone:'America/Bahia'}).format(new Date());
  const visible = portfolio.filter(row => (filter === 'all' || (filter === 'pending' ? row.active && row.pending : row.active)) && `${row.client} ${row.ade} ${row.bank}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,7);
  const shortcuts = [
    {title:'Simular crédito', detail:'Consulte as condições para um cliente', icon:Calculator, show:can('simulations.view'), run:() => navigate('/simulacoes')},
    {title:'Meus clientes', detail:'Cadastros, documentos e contatos', icon:FileText, show:can('clients.view'), run:() => navigate('/clientes')},
    {title:'Minhas tarefas', detail:'Organize os próximos passos', icon:CalendarDays, show:can('tasks.view'), run:() => navigate('/minha-fila')},
    {title:'Atendimento', detail:'Acesse as conversas da operação', icon:ListChecks, show:can('support.view'), run:() => navigate('/central-atendimento')},
  ].filter(item => item.show);
  return <div className="wb-home" aria-busy={loading}>
    <header className="wb-day-heading"><span>{date}</span><button className="wb-quiet-button" disabled={loading} onClick={onRefresh}><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>{loading ? 'Atualizando' : 'Atualizar dados'}</button></header>
    <section className="wb-introduction">
      <div><span className="wb-eyebrow">MEU DIA</span><h1>Bom trabalho, {name.split(' ')[0] || 'equipe'}.</h1><p>O que você precisa fazer hoje?</p><div className="wb-introduction-actions">{newProposal && <button className="wb-primary" onClick={newProposal}><FilePlus2 size={18}/>Criar proposta<ArrowUpRight size={17}/></button>}{can('simulations.view') && <button className="wb-secondary" onClick={() => navigate('/simulacoes')}><Calculator size={18}/>Fazer uma simulação</button>}</div></div>
      {can('proposals.view') && <div className="wb-portfolio-summary"><div><span>EM ANDAMENTO</span><strong>{loading && !portfolio.length ? '…' : active.length}</strong><small>propostas na carteira carregada</small></div><div className="wb-portfolio-bands" aria-label="Resumo da carteira"><span><i style={{width:portfolio.length ? `${active.length/portfolio.length*100}%` : '0%'}}/></span><p><span>{paid.length} pagas</span><span>{portfolio.length} no total</span></p></div></div>}
    </section>
    {error && <div className="wb-error" role="alert">{error}<button onClick={onRefresh}>Tentar novamente</button></div>}
    <div className="wb-home-columns"><section className="wb-activity">
      <header><div><span className="wb-eyebrow">ACOMPANHAMENTO</span><h2>Seu trabalho em movimento</h2></div>{can('proposals.view') && <button className="wb-text-link" onClick={() => navigate('/propostas')}>Todas as propostas<ArrowUpRight size={16}/></button>}</header>
      {can('proposals.view') ? <><div className="wb-activity-controls"><div role="group" aria-label="Filtrar propostas">{[['all','Recentes'],['active','Em andamento'],['pending','Com pendência']].map(([id,label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><label><Search size={16}/><input aria-label="Buscar nas propostas recentes" placeholder="Buscar cliente ou proposta" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
      <div className="wb-activity-list">{visible.map(row => <article key={row.id}><div className="wb-initials" aria-hidden="true">{row.client.split(' ').map(part=>part[0]).slice(0,2).join('')}</div><div className="wb-activity-person"><button onClick={() => openProposal(row.id)}>{row.client}</button><span>{row.ade || 'Sem número'} · {row.bank}</span></div><span className={row.pending ? 'wb-status wb-status-attention' : row.paid ? 'wb-status wb-status-paid' : 'wb-status'}>{row.status}</span><strong>{row.amount === null ? '—' : formatCurrency(row.amount)}</strong><button className="wb-open-record" aria-label={`Abrir proposta de ${row.client}`} onClick={() => openProposal(row.id)}><ArrowUpRight size={18}/></button></article>)}{!visible.length && <div className="wb-empty"><FileText size={28}/><h3>{loading ? 'Carregando propostas…' : 'Nenhuma proposta encontrada'}</h3><p>{query ? 'Tente outro nome, número ou banco.' : 'Os registros desta fila aparecerão aqui.'}</p>{query && <button className="wb-secondary" onClick={() => setQuery('')}>Limpar busca</button>}</div>}</div></> : <div className="wb-empty"><CircleCheck size={30}/><h3>Seu espaço está pronto.</h3><p>Escolha uma ferramenta para começar o trabalho.</p></div>}
      {can('proposals.view') && <footer>Dados da carteira carregada · valores conforme os registros disponíveis.</footer>}
    </section><aside className="wb-day-tools"><section><span className="wb-eyebrow">ACESSO DIRETO</span><h2>Comece por aqui</h2><div className="wb-shortcuts">{shortcuts.map(item => <button key={item.title} onClick={item.run}><item.icon size={20}/><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16}/></button>)}</div></section>
      {can('proposals.view') && <section className="wb-attention"><Clock3 size={21}/><span>PARA ACOMPANHAR</span><h3>{pending.length ? `${pending.length} propostas com pendência` : 'Nenhuma proposta pendente nesta carteira'}</h3><p>{pending.length ? 'Confira os registros e identifique o que falta para continuar.' : 'Continue acompanhando as atualizações da sua operação.'}</p><button className="wb-text-link" onClick={() => navigate('/propostas')}>Consultar propostas<ArrowRight size={16}/></button></section>}
    </aside></div>
  </div>;
}
