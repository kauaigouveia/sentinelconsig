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
        colorHex: s.color || '#3b82f6',
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
        badgeColor="bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800"
      />

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-4 shadow-2xs space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 block font-sans">
            Volume em Andamento / Retenção
          </span>
          <p className="text-2xl font-black text-amber-950 dark:text-amber-200">
            {formatCurrency(totalVolumeTravado)}
          </p>
          <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold block font-sans">
            Aguardando avanço na esteira
          </span>
        </div>

        <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-4 shadow-2xs space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-300 block font-sans">
            Propostas Fora do SLA
          </span>
          <p className="text-2xl font-black text-rose-950 dark:text-rose-200">
            {totalOverSlaCount} propostas
          </p>
          <span className="text-[11px] text-rose-700 dark:text-rose-400 font-bold block font-sans">
            Excederam o tempo limite do status
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block font-sans">
            Status Mais Crítico
          </span>
          <p className="text-lg font-black text-slate-900 dark:text-white truncate">
            {statusAnalysis[0]?.name || 'Nenhum'}
          </p>
          <span className="text-[11px] text-slate-500 block font-sans">
            {statusAnalysis[0]?.count || 0} propostas ({formatCurrency(statusAnalysis[0]?.volume || 0)})
          </span>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-bold gap-2 p2-analytics-tabs">
        <button
          onClick={() => setActiveTab('ALCADA')}
          className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ALCADA'
              ? 'border-amber-600 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Onde a Operação Para? (Por Alçada)
        </button>
        <button
          onClick={() => setActiveTab('STATUS_LIST')}
          className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'STATUS_LIST'
              ? 'border-amber-600 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Distribuição por Status
        </button>
        <button
          onClick={() => setActiveTab('STUCK_PROPOSALS')}
          className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'STUCK_PROPOSALS'
              ? 'border-amber-600 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Alçada: {alc}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                    {data.count} propostas
                  </span>
                </div>

                <div className="space-y-1 font-mono">
                  <span className="text-[10px] text-slate-400 uppercase block font-sans">Volume Retido</span>
                  <p className="text-lg font-black text-slate-900 dark:text-white">
                    {formatCurrency(data.volume)}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between">
                  <span className="text-slate-500">Fora do SLA:</span>
                  <span className={`font-bold font-mono ${data.stuckLonger > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
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
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3.5 py-2.5">Status da Esteira</th>
                <th className="px-3.5 py-2.5">Alçada</th>
                <th className="px-3.5 py-2.5 font-mono text-center">Meta SLA</th>
                <th className="px-3.5 py-2.5 text-right font-mono">Propostas</th>
                <th className="px-3.5 py-2.5 text-right font-mono">Volume Total (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
              {statusAnalysis.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-3.5 py-2.5">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.colorHex }} />
                      <span>{s.name}</span>
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-slate-500 font-bold">{s.alcada}</td>
                  <td className="px-3.5 py-2.5 text-center font-mono text-slate-500">{s.slaHours}h</td>
                  <td className="px-3.5 py-2.5 text-right font-mono font-bold">{s.count}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
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
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs overflow-x-auto">
          {stuckProposals.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Nenhuma proposta fora do prazo de SLA no momento. Esteira em conformidade!
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3.5 py-2.5 font-mono">ADE / Proposta</th>
                  <th className="px-3.5 py-2.5">Cliente</th>
                  <th className="px-3.5 py-2.5">Banco</th>
                  <th className="px-3.5 py-2.5">Status Atual</th>
                  <th className="px-3.5 py-2.5 font-mono text-center">Tempo Parado</th>
                  <th className="px-3.5 py-2.5 text-right font-mono">Valor Liberado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                {stuckProposals.map(item => (
                  <tr key={item.proposal.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-3.5 py-2.5">
                      <button
                        onClick={() => setDetailProposalId(item.proposal.id)}
                        className="font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {item.proposal.proposalNumber}
                      </button>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-900 dark:text-white font-bold">{item.client?.fullName}</td>
                    <td className="px-3.5 py-2.5 text-slate-500">{item.bank?.name}</td>
                    <td className="px-3.5 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {item.status?.name}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                      {item.dwellHours}h (SLA: {item.slaHours}h)
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
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
