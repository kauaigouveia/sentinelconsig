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
    <div className="space-y-5">
      {/* Title */}
      <div>
        <h2 className="text-base font-bold text-slate-900">Torre de Controle Operacional</h2>
        <p className="text-xs text-slate-500">
          Visão holística da produção, SLAs, gargalos e distribuição de responsabilidades por alçada
        </p>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-bold uppercase text-emerald-700">Volume Liberado Pago (R$)</span>
            <p className="text-xl font-black text-emerald-900 mt-0.5">{formatCurrency(totalDisbursedPaid)}</p>
            <span className="text-[10px] text-emerald-600 font-semibold">{pagas} propostas concluídas</span>
          </div>
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-bold uppercase text-blue-700">Volume Total em Esteira (R$)</span>
            <p className="text-xl font-black text-blue-900 mt-0.5">{formatCurrency(totalDisbursed)}</p>
            <span className="text-[10px] text-blue-600 font-semibold">{total} propostas cadastradas</span>
          </div>
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-bold uppercase text-purple-700">Saldo Retido em CIP (R$)</span>
            <p className="text-xl font-black text-purple-900 mt-0.5">{formatCurrency(totalBalanceCip)}</p>
            <span className="text-[10px] text-purple-600 font-semibold">
              Troco previsto: {formatCurrency(totalDisbursedCip)}
            </span>
          </div>
          <div className="h-9 w-9 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
            <Coins className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Total Propostas</span>
          <p className="text-xl font-black text-slate-900 mt-1">{total}</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-emerald-700">Pagas</span>
          <p className="text-xl font-black text-emerald-800 mt-1">{pagas}</p>
          <span className="text-[10px] text-emerald-600 font-semibold">
            {total > 0 ? `${Math.round((pagas / total) * 100)}% de conversão` : '0%'}
          </span>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-amber-700">Pendentes</span>
          <p className="text-xl font-black text-amber-800 mt-1">{pendentes}</p>
          <span className="text-[10px] text-amber-600">Doc / Banco / Parceiro</span>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-rose-700">Cancel/Reprov</span>
          <p className="text-xl font-black text-rose-800 mt-1">{canceladasReprovadas}</p>
          <span className="text-[10px] text-rose-600">
            {total > 0 ? `${Math.round((canceladasReprovadas / total) * 100)}% canceladas` : '0%'}
          </span>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-blue-700">Portab. em CIP</span>
          <p className="text-xl font-black text-blue-800 mt-1">{portInCip.length}</p>
          <span className="text-[10px] text-blue-600">Aguardando saldo</span>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-amber-800">Port. no 5º Dia</span>
          <p className="text-xl font-black text-amber-900 mt-1">{portNo5Dia}</p>
          <span className="text-[10px] text-amber-700 font-semibold">Prestes a virar</span>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-rose-800">Port. Atrasadas</span>
          <p className="text-xl font-black text-rose-900 mt-1">{portAtrasadas}</p>
          <span className="text-[10px] text-rose-700 font-bold">&gt; 5 dias úteis</span>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-purple-700">Alçada Equipe</span>
          <p className="text-xl font-black text-purple-800 mt-1">{alcadas['NOSSA EQUIPE']}</p>
          <span className="text-[10px] text-purple-600">Ação interna</span>
        </div>
      </div>

      {/* SECTION: INDICADOR ALÇADA ATUAL */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Distribuição por Alçada de Responsabilidade (Quem está travando a esteira?)
            </h3>
            <p className="text-xs text-slate-500">
              Clique em qualquer alçada para filtrar a esteira imediatamente
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(
            [
              { key: 'CLIENTE', label: 'Cliente', desc: 'Aguardando formalização / assinatura / doc', color: 'border-orange-200 bg-orange-50/60 text-orange-900' },
              { key: 'PARCEIRO', label: 'Parceiro', desc: 'Pendente retorno / recálculo / dados', color: 'border-amber-200 bg-amber-50/60 text-amber-900' },
              { key: 'BANCO', label: 'Banco / CIP', desc: 'Em análise CIP / averbação bancária', color: 'border-blue-200 bg-blue-50/60 text-blue-900' },
              { key: 'NOSSA EQUIPE', label: 'Nossa Equipe', desc: 'Digitação / conferência / anexos', color: 'border-purple-200 bg-purple-50/60 text-purple-900' },
              { key: 'SISTEMA', label: 'Sistema', desc: 'Processamento automático / cron', color: 'border-slate-200 bg-slate-50 text-slate-900' },
            ] as const
          ).map(al => (
            <button
              key={al.key}
              onClick={() => onNavigateToProductionWithFilter({ alçada: al.key })}
              className={`p-4 rounded-xl border text-left transition-all hover:shadow-xs group cursor-pointer ${al.color}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs">{al.label}</span>
                <ArrowRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-2xl font-extrabold mt-1">{alcadas[al.key]}</p>
              <p className="text-[10px] opacity-75 mt-1">{al.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* SECTION: PRODUÇÃO BANCO × PROMOTORA */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Matriz de Produção: Banco × Promotora de Vínculo
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
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
            <tbody className="divide-y divide-slate-100 font-medium">
              {banks.map(b => {
                const totalForBank = proposals.filter(p => p.bankId === b.id).length;
                return (
                  <tr key={b.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{b.name}</td>
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
                              className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
                                count > 0
                                  ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                  : 'text-slate-400'
                              }`}
                            >
                              {count}
                            </button>
                          ) : (
                            <span className="text-slate-300 text-[11px] italic" title="Vínculo não habilitado">
                              -
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
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
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Aging da Esteira (Tempo em Aberto)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Product Distribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Distribuição por Linha de Produto
          </h3>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={productData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {productData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
