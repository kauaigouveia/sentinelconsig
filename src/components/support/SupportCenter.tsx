import React, { useState } from 'react';
import {
  Headphones,
  AlertCircle,
  Clock,
  CheckCircle2,
  Filter,
  Shield,
  Eye,
  Check,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatDate, formatCpf, extractPartnerCode } from '../../lib/utils';
import { Proposal, ResponsibleAlçada, Pendency } from '../../types';
import { ProposalDetailModal } from '../production/ProposalDetailModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { StatusBadge } from '../ui/StatusBadge';

export const SupportCenter: React.FC = () => {
  const [proposals, setProposals] = useState<Proposal[]>(StorageService.getProposals());
  const statuses = StorageService.getStatuses();
  const clients = StorageService.getClients();
  const partners = StorageService.getPartners();
  const banks = StorageService.getBanks();

  const [selectedAlçada, setSelectedAlçada] = useState<ResponsibleAlçada | ''>('');
  const [activeTab, setActiveTab] = useState<'PENDENCIAS' | 'TRAVADAS'>('PENDENCIAS');
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);

  const refreshData = () => {
    setProposals(StorageService.getProposals());
  };

  // All open pendencies across all proposals
  const allOpenPendencies: { pendency: Pendency; proposal: Proposal }[] = [];
  proposals.forEach(p => {
    p.pendencies.forEach(pen => {
      if (pen.status === 'ABERTA') {
        allOpenPendencies.push({ pendency: pen, proposal: p });
      }
    });
  });

  // Proposals stuck in current status for > 3 days
  const now = new Date().getTime();
  const stuckProposals = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    if (s?.code === 'PAGO' || s?.code === 'CANCELADO' || s?.code === 'REPROVADO') return false;
    const diffDays = Math.floor((now - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 3;
  });

  const handleResolvePendency = (pendencyId: string) => {
    StorageService.resolvePendency(pendencyId, 'Resolvido via Central de Suporte');
    refreshData();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <ActionBar
        title="Central de Suporte Operacional"
        subtitle="Gerenciamento de pendências, propostas estagnadas na esteira e controle de alçadas"
        badgeText="HELP DESK & SLA"
        badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800"
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <MetricCard
          label="Pendências Abertas"
          value={allOpenPendencies.length}
          subtext="Requerem ação imediata"
          tone="danger"
          icon={<AlertCircle className="h-4 w-4 text-rose-600" />}
        />

        <MetricCard
          label="Propostas Travadas (>3d)"
          value={stuckProposals.length}
          subtext="Sem movimentação recente"
          tone="warning"
          icon={<Clock className="h-4 w-4 text-amber-600" />}
        />

        <MetricCard
          label="Eficiência de SLA"
          value="94%"
          subtext="No prazo estipulado"
          tone="primary"
          icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
        />
      </div>

      {/* Tabs & Content */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs space-y-4">
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <button
            onClick={() => setActiveTab('PENDENCIAS')}
            className={`py-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'PENDENCIAS'
                ? 'border-blue-600 text-blue-700 dark:text-blue-400 font-bold'
                : 'border-transparent hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Todas as Pendências Abertas ({allOpenPendencies.length})
          </button>
          <button
            onClick={() => setActiveTab('TRAVADAS')}
            className={`py-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'TRAVADAS'
                ? 'border-amber-600 text-amber-700 dark:text-amber-400 font-bold'
                : 'border-transparent hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Propostas Travadas &gt; 3 Dias ({stuckProposals.length})
          </button>
        </div>

        {activeTab === 'PENDENCIAS' ? (
          <div className="space-y-3">
            {allOpenPendencies.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic text-center py-10">
                Nenhuma pendência aberta no momento.
              </p>
            ) : (
              allOpenPendencies.map(({ pendency, proposal }) => {
                const client = clients.find(c => c.id === proposal.clientId);
                const partner = partners.find(pt => pt.id === proposal.partnerId);

                return (
                  <div
                    key={pendency.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-4 text-xs transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          ADE {proposal.proposalNumber}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{client?.fullName}</span>
                        <span className="text-slate-400">•</span>
                        <span className="rounded bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 px-2 py-0.5 font-bold text-[10px]">
                          {pendency.type}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                          Aberta em {formatDate(pendency.openedAt)}
                        </span>
                      </div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{pendency.description}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Parceiro: <strong>{partner?.login}</strong> (Cód: {partner ? extractPartnerCode(partner.login) : ''})
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setDetailProposalId(proposal.id)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        Ver Proposta
                      </button>
                      <button
                        onClick={() => handleResolvePendency(pendency.id)}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Resolver</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {stuckProposals.map(p => {
              const client = clients.find(c => c.id === p.clientId);
              const status = statuses.find(s => s.id === p.statusId);
              const diffDays = Math.floor((now - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24));

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-3 text-xs transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        ADE {p.proposalNumber}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{client?.fullName}</span>
                      <StatusBadge status={status} />
                    </div>
                    <p className="text-[11px] text-amber-900 dark:text-amber-300 font-semibold mt-1">
                      Parada há {diffDays} dias neste mesmo status (Alçada: {status?.responsible})
                    </p>
                  </div>

                  <button
                    onClick={() => setDetailProposalId(p.id)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    Ver Detalhes
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {detailProposalId && (
        <ProposalDetailModal
          proposalId={detailProposalId}
          onClose={() => setDetailProposalId(null)}
          onProposalUpdated={refreshData}
        />
      )}
    </div>
  );
};
