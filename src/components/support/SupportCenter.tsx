import React, { useCallback, useEffect, useState } from 'react';
import {
  Headphones,
  AlertCircle,
  Clock,
  CheckCircle2,
  Check,
  X,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatDate } from '../../lib/utils';
import { Proposal } from '../../types';
import { ProposalDetailModal } from '../production/ProposalDetailModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { StatusBadge } from '../ui/StatusBadge';
import { hasPermission } from '../../lib/permissions';

interface SupportPendency {
  id: string;
  title: string;
  type: string;
  description?: string | null;
  status: string;
  createdAt: string;
  proposalId?: string | null;
  proposal?: {
    id: string;
    proposalNumber: string;
    client?: { fullName?: string; cpf?: string } | null;
    status?: { name: string; finalStatus?: boolean } | null;
  } | null;
  partner?: { name?: string; code?: string } | null;
}

export const SupportCenter: React.FC = () => {
  const [proposals, setProposals] = useState<Proposal[]>(StorageService.getProposals());
  const statuses = StorageService.getStatuses();
  const clients = StorageService.getClients();
  const activeUser = StorageService.getActiveUser();
  const canResolvePendencies = hasPermission(activeUser?.role, activeUser?.customPermissions, 'pendencies.resolve');
  const [activeTab, setActiveTab] = useState<'PENDENCIAS' | 'TRAVADAS'>('PENDENCIAS');
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);
  const [pendencies, setPendencies] = useState<SupportPendency[]>([]);
  const [pendenciesTotal, setPendenciesTotal] = useState(0);
  const [isLoadingPendencies, setIsLoadingPendencies] = useState(true);
  const [pendenciesError, setPendenciesError] = useState<string | null>(null);
  const [resolvingPendency, setResolvingPendency] = useState<SupportPendency | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const refreshData = useCallback(() => {
    setProposals(StorageService.getProposals());
  }, []);

  const fetchPendencies = useCallback(async () => {
    setIsLoadingPendencies(true);
    setPendenciesError(null);
    try {
      const allItems: SupportPendency[] = [];
      let total = 0;
      let page = 1;
      do {
        const response = await fetch(`/api/pendencies?status=ABERTA&page=${page}&limit=100`, { credentials: 'include' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as pendências.');
        if (!Array.isArray(payload.items)) throw new Error('A API retornou uma lista de pendências inválida.');
        allItems.push(...payload.items);
        total = Number(payload.total) || allItems.length;
        page += 1;
      } while (allItems.length < total && page <= 50);

      setPendencies(allItems);
      setPendenciesTotal(total);
    } catch (error) {
      setPendenciesError(error instanceof Error ? error.message : 'Não foi possível carregar as pendências.');
    } finally {
      setIsLoadingPendencies(false);
    }
  }, []);

  useEffect(() => {
    void fetchPendencies();
    refreshData();
    window.addEventListener('credit_gestao_storage_update', refreshData);
    window.addEventListener('tenantUpdated', refreshData);
    return () => {
      window.removeEventListener('credit_gestao_storage_update', refreshData);
      window.removeEventListener('tenantUpdated', refreshData);
    };
  }, [fetchPendencies, refreshData]);

  const allOpenPendencies = pendencies.filter(pendency => pendency.status === 'ABERTA');

  // Proposals stuck in current status for > 3 days
  const now = new Date().getTime();
  const stuckProposals = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    if (s?.finalStatus || s?.code === 'PAGO' || s?.code === 'CANCELADO' || s?.code === 'REPROVADO') return false;
    const diffDays = Math.floor((now - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 3;
  });

  const slaEligibleProposals = proposals.filter(proposal => {
    const status = statuses.find(item => item.id === proposal.statusId);
    return !status?.finalStatus && Number(status?.slaHours) > 0;
  });
  const proposalsWithinSla = slaEligibleProposals.filter(proposal => {
    const status = statuses.find(item => item.id === proposal.statusId);
    return now - new Date(proposal.updatedAt).getTime() <= Number(status?.slaHours) * 60 * 60 * 1000;
  }).length;
  const slaEfficiency = slaEligibleProposals.length
    ? `${Math.round((proposalsWithinSla / slaEligibleProposals.length) * 100)}%`
    : '—';

  const handleResolvePendency = async () => {
    if (!resolvingPendency || !canResolvePendencies || resolutionNotes.trim().length < 3 || isResolving) return;
    setIsResolving(true);
    try {
      const response = await fetch(`/api/pendencies/${encodeURIComponent(resolvingPendency.id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: resolutionNotes.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível resolver a pendência.');
      setResolvingPendency(null);
      setResolutionNotes('');
      await fetchPendencies();
    } catch (error) {
      setPendenciesError(error instanceof Error ? error.message : 'Não foi possível resolver a pendência.');
    } finally {
      setIsResolving(false);
    }
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
          value={isLoadingPendencies ? '…' : pendenciesTotal}
          subtext={pendenciesError ? 'Falha ao sincronizar' : 'Dados atuais do servidor'}
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
          value={slaEfficiency}
          subtext={slaEligibleProposals.length ? `${proposalsWithinSla} de ${slaEligibleProposals.length} propostas dentro do SLA` : 'Sem propostas com SLA configurado'}
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
            {pendenciesError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
                <p>{pendenciesError}</p>
                <button type="button" onClick={() => void fetchPendencies()} className="mt-2 inline-flex items-center gap-1.5 font-bold underline underline-offset-2">
                  <RefreshCw className="h-3 w-3" /> Tentar novamente
                </button>
              </div>
            ) : isLoadingPendencies ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando pendências...
              </div>
            ) : allOpenPendencies.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic text-center py-10">
                Nenhuma pendência aberta no momento.
              </p>
            ) : (
              allOpenPendencies.map(pendency => {
                const proposalId = pendency.proposal?.id || pendency.proposalId;
                return (
                  <div
                    key={pendency.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-4 text-xs transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {pendency.proposal?.proposalNumber ? `ADE ${pendency.proposal.proposalNumber}` : pendency.title}
                        </span>
                        {pendency.proposal?.client?.fullName && <><span className="text-slate-400">•</span><span className="font-semibold text-slate-800 dark:text-slate-200">{pendency.proposal.client.fullName}</span></>}
                        <span className="text-slate-400">•</span>
                        <span className="rounded bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 px-2 py-0.5 font-bold text-[10px]">
                          {pendency.type}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                          Aberta em {formatDate(pendency.createdAt)}
                        </span>
                      </div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{pendency.description || pendency.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Parceiro: <strong>{pendency.partner?.code || pendency.partner?.name || 'Não vinculado'}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {proposalId && <button
                        onClick={() => setDetailProposalId(proposalId)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        Ver Proposta
                      </button>}
                      {canResolvePendencies && <button
                        onClick={() => {
                          setResolvingPendency(pendency);
                          setResolutionNotes('');
                        }}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Resolver</span>
                      </button>}
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

      {resolvingPendency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="presentation">
          <form onSubmit={event => { event.preventDefault(); void handleResolvePendency(); }} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="resolve-pendency-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="resolve-pendency-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">Registrar resolução</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Informe o que foi feito antes de concluir “{resolvingPendency.title}”.</p>
              </div>
              <button type="button" onClick={() => setResolvingPendency(null)} disabled={isResolving} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={resolutionNotes}
              onChange={event => setResolutionNotes(event.target.value)}
              rows={4}
              minLength={3}
              required
              placeholder="Descreva a solução aplicada..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResolvingPendency(null)} disabled={isResolving} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancelar</button>
              <button type="submit" disabled={isResolving || resolutionNotes.trim().length < 3} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                {isResolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {isResolving ? 'Salvando...' : 'Confirmar resolução'}
              </button>
            </div>
          </form>
        </div>
      )}

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
