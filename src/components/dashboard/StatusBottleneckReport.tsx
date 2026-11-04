import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Building2,
  Users,
  Filter,
  ArrowRight,
  Download,
  HelpCircle,
  Eye,
  Layers,
  Sparkles,
  TrendingUp,
  BarChart3,
  Shield,
  Coins,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { AnalyticsApiService } from '../../services/analyticsApiService';
import { BottlenecksResponse, DwellTimeResponse } from '../../types/analytics';
import { Proposal, ProposalStatus, Alcada, Bank, Promoter } from '../../types';
import { formatDate, formatCpf, formatCurrency } from '../../lib/utils';
import { ProposalDetailModal } from '../production/ProposalDetailModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';

export const StatusBottleneckReport: React.FC = () => {
  const [backendBottlenecks, setBackendBottlenecks] = useState<BottlenecksResponse | null>(null);
  const [backendDwell, setBackendDwell] = useState<DwellTimeResponse | null>(null);

  useEffect(() => {
    let isMounted = true;
    AnalyticsApiService.fetchBottlenecks().then(data => {
      if (isMounted) setBackendBottlenecks(data);
    });
    AnalyticsApiService.fetchDwellTime().then(data => {
      if (isMounted) setBackendDwell(data);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const proposals = useMemo(() => StorageService.getProposals(), []);
  const statuses = useMemo(() => StorageService.getStatuses(), []);
  const history = useMemo(() => StorageService.getHistory(), []);
  const banks = useMemo(() => StorageService.getBanks(), []);
  const promoters = useMemo(() => StorageService.getPromoters(), []);
  const clients = useMemo(() => StorageService.getClients(), []);

  // Filter state
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [selectedAlçada, setSelectedAlçada] = useState<Alcada | ''>('');
  const [activeTab, setActiveTab] = useState<'ALCADA' | 'STATUS_LIST' | 'STUCK_PROPOSALS'>('ALCADA');
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);

  // Group dwell time by alçada
  const alcadaAnalysis = useMemo(() => {
    const map: Record<Alcada, { count: number; volume: number; stuckLonger: number }> = {
      CLIENTE: { count: 0, volume: 0, stuckLonger: 0 },
      PARCEIRO: { count: 0, volume: 0, stuckLonger: 0 },
      BANCO: { count: 0, volume: 0, stuckLonger: 0 },
      'NOSSA EQUIPE': { count: 0, volume: 0, stuckLonger: 0 },
      SISTEMA: { count: 0, volume: 0, stuckLonger: 0 },
    };

    const now = Date.now();

    proposals.forEach(p => {
      const st = statuses.find(s => s.id === p.statusId);
      if (!st) return;
      const alcada = st.responsibleGroup || st.responsible || 'NOSSA EQUIPE';
      if (!map[alcada]) return;

      map[alcada].count += 1;
      map[alcada].volume += p.disbursedValue || 0;

      const createdTime = new Date(p.createdAt).getTime();
      const hours = (now - createdTime) / (1000 * 3600);
      if (hours > (st.slaHours || 24)) {
        map[alcada].stuckLonger += 1;
      }
    });

    return map;
  }, [proposals, statuses]);

  // Bottleneck per status
  const statusAnalysis = useMemo(() => {
    return statuses.map(s => {
      const pList = proposals.filter(p => p.statusId === s.id);
      const count = pList.length;
      const volume = pList.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
      return {
        id: s.id,
        name: s.name,
        alcada: s.responsibleGroup || s.responsible,
        slaHours: s.slaHours || 24,
        colorHex: s.color || "var(--text-secondary)",
        count,
        volume,
      };
    }).filter(s => s.count > 0).sort((a, b) => b.volume - a.volume);
  }, [statuses, proposals]);

  // Stuck proposals (> SLA)
  const stuckProposals = useMemo(() => {
    const now = Date.now();
    return proposals.map(p => {
      const st = statuses.find(s => s.id === p.statusId);
      const client = clients.find(c => c.id === p.clientId);
      const bank = banks.find(b => b.id === p.bankId);
      const createdTime = new Date(p.createdAt).getTime();
      const dwellHours = Math.round((now - createdTime) / (1000 * 3600));
      const slaHours = st?.slaHours || 24;
      const isLate = dwellHours > slaHours;

      return {
        proposal: p,
        client,
        bank,
        status: st,
        dwellHours,
        slaHours,
        isLate,
      };
    }).filter(item => item.isLate && item.status?.code !== 'PAGO' && item.status?.code !== 'CANCELADO')
      .sort((a, b) => b.dwellHours - a.dwellHours);
  }, [proposals, statuses, clients, banks]);

  const totalVolumeTravado = backendBottlenecks?.summary?.totalValueStuck !== undefined
    ? backendBottlenecks.summary.totalValueStuck
    : proposals
        .filter(p => {
          const s = statuses.find(st => st.id === p.statusId);
          return s?.code !== 'PAGO' && s?.code !== 'CANCELADO';
        })
        .reduce((sum, p) => sum + (p.disbursedValue || 0), 0);

  const totalOverSlaCount = backendBottlenecks?.summary?.totalOverSla !== undefined
    ? backendBottlenecks.summary.totalOverSla
    : stuckProposals.length;

  return (
    <div className="space-y-6 p2-report-workspace">
      <ActionBar
        title="Gargalos & Tempo de Permanência na Esteira"
        subtitle="Mapeamento de retenção de propostas por alçada, tempo de permanência e identificação de gargalos de liquidação"
        badgeText="AUDITORIA DE TEMPO & FLUXO"
        badgeColor="bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]"
      />

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
        <div className="rounded-xl border border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] p-4  space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--warning-text)] dark:text-[var(--warning-text)] block font-sans">
            Volume em Andamento / Retenção
          </span>
          <p className="text-2xl font-black text-[var(--warning-text)] dark:text-[var(--warning-text)]">
            {formatCurrency(totalVolumeTravado)}
          </p>
          <span className="text-[11px] text-[var(--warning-text)] dark:text-[var(--warning-text)] font-bold block font-sans">
            Aguardando avanço na esteira
          </span>
        </div>

        <div className="rounded-xl border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-4  space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--danger-text)] dark:text-[var(--danger-text)] block font-sans">
            Propostas Fora do SLA
          </span>
          <p className="text-2xl font-black text-[var(--danger-text)] dark:text-[var(--danger-text)]">
            {totalOverSlaCount} propostas
          </p>
          <span className="text-[11px] text-[var(--danger-text)] dark:text-[var(--danger-text)] font-bold block font-sans">
            Excederam o tempo limite do status
          </span>
        </div>

        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4  space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] block font-sans">
            Status Mais Crítico
          </span>
          <p className="text-lg font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
            {statusAnalysis[0]?.name || 'Nenhum'}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)] block font-sans">
            {statusAnalysis[0]?.count || 0} propostas ({formatCurrency(statusAnalysis[0]?.volume || 0)})
          </span>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-xs font-bold gap-2 p2-analytics-tabs">
        <button
          onClick={() => setActiveTab('ALCADA')}
          className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ALCADA'
              ? 'border-[var(--warning-border)] text-[var(--warning-text)] dark:text-[var(--warning-text)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          Onde a Operação Para? (Por Alçada)
        </button>
        <button
          onClick={() => setActiveTab('STATUS_LIST')}
          className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'STATUS_LIST'
              ? 'border-[var(--warning-border)] text-[var(--warning-text)] dark:text-[var(--warning-text)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          Distribuição por Status
        </button>
        <button
          onClick={() => setActiveTab('STUCK_PROPOSALS')}
          className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'STUCK_PROPOSALS'
              ? 'border-[var(--warning-border)] text-[var(--warning-text)] dark:text-[var(--warning-text)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          Fila de Atenção Crítica ({stuckProposals.length})
        </button>
      </div>

      {/* TAB CONTENT 1: ALÇADA */}
      {activeTab === 'ALCADA' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['CLIENTE', 'PARCEIRO', 'BANCO', 'NOSSA EQUIPE'] as Alcada[]).map(alc => {
            const data = alcadaAnalysis[alc];
            const isNossaEquipe = alc === 'NOSSA EQUIPE';

            return (
              <div
                key={alc}
                className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-3"
              >
                <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-2.5">
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Alçada: {alc}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-mono">
                    {data.count} propostas
                  </span>
                </div>

                <div className="space-y-1 font-mono">
                  <span className="text-[10px] text-[var(--text-secondary)] uppercase block font-sans">Volume Retido</span>
                  <p className="text-lg font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    {formatCurrency(data.volume)}
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] text-xs flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Fora do SLA:</span>
                  <span className={`font-bold font-mono ${data.stuckLonger > 0 ? 'text-[var(--danger-text)] dark:text-[var(--danger-text)]' : 'text-[var(--success-text)] dark:text-[var(--success-text)]'}`}>
                    {data.stuckLonger} contratos
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB CONTENT 2: STATUS LIST */}
      {activeTab === 'STATUS_LIST' && (
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4  overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <tr>
                <th className="px-3.5 py-2.5">Status da Esteira</th>
                <th className="px-3.5 py-2.5">Alçada</th>
                <th className="px-3.5 py-2.5 font-mono text-center">Meta SLA</th>
                <th className="px-3.5 py-2.5 text-right font-mono">Propostas</th>
                <th className="px-3.5 py-2.5 text-right font-mono">Volume Total (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
              {statusAnalysis.map(s => (
                <tr key={s.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                  <td className="px-3.5 py-2.5">
                    <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.colorHex }} />
                      <span>{s.name}</span>
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-[var(--text-secondary)] font-bold">{s.alcada}</td>
                  <td className="px-3.5 py-2.5 text-center font-mono text-[var(--text-secondary)]">{s.slaHours}h</td>
                  <td className="px-3.5 py-2.5 text-right font-mono font-bold">{s.count}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    {formatCurrency(s.volume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB CONTENT 3: STUCK PROPOSALS */}
      {activeTab === 'STUCK_PROPOSALS' && (
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4  overflow-x-auto">
          {stuckProposals.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-secondary)] text-xs">
              Nenhuma proposta fora do prazo de SLA no momento. Esteira em conformidade!
            </div>
          ) : (
            <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                <tr>
                  <th className="px-3.5 py-2.5 font-mono">ADE / Proposta</th>
                  <th className="px-3.5 py-2.5">Cliente</th>
                  <th className="px-3.5 py-2.5">Banco</th>
                  <th className="px-3.5 py-2.5">Status Atual</th>
                  <th className="px-3.5 py-2.5 font-mono text-center">Tempo Parado</th>
                  <th className="px-3.5 py-2.5 text-right font-mono">Valor Liberado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
                {stuckProposals.map(item => (
                  <tr key={item.proposal.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                    <td className="px-3.5 py-2.5">
                      <button
                        onClick={() => setDetailProposalId(item.proposal.id)}
                        className="font-mono font-bold text-[var(--link)] dark:text-[var(--link)] hover:underline"
                      >
                        {item.proposal.proposalNumber}
                      </button>
                    </td>
                    <td className="px-3.5 py-2.5 text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold">{item.client?.fullName}</td>
                    <td className="px-3.5 py-2.5 text-[var(--text-secondary)]">{item.bank?.name}</td>
                    <td className="px-3.5 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]">
                        {item.status?.name}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)]">
                      {item.dwellHours}h (SLA: {item.slaHours}h)
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {formatCurrency(item.proposal.disbursedValue || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Proposal Detail Modal */}
      {detailProposalId && (
        <ProposalDetailModal
          proposalId={detailProposalId}
          onClose={() => setDetailProposalId(null)}
          onProposalUpdated={() => {
            // refresh trigger if needed
          }}
        />
      )}
    </div>
  );
};
