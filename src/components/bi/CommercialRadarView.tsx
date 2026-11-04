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
        badgeColor="bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]"
      />

      {/* Top Real KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
              Parceiros com Produção
            </span>
            <Users className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          </div>
          <p className="text-2xl font-black font-mono text-[var(--link)] dark:text-[var(--link)]">
            {totalParceirosAtivos} <span className="text-xs font-normal text-[var(--text-secondary)]">/ {partners.length} cadastrados</span>
          </p>
          <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-bold block">
            {Math.round((totalParceirosAtivos / (partners.length || 1)) * 100)}% de engajamento ativo
          </span>
        </div>

        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4  space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
              Volume Total Movimentado
            </span>
            <DollarSign className="h-4 w-4 text-[var(--text-secondary)]" />
          </div>
          <p className="text-2xl font-black font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            {formatCurrency(totalVolumeGeral)}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)] font-bold block">
            {proposals.length} propostas na base
          </span>
        </div>

        <div className="rounded-xl border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--success-text)] dark:text-[var(--success-text)]">
              Segmento Diamante
            </span>
            <Award className="h-4 w-4 text-[var(--success-text)] dark:text-[var(--success-text)]" />
          </div>
          <p className="text-2xl font-black font-mono text-[var(--success-text)] dark:text-[var(--success-text)]">
            {diamondCount} parceiros
          </p>
          <span className="text-[11px] text-[var(--success-text)] dark:text-[var(--success-text)] font-bold block">
            Alto volume e conversão &gt; 60%
          </span>
        </div>

        <div className="rounded-xl border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--danger-text)] dark:text-[var(--danger-text)]">
              Parceiros em Risco
            </span>
            <AlertTriangle className="h-4 w-4 text-[var(--danger-text)] dark:text-[var(--danger-text)]" />
          </div>
          <p className="text-2xl font-black font-mono text-[var(--danger-text)] dark:text-[var(--danger-text)]">
            {riskCount} parceiros
          </p>
          <span className="text-[11px] text-[var(--danger-text)] dark:text-[var(--danger-text)] font-bold block">
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
              className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4  space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)] flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    <span>{ins.type}</span>
                  </span>
                  <span
                    className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                      ins.severity === 'WARNING'
                        ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]'
                        : ins.severity === 'SUCCESS'
                        ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                        : 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                    }`}
                  >
                    {ins.metricValue}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-tight">
                  {ins.title}
                </h4>
                <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] leading-relaxed">
                  {ins.description}
                </p>
              </div>
              <div className="pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] text-[10px] text-[var(--link)] dark:text-[var(--link)] font-bold font-mono">
                Tendência: {ins.trend === 'UP' ? 'ALTA ↑' : ins.trend === 'DOWN' ? 'QUEDA ↓' : 'ESTÁVEL →'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Analytical Partners Table */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Matriz de Desempenho dos Correspondentes
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar parceiro ou código..."
                className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
              />
            </div>

            <div className="flex rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] p-0.5 text-xs font-semibold">
              <button
                onClick={() => setFilterSegment('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterSegment === 'ALL' ? 'bg-[var(--action)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Todos ({partnerMatrix.length})
              </button>
              <button
                onClick={() => setFilterSegment('DIAMOND')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterSegment === 'DIAMOND' ? 'bg-[var(--success-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Diamantes ({diamondCount})
              </button>
              <button
                onClick={() => setFilterSegment('GROWTH')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterSegment === 'GROWTH' ? 'bg-[var(--action)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Em Crescimento
              </button>
              <button
                onClick={() => setFilterSegment('RISK')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterSegment === 'RISK' ? 'bg-[var(--danger-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Em Risco ({riskCount})
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
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
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-[var(--text-secondary)]">
                    Nenhum parceiro encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredPartners.map(pt => (
                  <tr key={pt.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors">
                    <td className="px-3.5 py-2.5">
                      <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] block">{pt.fullName}</span>
                      <span className="text-[10px] text-[var(--text-secondary)]">{pt.login}</span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                      {pt.code}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          pt.segment === 'DIAMOND'
                            ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                            : pt.segment === 'GROWTH'
                            ? 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                            : pt.segment === 'RISK'
                            ? 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]'
                            : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-secondary)]'
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
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {formatCurrency(pt.disbursed)}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono">
                      <span className={`font-bold ${pt.conversion >= 60 ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'}`}>
                        {pt.conversion}%
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
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
