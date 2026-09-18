import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Award,
  Building2,
  PieChart,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Layers,
  Filter,
  Users,
  Search,
  DollarSign,
  Activity,
  Flame,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatCurrency, formatDate, extractPartnerCode } from '../../lib/utils';
import { Proposal, Bank, Partner, ProposalStatus } from '../../types';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';

export const CommercialRadarView: React.FC = () => {
  const proposals = StorageService.getProposals();
  const banks = StorageService.getBanks();
  const partners = StorageService.getPartners();
  const statuses = StorageService.getStatuses();
  const insights = StorageService.getCommercialInsights();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterSegment, setFilterSegment] = useState<'ALL' | 'DIAMOND' | 'GROWTH' | 'RISK' | 'INACTIVE'>('ALL');

  const paidStatus = statuses.find(s => s.code === 'PAGO');
  const cancelledStatus = statuses.find(s => s.code === 'CANCELADO');
  const reprovadoStatus = statuses.find(s => s.code === 'REPROVADO');
  const cipStatus = statuses.find(s => s.code === 'AGUARDAR_RETORNO_CIP');

  // Partner Analysis with Categorization Matrix
  const partnerMatrix = useMemo(() => {
    return partners.map(pt => {
      const ptProps = proposals.filter(p => p.partnerId === pt.id);
      const total = ptProps.length;
      const disbursed = ptProps.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
      const paid = ptProps.filter(p => p.statusId === paidStatus?.id).length;
      const conversion = total > 0 ? Math.round((paid / total) * 100) : 0;
      const ticket = total > 0 ? disbursed / total : 0;
      const code = pt.login;

      // Segment classification based on actual data
      let segment: 'DIAMOND' | 'GROWTH' | 'RISK' | 'INACTIVE' = 'INACTIVE';
      if (total === 0) {
        segment = 'INACTIVE';
      } else if (disbursed >= 50000 && conversion >= 60) {
        segment = 'DIAMOND';
      } else if (conversion < 40 && total >= 3) {
        segment = 'RISK';
      } else {
        segment = 'GROWTH';
      }

      return {
        id: pt.id,
        fullName: pt.fullName,
        login: pt.login,
        code,
        total,
        disbursed,
        paid,
        conversion,
        ticket,
        active: pt.active,
        segment,
      };
    });
  }, [partners, proposals, paidStatus]);

  // Bank stats
  const bankStats = useMemo(() => {
    return banks.map(b => {
      const bankProps = proposals.filter(p => p.bankId === b.id);
      const total = bankProps.length;
      const paid = bankProps.filter(p => p.statusId === paidStatus?.id).length;
      const disbursed = bankProps.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
      const conversionRate = total > 0 ? Math.round((paid / total) * 100) : 0;

      return {
        id: b.id,
        name: b.name,
        total,
        paid,
        disbursed,
        conversionRate,
      };
    }).sort((a, b) => b.disbursed - a.disbursed);
  }, [banks, proposals, paidStatus]);

  // Aggregates
  const totalVolumeGeral = proposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
  const totalParceirosAtivos = partnerMatrix.filter(p => p.total > 0).length;
  const diamondCount = partnerMatrix.filter(p => p.segment === 'DIAMOND').length;
  const riskCount = partnerMatrix.filter(p => p.segment === 'RISK').length;

  const filteredPartners = partnerMatrix.filter(pt => {
    const matchSearch =
      !searchTerm ||
      pt.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pt.login.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pt.code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchSegment = filterSegment === 'ALL' || pt.segment === filterSegment;
    return matchSearch && matchSegment;
  }).sort((a, b) => b.disbursed - a.disbursed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <ActionBar
        title="Radar Comercial & Inteligência de Mesa"
        subtitle="Mapeamento de performance de agentes, matriz de conversão e identificação de oportunidades e riscos"
        badgeText="BI & ANÁLISE DE CORRESPONDENTES"
        badgeColor="bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800"
      />

      {/* Top Real KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/40 dark:bg-cyan-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
              Parceiros com Produção
            </span>
            <Users className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <p className="text-2xl font-black font-mono text-cyan-950 dark:text-cyan-200">
            {totalParceirosAtivos} <span className="text-xs font-normal text-slate-500">/ {partners.length} cadastrados</span>
          </p>
          <span className="text-[11px] text-cyan-700 dark:text-cyan-400 font-bold block">
            {Math.round((totalParceirosAtivos / (partners.length || 1)) * 100)}% de engajamento ativo
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Volume Total Movimentado
            </span>
            <DollarSign className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black font-mono text-slate-900 dark:text-white">
            {formatCurrency(totalVolumeGeral)}
          </p>
          <span className="text-[11px] text-slate-500 font-bold block">
            {proposals.length} propostas na base
          </span>
        </div>

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Segmento Diamante
            </span>
            <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-black font-mono text-emerald-900 dark:text-emerald-300">
            {diamondCount} parceiros
          </p>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold block">
            Alto volume e conversão &gt; 60%
          </span>
        </div>

        <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-300">
              Parceiros em Risco
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-black font-mono text-rose-900 dark:text-rose-300">
            {riskCount} parceiros
          </p>
          <span className="text-[11px] text-rose-700 dark:text-rose-400 font-bold block">
            Alta taxa de cancelamento / perda
          </span>
        </div>
      </div>

      {/* Real Commercial Insights */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {insights.map(ins => (
            <div
              key={ins.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    <span>{ins.type}</span>
                  </span>
                  <span
                    className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                      ins.severity === 'WARNING'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : ins.severity === 'SUCCESS'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    }`}
                  >
                    {ins.metricValue}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  {ins.title}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {ins.description}
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-blue-600 dark:text-blue-400 font-bold font-mono">
                Tendência: {ins.trend === 'UP' ? 'ALTA ↑' : ins.trend === 'DOWN' ? 'QUEDA ↓' : 'ESTÁVEL →'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Analytical Partners Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Matriz de Desempenho dos Correspondentes
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar parceiro ou código..."
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
              />
            </div>

            <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setFilterSegment('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterSegment === 'ALL' ? 'bg-cyan-600 text-white' : 'text-slate-500'
                }`}
              >
                Todos ({partnerMatrix.length})
              </button>
              <button
                onClick={() => setFilterSegment('DIAMOND')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterSegment === 'DIAMOND' ? 'bg-emerald-600 text-white' : 'text-slate-500'
                }`}
              >
                Diamantes ({diamondCount})
              </button>
              <button
                onClick={() => setFilterSegment('GROWTH')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterSegment === 'GROWTH' ? 'bg-blue-600 text-white' : 'text-slate-500'
                }`}
              >
                Em Crescimento
              </button>
              <button
                onClick={() => setFilterSegment('RISK')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterSegment === 'RISK' ? 'bg-rose-600 text-white' : 'text-slate-500'
                }`}
              >
                Em Risco ({riskCount})
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3.5 py-2.5">Correspondente / Agente</th>
                <th className="px-3.5 py-2.5 font-mono">Código</th>
                <th className="px-3.5 py-2.5 text-center">Classificação</th>
                <th className="px-3.5 py-2.5 text-right">Propostas</th>
                <th className="px-3.5 py-2.5 text-right font-mono">Volume Total (R$)</th>
                <th className="px-3.5 py-2.5 text-center">Taxa Conversão</th>
                <th className="px-3.5 py-2.5 text-right font-mono">Ticket Médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-400">
                    Nenhum parceiro encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredPartners.map(pt => (
                  <tr key={pt.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <span className="font-bold text-slate-900 dark:text-white block">{pt.fullName}</span>
                      <span className="text-[10px] text-slate-500">{pt.login}</span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-400">
                      {pt.code}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          pt.segment === 'DIAMOND'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : pt.segment === 'GROWTH'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : pt.segment === 'RISK'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {pt.segment === 'DIAMOND'
                          ? '💎 DIAMANTE'
                          : pt.segment === 'GROWTH'
                          ? '🚀 POTENCIAL'
                          : pt.segment === 'RISK'
                          ? '⚠️ EM RISCO'
                          : 'INATIVO'}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold">
                      {pt.total}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(pt.disbursed)}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono">
                      <span className={`font-bold ${pt.conversion >= 60 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {pt.conversion}%
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                      {formatCurrency(pt.ticket)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
