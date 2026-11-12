import React, { useState } from 'react';
import { ArrowRight, Calculator, FilePlus2, FileText, ListChecks, RefreshCw, Search, Clock3 } from 'lucide-react';
import { hasPermission } from '../../lib/permissions';
import { formatCurrency } from '../../lib/utils';
import type { PreviewDashboard } from './PreviewDashboard';

type Props = React.ComponentProps<typeof PreviewDashboard>;

/** Task-first home. All counts come from the user's permitted, loaded portfolio. */
export function WorkspaceHome({ rows, role, permissions = [], name, navigate, openProposal, newProposal, error, onRefresh, loading }: Props) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const can = (permission: string) => hasPermission(role, permissions, permission);
  const portfolio = can('proposals.view') ? rows : [];
  const pending = portfolio.filter(row => row.active && row.pending);
  const active = portfolio.filter(row => row.active);
  const paid = portfolio.filter(row => row.paid);
  const actions = [
    { title: 'Simular crédito', description: 'Consulte as opções para o seu cliente.', icon: Calculator, show: can('simulations.view'), run: () => navigate('/simulacoes') },
    { title: 'Cadastrar proposta', description: 'Registre uma nova operação.', icon: FilePlus2, show: !!newProposal, run: () => newProposal?.() },
    { title: 'Resolver pendências', description: 'Confira o que precisa de atenção.', icon: ListChecks, show: can('pendencies.view'), run: () => navigate('/central-pendencias') },
  ].filter(action => action.show);
  const visible = portfolio.filter(row => (filter === 'all' || (filter === 'pending' ? row.active && row.pending : row.active)) && `${row.client} ${row.ade} ${row.bank}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 8);
  return <div className="workspace-home" aria-busy={loading}>
    <header className="workspace-welcome"><div><span className="workspace-eyebrow">SEU ESPAÇO DE TRABALHO</span><h1>Olá, {name.split(' ')[0]}. Vamos começar?</h1><p>Escolha uma tarefa ou continue de onde parou.</p></div><button className="workspace-secondary" disabled={loading} onClick={onRefresh}><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>{loading ? 'Atualizando…' : 'Atualizar'}</button></header>
    {error && <div className="workspace-error" role="alert">Não foi possível atualizar todos os dados. {error}<button onClick={onRefresh}>Tentar novamente</button></div>}
    {!!actions.length && <section className="workspace-actions" aria-label="O que você quer fazer?">{actions.map((action, index) => <button key={action.title} className={index === 0 ? 'workspace-action featured' : 'workspace-action'} onClick={action.run}><span className="workspace-action-icon"><action.icon size={24}/></span><strong>{action.title}</strong><span>{action.description}</span><ArrowRight size={20}/></button>)}</section>}
    {can('proposals.view') && <>
      <section className="workspace-metrics" aria-label="Resumo da carteira carregada">{[
        { label: 'Em andamento', value: active.length, detail: 'propostas ativas', icon: FileText },
        { label: 'Precisam de atenção', value: pending.length, detail: 'propostas ativas com pendência', icon: Clock3 },
        { label: 'Propostas pagas', value: paid.length, detail: 'com status pago', icon: ListChecks },
        { label: 'Valor liberado', value: paid.some(row => row.amount !== null) ? formatCurrency(paid.reduce((sum, row) => sum + (row.amount ?? 0), 0)) : '—', detail: 'valor informado nas propostas pagas', icon: Calculator },
      ].map(item => <article key={item.label}><div><span>{item.label}</span><item.icon size={18}/></div><strong>{loading && !portfolio.length ? '…' : item.value}</strong><small>{item.detail}</small></article>)}</section>
      <section className="workspace-portfolio"><div className="workspace-section-heading"><div><h2>Continue seu trabalho</h2><p>Propostas mais recentes da carteira disponível.</p></div><button className="workspace-secondary" onClick={() => navigate('/propostas')}>Ver todas <ArrowRight size={16}/></button></div>
        <div className="workspace-list-tools"><div role="group" aria-label="Filtrar propostas">{[['all', 'Recentes'], ['active', 'Em andamento'], ['pending', 'Com pendência']].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><label className="workspace-search"><Search size={17}/><input aria-label="Buscar nas propostas recentes" placeholder="Cliente, proposta ou banco" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
        {visible.length ? <div className="workspace-table-wrap"><table><thead><tr><th>Cliente / proposta</th><th>Banco / produto</th><th>Valor liberado</th><th>Situação</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><button className="workspace-client" onClick={() => openProposal(row.id)}>{row.client}</button><small>{row.ade || 'Sem número'}</small></td><td>{row.bank}<small>{row.product}</small></td><td>{row.amount === null ? '—' : formatCurrency(row.amount)}</td><td><span className={`workspace-status ${row.pending ? 'pending' : row.paid ? 'paid' : ''}`}>{row.status}</span></td><td><button className="workspace-open" aria-label={`Abrir proposta de ${row.client}`} onClick={() => openProposal(row.id)}><ArrowRight size={18}/></button></td></tr>)}</tbody></table></div> : <div className="workspace-empty"><FileText size={32}/><h3>{loading ? 'Carregando propostas…' : 'Nenhuma proposta encontrada'}</h3><p>{query ? 'Tente outro nome, número ou banco.' : 'As propostas desta fila aparecerão aqui.'}</p>{query && <button className="workspace-secondary" onClick={() => setQuery('')}>Limpar busca</button>}</div>}
      </section><p className="workspace-data-note">Resumo da carteira carregada. Os valores não representam um período de pagamento.</p>
    </>}
    {!can('proposals.view') && <section className="workspace-portfolio workspace-empty"><ListChecks size={32}/><h2>Sua rotina, organizada</h2><p>Use o menu para acessar as ferramentas disponíveis para o seu perfil.</p>{can('tasks.view') && <button className="workspace-secondary" onClick={() => navigate('/minha-fila')}>Abrir minhas tarefas <ArrowRight size={16}/></button>}</section>}
  </div>;
}
