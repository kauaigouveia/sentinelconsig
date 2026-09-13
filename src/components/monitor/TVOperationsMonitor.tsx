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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatCurrency, formatCpf } from '../../lib/utils';
import { Proposal, User, Partner, Bank, ProposalStatus } from '../../types';

export const TVOperationsMonitor: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeStr, setTimeStr] = useState(new Date().toLocaleTimeString('pt-BR'));
  const [dateStr, setDateStr] = useState(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }));
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
      setDateStr(now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }));
      setProposals(StorageService.getProposals());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Metrics
  const totalVolume = proposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
  const totalBalance = proposals.reduce((acc, p) => acc + (p.contractBalance || 0), 0);
  const totalCount = proposals.length;
  const paidCount = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PAGO';
  }).length;

  const targetMonthly = 350000;
  const progressPercent = Math.min(100, Math.round((totalVolume / targetMonthly) * 100));

  // Rankings
  const digitizerMap: Record<string, { count: number; volume: number; name: string }> = {};
  proposals.forEach(p => {
    const u = users.find(usr => usr.id === p.digitizerId);
    const name = u?.name || 'Digitador';
    if (!digitizerMap[p.digitizerId]) {
      digitizerMap[p.digitizerId] = { count: 0, volume: 0, name };
    }
    digitizerMap[p.digitizerId].count += 1;
    digitizerMap[p.digitizerId].volume += p.disbursedValue || 0;
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

  return (
    <div className="min-h-[850px] rounded-3xl bg-slate-950 text-white p-6 shadow-2xl border border-slate-800 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Tv className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                SALA DE CONTROLE AO VIVO
              </span>
              <span className="text-xs text-slate-400 font-bold uppercase">{currentTenant.name}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mt-0.5">
              Painel de Operações da Mesa de Crédito
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-black font-mono tracking-wider text-blue-400">{timeStr}</div>
            <div className="text-xs text-slate-400 capitalize">{dateStr}</div>
          </div>
          <button
            onClick={toggleFullscreen}
            className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer shadow-xs"
            title="Alternar Tela Cheia"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Main Goal Progress Bar */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/40 p-5 border border-slate-800 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-400 animate-bounce" />
            <span className="text-sm font-black uppercase tracking-wider text-slate-200">
              Termômetro de Produção Mensal da Mesa
            </span>
          </div>
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-xs text-slate-400">Liberado:</span>
            <span className="text-lg font-black text-emerald-400">{formatCurrency(totalVolume)}</span>
            <span className="text-xs text-slate-500">/ Meta: {formatCurrency(targetMonthly)}</span>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="h-5 w-full rounded-full bg-slate-800 overflow-hidden p-0.5 border border-slate-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-1000 shadow-sm"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
          <span>0%</span>
          <span className="text-emerald-400 font-mono font-black text-sm">{progressPercent}% Atingido</span>
          <span>100% (Meta Conquistada)</span>
        </div>
      </div>

      {/* 4 Large Highlight Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 shadow-lg space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Total Liberado (Líquido)</span>
          <div className="text-2xl font-black font-mono text-emerald-400">{formatCurrency(totalVolume)}</div>
          <span className="text-[11px] text-slate-500">Volume acumulado da esteira</span>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 shadow-lg space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Saldo Devedor Retornado</span>
          <div className="text-2xl font-black font-mono text-blue-400">{formatCurrency(totalBalance)}</div>
          <span className="text-[11px] text-slate-500">Portabilidades em processamento CIP</span>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 shadow-lg space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Total de Propostas</span>
          <div className="text-2xl font-black font-mono text-white">{totalCount} ADEs</div>
          <span className="text-[11px] text-slate-500">{paidCount} contratos liquidados</span>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 shadow-lg space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Ticket Médio Operacional</span>
          <div className="text-2xl font-black font-mono text-purple-400">
            {formatCurrency(totalCount > 0 ? totalVolume / totalCount : 0)}
          </div>
          <span className="text-[11px] text-slate-500">Média por proposta digitada</span>
        </div>
      </div>

      {/* Real-time Rankings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Operators / Digitizers */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Ranking de Operadores & Digitadores
              </h3>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              Tempo Real
            </span>
          </div>

          <div className="space-y-2.5">
            {digitizerRankings.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma proposta digitada ainda.</p>
            ) : (
              digitizerRankings.map((op, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className={`h-7 w-7 rounded-lg flex items-center justify-center font-black text-xs ${
                      idx === 0 ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20' :
                      idx === 1 ? 'bg-slate-300 text-slate-950' :
                      idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-xs text-white block">{op.name}</span>
                      <span className="text-[11px] text-slate-400">{op.count} propostas</span>
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
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Ranking de Parceiros (Corbans)
              </h3>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              Produção Total
            </span>
          </div>

          <div className="space-y-2.5">
            {partnerRankings.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 text-center">Nenhum parceiro movimentou propostas.</p>
            ) : (
              partnerRankings.map((pt, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className={`h-7 w-7 rounded-lg flex items-center justify-center font-black text-xs ${
                      idx === 0 ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20' :
                      idx === 1 ? 'bg-indigo-500 text-white' :
                      idx === 2 ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
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
