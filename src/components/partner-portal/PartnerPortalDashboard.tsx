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

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              Olá, {partner.name}
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Cód: {partner.code}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Acompanhe a evolução da sua esteira de crédito e fale com nosso suporte em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('atendimento')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Falar com Suporte</span>
          </button>
          <button
            onClick={fetchDashboard}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title="Atualizar Indicadores"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 4 Cards de Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Em Andamento */}
        <div
          onClick={() => onNavigate('propostas', { standardCategory: 'ESTEIRA' })}
          className="p-4 rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 hover:border-blue-400 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Em Andamento
            </span>
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black font-mono text-slate-900 dark:text-white">
            {metrics.inProgressCount}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 block">
            Em análise ou formalização
          </span>
        </div>

        {/* Concluídas / Pagas */}
        <div
          onClick={() => onNavigate('propostas', { standardCategory: 'PAGO' })}
          className="p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 hover:border-emerald-400 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Concluídas & Pagas
            </span>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {metrics.completedCount}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 block">
            Volume liberado pago
          </span>
        </div>

        {/* Pendentes */}
        <div
          onClick={() => onNavigate('propostas', { standardCategory: 'PENDENTE' })}
          className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 hover:border-amber-400 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Pendências
            </span>
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
            {metrics.pendingCount}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 block">
            Aguardando regularização
          </span>
        </div>

        {/* Aguardando CIP / Retorno */}
        <div
          onClick={() => onNavigate('propostas', { waitingReturnOnly: true })}
          className="p-4 rounded-xl border border-purple-200/80 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 hover:border-purple-400 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400">
              Aguardando Retorno CIP
            </span>
            <div className="h-7 w-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400">
            {metrics.waitingReturnCount}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 block">
            Portabilidade em processamento
          </span>
        </div>
      </div>

      {/* Financial Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Volume Total de Contratos (Bruto)
            </span>
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(metrics.totalContract)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Volume Total Liberado / Líquido Pago
            </span>
            <p className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCurrency(metrics.totalDisbursed)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Últimas Propostas */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Últimas Propostas Movimentadas
            </span>
          </div>
          <button
            onClick={() => onNavigate('propostas')}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            <span>Ver Todas</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {recentProposals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Nenhuma proposta registrada no momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Proposta</th>
                  <th className="py-2.5 px-4">Cliente</th>
                  <th className="py-2.5 px-4">Banco / Produto</th>
                  <th className="py-2.5 px-4">Valor</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-800 dark:text-slate-200">
                {recentProposals.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    onClick={() => onSelectProposal(p.id)}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                      #{p.proposalNumber}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900 dark:text-white truncate max-w-[180px]">{p.clientName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{p.clientCpfMasked}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold truncate max-w-[150px]">{p.bankName}</p>
                      <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{p.productName}</p>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold">
                      {formatCurrency(p.contractValue)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1"
                        style={{
                          backgroundColor: `${p.statusColor}15`,
                          color: p.statusColor,
                          border: `1px solid ${p.statusColor}30`,
                        }}
                      >
                        {p.statusName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProposal(p.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-colors cursor-pointer"
                        title="Ver Detalhes"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
