import React, { useState } from 'react';
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { GamificationAchievement } from '../../types';
import { formatDate, formatCurrency } from '../../lib/utils';

export const GamificationCenter: React.FC = () => {
  const achievements = StorageService.getAchievements();
  const users = StorageService.getUsers().filter(u => u.role === 'DIGITADOR' || u.role === 'GESTOR' || u.role === 'MASTER');
  const proposals = StorageService.getProposals();

  const allAvailableBadges = [
    { code: 'PRIMEIRA_VENDA', title: 'Primeira Venda', description: 'Primeira proposta com status PAGO cadastrada.', icon: '🚀', category: 'Iniciação' },
    { code: 'META_BATIDA', title: 'Meta Batida', description: 'Atingiu 100% da meta operacional mensal.', icon: '🏆', category: 'Resultados' },
    { code: '100_PROPOSTAS', title: '100 Propostas', description: 'Alcançou a marca de 100 propostas movimentadas.', icon: '💯', category: 'Volume' },
    { code: 'MAIOR_PRODUCAO', title: 'Maior Produção', description: 'Líder em volume financeiro liberado no período.', icon: '👑', category: 'Liderança' },
    { code: 'MELHOR_CONVERSAO', title: 'Alta Precisão', description: 'Taxa de aprovação e integração superior a 85%.', icon: '🎯', category: 'Qualidade' },
    { code: 'ZERO_CANCELAMENTOS', title: 'Zero Cancelamentos', description: 'Manteve esteira sem nenhum cancelamento.', icon: '🛡️', category: 'Eficiência' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white p-6 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white/20 text-white uppercase tracking-wider">
              ENGAGEMENT ENGINE
            </span>
            <span className="text-xs text-amber-100 font-semibold">Gamificação & Reconhecimento da Mesa</span>
          </div>
          <h2 className="text-xl font-black tracking-tight">Central de Conquistas & Gamificação</h2>
          <p className="text-xs text-amber-100">
            Acompanhe medalhas, conquistas desbloqueadas, níveis de produtividade e histórico de mérito da equipe
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white/10 backdrop-blur-xs border border-white/20 px-4 py-2 rounded-xl text-center">
            <span className="text-[10px] uppercase font-bold text-amber-100 block">Total Desbloqueado</span>
            <span className="text-xl font-black text-white">{achievements.length} Medalhas</span>
          </div>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {allAvailableBadges.map(badge => {
          const unlockedInstances = achievements.filter(a => a.code === badge.code);
          const isUnlocked = unlockedInstances.length > 0;

          return (
            <div
              key={badge.code}
              className={`rounded-2xl border p-5 transition-all shadow-2xs space-y-3 ${
                isUnlocked
                  ? 'border-amber-200 bg-white hover:shadow-xs'
                  : 'border-slate-200 bg-slate-50/70 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl shadow-2xs border border-amber-100">
                  {badge.icon}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isUnlocked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {isUnlocked ? `${unlockedInstances.length} Conquistada(s)` : 'Bloqueada'}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900">{badge.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{badge.description}</p>
              </div>

              {isUnlocked && (
                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Operadores Premiados:</span>
                  <div className="flex flex-wrap gap-1">
                    {unlockedInstances.map(inst => (
                      <span key={inst.id} className="bg-amber-50 text-amber-900 font-bold px-1.5 py-0.5 rounded text-[10px]">
                        {inst.operatorName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Achievements Activity Timeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <span>Histórico Recente de Medalhas e Conquistas</span>
        </h3>

        <div className="space-y-2">
          {achievements.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 text-center">Nenhuma conquista desbloqueada ainda.</p>
          ) : (
            achievements.map(ach => (
              <div
                key={ach.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-white transition-all text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{ach.icon}</span>
                  <div>
                    <span className="font-bold text-slate-900 block">{ach.title} — {ach.operatorName}</span>
                    <span className="text-slate-500 text-[11px]">{ach.description}</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">{formatDate(ach.unlockedAt)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
