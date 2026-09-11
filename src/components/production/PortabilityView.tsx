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

  const handleRunCron = () => {
    const res = AutomationService.runPortabilityCron();
    setCronFeedback(
      `Automação executada: ${res.checkedCount} verificadas | ${res.saldoRetornadoCount} saldos retornados automaticamente!`
    );
    refreshData();
    setTimeout(() => setCronFeedback(null), 5000);
  };

  // Classify proposals
  const classified = proposals.map(p => {
    const sla = AutomationService.getPortabilitySlaInfo(p);
    const status = statuses.find(s => s.id === p.statusId);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-blue-600" />
            <span>Gestão Operacional de Portabilidades</span>
          </h2>
          <p className="text-xs text-slate-500">
            Monitoramento do SLA de 5 dias úteis em AGUARDAR RETORNO CIP e transições automáticas para Saldo Retornado
          </p>
        </div>

        <button
          onClick={handleRunCron}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors"
        >
          <Play className="h-3.5 w-3.5" />
          <span>Executar Verificação de Saldo (Vercel Cron)</span>
        </button>
      </div>

      {/* Financial Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-bold uppercase text-indigo-700">Saldo Total em Portabilidade</span>
            <p className="text-xl font-black text-indigo-900 mt-0.5">{formatCurrency(totalSaldoPortabilidade)}</p>
            <span className="text-[10px] text-indigo-600">Soma dos saldos devedores informados</span>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-bold uppercase text-emerald-700">Troco / Líquido Previsto</span>
            <p className="text-xl font-black text-emerald-900 mt-0.5">{formatCurrency(totalTrocoPortabilidade)}</p>
            <span className="text-[10px] text-emerald-600">Valor a ser liberado ao cliente</span>
          </div>
        </div>
      </div>

      {/* Cron Feedback Banner */}
      {cronFeedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{cronFeedback}</span>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          onClick={() => setActiveTab('TODAS')}
          className={`p-3 rounded-xl border text-left transition-all ${
            activeTab === 'TODAS'
              ? 'border-blue-500 bg-blue-50/70 shadow-xs'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-slate-400">Todas</span>
          <p className="text-xl font-extrabold text-slate-800">{classified.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('EM_PRAZO')}
          className={`p-3 rounded-xl border text-left transition-all ${
            activeTab === 'EM_PRAZO'
              ? 'border-emerald-500 bg-emerald-50/70 shadow-xs'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-emerald-700">Em Prazo (1 a 3 dias)</span>
          <p className="text-xl font-extrabold text-emerald-800">{emPrazo.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('5_DIA')}
          className={`p-3 rounded-xl border text-left transition-all ${
            activeTab === '5_DIA'
              ? 'border-amber-500 bg-amber-50/70 shadow-xs'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-amber-700">No 4º ou 5º Dia</span>
          <p className="text-xl font-extrabold text-amber-800">{no5Dia.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('ATRASADAS')}
          className={`p-3 rounded-xl border text-left transition-all ${
            activeTab === 'ATRASADAS'
              ? 'border-rose-500 bg-rose-50/70 shadow-xs'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-rose-700">Atrasadas (&gt; 5 dias)</span>
          <p className="text-xl font-extrabold text-rose-800">{atrasadas.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('SALDO_RETORNADO')}
          className={`p-3 rounded-xl border text-left transition-all ${
            activeTab === 'SALDO_RETORNADO'
              ? 'border-purple-500 bg-purple-50/70 shadow-xs'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase text-purple-700">Saldo Retornado</span>
          <p className="text-xl font-extrabold text-purple-800">{saldoRetornado.length}</p>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
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
            <tbody className="divide-y divide-slate-100 font-medium">
              {currentList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
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
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        ADE {p.proposalNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {client?.fullName}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {formatCpf(client?.cpf || '')}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {bank?.name} / {promoter?.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-blue-700">
                          {partner ? extractPartnerCode(partner.login) : ''}
                        </span>
                        <span className="text-slate-400 text-[10px] block">
                          {partner?.login}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.contractBalance ? (
                          <span className="text-[11px] font-bold text-indigo-700 block">
                            Saldo: {formatCurrency(p.contractBalance)}
                          </span>
                        ) : null}
                        {p.disbursedValue ? (
                          <span className="text-[10px] text-emerald-600 block">
                            Troco: {formatCurrency(p.disbursedValue)}
                          </span>
                        ) : null}
                        {!p.contractBalance && !p.disbursedValue && (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white shadow-2xs"
                          style={{ backgroundColor: status?.color || '#64748b' }}
                        >
                          {status?.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        {status?.code === 'AGUARDAR_RETORNO_CIP' ? (
                          <div>
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-bold text-slate-700">
                                {sla.businessDays} / {sla.targetDays} dias úteis
                              </span>
                              <span
                                className={`font-bold text-[10px] ${
                                  sla.statusBadge === 'ESTOURADO'
                                    ? 'text-rose-600'
                                    : sla.statusBadge === 'URGENTE'
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                                }`}
                              >
                                {sla.statusBadge}
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
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
