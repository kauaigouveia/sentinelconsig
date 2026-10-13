import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, CircleDollarSign, Clock3, FileText, Layers3, RefreshCw, AlertTriangle, Calculator, Headphones, ListChecks, BarChart3 } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { StorageService } from '../../services/storageService';
import { AnalyticsApiService } from '../../services/analyticsApiService';
import { realtimeHub } from '../../services/realtimeService';
import type { BottlenecksResponse } from '../../types/analytics';
import type { ResponsibleAlçada } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { isProposalOperationalActive } from '../../lib/statusUtils';
import { hasPermission } from '../../lib/permissions';

interface ControlTowerProps {
  onNavigateToProductionWithFilter: (filter: { statusId?: string; alçada?: ResponsibleAlçada; bankId?: string; promoterId?: string }) => void;
  onNavigate?: (path: string) => void;
}
const dayKey = (date: Date) => date.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' });
export const ControlTower: React.FC<ControlTowerProps> = ({ onNavigateToProductionWithFilter, onNavigate }) => {
  const [version, setVersion] = useState(0), [days, setDays] = useState(14), [loading, setLoading] = useState(false);
  const [bottlenecks, setBottlenecks] = useState<BottlenecksResponse | null>(null);
  const user = StorageService.getActiveUser();
  const canViewProposals = hasPermission(user?.role, user?.customPermissions, 'proposals.view');
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const result = await AnalyticsApiService.fetchBottlenecks(); setBottlenecks(result); setVersion(value => value + 1); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    void AnalyticsApiService.fetchBottlenecks().then(result => { if (alive) setBottlenecks(result); });
    const sync = () => { setVersion(value => value + 1); clearTimeout(timer); timer = setTimeout(() => { void AnalyticsApiService.fetchBottlenecks().then(result => { if (alive) setBottlenecks(result); }); }, 800); };
    window.addEventListener('credit_gestao_storage_update', sync);
    const unsubscribe = realtimeHub.subscribe('*', event => { if (event?.type?.includes('PROPOSAL') || event?.type?.includes('STATUS')) sync(); });
    return () => { alive = false; clearTimeout(timer); window.removeEventListener('credit_gestao_storage_update', sync); unsubscribe(); };
  }, []);
  const proposals = useMemo(() => StorageService.getProposals(), [version]);
  const statuses = StorageService.getStatuses(), banks = StorageService.getBanks();
  const active = proposals.filter(proposal => isProposalOperationalActive(proposal, statuses));
  const paid = proposals.filter(proposal => { const status = proposal.status || statuses.find(row => row.id === proposal.statusId); return status?.standardCategory === 'PAGO' || status?.code === 'PAGO'; });
  const pending = active.filter(proposal => { const status = proposal.status || statuses.find(row => row.id === proposal.statusId); return status?.standardCategory === 'PENDENTE' || String(status?.code).startsWith('PENDENTE'); });
  const paidVolume = paid.reduce((sum, proposal) => sum + Number(proposal.disbursedValue || 0), 0);
  const dailyCounts = new Map<string, number>();
  for (const proposal of proposals) { const key = dayKey(new Date(proposal.createdAt)); dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1); }
  const chart = Array.from({ length: days }, (_, index) => { const date = new Date(Date.now() - (days - 1 - index) * 86400000), key = dayKey(date); return { day: key.slice(0, 5), count: dailyCounts.get(key) || 0 }; });
  const bankDistribution = banks.map(bank => ({ ...bank, count: active.filter(proposal => proposal.bankId === bank.id).length })).filter(bank => bank.count > 0).sort((a,b) => b.count - a.count).slice(0, 5);
  const priorities = (bottlenecks?.byStatus || []).filter(row => row.overSlaCount > 0).sort((a,b) => b.overSlaCount - a.overSlaCount).slice(0, 4);
  const quickActions = [
    { label: 'Simular crédito', text: 'Condições de todos os bancos', icon: Calculator, path: '/simulacoes', permission: 'simulations.view' },
    { label: 'Atender parceiros', text: 'Conversas e WhatsApp', icon: Headphones, path: '/central-atendimento', permission: 'support.view' },
    { label: 'Minha fila', text: 'Próximos passos da equipe', icon: ListChecks, path: '/minha-fila', permission: 'tasks.view' },
    { label: 'Analisar resultados', text: 'Indicadores e produção', icon: BarChart3, path: '/bi', permission: 'bi.view' },
  ].filter(action => hasPermission(user?.role, user?.customPermissions, action.permission as any));
  const hasProduction = proposals.length > 0;
  return <div className="space-y-5">
    <div className="sentinel-heading"><div><div className="sentinel-eyebrow">Visão da operação</div><h1>Seu dia, em perspectiva.</h1><p>Olá, {user?.name?.split(' ')[0] || 'equipe'}. Encontre o que precisa de atenção e acompanhe os resultados.</p></div><div className="flex items-center gap-2"><button type="button" className="sentinel-secondary-button" onClick={() => void refresh()} disabled={loading} aria-label="Atualizar indicadores"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>{canViewProposals && <button type="button" className="sentinel-primary-button" onClick={() => onNavigateToProductionWithFilter({})}>Ver propostas<ArrowUpRight size={16} /></button>}</div></div>
    <div className="sentinel-kpi-grid">
      <div className="sentinel-kpi sentinel-kpi--featured"><div><span>Volume liberado · pagas</span><CircleDollarSign size={18} /></div><strong>{formatCurrency(paidVolume)}</strong><small>{paid.length} propostas pagas na carteira disponível</small></div>
      <div className="sentinel-kpi"><div><span>Propostas em andamento</span><Layers3 size={18} /></div><strong>{active.length.toLocaleString('pt-BR')}</strong><small>Operações ativas da sua empresa</small></div>
      <div className="sentinel-kpi"><div><span>Fora do prazo</span><Clock3 size={18} className="text-amber-600 dark:text-amber-400" /></div><strong>{bottlenecks ? bottlenecks.summary.totalOverSla : '—'}</strong><small>{bottlenecks ? `${bottlenecks.summary.totalNearSla} próximas ao limite de SLA` : 'Carregando análise de permanência'}</small></div>
      <div className="sentinel-kpi"><div><span>Pendências em propostas</span><FileText size={18} /></div><strong>{pending.length.toLocaleString('pt-BR')}</strong><small>Propostas ativas com status de pendência</small></div>
    </div>
    <div className="sentinel-dashboard-grid">
      <section className="sentinel-panel"><div className="sentinel-panel-heading"><div><h2>Ritmo da produção</h2><p>Propostas cadastradas por dia · horário de Brasília</p></div><select aria-label="Período do gráfico de produção" value={days} onChange={event => setDays(Number(event.target.value))} className="rounded-lg border bg-transparent px-2 text-xs"><option value={7}>7 dias</option><option value={14}>14 dias</option><option value={30}>30 dias</option></select></div><div className="h-[230px] w-full min-w-0">{hasProduction ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 12, right: 10, left: -25, bottom: 0 }}><defs><linearGradient id="sentinelProductionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#17a68e" stopOpacity={0.22} /><stop offset="100%" stopColor="#17a68e" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 5" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} minTickGap={24} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} /><Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, color: 'var(--text-primary)', fontSize: 12 }} /><Area type="monotone" dataKey="count" name="Propostas cadastradas" stroke="#17a68e" strokeWidth={2.5} fill="url(#sentinelProductionFill)" /></AreaChart></ResponsiveContainer> : <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-slate-500"><BarChart3 size={28} /><p>A produção aparecerá aqui quando houver propostas cadastradas.</p></div>}</div></section>
      <section className="sentinel-panel"><div className="sentinel-panel-heading"><div><h2>O que precisa de atenção</h2><p>Etapas com propostas além do SLA</p></div><AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" /></div>{priorities.length ? priorities.map(row => <button type="button" className="sentinel-priority" key={row.statusId} disabled={!canViewProposals} onClick={() => onNavigateToProductionWithFilter({ statusId: row.statusId })}><span className="sentinel-priority-icon"><Clock3 size={17} /></span><span className="flex-1 min-w-0"><strong className="truncate">{row.statusName}</strong><small>{row.overSlaCount} fora do prazo · {formatCurrency(row.totalValue)}</small></span><ArrowRight size={16} className="text-slate-400" /></button>) : <div className="py-9 text-center"><div className="sentinel-priority-icon mx-auto mb-3 w-fit"><ListChecks size={22} /></div><p className="text-sm font-semibold">{bottlenecks ? 'Nenhuma etapa acima do SLA' : 'Analisando a operação'}</p><p className="mt-2 text-xs text-slate-500">{bottlenecks ? 'Consulte a fila para acompanhar as próximas atividades.' : 'Os indicadores serão atualizados ao concluir a consulta.'}</p></div>}</section>
    </div>
    <div className="sentinel-dashboard-grid">
      <section className="sentinel-panel"><div className="sentinel-panel-heading"><div><h2>Continue seu trabalho</h2><p>Atalhos para os fluxos disponíveis no seu perfil</p></div></div><div className="grid gap-3 sm:grid-cols-2">{quickActions.map(action => <button type="button" key={action.path} className="sentinel-priority !rounded-xl !border !border-slate-200 !px-3 dark:!border-slate-800" onClick={() => onNavigate?.(action.path)}><span className="sentinel-priority-icon"><action.icon size={18} /></span><span className="flex-1 text-left"><strong>{action.label}</strong><small>{action.text}</small></span><ArrowUpRight size={15} /></button>)}{!quickActions.length && <p className="text-sm text-slate-500">Use o menu para acessar os fluxos liberados ao seu perfil.</p>}</div></section>
      <section className="sentinel-panel"><div className="sentinel-panel-heading"><div><h2>Carteira por banco</h2><p>Participação nas propostas em andamento</p></div></div>{bankDistribution.map(bank => <button key={bank.id} type="button" disabled={!canViewProposals} className="mb-4 block w-full text-left" onClick={() => onNavigateToProductionWithFilter({ bankId: bank.id })}><div className="mb-2 flex justify-between text-xs"><span>{bank.name}</span><span className="text-slate-500">{bank.count} · {active.length ? Math.round(bank.count / active.length * 100) : 0}%</span></div><div className="sentinel-progress"><span style={{ width: `${active.length ? bank.count / active.length * 100 : 0}%` }} /></div></button>)}{!bankDistribution.length && <p className="py-8 text-center text-xs text-slate-500">Nenhuma proposta ativa vinculada a bancos.</p>}</section>
    </div><p className="text-right text-[10px] text-slate-500">Indicadores da carteira disponível neste ambiente. O período selecionado se aplica ao gráfico.</p>
  </div>;
};
