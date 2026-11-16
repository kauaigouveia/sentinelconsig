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
        <div className="h-8 w-8 border-3 border-[var(--field-border)] border-t-[var(--focus)] rounded-full animate-spin" />
        <span className="text-xs text-[var(--text-secondary)] font-medium">Carregando painel do parceiro...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)] text-xs flex flex-col items-center justify-center space-y-3">
        <p>{error || 'Não foi possível carregar os dados.'}</p>
        <button
          onClick={fetchDashboard}
          className="px-3 py-1.5 rounded-lg bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] text-[var(--danger-text)] font-bold"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  const { metrics, recentProposals, partner } = data;

  return <div className="wb-home wb-partner-home">
    <header className="wb-day-heading"><span>Portal do parceiro · visão da sua carteira</span><button type="button" className="wb-quiet-button" onClick={() => void fetchDashboard()} aria-label="Atualizar painel"><RefreshCw size={15}/>Atualizar dados</button></header>
    <section className="wb-introduction"><div><span className="wb-eyebrow">SEU ESPAÇO</span><h1>Olá, {partner.name.split(' ')[0]}.</h1><p>Sua próxima proposta começa por aqui.</p><div className="wb-introduction-actions"><button type="button" className="wb-primary" onClick={() => onNavigate('simulacoes')}>Fazer uma simulação<ArrowRight size={17}/></button><button type="button" className="wb-secondary" onClick={() => onNavigate('propostas')}>Consultar minhas propostas</button></div></div><div className="wb-partner-balance"><span>VOLUME LIBERADO</span><strong>{formatCurrency(metrics.totalDisbursed)}</strong><small>Valores disponíveis nos registros da sua carteira.</small></div></section>
    <nav className="wb-partner-counters" aria-label="Situações das minhas propostas">{[
      {label:'Em andamento', count:metrics.inProgressCount, category:'ESTEIRA'},
      {label:'Com pendência', count:metrics.pendingCount, category:'PENDENTE'},
      {label:'Concluídas', count:metrics.completedCount, category:'PAGO'},
    ].map(item => <button type="button" key={item.category} onClick={() => onNavigate('propostas',{standardCategory:item.category})}><strong>{item.count}</strong><span>{item.label}</span><ArrowRight size={14}/></button>)}</nav>
    <div className="wb-home-columns"><section className="wb-activity"><header><div><span className="wb-eyebrow">ACOMPANHAMENTO</span><h2>Últimas movimentações</h2></div><button type="button" className="wb-text-link" onClick={() => onNavigate('propostas')}>Ver todas<ArrowRight size={15}/></button></header><div className="wb-activity-list">{recentProposals.map(proposal => <article key={proposal.id}><div className="wb-initials" aria-hidden="true">{proposal.clientName?.slice(0,1) || '#'}</div><div className="wb-activity-person"><button type="button" onClick={() => onSelectProposal(proposal.id)}>{proposal.clientName || 'Cliente não informado'}</button><span>#{proposal.proposalNumber} · {proposal.bankName}</span></div><span className="wb-status">{proposal.statusName}</span><strong>{formatCurrency(proposal.releasedValue)}</strong><button type="button" className="wb-open-record" aria-label={`Abrir proposta ${proposal.proposalNumber}`} onClick={() => onSelectProposal(proposal.id)}><ArrowRight size={17}/></button></article>)}{!recentProposals.length && <div className="wb-empty"><FileSpreadsheet size={30}/><h3>Sua carteira começa aqui.</h3><p>As movimentações das suas propostas aparecerão nesta área.</p></div>}</div><footer>{metrics.totalProposals} propostas · Valor de contratos {formatCurrency(metrics.totalContract)}</footer></section>
    <aside className="wb-day-tools"><section><span className="wb-eyebrow">PRÓXIMOS PASSOS</span><h2>Continue seu trabalho</h2><div className="wb-shortcuts"><button type="button" onClick={() => onNavigate('propostas',{standardCategory:'PENDENTE'})}><AlertTriangle size={20}/><span><strong>Conferir pendências</strong><small>{metrics.pendingCount} propostas na sua carteira</small></span><ArrowRight size={15}/></button><button type="button" onClick={() => onNavigate('propostas',{waitingReturnOnly:true})}><Clock size={20}/><span><strong>Acompanhar retorno</strong><small>{metrics.waitingReturnCount} propostas aguardando CIP</small></span><ArrowRight size={15}/></button><button type="button" onClick={() => onNavigate('atendimento')}><MessageSquare size={20}/><span><strong>Conversar com a mesa</strong><small>Envie uma dúvida sobre sua operação</small></span><ArrowRight size={15}/></button></div></section></aside></div>
  </div>;
};
