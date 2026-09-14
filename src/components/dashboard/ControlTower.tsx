import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Building,
  Users,
  Shield,
  Layers,
  ArrowRight,
  DollarSign,
  Coins,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { StorageService } from '../../services/storageService';
import { AutomationService } from '../../services/automationService';
import { ResponsibleAlçada } from '../../types';
import { formatCurrency } from '../../lib/utils';

interface ControlTowerProps {
  onNavigateToProductionWithFilter: (filter: {
    statusId?: string;
    alçada?: ResponsibleAlçada;
    bankId?: string;
    promoterId?: string;
  }) => void;
}

export const ControlTower: React.FC<ControlTowerProps> = ({
  onNavigateToProductionWithFilter,
}) => {
  const proposals = StorageService.getProposals();
  const statuses = StorageService.getStatuses();
  const banks = StorageService.getBanks();
  const promoters = StorageService.getPromoters();
  const products = StorageService.getProducts();

  // Metrics
  const total = proposals.length;
  const pagas = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PAGO';
  }).length;

  const canceladasReprovadas = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'CANCELADO' || s?.code === 'REPROVADO';
  }).length;

  const pendentes = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code.startsWith('PENDENTE');
  }).length;

  // Portabilidades in CIP
  const cipStatus = statuses.find(s => s.code === 'AGUARDAR_RETORNO_CIP');
  const portInCip = proposals.filter(
    p => p.productId === 'prod-port' && p.statusId === cipStatus?.id
  );

  let portNo5Dia = 0;
  let portAtrasadas = 0;
  portInCip.forEach(p => {
    const info = AutomationService.getPortabilitySlaInfo(p);
    if (info.statusBadge === 'URGENTE' || info.businessDays === info.targetDays) portNo5Dia++;
    if (info.statusBadge === 'ESTOURADO' || info.businessDays > info.targetDays) portAtrasadas++;
  });

  // Financial values calculations
  const totalDisbursed = proposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
  const totalDisbursedPaid = proposals
    .filter(p => {
      const s = statuses.find(st => st.id === p.statusId);
      return s?.code === 'PAGO';
    })
    .reduce((acc, p) => acc + (p.disbursedValue || 0), 0);

  const totalBalanceCip = portInCip.reduce((acc, p) => acc + (p.contractBalance || 0), 0);
  const totalDisbursedCip = portInCip.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);

  // Alçadas breakdown
  const alcadas: Record<ResponsibleAlçada, number> = {
    CLIENTE: 0,
    PARCEIRO: 0,
    BANCO: 0,
    'NOSSA EQUIPE': 0,
    SISTEMA: 0,
  };

  proposals.forEach(p => {
    const s = statuses.find(st => st.id === p.statusId);
    if (s && alcadas[s.responsible] !== undefined) {
      alcadas[s.responsible]++;
    }
  });

  // Aging buckets (days since proposal created)
  const agingBuckets = {
    '0 dias': 0,
    '1 dia': 0,
    '2 dias': 0,
    '3 dias': 0,
    '4 dias': 0,
    '5 dias': 0,
    '6 a 10 dias': 0,
    '11 a 20 dias': 0,
    '+20 dias': 0,
  };

  const now = new Date().getTime();
  proposals.forEach(p => {
    const diffDays = Math.floor((now - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) agingBuckets['0 dias']++;
    else if (diffDays === 1) agingBuckets['1 dia']++;
    else if (diffDays === 2) agingBuckets['2 dias']++;
    else if (diffDays === 3) agingBuckets['3 dias']++;
    else if (diffDays === 4) agingBuckets['4 dias']++;
    else if (diffDays === 5) agingBuckets['5 dias']++;
    else if (diffDays <= 10) agingBuckets['6 a 10 dias']++;
    else if (diffDays <= 20) agingBuckets['11 a 20 dias']++;
    else agingBuckets['+20 dias']++;
  });

  const agingData = Object.entries(agingBuckets).map(([name, count]) => ({
    name,
    count,
  }));

  // Bank chart data
  const bankData = banks.map(b => ({
    name: b.name,
    propostas: proposals.filter(p => p.bankId === b.id).length,
  }));

  // Product chart data
  const productData = products.map(pr => ({
    name: pr.name,
    value: proposals.filter(p => p.productId === pr.id).length,
  }));

  const PRODUCT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#ec4899'];

  return (
    <div className="space-y-4 select-none">
      {/* Title & Status Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#0f172a] p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-xs">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Torre de Controle Operacional
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                TELEMETRIA ATIVA
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Visão holística da esteira, SLAs, alçadas e gargalos operacionais
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateToProductionWithFilter({})}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <span>Ver Esteira Completa</span>
            <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
          </button>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          onClick={() => onNavigateToProductionWithFilter({ statusId: statuses.find(s => s.code === 'PAGO')?.id })}
          className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 flex items-center justify-between shadow-2xs hover:border-emerald-400 transition-all cursor-pointer group"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Volume Liberado Pago (R$)
            </span>
            <p className="text-2xl font-black font-mono text-emerald-900 dark:text-emerald-300 mt-0.5 tracking-tight">
              {formatCurrency(totalDisbursedPaid)}
            </p>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400/80 font-bold">
              {pagas} propostas concluídas
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div
          onClick={() => onNavigateToProductionWithFilter({})}
          className="rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/30 p-4 flex items-center justify-between shadow-2xs hover:border-blue-400 transition-all cursor-pointer group"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Volume Total em Esteira (R$)
            </span>
            <p className="text-2xl font-black font-mono text-blue-900 dark:text-blue-300 mt-0.5 tracking-tight">
              {formatCurrency(totalDisbursed)}
            </p>
            <span className="text-[11px] text-blue-600 dark:text-blue-400/80 font-bold">
              {total} propostas cadastradas
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        <div
          onClick={() => onNavigateToProductionWithFilter({ statusId: cipStatus?.id })}
          className="rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/60 dark:bg-purple-950/30 p-4 flex items-center justify-between shadow-2xs hover:border-purple-400 transition-all cursor-pointer group"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400">
              Saldo Retido em CIP (R$)
            </span>
            <p className="text-2xl font-black font-mono text-purple-900 dark:text-purple-300 mt-0.5 tracking-tight">
              {formatCurrency(totalBalanceCip)}
            </p>
            <span className="text-[11px] text-purple-600 dark:text-purple-400/80 font-bold">
              Troco previsto: {formatCurrency(totalDisbursedCip)}
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Coins className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <div
          onClick={() => onNavigateToProductionWithFilter({})}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-3 shadow-2xs hover:border-slate-400 cursor-pointer transition-colors"
        >
          <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 block">Total Geral</span>
          <p className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1">{total}</p>
        </div>

        <div
          onClick={() => onNavigateToProductionWithFilter({ statusId: statuses.find(s => s.code === 'PAGO')?.id })}
          className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 shadow-2xs hover:border-emerald-400 cursor-pointer transition-colors"
        >
          <span className="text-[9.5px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">Pagas</span>
          <p className="text-lg font-black font-mono text-emerald-800 dark:text-emerald-300 mt-1">{pagas}</p>
          <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400 font-bold block truncate">
            {total > 0 ? `${Math.round((pagas / total) * 100)}% conversão` : '0%'}
          </span>
        </div>

        <div
          onClick={() => onNavigateToProductionWithFilter({})}
          className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-3 shadow-2xs hover:border-amber-400 cursor-pointer transition-colors"
        >
          <span className="text-[9.5px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 block">Pendentes</span>
          <p className="text-lg font-black font-mono text-amber-800 dark:text-amber-300 mt-1">{pendentes}</p>
          <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-bold block truncate">Doc / Banco</span>
        </div>

        <div
          onClick={() => onNavigateToProductionWithFilter({})}
          className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-3 shadow-2xs hover:border-rose-400 cursor-pointer transition-colors"
        >
          <span className="text-[9.5px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400 block">Cancel/Reprov</span>
          <p className="text-lg font-black font-mono text-rose-800 dark:text-rose-300 mt-1">{canceladasReprovadas}</p>
          <span className="text-[9.5px] text-rose-600 dark:text-rose-400 font-bold block truncate">
            {total > 0 ? `${Math.round((canceladasReprovadas / total) * 100)}% perda` : '0%'}
          </span>
        </div>

        <div
          onClick={() => onNavigateToProductionWithFilter({ statusId: cipStatus?.id })}
          className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-3 shadow-2xs hover:border-blue-400 cursor-pointer transition-colors"
        >
          <span className="text-[9.5px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400 block">Portab. em CIP</span>
          <p className="text-lg font-black font-mono text-blue-800 dark:text-blue-300 mt-1">{portInCip.length}</p>
          <span className="text-[9.5px] text-blue-600 dark:text-blue-400 font-bold block truncate">Aguardando saldo</span>
        </div>

        <div
          onClick={() => onNavigateToProductionWithFilter({ statusId: cipStatus?.id })}
          className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-100/50 dark:bg-amber-950/40 p-3 shadow-2xs hover:border-amber-500 cursor-pointer transition-colors"
        >
          <span className="text-[9.5px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 block">Port. 5º Dia</span>
          <p className="text-lg font-black font-mono text-amber-900 dark:text-amber-200 mt-1">{portNo5Dia}</p>
          <span className="text-[9.5px] text-amber-700 dark:text-amber-300 font-black block truncate">Prestes a virar</span>
        </div>

        <div
          onClick={() => onNavigateToProductionWithFilter({ statusId: cipStatus?.id })}
          className="rounded-xl border border-rose-300 dark:border-rose-700/60 bg-rose-100/50 dark:bg-rose-950/40 p-3 shadow-2xs hover:border-rose-500 cursor-pointer transition-colors"
        >
          <span className="text-[9.5px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-300 block">Port. Atrasadas</span>
          <p className="text-lg font-black font-mono text-rose-900 dark:text-rose-200 mt-1">{portAtrasadas}</p>
          <span className="text-[9.5px] text-rose-700 dark:text-rose-300 font-black block truncate">&gt; 5 dias úteis</span>
        </div>

        <div
          onClick={() => onNavigateToProductionWithFilter({ alçada: 'NOSSA EQUIPE' })}
          className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 p-3 shadow-2xs hover:border-purple-400 cursor-pointer transition-colors"
        >
          <span className="text-[9.5px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400 block">Nossa Equipe</span>
          <p className="text-lg font-black font-mono text-purple-800 dark:text-purple-300 mt-1">{alcadas['NOSSA EQUIPE']}</p>
          <span className="text-[9.5px] text-purple-600 dark:text-purple-400 font-bold block truncate">Ação interna</span>
        </div>
      </div>

      {/* SECTION: INDICADOR ALÇADA ATUAL */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Distribuição por Alçada de Responsabilidade
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-bold uppercase">Clique para filtrar</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(
            [
              { key: 'CLIENTE', label: 'Cliente', desc: 'Aguardando formalização / assinatura / doc', color: 'border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300' },
              { key: 'PARCEIRO', label: 'Parceiro', desc: 'Pendente retorno / recálculo / dados', color: 'border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300' },
              { key: 'BANCO', label: 'Banco / CIP', desc: 'Em análise CIP / averbação bancária', color: 'border-purple-200 dark:border-purple-900/40 bg-purple-50/50 dark:bg-purple-950/20 text-purple-900 dark:text-purple-300' },
              { key: 'NOSSA EQUIPE', label: 'Nossa Equipe', desc: 'Digitação / conferência / anexos', color: 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300' },
              { key: 'SISTEMA', label: 'Sistema', desc: 'Processamento automático / cron', color: 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-200' },
            ] as const
          ).map(al => (
            <button
              key={al.key}
              onClick={() => onNavigateToProductionWithFilter({ alçada: al.key })}
              className={`p-3.5 rounded-xl border text-left transition-all hover:scale-[1.01] group cursor-pointer shadow-2xs ${al.color}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-black text-xs uppercase tracking-wider">{al.label}</span>
                <ArrowRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-2xl font-black font-mono mt-1">{alcadas[al.key]}</p>
              <p className="text-[10px] opacity-75 mt-1 font-medium">{al.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* SECTION: PRODUÇÃO BANCO × PROMOTORA */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Matriz Operacional: Banco Destino × Promotora
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Consolidado em Tempo Real</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Banco Destino</th>
                {promoters.map(pr => (
                  <th key={pr.id} className="px-3 py-2.5 text-center">
                    {pr.name}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right">Total Banco</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {banks.map(b => {
                const totalForBank = proposals.filter(p => p.bankId === b.id).length;
                return (
                  <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">{b.name}</td>
                    {promoters.map(pr => {
                      const count = proposals.filter(
                        p => p.bankId === b.id && p.promoterId === pr.id
                      ).length;
                      const isAllowed = StorageService.isBankPromoterAllowed(b.id, pr.id);

                      return (
                        <td key={pr.id} className="px-3 py-2.5 text-center">
                          {isAllowed ? (
                            <button
                              onClick={() =>
                                onNavigateToProductionWithFilter({ bankId: b.id, promoterId: pr.id })
                              }
                              className={`rounded px-2.5 py-0.5 font-mono text-xs font-bold transition-transform hover:scale-105 cursor-pointer ${
                                count > 0
                                  ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 hover:bg-blue-200'
                                  : 'text-slate-400 dark:text-slate-600'
                              }`}
                            >
                              {count}
                            </button>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700 text-[11px] italic" title="Vínculo não habilitado">
                              -
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {totalForBank}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION: AGING BUCKETS & CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Aging Buckets */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Aging da Esteira (Tempo em Aberto)
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Dias de Esteira</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.2)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Product Distribution */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Distribuição por Linha de Produto
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">{products.length} Categorias</span>
          </div>
          <div className="h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={productData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={45}
                  paddingAngle={3}
                >
                  {productData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '11px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
