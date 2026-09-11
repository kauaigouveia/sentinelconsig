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

export const SupportCenter: React.FC = () => {
  const proposals = StorageService.getProposals();
  const statuses = StorageService.getStatuses();
  const clients = StorageService.getClients();
  const partners = StorageService.getPartners();
  const banks = StorageService.getBanks();

  const [selectedAlçada, setSelectedAlçada] = useState<ResponsibleAlçada | ''>('');
  const [activeTab, setActiveTab] = useState<'PENDENCIAS' | 'TRAVADAS'>('PENDENCIAS');
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);

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
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Headphones className="h-5 w-5 text-blue-600" />
          <span>Central de Suporte Operacional</span>
        </h2>
        <p className="text-xs text-slate-500">
          Gerenciamento de pendências, propostas estagnadas na esteira e controle de alçadas
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-rose-700">Pendências Abertas</span>
          <p className="text-2xl font-black text-rose-800 mt-1">{allOpenPendencies.length}</p>
          <span className="text-[10px] text-rose-600">Requerem ação imediata</span>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-amber-700">Propostas Travadas (&gt;3d)</span>
          <p className="text-2xl font-black text-amber-800 mt-1">{stuckProposals.length}</p>
          <span className="text-[10px] text-amber-600">Sem movimentação recente</span>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-blue-700">Eficiência de SLA</span>
          <p className="text-2xl font-black text-blue-800 mt-1">94%</p>
          <span className="text-[10px] text-blue-600">No prazo estipulado</span>
        </div>
      </div>

      {/* Tabs & Content */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex border-b border-slate-200 gap-4 text-xs font-semibold text-slate-500">
          <button
            onClick={() => setActiveTab('PENDENCIAS')}
            className={`py-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'PENDENCIAS'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent hover:text-slate-800'
            }`}
          >
            Todas as Pendências Abertas ({allOpenPendencies.length})
          </button>
          <button
            onClick={() => setActiveTab('TRAVADAS')}
            className={`py-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'TRAVADAS'
                ? 'border-amber-600 text-amber-700 font-bold'
                : 'border-transparent hover:text-slate-800'
            }`}
          >
            Propostas Travadas &gt; 3 Dias ({stuckProposals.length})
          </button>
        </div>

        {activeTab === 'PENDENCIAS' ? (
          <div className="space-y-3">
            {allOpenPendencies.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-10">
                Nenhuma pendência aberta no momento.
              </p>
            ) : (
              allOpenPendencies.map(({ pendency, proposal }) => {
                const client = clients.find(c => c.id === proposal.clientId);
                const partner = partners.find(pt => pt.id === proposal.partnerId);

                return (
                  <div
                    key={pendency.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/30 p-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">
                          ADE {proposal.proposalNumber}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="font-semibold text-slate-800">{client?.fullName}</span>
                        <span className="text-slate-400">•</span>
                        <span className="rounded bg-rose-100 text-rose-800 px-2 py-0.5 font-bold text-[10px]">
                          {pendency.type}
                        </span>
                        <span className="text-slate-400 text-[10px]">
                          Aberta em {formatDate(pendency.openedAt)}
                        </span>
                      </div>
                      <p className="font-medium text-slate-800">{pendency.description}</p>
                      <p className="text-[11px] text-slate-500">
                        Parceiro: <strong>{partner?.login}</strong> (Cód: {partner ? extractPartnerCode(partner.login) : ''})
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setDetailProposalId(proposal.id)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Ver Proposta
                      </button>
                      <button
                        onClick={() => handleResolvePendency(pendency.id)}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs flex items-center gap-1"
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
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/30 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">
                        ADE {p.proposalNumber}
                      </span>
                      <span className="font-semibold text-slate-800">{client?.fullName}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: status?.color || '#64748b' }}
                      >
                        {status?.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900 font-semibold mt-1">
                      Parada há {diffDays} dias neste mesmo status (Alçada: {status?.responsible})
                    </p>
                  </div>

                  <button
                    onClick={() => setDetailProposalId(p.id)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
          onProposalUpdated={() => window.location.reload()}
        />
      )}
    </div>
  );
};
