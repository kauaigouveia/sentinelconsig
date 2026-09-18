import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Award,
  Users,
  Building2,
  CheckCircle2,
  Calendar,
  Activity,
  ArrowUpRight,
  Clock,
  Sparkles,
  Zap,
  Target,
  DollarSign,
  AlertTriangle,
  Layers,
  Coins,
  ShieldCheck,
  BarChart3,
  PieChart as PieChartIcon,
  Percent,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { StorageService } from '../../services/storageService';
import { extractPartnerCode, formatCurrency } from '../../lib/utils';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';

export const ExecutiveDashboard: React.FC = () => {
  const activeUser = StorageService.getActiveUser();
  const proposals = StorageService.getProposals();
  const partners = StorageService.getPartners();
  const banks = StorageService.getBanks();
  const users = StorageService.getUsers();
  const statuses = StorageService.getStatuses();

  // Active filter range: 'THIS_MONTH', 'LAST_30_DAYS', 'ALL'
  const [timeRange, setTimeRange] = useState<'THIS_MONTH' | 'LAST_30_DAYS' | 'ALL'>('THIS_MONTH');

  // Executive Core Aggregates
  const total = proposals.length;
  const pagas = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PAGO';
  });

  const canceladas = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'CANCELADO' || s?.code === 'REPROVADO';
  });

  const emAndamento = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code !== 'PAGO' && s?.code !== 'CANCELADO' && s?.code !== 'REPROVADO';
  });

  const cipStatus = statuses.find(s => s.code === 'AGUARDAR_RETORNO_CIP');
  const portInCip = proposals.filter(p => p.statusId === cipStatus?.id);

  // Financial calculations
  const totalDisbursed = proposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
  const totalDisbursedPago = pagas.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
  const totalDisbursedAndamento = emAndamento.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
  const totalSaldoCip = portInCip.reduce((acc, p) => acc + (p.contractBalance || 0), 0);
  const ticketMedio = total > 0 ? totalDisbursed / total : 0;

  const taxaAprovacao = total > 0 ? Math.round((pagas.length / total) * 100) : 0;
  const taxaCancelamento = total > 0 ? Math.round((canceladas.length / total) * 100) : 0;

  // Monthly Target Projection (Target = R$ 1.500.000 ou 100 propostas)
  const metaFinanceira = 1500000;
  const progressoMeta = Math.min(100, Math.round((totalDisbursedPago / metaFinanceira) * 100));

  // Top Partners with Real Data
  const partnerPerformance = useMemo(() => {
    return partners
      .map(pt => {
        const ptProps = proposals.filter(p => p.partnerId === pt.id);
        const ptTotal = ptProps.length;
        const ptPagas = ptProps.filter(p => {
          const s = statuses.find(st => st.id === p.statusId);
          return s?.code === 'PAGO';
        }).length;
        const ptDisbursed = ptProps.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
        const conversion = ptTotal > 0 ? Math.round((ptPagas / ptTotal) * 100) : 0;

        return {
          id: pt.id,
          name: pt.fullName,
          login: pt.login,
          code: pt.login,
          total: ptTotal,
          pagas: ptPagas,
          disbursed: ptDisbursed,
          conversion,
        };
      })
      .filter(pt => pt.total > 0)
      .sort((a, b) => b.disbursed - a.disbursed);
  }, [partners, proposals, statuses]);

  // Bank Volume Distribution
  const bankDistribution = useMemo(() => {
    return banks
      .map(b => {
        const bProps = proposals.filter(p => p.bankId === b.id);
        const bTotal = bProps.length;
        const bPaid = bProps.filter(p => {
          const s = statuses.find(st => st.id === p.statusId);
          return s?.code === 'PAGO';
        }).length;
        const bDisbursed = bProps.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
        const conversion = bTotal > 0 ? Math.round((bPaid / bTotal) * 100) : 0;

        return {
          name: b.name,
          propostas: bTotal,
          pagas: bPaid,
          volume: bDisbursed,
          conversao: conversion,
        };
      })
      .filter(b => b.propostas > 0)
      .sort((a, b) => b.volume - a.volume);
  }, [banks, proposals, statuses]);

  // Status Funnel Distribution
  const statusDistribution = useMemo(() => {
    return statuses
      .map(s => {
        const count = proposals.filter(p => p.statusId === s.id).length;
        const volume = proposals
          .filter(p => p.statusId === s.id)
          .reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
        return {
          name: s.name,
          count,
          volume,
          color: s.color || '#3b82f6',
        };
      })
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [statuses, proposals]);

  // Daily Trend (Last 14 Days)
  const dailyTrend = useMemo(() => {
    const daysMap = new Map<string, { date: string; cadastradas: number; pagas: number; volume: number }>();
    const now = new Date();

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const display = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      daysMap.set(key, { date: display, cadastradas: 0, pagas: 0, volume: 0 });
    }

    proposals.forEach(p => {
      const day = p.createdAt ? p.createdAt.split('T')[0] : '';
      if (daysMap.has(day)) {
        const entry = daysMap.get(day)!;
        entry.cadastradas += 1;
        entry.volume += p.disbursedValue || 0;
        const s = statuses.find(st => st.id === p.statusId);
        if (s?.code === 'PAGO') {
          entry.pagas += 1;
        }
      }
    });

    return Array.from(daysMap.values());
  }, [proposals, statuses]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <ActionBar
        title="Cockpit Executivo & Inteligência Estratégica"
        subtitle="Visão consolidada de conversão, metas financeiras, performance de parceiros e liquidação bancária"
        badgeText="PAINEL DA DIRETORIA"
        badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setTimeRange('THIS_MONTH')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === 'THIS_MONTH'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Mês Vigente
              </button>
              <button
                onClick={() => setTimeRange('LAST_30_DAYS')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === 'LAST_30_DAYS'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Últimos 30 Dias
              </button>
              <button
                onClick={() => setTimeRange('ALL')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === 'ALL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todo o Histórico
              </button>
            </div>
          </div>
        }
      />

      {/* 1. SEÇÃO VISÃO EXECUTIVA (METAS & KPI HIGHLIGHTS) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            1. Visão Executiva & Metas Corporativas
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Meta Mensal Card */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-4 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
                Meta Mensal (R$)
              </span>
              <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-xl font-black font-mono text-blue-950 dark:text-blue-200">
              {formatCurrency(totalDisbursedPago)}
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-300">
                <span>{progressoMeta}% da meta</span>
                <span>Alvo: {formatCurrency(metaFinanceira)}</span>
              </div>
              <div className="h-1.5 w-full bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressoMeta}%` }}
                />
              </div>
            </div>
          </div>

          {/* Volume Total Produzido */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Produção Total (Esteira)
              </span>
              <Coins className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {formatCurrency(totalDisbursed)}
            </p>
            <span className="text-[11px] text-slate-500 font-bold block">
              {total} propostas cadastradas
            </span>
          </div>

          {/* Ticket Médio */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Ticket Médio Operação
              </span>
              <DollarSign className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {formatCurrency(ticketMedio)}
            </p>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block">
              Média por contrato
            </span>
          </div>

          {/* Taxa de Aprovação */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Taxa de Aprovação
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xl font-black font-mono text-emerald-900 dark:text-emerald-300">
              {taxaAprovacao}%
            </p>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold block">
              {pagas.length} contratos liquidados
            </span>
          </div>

          {/* Taxa de Cancelamento / Perda */}
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Taxa de Perda / Reprovação
              </span>
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            <p className="text-xl font-black font-mono text-rose-900 dark:text-rose-300">
              {taxaCancelamento}%
            </p>
            <span className="text-[11px] text-rose-700 dark:text-rose-400 font-bold block">
              {canceladas.length} reprovadas / canceladas
            </span>
          </div>
        </div>
      </div>

      {/* 2. EVOLUÇÃO TEMPORAL DIÁRIA */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Evolução Diária da Produção (Últimos 14 Dias)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">Cadastradas vs. Pagas</span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCadastradas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPagas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  borderRadius: '0.75rem',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Area
                type="monotone"
                dataKey="cadastradas"
                name="Cadastradas"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCadastradas)"
              />
              <Area
                type="monotone"
                dataKey="pagas"
                name="Pagas"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPagas)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. GRID COMERCIAL & FINANCEIRO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Parceiros Comerciais */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Top Correspondentes & Parceiros
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-bold uppercase">Volume (R$)</span>
          </div>

          <div className="space-y-3">
            {partnerPerformance.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhum parceiro com produção cadastrada.</p>
            ) : (
              partnerPerformance.slice(0, 5).map((pt, idx) => (
                <div
                  key={pt.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        {pt.name}
                      </h4>
                      <span className="text-[10px] font-mono text-slate-500">
                        Código: {pt.code} • {pt.total} propostas ({pt.conversion}% aprov.)
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black font-mono text-slate-900 dark:text-slate-100 block">
                      {formatCurrency(pt.disbursed)}
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      {pt.pagas} pagas
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Distribuição por Banco Parceiro */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Volume por Instituição Bancária
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-bold uppercase">Volume & Conversão</span>
          </div>

          <div className="space-y-3">
            {bankDistribution.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhum banco com produção vinculada.</p>
            ) : (
              bankDistribution.slice(0, 5).map(b => (
                <div
                  key={b.name}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80"
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {b.name}
                    </h4>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {b.propostas} propostas • {b.conversao}% conversão
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black font-mono text-cyan-700 dark:text-cyan-400 block">
                      {formatCurrency(b.volume)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {b.pagas} liquidadas
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 4. SEÇÃO RISCO & RETENÇÃO CIP */}
      <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/30 dark:bg-purple-950/20 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-purple-200/60 dark:border-purple-900/40 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 dark:text-purple-200">
              Resumo de Risco Operacional & Saldo CIP
            </h3>
          </div>
          <span className="text-[11px] text-purple-700 dark:text-purple-300 font-bold font-mono">
            {portInCip.length} propostas aguardando saldo
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/60 shadow-2xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400 block">
              Saldo Devedor em CIP (R$)
            </span>
            <p className="text-lg font-black font-mono text-purple-900 dark:text-purple-300 mt-1">
              {formatCurrency(totalSaldoCip)}
            </p>
            <span className="text-[10px] text-slate-400">Em análise regulatória de 5 dias úteis</span>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
              Volume em Andamento na Mesa
            </span>
            <p className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(totalDisbursedAndamento)}
            </p>
            <span className="text-[10px] text-slate-400">{emAndamento.length} propostas ativas</span>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-2xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
              Volume Efetivamente Liquidado
            </span>
            <p className="text-lg font-black font-mono text-emerald-800 dark:text-emerald-300 mt-1">
              {formatCurrency(totalDisbursedPago)}
            </p>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{pagas.length} contratos concluídos</span>
          </div>
        </div>
      </div>
    </div>
  );
};
