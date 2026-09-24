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
import { formatCpf, formatDate, extractPartnerCode, formatCurrency } from '../../lib/utils';
import { Proposal } from '../../types';
import { ProposalDetailModal } from './ProposalDetailModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { StatusBadge } from '../ui/StatusBadge';
import { EmptyState } from '../ui/EmptyState';

export const PortabilityView: React.FC = () => {
  const getPortabilityProposals = (): Proposal[] => {
    const products = StorageService.getProducts();
    const all = StorageService.getProposals();
    return all.filter(p => {
      if (p.productId === 'prod-port' || p.productId === 'prod-refin-port') return true;
      const prod = products.find(pr => pr.id === p.productId);
      return prod?.type === 'PORTABILIDADE' || prod?.name?.toUpperCase().includes('PORTABILIDADE');
    });
  };

  const [proposals, setProposals] = useState<Proposal[]>(getPortabilityProposals);
  const clients = StorageService.getClients();
  const banks = StorageService.getBanks();
  const promoters = StorageService.getPromoters();
  const partners = StorageService.getPartners();
  const statuses = StorageService.getStatuses();
  const holidays = StorageService.getHolidays();
  const config = StorageService.getConfig();

  const [activeTab, setActiveTab] = useState<'TODAS' | 'EM_PRAZO' | '5_DIA' | 'ATRASADAS' | 'SALDO_RETORNADO'>('TODAS');
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
      `Verificação concluída: ${res.checkedCount} propostas verificadas | ${res.saldoRetornadoCount} saldos retornados automaticamente!`
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

  const totalSaldoPortabilidade = proposals.reduce((acc, p) => acc + (p.contractBalance || 0), 0);
  const totalTrocoPortabilidade = proposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);

  const currentList =
    activeTab === 'TODAS'
      ? classified
      : activeTab === 'EM_PRAZO'
      ? emPrazo
      : activeTab === '5_DIA'
      ? no5Dia
      : activeTab === 'ATRASADAS'
      ? atrasadas
      : saldoRetornado;

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <ActionBar
        title="Portabilidade (CIP)"
        subtitle="Acompanhamento do SLA de 5 dias úteis, retenções e saldos retornados"
        count={classified.length}
        financialTotal={formatCurrency(totalSaldoPortabilidade)}
        rightActions={
          <button
            onClick={handleRunCron}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Consultar Retornos de Saldo CIP</span>
          </button>
        }
      />

      {/* Financial Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          title="Saldo Total em Portabilidade"
          value={formatCurrency(totalSaldoPortabilidade)}
          subtitle="Soma de todos os saldos devedores retidos ou aguardando retorno"
          tone="info"
        />
        <MetricCard
          title="Troco / Líquido Previsto"
          value={formatCurrency(totalTrocoPortabilidade)}
          subtitle="Estimativa consolidada a ser liberada aos proponentes"
          tone="success"
        />
      </div>

      {/* Cron Feedback Banner */}
      {cronFeedback && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{cronFeedback}</span>
        </div>
      )}

      {/* Metrics Filter Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <button
          onClick={() => setActiveTab('TODAS')}
          className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
            activeTab === 'TODAS'
              ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 dark:border-blue-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-slate-400">Todas</span>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{classified.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('EM_PRAZO')}
          className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
            activeTab === 'EM_PRAZO'
              ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 dark:border-emerald-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Em Prazo (1 a 3d)</span>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{emPrazo.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('5_DIA')}
          className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
            activeTab === '5_DIA'
              ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 dark:border-amber-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">No 4º ou 5º Dia</span>
          <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{no5Dia.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('ATRASADAS')}
          className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
            activeTab === 'ATRASADAS'
              ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">Atrasadas (&gt; 5d)</span>
          <p className="text-lg font-bold text-rose-700 dark:text-rose-300">{atrasadas.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('SALDO_RETORNADO')}
          className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
            activeTab === 'SALDO_RETORNADO'
              ? 'border-purple-500 bg-purple-50/70 dark:bg-purple-950/40 dark:border-purple-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-purple-600 dark:text-purple-400">Saldo Retornado</span>
          <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{saldoRetornado.length}</p>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950/40 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {currentList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
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
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-black text-slate-900 dark:text-white">
                        ADE {p.proposalNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        {client?.fullName}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">
                        {formatCpf(client?.cpf || '')}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                        {bank?.name} / <span className="text-slate-500">{promoter?.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                          {partner?.login || ''}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 text-[10px] block truncate max-w-[120px]">
                          {partner?.login}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.contractBalance ? (
                          <span className="text-[11px] font-mono font-black text-indigo-700 dark:text-indigo-400 block">
                            Saldo: {formatCurrency(p.contractBalance)}
                          </span>
                        ) : null}
                        {p.disbursedValue ? (
                          <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                            Troco: {formatCurrency(p.disbursedValue)}
                          </span>
                        ) : null}
                        {!p.contractBalance && !p.disbursedValue && (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        {status?.code === 'AGUARDAR_RETORNO_CIP' ? (
                          <div>
                            <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {sla.businessDays} / {sla.targetDays} dias úteis
                              </span>
                              <span
                                className={`font-black text-[10px] px-1.5 py-0.5 rounded ${
                                  sla.statusBadge === 'ESTOURADO'
                                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                                    : sla.statusBadge === 'URGENTE'
                                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
                                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900'
                                }`}
                              >
                                {sla.statusBadge}
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full ${
                                  sla.statusBadge === 'ESTOURADO'
                                    ? 'bg-rose-500'
                                    : sla.statusBadge === 'URGENTE'
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${sla.progressPercent}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Fora de contagem CIP
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedProposalId(p.id)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100"
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
