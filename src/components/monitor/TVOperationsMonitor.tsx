import React, { useState, useEffect } from 'react';
import {
  Tv,
  Maximize2,
  Minimize2,
  TrendingUp,
  Award,
  Users,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  Flame,
  ShieldCheck,
  RefreshCw,
  Layers,
  ArrowUpRight,
  Activity,
  Zap,
  Radio,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatCurrency, formatCpf, formatDate } from '../../lib/utils';
import { Proposal, User, Partner, Bank, ProposalStatus } from '../../types';

export const TVOperationsMonitor: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeStr, setTimeStr] = useState(new Date().toLocaleTimeString('pt-BR'));
  const [dateStr, setDateStr] = useState(
    new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  );
  const [proposals, setProposals] = useState<Proposal[]>(StorageService.getProposals());

  const users = StorageService.getUsers();
  const partners = StorageService.getPartners();
  const banks = StorageService.getBanks();
  const statuses = StorageService.getStatuses();
  const currentTenant = StorageService.getCurrentTenant();

  // Clock & auto-sync ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('pt-BR'));
      setDateStr(
        now.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      );
      setProposals(StorageService.getProposals());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  // Metrics
  const totalVolume = proposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
  const totalBalance = proposals.reduce((acc, p) => acc + (p.contractBalance || 0), 0);
  const totalCount = proposals.length;
  const paidProposals = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PAGO';
  });
  const paidCount = paidProposals.length;
  const paidVolume = paidProposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);

  const pendingCount = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code.startsWith('PENDENTE');
  }).length;

  const targetMonthly = 500000;
  const progressPercent = Math.min(100, Math.round((paidVolume / targetMonthly) * 100));

  // Rankings
  const digitizerMap: Record<string, { count: number; volume: number; paidVolume: number; name: string }> = {};
  proposals.forEach(p => {
    const u = users.find(usr => usr.id === p.digitizerId);
    const name = u?.name || 'Digitador';
    const s = statuses.find(st => st.id === p.statusId);
    const isPaid = s?.code === 'PAGO';

    if (!digitizerMap[p.digitizerId]) {
      digitizerMap[p.digitizerId] = { count: 0, volume: 0, paidVolume: 0, name };
    }
    digitizerMap[p.digitizerId].count += 1;
    digitizerMap[p.digitizerId].volume += p.disbursedValue || 0;
    if (isPaid) {
      digitizerMap[p.digitizerId].paidVolume += p.disbursedValue || 0;
    }
  });

  const digitizerRankings = Object.values(digitizerMap).sort((a, b) => b.volume - a.volume);

  const partnerMap: Record<string, { count: number; volume: number; login: string }> = {};
  proposals.forEach(p => {
    const pt = partners.find(prt => prt.id === p.partnerId);
    const login = pt?.login || 'PARCEIRO';
    if (!partnerMap[p.partnerId]) {
      partnerMap[p.partnerId] = { count: 0, volume: 0, login };
    }
    partnerMap[p.partnerId].count += 1;
    partnerMap[p.partnerId].volume += p.disbursedValue || 0;
  });

  const partnerRankings = Object.values(partnerMap).sort((a, b) => b.volume - a.volume);

  // Recent 6 proposals for live ticker
  const recentProposals = [...proposals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return (
    <div className="min-h-[850px] rounded-3xl bg-[#070b14] text-white p-6 shadow-2xl border border-slate-800/80 space-y-5 select-none font-sans">
      {/* Top Mission Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-4">
          <div className="h-13 w-13 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25 ring-1 ring-blue-400/30">
            <Tv className="h-7 w-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                SALA DE OPERAÇÕES EM TEMPO REAL
              </span>
              <span className="text-xs text-slate-400 font-black uppercase tracking-wider">{currentTenant.name}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mt-1">
              Sentinel Command Center — Mesa Consignado
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-3xl font-black font-mono tracking-wider text-cyan-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              {timeStr}
            </div>
            <div className="text-xs text-slate-400 font-semibold capitalize mt-0.5">{dateStr}</div>
          </div>
          <button
            onClick={toggleFullscreen}
            className="p-3 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer shadow-lg hover:border-blue-500/50"
            title="Alternar Tela Cheia"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Main Goal Progress Bar */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900/90 via-[#0d1527] to-[#0a192f] p-5 border border-slate-800/90 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
              <Flame className="h-4 w-4 text-amber-400 animate-bounce" />
            </div>
            <div>
              <span className="text-sm font-black uppercase tracking-wider text-slate-100 block">
                Termômetro de Liquidação Mensal
              </span>
              <span className="text-[11px] text-slate-400">Meta estipulada para a mesa no mês corrente</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-xs text-slate-400 font-semibold">Liquidado:</span>
            <span className="text-xl font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">
              {formatCurrency(paidVolume)}
            </span>
            <span className="text-xs text-slate-500">/ Meta {formatCurrency(targetMonthly)}</span>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="h-5 w-full rounded-full bg-slate-950 overflow-hidden p-0.5 border border-slate-800 shadow-inner">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-1000 shadow-[0_0_12px_rgba(59,130,246,0.5)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
          <span>0%</span>
          <span className="text-emerald-400 font-mono font-black text-sm bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
            {progressPercent}% Atingido
          </span>
          <span>100% Meta</span>
        </div>
      </div>

      {/* 4 Large Highlight Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0c1220] border border-slate-800/80 p-5 shadow-lg space-y-1 relative overflow-hidden">
          <div className="absolute -right-2 -bottom-2 opacity-5">
            <DollarSign className="h-24 w-24 text-white" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
            Volume Total Digitado
          </span>
          <div className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
            {formatCurrency(totalVolume)}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {totalCount} propostas em esteira
          </span>
        </div>

        <div className="rounded-2xl bg-[#0c1220] border border-slate-800/80 p-5 shadow-lg space-y-1 relative overflow-hidden">
          <div className="absolute -right-2 -bottom-2 opacity-5">
            <CheckCircle2 className="h-24 w-24 text-white" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
            Total Pago / Liquidado
          </span>
          <div className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
            {formatCurrency(paidVolume)}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {paidCount} contratos finalizados com sucesso
          </span>
        </div>

        <div className="rounded-2xl bg-[#0c1220] border border-slate-800/80 p-5 shadow-lg space-y-1 relative overflow-hidden">
          <div className="absolute -right-2 -bottom-2 opacity-5">
            <Clock className="h-24 w-24 text-white" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
            Saldo em Retorno CIP
          </span>
          <div className="text-2xl font-black font-mono text-amber-400 tracking-tight">
            {formatCurrency(totalBalance)}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Portabilidades em liquidação
          </span>
        </div>

        <div className="rounded-2xl bg-[#0c1220] border border-slate-800/80 p-5 shadow-lg space-y-1 relative overflow-hidden">
          <div className="absolute -right-2 -bottom-2 opacity-5">
            <TrendingUp className="h-24 w-24 text-white" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
            Ticket Médio
          </span>
          <div className="text-2xl font-black font-mono text-purple-400 tracking-tight">
            {formatCurrency(totalCount > 0 ? totalVolume / totalCount : 0)}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Média por proposta cadastrada
          </span>
        </div>
      </div>

      {/* Live Operational Ticker */}
      <div className="rounded-2xl bg-[#0b101c] border border-slate-800/90 p-4 shadow-lg space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-400 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-200">
              Feed de Movimentação Recente
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            Últimas Operações
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recentProposals.map(p => {
            const client = StorageService.getClientById(p.clientId);
            const status = statuses.find(s => s.id === p.statusId);
            const bank = banks.find(b => b.id === p.bankId);

            return (
              <div
                key={p.id}
                className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-white truncate">
                      {client?.fullName || 'Cliente'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {p.proposalNumber ? `#${p.proposalNumber}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span>{bank?.name || 'Banco'}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {formatCurrency(p.disbursedValue || 0)}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0 border border-slate-700/60 truncate max-w-[100px]">
                  {status?.name || 'Em Análise'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-time Rankings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Operators / Digitizers */}
        <div className="rounded-2xl bg-[#0b101c] border border-slate-800/80 p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Ranking de Operadores & Digitadores
              </h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
              LEADERBOARD
            </span>
          </div>

          <div className="space-y-2.5">
            {digitizerRankings.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma proposta digitada ainda.</p>
            ) : (
              digitizerRankings.slice(0, 5).map((op, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-7 w-7 rounded-lg flex items-center justify-center font-black text-xs ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-950'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-xs text-white block">{op.name}</span>
                      <span className="text-[11px] text-slate-400">{op.count} propostas cadastradas</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-emerald-400 text-sm block">
                      {formatCurrency(op.volume)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Partners (Correspondentes) */}
        <div className="rounded-2xl bg-[#0b101c] border border-slate-800/80 p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Ranking de Parceiros (Corbans)
              </h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
              ORIGINAÇÃO
            </span>
          </div>

          <div className="space-y-2.5">
            {partnerRankings.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 text-center">Nenhum parceiro movimentou propostas.</p>
            ) : (
              partnerRankings.slice(0, 5).map((pt, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-7 w-7 rounded-lg flex items-center justify-center font-black text-xs ${
                        idx === 0
                          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                          : idx === 1
                          ? 'bg-indigo-500 text-white'
                          : idx === 2
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-xs text-white font-mono block">{pt.login}</span>
                      <span className="text-[11px] text-slate-400">{pt.count} ADEs enviadas</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-blue-400 text-sm block">
                      {formatCurrency(pt.volume)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

