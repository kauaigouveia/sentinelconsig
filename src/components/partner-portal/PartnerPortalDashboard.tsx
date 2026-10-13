import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  MessageSquare,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Search,
} from 'lucide-react';
import { PartnerDashboardData, PartnerPortalClient } from '../../services/partnerPortalClient';
import { formatCurrency } from '../../lib/utils';

interface PartnerPortalDashboardProps {
  onNavigate: (tab: string, params?: any) => void;
  onSelectProposal: (proposalId: string) => void;
}

export const PartnerPortalDashboard: React.FC<PartnerPortalDashboardProps> = ({
  onNavigate,
  onSelectProposal,
}) => {
  const [data, setData] = useState<PartnerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await PartnerPortalClient.getDashboard();
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar indicadores do portal.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3">
        <div className="h-8 w-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-medium">Carregando painel do parceiro...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs flex flex-col items-center justify-center space-y-3">
        <p>{error || 'Não foi possível carregar os dados.'}</p>
        <button
          onClick={fetchDashboard}
          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  const { metrics, recentProposals, partner } = data;

  return <div className="space-y-5">
    <div className="sentinel-heading"><div><div className="sentinel-eyebrow">Seu negócio, conectado</div><h1>Vamos seguir em frente, {partner.name.split(' ')[0]}.</h1><p>Acompanhe suas propostas e converse com a mesa em um só lugar.</p></div><div className="flex gap-2"><button type="button" className="sentinel-secondary-button" onClick={() => void fetchDashboard()} aria-label="Atualizar painel"><RefreshCw size={15} /></button><button type="button" className="sentinel-primary-button" onClick={() => onNavigate('simulacoes')}>Nova simulação<ArrowRight size={16} /></button></div></div>
    <div className="sentinel-kpi-grid">
      <div className="sentinel-kpi sentinel-kpi--featured"><div><span>Volume liberado</span><DollarSign size={18} /></div><strong>{formatCurrency(metrics.totalDisbursed)}</strong><small>Valores retornados para sua carteira</small></div>
      <button type="button" className="sentinel-kpi" onClick={() => onNavigate('propostas', { standardCategory: 'ESTEIRA' })}><div><span>Em andamento</span><Clock size={18} /></div><strong>{metrics.inProgressCount}</strong><small>Acompanhe as próximas etapas</small></button>
      <button type="button" className="sentinel-kpi" onClick={() => onNavigate('propostas', { standardCategory: 'PENDENTE' })}><div><span>Precisam de atenção</span><AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" /></div><strong>{metrics.pendingCount}</strong><small>Propostas com pendências</small></button>
      <button type="button" className="sentinel-kpi" onClick={() => onNavigate('propostas', { standardCategory: 'PAGO' })}><div><span>Concluídas</span><CheckCircle2 size={18} /></div><strong>{metrics.completedCount}</strong><small>Confira as propostas finalizadas</small></button>
    </div>
    <div className="sentinel-dashboard-grid">
      <section className="sentinel-panel !p-0 overflow-hidden"><div className="sentinel-panel-heading !mb-0 border-b border-slate-200 px-6 py-5 dark:border-slate-800"><div><h2>Últimas movimentações</h2><p>As atualizações mais recentes das suas propostas</p></div><button type="button" className="text-xs text-teal-700 dark:text-teal-300" onClick={() => onNavigate('propostas')}>Ver todas</button></div><div className="overflow-x-auto"><table><thead><tr><th className="px-6 text-left">Proposta / cliente</th><th className="px-3 text-left">Banco</th><th className="px-3 text-right">Valor liberado</th><th className="px-6 text-left">Status</th></tr></thead><tbody>{recentProposals.map(proposal => <tr key={proposal.id}><td className="px-6"><button type="button" className="text-left" onClick={() => onSelectProposal(proposal.id)}><strong className="text-teal-700 dark:text-teal-300">#{proposal.proposalNumber}</strong><span className="mt-1 block max-w-[220px] truncate text-xs text-slate-500">{proposal.clientName}</span></button></td><td className="px-3 text-xs">{proposal.bankName}</td><td className="px-3 text-right font-semibold">{formatCurrency(proposal.releasedValue)}</td><td className="px-6"><span className="inline-flex rounded-lg border border-slate-200 px-2 py-1 text-[10px] dark:border-slate-700" style={{ borderLeftColor: proposal.statusColor || '#087d74', borderLeftWidth: 3 }}>{proposal.statusName}</span></td></tr>)}{!recentProposals.length && <tr><td colSpan={4} className="!py-12 text-center text-slate-500">Suas propostas aparecerão aqui quando forem cadastradas.</td></tr>}</tbody></table></div></section>
      <section className="sentinel-panel"><div className="sentinel-panel-heading"><div><h2>Seus próximos passos</h2><p>Continue de onde você parou</p></div></div><button type="button" className="sentinel-priority" onClick={() => onNavigate('propostas', { standardCategory: 'PENDENTE' })}><span className="sentinel-priority-icon"><AlertTriangle size={18} /></span><span className="flex-1"><strong>Regularizar pendências</strong><small>{metrics.pendingCount} propostas aguardam atenção</small></span><ArrowRight size={15} /></button><button type="button" className="sentinel-priority" onClick={() => onNavigate('propostas', { waitingReturnOnly: true })}><span className="sentinel-priority-icon"><Clock size={18} /></span><span className="flex-1"><strong>Acompanhar retorno</strong><small>{metrics.waitingReturnCount} em processamento CIP</small></span><ArrowRight size={15} /></button><button type="button" className="sentinel-priority" onClick={() => onNavigate('atendimento')}><span className="sentinel-priority-icon"><MessageSquare size={18} /></span><span className="flex-1"><strong>Falar com a mesa</strong><small>Envie sua dúvida pelo atendimento</small></span><ArrowRight size={15} /></button><div className="mt-6 rounded-xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-[10px] text-slate-500">Sua carteira de propostas</p><p className="mt-2 text-lg font-semibold">{metrics.totalProposals} propostas</p><p className="mt-1 text-xs text-slate-500">Contratos: {formatCurrency(metrics.totalContract)}</p></div></section>
    </div>
  </div>;
};
