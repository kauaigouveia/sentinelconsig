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

  const periodProposals = useMemo(() => {
    if (timeRange === 'ALL') return proposals;

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (timeRange === 'THIS_MONTH') {
      start.setDate(1);
    } else {
      start.setDate(start.getDate() - 29);
    }

    return proposals.filter(proposal => {
      if (!proposal.createdAt) return false;
      const createdAt = new Date(proposal.createdAt);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= start && createdAt <= now;
    });
  }, [proposals, timeRange]);

  // Executive Core Aggregates
  const total = periodProposals.length;
  const pagas = periodProposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PAGO';
  });

  const canceladas = periodProposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'CANCELADO' || s?.code === 'REPROVADO';
  });

  const emAndamento = periodProposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code !== 'PAGO' && s?.code !== 'CANCELADO' && s?.code !== 'REPROVADO';
  });

  const cipStatus = statuses.find(s => s.code === 'AGUARDAR_RETORNO_CIP');
  const portInCip = proposals.filter(p => p.statusId === cipStatus?.id);

  // Financial calculations
  const totalDisbursed = periodProposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
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
        const ptProps = periodProposals.filter(p => p.partnerId === pt.id);
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
  }, [partners, periodProposals, statuses]);

  // Bank Volume Distribution
  const bankDistribution = useMemo(() => {
    return banks
      .map(b => {
        const bProps = periodProposals.filter(p => p.bankId === b.id);
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
  }, [banks, periodProposals, statuses]);

  // Status Funnel Distribution
  const statusDistribution = useMemo(() => {
    return statuses
      .map(s => {
        const count = periodProposals.filter(p => p.statusId === s.id).length;
        const volume = periodProposals
          .filter(p => p.statusId === s.id)
          .reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
        return {
          name: s.name,
          count,
          volume,
          color: s.color || "var(--chart-series-1)",
        };
      })
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [statuses, periodProposals]);

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
        title="SENTINEL CONSIG — Cockpit Executivo & Inteligência Estratégica"
        subtitle="Inteligência que antecipa. Controle que transforma."
        badgeText="PAINEL DA DIRETORIA"
        badgeColor="bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-0.5 text-xs font-semibold">
              <button
                onClick={() => setTimeRange('THIS_MONTH')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === 'THIS_MONTH'
                    ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                }`}
              >
                Mês Vigente
              </button>
              <button
                onClick={() => setTimeRange('LAST_30_DAYS')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === 'LAST_30_DAYS'
                    ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                }`}
              >
                Últimos 30 Dias
              </button>
              <button
                onClick={() => setTimeRange('ALL')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === 'ALL'
                    ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
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
          <Target className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            1. Visão Executiva & Metas Corporativas
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Meta Mensal Card */}
          <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
                {timeRange === 'THIS_MONTH'
                  ? 'Meta Mensal (R$)'
                  : timeRange === 'LAST_30_DAYS'
                    ? 'Liquidado (Últimos 30 Dias)'
                    : 'Liquidado (Todo o Histórico)'}
              </span>
              <Target className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
            </div>
            <p className="text-xl font-black font-mono text-[var(--link)] dark:text-[var(--link)]">
              {formatCurrency(totalDisbursedPago)}
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-[var(--link)] dark:text-[var(--link)]">
                <span>{timeRange === 'THIS_MONTH' ? `${progressoMeta}% da meta` : `${pagas.length} contratos liquidados`}</span>
                {timeRange === 'THIS_MONTH' && <span>Alvo: {formatCurrency(metaFinanceira)}</span>}
              </div>
              {timeRange === 'THIS_MONTH' && (
                <div className="h-1.5 w-full bg-[var(--info-bg)] dark:bg-[var(--info-bg)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--info-bg)] rounded-full transition-all duration-500"
                    style={{ width: `${progressoMeta}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Volume Total Produzido */}
          <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4  space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                Produção Total (Esteira)
              </span>
              <Coins className="h-4 w-4 text-[var(--text-secondary)]" />
            </div>
            <p className="text-xl font-black font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              {formatCurrency(totalDisbursed)}
            </p>
            <span className="text-[11px] text-[var(--text-secondary)] font-bold block">
              {total} propostas cadastradas
            </span>
          </div>

          {/* Ticket Médio */}
          <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4  space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                Ticket Médio Operação
              </span>
              <DollarSign className="h-4 w-4 text-[var(--text-secondary)]" />
            </div>
            <p className="text-xl font-black font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              {formatCurrency(ticketMedio)}
            </p>
            <span className="text-[11px] text-[var(--success-text)] dark:text-[var(--success-text)] font-bold block">
              Média por contrato
            </span>
          </div>

          {/* Taxa de Aprovação */}
          <div className="rounded-xl border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] p-4  space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--success-text)] dark:text-[var(--success-text)]">
                Taxa de Aprovação
              </span>
              <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] dark:text-[var(--success-text)]" />
            </div>
            <p className="text-xl font-black font-mono text-[var(--success-text)] dark:text-[var(--success-text)]">
              {taxaAprovacao}%
            </p>
            <span className="text-[11px] text-[var(--success-text)] dark:text-[var(--success-text)] font-bold block">
              {pagas.length} contratos liquidados
            </span>
          </div>

          {/* Taxa de Cancelamento / Perda */}
          <div className="rounded-xl border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-4  space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--danger-text)] dark:text-[var(--danger-text)]">
                Taxa de Perda / Reprovação
              </span>
              <AlertTriangle className="h-4 w-4 text-[var(--danger-text)] dark:text-[var(--danger-text)]" />
            </div>
            <p className="text-xl font-black font-mono text-[var(--danger-text)] dark:text-[var(--danger-text)]">
              {taxaCancelamento}%
            </p>
            <span className="text-[11px] text-[var(--danger-text)] dark:text-[var(--danger-text)] font-bold block">
              {canceladas.length} reprovadas / canceladas
            </span>
          </div>
        </div>
      </div>

      {/* 2. EVOLUÇÃO TEMPORAL DIÁRIA */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Evolução Diária da Produção (Últimos 14 Dias)
            </h3>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] font-medium">Cadastradas vs. Pagas</span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>


              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" opacity={0.2} />
              <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={11} />
              <YAxis stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--field-border)",
                  borderRadius: '0.75rem',
                  color: "var(--text-primary)",
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Area
                type="monotone"
                dataKey="cadastradas"
                name="Cadastradas"
                stroke="var(--chart-series-1)"
                strokeWidth={2}
                fillOpacity={1}
                fill="var(--chart-series-1)"
              />
              <Area
                type="monotone"
                dataKey="pagas"
                name="Pagas"
                stroke="var(--chart-series-2)"
                strokeWidth={2}
                fillOpacity={1}
                fill="var(--chart-series-1)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. GRID COMERCIAL & FINANCEIRO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Parceiros Comerciais */}
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-[var(--warning-text)]" />
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Top Correspondentes & Parceiros
              </h3>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)] font-bold uppercase">Volume (R$)</span>
          </div>

          <div className="space-y-3">
            {partnerPerformance.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4 text-center">Nenhum parceiro com produção cadastrada.</p>
            ) : (
              partnerPerformance.slice(0, 5).map((pt, idx) => (
                <div
                  key={pt.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-full bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {pt.name}
                      </h4>
                      <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                        Código: {pt.code} • {pt.total} propostas ({pt.conversion}% aprov.)
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] block">
                      {formatCurrency(pt.disbursed)}
                    </span>
                    <span className="text-[10px] text-[var(--success-text)] dark:text-[var(--success-text)] font-bold">
                      {pt.pagas} pagas
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Distribuição por Banco Parceiro */}
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Volume por Instituição Bancária
              </h3>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)] font-bold uppercase">Volume & Conversão</span>
          </div>

          <div className="space-y-3">
            {bankDistribution.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4 text-center">Nenhum banco com produção vinculada.</p>
            ) : (
              bankDistribution.slice(0, 5).map(b => (
                <div
                  key={b.name}
                  className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)]"
                >
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {b.name}
                    </h4>
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">
                      {b.propostas} propostas • {b.conversao}% conversão
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black font-mono text-[var(--link)] dark:text-[var(--link)] block">
                      {formatCurrency(b.volume)}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">
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
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-5  space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
              Resumo de Risco Operacional & Saldo CIP
            </h3>
          </div>
          <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-bold font-mono">
            {portInCip.length} propostas aguardando saldo
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-2xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)] block">
              Saldo Devedor em CIP (R$)
            </span>
            <p className="text-lg font-black font-mono text-[var(--link)] dark:text-[var(--link)] mt-1">
              {formatCurrency(totalSaldoCip)}
            </p>
            <span className="text-[10px] text-[var(--text-secondary)]">Em análise regulatória de 5 dias úteis</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-2xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] block">
              Volume em Andamento na Mesa
            </span>
            <p className="text-lg font-black font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">
              {formatCurrency(totalDisbursedAndamento)}
            </p>
            <span className="text-[10px] text-[var(--text-secondary)]">{emAndamento.length} propostas ativas</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--success-border)] dark:border-[var(--success-border)] shadow-2xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--success-text)] dark:text-[var(--success-text)] block">
              Volume Efetivamente Liquidado
            </span>
            <p className="text-lg font-black font-mono text-[var(--success-text)] dark:text-[var(--success-text)] mt-1">
              {formatCurrency(totalDisbursedPago)}
            </p>
            <span className="text-[10px] text-[var(--success-text)] dark:text-[var(--success-text)]">{pagas.length} contratos concluídos</span>
          </div>
        </div>
      </div>
    </div>
  );
};
