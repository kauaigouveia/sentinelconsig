import React, { useState } from 'react';
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Proposal, Bank, Partner, ProposalStatus } from '../../types';

export const CommercialRadarView: React.FC = () => {
  const proposals = StorageService.getProposals();
  const banks = StorageService.getBanks();
  const partners = StorageService.getPartners();
  const statuses = StorageService.getStatuses();
  const insights = StorageService.getCommercialInsights();

  const paidStatus = statuses.find(s => s.code === 'PAGO');
  const cancelledStatus = statuses.find(s => s.code === 'CANCELADO');
  const reprovadoStatus = statuses.find(s => s.code === 'REPROVADO');
  const cipStatus = statuses.find(s => s.code === 'AGUARDAR_RETORNO_CIP');

  // Bank conversion analysis
  const bankStats = banks.map(b => {
    const bankProps = proposals.filter(p => p.bankId === b.id);
    const total = bankProps.length;
    const paid = bankProps.filter(p => p.statusId === paidStatus?.id).length;
    const cancelled = bankProps.filter(p => p.statusId === cancelledStatus?.id).length;
    const reprovados = bankProps.filter(p => p.statusId === reprovadoStatus?.id).length;
    const inCip = bankProps.filter(p => p.statusId === cipStatus?.id).length;
    const disbursed = bankProps.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
    const conversionRate = total > 0 ? Math.round((paid / total) * 100) : 0;

    return {
      id: b.id,
      name: b.name,
      total,
      paid,
      cancelled,
      reprovados,
      inCip,
      disbursed,
      conversionRate,
    };
  }).sort((a, b) => b.disbursed - a.disbursed);

  // Partner growth and activity
  const partnerStats = partners.map(pt => {
    const ptProps = proposals.filter(p => p.partnerId === pt.id);
    const total = ptProps.length;
    const disbursed = ptProps.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
    const paid = ptProps.filter(p => p.statusId === paidStatus?.id).length;
    const conversion = total > 0 ? Math.round((paid / total) * 100) : 0;

    return {
      id: pt.id,
      login: pt.login,
      total,
      disbursed,
      paid,
      conversion,
      active: pt.active,
    };
  }).sort((a, b) => b.disbursed - a.disbursed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 uppercase tracking-wider">
              BI & ANÁLISE PREDITIVA
            </span>
            <span className="text-xs text-slate-500 font-semibold">Dados Reais da Operação</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-1">Radar Comercial & Inteligência de Mesa</h2>
          <p className="text-xs text-slate-500">
            Conversão por instituição financeira, tendências de correspondentes, SLA médio e gargalos operacionais
          </p>
        </div>
      </div>

      {/* Automated Real Data Insights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {insights.map(ins => (
          <div
            key={ins.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2 flex flex-col justify-between"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  ins.severity === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                  ins.severity === 'WARNING' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {ins.metricValue}
                </span>
                <Sparkles className="h-4 w-4 text-amber-500" />
              </div>
              <h3 className="text-xs font-bold text-slate-900">{ins.title}</h3>
              <p className="text-xs text-slate-600">{ins.description}</p>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 pt-2 border-t border-slate-100">
              <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
              <span>Insight Gerado Automaticamente</span>
            </div>
          </div>
        ))}
      </div>

      {/* Bank Conversion & Liquidity Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            <span>Matriz de Conversão & Desempenho por Banco</span>
          </h3>
          <span className="text-xs text-slate-500 font-semibold">{banks.length} bancos cadastrados</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Banco / Instituição</th>
                <th className="p-3.5 text-center">Total Propostas</th>
                <th className="p-3.5 text-center">Pagas / Liquidadas</th>
                <th className="p-3.5 text-center">Em CIP</th>
                <th className="p-3.5 text-center">Canceladas / Reprov.</th>
                <th className="p-3.5 text-center">Taxa de Conversão</th>
                <th className="p-3.5 text-right">Volume Liberado Líquido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {bankStats.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    <span>{b.name}</span>
                  </td>
                  <td className="p-3.5 text-center font-semibold">{b.total}</td>
                  <td className="p-3.5 text-center">
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {b.paid}
                    </span>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {b.inCip}
                    </span>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                      {b.cancelled + b.reprovados}
                    </span>
                  </td>
                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-2 rounded-full"
                          style={{ width: `${b.conversionRate}%` }}
                        />
                      </div>
                      <span className="font-bold text-slate-900">{b.conversionRate}%</span>
                    </div>
                  </td>
                  <td className="p-3.5 text-right font-mono font-bold text-emerald-700">
                    {formatCurrency(b.disbursed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Partner Performance & Activity Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            <span>Desempenho & Assertividade por Parceiro (Corban)</span>
          </h3>
          <span className="text-xs text-slate-500 font-semibold">{partners.length} parceiros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Login do Parceiro</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-center">Total ADEs</th>
                <th className="p-3.5 text-center">Pagas</th>
                <th className="p-3.5 text-center">Assertividade</th>
                <th className="p-3.5 text-right">Volume Total Liberado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {partnerStats.map(pt => (
                <tr key={pt.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-slate-900">
                    {pt.login}
                  </td>
                  <td className="p-3.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      pt.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {pt.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-3.5 text-center font-semibold">{pt.total}</td>
                  <td className="p-3.5 text-center font-bold text-emerald-700">{pt.paid}</td>
                  <td className="p-3.5 text-center font-bold text-blue-700">{pt.conversion}%</td>
                  <td className="p-3.5 text-right font-mono font-bold text-emerald-700">
                    {formatCurrency(pt.disbursed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
