import React, { useMemo } from 'react';
import {
  Trophy,
  Award,
  Flame,
  Star,
  CheckCircle,
  Shield,
  Zap,
  Users,
  Target,
  Crown,
  Medal,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { GamificationAchievement } from '../../types';
import { formatDate, formatCurrency } from '../../lib/utils';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';

export const GamificationCenter: React.FC = () => {
  const achievements = StorageService.getAchievements();
  const users = StorageService.getUsers().filter(
    u => u.role === 'DIGITADOR' || u.role === 'GESTOR' || u.role === 'MASTER'
  );
  const proposals = StorageService.getProposals();
  const statuses = StorageService.getStatuses();
  const activeUser = StorageService.getActiveUser();

  const paidStatus = statuses.find(s => s.code === 'PAGO');

  // Real Leaderboard Calculation
  const leaderboard = useMemo(() => {
    return users.map(u => {
      const userProps = proposals.filter(p => p.digitizerId === u.id);
      const totalProps = userProps.length;
      const pagas = userProps.filter(p => p.statusId === paidStatus?.id).length;
      const volumeTotal = userProps.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
      const volumePago = userProps
        .filter(p => p.statusId === paidStatus?.id)
        .reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
      const conversion = totalProps > 0 ? Math.round((pagas / totalProps) * 100) : 0;

      // Calculate XP: 100 XP per proposal + 500 XP per paid proposal + 1 XP per R$ 100 disbursed
      const xp = totalProps * 100 + pagas * 500 + Math.round(volumePago / 100);
      const level = Math.floor(xp / 2000) + 1;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        totalProps,
        pagas,
        volumeTotal,
        volumePago,
        conversion,
        xp,
        level,
      };
    }).sort((a, b) => b.xp - a.xp);
  }, [users, proposals, paidStatus]);

  const myRankIndex = leaderboard.findIndex(u => u.id === activeUser.id);
  const myStats = leaderboard[myRankIndex] || {
    name: activeUser.name,
    totalProps: 0,
    pagas: 0,
    volumeTotal: 0,
    volumePago: 0,
    conversion: 0,
    xp: 0,
    level: 1,
  };

  const allAvailableBadges = [
    { code: 'PRIMEIRA_VENDA', title: 'Primeira Liquidação', description: 'Primeira proposta com status PAGO liquidada.', icon: '🚀', category: 'Iniciação' },
    { code: 'META_BATIDA', title: 'Meta Superada', description: 'Atingiu 100% da meta operacional individual.', icon: '🏆', category: 'Resultados' },
    { code: '100_PROPOSTAS', title: 'Centurião da Mesa', description: 'Alcançou a marca de 100 propostas cadastradas.', icon: '💯', category: 'Volume' },
    { code: 'MAIOR_PRODUCAO', title: 'Líder de Volume', description: 'Líder em volume financeiro liberado no período.', icon: '👑', category: 'Liderança' },
    { code: 'MELHOR_CONVERSAO', title: 'Alta Precisão', description: 'Taxa de aprovação e integração superior a 80%.', icon: '🎯', category: 'Qualidade' },
    { code: 'ZERO_CANCELAMENTOS', title: 'Esteira Limpa', description: 'Manteve a esteira de digitação com 0% cancelamentos.', icon: '🛡️', category: 'Eficiência' },
  ];

  return (
    <div className="space-y-6">
      <ActionBar
        title="Centro de Conquistas & Performance Corporativa"
        subtitle="Reconhecimento de mérito, pontuação por liquidação e acompanhamento de produtividade dos operadores"
        badgeText="ENGINE DE PERFORMANCE"
        badgeColor="bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]"
      />

      {/* 1. SEÇÃO MINHA PERFORMANCE */}
      <div className="rounded-2xl border border-[var(--warning-border)] dark:border-[var(--warning-border)]    to-transparent p-5  space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--warning-border)] dark:border-[var(--warning-border)] pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--warning-bg)] text-[var(--warning-text)] flex items-center justify-center font-black text-base shadow-xs">
              {myStats.level}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Meu Painel: {activeUser.name}
                </h3>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]">
                  NÍVEL {myStats.level}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Posição no Ranking Geral: <strong className="text-[var(--warning-text)] dark:text-[var(--warning-text)]">#{myRankIndex >= 0 ? myRankIndex + 1 : '—'}</strong> de {leaderboard.length} operadores
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-[var(--text-secondary)]">Pontuação Total:</span>
            <span className="text-base font-black text-[var(--warning-text)] dark:text-[var(--warning-text)]">
              {myStats.xp.toLocaleString()} XP
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <div className="p-3 rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block">Propostas Digitadas</span>
            <p className="text-lg font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-0.5">{myStats.totalProps}</p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="text-[10px] font-bold text-[var(--success-text)] dark:text-[var(--success-text)] uppercase block">Pagas / Liquidadas</span>
            <p className="text-lg font-black text-[var(--success-text)] dark:text-[var(--success-text)] mt-0.5">{myStats.pagas}</p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="text-[10px] font-bold text-[var(--link)] dark:text-[var(--link)] uppercase block">Taxa de Conversão</span>
            <p className="text-lg font-black text-[var(--link)] dark:text-[var(--link)] mt-0.5">{myStats.conversion}%</p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <span className="text-[10px] font-bold text-[var(--warning-text)] dark:text-[var(--warning-text)] uppercase block">Volume Liquidado</span>
            <p className="text-lg font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-0.5 truncate">{formatCurrency(myStats.volumePago)}</p>
          </div>
        </div>
      </div>

      {/* 2. LEADERBOARD CORPORATIVO */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[var(--warning-text)]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Ranking Geral de Produtividade dos Operadores
            </h3>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] font-bold uppercase">Ordenado por XP Operacional</span>
        </div>

        <div className="space-y-2">
          {leaderboard.map((user, idx) => {
            const isTop1 = idx === 0;
            const isTop2 = idx === 1;
            const isTop3 = idx === 2;

            return (
              <div
                key={user.id}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                  user.id === activeUser.id
                    ? 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] shadow-2xs'
                    : 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-8 w-8 rounded-xl font-black text-xs flex items-center justify-center ${
                      isTop1
                        ? 'bg-[var(--warning-bg)] text-[var(--text-primary)] shadow-xs'
                        : isTop2
                        ? 'bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]'
                        : isTop3
                        ? 'bg-[var(--warning-bg)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                    }`}
                  >
                    {isTop1 ? <Crown className="h-4 w-4" /> : `#${idx + 1}`}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {user.name}
                      </h4>
                      {user.id === activeUser.id && (
                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]">
                          VOCÊ
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                      Nível {user.level} • {user.totalProps} propostas ({user.conversion}% conversão)
                    </span>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-xs font-black text-[var(--warning-text)] dark:text-[var(--warning-text)] block">
                    {user.xp.toLocaleString()} XP
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {formatCurrency(user.volumePago)} pago
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. MATRIZ DE CONQUISTAS */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-[var(--warning-text)]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Galeria de Medalhas & Conquistas Desbloqueáveis
            </h3>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] font-bold uppercase">{achievements.length} medalhas atribuídas</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          {allAvailableBadges.map(badge => {
            const unlockedInstances = achievements.filter(a => a.code === badge.code);
            const isUnlocked = unlockedInstances.length > 0;

            return (
              <div
                key={badge.code}
                className={`p-4 rounded-xl border transition-all space-y-2.5 ${
                  isUnlocked
                    ? 'border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] shadow-2xs'
                    : 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-xl bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-center justify-center text-xl  border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
                    {badge.icon}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9.5px] font-black ${
                      isUnlocked
                        ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                        : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-secondary)]'
                    }`}
                  >
                    {isUnlocked ? `${unlockedInstances.length} Conquistada(s)` : 'Bloqueada'}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{badge.title}</h4>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{badge.description}</p>
                </div>

                {isUnlocked && (
                  <div className="pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex flex-wrap gap-1">
                    {unlockedInstances.map(inst => (
                      <span
                        key={inst.id}
                        className="bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] font-bold px-1.5 py-0.5 rounded"
                      >
                        {inst.operatorName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
