import { WorkspaceSections } from '../ui/WorkspaceSections';
import { PortabilityFinancialSummary } from './PortabilityFinancialSummary';
import { PORTABILITY_SITUATIONS, portabilitySituation, portabilitySegment, portabilityMonitoredValue, type PortabilitySegment, type PortabilitySituation } from '../../lib/portabilityMonitoring';
import React, { useState, useEffect } from 'react';
import {
  ArrowLeftRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Play,
  Link2,
  Calendar,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { AutomationService } from '../../services/automationService';
import { formatCpf, formatDate, extractPartnerCode, formatCurrency, isPortabilityProposal } from '../../lib/utils';
import { Proposal } from '../../types';
import { ProposalDetailModal } from './ProposalDetailModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { StatusBadge } from '../ui/StatusBadge';
import { EmptyState } from '../ui/EmptyState';

export const PortabilityView: React.FC<{ premium?: boolean }> = ({ premium = false }) => {
  const getPortabilityProposals = (): Proposal[] => {
    const products = StorageService.getProducts();
    const all = StorageService.getProposals();
    return all.filter(proposal => isPortabilityProposal(proposal, products));
  };

  const [proposals, setProposals] = useState<Proposal[]>(getPortabilityProposals);
  const products = StorageService.getProducts();
  const clients = StorageService.getClients();
  const banks = StorageService.getBanks();
  const promoters = StorageService.getPromoters();
  const partners = StorageService.getPartners();
  const statuses = StorageService.getStatuses();
  const holidays = StorageService.getHolidays();
  const config = StorageService.getConfig();

  const [activeTab, setActiveTab] = useState<'TODAS' | 'EM_PRAZO' | '5_DIA' | 'ATRASADAS' | 'SALDO_RETORNADO'>('TODAS');
  const [financialFilter, setFinancialFilter] = useState<{segment: PortabilitySegment; situation: PortabilitySituation} | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [cronFeedback, setCronFeedback] = useState<string | null>(null);

  const refreshData = () => {
    setProposals(getPortabilityProposals());
  };

  useEffect(() => {
    refreshData();
    window.addEventListener('credit_gestao_storage_update', refreshData);
    return () => window.removeEventListener('credit_gestao_storage_update', refreshData);
  }, []);

  const handleRunCron = async () => {
    setCronFeedback('Executando cron server-side de CIP...');
    const res = await AutomationService.runPortabilityCron();
    setCronFeedback(
      res.success === false
        ? res.details.join(' ') || 'Não foi possível verificar as portabilidades.'
        : `Verificação concluída: ${res.checkedCount} propostas verificadas | ${res.saldoRetornadoCount} retornos de saldo registrados.`
    );
    refreshData();
    setTimeout(() => setCronFeedback(null), 5000);
  };

  // Classify proposals
  const classified = proposals.map(p => {
    const sla = AutomationService.getPortabilitySlaInfo(p);
    const status = (p as any).status || statuses.find(s => s.id === p.statusId || s.code === (p as any).status?.code);
    return {
      proposal: p,
      sla,
      status,
      segment: portabilitySegment(p, products)!,
      situation: portabilitySituation(p, status),
    };
  });

  const emPrazo = classified.filter(
    c => c.status?.code === 'AGUARDAR_RETORNO_CIP' && c.sla.businessDays < (c.sla.targetDays - 1)
  );
  const no5Dia = classified.filter(
    c => c.status?.code === 'AGUARDAR_RETORNO_CIP' && (c.sla.businessDays === c.sla.targetDays || c.sla.businessDays === c.sla.targetDays - 1)
  );
  const atrasadas = classified.filter(
    c => c.status?.code === 'AGUARDAR_RETORNO_CIP' && c.sla.businessDays > c.sla.targetDays
  );
  const saldoRetornado = classified.filter(
    c => c.status?.code === 'SALDO_RETORNADO'
  );

  const openRows = classified.filter(row => ['ANDAMENTO', 'PENDENTE'].includes(row.situation));
  const totalSaldoPortabilidade = openRows.filter(row => row.segment === 'SALDO').reduce((acc, row) => acc + (portabilityMonitoredValue(row.proposal, 'SALDO') ?? 0), 0);
  const totalTrocoPortabilidade = openRows.filter(row => row.segment === 'TROCO').reduce((acc, row) => acc + (portabilityMonitoredValue(row.proposal, 'TROCO') ?? 0), 0);

  const slaList =
    activeTab === 'TODAS'
      ? classified
      : activeTab === 'EM_PRAZO'
      ? emPrazo
      : activeTab === '5_DIA'
      ? no5Dia
      : activeTab === 'ATRASADAS'
      ? atrasadas
      : saldoRetornado;

  const currentList = financialFilter ? slaList.filter(row => row.segment === financialFilter.segment && row.situation === financialFilter.situation) : slaList;

  return (
    <div className={`space-y-4 ${premium ? 'p2-live-module p2-live-cip' : ''}`}>
      {/* Action Bar */}
      <ActionBar
        title="Portabilidade (CIP)"
        subtitle="Acompanhamento do SLA de 5 dias úteis, retenções e saldos retornados"
        count={classified.length}
        financialTotal={formatCurrency(totalSaldoPortabilidade)}
        rightActions={
          <button
            onClick={handleRunCron}
            className="flex items-center gap-1.5 rounded-md bg-[var(--success-bg)] hover:bg-[var(--success-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--success-text)]  transition-colors cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Consultar Retornos de Saldo CIP</span>
          </button>
        }
      />

      {/* Financial Summary Banner */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${premium ? 'p2-cip-totals' : ''}`}>
        <MetricCard
          title="Saldo de portabilidade em aberto"
          value={formatCurrency(totalSaldoPortabilidade)}
          subtitle="Portabilidades em andamento ou pendentes; não inclui refinanciamentos"
          tone="info"
        />
        <MetricCard
          title="Troco de refinanciamento em aberto"
          value={formatCurrency(totalTrocoPortabilidade)}
          subtitle="Troco dos refinanciamentos da portabilidade em andamento ou pendentes"
          tone="success"
        />
      </div>

      <PortabilityFinancialSummary rows={classified} selected={financialFilter} onSelect={(segment,situation)=>{setActiveTab('TODAS');setFinancialFilter(current=>current?.segment===segment&&current.situation===situation?null:{segment,situation});}}/>

      {/* Cron Feedback Banner */}
      {cronFeedback && (
        <div className="rounded-lg border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] p-3 text-xs text-[var(--success-text)] dark:text-[var(--success-text)] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] shrink-0" />
          <span>{cronFeedback}</span>
        </div>
      )}

      <WorkspaceSections label="Filas de portabilidade" value={financialFilter ? '' : activeTab} onChange={id => {setFinancialFilter(null);setActiveTab(id as typeof activeTab);}} items={[
        {id: 'TODAS', title: 'Todas', description: 'Visão completa das portabilidades.', icon: <ArrowLeftRight size={22}/>, count: classified.length},
        {id: 'EM_PRAZO', title: 'Em prazo', description: 'Operações entre o 1º e o 3º dia útil.', icon: <Clock size={22}/>, count: emPrazo.length},
        {id: '5_DIA', title: 'No 4º ou 5º dia', description: 'Acompanhe o prazo de retorno.', icon: <Calendar size={22}/>, count: no5Dia.length},
        {id: 'ATRASADAS', title: 'Atrasadas', description: 'Prazo acima de 5 dias úteis.', icon: <AlertTriangle size={22}/>, count: atrasadas.length},
        {id: 'SALDO_RETORNADO', title: 'Saldo retornado', description: 'Continue as operações com retorno.', icon: <CheckCircle2 size={22}/>, count: saldoRetornado.length},
      ]}/>
      {financialFilter && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--field-border)] bg-[var(--info-bg)] p-3 text-sm dark:border-[var(--field-border)] dark:bg-[var(--info-bg)]"><span>{financialFilter.segment==='SALDO'?'Saldo de portabilidade':'Troco do refinanciamento'} · {PORTABILITY_SITUATIONS.find(item=>item.key===financialFilter.situation)?.label} · {currentList.length} proposta(s)</span><button type="button" onClick={()=>{setFinancialFilter(null);setActiveTab('TODAS');}} className="rounded-lg border px-3 py-2 font-semibold">Limpar filtro financeiro</button></div>}

      {/* Table */}
      <div className={`overflow-hidden rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  ${premium ? 'p2-cip-results' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <tr>
                <th className="px-4 py-3">ADE / Proposta</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">CPF</th>
                <th className="px-4 py-3">Banco / Promotora</th>
                <th className="px-4 py-3">Parceiro</th>
                <th className="px-4 py-3">Valores</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">SLA Dias Úteis (Meta: 5d)</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
              {currentList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-medium">
                    Nenhuma portabilidade nesta categoria.
                  </td>
                </tr>
              ) : (
                currentList.map(({ proposal: p, sla, status }) => {
                  const client = clients.find(c => c.id === p.clientId);
                  const bank = banks.find(b => b.id === p.bankId);
                  const promoter = promoters.find(pr => pr.id === p.promoterId);
                  const partner = partners.find(pt => pt.id === p.partnerId);

                  return (
                    <tr key={p.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors">
                      <td className="px-4 py-3 font-mono font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        ADE {p.proposalNumber}
                        <span className="mt-1 block text-[10px] font-normal text-[var(--text-secondary)]">{portabilitySegment(p,products)==='SALDO'?'Portabilidade':'Refinanciamento da portabilidade'}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {client?.fullName}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                        {formatCpf(client?.cpf || '')}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium">
                        {bank?.name} / <span className="text-[var(--text-secondary)]">{promoter?.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-[var(--link)] dark:text-[var(--link)]">
                          {partner?.login || ''}
                        </span>
                        <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-[10px] block truncate max-w-[120px]">
                          {partner?.login}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {portabilitySegment(p,products)==='SALDO' && portabilityMonitoredValue(p,'SALDO')!==null ? (
                          <span className="text-[11px] font-mono font-black text-[var(--link)] dark:text-[var(--link)] block">
                            Saldo: {formatCurrency(portabilityMonitoredValue(p,'SALDO') ?? 0)}
                          </span>
                        ) : null}
                        {portabilitySegment(p,products)==='TROCO' && portabilityMonitoredValue(p,'TROCO')!==null ? (
                          <span className="text-[10px] font-mono font-bold text-[var(--success-text)] dark:text-[var(--success-text)] block">
                            Troco: {formatCurrency(portabilityMonitoredValue(p,'TROCO') ?? 0)}
                          </span>
                        ) : null}
                        {portabilityMonitoredValue(p,portabilitySegment(p,products)!)===null && (
                          <span className="text-[var(--text-secondary)] text-[10px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        {status?.code === 'AGUARDAR_RETORNO_CIP' ? (
                          <div>
                            <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                              <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                                {sla.businessDays} / {sla.targetDays} dias úteis
                              </span>
                              <span
                                className={`font-black text-[10px] px-1.5 py-0.5 rounded ${
                                  sla.statusBadge === 'ESTOURADO'
                                    ? 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] dark:border-[var(--danger-border)]'
                                    : sla.statusBadge === 'URGENTE'
                                    ? 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]'
                                    : 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)]'
                                }`}
                              >
                                {sla.statusBadge}
                              </span>
                            </div>
                            <div className="w-full bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full ${
                                  sla.statusBadge === 'ESTOURADO'
                                    ? 'bg-[var(--danger-bg)]'
                                    : sla.statusBadge === 'URGENTE'
                                    ? 'bg-[var(--warning-bg)]'
                                    : 'bg-[var(--success-bg)]'
                                }`}
                                style={{ width: `${sla.progressPercent}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--text-secondary)] italic">
                            Fora de contagem CIP
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedProposalId(p.id)}
                          className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--link)] rounded hover:bg-[var(--bg-surface-elevated)]"
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProposalId && (
        <ProposalDetailModal
          proposalId={selectedProposalId}
          onClose={() => setSelectedProposalId(null)}
          onProposalUpdated={refreshData}
        />
      )}
    </div>
  );
};
